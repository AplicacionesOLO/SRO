-- ===========================================================================
-- PHASE 6.2 — STAGE 2 ROLLBACK
-- rollback: 20260729130100_phase_6_2_stage_2_nullable_columns_rollback
-- ===========================================================================
-- OBJECTIVE:
--   Safely remove Stage 2 column additions.
--   Conservative: abort if columns contain data.
--   No destruction of evidence.
--
-- REMOVES:
--   1. FK constraint fk_incidents_attempt
--   2. Column attempt_id from incidents (only if all NULL)
--   3. Column idempotency_key from attempts (only if all NULL)
--
-- PRESERVES:
--   - All data
--   - All existing constraints
-- ===========================================================================

BEGIN;

-- ===========================================================================
-- STEP 0: CHECK FOR DATA IN NEW COLUMNS
-- ===========================================================================
DO $$
DECLARE
    v_idem_non_null INTEGER;
    v_att_non_null  INTEGER;
BEGIN
    -- Check if any idempotency_key has a value
    SELECT count(*) INTO v_idem_non_null
    FROM public.inout_state_transition_attempts
    WHERE idempotency_key IS NOT NULL;

    -- Check if any attempt_id has a value
    SELECT count(*) INTO v_att_non_null
    FROM public.inout_flow_incidents
    WHERE attempt_id IS NOT NULL;

    RAISE NOTICE 'ROLLBACK Stage 2: idempotency_key non-null=%, attempt_id non-null=%',
        v_idem_non_null, v_att_non_null;

    IF v_idem_non_null > 0 THEN
        RAISE EXCEPTION 'ROLLBACK ABORTED: idempotency_key column has % non-null values. Cannot drop column with data. Manual review required.', v_idem_non_null;
    END IF;

    IF v_att_non_null > 0 THEN
        RAISE EXCEPTION 'ROLLBACK ABORTED: attempt_id column has % non-null values. Cannot drop column with data. Column will be preserved as legacy tracing field. Manual review required.', v_att_non_null;
    END IF;

    RAISE NOTICE 'ROLLBACK Stage 2: Both columns are all-NULL. Safe to proceed.';
END $$;

-- ===========================================================================
-- STEP 1: DROP FK CONSTRAINT
-- ===========================================================================
ALTER TABLE public.inout_flow_incidents
DROP CONSTRAINT IF EXISTS fk_incidents_attempt;

-- ===========================================================================
-- STEP 2: DROP COLUMNS (only if all-NULL confirmed in Step 0)
-- ===========================================================================
ALTER TABLE public.inout_flow_incidents
DROP COLUMN IF EXISTS attempt_id;

ALTER TABLE public.inout_state_transition_attempts
DROP COLUMN IF EXISTS idempotency_key;

-- ===========================================================================
-- STEP 3: VERIFY CLEANUP
-- ===========================================================================
DO $$
DECLARE
    v_idem_col  BOOLEAN;
    v_att_col   BOOLEAN;
    v_fk_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'inout_state_transition_attempts'
          AND column_name = 'idempotency_key'
    ) INTO v_idem_col;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'inout_flow_incidents'
          AND column_name = 'attempt_id'
    ) INTO v_att_col;

    SELECT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_incidents_attempt'
    ) INTO v_fk_exists;

    RAISE NOTICE 'ROLLBACK Stage 2 VERIFICATION: idem_gone=%, att_gone=%, fk_gone=%',
        (NOT v_idem_col), (NOT v_att_col), (NOT v_fk_exists);

    IF v_idem_col THEN
        RAISE EXCEPTION 'ROLLBACK Stage 2 FAILED: idempotency_key column still exists';
    END IF;
    IF v_att_col THEN
        RAISE EXCEPTION 'ROLLBACK Stage 2 FAILED: attempt_id column still exists';
    END IF;
    IF v_fk_exists THEN
        RAISE EXCEPTION 'ROLLBACK Stage 2 FAILED: FK fk_incidents_attempt still exists';
    END IF;
END $$;

COMMIT;