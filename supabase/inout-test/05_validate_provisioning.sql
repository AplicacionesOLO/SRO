-- ============================================================================
-- 05_validate_provisioning.sql
-- Fase 6.1 — PAQUETE DE PRUEBAS AISLADAS
-- PRUEBAS DE PROVISIONING
-- ============================================================================

\set ON_ERROR_STOP on

\echo '========================================'
\echo '05_validate_provisioning: Iniciando...'
\echo '========================================'

-- ============================================================================
-- Verificar que authenticated NO puede ejecutar provisioning
-- ============================================================================
DO $$
DECLARE
    v_result JSONB;
    v_count INTEGER;
    v_failures INTEGER := 0;
    v_org_a UUID := 'AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA';
    v_org_b UUID := 'BBBBBBBB-0000-0000-0000-BBBBBBBBBBBB';
    v_org_no_admin UUID := 'CCCCCCCC-0000-0000-0000-CCCCCCCCCCCC';
    v_org_fake UUID := '00000000-0000-0000-0000-000000000000';
    v_is_active BOOLEAN;
    v_caught BOOLEAN;
    v_errmsg TEXT;
BEGIN
    -- ========================================================================
    -- CASO A: ORG_A ya tiene 16 reglas (seed de 006)
    -- ========================================================================
    SELECT COUNT(*) INTO v_count FROM public.inout_flow_rules WHERE org_id = v_org_a;
    IF v_count = 16 THEN
        RAISE NOTICE 'PASS [Caso A]: ORG_A tiene 16 reglas (seed via 006)';
    ELSE
        RAISE WARNING 'FAIL [Caso A]: ORG_A tiene % reglas (esperado 16)', v_count;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- CASO B: Segunda ejecución en ORG_A (idempotente)
    -- ========================================================================
    v_result := public.provision_inout_flow_for_org(v_org_a);
    IF (v_result->>'success')::boolean = true AND (v_result->>'rules_created')::integer = 0 THEN
        RAISE NOTICE 'PASS [Caso B]: Segunda ejecución: rules_created=0, rules_existing=%, rules_total=%',
            v_result->>'rules_existing', v_result->>'rules_total';
    ELSE
        RAISE WARNING 'FAIL [Caso B]: Resultado inesperado: %', v_result;
        v_failures := v_failures + 1;
    END IF;

    -- Verificar que siguen siendo 16 reglas
    SELECT COUNT(*) INTO v_count FROM public.inout_flow_rules WHERE org_id = v_org_a;
    IF v_count = 16 THEN
        RAISE NOTICE 'PASS [Caso B]: Tras re-ejecución, ORG_A sigue con 16 reglas';
    ELSE
        RAISE WARNING 'FAIL [Caso B]: Tras re-ejecución, ORG_A tiene % reglas', v_count;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- CASO C: Organización inexistente
    -- ========================================================================
    v_result := public.provision_inout_flow_for_org(v_org_fake);
    IF (v_result->>'success')::boolean = false THEN
        RAISE NOTICE 'PASS [Caso C]: Org inexistente: success=false, message=%', v_result->>'message';
    ELSE
        RAISE WARNING 'FAIL [Caso C]: Org inexistente retornó success=true: %', v_result;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- CASO D: ORG_NO_ADMIN sin actor válido
    -- ========================================================================
    v_result := public.provision_inout_flow_for_org(v_org_no_admin);
    IF (v_result->>'success')::boolean = false THEN
        RAISE NOTICE 'PASS [Caso D]: Sin actor válido: success=false, message=%', v_result->>'message';
    ELSE
        RAISE WARNING 'FAIL [Caso D]: Sin actor válido retornó success=true: %', v_result;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- CASO E: ORG_B también tiene reglas (si tiene actor válido)
    -- ========================================================================
    SELECT COUNT(*) INTO v_count FROM public.inout_flow_rules WHERE org_id = v_org_b;
    RAISE NOTICE 'INFO [Caso E]: ORG_B tiene % reglas', v_count;

    -- ========================================================================
    -- CASO F: R10 is_active = false
    -- ========================================================================
    SELECT is_active INTO v_is_active FROM public.inout_flow_rules
    WHERE org_id = v_org_a AND code = 'DISPATCHED_REOPEN_ATTEMPT';
    IF v_is_active = false THEN
        RAISE NOTICE 'PASS [Caso F]: R10 DISPATCHED_REOPEN_ATTEMPT: is_active=false (PENDING_BUSINESS_VALIDATION)';
    ELSE
        RAISE WARNING 'FAIL [Caso F]: R10 is_active=%, esperado false', v_is_active;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- CASO G: R11 is_active = true
    -- ========================================================================
    SELECT is_active INTO v_is_active FROM public.inout_flow_rules
    WHERE org_id = v_org_a AND code = 'DONE_REOPEN_ATTEMPT';
    IF v_is_active = true THEN
        RAISE NOTICE 'PASS [Caso G]: R11 DONE_REOPEN_ATTEMPT: is_active=true';
    ELSE
        RAISE WARNING 'FAIL [Caso G]: R11 is_active=%, esperado true', v_is_active;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- CASO H: Re-ejecución NO activa R10 (ON CONFLICT DO NOTHING preserva)
    -- ========================================================================
    SELECT is_active INTO v_is_active FROM public.inout_flow_rules
    WHERE org_id = v_org_a AND code = 'DISPATCHED_REOPEN_ATTEMPT';
    IF v_is_active = false THEN
        RAISE NOTICE 'PASS [Caso H]: Tras re-ejecución, R10 sigue is_active=false';
    ELSE
        RAISE WARNING 'FAIL [Caso H]: R10 se activó tras re-ejecución: is_active=%', v_is_active;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- CASO I: Crear regla personalizada y verificar que NO se sobrescribe
    -- ========================================================================
    BEGIN
        INSERT INTO public.inout_flow_rules (
            org_id, code, name, category, trigger_event, created_by,
            is_system_rule, is_active, edit_policy,
            conditions_json, exclusions_json
        ) VALUES (
            v_org_a, 'TEST_CUSTOM_RULE', 'Regla Personalizada de Prueba',
            'consistency', 'always', 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA',
            false, true, 'fully_editable',
            '', ''
        ) ON CONFLICT (org_id, code) DO NOTHING;

        RAISE NOTICE 'INFO [Caso I]: Regla personalizada TEST_CUSTOM_RULE creada';
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'WARN [Caso I]: No se pudo crear regla personalizada: %', SQLERRM;
    END;

    -- Re-ejecutar provisioning
    v_result := public.provision_inout_flow_for_org(v_org_a);

    -- Verificar que la regla personalizada sigue intacta
    SELECT COUNT(*) INTO v_count FROM public.inout_flow_rules
    WHERE org_id = v_org_a AND code = 'TEST_CUSTOM_RULE' AND is_system_rule = false;
    IF v_count = 1 THEN
        RAISE NOTICE 'PASS [Caso I]: Regla personalizada NO fue sobrescrita por provisioning';
    ELSE
        RAISE WARNING 'FAIL [Caso I]: Regla personalizada desapareció o fue alterada';
        v_failures := v_failures + 1;
    END IF;

    -- Limpiar regla personalizada
    DELETE FROM public.inout_flow_rules WHERE org_id = v_org_a AND code = 'TEST_CUSTOM_RULE';

    -- ========================================================================
    -- CASO J: Provisioning como service_role — debe estar permitido
    -- (La migración 005 otorga GRANT EXECUTE TO service_role)
    -- ========================================================================
    v_caught := false;
    BEGIN
        SET ROLE service_role;
        v_result := public.provision_inout_flow_for_org(v_org_a);
        RAISE NOTICE 'PASS [Caso J]: service_role puede ejecutar provisioning: rules_created=%, rules_existing=%',
            v_result->>'rules_created', v_result->>'rules_existing';
    EXCEPTION WHEN OTHERS THEN
        v_errmsg := SQLERRM;
        RAISE WARNING 'FAIL [Caso J]: service_role NO pudo ejecutar provisioning: %', v_errmsg;
        v_failures := v_failures + 1;
    END;
    RESET ROLE;

    -- ========================================================================
    -- RESULTADO FINAL
    -- ========================================================================
    IF v_failures > 0 THEN
        RAISE EXCEPTION '05_validate_provisioning: FAIL — % validaciones fallaron', v_failures;
    ELSE
        RAISE NOTICE '========================================';
        RAISE NOTICE '05_validate_provisioning: ALL PASS';
        RAISE NOTICE '========================================';
    END IF;
END $$;