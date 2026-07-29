-- ===========================================================================
-- PHASE 6.2 — TRANSITION ENGINE: Rollback
-- Migration: 20260729129999_phase_6_2_rollback.sql
-- ===========================================================================
-- Conservative rollback: preserves evidence (attempts, incidents, audit).
-- Mirrors migrations 20260729120000-20260729120300 in reverse order.
-- WARNING: If inout_transition_attempt_rules contains production data,
-- this rollback will ABORT rather than silently destroy it.
-- ===========================================================================

BEGIN;

-- ===========================================================================
-- PREFLIGHT: Check for production data in new table
-- ===========================================================================
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM public.inout_transition_attempt_rules;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'ROLLBACK ABORTED: inout_transition_attempt_rules contains % rows of production data. Backup the table before rollback.', v_count;
    END IF;
END $$;

-- ===========================================================================
-- 1. Retire RPC
-- ===========================================================================
DROP FUNCTION IF EXISTS public.transition_reservation_status(
    UUID, UUID, TEXT, TEXT, UUID, JSONB, UUID
);

-- ===========================================================================
-- 2. Retire helpers
-- ===========================================================================
DROP FUNCTION IF EXISTS public._inout_create_transition_incident(
    UUID, UUID, UUID, UUID, TEXT, TEXT, UUID
);
DROP FUNCTION IF EXISTS public._inout_build_transition_fingerprint(
    UUID, UUID, TEXT, UUID, UUID
);
DROP FUNCTION IF EXISTS public._inout_resolve_transition_actor(UUID);

-- ===========================================================================
-- 3. Drop new table (only if empty — checked above)
-- ===========================================================================
DROP TABLE IF EXISTS public.inout_transition_attempt_rules CASCADE;

-- ===========================================================================
-- 4. Retire permission and assignments
-- ===========================================================================
DELETE FROM public.role_permissions
WHERE permission_id = (
    SELECT id FROM public.permissions
    WHERE name = 'casetilla.flow_report.transitions.execute'
);

DELETE FROM public.permissions
WHERE name = 'casetilla.flow_report.transitions.execute';

-- ===========================================================================
-- 5. Retire new partial indexes
-- ===========================================================================
DROP INDEX IF EXISTS public.uq_incidents_attempt_admin_type;
DROP INDEX IF EXISTS public.uq_incidents_attempt_rule_type;

-- ===========================================================================
-- 6. Restore legacy index (ONLY if no duplicate (org_id, idempotency_key) exist)
-- ===========================================================================
DO $$
DECLARE
    v_dup_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_dup_count
    FROM (
        SELECT org_id, idempotency_key, COUNT(*) AS cnt
        FROM public.inout_flow_incidents
        GROUP BY org_id, idempotency_key
        HAVING COUNT(*) > 1
    ) dups;

    IF v_dup_count > 0 THEN
        RAISE WARNING 'Cannot restore uq_incidents_idempotency: % duplicate (org_id, idempotency_key) groups exist. Manual cleanup required.', v_dup_count;
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS uq_incidents_idempotency
        ON public.inout_flow_incidents (org_id, idempotency_key);
        RAISE NOTICE 'Legacy index uq_incidents_idempotency restored.';
    END IF;
END $$;

-- ===========================================================================
-- 7. Retire FK on incidents.attempt_id
-- ===========================================================================
ALTER TABLE public.inout_flow_incidents
DROP CONSTRAINT IF EXISTS fk_incidents_attempt;

-- ===========================================================================
-- 8. CONSERVE attempt_id column (may contain audit data)
--    Do NOT drop the column. It stays as nullable traceability.
--    If you truly need to remove it:
--    ALTER TABLE public.inout_flow_incidents DROP COLUMN IF EXISTS attempt_id;

-- ===========================================================================
-- 9. Retire idempotency_key from attempts
-- ===========================================================================
ALTER TABLE public.inout_state_transition_attempts
DROP COLUMN IF EXISTS idempotency_key;

-- ===========================================================================
-- 10. Restore previous_status_id NOT NULL
--     Only if no rows with NULL legitimate value exist
-- ===========================================================================
DO $$
DECLARE
    v_null_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_null_count
    FROM public.inout_state_transition_attempts
    WHERE previous_status_id IS NULL;

    IF v_null_count = 0 THEN
        ALTER TABLE public.inout_state_transition_attempts
        ALTER COLUMN previous_status_id SET NOT NULL;
        RAISE NOTICE 'previous_status_id restored to NOT NULL.';
    ELSE
        RAISE WARNING 'Cannot restore previous_status_id NOT NULL: % rows have NULL value.', v_null_count;
    END IF;
END $$;

-- ===========================================================================
-- 11. Restore source CHECK (original values from Fase 6.1)
-- ===========================================================================
ALTER TABLE public.inout_state_transition_attempts
DROP CONSTRAINT IF EXISTS ck_attempts_source;

ALTER TABLE public.inout_state_transition_attempts
ADD CONSTRAINT ck_attempts_source CHECK (
    source = ANY (ARRAY[
        'frontend_calendar','casetilla_ingreso','casetilla_salida',
        'external_api','auto_no_show','admin_override',
        'scheduled_reconciliation','system'
    ])
);

-- ===========================================================================
-- 12. Restore result CHECK (original values, without no_op/override)
-- ===========================================================================
ALTER TABLE public.inout_state_transition_attempts
DROP CONSTRAINT IF EXISTS ck_attempts_result;

ALTER TABLE public.inout_state_transition_attempts
ADD CONSTRAINT ck_attempts_result CHECK (
    result = ANY (ARRAY[
        'allowed','blocked','warning_pending','allowed_after_warning',
        'allowed_by_override','failed_validation','no_change'
    ])
);

-- ===========================================================================
-- 13. Restore different_status CHECK
-- ===========================================================================
DO $$
DECLARE
    v_conflict_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_conflict_count
    FROM public.inout_state_transition_attempts
    WHERE previous_status_id = requested_status_id;

    IF v_conflict_count = 0 THEN
        ALTER TABLE public.inout_state_transition_attempts
        ADD CONSTRAINT ck_attempts_different_status
        CHECK (previous_status_id IS NULL OR previous_status_id <> requested_status_id);
        RAISE NOTICE 'ck_attempts_different_status restored.';
    ELSE
        RAISE WARNING 'Cannot restore ck_attempts_different_status: % rows have previous=requested.', v_conflict_count;
    END IF;
END $$;

-- ===========================================================================
-- POSTFLIGHT
-- ===========================================================================
DO $$
DECLARE v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'transition_reservation_status';
    IF v_count > 0 THEN RAISE WARNING 'RPC still present'; END IF;

    SELECT COUNT(*) INTO v_count FROM information_schema.tables WHERE table_name = 'inout_transition_attempt_rules';
    IF v_count > 0 THEN RAISE WARNING 'New table still present'; END IF;

    SELECT COUNT(*) INTO v_count FROM pg_indexes
    WHERE tablename = 'inout_flow_incidents' AND indexname IN ('uq_incidents_attempt_rule_type','uq_incidents_attempt_admin_type');
    IF v_count > 0 THEN RAISE WARNING 'Partial indexes still present'; END IF;

    SELECT COUNT(*) INTO v_count FROM public.permissions WHERE name = 'casetilla.flow_report.transitions.execute';
    IF v_count > 0 THEN RAISE WARNING 'Permission still present'; END IF;

    RAISE NOTICE 'Rollback verification complete.';
END $$;

COMMIT;