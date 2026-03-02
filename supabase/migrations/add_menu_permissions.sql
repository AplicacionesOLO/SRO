-- =====================================================
-- SCRIPT: Agregar permisos de menú y tabs de correspondencia
-- OBJETIVO: Crear permisos granulares para control de UI
-- FECHA: 2024
-- =====================================================

-- =====================================================
-- PASO 1: Insertar permisos de menú principal
-- =====================================================
INSERT INTO public.permissions (id, name, description, category, created_at)
VALUES
  (gen_random_uuid(), 'menu.dashboard.view', 'Ver opción Dashboard en menú', 'menu', NOW()),
  (gen_random_uuid(), 'menu.calendario.view', 'Ver opción Calendario en menú', 'menu', NOW()),
  (gen_random_uuid(), 'menu.reservas.view', 'Ver opción Reservas en menú', 'menu', NOW()),
  (gen_random_uuid(), 'menu.andenes.view', 'Ver opción Andenes en menú', 'menu', NOW()),
  (gen_random_uuid(), 'menu.manpower.view', 'Ver opción Manpower en menú', 'menu', NOW()),
  (gen_random_uuid(), 'menu.casetilla.view', 'Ver opción Punto Control IN/OUT en menú', 'menu', NOW())
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- PASO 2: Insertar permisos de submenú Administración
-- =====================================================
INSERT INTO public.permissions (id, name, description, category, created_at)
VALUES
  (gen_random_uuid(), 'menu.admin.view', 'Ver menú Administración (padre)', 'menu', NOW()),
  (gen_random_uuid(), 'menu.admin.usuarios.view', 'Ver opción Usuarios en menú', 'menu', NOW()),
  (gen_random_uuid(), 'menu.admin.roles.view', 'Ver opción Roles en menú', 'menu', NOW()),
  (gen_random_uuid(), 'menu.admin.matriz_permisos.view', 'Ver opción Matriz de Permisos en menú', 'menu', NOW()),
  (gen_random_uuid(), 'menu.admin.catalogos.view', 'Ver opción Catálogos en menú', 'menu', NOW()),
  (gen_random_uuid(), 'menu.admin.almacenes.view', 'Ver opción Almacenes en menú', 'menu', NOW()),
  (gen_random_uuid(), 'menu.admin.correspondencia.view', 'Ver opción Correspondencia en menú', 'menu', NOW())
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- PASO 3: Insertar permisos de tabs de Correspondencia
-- =====================================================
INSERT INTO public.permissions (id, name, description, category, created_at)
VALUES
  (gen_random_uuid(), 'correspondence.gmail_account.view', 'Ver tab Cuenta Gmail en Correspondencia', 'correspondence', NOW()),
  (gen_random_uuid(), 'correspondence.rules.view', 'Ver tab Reglas de Correspondencia', 'correspondence', NOW()),
  (gen_random_uuid(), 'correspondence.logs.view', 'Ver tab Bitácora de Envíos', 'correspondence', NOW())
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- PASO 4: Asignar permisos al rol "Casetilla" (EJEMPLO)
-- Solo se ejecuta si existe el rol con name='Casetilla'
-- =====================================================

-- Verificar si existe el rol Casetilla
DO $$
DECLARE
  v_role_id UUID;
BEGIN
  -- Buscar el rol Casetilla
  SELECT id INTO v_role_id
  FROM public.roles
  WHERE name = 'Casetilla'
  LIMIT 1;

  -- Si existe, asignar permisos
  IF v_role_id IS NOT NULL THEN
    
    -- Permisos de menú para Casetilla
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_id, p.id
    FROM public.permissions p
    WHERE p.name IN (
      'menu.casetilla.view',
      'menu.admin.view',
      'menu.admin.correspondencia.view'
    )
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Permisos de tabs de Correspondencia para Casetilla
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_id, p.id
    FROM public.permissions p
    WHERE p.name IN (
      'correspondence.gmail_account.view',
      'correspondence.rules.view'
      -- NO incluir 'correspondence.logs.view' para Casetilla
    )
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    RAISE NOTICE 'Permisos asignados al rol Casetilla correctamente';
  ELSE
    RAISE NOTICE 'Rol Casetilla no encontrado, no se asignaron permisos';
  END IF;
END $$;

-- =====================================================
-- PASO 5: Asignar permisos completos a roles administrativos
-- (ADMIN, Full Access, etc.)
-- =====================================================

DO $$
DECLARE
  v_role_id UUID;
  v_role_name TEXT;
BEGIN
  -- Iterar sobre roles administrativos
  FOR v_role_id, v_role_name IN 
    SELECT id, name 
    FROM public.roles 
    WHERE name IN ('ADMIN', 'Full Access', 'Administrador')
  LOOP
    -- Asignar TODOS los permisos de menú y correspondencia
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_id, p.id
    FROM public.permissions p
    WHERE p.category IN ('menu', 'correspondence')
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    RAISE NOTICE 'Permisos completos asignados al rol: %', v_role_name;
  END LOOP;
END $$;

-- =====================================================
-- FIN DEL SCRIPT
-- =====================================================
