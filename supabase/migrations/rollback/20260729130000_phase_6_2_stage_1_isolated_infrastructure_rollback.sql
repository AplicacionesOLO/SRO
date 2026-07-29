-- ===========================================================================
-- PHASE 6.2 — STAGE 1 ROLLBACK
-- rollback: 20260729130000_phase_6_2_stage_1_isolated_infrastructure_rollback
-- ===========================================================================
-- OBJECTIVE:
--   Safely remove all Stage 1 objects.
--   Preserve evidence. Abort if data exists in the new table.
--   No CASCADE. No deletion of non-Stage-1 objects.
--
-- REMOVES:
--   1. Helpers: _inout_build_transition_fingerprint, _inout_get_attempt_replay
--   2. Permission assignment from ADMIN and Full Access
--   3. Permission: casetilla.flow_report.transitions.execute (only if unused)
--   4. RLS policy on inout_transition_attempt_rules
--   5. Table: inout_transition_attempt_rules (only if empty)
--
-- PRESERVES:
--   - All existing tables, columns, indexes, constraints
--   - All existing permissions and role assignments
--   - All existing data
-- ===========================================================================

BEGIN;

-- ===========================================================================
-- STEP 0: CHECK FOR DATA IN NEW TABLE
-- ===========================================================================
DO $$
DECLARE
    v_rule_count INTEGER;
BEGIN
    SELECT count(*) INTO v_rule_count
    FROM public.inout_transition_attempt_rules;

    IF v_rule_count > 0 THEN
        RAISE EXCEPTION 'ROLLBACK ABORTED: inout_transition_attempt_rules contains % rows of evidence. Cannot automatically delete production data. Manual review required.', v_rule_count;
    END IF;

    RAISE NOTICE 'ROLLBACK Stage 1: table is empty (0 rows). Safe to proceed.';
END $$;

-- ===========================================================================
-- STEP 1: DROP HELPERS
-- ===========================================================================
DROP FUNCTION IF EXISTS public._inout_build_transition_fingerprint(UUID, UUID, TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS public._inout_get_attempt_replay(UUID, UUID);

-- ===========================================================================
-- STEP 2: REMOVE PERMISSION ASSIGNMENTS
-- ===========================================================================
DELETE FROM public.role_permissions
WHERE permission_id = (
    SELECT id FROM public.permissions
    WHERE name = 'casetilla.flow_report.transitions.execute'
);

-- ===========================================================================
-- STEP 3: REMOVE PERMISSION
-- ===========================================================================
DO $$
DECLARE
    v_perm_id UUID;
    v_assign_count INTEGER;
BEGIN
    SELECT id INTO v_perm_id
    FROM public.permissions
    WHERE name = 'casetilla.flow_report.transitions.execute';

    IF v_perm_id IS NULL THEN
        RAISE NOTICE 'ROLLBACK Stage 1: permission transitions.execute not found (already removed).';
        RETURN;
    END IF;

    -- Double-check no assignments remain
    SELECT count(*) INTO v_assign_count
    FROM public.role_permissions
    WHERE permission_id = v_perm_id;

    IF v_assign_count > 0 THEN
        RAISE EXCEPTION 'ROLLBACK ABORTED: permission transitions.execute still has % role assignments. Clean up manually.', v_assign_count;
    END IF;

    DELETE FROM public.permissions WHERE id = v_perm_id;
    RAISE NOTICE 'ROLLBACK Stage 1: permission transitions.execute removed.';
END $$;

-- ===========================================================================
-- STEP 4: DROP RLS POLICY
-- ===========================================================================
DROP POLICY IF EXISTS "Attempt rules - SELECT with audit.view"
    ON public.inout_transition_attempt_rules;

-- ===========================================================================
-- STEP 5: DROP TABLE (already verified empty in Step 0)
-- ===========================================================================
DROP TABLE IF EXISTS public.inout_transition_attempt_rules;

-- ===========================================================================
-- STEP 6: VERIFY CLEANUP
-- ===========================================================================
DO $$
DECLARE
    v_table_exists BOOLEAN;
    v_perm_exists  BOOLEAN;
    v_func_count   INTEGER;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'inout_transition_attempt_rules'
    ) INTO v_table_exists;

    SELECT EXISTS (
        SELECT 1 FROM public.permissions
        WHERE name = 'casetilla.flow_report.transitions.execute'
    ) INTO v_perm_exists;

    SELECT count(*) INTO v_func_count
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN ('_inout_build_transition_fingerprint', '_inout_get_attempt_replay');

    RAISE NOTICE 'ROLLBACK Stage 1 VERIFICATION: table_gone=%, perm_gone=%, helpers_remaining=%',
        (NOT v_table_exists), (NOT v_perm_exists), v_func_count;

    IF v_table_exists THEN
        RAISE EXCEPTION 'ROLLBACK Stage 1 FAILED: table still exists';
    END IF;
    IF v_func_count > 0 THEN
        RAISE EXCEPTION 'ROLLBACK Stage 1 FAILED: % helper(s) still exist', v_func_count;
    END IF;
END $$;

COMMIT;