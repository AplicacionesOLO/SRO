-- =====================================================
-- Migración: Asignar permisos de menú y correspondencia
-- a roles ADMIN y Full Access
-- =====================================================
-- Fecha: 2025
-- Descripción: Asigna automáticamente todos los permisos
-- de categoría 'menu' y los permisos de tabs de 
-- correspondencia a los roles administrativos principales
-- =====================================================

-- Asignar todos los permisos de menú (menu.*) a ADMIN y Full Access
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
    r.id as role_id,
    p.id as permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('ADMIN', 'Full Access')
  AND p.category = 'menu'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Asignar permisos de tabs de correspondencia a ADMIN y Full Access
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
    r.id as role_id,
    p.id as permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('ADMIN', 'Full Access')
  AND p.name IN (
    'correspondence.gmail_account.view',
    'correspondence.rules.view',
    'correspondence.logs.view'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Verificación: Contar permisos asignados
DO $$
DECLARE
    admin_count INTEGER;
    full_access_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO admin_count
    FROM role_permissions rp
    JOIN roles r ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE r.name = 'ADMIN' 
      AND (p.category = 'menu' OR p.name LIKE 'correspondence.%.view');
    
    SELECT COUNT(*) INTO full_access_count
    FROM role_permissions rp
    JOIN roles r ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE r.name = 'Full Access' 
      AND (p.category = 'menu' OR p.name LIKE 'correspondence.%.view');
    
    RAISE NOTICE 'Permisos asignados a ADMIN: %', admin_count;
    RAISE NOTICE 'Permisos asignados a Full Access: %', full_access_count;
END $$;
