-- ============================================================================
-- 00_create_prerequisite_schema.sql
-- Fase 6.1 — PAQUETE DE PRUEBAS AISLADAS
-- ESQUEMA MÍNIMO DE PRERREQUISITOS
--
-- ⚠️ ESTE ARCHIVO ES SOLO PARA PRUEBAS LOCALES EN DOCKER.
-- NO ES UNA MIGRACIÓN DE PRODUCCIÓN.
-- NO DEBE EJECUTARSE EN NINGUNA BASE REMOTA.
--
-- Crea:
--   1. Roles PostgreSQL requeridos por los GRANT de las migraciones
--   2. Extensión pgcrypto (gen_random_uuid)
--   3. Esquema auth + auth.uid() simulada (compatible con Supabase)
--   4. 13 tablas base mínimas para satisfacer FKs
--   5. GRANT authenticated TO inout_test para SET ROLE en pruebas RLS
-- ============================================================================

BEGIN;

-- ===========================================================================
-- 0. ROLES POSTGRESQL (REQUERIDOS POR LOS GRANT DE LAS MIGRACIONES)
--    Las migraciones 005 y 007 hacen:
--      GRANT EXECUTE ... TO service_role
--      GRANT EXECUTE ... TO authenticated, service_role
--      REVOKE ... FROM authenticated
--    Si estos roles no existen, las migraciones FALLAN.
--
--    ARQUITECTURA DE PRUEBAS RLS:
--      - inout_test (POSTGRES_USER del contenedor) es superuser.
--      - Las pruebas RLS hacen SET ROLE authenticated, usando
--        el mismo rol que reciben los usuarios logueados en Supabase.
--      - authenticated tiene NOSUPERUSER + NOBYPASSRLS → RLS se aplica SIEMPRE.
--      - NO se crea un rol intermedio (inout_rls_test) porque:
--        a) No existe en Supabase real.
--        b) Requeriría INHERIT + copia de GRANTs, más frágil.
--        c) SET ROLE authenticated replica exactamente el entorno Supabase.
-- ===========================================================================

DO $$
BEGIN
    -- anon: rol público de Supabase, sin privilegios
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
        RAISE NOTICE '[00_prereq] Rol "anon" creado (NOLOGIN, NOBYPASSRLS)';
    ELSE
        RAISE NOTICE '[00_prereq] Rol "anon" ya existe';
    END IF;

    -- authenticated: rol para usuarios logueados en Supabase
    --   NOSUPERUSER + NOBYPASSRLS = RLS se aplica SIEMPRE
    --   Las pruebas RLS hacen SET ROLE authenticated directamente.
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
        RAISE NOTICE '[00_prereq] Rol "authenticated" creado (NOLOGIN, NOBYPASSRLS)';
    ELSE
        RAISE NOTICE '[00_prereq] Rol "authenticated" ya existe';
    END IF;

    -- service_role: rol de backend Supabase, CON bypass (como en Supabase real)
    --   BYPASSRLS = true porque en Supabase service_role omite RLS.
    --   Solo se usa para provisioning y tareas backend, NUNCA para validar RLS.
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
        RAISE NOTICE '[00_prereq] Rol "service_role" creado (NOLOGIN, BYPASSRLS)';
    ELSE
        RAISE NOTICE '[00_prereq] Rol "service_role" ya existe';
    END IF;
END $$;

-- Permitir que el superuser (inout_test) haga SET ROLE authenticated
-- para las pruebas RLS. Un superuser puede SET ROLE a cualquier rol,
-- pero la membresía explícita es más segura y explícita.
GRANT authenticated TO inout_test;

-- Esquema básico para authenticated
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated;

-- ===========================================================================
-- 0.1 EXTENSIÓN pgcrypto (gen_random_uuid, digest, crypt)
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
RAISE NOTICE '[00_prereq] Extension pgcrypto verificada';

-- ===========================================================================
-- 0.2 Esquema auth (simula Supabase)
-- ===========================================================================

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO authenticated, service_role, anon;

-- Tabla auth.users mínima
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

GRANT SELECT ON auth.users TO authenticated, service_role;

-- ===========================================================================
-- 0.3 Función auth.uid() compatible con Supabase
--      Lee el UUID desde request.jwt.claim.sub (estándar Supabase)
--      con fallback a app.current_user_id para compatibilidad.
-- ===========================================================================

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_sub TEXT;
    v_fallback TEXT;
BEGIN
    -- Método 1: request.jwt.claim.sub (como lo hace Supabase)
    BEGIN
        v_sub := NULLIF(current_setting('request.jwt.claim.sub', true), '');
        IF v_sub IS NOT NULL THEN
            RETURN v_sub::UUID;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Si no existe la variable, seguir con fallback
    END;

    -- Método 2: app.current_user_id (fallback para pruebas)
    BEGIN
        v_fallback := NULLIF(current_setting('app.current_user_id', true), '');
        IF v_fallback IS NOT NULL THEN
            RETURN v_fallback::UUID;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Si no existe ninguna variable, retornar NULL
    END;

    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION auth.uid() IS
