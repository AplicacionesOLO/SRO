-- =====================================================
-- MIGRACIÓN: Permiso "Personal en sitio (BIT2)" de Proceso 3D
-- OBJETIVO: Ver en el 3D la lista de personal marcado en el reloj
--           (activos y que ya salieron, por gerente / coordinador /
--           colaborador). Inicialmente SOLO el rol Full Access.
-- =====================================================

INSERT INTO public.permissions (id, name, description, category, created_at)
VALUES
  (gen_random_uuid(), 'proceso3d.personal.view', 'Ver personal en sitio del reloj marcador (BIT2) en Proceso 3D', 'proceso3d', NOW())
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Full Access'
  AND p.name = 'proceso3d.personal.view'
ON CONFLICT (role_id, permission_id) DO NOTHING;
