-- ============================================================================
-- 004_create_inout_permissions.sql
-- Fase 6.1 — BASE ESTRUCTURAL PASIVA
-- Crea 9 permisos del módulo IN/OUT y los asigna a roles usando matriz explícita
--
-- CORRECCIONES APLICADAS (v2.1):
--   ✅ SIN ILIKE — matriz explícita de roles por nombre exacto
--   ✅ Roles verificados contra BD real:
--      - ADMIN (b1b443a6-3afc-4fd2-89e9-a88911c8d4d6)
--      - Full Access (b6ef06ce-b021-4c76-a659-73a3e89346d5)
--      - SUPERVISOR (5c39ebfb-5573-4841-922c-3c4f564c5209)
--   ✅ ADMIN: 9 permisos
--   ✅ Full Access: 9 permisos
--   ✅ SUPERVISOR: 6 permisos (sin override, rules.manage, schedules.manage)
--   ✅ idempotente: INSERT ... ON CONFLICT DO NOTHING en permissions
--   ✅ idempotente: NOT EXISTS en role_permissions
-- ============================================================================

BEGIN;

-- ===========================================================================
-- 1. Insertar los 9 permisos (idempotente)
-- ===========================================================================

INSERT INTO public.permissions (name, description, category)
VALUES
    ('casetilla.flow_report.view',              'Ver el módulo de Cumplimiento Logístico',                 'casetilla'),
    ('casetilla.flow_report.rules.view',        'Ver reglas de flujo IN/OUT',                              'casetilla'),
    ('casetilla.flow_report.rules.manage',      'Crear, editar y gestionar reglas de flujo',               'casetilla'),
    ('casetilla.flow_report.incidents.view',    'Ver incidencias de flujo IN/OUT',                         'casetilla'),
    ('casetilla.flow_report.incidents.resolve', 'Gestionar incidencias (asignar, resolver, ignorar)',      'casetilla'),
    ('casetilla.flow_report.incidents.override','Ejecutar override administrativo de reglas block',        'casetilla'),
    ('casetilla.flow_report.reports.send',      'Enviar reportes manuales de flujo',                       'casetilla'),
    ('casetilla.flow_report.schedules.manage',  'Gestionar programación de reportes automáticos',          'casetilla'),
    ('casetilla.flow_report.audit.view',        'Ver bitácora de auditoría de flujo IN/OUT',               'casetilla')
ON CONFLICT (name) DO NOTHING;

-- ===========================================================================
-- 2. Asignar 9 permisos a ADMIN (matriz explícita)
-- ===========================================================================

WITH flow_perms AS (
    SELECT id, name FROM public.permissions
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
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, fp.id
FROM public.roles r
CROSS JOIN flow_perms fp
WHERE r.name = 'ADMIN'
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp2
    WHERE rp2.role_id = r.id AND rp2.permission_id = fp.id
  );

-- ===========================================================================
-- 3. Asignar 9 permisos a Full Access (matriz explícita)
-- ===========================================================================

WITH flow_perms AS (
    SELECT id, name FROM public.permissions
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
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, fp.id
FROM public.roles r
CROSS JOIN flow_perms fp
WHERE r.name = 'Full Access'
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp2
    WHERE rp2.role_id = r.id AND rp2.permission_id = fp.id
  );

-- ===========================================================================
-- 4. Asignar 6 permisos a SUPERVISOR (matriz explícita)
--    SIN: rules.manage, incidents.override, schedules.manage
-- ===========================================================================

WITH flow_perms AS (
    SELECT id, name FROM public.permissions
    WHERE name IN (
        'casetilla.flow_report.view',
        'casetilla.flow_report.rules.view',
        'casetilla.flow_report.incidents.view',
        'casetilla.flow_report.incidents.resolve',
        'casetilla.flow_report.reports.send',
        'casetilla.flow_report.audit.view'
    )
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, fp.id
FROM public.roles r
CROSS JOIN flow_perms fp
WHERE r.name = 'SUPERVISOR'
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp2
    WHERE rp2.role_id = r.id AND rp2.permission_id = fp.id
  );

-- ===========================================================================
-- Matriz final de roles y permisos:
-- ===========================================================================
-- | Permiso                                  | ADMIN | Full Access | SUPERVISOR |
-- |------------------------------------------|-------|-------------|------------|
-- | casetilla.flow_report.view               |   ✅   |     ✅       |     ✅      |
-- | casetilla.flow_report.rules.view         |   ✅   |     ✅       |     ✅      |
-- | casetilla.flow_report.rules.manage       |   ✅   |     ✅       |     ❌      |
-- | casetilla.flow_report.incidents.view     |   ✅   |     ✅       |     ✅      |
-- | casetilla.flow_report.incidents.resolve  |   ✅   |     ✅       |     ✅      |
-- | casetilla.flow_report.incidents.override |   ✅   |     ✅       |     ❌      |
-- | casetilla.flow_report.reports.send       |   ✅   |     ✅       |     ✅      |
-- | casetilla.flow_report.schedules.manage   |   ✅   |     ✅       |     ❌      |
-- | casetilla.flow_report.audit.view         |   ✅   |     ✅       |     ✅      |
-- | TOTAL                                    |   9   |      9       |     6      |
-- ===========================================================================

COMMIT;