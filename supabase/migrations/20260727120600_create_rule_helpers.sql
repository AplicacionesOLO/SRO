-- ============================================================================
-- 007_create_rule_helpers.sql
-- Fase 6.1 — BASE ESTRUCTURAL PASIVA
-- Crea 4 funciones auxiliares de solo lectura para el módulo IN/OUT
--
-- CORRECCIONES APLICADAS (v2.1):
--   ✅ Todas las funciones son SOLO LECTURA (STABLE o IMMUTABLE)
--      → No modifican ningún estado en la base de datos
--   ✅ search_path SEGURO en funciones SECURITY DEFINER:
--      → SET search_path = 'pg_catalog', 'public'
--      → Previene inyección de funciones maliciosas
--   ✅ Sin SQL dinámico inseguro (EXECUTE, format(), etc.)
--   ✅ Sin acceso a datos sensibles fuera del scope de la función
--   ✅ IMMUTABLE para funciones deterministas puras (idempotency_key, max_severity)
--   ✅ STABLE para funciones que leen datos pero no los modifican
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. inout_get_user_org_role
--    Obtiene el nombre del rol del usuario en una organización.
--    SOLO LECTURA, sin modificación de estado.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inout_get_user_org_role(
    p_user_id UUID,
    p_org_id UUID
) RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'pg_catalog', 'public'
AS $$
    SELECT r.name
    FROM public.user_org_roles uor
    JOIN public.roles r ON uor.role_id = r.id
    WHERE uor.user_id = p_user_id
      AND uor.org_id = p_org_id
    LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.inout_get_user_org_role(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inout_get_user_org_role(UUID, UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.inout_get_user_org_role(UUID, UUID) IS
'Obtiene el nombre del rol del usuario en una organización específica.
SOLO LECTURA (STABLE). SECURITY DEFINER con search_path seguro.
Retorna NULL si el usuario no pertenece a la organización.';

-- ---------------------------------------------------------------------------
-- 2. inout_has_permission
--    Verifica si un usuario tiene un permiso específico en una organización.
--    SOLO LECTURA, sin modificación de estado.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inout_has_permission(
    p_user_id UUID,
    p_org_id UUID,
    p_permission_name TEXT
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'pg_catalog', 'public'
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_org_roles uor
        JOIN public.role_permissions rp ON uor.role_id = rp.role_id
        JOIN public.permissions p ON rp.permission_id = p.id
        WHERE uor.user_id = p_user_id
          AND uor.org_id = p_org_id
          AND p.name = p_permission_name
    );
$$;

REVOKE EXECUTE ON FUNCTION public.inout_has_permission(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inout_has_permission(UUID, UUID, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.inout_has_permission(UUID, UUID, TEXT) IS
'Verifica si un usuario tiene un permiso específico en una organización.
SOLO LECTURA (STABLE). SECURITY DEFINER con search_path seguro.
Retorna TRUE/FALSE.';

-- ---------------------------------------------------------------------------
-- 3. inout_generate_idempotency_key
--    Genera una clave de idempotencia determinista para evitar duplicados.
--    PURAMENTE DETERMINISTA, sin acceso a datos.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inout_generate_idempotency_key(
    p_org_id UUID,
    p_rule_code TEXT,
    p_event_reference TEXT
) RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = 'pg_catalog', 'public'
AS $$
    SELECT md5(p_org_id::text || '::' || p_rule_code || '::' || p_event_reference);
$$;

REVOKE EXECUTE ON FUNCTION public.inout_generate_idempotency_key(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inout_generate_idempotency_key(UUID, TEXT, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.inout_generate_idempotency_key(UUID, TEXT, TEXT) IS
'Genera una clave de idempotencia determinista MD5(org_id::rule_code::event_reference).
PURAMENTE DETERMINISTA (IMMUTABLE). Sin SECURITY DEFINER porque no accede a datos.
Usada para evitar duplicados en inout_flow_incidents.';

-- ---------------------------------------------------------------------------
-- 4. inout_get_max_severity
--    Calcula la severidad máxima de un array de severidades.
--    PURAMENTE DETERMINISTA, sin acceso a datos.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inout_get_max_severity(
    p_severities TEXT[]
) RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = 'pg_catalog', 'public'
AS $$
    SELECT CASE
        WHEN 'critica' = ANY(p_severities) THEN 'critica'
        WHEN 'alta' = ANY(p_severities) THEN 'alta'
        WHEN 'media' = ANY(p_severities) THEN 'media'
        WHEN 'baja' = ANY(p_severities) THEN 'baja'
        ELSE 'informativa'
    END;
$$;

REVOKE EXECUTE ON FUNCTION public.inout_get_max_severity(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inout_get_max_severity(TEXT[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.inout_get_max_severity(TEXT[]) IS
'Calcula la severidad máxima de un array. Orden: critica > alta > media > baja > informativa.
PURAMENTE DETERMINISTA (IMMUTABLE). Sin SECURITY DEFINER porque no accede a datos.';

COMMIT;