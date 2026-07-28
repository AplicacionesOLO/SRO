-- ============================================================================
-- 07_validate_idempotency.sql
-- Fase 6.1 — PAQUETE DE PRUEBAS AISLADAS
-- VALIDACIÓN DE IDEMPOTENCIA
-- ============================================================================

\set ON_ERROR_STOP on

\echo '========================================'
\echo '07_validate_idempotency: Iniciando...'
\echo '========================================'

DO $$
DECLARE
    v_count INTEGER;
    v_failures INTEGER := 0;
    v_org_a UUID := 'AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA';
    v_result JSONB;
BEGIN
    -- ========================================================================
    -- 1. Permisos: ejecutar INSERT...ON CONFLICT DO NOTHING de nuevo
    -- ========================================================================
    INSERT INTO public.permissions (name, description, category)
    VALUES
        ('casetilla.flow_report.view','Ver el modulo de Cumplimiento Logistico','casetilla'),
        ('casetilla.flow_report.rules.view','Ver reglas de flujo IN/OUT','casetilla')
    ON CONFLICT (name) DO NOTHING;

    SELECT COUNT(*) INTO v_count FROM public.permissions
    WHERE name LIKE 'casetilla.flow_report.%';
    IF v_count = 9 THEN
        RAISE NOTICE 'PASS: Permisos siguen siendo 9 tras re-insert (idempotente)';
    ELSE
        RAISE WARNING 'FAIL: % permisos tras re-insert (esperado 9)', v_count;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- 2. Provisioning: tercera ejecucion en ORG_A
    -- ========================================================================
    v_result := public.provision_inout_flow_for_org(v_org_a);
    IF (v_result->>'success')::boolean = true AND (v_result->>'rules_created')::integer = 0 THEN
        RAISE NOTICE 'PASS: Tercera ejecucion de provisioning idempotente (0 creadas, % existentes)',
            v_result->>'rules_existing';
    ELSE
        RAISE WARNING 'FAIL: Tercera ejecucion no fue idempotente: %', v_result;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- 3. Reglas: exactamente 16 en ORG_A
    -- ========================================================================
    SELECT COUNT(*) INTO v_count FROM public.inout_flow_rules WHERE org_id = v_org_a;
    IF v_count = 16 THEN
        RAISE NOTICE 'PASS: Exactamente 16 reglas en ORG_A (sin duplicados)';
    ELSE
        RAISE WARNING 'FAIL: % reglas en ORG_A (esperado 16)', v_count;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- 4. Indices: IF NOT EXISTS es idempotente (ya se probo en 03)
    -- ========================================================================
    SELECT COUNT(*) INTO v_count FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN ('inout_flow_rules','inout_flow_incidents','inout_state_transition_attempts',
          'inout_incident_comments','inout_report_schedules','inout_report_runs','inout_flow_audit_log');
    IF v_count = 29 THEN
        RAISE NOTICE 'PASS: 29 indices (sin duplicados)';
    ELSE
        RAISE WARNING 'FAIL: % indices (esperado 29)', v_count;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- 5. Helpers: CREATE OR REPLACE es idempotente
    -- ========================================================================
    SELECT COUNT(*) INTO v_count FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN ('inout_get_user_org_role','inout_has_permission',
          'inout_generate_idempotency_key','inout_get_max_severity');
    IF v_count = 4 THEN
        RAISE NOTICE 'PASS: 4 helpers (sin duplicados)';
    ELSE
        RAISE WARNING 'FAIL: % helpers (esperado 4)', v_count;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- 6. Role permissions: sin duplicados tras re-asignacion
    -- ========================================================================
    SELECT COUNT(*) INTO v_count
    FROM public.role_permissions rp
    JOIN public.roles r ON rp.role_id = r.id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE r.name = 'ADMIN' AND p.name = 'casetilla.flow_report.view';
    IF v_count = 1 THEN
        RAISE NOTICE 'PASS: Role permissions sin duplicados (ADMIN + flow_report.view = 1)';
    ELSE
        RAISE WARNING 'FAIL: % asignaciones ADMIN+flow_report.view (esperado 1)', v_count;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- 7. Politicas: DROP + CREATE es idempotente
    -- ========================================================================
    SELECT COUNT(*) INTO v_count FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('inout_flow_rules','inout_flow_incidents','inout_state_transition_attempts',
          'inout_incident_comments','inout_report_schedules','inout_report_runs','inout_flow_audit_log');
    IF v_count = 13 THEN
        RAISE NOTICE 'PASS: 13 politicas (sin duplicados)';
    ELSE
        RAISE WARNING 'FAIL: % politicas (esperado 13)', v_count;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- RESULTADO FINAL
    -- ========================================================================
    IF v_failures > 0 THEN
        RAISE EXCEPTION '07_validate_idempotency: FAIL — % validaciones fallaron', v_failures;
    ELSE
        RAISE NOTICE '========================================';
        RAISE NOTICE '07_validate_idempotency: ALL PASS';
        RAISE NOTICE '========================================';
    END IF;
END $$;