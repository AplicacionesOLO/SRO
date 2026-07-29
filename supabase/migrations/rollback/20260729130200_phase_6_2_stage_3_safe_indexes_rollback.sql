-- ===========================================================================
-- PHASE 6.2 — STAGE 3 ROLLBACK
-- rollback: 20260729130200_phase_6_2_stage_3_safe_indexes_rollback
-- ===========================================================================
-- OBJECTIVE:
--   Remove only the 3 new indexes created in Stage 3.
--   Zero impact on legacy indexes. Zero impact on data.
--
-- REMOVES:
--   1. uq_attempts_idempotency
--   2. uq_incidents_attempt_rule_type
--   3. uq_incidents_attempt_admin_type
--
-- PRESERVES:
--   - Legacy index uq_incidents_idempotency (never touched)
--   - All data
--   - All constraints
-- ===========================================================================

BEGIN;

-- ===========================================================================
-- STEP 0: PREFLIGHT — Verify legacy index still exists
-- ===========================================================================
DO $$
DECLARE
    v_legacy_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'uq_incidents_idempotency'
          AND tablename = 'inout_flow_incidents'
    ) INTO v_legacy_exists;

    IF NOT v_legacy_exists THEN
        RAISE EXCEPTION 'ROLLBACK Stage 3 ABORTED: legacy index uq_incidents_idempotency is missing. Was it removed by something else? Cannot safely roll back.';
    END IF;

    RAISE NOTICE 'ROLLBACK Stage 3: legacy index confirmed present. Safe to proceed.';
END $$;

-- ===========================================================================
-- STEP 1: DROP NEW INDEXES
-- ===========================================================================
DROP INDEX IF EXISTS public.uq_attempts_idempotency;

DROP INDEX IF EXISTS public.uq_incidents_attempt_rule_type;

DROP INDEX IF EXISTS public.uq_incidents_attempt_admin_type;

-- ===========================================================================
-- STEP 2: VERIFY CLEANUP
-- ===========================================================================
DO $$
DECLARE
    v_idx_idem   BOOLEAN;
    v_idx_rule   BOOLEAN;
    v_idx_admin  BOOLEAN;
    v_legacy     BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'uq_attempts_idempotency'
    ) INTO v_idx_idem;

    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'uq_incidents_attempt_rule_type'
    ) INTO v_idx_rule;

    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'uq_incidents_attempt_admin_type'
    ) INTO v_idx_admin;

    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'uq_incidents_idempotency'
    ) INTO v_legacy;

    RAISE NOTICE 'ROLLBACK Stage 3 VERIFICATION: idem_gone=%, rule_gone=%, admin_gone=%, legacy_preserved=%',
        (NOT v_idx_idem), (NOT v_idx_rule), (NOT v_idx_admin), v_legacy;

    IF v_idx_idem THEN
        RAISE EXCEPTION 'ROLLBACK Stage 3 FAILED: uq_attempts_idempotency still exists';
    END IF;
    IF v_idx_rule THEN
        RAISE EXCEPTION 'ROLLBACK Stage 3 FAILED: uq_incidents_attempt_rule_type still exists';
    END IF;
    IF v_idx_admin THEN
        RAISE EXCEPTION 'ROLLBACK Stage 3 FAILED: uq_incidents_attempt_admin_type still exists';
    END IF;
    IF NOT v_legacy THEN
        RAISE EXCEPTION 'ROLLBACK Stage 3 FAILED: legacy index uq_incidents_idempotency was lost';
    END IF;
END $$;

COMMIT;