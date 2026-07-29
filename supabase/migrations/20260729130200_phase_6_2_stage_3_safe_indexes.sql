-- ===========================================================================
-- PHASE 6.2 — STAGE 3: SAFE INDEXES (ADDITIVE ONLY)
-- migration: 20260729130200_phase_6_2_stage_3_safe_indexes
-- ===========================================================================
-- OBJECTIVE:
--   Create new indexes that support the Transition Engine.
--   Zero removal of legacy indexes. Zero constraint modifications.
--   All indexes are partial (WHERE clause) to avoid impacting NULL rows.
--
-- INCLUDES:
--   1. uq_attempts_idempotency — partial UNIQUE for idempotency
--   2. uq_incidents_attempt_rule_type — partial UNIQUE for rule incidents
--   3. uq_incidents_attempt_admin_type — partial UNIQUE for admin incidents
--
-- EXCLUDES:
--   - No DROP INDEX of legacy indexes (uq_incidents_idempotency stays)
--   - No constraint changes
--   - No data modifications
--   - No NOT NULL conversions
-- ===========================================================================

BEGIN;

-- ===========================================================================
-- STEP 1: PREFLIGHT — Check for potential duplicates
-- ===========================================================================
DO $$
DECLARE
    v_dup_idem INTEGER;
    v_dup_rule INTEGER;
    v_dup_admin INTEGER;
BEGIN
    -- Check for duplicate (org_id, idempotency_key) where both are non-NULL
    SELECT count(*) INTO v_dup_idem FROM (
        SELECT org_id, idempotency_key, count(*) as cnt
        FROM public.inout_state_transition_attempts
        WHERE idempotency_key IS NOT NULL
        GROUP BY org_id, idempotency_key
        HAVING count(*) > 1
    ) sub;

    -- Check for duplicate (attempt_id, rule_id, incident_type) where all non-NULL
    SELECT count(*) INTO v_dup_rule FROM (
        SELECT attempt_id, rule_id, incident_type, count(*) as cnt
        FROM public.inout_flow_incidents
        WHERE attempt_id IS NOT NULL
          AND rule_id IS NOT NULL
        GROUP BY attempt_id, rule_id, incident_type
        HAVING count(*) > 1
    ) sub;

    -- Check for duplicate (attempt_id, incident_type) where rule_id IS NULL
    SELECT count(*) INTO v_dup_admin FROM (
        SELECT attempt_id, incident_type, count(*) as cnt
        FROM public.inout_flow_incidents
        WHERE attempt_id IS NOT NULL
          AND rule_id IS NULL
        GROUP BY attempt_id, incident_type
        HAVING count(*) > 1
    ) sub;

    RAISE NOTICE 'PREFLIGHT Stage 3: dup_idem=%, dup_rule=%, dup_admin=%',
        v_dup_idem, v_dup_rule, v_dup_admin;

    IF v_dup_idem > 0 THEN
        RAISE EXCEPTION 'Stage 3 ABORTED: Found % duplicate (org_id, idempotency_key) pairs in attempts. Run: SELECT org_id, idempotency_key, count(*) FROM public.inout_state_transition_attempts WHERE idempotency_key IS NOT NULL GROUP BY org_id, idempotency_key HAVING count(*) > 1;',
            v_dup_idem;
    END IF;
    IF v_dup_rule > 0 THEN
        RAISE EXCEPTION 'Stage 3 ABORTED: Found % duplicate (attempt_id, rule_id, incident_type) groups in incidents. Run: SELECT attempt_id, rule_id, incident_type, count(*) FROM public.inout_flow_incidents WHERE attempt_id IS NOT NULL AND rule_id IS NOT NULL GROUP BY attempt_id, rule_id, incident_type HAVING count(*) > 1;',
            v_dup_rule;
    END IF;
    IF v_dup_admin > 0 THEN
        RAISE EXCEPTION 'Stage 3 ABORTED: Found % duplicate (attempt_id, incident_type) admin groups in incidents. Run: SELECT attempt_id, incident_type, count(*) FROM public.inout_flow_incidents WHERE attempt_id IS NOT NULL AND rule_id IS NULL GROUP BY attempt_id, incident_type HAVING count(*) > 1;',
            v_dup_admin;
    END IF;

    RAISE NOTICE 'Stage 3 PREFLIGHT PASSED: No duplicates detected.';
