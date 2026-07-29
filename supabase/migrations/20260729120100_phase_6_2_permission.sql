-- ===========================================================================
-- PHASE 6.2 — TRANSITION ENGINE: Permission
-- Migration: 20260729120100_phase_6_2_permission.sql
-- ===========================================================================
-- Creates casetilla.flow_report.transitions.execute permission and assigns
-- to ADMIN and Full Access roles.
-- ===========================================================================

BEGIN;

-- ===========================================================================
-- FASE F — NEW PERMISSION
-- ===========================================================================

-- Create permission if it doesn't exist
INSERT INTO public.permissions (name, description, category)
VALUES (
    'casetilla.flow_report.transitions.execute',
    'Ejecutar transiciones de estado de reservas (cambiar status_id)',
    'casetilla'
)
ON CONFLICT (name) DO NOTHING;

-- Assign to ADMIN and Full Access (not SUPERVISOR)
DO $$
DECLARE
    v_perm_id UUID;
    v_count   INTEGER;
BEGIN
    SELECT id INTO v_perm_id FROM public.permissions
    WHERE name = 'casetilla.flow_report.transitions.execute';

    IF v_perm_id IS NOT NULL THEN
        WITH assigned AS (
            INSERT INTO public.role_permissions (role_id, permission_id)
            SELECT r.id, v_perm_id
            FROM public.roles r
            WHERE r.name IN ('ADMIN', 'Full Access')
              AND NOT EXISTS (
                  SELECT 1 FROM public.role_permissions rp2
                  WHERE rp2.role_id = r.id AND rp2.permission_id = v_perm_id
              )
            RETURNING role_id
        )
        SELECT COUNT(*) INTO v_count FROM assigned;
        RAISE NOTICE 'Permission transitions.execute assigned to % roles', v_count;
    END IF;
END $$;

COMMIT;