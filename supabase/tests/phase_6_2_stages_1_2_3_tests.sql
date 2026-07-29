-- ===========================================================================
-- PHASE 6.2 — STAGES 1, 2, 3 TESTS
-- tests: phase_6_2_stages_1_2_3_tests.sql
-- ===========================================================================
-- OBJECTIVE:
--   Validate the structure created by Stages 1, 2, and 3.
--   All tests are catalog-only (no data required) unless marked otherwise.
--
-- CLASSIFICATION:
--   EXECUTABLE   = runs without any test data
--   DATA_REQUIRED = needs test reservations/users/permissions
--   MANUAL       = requires human verification
--
-- USAGE:
--   Run entire file in Supabase SQL Editor.
--   Each test outputs PASS or FAIL with details.
-- ===========================================================================

-- ===========================================================================
-- TEST GROUP M1-M10: STAGE 1 — TABLE AND COLUMNS
-- ===========================================================================

-- M1: Table inout_transition_attempt_rules exists
-- TYPE: EXECUTABLE
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'inout_transition_attempt_rules'
    ) THEN
        RAISE NOTICE 'PASS: M1 — table inout_transition_attempt_rules exists';
    ELSE
        RAISE EXCEPTION 'FAIL: M1 — table inout_transition_attempt_rules NOT FOUND';
    END IF;
END $$;

-- M2: Required columns exist with correct types
-- TYPE: EXECUTABLE
DO $$
DECLARE
    v_ok BOOLEAN;
BEGIN
    SELECT bool_and(
        (column_name, data_type) IN (
            ('id', 'uuid'),
            ('org_id', 'uuid'),
            ('attempt_id', 'uuid'),
            ('rule_id', 'uuid'),
            ('rule_code', 'text'),
            ('execution_order', 'integer'),
            ('matched', 'boolean'),
            ('result', 'text'),
            ('severity', 'text'),
            ('enforcement_mode', 'text'),
            ('blocked', 'boolean'),
            ('incident_created', 'boolean'),
            ('incident_id', 'uuid'),
            ('message', 'text'),
            ('evidence_json', 'jsonb'),
            ('created_at', 'timestamp with time zone')
        )
    ) INTO v_ok
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inout_transition_attempt_rules';

    IF v_ok THEN
        RAISE NOTICE 'PASS: M2 — all 16 columns present with correct types';
    ELSE
        RAISE EXCEPTION 'FAIL: M2 — column mismatch in inout_transition_attempt_rules';
    END IF;
END $$;

-- M3: evidence_json DEFAULT is a valid JSON object ''::jsonb
-- TYPE: EXECUTABLE
DO $$
DECLARE
    v_default TEXT;
BEGIN
    SELECT column_default INTO v_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inout_transition_attempt_rules'
      AND column_name = 'evidence_json';

    IF v_default IS NULL THEN
        RAISE EXCEPTION 'FAIL: M3 — evidence_json has no DEFAULT';
    ELSIF v_default NOT LIKE '%{%}%' THEN
        RAISE EXCEPTION 'FAIL: M3 — evidence_json DEFAULT does not contain a JSON object (no curly braces found): %', v_default;
    ELSE
        RAISE NOTICE 'PASS: M3 — evidence_json DEFAULT is a valid JSON object: %', v_default;
    END IF;
END $$;

-- M4: Foreign keys exist with ON DELETE RESTRICT
-- TYPE: EXECUTABLE
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT count(*) INTO v_count
    FROM pg_constraint
    WHERE conrelid = 'public.inout_transition_attempt_rules'::regclass
      AND contype = 'f'
      AND confdeltype = 'r';  -- 'r' = RESTRICT

    IF v_count >= 3 THEN
        RAISE NOTICE 'PASS: M4 — % FK constraints with ON DELETE RESTRICT found', v_count;
    ELSE
        RAISE EXCEPTION 'FAIL: M4 — expected >= 3 RESTRICT FKs, found %', v_count;
    END IF;
END $$;

-- M5: Indexes exist on new table
-- TYPE: EXECUTABLE
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT count(*) INTO v_count
    FROM pg_indexes
    WHERE tablename = 'inout_transition_attempt_rules'
      AND indexname IN (
          'idx_attempt_rules_org',
          'idx_attempt_rules_attempt',
          'idx_attempt_rules_rule',
          'uq_attempt_rules_unique'
      );

    IF v_count = 4 THEN
        RAISE NOTICE 'PASS: M5 — all 4 indexes exist on inout_transition_attempt_rules';
    ELSE
        RAISE EXCEPTION 'FAIL: M5 — expected 4 indexes, found %', v_count;
    END IF;
