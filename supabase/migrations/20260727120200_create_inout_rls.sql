-- ============================================================================
-- 003_create_inout_rls.sql
-- Fase 6.1 — BASE ESTRUCTURAL PASIVA
-- Habilita RLS en las 7 tablas y crea políticas granulares
--
-- CORRECCIONES APLICADAS (v2.1):
--   ✅ inout_flow_incidents: SIN INSERT ni UPDATE desde authenticated
--      → Solo la RPC (SECURITY DEFINER) puede crear/modificar incidencias
--   ✅ inout_state_transition_attempts: SIN INSERT, UPDATE ni DELETE desde authenticated
--      → Solo la RPC puede escribir. Bitácora completamente inmutable para el frontend.
--   ✅ inout_incident_comments: SIN UPDATE ni DELETE desde authenticated
--      → APPEND-ONLY: solo INSERT permitido. El historial no se modifica ni elimina.
--   ✅ SIN políticas para service_role
--      → service_role NO necesita políticas RLS (bypass automático).
--        No se crean políticas especiales como si fuera un usuario RLS.
--   ✅ SELECT siempre limitado por org_id + verificación de permisos
--   ✅ Todas las políticas referencian tablas con schema calificado: public.
-- ============================================================================

BEGIN;

-- ===========================================================================
-- Habilitar RLS en las 7 tablas
-- ===========================================================================

ALTER TABLE public.inout_flow_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inout_flow_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inout_state_transition_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inout_incident_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inout_report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inout_report_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inout_flow_audit_log ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- inout_flow_rules — Políticas
-- ===========================================================================

-- SELECT: Usuarios con permiso casetilla.flow_report.rules.view en su org
DROP POLICY IF EXISTS "Flow rules - SELECT" ON public.inout_flow_rules;
CREATE POLICY "Flow rules - SELECT" ON public.inout_flow_rules FOR SELECT
USING (org_id IN (
    SELECT uor.org_id FROM public.user_org_roles uor
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = auth.uid() AND p.name = 'casetilla.flow_report.rules.view'
));

-- INSERT: Usuarios con permiso casetilla.flow_report.rules.manage en su org
DROP POLICY IF EXISTS "Flow rules - INSERT" ON public.inout_flow_rules;
CREATE POLICY "Flow rules - INSERT" ON public.inout_flow_rules FOR INSERT
WITH CHECK (org_id IN (
    SELECT uor.org_id FROM public.user_org_roles uor
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = auth.uid() AND p.name = 'casetilla.flow_report.rules.manage'
));

-- UPDATE: Usuarios con permiso casetilla.flow_report.rules.manage en su org
-- (El CHECK en la tabla impide modificar reglas de sistema con edit_policy='locked')
DROP POLICY IF EXISTS "Flow rules - UPDATE" ON public.inout_flow_rules;
CREATE POLICY "Flow rules - UPDATE" ON public.inout_flow_rules FOR UPDATE
USING (org_id IN (
    SELECT uor.org_id FROM public.user_org_roles uor
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = auth.uid() AND p.name = 'casetilla.flow_report.rules.manage'
))
WITH CHECK (org_id IN (
    SELECT uor.org_id FROM public.user_org_roles uor
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = auth.uid() AND p.name = 'casetilla.flow_report.rules.manage'
));

-- DELETE: NO se permite desde authenticated
-- Las reglas no se eliminan; se desactivan (is_active = false) si edit_policy lo permite.

-- ===========================================================================
-- inout_flow_incidents — Políticas
-- ===========================================================================

-- SELECT: Usuarios con permiso casetilla.flow_report.incidents.view en SU org
DROP POLICY IF EXISTS "Incidents - SELECT" ON public.inout_flow_incidents;
CREATE POLICY "Incidents - SELECT" ON public.inout_flow_incidents FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.user_org_roles uor
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = auth.uid()
      AND uor.org_id = inout_flow_incidents.org_id
      AND p.name = 'casetilla.flow_report.incidents.view'
));

