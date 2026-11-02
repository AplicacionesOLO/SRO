-- =====================================================
-- MIGRACIÓN: Permisos del módulo Proceso 3D
-- OBJETIVO: Registrar los permisos de la simulación 3D del
--           almacén y asignarlos SOLO al rol Full Access.
--           (El código también exige el rol: src/pages/proceso3d/access.ts)
-- =====================================================

INSERT INTO public.permissions (id, name, description, category, created_at)
VALUES
  (gen_random_uuid(), 'proceso3d.view', 'Ver simulación 3D del almacén (Proceso 3D)', 'proceso3d', NOW()),
  (gen_random_uuid(), 'menu.proceso3d.view', 'Ver opción Proceso 3D en menú', 'menu', NOW())
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Full Access'
  AND p.name IN ('proceso3d.view', 'menu.proceso3d.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;
