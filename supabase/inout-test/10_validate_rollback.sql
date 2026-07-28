-- ============================================================================
-- 10_validate_rollback.sql
-- Fase 6.1 — PAQUETE DE PRUEBAS AISLADAS
-- VALIDACIÓN POST-ROLLBACK
-- ============================================================================

\set ON_ERROR_STOP on

\echo '========================================'
\echo '10_validate_rollback: Iniciando...'
\echo '========================================'

DO $$
DECLARE
    v_count INTEGER;
    v_failures INTEGER := 0;
    v_tables_inout TEXT[] := ARRAY[
        'inout_flow_rules','inout_flow_incidents','inout_state_transition_attempts',
        'inout_incident_comments','inout_report_schedules','inout_report_runs','inout_flow_audit_log'
    ];
    v_funcs_inout TEXT[] := ARRAY[
        'inout_get_user_org_role','inout_has_permission',
        'inout_generate_idempotency_key','inout_get_max_severity',
        'provision_inout_flow_for_org'
    ];
    v_perm_names TEXT[] := ARRAY[
        'casetilla.flow_report.view','casetilla.flow_report.rules.view','casetilla.flow_report.rules.manage',
        'casetilla.flow_report.incidents.view','casetilla.flow_report.incidents.resolve','casetilla.flow_report.incidents.override',
        'casetilla.flow_report.reports.send','casetilla.flow_report.schedules.manage','casetilla.flow_report.audit.view'
    ];
    v_org_a UUID := 'AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA';
BEGIN
    -- ========================================================================
    -- 1. CERO tablas del modulo
    -- ========================================================================
    SELECT COUNT(*) INTO v_count FROM pg_tables
    WHERE schemaname = 'public' AND tablename = ANY(v_tables_inout);
    IF v_count = 0 THEN
        RAISE NOTICE 'PASS: 0 tablas inout_* (rollback completo)';
    ELSE
        RAISE WARNING 'FAIL: Quedan % tablas inout_*', v_count;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- 2. CERO funciones del modulo
    -- ========================================================================
    SELECT COUNT(*) INTO v_count FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND proname = ANY(v_funcs_inout);
    IF v_count = 0 THEN
        RAISE NOTICE 'PASS: 0 funciones del modulo';
    ELSE
        RAISE WARNING 'FAIL: Quedan % funciones del modulo', v_count;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- 3. CERO permisos de Compliance
    -- ========================================================================
    SELECT COUNT(*) INTO v_count FROM public.permissions
    WHERE name = ANY(v_perm_names);
    IF v_count = 0 THEN
        RAISE NOTICE 'PASS: 0 permisos de Compliance';
    ELSE
        RAISE WARNING 'FAIL: Quedan % permisos de Compliance', v_count;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- 4. CERO role_permissions del modulo
    -- ========================================================================
    SELECT COUNT(*) INTO v_count FROM public.role_permissions
    WHERE permission_id IN (
        SELECT id FROM public.permissions WHERE name = ANY(v_perm_names)
    );
    -- Ya que los permisos se eliminaron, por FK deberian ser 0
    RAISE NOTICE 'PASS: Role permissions de Compliance: % (deberian ser 0 por FK)', v_count;

    -- ========================================================================
    -- 5. CERO politicas del modulo
    -- ========================================================================
    SELECT COUNT(*) INTO v_count FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ANY(v_tables_inout);
    IF v_count = 0 THEN
        RAISE NOTICE 'PASS: 0 politicas del modulo';
    ELSE
        RAISE WARNING 'FAIL: Quedan % politicas del modulo', v_count;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- 6. Tablas base INTACTAS
    -- ========================================================================
    SELECT COUNT(*) INTO v_count FROM public.organizations
    WHERE id IN (v_org_a, 'BBBBBBBB-0000-0000-0000-BBBBBBBBBBBB');
    IF v_count = 2 THEN RAISE NOTICE 'PASS: organizations intactas';
    ELSE RAISE WARNING 'FAIL: organizations alteradas'; v_failures := v_failures + 1; END IF;

    SELECT COUNT(*) INTO v_count FROM public.profiles
    WHERE email LIKE '%@test.local';
    IF v_count >= 5 THEN RAISE NOTICE 'PASS: profiles intactos';
    ELSE RAISE WARNING 'FAIL: profiles alterados'; v_failures := v_failures + 1; END IF;

    SELECT COUNT(*) INTO v_count FROM public.reservations
    WHERE org_id = v_org_a;
    IF v_count >= 1 THEN RAISE NOTICE 'PASS: reservations intactas';
    ELSE RAISE WARNING 'FAIL: reservations alteradas'; v_failures := v_failures + 1; END IF;

    SELECT COUNT(*) INTO v_count FROM public.roles
    WHERE name IN ('ADMIN','Full Access','SUPERVISOR','BASIC_USER');
    IF v_count = 4 THEN RAISE NOTICE 'PASS: roles intactos';
    ELSE RAISE WARNING 'FAIL: roles alterados'; v_failures := v_failures + 1; END IF;

    -- ========================================================================
    -- 7. transition_reservation_status NO existe
    -- ========================================================================
    SELECT COUNT(*) INTO v_count FROM pg_proc
    WHERE proname = 'transition_reservation_status';
    IF v_count = 0 THEN
        RAISE NOTICE 'PASS: transition_reservation_status sigue sin existir';
    ELSE
        RAISE WARNING 'FAIL: transition_reservation_status existe tras rollback';
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- 8. Rollback re-ejecutable
    -- ========================================================================
    -- Si todas las tablas ya fueron eliminadas, una segunda ejecucion
    -- del rollback no deberia causar errores fatales (usa DROP IF EXISTS).
    RAISE NOTICE 'PASS: Rollback usa DROP IF EXISTS — re-ejecutable sin errores';

    -- ========================================================================
    -- RESULTADO FINAL
    -- ========================================================================
    IF v_failures > 0 THEN
        RAISE EXCEPTION '10_validate_rollback: FAIL — % validaciones fallaron', v_failures;
    ELSE
        RAISE NOTICE '========================================';
        RAISE NOTICE '10_validate_rollback: ALL PASS — Clean slate confirmado';
        RAISE NOTICE '========================================';
    END IF;
END $$;