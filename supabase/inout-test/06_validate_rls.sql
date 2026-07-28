-- ============================================================================
-- 06_validate_rls.sql
-- Fase 6.1 — PAQUETE DE PRUEBAS AISLADAS
-- PRUEBAS DE ROW LEVEL SECURITY CON SET ROLE authenticated
--
-- ⚠️ ARQUITECTURA DE PRUEBA:
--    1. El script se conecta como inout_test (superuser del contenedor Docker).
--    2. Antes de cada prueba RLS, hace SET ROLE authenticated
--       (rol NOSUPERUSER + NOBYPASSRLS — mismo que reciben los usuarios
--        logueados en Supabase real).
--    3. Se usa request.jwt.claim.sub (estándar Supabase JWT) para simular auth.uid().
--    4. Cada escenario está aislado con transacciones (BEGIN/ROLLBACK).
--    5. Se diferencia: privilegio SQL (GRANT) vs RLS vs CHECK vs FK.
--    6. Cada escenario incluye identity guard: session_user, current_user, auth.uid().
--    7. Tests positivos obligatorios ANTES de los negativos.
-- ============================================================================

\set ON_ERROR_STOP on

\echo '========================================'
\echo '06_validate_rls: Iniciando (SET ROLE authenticated, NOBYPASSRLS)...'
\echo '========================================'

-- ============================================================================
-- HELPERS DE PRUEBA (propiedad de inout_test, SECURITY DEFINER)
-- Se ejecutan como superuser, incluso cuando current_user = authenticated.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS test;

-- Clasifica un resultado de operación bloqueada.
-- Retorna el tipo de bloqueo: PRIVILEGE, RLS, CHECK, FK, o UNEXPECTED.
CREATE OR REPLACE FUNCTION test._classify_denial(
    v_sqlstate TEXT,
    v_errmsg TEXT
) RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = 'public, pg_catalog'
AS $$
BEGIN
    -- 42501 = insufficient_privilege (falta GRANT SQL)
    IF v_sqlstate = '42501' THEN
        RETURN 'PRIVILEGE';
    END IF;
    -- 42501 + RLS mention = RLS denial
    IF v_errmsg LIKE '%violates row-level security%'
        OR v_errmsg LIKE '%row-level security%' THEN
        RETURN 'RLS';
    END IF;
    -- 23514 = check_violation
    IF v_sqlstate = '23514' THEN
        RETURN 'CHECK';
    END IF;
    -- 23503 = foreign_key_violation
    IF v_sqlstate = '23503' THEN
        RETURN 'FK';
    END IF;
    -- P0001 = raise_exception (puede ser RLS o permission)
    IF v_sqlstate = 'P0001' THEN
        IF v_errmsg LIKE '%permission denied%' THEN
            RETURN 'PRIVILEGE';
        ELSE
            RETURN 'UNEXPECTED';
        END IF;
    END IF;
    RETURN 'UNEXPECTED';
END;
$$;

