-- =====================================================
-- MIGRACIÓN: Permisos del módulo Manpower
-- OBJETIVO: Registrar los permisos del módulo Manpower en
--           la matriz de permisos y asignarlos a roles admin.
-- FECHA: 2025
-- =====================================================

-- =====================================================
-- PASO 1: Insertar permisos del módulo Manpower
-- =====================================================
INSERT INTO public.permissions (id, name, description, category, created_at)
VALUES
  (gen_random_uuid(), 'manpower.view', 'Ver módulo Manpower (colaboradores, recursos, reglas, pronóstico)', 'manpower', NOW()),
  (gen_random_uuid(), 'manpower.manage', 'Gestionar módulo Manpower (colaboradores, recursos, reglas, pronóstico)', 'manpower', NOW())
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- PASO 2: Asegurar el permiso de menú Manpower
-- =====================================================
INSERT INTO public.permissions (id, name, description, category, created_at)
VALUES
  (gen_random_uuid(), 'menu.manpower.view', 'Ver opción Manpower en menú', 'menu', NOW())
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- PASO 3: Asignar permisos a roles administrativos
-- =====================================================
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name IN ('ADMIN', 'Full Access')
  AND p.name IN ('manpower.view', 'manpower.manage', 'menu.manpower.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- FIN DEL SCRIPT
-- =====================================================