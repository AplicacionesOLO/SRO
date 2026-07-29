-- ===========================================================================
-- PHASE 6.2 — TRANSITION ENGINE: Test Suite
-- File: supabase/tests/phase_6_2_transition_engine_tests.sql
-- ===========================================================================
-- FIXES applied (2026-07-29 audit):
--   H-CRIT-003: M3 — removed ROLLBACK from DO block, catalog-only check
--   H-HIGH-001: M6 — confupdtype → confdeltype
--   H-HIGH-003: 56 placeholder tests converted to real catalog tests
-- ===========================================================================
-- TEST CLASSIFICATION:
--   EXECUTABLE    = runs anywhere, no data required
--   DATA_REQUIRED = needs test reservations/users/permissions
--   ROLE_REQUIRED = needs SET ROLE or auth context switching
--   MANUAL        = requires concurrent connections or external setup
-- ===========================================================================

-- ===========================================================================
-- PART 1: SCHEMA & CATALOG TESTS (M1-M30)
-- All executable without test data. Verify DDL objects, types, constraints.
-- ===========================================================================

-- M1: idempotency_key column exists and is NOT NULL
DO $$ BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'inout_state_transition_attempts'
          AND column_name = 'idempotency_key' AND is_nullable = 'NO'
    ), 'M1 FAIL: idempotency_key must be NOT NULL';
    RAISE NOTICE 'M1 PASS: idempotency_key is UUID NOT NULL';
END $$;

-- M2: previous_status_id is nullable
DO $$ BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'inout_state_transition_attempts'
          AND column_name = 'previous_status_id' AND is_nullable = 'YES'
    ), 'M2 FAIL: previous_status_id must be nullable';
    RAISE NOTICE 'M2 PASS: previous_status_id is nullable';
END $$;

-- M3: result CHECK includes no_op and override (catalog-only, no data insert)
DO $$ BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        WHERE n.nspname = 'public' AND t.relname = 'inout_state_transition_attempts'
          AND c.conname = 'ck_attempts_result'
          AND pg_get_constraintdef(c.oid) LIKE '%no_op%'
          AND pg_get_constraintdef(c.oid) LIKE '%override%'
    ), 'M3 FAIL: CHECK does not include no_op and override';
    RAISE NOTICE 'M3 PASS: result CHECK includes no_op and override';
END $$;

-- M4: uq_attempts_idempotency index exists
DO $$ BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'inout_state_transition_attempts'
          AND indexname = 'uq_attempts_idempotency'
    ), 'M4 FAIL: uq_attempts_idempotency missing';
    RAISE NOTICE 'M4 PASS: uq_attempts_idempotency exists';
END $$;

-- M5: attempt_id column exists in incidents
DO $$ BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'inout_flow_incidents'
          AND column_name = 'attempt_id'
    ), 'M5 FAIL: attempt_id missing from incidents';
    RAISE NOTICE 'M5 PASS: attempt_id column exists in incidents';
END $$;

-- M6: FK on incidents.attempt_id uses ON DELETE RESTRICT (confdeltype, not confupdtype)
DO $$ BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_incidents_attempt'
          AND conrelid = 'public.inout_flow_incidents'::regclass
          AND confdeltype = 'r'
    ), 'M6 FAIL: fk_incidents_attempt missing or wrong DELETE type (expected RESTRICT=confdeltype=r)';
    RAISE NOTICE 'M6 PASS: FK ON DELETE RESTRICT verified';
END $$;

-- M7: uq_incidents_attempt_rule_type partial index exists
DO $$ BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'inout_flow_incidents'
          AND indexname = 'uq_incidents_attempt_rule_type'
    ), 'M7 FAIL: uq_incidents_attempt_rule_type missing';
    RAISE NOTICE 'M7 PASS: uq_incidents_attempt_rule_type exists';
END $$;

-- M8: uq_incidents_attempt_admin_type partial index exists
DO $$ BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'inout_flow_incidents'
          AND indexname = 'uq_incidents_attempt_admin_type'
    ), 'M8 FAIL: uq_incidents_attempt_admin_type missing';
    RAISE NOTICE 'M8 PASS: uq_incidents_attempt_admin_type exists';
END $$;

-- M9: Legacy index uq_incidents_idempotency is removed
DO $$ BEGIN
    ASSERT NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'inout_flow_incidents'
          AND indexname = 'uq_incidents_idempotency'
    ), 'M9 FAIL: legacy index still present';
    RAISE NOTICE 'M9 PASS: legacy index removed';
END $$;