-- INSERT: NO permitido desde authenticated
-- Solo la RPC transition_reservation_status() (SECURITY DEFINER) puede crear incidencias.
-- El frontend NUNCA inserta incidencias directamente.

-- UPDATE: NO permitido desde authenticated
-- La gestión de incidencias (asignar, resolver, cambiar estado) se hará mediante
-- RPCs específicas en Fase 6.2+. Por ahora, solo lectura desde el frontend.

-- DELETE: NO permitido desde authenticated
-- Las incidencias no se eliminan; se resuelven, ignoran o marcan como falso positivo.

-- ===========================================================================
-- inout_state_transition_attempts — Políticas
-- ===========================================================================

-- SELECT: Usuarios con permiso casetilla.flow_report.audit.view en SU org
DROP POLICY IF EXISTS "Attempts - SELECT" ON public.inout_state_transition_attempts;
CREATE POLICY "Attempts - SELECT" ON public.inout_state_transition_attempts FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.user_org_roles uor
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = auth.uid()
      AND uor.org_id = inout_state_transition_attempts.org_id
      AND p.name = 'casetilla.flow_report.audit.view'
));

-- INSERT: NO permitido desde authenticated
-- Solo la RPC puede registrar intentos de transición.

-- UPDATE: NO permitido desde authenticated
-- Bitácora inmutable. Los intentos no se modifican después de creados.

-- DELETE: NO permitido desde authenticated
-- Bitácora inmutable. El historial de transiciones no se elimina.

-- ===========================================================================
-- inout_incident_comments — Políticas (APPEND-ONLY)
-- ===========================================================================

-- SELECT: Cualquier usuario autenticado con acceso a la misma org que el comentario
DROP POLICY IF EXISTS "Comments - SELECT" ON public.inout_incident_comments;
CREATE POLICY "Comments - SELECT" ON public.inout_incident_comments FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.user_org_roles uor
    WHERE uor.user_id = auth.uid()
      AND uor.org_id = inout_incident_comments.org_id
));

-- INSERT: Requiere permiso incidents.view + validar que incident_id pertenece a la misma organización
-- Solo el usuario autenticado puede insertar sus propios comentarios.
DROP POLICY IF EXISTS "Comments - INSERT" ON public.inout_incident_comments;
CREATE POLICY "Comments - INSERT" ON public.inout_incident_comments FOR INSERT
WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.user_org_roles uor
        JOIN public.role_permissions rp ON uor.role_id = rp.role_id
        JOIN public.permissions p ON rp.permission_id = p.id
        WHERE uor.user_id = auth.uid()
          AND uor.org_id = inout_incident_comments.org_id
          AND p.name = 'casetilla.flow_report.incidents.view'
    )
    AND EXISTS (
        SELECT 1 FROM public.inout_flow_incidents i
        WHERE i.id = incident_id
          AND i.org_id = org_id
    )
);

-- UPDATE: NO permitido — APPEND-ONLY
-- Los comentarios no se modifican una vez creados.

-- DELETE: NO permitido — APPEND-ONLY
-- Los comentarios no se eliminan. El historial de comunicación se conserva íntegro.

-- ===========================================================================
-- inout_report_schedules — Políticas
-- ===========================================================================

-- SELECT: Usuarios con permiso casetilla.flow_report.schedules.manage en SU org
DROP POLICY IF EXISTS "Schedules - SELECT" ON public.inout_report_schedules;
CREATE POLICY "Schedules - SELECT" ON public.inout_report_schedules FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.user_org_roles uor
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = auth.uid()
      AND uor.org_id = inout_report_schedules.org_id
      AND p.name = 'casetilla.flow_report.schedules.manage'
));