END $$;

-- ===========================================================================
-- STEP 2: INDEX — uq_attempts_idempotency (partial)
-- ===========================================================================
-- NOTE: This is a partial UNIQUE index. It only enforces uniqueness when
-- idempotency_key IS NOT NULL. Existing rows (NULL) are excluded.
-- Tables have 0 rows at time of writing — no CONCURRENTLY needed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_attempts_idempotency
ON public.inout_state_transition_attempts (org_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

COMMENT ON INDEX public.uq_attempts_idempotency
    IS 'Índice único parcial de idempotencia para transition engine. Solo aplica cuando idempotency_key IS NOT NULL. Fase 6.2 Stage 3.';

-- ===========================================================================
-- STEP 3: INDEX — uq_incidents_attempt_rule_type (partial)
-- ===========================================================================
-- Prevents duplicate incidents for the same (attempt, rule, type).
-- Only applies when BOTH attempt_id AND rule_id are NOT NULL.
-- Tables have 0 rows — no CONCURRENTLY needed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_incidents_attempt_rule_type
ON public.inout_flow_incidents (attempt_id, rule_id, incident_type)
WHERE attempt_id IS NOT NULL
  AND rule_id IS NOT NULL;

COMMENT ON INDEX public.uq_incidents_attempt_rule_type
    IS 'Índice único parcial para deduplicación de incidentes por regla. WHERE attempt_id IS NOT NULL AND rule_id IS NOT NULL. Fase 6.2 Stage 3.';

-- ===========================================================================
-- STEP 4: INDEX — uq_incidents_attempt_admin_type (partial)
-- ===========================================================================
-- Prevents duplicate administrative incidents (no rule) for the same attempt.
-- Only applies when attempt_id IS NOT NULL AND rule_id IS NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_incidents_attempt_admin_type
ON public.inout_flow_incidents (attempt_id, incident_type)
WHERE attempt_id IS NOT NULL
  AND rule_id IS NULL;

COMMENT ON INDEX public.uq_incidents_attempt_admin_type
    IS 'Índice único parcial para deduplicación de incidentes administrativos (sin regla). WHERE attempt_id IS NOT NULL AND rule_id IS NULL. Fase 6.2 Stage 3.';

-- ===========================================================================
-- STEP 5: POSTFLIGHT VALIDATION
-- ===========================================================================
DO $$
DECLARE
    v_idx_idem     BOOLEAN;
    v_idx_rule     BOOLEAN;
    v_idx_admin    BOOLEAN;
    v_legacy_exists BOOLEAN;
BEGIN
    -- Check new indexes exist
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'uq_attempts_idempotency'
          AND tablename = 'inout_state_transition_attempts'
    ) INTO v_idx_idem;

    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'uq_incidents_attempt_rule_type'
          AND tablename = 'inout_flow_incidents'
    ) INTO v_idx_rule;

    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'uq_incidents_attempt_admin_type'
          AND tablename = 'inout_flow_incidents'
    ) INTO v_idx_admin;

    -- Verify legacy index was NOT touched
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'uq_incidents_idempotency'
          AND tablename = 'inout_flow_incidents'
    ) INTO v_legacy_exists;

    RAISE NOTICE 'POSTFLIGHT Stage 3: idem_idx=%, rule_idx=%, admin_idx=%, legacy_still_exists=%',
        v_idx_idem, v_idx_rule, v_idx_admin, v_legacy_exists;

    IF NOT v_idx_idem THEN
        RAISE EXCEPTION 'Stage 3 FAILED: uq_attempts_idempotency not found';
    END IF;
    IF NOT v_idx_rule THEN
        RAISE EXCEPTION 'Stage 3 FAILED: uq_incidents_attempt_rule_type not found';
    END IF;
    IF NOT v_idx_admin THEN
        RAISE EXCEPTION 'Stage 3 FAILED: uq_incidents_attempt_admin_type not found';
    END IF;
    IF NOT v_legacy_exists THEN
        RAISE EXCEPTION 'Stage 3 FAILED: legacy index uq_incidents_idempotency was removed (SHOULD NOT HAPPEN)';
    END IF;

    RAISE NOTICE 'Stage 3 COMPLETE: All 3 new indexes created. Legacy index preserved.';
END $$;

COMMIT;