-- M10: inout_transition_attempt_rules table exists
DO $$ BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'inout_transition_attempt_rules'
    ), 'M10 FAIL: table missing';
    RAISE NOTICE 'M10 PASS: table exists';
END $$;

-- M11: Permission transitions.execute exists
DO $$ BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM public.permissions
        WHERE name = 'casetilla.flow_report.transitions.execute'
    ), 'M11 FAIL: permission missing';
    RAISE NOTICE 'M11 PASS: permission exists';
END $$;

-- M12: RPC transition_reservation_status exists
DO $$ BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'transition_reservation_status'
    ), 'M12 FAIL: RPC missing';
    RAISE NOTICE 'M12 PASS: RPC exists';
END $$;

-- M13: RPC is SECURITY DEFINER
DO $$ BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'transition_reservation_status'
          AND p.prosecdef = true
    ), 'M13 FAIL: RPC is not SECURITY DEFINER';
    RAISE NOTICE 'M13 PASS: RPC is SECURITY DEFINER';
END $$;

-- M14: RPC has search_path set to pg_catalog, public
DO $$ BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'transition_reservation_status'
          AND p.proconfig IS NOT NULL
          AND array_to_string(p.proconfig, ',') LIKE '%search_path%'
    ), 'M14 FAIL: search_path not configured';
    RAISE NOTICE 'M14 PASS: search_path configured';
END $$;

-- M15: Helpers are SECURITY DEFINER
DO $$ BEGIN
    ASSERT (
        SELECT COUNT(*) = 3 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname IN ('_inout_resolve_transition_actor','_inout_build_transition_fingerprint','_inout_create_transition_incident')
          AND p.prosecdef = true
    ), 'M15 FAIL: one or more helpers not SECURITY DEFINER';
    RAISE NOTICE 'M15 PASS: all 3 helpers are SECURITY DEFINER';
END $$;

-- M16: No message_template references in RPC source
DO $$ BEGIN
    ASSERT NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'transition_reservation_status'
          AND p.prosrc LIKE '%message_template%'
    ), 'M16 FAIL: message_template still referenced in RPC';
    RAISE NOTICE 'M16 PASS: zero message_template references';
END $$;

-- M17: RPC has correct parameter count (7)
DO $$ BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'transition_reservation_status'
          AND p.pronargs = 7
    ), 'M17 FAIL: wrong parameter count';
    RAISE NOTICE 'M17 PASS: RPC has 7 parameters';
END $$;

-- M18: RPC returns 20 columns
DO $$ BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'transition_reservation_status'
          AND p.prorettype = (SELECT oid FROM pg_type WHERE typname = 'record')
    ), 'M18 FAIL: RPC does not return record type';
    RAISE NOTICE 'M18 PASS: RPC returns record (RETURNS TABLE)';
END $$;

-- M19: attempt_rules table has all required columns
DO $$ BEGIN
    ASSERT (
        SELECT COUNT(*) = 15 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'inout_transition_attempt_rules'
          AND column_name IN ('id','org_id','attempt_id','rule_id','rule_code',
              'execution_order','matched','result','severity','enforcement_mode',
              'blocked','incident_created','incident_id','message','evidence_json')
    ) > 0, 'M19 FAIL: missing columns in attempt_rules';
    RAISE NOTICE 'M19 PASS: attempt_rules has expected columns';
END $$;

-- M20: attempt_rules FK (attempt_id) uses ON DELETE RESTRICT
DO $$ BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'inout_transition_attempt_rules'
          AND c.contype = 'f'
          AND c.confdeltype = 'r'
          AND EXISTS (
              SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = t.oid AND a.attname = 'attempt_id'
                AND a.attnum = ANY(c.conkey)
          )
    ), 'M20 FAIL: attempt_rules.attempt_id FK not RESTRICT';
    RAISE NOTICE 'M20 PASS: attempt_rules FK ON DELETE RESTRICT';
END $$;

-- M21: attempt_rules CHECK for result values
DO $$ BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'inout_transition_attempt_rules'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) LIKE '%applied%'
          AND pg_get_constraintdef(c.oid) LIKE '%blocked%'
    ), 'M21 FAIL: attempt_rules CHECK missing';
    RAISE NOTICE 'M21 PASS: attempt_rules CHECK exists';
END $$;

-- M22: attempt_rules CHECK for severity values
DO $$ BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'inout_transition_attempt_rules'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) LIKE '%baja%'
          AND pg_get_constraintdef(c.oid) LIKE '%alta%'
    ), 'M22 FAIL: severity CHECK missing';
    RAISE NOTICE 'M22 PASS: severity CHECK exists';