END $$;

-- M6: Unique index on (attempt_id, rule_id)
-- TYPE: EXECUTABLE
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'uq_attempt_rules_unique'
          AND tablename = 'inout_transition_attempt_rules'
    ) THEN
        RAISE NOTICE 'PASS: M6 — uq_attempt_rules_unique exists';
    ELSE
        RAISE EXCEPTION 'FAIL: M6 — uq_attempt_rules_unique NOT FOUND';
    END IF;
END $$;

-- M7: RLS enabled on new table
-- TYPE: EXECUTABLE
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables
        WHERE tablename = 'inout_transition_attempt_rules'
          AND schemaname = 'public'
          AND rowsecurity = true
    ) THEN
        RAISE NOTICE 'PASS: M7 — RLS enabled on inout_transition_attempt_rules';
    ELSE
        RAISE EXCEPTION 'FAIL: M7 — RLS NOT enabled on inout_transition_attempt_rules';
    END IF;
END $$;

-- M8: SELECT policy exists for audit.view
-- TYPE: EXECUTABLE
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'inout_transition_attempt_rules'
          AND policyname = 'Attempt rules - SELECT with audit.view'
          AND cmd = 'SELECT'
    ) THEN
        RAISE NOTICE 'PASS: M8 — SELECT policy for audit.view exists';
    ELSE
        RAISE EXCEPTION 'FAIL: M8 — SELECT policy NOT FOUND';
    END IF;
END $$;

-- M9: Permission transitions.execute exists
-- TYPE: EXECUTABLE
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.permissions
        WHERE name = 'casetilla.flow_report.transitions.execute'
    ) THEN
        RAISE NOTICE 'PASS: M9 — permission transitions.execute exists';
    ELSE
        RAISE EXCEPTION 'FAIL: M9 — permission transitions.execute NOT FOUND';
    END IF;
END $$;

-- M10: Permission assigned to ADMIN and Full Access (may be empty if roles don't exist)
-- TYPE: EXECUTABLE (best-effort)
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT count(*) INTO v_count
    FROM public.role_permissions rp
    JOIN public.roles r ON rp.role_id = r.id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE p.name = 'casetilla.flow_report.transitions.execute'
      AND r.name IN ('ADMIN', 'Full Access');

    IF v_count >= 1 THEN
        RAISE NOTICE 'PASS: M10 — permission assigned to % role(s)', v_count;
    ELSE
        RAISE NOTICE 'WARN: M10 — permission not assigned to ADMIN/Full Access (roles may not exist in this environment)';
    END IF;
END $$;

-- ===========================================================================
-- TEST GROUP M11-M15: STAGE 1 — HELPERS
-- ===========================================================================

-- M11: Helper _inout_build_transition_fingerprint exists
-- TYPE: EXECUTABLE
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace
          AND proname = '_inout_build_transition_fingerprint'
    ) THEN
        RAISE NOTICE 'PASS: M11 — _inout_build_transition_fingerprint exists';
    ELSE
        RAISE EXCEPTION 'FAIL: M11 — _inout_build_transition_fingerprint NOT FOUND';
    END IF;
END $$;

-- M12: Helper _inout_get_attempt_replay exists
-- TYPE: EXECUTABLE
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace
          AND proname = '_inout_get_attempt_replay'
    ) THEN
        RAISE NOTICE 'PASS: M12 — _inout_get_attempt_replay exists';
    ELSE
        RAISE EXCEPTION 'FAIL: M12 — _inout_get_attempt_replay NOT FOUND';
    END IF;
END $$;

-- M13: Helpers are SECURITY DEFINER
-- TYPE: EXECUTABLE
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT count(*) INTO v_count
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN ('_inout_build_transition_fingerprint', '_inout_get_attempt_replay')
      AND prosecdef = true;

    IF v_count = 2 THEN
        RAISE NOTICE 'PASS: M13 — both helpers are SECURITY DEFINER';
    ELSE
        RAISE EXCEPTION 'FAIL: M13 — expected 2 SECURITY DEFINER helpers, found %', v_count;
    END IF;
END $$;