'Simula auth.uid() de Supabase para pruebas locales.
Prioridad: request.jwt.claim.sub → app.current_user_id.
SET search_path = '''' para seguridad (previene search_path injection).';

-- ===========================================================================
-- 0.4 Función auth.role() auxiliar
-- ===========================================================================

CREATE OR REPLACE FUNCTION auth.role()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN NULLIF(current_setting('request.jwt.claim.role', true), '');
EXCEPTION WHEN OTHERS THEN
    RETURN 'authenticated';
END;
$$;

-- ===========================================================================
-- 0.5 Verificación de roles
-- ===========================================================================

DO $$
DECLARE
    v_r RECORD;
    v_fail BOOLEAN := false;
BEGIN
    FOR v_r IN
        SELECT rolname, rolsuper, rolbypassrls
        FROM pg_roles
        WHERE rolname IN ('anon', 'authenticated', 'service_role')
    LOOP
        RAISE NOTICE '[00_prereq] Rol: % | super=% | bypassrls=%',
            v_r.rolname, v_r.rolsuper, v_r.rolbypassrls;

        -- authenticated NUNCA debe ser superuser ni BYPASSRLS
        IF v_r.rolname = 'authenticated' THEN
            IF v_r.rolsuper THEN
                RAISE WARNING '[00_prereq] ⚠️ authenticated es superuser — RLS NO se aplicará';
                v_fail := true;
            END IF;
            IF v_r.rolbypassrls THEN
                RAISE WARNING '[00_prereq] ⚠️ authenticated tiene BYPASSRLS — RLS NO se aplicará';
                v_fail := true;
            END IF;
        END IF;
    END LOOP;

    IF v_fail THEN
        RAISE EXCEPTION '[00_prereq] authenticated tiene privilegios que bypassean RLS. Corrija la definición del rol.';
    END IF;
END $$;

-- ===========================================================================
-- 1. countries
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.countries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ===========================================================================
-- 2. organizations
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ===========================================================================
-- 3. profiles
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    name TEXT,
    email TEXT,
    country_id UUID REFERENCES public.countries(id),
    phone_e164 TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ===========================================================================
-- 4. roles
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ===========================================================================
-- 5. permissions
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    category TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ===========================================================================
-- 6. role_permissions
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES public.roles(id),
    permission_id UUID NOT NULL REFERENCES public.permissions(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (role_id, permission_id)
);

-- ===========================================================================
-- 7. user_org_roles
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.user_org_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    org_id UUID NOT NULL REFERENCES public.organizations(id),
    role_id UUID NOT NULL REFERENCES public.roles(id),
    assigned_by UUID,
    assigned_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, org_id)
);

-- ===========================================================================
-- 8. warehouses
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id),
    name TEXT NOT NULL,
    location TEXT,
    country_id UUID REFERENCES public.countries(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    business_start_time TIME NOT NULL DEFAULT '06:00:00',
    business_end_time TIME NOT NULL DEFAULT '17:00:00',
    slot_interval_minutes INTEGER NOT NULL DEFAULT 60,
    timezone TEXT NOT NULL DEFAULT 'America/Costa_Rica',
    no_show_tolerance_minutes INTEGER
);

-- ===========================================================================
-- 9. clients
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id),
    name TEXT NOT NULL,
    legal_id TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ===========================================================================
-- 10. docks
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.docks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL
);

-- ===========================================================================
-- 11. reservation_statuses
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.reservation_statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT,
    order_index INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (org_id, code)
);

-- ===========================================================================
-- 12. reservations
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id),
    dock_id UUID NOT NULL REFERENCES public.docks(id),
    start_datetime TIMESTAMPTZ NOT NULL,
    end_datetime TIMESTAMPTZ NOT NULL,
    dua TEXT,
    invoice TEXT,
    driver TEXT,
    status_id UUID REFERENCES public.reservation_statuses(id),
    notes TEXT,
    transport_type TEXT,
    cargo_type TEXT,
    is_cancelled BOOLEAN DEFAULT false,
    cancel_reason TEXT,
    cancelled_by UUID,
    cancelled_at TIMESTAMPTZ,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_by UUID,
    updated_at TIMESTAMPTZ DEFAULT now(),
    purchase_order TEXT,
    truck_plate TEXT,
    order_request_number TEXT,
    shipper_provider TEXT,
    recurrence JSONB,
    client_id UUID REFERENCES public.clients(id),
    operation_type TEXT,
    is_imported BOOLEAN DEFAULT false,
    bl_number TEXT,
    quantity_value INTEGER,
    qr_image_url TEXT,
    qr_payload JSONB,
    qr_card_image_url TEXT,
    is_consolidated BOOLEAN NOT NULL DEFAULT false
);

COMMENT ON TABLE public.reservations IS
'Stub mínimo para pruebas de migración Fase 6.1.';

-- ===========================================================================
-- 13. activity_log
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id),
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    action TEXT NOT NULL,
    field TEXT,
    old_value TEXT,
    new_value TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    actor_user_id UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===========================================================================
-- Verificación final del esquema base
-- ===========================================================================

DO $$
DECLARE
    v_expected TEXT[] := ARRAY[
        'organizations','countries','profiles','roles','permissions',
        'role_permissions','user_org_roles','warehouses','clients',
        'docks','reservation_statuses','reservations','activity_log'
    ];
    v_tab TEXT;
    v_missing TEXT[] := '';
    v_count INTEGER;
BEGIN
    FOREACH v_tab IN ARRAY v_expected LOOP
        SELECT COUNT(*) INTO v_count FROM pg_tables
        WHERE schemaname = 'public' AND tablename = v_tab;
        IF v_count = 0 THEN
            v_missing := array_append(v_missing, v_tab);
        END IF;
    END LOOP;

    IF array_length(v_missing, 1) > 0 THEN
        RAISE EXCEPTION '[00_prereq] Tablas base faltantes: %', array_to_string(v_missing, ', ');
    END IF;

    RAISE NOTICE '[00_prereq] Esquema base creado: 13 tablas + auth schema + roles PostgreSQL listos.';
    RAISE NOTICE '[00_prereq] RLS: authenticated (NOBYPASSRLS) listo para SET ROLE en 06_validate_rls.';
END $$;

COMMIT;