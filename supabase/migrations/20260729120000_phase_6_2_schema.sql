-- ===========================================================================
-- PHASE 6.2 — TRANSITION ENGINE: Schema Corrections & New Objects
-- Migration: 20260729120000_phase_6_2_schema.sql
-- Design Ref: PHASE_6_2_TRANSITION_ENGINE_DESIGN.md v2.3.1 (frozen)
-- ===========================================================================
-- Covers: FASE A (ALTERs attempts), FASE B (attempt_id in incidents),
--         FASE C (partial indexes), FASE D (legacy index removal),
--         FASE E (new table + indexes + RLS)
-- ===========================================================================

BEGIN;

-- ===========================================================================
-- PREFLIGHT
-- ===========================================================================
DO $$
DECLARE v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM public.reservation_statuses WHERE is_active = true;
    IF v_count < 12 THEN RAISE WARNING 'Expected >=12 active statuses, found %', v_count; END IF;
    SELECT COUNT(*) INTO v_count FROM public.inout_flow_rules WHERE is_active = true;
    IF v_count = 0 THEN RAISE WARNING 'No active inout_flow_rules. RPC will evaluate nothing.'; END IF;
END $$;

-- ===========================================================================
-- FASE A — CORRECTIONS TO inout_state_transition_attempts
-- ===========================================================================

-- A1. Drop constraint that blocks SAME_STATUS
ALTER TABLE public.inout_state_transition_attempts
DROP CONSTRAINT IF EXISTS ck_attempts_different_status;

-- A2. Allow previous_status_id to be NULL (first transition: NULL→PENDING)
ALTER TABLE public.inout_state_transition_attempts
ALTER COLUMN previous_status_id DROP NOT NULL;

-- A3. Expand result CHECK to include 'no_op' and 'override'
ALTER TABLE public.inout_state_transition_attempts
DROP CONSTRAINT IF EXISTS ck_attempts_result;

ALTER TABLE public.inout_state_transition_attempts
ADD CONSTRAINT ck_attempts_result CHECK (
    result = ANY (ARRAY[
        'allowed','blocked','warning_pending','allowed_after_warning',
        'allowed_by_override','failed_validation','no_change',
        'no_op','override'
    ])
);

-- A4. Drop overly-restrictive source CHECK (RPC callers pass arbitrary source strings)
ALTER TABLE public.inout_state_transition_attempts
DROP CONSTRAINT IF EXISTS ck_attempts_source;

-- A5. Add idempotency_key UUID column
ALTER TABLE public.inout_state_transition_attempts
ADD COLUMN IF NOT EXISTS idempotency_key UUID;

-- A6. Backfill existing rows
UPDATE public.inout_state_transition_attempts
SET idempotency_key = gen_random_uuid()
WHERE idempotency_key IS NULL;

-- A7. Set NOT NULL after backfill
ALTER TABLE public.inout_state_transition_attempts
ALTER COLUMN idempotency_key SET NOT NULL;

-- A8. Unique index for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS uq_attempts_idempotency
ON public.inout_state_transition_attempts (org_id, idempotency_key);

-- ===========================================================================
-- FASE B — NEW COLUMNS IN inout_flow_incidents
-- ===========================================================================

-- B1. Add attempt_id (nullable — Etapa 1 of 5-stage strategy)
ALTER TABLE public.inout_flow_incidents
ADD COLUMN IF NOT EXISTS attempt_id UUID;

-- B2. FK with ON DELETE RESTRICT (evidence must be preserved)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_incidents_attempt'
          AND conrelid = 'public.inout_flow_incidents'::regclass
    ) THEN
        ALTER TABLE public.inout_flow_incidents
        ADD CONSTRAINT fk_incidents_attempt
            FOREIGN KEY (attempt_id)
            REFERENCES public.inout_state_transition_attempts(id)
            ON DELETE RESTRICT;
    END IF;
END $$;

-- ===========================================================================
-- FASE C — PARTIAL INDEXES FOR INCIDENT DEDUPLICATION
-- ===========================================================================