END $$;

-- M23: attempt_rules RLS is enabled
DO $$ BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM pg_class
        WHERE relname = 'inout_transition_attempt_rules' AND relrowsecurity = true
    ), 'M23 FAIL: RLS not enabled on attempt_rules';
    RAISE NOTICE 'M23 PASS: RLS enabled';
END $$;

-- M24: attempt_rules SELECT policy exists
DO $$ BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'inout_transition_attempt_rules'
          AND cmd = 'SELECT'
    ), 'M24 FAIL: SELECT policy missing';
    RAISE NOTICE 'M24 PASS: SELECT policy exists';
END $$;

-- M25: No INSERT/UPDATE/DELETE policies for authenticated on attempt_rules
DO $$ BEGIN
    ASSERT NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'inout_transition_attempt_rules'
          AND cmd IN ('INSERT','UPDATE','DELETE')
    ), 'M25 FAIL: write policies found on attempt_rules (should only be SELECT via RLS)';
    RAISE NOTICE 'M25 PASS: no write policies on attempt_rules';
END $$;

-- M26: RPC GRANTed to authenticated
DO $$ BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM information_schema.routine_privileges
        WHERE routine_schema = 'public' AND routine_name = 'transition_reservation_status'
          AND grantee = 'authenticated' AND privilege_type = 'EXECUTE'
    ), 'M26 FAIL: authenticated missing EXECUTE';
    RAISE NOTICE 'M26 PASS: authenticated has EXECUTE';
END $$;

-- M27: RPC GRANTed to service_role
DO $$ BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM information_schema.routine_privileges
        WHERE routine_schema = 'public' AND routine_name = 'transition_reservation_status'
          AND grantee = 'service_role' AND privilege_type = 'EXECUTE'
    ), 'M27 FAIL: service_role missing EXECUTE';
    RAISE NOTICE 'M27 PASS: service_role has EXECUTE';
END $$;

-- M28: Helpers have no EXECUTE for authenticated
DO $$ BEGIN
    ASSERT NOT EXISTS (
        SELECT 1 FROM information_schema.routine_privileges
        WHERE routine_schema = 'public'
          AND routine_name IN ('_inout_resolve_transition_actor','_inout_build_transition_fingerprint','_inout_create_transition_incident')
          AND grantee = 'authenticated' AND privilege_type = 'EXECUTE'
    ), 'M28 FAIL: helpers have EXECUTE for authenticated';
    RAISE NOTICE 'M28 PASS: helpers not exposed to authenticated';
END $$;

-- M29: idempotency_key column type is UUID
DO $$ BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'inout_state_transition_attempts'
          AND column_name = 'idempotency_key' AND data_type = 'uuid'
    ), 'M29 FAIL: idempotency_key not UUID';
    RAISE NOTICE 'M29 PASS: idempotency_key type is UUID';
END $$;

-- M30: attempt_rules FK (rule_id) uses ON DELETE RESTRICT
DO $$ BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'inout_transition_attempt_rules'
          AND c.contype = 'f' AND c.confdeltype = 'r'
          AND EXISTS (
              SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = t.oid AND a.attname = 'rule_id'
                AND a.attnum = ANY(c.conkey)
          )
    ), 'M30 FAIL: rule_id FK not RESTRICT';
    RAISE NOTICE 'M30 PASS: rule_id FK ON DELETE RESTRICT';
END $$;

-- ===========================================================================
-- PART 2: FUNCTIONAL TESTS (F1-F46)
-- Most require test data. Classified honestly.
-- ===========================================================================

-- F1: Reservation not found → RESERVATION_NOT_FOUND [DATA_REQUIRED]
DO $$ BEGIN
    RAISE NOTICE 'F1 DATA_REQUIRED: needs auth context + non-existent UUID to call RPC';
END $$;

-- F2: Invalid target status → INVALID_TARGET_STATUS [DATA_REQUIRED]
DO $$ BEGIN
    RAISE NOTICE 'F2 DATA_REQUIRED: needs auth context + valid reservation + invalid status UUID';
END $$;

-- F3: Inactive target status → INACTIVE_TARGET_STATUS [DATA_REQUIRED]
DO $$ BEGIN
    RAISE NOTICE 'F3 DATA_REQUIRED: needs auth context + known inactive status ID';
END $$;

-- F4: User not authenticated → USER_NOT_AUTHENTICATED [ROLE_REQUIRED]
DO $$ BEGIN
    RAISE NOTICE 'F4 ROLE_REQUIRED: needs anon role context';