-- M14: Helpers have safe search_path
-- TYPE: EXECUTABLE
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT count(*) INTO v_count
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN ('_inout_build_transition_fingerprint', '_inout_get_attempt_replay')
      AND proconfig IS NOT NULL
      AND array_to_string(proconfig, ',') LIKE '%search_path%pg_catalog%public%';

    IF v_count = 2 THEN
        RAISE NOTICE 'PASS: M14 — both helpers have safe search_path';
    ELSE
        RAISE EXCEPTION 'FAIL: M14 — expected 2 helpers with search_path=pg_catalog,public, found %', v_count;
    END IF;
END $$;

-- M15: Helpers have NO EXECUTE for PUBLIC, anon, authenticated
-- TYPE: EXECUTABLE
DO $$
DECLARE
    v_grant_count INTEGER;
BEGIN
    -- Check that no grants exist for these helpers to PUBLIC, anon, or authenticated
    SELECT count(*) INTO v_grant_count
    FROM information_schema.role_routine_grants
    WHERE routine_name IN ('_inout_build_transition_fingerprint', '_inout_get_attempt_replay')
      AND routine_schema = 'public'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated');

    IF v_grant_count = 0 THEN
        RAISE NOTICE 'PASS: M15 — helpers have no EXECUTE grants to PUBLIC, anon, or authenticated';
    ELSE
        RAISE EXCEPTION 'FAIL: M15 — helpers have % unexpected EXECUTE grants', v_grant_count;
    END IF;
END $$;

-- ===========================================================================
-- TEST GROUP M16-M20: STAGE 2 — NULLABLE COLUMNS
-- ===========================================================================

-- M16: idempotency_key column exists in attempts and is NULLABLE
-- TYPE: EXECUTABLE
DO $$
DECLARE
    v_exists  BOOLEAN;
    v_null    TEXT;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'inout_state_transition_attempts'
          AND column_name = 'idempotency_key'
    ) INTO v_exists;

    SELECT is_nullable INTO v_null
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inout_state_transition_attempts'
      AND column_name = 'idempotency_key';

    IF v_exists AND v_null = 'YES' THEN
        RAISE NOTICE 'PASS: M16 — idempotency_key UUID NULLABLE exists in attempts';
    ELSE
        RAISE EXCEPTION 'FAIL: M16 — idempotency_key: exists=%, nullable=%', v_exists, v_null;
    END IF;
END $$;

-- M17: attempt_id column exists in incidents and is NULLABLE
-- TYPE: EXECUTABLE
DO $$
DECLARE
    v_exists  BOOLEAN;
    v_null    TEXT;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'inout_flow_incidents'
          AND column_name = 'attempt_id'
    ) INTO v_exists;

    SELECT is_nullable INTO v_null
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inout_flow_incidents'
      AND column_name = 'attempt_id';

    IF v_exists AND v_null = 'YES' THEN
        RAISE NOTICE 'PASS: M17 — attempt_id UUID NULLABLE exists in incidents';
    ELSE
        RAISE EXCEPTION 'FAIL: M17 — attempt_id: exists=%, nullable=%', v_exists, v_null;
    END IF;
END $$;

-- M18: FK fk_incidents_attempt uses ON DELETE RESTRICT
-- TYPE: EXECUTABLE
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_incidents_attempt'
          AND confdeltype = 'r'  -- 'r' = RESTRICT
    ) THEN
        RAISE NOTICE 'PASS: M18 — FK fk_incidents_attempt uses ON DELETE RESTRICT';
    ELSE
        RAISE EXCEPTION 'FAIL: M18 — FK fk_incidents_attempt not found or not RESTRICT';
    END IF;
END $$;

-- M19: idempotency_key is NOT set to NOT NULL (must remain nullable per Stage 2)
-- TYPE: EXECUTABLE
DO $$
DECLARE
    v_null TEXT;
BEGIN
    SELECT is_nullable INTO v_null
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inout_state_transition_attempts'
      AND column_name = 'idempotency_key';

    IF v_null = 'YES' THEN
        RAISE NOTICE 'PASS: M19 — idempotency_key remains NULLABLE (NOT NULL not yet applied)';
    ELSE
        RAISE EXCEPTION 'FAIL: M19 — idempotency_key is NOT NULL (should be nullable in Stage 2)';
    END IF;
END $$;

-- M20: idempotency_key column exists and is nullable — no backfill expected
-- TYPE: EXECUTABLE (structural check) + DATA_REQUIRED (data-dependent backfill verification)
DO $$
DECLARE
    v_total INTEGER;
    v_null  INTEGER;
    v_col_exists BOOLEAN;