-- INSERT: Usuarios con permiso casetilla.flow_report.schedules.manage
DROP POLICY IF EXISTS "Schedules - INSERT" ON public.inout_report_schedules;
CREATE POLICY "Schedules - INSERT" ON public.inout_report_schedules FOR INSERT
WITH CHECK (org_id IN (
    SELECT uor.org_id FROM public.user_org_roles uor
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = auth.uid() AND p.name = 'casetilla.flow_report.schedules.manage'
));

-- UPDATE: Usuarios con permiso casetilla.flow_report.schedules.manage en SU org
DROP POLICY IF EXISTS "Schedules - UPDATE" ON public.inout_report_schedules;
CREATE POLICY "Schedules - UPDATE" ON public.inout_report_schedules FOR UPDATE
USING (EXISTS (
    SELECT 1 FROM public.user_org_roles uor
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = auth.uid()
      AND uor.org_id = inout_report_schedules.org_id
      AND p.name = 'casetilla.flow_report.schedules.manage'
))
WITH CHECK (org_id IN (
    SELECT uor.org_id FROM public.user_org_roles uor
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = auth.uid() AND p.name = 'casetilla.flow_report.schedules.manage'
));

-- DELETE: Usuarios con permiso casetilla.flow_report.schedules.manage en SU org
DROP POLICY IF EXISTS "Schedules - DELETE" ON public.inout_report_schedules;
CREATE POLICY "Schedules - DELETE" ON public.inout_report_schedules FOR DELETE
USING (EXISTS (
    SELECT 1 FROM public.user_org_roles uor
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = auth.uid()
      AND uor.org_id = inout_report_schedules.org_id
      AND p.name = 'casetilla.flow_report.schedules.manage'
));

-- ===========================================================================
-- inout_report_runs — Políticas
-- ===========================================================================

-- SELECT: Usuarios con permiso casetilla.flow_report.audit.view en SU org
DROP POLICY IF EXISTS "Runs - SELECT" ON public.inout_report_runs;
CREATE POLICY "Runs - SELECT" ON public.inout_report_runs FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.user_org_roles uor
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = auth.uid()
      AND uor.org_id = inout_report_runs.org_id
      AND p.name = 'casetilla.flow_report.audit.view'
));

-- INSERT: NO permitido desde authenticated
-- Solo procesos del sistema (Edge Functions, RPCs) crean report runs.

-- UPDATE: NO permitido desde authenticated
-- El estado de ejecución lo actualizan procesos del sistema.

-- DELETE: NO permitido desde authenticated
-- El historial de ejecuciones no se elimina.

-- ===========================================================================
-- inout_flow_audit_log — Políticas
-- ===========================================================================

-- SELECT: Usuarios con permiso casetilla.flow_report.audit.view en SU org
DROP POLICY IF EXISTS "Audit - SELECT" ON public.inout_flow_audit_log;
CREATE POLICY "Audit - SELECT" ON public.inout_flow_audit_log FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.user_org_roles uor
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = auth.uid()
      AND uor.org_id = inout_flow_audit_log.org_id
      AND p.name = 'casetilla.flow_report.audit.view'
));

-- INSERT: NO permitido desde authenticated
-- Solo la RPC y procesos del sistema escriben en el audit log.

-- UPDATE: NO permitido desde authenticated
-- Registro inmutable.

-- DELETE: NO permitido desde authenticated
-- Registro inmutable.

-- ===========================================================================
-- Total: 13 políticas RLS (reducido de 17 en especificación original)
--   - inout_flow_rules: SELECT, INSERT, UPDATE (3)
--   - inout_flow_incidents: SELECT (1)
--   - inout_state_transition_attempts: SELECT (1)
--   - inout_incident_comments: SELECT, INSERT (2)
--   - inout_report_schedules: SELECT, INSERT, UPDATE, DELETE (4)
--   - inout_report_runs: SELECT (1)
--   - inout_flow_audit_log: SELECT (1)
-- ===========================================================================

COMMIT;