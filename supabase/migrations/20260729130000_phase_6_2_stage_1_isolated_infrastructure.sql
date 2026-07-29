-- ===========================================================================
-- PHASE 6.2 — STAGE 1: ISOLATED INFRASTRUCTURE
-- migration: 20260729130000_phase_6_2_stage_1_isolated_infrastructure
-- ===========================================================================
-- OBJECTIVE:
--   Create completely isolated infrastructure for the IN/OUT Transition Engine.
--   Zero impact on existing modules. Zero behavior changes.
--
-- INCLUDES:
--   1. New table: inout_transition_attempt_rules
--   2. Foreign keys with ON DELETE RESTRICT
--   3. Indexes on new table
--   4. RLS + read policy (audit.view)
--   5. New permission: casetilla.flow_report.transitions.execute
--   6. Assign permission to ADMIN + Full Access
--   7. Helper: _inout_build_transition_fingerprint
--   8. Helper: _inout_get_attempt_replay
--
-- EXCLUDES (left for later stages):
--   - No ALTERs on existing tables
--   - No new columns on attempts or incidents
--   - No index changes on existing tables
--   - No RPC
--   - No changes to reservations
-- ===========================================================================

BEGIN;

-- ===========================================================================
-- STEP 1: PREFLIGHT VALIDATION
-- ===========================================================================
DO $$
DECLARE
    v_org_count INTEGER;
    v_attempts_count INTEGER;
    v_rules_count INTEGER;
BEGIN
    SELECT count(*) INTO v_org_count FROM public.organizations;
    SELECT count(*) INTO v_attempts_count FROM public.inout_state_transition_attempts;
    SELECT count(*) INTO v_rules_count FROM public.inout_flow_rules;

    RAISE NOTICE 'PREFLIGHT Stage 1: orgs=%, attempts=%, rules=%',
        v_org_count, v_attempts_count, v_rules_count;
END $$;

-- ===========================================================================
-- STEP 2: CREATE NEW TABLE — inout_transition_attempt_rules
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.inout_transition_attempt_rules (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id           UUID NOT NULL,
    attempt_id       UUID NOT NULL
        REFERENCES public.inout_state_transition_attempts(id) ON DELETE RESTRICT,
    rule_id          UUID NOT NULL
        REFERENCES public.inout_flow_rules(id) ON DELETE RESTRICT,
    rule_code        TEXT NOT NULL,
    execution_order  INTEGER NOT NULL,
    matched          BOOLEAN NOT NULL DEFAULT true,
    result           TEXT NOT NULL
        CHECK (result IN (
            'applied', 'blocked', 'warned', 'observed',
            'excluded', 'not_matched', 'error'
        )),
    severity         TEXT
        CHECK (severity IS NULL OR severity IN ('baja', 'media', 'alta', 'critica')),
    enforcement_mode TEXT
        CHECK (enforcement_mode IS NULL OR enforcement_mode IN ('block', 'warn', 'observe')),
    blocked          BOOLEAN NOT NULL DEFAULT false,
    incident_created BOOLEAN NOT NULL DEFAULT false,
    incident_id      UUID
        REFERENCES public.inout_flow_incidents(id) ON DELETE SET NULL,
    message          TEXT,
    evidence_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.inout_transition_attempt_rules
    IS 'Registro normalizado de reglas evaluadas durante transiciones de estado. Una fila por regla evaluada, vinculada al attempt. Fase 6.2 Stage 1.';

-- ===========================================================================
-- STEP 3: FOREIGN KEY from org_id to organizations
-- ===========================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.inout_transition_attempt_rules'::regclass
          AND conname = 'fk_attempt_rules_org'
    ) THEN
        ALTER TABLE public.inout_transition_attempt_rules
        ADD CONSTRAINT fk_attempt_rules_org
            FOREIGN KEY (org_id) REFERENCES public.organizations(id)
            ON DELETE RESTRICT;
    END IF;
END $$;