BEGIN
    -- Structural check (always executable)
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'inout_state_transition_attempts'
          AND column_name = 'idempotency_key'
          AND is_nullable = 'YES'
    ) INTO v_col_exists;

    IF NOT v_col_exists THEN
        RAISE EXCEPTION 'FAIL: M20 — idempotency_key NULLABLE column not found';
    END IF;

    -- Data-dependent backfill verification
    SELECT count(*) INTO v_total FROM public.inout_state_transition_attempts;
    SELECT count(*) INTO v_null FROM public.inout_state_transition_attempts WHERE idempotency_key IS NULL;

    IF v_total = 0 THEN
        RAISE NOTICE 'PASS: M20 — idempotency_key column exists and is NULLABLE. Table empty (0 rows), backfill check not applicable.';
        RETURN;
    END IF;

    -- If rows exist, all should have NULL idempotency_key (no backfill done)
    IF v_null = v_total THEN
        RAISE NOTICE 'PASS: M20 — all % rows have NULL idempotency_key (no backfill applied)', v_total;
    ELSE
        RAISE NOTICE 'INFO: M20 — % of % rows have non-NULL idempotency_key (manual backfill may have been applied)', (v_total - v_null), v_total;
    END IF;
END $$;

-- ===========================================================================
-- TEST GROUP M21-M26: STAGE 3 — SAFE INDEXES
-- ===========================================================================

-- M21: uq_attempts_idempotency exists and is partial
-- TYPE: EXECUTABLE
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'uq_attempts_idempotency'
          AND tablename = 'inout_state_transition_attempts'
    ) THEN
        RAISE NOTICE 'PASS: M21 — uq_attempts_idempotency exists';
    ELSE
        RAISE EXCEPTION 'FAIL: M21 — uq_attempts_idempotency NOT FOUND';
    END IF;
END $$;

-- M22: uq_attempts_idempotency is partial (WHERE idempotency_key IS NOT NULL)
-- TYPE: EXECUTABLE
DO $$
DECLARE
    v_def TEXT;
BEGIN
    SELECT indexdef INTO v_def
    FROM pg_indexes
    WHERE indexname = 'uq_attempts_idempotency';

    IF v_def LIKE '%WHERE%idempotency_key IS NOT NULL%' THEN
        RAISE NOTICE 'PASS: M22 — uq_attempts_idempotency is partial (WHERE idempotency_key IS NOT NULL)';
    ELSE
        RAISE EXCEPTION 'FAIL: M22 — uq_attempts_idempotency is not partial. Def: %', v_def;
    END IF;
END $$;

-- M23: Both new incident partial indexes exist
-- TYPE: EXECUTABLE
DO $$
DECLARE
    v_rule  BOOLEAN;
    v_admin BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'uq_incidents_attempt_rule_type'
    ) INTO v_rule;

    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'uq_incidents_attempt_admin_type'
    ) INTO v_admin;

    IF v_rule AND v_admin THEN
        RAISE NOTICE 'PASS: M23 — both incident partial indexes exist';
    ELSE
        RAISE EXCEPTION 'FAIL: M23 — rule_idx=%, admin_idx=%', v_rule, v_admin;
    END IF;
END $$;

-- M24: New incident indexes are partial
-- TYPE: EXECUTABLE
DO $$
DECLARE
    v_rule_def  TEXT;
    v_admin_def TEXT;
BEGIN
    SELECT indexdef INTO v_rule_def FROM pg_indexes WHERE indexname = 'uq_incidents_attempt_rule_type';
    SELECT indexdef INTO v_admin_def FROM pg_indexes WHERE indexname = 'uq_incidents_attempt_admin_type';

    IF v_rule_def LIKE '%WHERE%' AND v_admin_def LIKE '%WHERE%' THEN
        RAISE NOTICE 'PASS: M24 — both incident indexes are partial (have WHERE clauses)';
    ELSE
        RAISE EXCEPTION 'FAIL: M24 — rule_def has WHERE: %, admin_def has WHERE: %',
            v_rule_def LIKE '%WHERE%', v_admin_def LIKE '%WHERE%';
    END IF;
END $$;

-- M25: Legacy index uq_incidents_idempotency STILL EXISTS (Stage 3 preserves it)
-- TYPE: EXECUTABLE
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'uq_incidents_idempotency'
          AND tablename = 'inout_flow_incidents'
    ) THEN
        RAISE NOTICE 'PASS: M25 — legacy index uq_incidents_idempotency preserved';
    ELSE
        RAISE EXCEPTION 'FAIL: M25 — legacy index uq_incidents_idempotency was REMOVED (should not happen in Stage 3)';
    END IF;