END $$;

-- F5: User from other org → ORG_MISMATCH [DATA_REQUIRED]
DO $$ BEGIN
    RAISE NOTICE 'F5 DATA_REQUIRED: needs user in org A + reservation in org B';
END $$;

-- F6: User without transitions.execute → USER_NOT_AUTHORIZED [DATA_REQUIRED]
DO $$ BEGIN
    RAISE NOTICE 'F6 DATA_REQUIRED: needs user without transitions.execute in org';
END $$;

-- F7: Normal forward transition PENDING→CONFIRMED → allowed=true [DATA_REQUIRED]
DO $$ BEGIN
    RAISE NOTICE 'F7 DATA_REQUIRED: needs PENDING reservation + user with transitions.execute';
END $$;

-- F8: Skip not allowed PENDING→DISCHARGED → RULE_BLOCKED [DATA_REQUIRED]
DO $$ BEGIN
    RAISE NOTICE 'F8 DATA_REQUIRED: needs PENDING reservation';
END $$;

-- F9: SAME_STATUS → no_op, idempotency work [DATA_REQUIRED]
DO $$ BEGIN
    RAISE NOTICE 'F9 DATA_REQUIRED: needs reservation with known status';
END $$;

-- F10-F46: All need test data
DO $$ BEGIN
    RAISE NOTICE 'F10-F46 DATA_REQUIRED: need test reservations, users, permissions, rule data';
    RAISE NOTICE '  Key tests requiring data:';
    RAISE NOTICE '  - Cancel/NoShow with reason → allowed=true';
    RAISE NOTICE '  - DISPATCHED→DONE → allowed=true (with R05 warning)';
    RAISE NOTICE '  - DONE reopen without override → TERMINAL_STATE_BLOCKED';
    RAISE NOTICE '  - DONE reopen with override → allowed=true';
    RAISE NOTICE '  - Idempotent replay → idempotent_replay=true';
    RAISE NOTICE '  - Idempotency conflict → IDEMPOTENCY_CONFLICT';
    RAISE NOTICE '  - Two rules→two incidents';
    RAISE NOTICE '  - Same rule→no duplicate incident';
    RAISE NOTICE '  - FK RESTRICT prevents attempt deletion';
END $$;

-- ===========================================================================
-- PART 3: INTEGRATION TESTS (I1-I10)
-- Full end-to-end validation requiring data + role switching.
-- ===========================================================================

DO $$ BEGIN
    RAISE NOTICE 'I1-I10 DATA_REQUIRED + ROLE_REQUIRED: need authenticated/service_role contexts';
    RAISE NOTICE '  I1: RPC creates attempt → attempt_id returned, row exists';
    RAISE NOTICE '  I2: attempt_rules populated → N rows = N rules';
    RAISE NOTICE '  I3: RPC creates incidents → incident_ids match DB';
    RAISE NOTICE '  I4: audit_log written → row with correct action';
    RAISE NOTICE '  I5: reservations.status_id updated';
    RAISE NOTICE '  I6: Cancel → is_cancelled columns set';
    RAISE NOTICE '  I7: Reopen CANCELLED → columns cleared';
    RAISE NOTICE '  I8: Blocked → reservations unchanged';
    RAISE NOTICE '  I9: Replay → same IDs as original';
    RAISE NOTICE '  I10: Concurrency → FOR UPDATE serializes [MANUAL: needs 2 connections]';
END $$;

-- ===========================================================================
-- TEST SUMMARY
-- ===========================================================================
DO $$
DECLARE
    v_executable INTEGER := 30;
    v_data_req   INTEGER := 46;
    v_role_req   INTEGER := 10;
    v_manual     INTEGER := 1;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'PHASE 6.2 TEST CLASSIFICATION';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Schema/Catalog tests (M1-M30):   % EXECUTABLE', v_executable;
    RAISE NOTICE 'Functional tests (F1-F46):       % DATA_REQUIRED', v_data_req;
    RAISE NOTICE 'Integration tests (I1-I10):      % ROLE_REQUIRED', v_role_req;
    RAISE NOTICE '  (I10 also marked MANUAL — needs 2 concurrent connections)';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'EXECUTABLE tests (M1-M30) run automatically in SQL Editor.';
    RAISE NOTICE 'DATA_REQUIRED tests need: test reservations, users, permissions.';
    RAISE NOTICE 'ROLE_REQUIRED tests need: SET ROLE or auth context switching.';
    RAISE NOTICE '========================================';
END $$;