-- ===========================================================================
-- STEP 4: INDEXES ON NEW TABLE
-- ===========================================================================
CREATE INDEX IF NOT EXISTS idx_attempt_rules_org
    ON public.inout_transition_attempt_rules (org_id);

CREATE INDEX IF NOT EXISTS idx_attempt_rules_attempt
    ON public.inout_transition_attempt_rules (attempt_id);

CREATE INDEX IF NOT EXISTS idx_attempt_rules_rule
    ON public.inout_transition_attempt_rules (rule_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_attempt_rules_unique
    ON public.inout_transition_attempt_rules (attempt_id, rule_id);

-- ===========================================================================
-- STEP 5: RLS ON NEW TABLE
-- ===========================================================================
ALTER TABLE public.inout_transition_attempt_rules ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running migration (idempotency)
DROP POLICY IF EXISTS "Attempt rules - SELECT with audit.view"
    ON public.inout_transition_attempt_rules;

CREATE POLICY "Attempt rules - SELECT with audit.view"
ON public.inout_transition_attempt_rules
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.inout_has_permission(
            auth.uid(), org_id, 'casetilla.flow_report.audit.view'
        )
    )
);

-- ===========================================================================
-- STEP 6: REVOKE WRITE PRIVILEGES FROM STANDARD ROLES
-- ===========================================================================
REVOKE ALL ON TABLE public.inout_transition_attempt_rules FROM PUBLIC;
REVOKE ALL ON TABLE public.inout_transition_attempt_rules FROM anon;

-- authenticated gets ONLY SELECT (via RLS policy above), no INSERT/UPDATE/DELETE
REVOKE INSERT, UPDATE, DELETE ON TABLE public.inout_transition_attempt_rules FROM authenticated;

-- ===========================================================================
-- STEP 7: CREATE PERMISSION — transitions.execute
-- ===========================================================================
INSERT INTO public.permissions (name, description, category)
VALUES (
    'casetilla.flow_report.transitions.execute',
    'Ejecutar transiciones de estado de reservas (cambiar status_id)',
    'casetilla'
)
ON CONFLICT (name) DO NOTHING;

-- ===========================================================================
-- STEP 8: ASSIGN PERMISSION TO ADMIN AND FULL ACCESS
-- ===========================================================================
WITH perm AS (
    SELECT id FROM public.permissions
    WHERE name = 'casetilla.flow_report.transitions.execute'
),
target_roles AS (
    SELECT id, name FROM public.roles
    WHERE name IN ('ADMIN', 'Full Access')
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT tr.id, perm.id
FROM target_roles tr, perm
WHERE NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_id = tr.id AND rp.permission_id = perm.id
);

-- ===========================================================================
-- STEP 9: HELPER — _inout_build_transition_fingerprint
-- ===========================================================================
CREATE OR REPLACE FUNCTION public._inout_build_transition_fingerprint(
    p_reservation_id    UUID,
    p_target_status_id  UUID,
    p_source            TEXT,
    p_actor             UUID,
    p_org_id            UUID
) RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = 'pg_catalog', 'public'
AS $$
    SELECT encode(
        digest(
            p_reservation_id::text || '|' ||
            p_target_status_id::text || '|' ||
            p_source || '|' ||
            p_actor::text || '|' ||
            p_org_id::text,
            'sha256'
        ),
        'hex'
    );
$$;

COMMENT ON FUNCTION public._inout_build_transition_fingerprint(UUID, UUID, TEXT, UUID, UUID)
    IS 'Construye el fingerprint SHA-256 de una operación de transición. Excluye reason y metadata. IMMUTABLE. Fase 6.2 Stage 1.';