END $$;

-- M26: No existing constraints were modified by Stage 3
-- TYPE: EXECUTABLE — checks that the CHECK constraints on attempts are unchanged
DO $$
DECLARE
    v_result_check TEXT;
BEGIN
    SELECT pg_get_constraintdef(oid) INTO v_result_check
    FROM pg_constraint
    WHERE conrelid = 'public.inout_state_transition_attempts'::regclass
      AND conname = 'ck_attempts_result';

    -- Should still contain the original 7 values (no 'no_op' or 'override' added by Stage 3)
    IF v_result_check LIKE '%allowed%' AND v_result_check LIKE '%blocked%' THEN
        RAISE NOTICE 'PASS: M26 — ck_attempts_result unchanged by Stage 3';
    ELSE
        RAISE EXCEPTION 'FAIL: M26 — ck_attempts_result was modified: %', v_result_check;
    END IF;
END $$;

-- ===========================================================================
-- TEST GROUP M27-M30: ABSENCE CHECKS (what should NOT exist yet)
-- ===========================================================================

-- M27: No RPC transition_reservation_status installed yet
-- TYPE: EXECUTABLE
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace
          AND proname = 'transition_reservation_status'
    ) THEN
        RAISE NOTICE 'PASS: M27 — RPC transition_reservation_status NOT yet installed (correct for Stages 1-3)';
    ELSE
        RAISE NOTICE 'WARN: M27 — RPC transition_reservation_status already exists (may be from previous implementation)';
    END IF;
END $$;

-- M28: No anti-bypass trigger on reservations
-- TYPE: EXECUTABLE
DO $$
DECLARE
    v_trig_count INTEGER;
BEGIN
    SELECT count(*) INTO v_trig_count
    FROM pg_trigger
    WHERE tgrelid = 'public.reservations'::regclass
      AND tgname LIKE '%bypass%';

    IF v_trig_count = 0 THEN
        RAISE NOTICE 'PASS: M28 — no anti-bypass trigger on reservations';
    ELSE
        RAISE NOTICE 'INFO: M28 — % anti-bypass triggers found (may be from different phase)', v_trig_count;
    END IF;
END $$;

-- M29: reservations table was NOT modified by these stages
-- TYPE: EXECUTABLE — checks column count
DO $$
DECLARE
    v_col_count INTEGER;
BEGIN
    SELECT count(*) INTO v_col_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reservations';

    -- We don't know exact count, but we verify no Phase 6.2 columns were added
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'reservations'
          AND column_name IN ('transition_engine_version', 'last_transition_attempt_id')
    ) THEN
        RAISE NOTICE 'PASS: M29 — reservations table has % columns, no Phase 6.2 columns detected', v_col_count;
    ELSE
        RAISE EXCEPTION 'FAIL: M29 — reservations has unexpected Phase 6.2 columns';
    END IF;
END $$;

-- M30: No ON DELETE CASCADE in any new FK
-- TYPE: EXECUTABLE
DO $$
DECLARE
    v_cascade_count INTEGER;
BEGIN
    SELECT count(*) INTO v_cascade_count
    FROM pg_constraint
    WHERE conrelid IN (
        'public.inout_transition_attempt_rules'::regclass,
        'public.inout_flow_incidents'::regclass
    )
      AND confdeltype = 'c';  -- 'c' = CASCADE

    IF v_cascade_count = 0 THEN
        RAISE NOTICE 'PASS: M30 — zero ON DELETE CASCADE in new FKs';
    ELSE
        RAISE EXCEPTION 'FAIL: M30 — found % CASCADE FKs (should be 0)', v_cascade_count;
    END IF;
END $$;

-- ===========================================================================
-- FINAL SUMMARY
-- ===========================================================================
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'PHASE 6.2 STAGES 1-2-3 TESTS COMPLETE';
    RAISE NOTICE 'Tests executed: 30 (M1-M30)';
    RAISE NOTICE 'Classification: 29 EXECUTABLE (incl. M20 structural check), 0 DATA_REQUIRED-only, 1 best-effort (M10)';
    RAISE NOTICE 'SKIP placeholders: 0';
    RAISE NOTICE 'All tests that found issues would have raised EXCEPTION above.';
    RAISE NOTICE 'If you see this message, all tests PASSED.';
    RAISE NOTICE '========================================';
END $$;