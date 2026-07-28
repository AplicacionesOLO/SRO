-- ============================================================================
-- rollback_inout_module.sql
-- ⚠️ SCRIPT MANUAL — NO FORMA PARTE DEL FLUJO AUTOMÁTICO DE MIGRACIONES
-- Ubicación: supabase/manual/ (fuera de supabase/migrations/)
-- 
-- Este script revierte manualmente TODO el módulo IN/OUT Flow (Fase 6.1).
-- Debe ejecutarse como superuser o service_role.
-- NO se ejecuta automáticamente con supabase migration up ni db push.
--
-- Uso:
--   psql <connection_string> -f supabase/manual/rollback_inout_module.sql
--   O copiar y pegar en SQL Editor (como service_role)
--
-- CORRECCIONES APLICADAS (v2.1):
--   ✅ Sin LIKE genérico — lista exacta de permisos
--   ✅ Sin dependencia de tablas temporales
--   ✅ role_permissions se elimina ANTES que permissions (integridad referencial)
--   ✅ Eliminación de tablas en orden de dependencia (hijos primero, padres después)
--      → Sin CASCADE indiscriminado
--   ✅ Cada DROP TABLE es explícito y atómico
--   ✅ Funciones y triggers eliminados antes que las tablas que referencian
-- ============================================================================

BEGIN;

-- ===========================================================================
-- FASE 1: Triggers y funciones (dependen de tablas)
-- ===========================================================================

-- Eliminar trigger de protección de estado (si existe de una ejecución previa)
DROP TRIGGER IF EXISTS trg_block_unauthorized_status_update ON public.reservations;
DROP FUNCTION IF EXISTS public.block_unauthorized_status_update();

-- Eliminar RPC de transición (si existe)
DROP FUNCTION IF EXISTS public.transition_reservation_status;

-- Eliminar función de aprovisionamiento
DROP FUNCTION IF EXISTS public.provision_inout_flow_for_org(UUID);

-- Eliminar helpers
DROP FUNCTION IF EXISTS public.inout_get_user_org_role(UUID, UUID);
DROP FUNCTION IF EXISTS public.inout_has_permission(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.inout_generate_idempotency_key(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.inout_get_max_severity(TEXT[]);

-- ===========================================================================
-- FASE 2: Deshabilitar RLS
-- ===========================================================================

ALTER TABLE IF EXISTS public.inout_flow_rules DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inout_flow_incidents DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inout_state_transition_attempts DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inout_incident_comments DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inout_report_schedules DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inout_report_runs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inout_flow_audit_log DISABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- FASE 3: Eliminar asignaciones de permisos (role_permissions PRIMERO)
--         Usando lista explícita — sin LIKE
-- ===========================================================================

DELETE FROM public.role_permissions
WHERE permission_id IN (
    SELECT id FROM public.permissions
    WHERE name IN (
        'casetilla.flow_report.view',
        'casetilla.flow_report.rules.view',
        'casetilla.flow_report.rules.manage',
        'casetilla.flow_report.incidents.view',
        'casetilla.flow_report.incidents.resolve',
        'casetilla.flow_report.incidents.override',
        'casetilla.flow_report.reports.send',
        'casetilla.flow_report.schedules.manage',
        'casetilla.flow_report.audit.view'
    )
);

-- ===========================================================================
-- FASE 4: Eliminar permisos (DESPUÉS de role_permissions)
-- ===========================================================================

DELETE FROM public.permissions
WHERE name IN (
    'casetilla.flow_report.view',
    'casetilla.flow_report.rules.view',
    'casetilla.flow_report.rules.manage',
    'casetilla.flow_report.incidents.view',
    'casetilla.flow_report.incidents.resolve',
    'casetilla.flow_report.incidents.override',
    'casetilla.flow_report.reports.send',
    'casetilla.flow_report.schedules.manage',
    'casetilla.flow_report.audit.view'
);

-- ===========================================================================
-- FASE 5: Eliminar tablas en orden de dependencia (hijos → padres)
--         Sin CASCADE: el orden garantiza integridad referencial
-- ===========================================================================

-- Nivel 1: Tablas que solo dependen de tablas del sistema (sin FKs entrantes de otras inout_*)
DROP TABLE IF EXISTS public.inout_incident_comments;
--   FK: inout_flow_incidents (ON DELETE RESTRICT) → eliminada antes que incidents

-- Nivel 2: Tablas sin dependencias entrantes de otras inout_*
DROP TABLE IF EXISTS public.inout_report_runs;
DROP TABLE IF EXISTS public.inout_state_transition_attempts;
--   FK (self): parent_attempt_id → misma tabla
--   FK: inout_flow_rules → aún existe

-- Nivel 3: Tablas que dependen de nivel 4 (y no tienen dependencias entrantes restantes)
DROP TABLE IF EXISTS public.inout_flow_incidents;
--   FK: inout_flow_rules → aún existe

-- Nivel 4: Tablas base (sin FKs a otras inout_*)
DROP TABLE IF EXISTS public.inout_report_schedules;
DROP TABLE IF EXISTS public.inout_flow_rules;
DROP TABLE IF EXISTS public.inout_flow_audit_log;

-- ===========================================================================
-- Verificación final
-- ===========================================================================

DO $$
DECLARE
    v_remaining INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_remaining
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
          'inout_flow_rules',
          'inout_flow_incidents',
          'inout_state_transition_attempts',
          'inout_incident_comments',
          'inout_report_schedules',
          'inout_report_runs',
          'inout_flow_audit_log'
      );

    IF v_remaining > 0 THEN
        RAISE WARNING '[rollback_inout] Quedan % tablas inout_* sin eliminar.', v_remaining;
    ELSE
        RAISE NOTICE '[rollback_inout] Rollback completo: 0 tablas inout_* restantes.';
    END IF;
END $$;

COMMIT;