-- ===========================================================================
-- STEP 10: HELPER — _inout_get_attempt_replay
-- NOTE: This function references idempotency_key column which will be
--       added in Stage 2. At CREATE time in Stage 1 the column does not
--       exist, but plpgsql resolves column references at execution time.
--       By the time this function is called (Stage 4+), Stage 2 will have
--       added the column. If called before Stage 2, it will error at runtime.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public._inout_get_attempt_replay(
    p_org_id            UUID,
    p_idempotency_key   UUID
) RETURNS TABLE(
    attempt_id          UUID,
    reservation_id      UUID,
    previous_status_id  UUID,
    requested_status_id UUID,
    applied_status_id   UUID,
    result              TEXT,
    metadata_json       JSONB,
    attempted_at        TIMESTAMPTZ,
    attempted_by        UUID,
    source              TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'pg_catalog', 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.id,
        a.reservation_id,
        a.previous_status_id,
        a.requested_status_id,
        a.applied_status_id,
        a.result,
        a.metadata_json,
        a.attempted_at,
        a.attempted_by,
        a.source
    FROM public.inout_state_transition_attempts a
    WHERE a.org_id = p_org_id
      AND a.idempotency_key = p_idempotency_key
    ORDER BY a.attempted_at DESC
    LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public._inout_get_attempt_replay(UUID, UUID)
    IS 'Recupera el attempt previo por org_id + idempotency_key para detección de replay. Requiere que Stage 2 haya agregado la columna idempotency_key. Fase 6.2 Stage 1.';

-- ===========================================================================
-- STEP 11: SECURITY ON HELPERS — REVOKE FROM PUBLIC, anon, authenticated
-- ===========================================================================
REVOKE ALL ON FUNCTION public._inout_build_transition_fingerprint(UUID, UUID, TEXT, UUID, UUID)
    FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public._inout_get_attempt_replay(UUID, UUID)
    FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- STEP 12: POSTFLIGHT VALIDATION
-- ===========================================================================
DO $$
DECLARE
    v_table_exists BOOLEAN;
    v_policy_count INTEGER;
    v_perm_exists  BOOLEAN;
    v_func_count   INTEGER;
    v_idx_count    INTEGER;
BEGIN
    -- Check table exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'inout_transition_attempt_rules'
    ) INTO v_table_exists;

    -- Check RLS policy
    SELECT count(*) INTO v_policy_count
    FROM pg_policies
    WHERE tablename = 'inout_transition_attempt_rules';

    -- Check permission
    SELECT EXISTS (
        SELECT 1 FROM public.permissions
        WHERE name = 'casetilla.flow_report.transitions.execute'
    ) INTO v_perm_exists;

    -- Check helpers
    SELECT count(*) INTO v_func_count
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN ('_inout_build_transition_fingerprint', '_inout_get_attempt_replay');

    -- Check indexes
    SELECT count(*) INTO v_idx_count
    FROM pg_indexes
    WHERE tablename = 'inout_transition_attempt_rules'
      AND indexname IN ('idx_attempt_rules_org', 'idx_attempt_rules_attempt',
                        'idx_attempt_rules_rule', 'uq_attempt_rules_unique');

    RAISE NOTICE 'POSTFLIGHT Stage 1: table=%, policies=%, permission=%, helpers=%, indexes=%',
        v_table_exists, v_policy_count, v_perm_exists, v_func_count, v_idx_count;

    IF NOT v_table_exists THEN
        RAISE EXCEPTION 'Stage 1 FAILED: table inout_transition_attempt_rules not found';
    END IF;
    IF v_policy_count < 1 THEN
        RAISE EXCEPTION 'Stage 1 FAILED: RLS policy not found';
    END IF;
    IF NOT v_perm_exists THEN
        RAISE EXCEPTION 'Stage 1 FAILED: permission transitions.execute not found';
    END IF;
    IF v_func_count < 2 THEN
        RAISE EXCEPTION 'Stage 1 FAILED: helpers not found (expected 2, got %)', v_func_count;
    END IF;
    IF v_idx_count < 4 THEN
        RAISE EXCEPTION 'Stage 1 FAILED: indexes not found (expected 4, got %)', v_idx_count;
    END IF;

    RAISE NOTICE 'Stage 1 COMPLETE: All validations passed.';
END $$;

COMMIT;