-- C1. Rule-based incidents: dedup by (attempt_id, rule_id, incident_type)
CREATE UNIQUE INDEX IF NOT EXISTS uq_incidents_attempt_rule_type
ON public.inout_flow_incidents (attempt_id, rule_id, incident_type)
WHERE rule_id IS NOT NULL AND attempt_id IS NOT NULL;

-- C2. Administrative incidents (no rule): dedup by (attempt_id, incident_type)
CREATE UNIQUE INDEX IF NOT EXISTS uq_incidents_attempt_admin_type
ON public.inout_flow_incidents (attempt_id, incident_type)
WHERE rule_id IS NULL AND attempt_id IS NOT NULL;

-- ===========================================================================
-- FASE D — RETIRE LEGACY INDEX
-- ===========================================================================
-- uq_incidents_idempotency UNIQUE (org_id, idempotency_key) blocks multiple
-- incidents per operation. Idempotency now lives in attempts.
-- The idempotency_key TEXT column is preserved as auxiliary traceability.
-- ===========================================================================
DROP INDEX IF EXISTS public.uq_incidents_idempotency;

-- ===========================================================================
-- FASE E — CREATE TABLE inout_transition_attempt_rules
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
            'applied','blocked','warned','observed',
            'excluded','not_matched','error'
        )),
    severity         TEXT
        CHECK (severity IS NULL OR severity IN ('baja','media','alta','critica')),
    enforcement_mode TEXT
        CHECK (enforcement_mode IS NULL OR enforcement_mode IN ('block','warn','observe')),
    blocked          BOOLEAN NOT NULL DEFAULT false,
    incident_created BOOLEAN NOT NULL DEFAULT false,
    incident_id      UUID
        REFERENCES public.inout_flow_incidents(id) ON DELETE SET NULL,
    message          TEXT,
    evidence_json    JSONB NOT NULL DEFAULT ''::jsonb,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- E1. Indexes
CREATE INDEX IF NOT EXISTS idx_attempt_rules_org
ON public.inout_transition_attempt_rules (org_id, created_at);

CREATE INDEX IF NOT EXISTS idx_attempt_rules_attempt
ON public.inout_transition_attempt_rules (attempt_id);

CREATE INDEX IF NOT EXISTS idx_attempt_rules_rule
ON public.inout_transition_attempt_rules (rule_id);

CREATE INDEX IF NOT EXISTS idx_attempt_rules_incident
ON public.inout_transition_attempt_rules (incident_id)
WHERE incident_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_attempt_rules_unique
ON public.inout_transition_attempt_rules (attempt_id, rule_id);

-- E2. RLS
ALTER TABLE public.inout_transition_attempt_rules ENABLE ROW LEVEL SECURITY;

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
-- POSTFLIGHT
-- ===========================================================================
DO $$
DECLARE v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM information_schema.columns
    WHERE table_name = 'inout_state_transition_attempts' AND column_name = 'idempotency_key' AND is_nullable = 'NO';
    IF v_count = 0 THEN RAISE WARNING 'idempotency_key NOT NULL check failed'; END IF;

    SELECT COUNT(*) INTO v_count FROM pg_indexes
    WHERE tablename = 'inout_flow_incidents' AND indexname IN ('uq_incidents_attempt_rule_type','uq_incidents_attempt_admin_type');
    IF v_count < 2 THEN RAISE WARNING 'Expected 2 partial indexes, found %', v_count; END IF;

    SELECT COUNT(*) INTO v_count FROM pg_indexes
    WHERE tablename = 'inout_flow_incidents' AND indexname = 'uq_incidents_idempotency';
    IF v_count > 0 THEN RAISE WARNING 'Legacy index still present'; END IF;

    SELECT COUNT(*) INTO v_count FROM information_schema.tables WHERE table_name = 'inout_transition_attempt_rules';
    IF v_count = 0 THEN RAISE WARNING 'New table not found'; END IF;
END $$;

COMMIT;