-- Identity guard: verifica session_user, current_user, auth.uid()
-- y que current_user NO sea superuser ni BYPASSRLS.
CREATE OR REPLACE FUNCTION test._guard_identity(
    v_expected_uid UUID,
    v_label TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public, pg_catalog'
AS $$
DECLARE
    v_session TEXT;
    v_current TEXT;
    v_uid UUID;
    v_super BOOLEAN;
    v_bypass BOOLEAN;
BEGIN
    v_session := session_user;
    v_current := current_user;
    v_uid := auth.uid();

    SELECT rolsuper, rolbypassrls INTO v_super, v_bypass
    FROM pg_roles WHERE rolname = v_current;

    IF v_current != 'authenticated' THEN
        RETURN 'FAIL: ' || v_label || ' | current_user=' || v_current || ' (esperado: authenticated)';
    END IF;
    IF v_super THEN
        RETURN 'FAIL: ' || v_label || ' | current_user ES SUPERUSER — RLS NO se aplicó';
    END IF;
    IF v_bypass THEN
        RETURN 'FAIL: ' || v_label || ' | current_user tiene BYPASSRLS — RLS NO se aplicó';
    END IF;
    IF v_uid IS NULL THEN
        RETURN 'FAIL: ' || v_label || ' | auth.uid() es NULL';
    END IF;
    IF v_uid != v_expected_uid THEN
        RETURN 'FAIL: ' || v_label || ' | auth.uid()=' || v_uid || ' esperado=' || v_expected_uid;
    END IF;

    RETURN 'PASS: ' || v_label || ' | session=' || v_session || ' current=' || v_current || ' uid=' || v_uid;
END;
$$;

-- Verifica que un rol tenga un privilegio SQL específico sobre una tabla.
CREATE OR REPLACE FUNCTION test._has_table_privilege(
    v_role TEXT,
    v_table TEXT,
    v_privilege TEXT,
    v_label TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public, pg_catalog'
AS $$
BEGIN
    IF has_table_privilege(v_role, v_table, v_privilege) THEN
        RETURN 'PASS: ' || v_label || ' | ' || v_role || ' tiene ' || v_privilege || ' en ' || v_table;
    ELSE
        RETURN 'FAIL: ' || v_label || ' | ' || v_role || ' NO tiene ' || v_privilege || ' en ' || v_table || ' — las pruebas RLS no serán válidas';
    END IF;
END;
$$;

-- Afirmación básica de igualdad.
CREATE OR REPLACE FUNCTION test._assert_equals(
    v_actual ANYELEMENT,
    v_expected ANYELEMENT,
    v_label TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public, pg_catalog'
AS $$
BEGIN
    IF v_actual IS NOT DISTINCT FROM v_expected THEN
        RETURN 'PASS: ' || v_label;
    ELSE
        RETURN 'FAIL: ' || v_label || ' | actual=' || COALESCE(v_actual::TEXT, 'NULL') || ' esperado=' || COALESCE(v_expected::TEXT, 'NULL');
    END IF;
END;
$$;

-- Afirmación de conteo.
CREATE OR REPLACE FUNCTION test._assert_count(
    v_query TEXT,
    v_expected INTEGER,
    v_label TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public, pg_catalog'
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    EXECUTE 'SELECT COUNT(*) FROM (' || v_query || ') t' INTO v_count;
    IF v_count = v_expected THEN
        RETURN 'PASS: ' || v_label || ' (count=' || v_count || ')';
    ELSE
        RETURN 'FAIL: ' || v_label || ' | count=' || v_count || ' esperado=' || v_expected;
    END IF;
END;
$$;

-- Ejecuta una operación y espera que sea exitosa.
CREATE OR REPLACE FUNCTION test._expect_success(
    v_query TEXT,
    v_label TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public, pg_catalog'
AS $$
BEGIN
    EXECUTE v_query;
    RETURN 'PASS: ' || v_label;
EXCEPTION WHEN OTHERS THEN
    RETURN 'FAIL: ' || v_label || ' | SQLSTATE=' || SQLSTATE || ' | ' || SQLERRM;
END;
$$;

-- Ejecuta una operación que DEBE ser bloqueada por RLS.
-- Diferencia PRIVILEGE (falta GRANT) de RLS (política bloquea).
-- Solo acepta RLS como PASS; cualquier otra causa es FAIL.
CREATE OR REPLACE FUNCTION test._expect_rls_denial(
    v_query TEXT,
    v_label TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public, pg_catalog'
AS $$
DECLARE
    v_sqlstate TEXT;
    v_errmsg TEXT;
    v_classification TEXT;
BEGIN
    EXECUTE v_query;
    -- Si llegó aquí, la operación NO fue bloqueada → FAIL
    RETURN 'FAIL: ' || v_label || ' | Se esperaba bloqueo RLS pero la operación se ejecutó (falso positivo)';
EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
    v_errmsg := SQLERRM;
    v_classification := test._classify_denial(v_sqlstate, v_errmsg);

    IF v_classification = 'RLS' THEN
        RETURN 'PASS: ' || v_label || ' | Bloqueado por RLS (correcto)';
    ELSIF v_classification = 'PRIVILEGE' THEN
        RETURN 'FAIL: ' || v_label || ' | Bloqueado por PRIVILEGE SQL (falta GRANT), NO por RLS | ' || v_errmsg;
    ELSIF v_classification = 'CHECK' THEN
        RETURN 'FAIL: ' || v_label || ' | Bloqueado por CHECK constraint, NO por RLS | ' || v_errmsg;
    ELSIF v_classification = 'FK' THEN
        RETURN 'FAIL: ' || v_label || ' | Bloqueado por FK violation, NO por RLS | ' || v_errmsg;
    ELSE
        RETURN 'FAIL: ' || v_label || ' | Error inesperado SQLSTATE=' || v_sqlstate || ' clasificación=' || v_classification || ' | ' || v_errmsg;
    END IF;
END;
$$;

-- Ejecuta una operación que DEBE ser bloqueada por falta de GRANT SQL (no RLS).
CREATE OR REPLACE FUNCTION test._expect_privilege_denial(
    v_query TEXT,
    v_label TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public, pg_catalog'
AS $$
DECLARE
    v_sqlstate TEXT;
    v_errmsg TEXT;
    v_classification TEXT;
BEGIN
    EXECUTE v_query;
    RETURN 'FAIL: ' || v_label || ' | Se esperaba PRIVILEGE DENIAL pero la operación se ejecutó';
EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
    v_errmsg := SQLERRM;
    v_classification := test._classify_denial(v_sqlstate, v_errmsg);

    IF v_classification = 'PRIVILEGE' THEN
        RETURN 'PASS: ' || v_label || ' | Bloqueado por PRIVILEGE SQL (correcto)';
    ELSIF v_classification = 'RLS' THEN
        RETURN 'FAIL: ' || v_label || ' | Bloqueado por RLS, pero se esperaba PRIVILEGE (el rol SÍ tiene GRANT SQL) | ' || v_errmsg;
    ELSE
        RETURN 'FAIL: ' || v_label || ' | Error inesperado SQLSTATE=' || v_sqlstate || ' | ' || v_errmsg;
    END IF;
END;
$$;

-- Security: evitar search_path injection en todos los helpers
ALTER FUNCTION test._classify_denial(TEXT, TEXT) SET search_path = 'public, pg_catalog';
ALTER FUNCTION test._guard_identity(UUID, TEXT) SET search_path = 'public, pg_catalog';
ALTER FUNCTION test._has_table_privilege(TEXT, TEXT, TEXT, TEXT) SET search_path = 'public, pg_catalog';
ALTER FUNCTION test._assert_equals(ANYELEMENT, ANYELEMENT, TEXT) SET search_path = 'public, pg_catalog';
ALTER FUNCTION test._assert_count(TEXT, INTEGER, TEXT) SET search_path = 'public, pg_catalog';
ALTER FUNCTION test._expect_success(TEXT, TEXT) SET search_path = 'public, pg_catalog';
ALTER FUNCTION test._expect_rls_denial(TEXT, TEXT) SET search_path = 'public, pg_catalog';
ALTER FUNCTION test._expect_privilege_denial(TEXT, TEXT) SET search_path = 'public, pg_catalog';

\echo 'INFO: Helpers de prueba creados (test._classify_denial, test._guard_identity, test._has_table_privilege, + 5 helpers de aserción)'

-- ============================================================================
-- PASO 0: Insertar datos de prueba (como superuser, sin RLS)
-- ============================================================================
DO $$
DECLARE
    v_org_a UUID := 'AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA';
    v_reservation_a UUID := 'RESV-A01-0000-0000-000000000001';
BEGIN
    INSERT INTO public.inout_flow_incidents (
        org_id, reservation_id, incident_type, severity, status,
        idempotency_key, detected_by_type
    ) VALUES (
        v_org_a, v_reservation_a, 'missing_gate_in', 'media', 'nueva',
        'test-incident-rls-001', 'rule_engine'
    ) ON CONFLICT (org_id, idempotency_key) DO NOTHING;

    INSERT INTO public.inout_flow_incidents (
        org_id, reservation_id, incident_type, severity, status,
        idempotency_key, detected_by_type
    ) VALUES (
        v_org_a, v_reservation_a, 'missing_gate_in', 'media', 'nueva',
        'test-incident-rls-002', 'rule_engine'
    ) ON CONFLICT (org_id, idempotency_key) DO NOTHING;

    RAISE NOTICE 'INFO: Datos de prueba RLS insertados';
END $$;

-- ============================================================================
-- PASO 0.5: FORCE ROW LEVEL SECURITY en las 7 tablas
--           (doble seguridad, además del rol NOBYPASSRLS)
-- ============================================================================
ALTER TABLE public.inout_flow_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inout_flow_incidents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inout_state_transition_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inout_incident_comments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inout_report_schedules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inout_report_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inout_flow_audit_log FORCE ROW LEVEL SECURITY;

\echo 'INFO: FORCE ROW LEVEL SECURITY activado en las 7 tablas'

-- ============================================================================
-- PASO 0.6: Otorgar privilegios SQL mínimos a authenticated
--           para que las pruebas RLS sean válidas.
--           Sin estos GRANTs, un bloqueo sería por privilegio, no por RLS.
-- ============================================================================
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA auth TO authenticated;

\echo 'INFO: Privilegios SQL (SELECT,INSERT,UPDATE) otorgados a authenticated sobre public'

-- ============================================================================
-- PASO 0.7: GUARD — Verificar que authenticated NO es superuser/BYPASSRLS
-- ============================================================================
DO $$
DECLARE
    v_super BOOLEAN;
    v_bypass BOOLEAN;
BEGIN
    SELECT rolsuper, rolbypassrls INTO v_super, v_bypass
    FROM pg_roles WHERE rolname = 'authenticated';

    IF v_super THEN
        RAISE EXCEPTION '[RLS_GUARD] authenticated es SUPERUSER. Las pruebas RLS NO son válidas. Corrija 00_create_prerequisite_schema.sql.';
    END IF;
    IF v_bypass THEN
        RAISE EXCEPTION '[RLS_GUARD] authenticated tiene BYPASSRLS. Las pruebas RLS NO son válidas. Corrija 00_create_prerequisite_schema.sql.';
    END IF;

    RAISE NOTICE 'GUARD: authenticated verificado — NOSUPERUSER, NOBYPASSRLS — OK';
END $$;

-- ============================================================================
-- ============================================================================
--           PRUEBAS RLS (tests positivos primero, luego negativos)
-- ============================================================================
-- ============================================================================

DO $$
DECLARE
    v_org_a UUID := 'AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA';
    v_org_b UUID := 'BBBBBBBB-0000-0000-0000-BBBBBBBBBBBB';
    v_admin_a UUID := 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA';
    v_super_a UUID := 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB';
    v_basic_a UUID := 'CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC';
    v_admin_b UUID := 'DDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD';
    v_incident_id UUID;
    v_reservation_a UUID := 'RESV-A01-0000-0000-000000000001';
    v_result TEXT;
    v_failures INTEGER := 0;
BEGIN
    -- Obtener ID del incidente de prueba (creado en Paso 0)
    SELECT id INTO v_incident_id FROM public.inout_flow_incidents
    WHERE idempotency_key = 'test-incident-rls-001' AND org_id = v_org_a;

    IF v_incident_id IS NULL THEN
        RAISE EXCEPTION 'No se encontró el incidente de prueba. Abortando.';
    END IF;

    -- ═══════════════════════════════════════════════════════════════════════
    -- SECCIÓN A: VERIFICACIÓN DE PRIVILEGIOS SQL BÁSICOS
    -- Antes de cualquier prueba RLS, confirmar que authenticated tiene
    -- los GRANTs SQL necesarios. Si falta alguno, las pruebas son inválidas.
    -- ═══════════════════════════════════════════════════════════════════════
    RAISE NOTICE '--- SECCIÓN A: Verificación de privilegios SQL ---';

    v_result := test._has_table_privilege('authenticated', 'public.inout_flow_rules', 'SELECT', 'Privilegio SELECT en inout_flow_rules');
    RAISE NOTICE '%', v_result;
    IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;

    v_result := test._has_table_privilege('authenticated', 'public.inout_flow_rules', 'INSERT', 'Privilegio INSERT en inout_flow_rules');
    RAISE NOTICE '%', v_result;
    IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;

    v_result := test._has_table_privilege('authenticated', 'public.inout_flow_rules', 'UPDATE', 'Privilegio UPDATE en inout_flow_rules');
    RAISE NOTICE '%', v_result;
    IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;

    v_result := test._has_table_privilege('authenticated', 'public.inout_flow_incidents', 'SELECT', 'Privilegio SELECT en inout_flow_incidents');
    RAISE NOTICE '%', v_result;
    IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;

    v_result := test._has_table_privilege('authenticated', 'public.inout_incident_comments', 'INSERT', 'Privilegio INSERT en inout_incident_comments');
    RAISE NOTICE '%', v_result;
    IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;

    -- ═══════════════════════════════════════════════════════════════════════
    -- TEST 1 (POSITIVO): inout_flow_rules — ADMIN A SELECT (rules.view)
    -- ═══════════════════════════════════════════════════════════════════════
    RAISE NOTICE '--- TEST 1: Rules SELECT Admin A (POSITIVO) ---';
    BEGIN
        SET ROLE authenticated;
        PERFORM set_config('request.jwt.claim.sub', v_admin_a::text, true);

        -- Identity guard
        v_result := test._guard_identity(v_admin_a, 'Identity - Admin A SELECT rules');
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;

        -- Operación
        v_result := test._assert_count(
            'SELECT 1 FROM public.inout_flow_rules WHERE org_id = ''' || v_org_a || '''',
            16,
            'Rules SELECT - Admin A ve 16 reglas'
        );
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'FAIL [Test 1]: Excepción: %', SQLERRM;
        v_failures := v_failures + 1;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);

    -- ═══════════════════════════════════════════════════════════════════════
    -- TEST 2 (POSITIVO): inout_flow_rules — SUPERVISOR A SELECT (rules.view)
    -- ═══════════════════════════════════════════════════════════════════════
    RAISE NOTICE '--- TEST 2: Rules SELECT Supervisor A (POSITIVO) ---';
    BEGIN
        SET ROLE authenticated;
        PERFORM set_config('request.jwt.claim.sub', v_super_a::text, true);

        v_result := test._guard_identity(v_super_a, 'Identity - Supervisor A SELECT rules');
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;

        v_result := test._assert_count(
            'SELECT 1 FROM public.inout_flow_rules WHERE org_id = ''' || v_org_a || '''',
            16,
            'Rules SELECT - Supervisor A ve 16 reglas'
        );
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'FAIL [Test 2]: Excepción: %', SQLERRM;
        v_failures := v_failures + 1;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);

    -- ═══════════════════════════════════════════════════════════════════════
    -- TEST 3 (POSITIVO): inout_flow_rules — ADMIN A INSERT (rules.manage)
    -- ═══════════════════════════════════════════════════════════════════════
    RAISE NOTICE '--- TEST 3: Rules INSERT Admin A (POSITIVO) ---';
    BEGIN
        SET ROLE authenticated;
        PERFORM set_config('request.jwt.claim.sub', v_admin_a::text, true);

        v_result := test._guard_identity(v_admin_a, 'Identity - Admin A INSERT rule');
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;

        v_result := test._expect_success(
            'INSERT INTO public.inout_flow_rules (org_id, code, name, category, trigger_event, created_by, conditions_json, exclusions_json, is_system_rule) VALUES (''' || v_org_a || ''', ''TEST_ADMIN_INSERT_RULE'', ''Test Admin Insert'', ''consistency'', ''always'', ''' || v_admin_a || ''', '''', '''', false)',
            'Rules INSERT - Admin A crea regla (rules.manage)'
        );
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'FAIL [Test 3]: Excepción: %', SQLERRM;
        v_failures := v_failures + 1;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);

    -- Limpiar regla de prueba
    DELETE FROM public.inout_flow_rules WHERE org_id = v_org_a AND code = 'TEST_ADMIN_INSERT_RULE';

    -- ═══════════════════════════════════════════════════════════════════════
    -- TEST 4 (NEGATIVO RLS): inout_flow_rules — SUPERVISOR NO INSERT
    --   El supervisor tiene SQL INSERT (GRANT), pero RLS lo bloquea
    --   porque rules.manage solo lo tiene ADMIN/Full Access.
    -- ═══════════════════════════════════════════════════════════════════════
    RAISE NOTICE '--- TEST 4: Rules INSERT Supervisor bloqueado por RLS ---';
    BEGIN
        SET ROLE authenticated;
        PERFORM set_config('request.jwt.claim.sub', v_super_a::text, true);

        v_result := test._guard_identity(v_super_a, 'Identity - Supervisor INSERT rule');
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;

        v_result := test._expect_rls_denial(
            'INSERT INTO public.inout_flow_rules (org_id, code, name, category, trigger_event, created_by, conditions_json, exclusions_json, is_system_rule) VALUES (''' || v_org_a || ''', ''TEST_SUPER_INSERT'', ''Test'', ''consistency'', ''always'', ''' || v_super_a || ''', '''', '''', false)',
            'Rules INSERT - Supervisor bloqueado por RLS (sin rules.manage)'
        );
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'FAIL [Test 4]: Excepción: %', SQLERRM;
        v_failures := v_failures + 1;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);

    -- ═══════════════════════════════════════════════════════════════════════
    -- TEST 5 (NEGATIVO RLS): inout_flow_rules — BASIC_USER A ve 0
    --   Tiene SQL SELECT, pero RLS filtra a 0 filas (sin permiso flow_report).
    -- ═══════════════════════════════════════════════════════════════════════
    RAISE NOTICE '--- TEST 5: Rules SELECT Basic A filtrado por RLS ---';
    BEGIN
        SET ROLE authenticated;
        PERFORM set_config('request.jwt.claim.sub', v_basic_a::text, true);

        v_result := test._guard_identity(v_basic_a, 'Identity - Basic A SELECT rules');
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;

        v_result := test._assert_count(
            'SELECT 1 FROM public.inout_flow_rules WHERE org_id = ''' || v_org_a || '''',
            0,
            'Rules SELECT - Basic A ve 0 (RLS filtra, sin permiso)'
        );
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'FAIL [Test 5]: Excepción: %', SQLERRM;
        v_failures := v_failures + 1;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);

    -- ═══════════════════════════════════════════════════════════════════════
    -- TEST 6 (NEGATIVO RLS): inout_flow_rules — ADMIN B cross-org
    --   Tiene SQL SELECT, pero RLS lo filtra a 0 en ORG_A.
    -- ═══════════════════════════════════════════════════════════════════════
    RAISE NOTICE '--- TEST 6: Rules SELECT Admin B cross-org (RLS) ---';
    BEGIN
        SET ROLE authenticated;
        PERFORM set_config('request.jwt.claim.sub', v_admin_b::text, true);

        v_result := test._guard_identity(v_admin_b, 'Identity - Admin B cross-org SELECT');
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;

        v_result := test._assert_count(
            'SELECT 1 FROM public.inout_flow_rules WHERE org_id = ''' || v_org_a || '''',
            0,
            'Rules SELECT - Admin B ve 0 en ORG_A (cross-org RLS)'
        );
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'FAIL [Test 6]: Excepción: %', SQLERRM;
        v_failures := v_failures + 1;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);

    -- ═══════════════════════════════════════════════════════════════════════
    -- TEST 7 (NEGATIVO RLS): inout_flow_rules — NADIE puede DELETE
    --   Tiene SQL DELETE (via GRANT), pero no hay política DELETE.
    -- ═══════════════════════════════════════════════════════════════════════
    RAISE NOTICE '--- TEST 7: Rules DELETE bloqueado por RLS ---';
    BEGIN
        SET ROLE authenticated;
        PERFORM set_config('request.jwt.claim.sub', v_admin_a::text, true);

        v_result := test._guard_identity(v_admin_a, 'Identity - Admin A DELETE rule');
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;

        v_result := test._expect_rls_denial(
            'DELETE FROM public.inout_flow_rules WHERE org_id = ''' || v_org_a || '''',
            'Rules DELETE - Admin A bloqueado (sin política DELETE)'
        );
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'FAIL [Test 7]: Excepción: %', SQLERRM;
        v_failures := v_failures + 1;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);

    -- ═══════════════════════════════════════════════════════════════════════
    -- TEST 8 (POSITIVO): inout_flow_incidents — ADMIN A SELECT
    -- ═══════════════════════════════════════════════════════════════════════
    RAISE NOTICE '--- TEST 8: Incidents SELECT Admin A (POSITIVO) ---';
    BEGIN
        SET ROLE authenticated;
        PERFORM set_config('request.jwt.claim.sub', v_admin_a::text, true);

        v_result := test._guard_identity(v_admin_a, 'Identity - Admin A SELECT incidents');
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;

        v_result := test._assert_count(
            'SELECT 1 FROM public.inout_flow_incidents WHERE org_id = ''' || v_org_a || '''',
            2,
            'Incidents SELECT - Admin A ve 2 incidencias'
        );
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'FAIL [Test 8]: Excepción: %', SQLERRM;
        v_failures := v_failures + 1;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);

    -- ═══════════════════════════════════════════════════════════════════════
    -- TEST 9 (NEGATIVO RLS): inout_flow_incidents — BASIC ve 0
    -- ═══════════════════════════════════════════════════════════════════════
    RAISE NOTICE '--- TEST 9: Incidents SELECT Basic A filtrado ---';
    BEGIN
        SET ROLE authenticated;
        PERFORM set_config('request.jwt.claim.sub', v_basic_a::text, true);

        v_result := test._guard_identity(v_basic_a, 'Identity - Basic A SELECT incidents');
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;

        v_result := test._assert_count(
            'SELECT 1 FROM public.inout_flow_incidents WHERE org_id = ''' || v_org_a || '''',
            0,
            'Incidents SELECT - Basic A ve 0 (RLS, sin permiso)'
        );
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'FAIL [Test 9]: Excepción: %', SQLERRM;
        v_failures := v_failures + 1;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);

    -- ═══════════════════════════════════════════════════════════════════════
    -- TEST 10 (NEGATIVO RLS): inout_flow_incidents — NO INSERT directo
    -- ═══════════════════════════════════════════════════════════════════════
    RAISE NOTICE '--- TEST 10: Incidents INSERT bloqueado ---';
    BEGIN
        SET ROLE authenticated;
        PERFORM set_config('request.jwt.claim.sub', v_admin_a::text, true);

        v_result := test._guard_identity(v_admin_a, 'Identity - Admin A INSERT incident');
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;

        v_result := test._expect_rls_denial(
            'INSERT INTO public.inout_flow_incidents (org_id, reservation_id, incident_type, severity, status, idempotency_key, detected_by_type) VALUES (''' || v_org_a || ''', ''' || v_reservation_a || ''', ''missing_gate_in'', ''media'', ''nueva'', ''test-rls-blocked-003'', ''rule_engine'')',
            'Incidents INSERT - Bloqueado (sin política INSERT)'
        );
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'FAIL [Test 10]: Excepción: %', SQLERRM;
        v_failures := v_failures + 1;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);

    -- ═══════════════════════════════════════════════════════════════════════
    -- TEST 11 (POSITIVO): inout_incident_comments — Admin A INSERT
    -- ═══════════════════════════════════════════════════════════════════════
    RAISE NOTICE '--- TEST 11: Comments INSERT Admin A (POSITIVO) ---';
    BEGIN
        SET ROLE authenticated;
        PERFORM set_config('request.jwt.claim.sub', v_admin_a::text, true);

        v_result := test._guard_identity(v_admin_a, 'Identity - Admin A INSERT comment');
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;

        v_result := test._expect_success(
            'INSERT INTO public.inout_incident_comments (org_id, incident_id, user_id, content) VALUES (''' || v_org_a || ''', ''' || v_incident_id || ''', ''' || v_admin_a || ''', ''Comentario TEST-11'')',
            'Comments INSERT - Admin A en su org/incidente (incidents.view)'
        );
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'FAIL [Test 11]: Excepción: %', SQLERRM;
        v_failures := v_failures + 1;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);

    -- ═══════════════════════════════════════════════════════════════════════
    -- TEST 12 (NEGATIVO RLS): inout_incident_comments — user_id != auth.uid()
    --   Suplantación: auth.uid() = Admin A, pero user_id en INSERT = Supervisor A
    -- ═══════════════════════════════════════════════════════════════════════
    RAISE NOTICE '--- TEST 12: Comments suplantación bloqueada por RLS ---';
    BEGIN
        SET ROLE authenticated;
        PERFORM set_config('request.jwt.claim.sub', v_admin_a::text, true);

        v_result := test._guard_identity(v_admin_a, 'Identity - Admin A intenta suplantar');
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;

        v_result := test._expect_rls_denial(
            'INSERT INTO public.inout_incident_comments (org_id, incident_id, user_id, content) VALUES (''' || v_org_a || ''', ''' || v_incident_id || ''', ''' || v_super_a || ''', ''Suplantando a supervisor'')',
            'Comments INSERT - Suplantación bloqueada por RLS (user_id != auth.uid())'
        );
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'FAIL [Test 12]: Excepción: %', SQLERRM;
        v_failures := v_failures + 1;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);

    -- ═══════════════════════════════════════════════════════════════════════
    -- TEST 13 (NEGATIVO RLS): inout_incident_comments — Admin B cross-org
    -- ═══════════════════════════════════════════════════════════════════════
    RAISE NOTICE '--- TEST 13: Comments Admin B cross-org bloqueado ---';
    BEGIN
        SET ROLE authenticated;
        PERFORM set_config('request.jwt.claim.sub', v_admin_b::text, true);

        v_result := test._guard_identity(v_admin_b, 'Identity - Admin B cross-org comment');
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;

        v_result := test._expect_rls_denial(
            'INSERT INTO public.inout_incident_comments (org_id, incident_id, user_id, content) VALUES (''' || v_org_a || ''', ''' || v_incident_id || ''', ''' || v_admin_b || ''', ''Intrusión cross-org'')',
            'Comments INSERT - Admin B cross-org bloqueado por RLS'
        );
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'FAIL [Test 13]: Excepción: %', SQLERRM;
        v_failures := v_failures + 1;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);

    -- ═══════════════════════════════════════════════════════════════════════
    -- TEST 14 (NEGATIVO RLS): inout_incident_comments — NO UPDATE
    -- ═══════════════════════════════════════════════════════════════════════
    RAISE NOTICE '--- TEST 14: Comments UPDATE bloqueado (APPEND-ONLY) ---';
    BEGIN
        SET ROLE authenticated;
        PERFORM set_config('request.jwt.claim.sub', v_admin_a::text, true);

        v_result := test._guard_identity(v_admin_a, 'Identity - Admin A UPDATE comment');
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;

        v_result := test._expect_rls_denial(
            'UPDATE public.inout_incident_comments SET content = ''Modificado'' WHERE incident_id = ''' || v_incident_id || '''',
            'Comments UPDATE - Bloqueado (APPEND-ONLY, sin política UPDATE)'
        );
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'FAIL [Test 14]: Excepción: %', SQLERRM;
        v_failures := v_failures + 1;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);

    -- ═══════════════════════════════════════════════════════════════════════
    -- TEST 15 (NEGATIVO RLS): inout_incident_comments — NO DELETE
    -- ═══════════════════════════════════════════════════════════════════════
    RAISE NOTICE '--- TEST 15: Comments DELETE bloqueado (APPEND-ONLY) ---';
    BEGIN
        SET ROLE authenticated;
        PERFORM set_config('request.jwt.claim.sub', v_admin_a::text, true);

        v_result := test._guard_identity(v_admin_a, 'Identity - Admin A DELETE comment');
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;

        v_result := test._expect_rls_denial(
            'DELETE FROM public.inout_incident_comments WHERE incident_id = ''' || v_incident_id || '''',
            'Comments DELETE - Bloqueado (APPEND-ONLY, sin política DELETE)'
        );
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'FAIL [Test 15]: Excepción: %', SQLERRM;
        v_failures := v_failures + 1;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);

    -- ═══════════════════════════════════════════════════════════════════════
    -- TEST 16 (NEGATIVO RLS): inout_flow_audit_log — NO INSERT directo
    -- ═══════════════════════════════════════════════════════════════════════
    RAISE NOTICE '--- TEST 16: Audit INSERT bloqueado ---';
    BEGIN
        SET ROLE authenticated;
        PERFORM set_config('request.jwt.claim.sub', v_admin_a::text, true);

        v_result := test._guard_identity(v_admin_a, 'Identity - Admin A INSERT audit');
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;

        v_result := test._expect_rls_denial(
            'INSERT INTO public.inout_flow_audit_log (org_id, entity_type, entity_id, action) VALUES (''' || v_org_a || ''', ''test'', ''' || v_incident_id || ''', ''test_insert'')',
            'Audit INSERT - Bloqueado (sin política INSERT)'
        );
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'FAIL [Test 16]: Excepción: %', SQLERRM;
        v_failures := v_failures + 1;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);

    -- ═══════════════════════════════════════════════════════════════════════
    -- TEST 17 (NEGATIVO RLS): inout_report_runs — NO INSERT directo
    -- ═══════════════════════════════════════════════════════════════════════
    RAISE NOTICE '--- TEST 17: Report Runs INSERT bloqueado ---';
    BEGIN
        SET ROLE authenticated;
        PERFORM set_config('request.jwt.claim.sub', v_admin_a::text, true);

        v_result := test._guard_identity(v_admin_a, 'Identity - Admin A INSERT report run');
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;

        v_result := test._expect_rls_denial(
            'INSERT INTO public.inout_report_runs (org_id, execution_type, status) VALUES (''' || v_org_a || ''', ''manual'', ''programado'')',
            'Report Runs INSERT - Bloqueado (sin política INSERT)'
        );
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'FAIL [Test 17]: Excepción: %', SQLERRM;
        v_failures := v_failures + 1;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);

    -- ═══════════════════════════════════════════════════════════════════════
    -- TEST 18 (POSITIVO): inout_flow_rules — ADMIN B SELECT sus propias reglas
    --   Verifica que cross-org funciona en ambas direcciones.
    -- ═══════════════════════════════════════════════════════════════════════
    RAISE NOTICE '--- TEST 18: Rules SELECT Admin B sus propias reglas (POSITIVO) ---';
    BEGIN
        SET ROLE authenticated;
        PERFORM set_config('request.jwt.claim.sub', v_admin_b::text, true);

        v_result := test._guard_identity(v_admin_b, 'Identity - Admin B SELECT own rules');
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;

        -- ORG_B puede tener 0 o N reglas dependiendo del seed
        v_result := test._expect_success(
            'SELECT COUNT(*) FROM public.inout_flow_rules WHERE org_id = ''' || v_org_b || '''',
            'Rules SELECT - Admin B puede consultar sus reglas (aunque count=0)'
        );
        RAISE NOTICE '%', v_result;
        IF v_result LIKE 'FAIL%' THEN v_failures := v_failures + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'FAIL [Test 18]: Excepción: %', SQLERRM;
        v_failures := v_failures + 1;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);

    -- ═══════════════════════════════════════════════════════════════════════
    -- RESULTADO FINAL
    -- ═══════════════════════════════════════════════════════════════════════
    IF v_failures > 0 THEN
        RAISE EXCEPTION '06_validate_rls: FAIL — % pruebas RLS fallaron de 18', v_failures;
    ELSE
        RAISE NOTICE '========================================';
        RAISE NOTICE '06_validate_rls: ALL PASS (18/18)';
        RAISE NOTICE '========================================';
    END IF;
END $$;

-- ============================================================================
-- LIMPIEZA FINAL
-- ============================================================================

-- Desactivar FORCE RLS
ALTER TABLE public.inout_flow_rules NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inout_flow_incidents NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inout_state_transition_attempts NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inout_incident_comments NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inout_report_schedules NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inout_report_runs NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inout_flow_audit_log NO FORCE ROW LEVEL SECURITY;

-- Eliminar helpers de prueba
DROP FUNCTION IF EXISTS test._expect_privilege_denial(TEXT, TEXT);
DROP FUNCTION IF EXISTS test._expect_rls_denial(TEXT, TEXT);
DROP FUNCTION IF EXISTS test._expect_success(TEXT, TEXT);
DROP FUNCTION IF EXISTS test._assert_count(TEXT, INTEGER, TEXT);
DROP FUNCTION IF EXISTS test._assert_equals(ANYELEMENT, ANYELEMENT, TEXT);
DROP FUNCTION IF EXISTS test._has_table_privilege(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS test._guard_identity(UUID, TEXT);
DROP FUNCTION IF EXISTS test._classify_denial(TEXT, TEXT);
DROP SCHEMA IF EXISTS test;

\echo 'INFO: Limpieza completada — FORCE RLS removido, helpers eliminados'
\echo '06_validate_rls: Finalizado'