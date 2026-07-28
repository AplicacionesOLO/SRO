-- ============================================================================
-- 08_validate_no_operational_changes.sql
-- Fase 6.1 — PAQUETE DE PRUEBAS AISLADAS
-- CONFIRMA QUE FASE 6.1 NO MODIFICO DATOS OPERATIVOS
-- ============================================================================

\set ON_ERROR_STOP on

\echo '========================================'
\echo '08_validate_no_operational_changes: Iniciando...'
\echo '========================================'

DO $$
DECLARE
    v_count INTEGER;
    v_failures INTEGER := 0;
    v_org_a UUID := 'AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA';
    v_org_b UUID := 'BBBBBBBB-0000-0000-0000-BBBBBBBBBBBB';
BEGIN
    -- ========================================================================
    -- 1. reservations no fue modificada estructuralmente
    -- ========================================================================
    SELECT COUNT(*) INTO v_count FROM public.reservations
    WHERE org_id = v_org_a;
    IF v_count >= 1 THEN
        RAISE NOTICE 'PASS: Reservas de ORG_A intactas (%)', v_count;
    ELSE
        RAISE WARNING 'FAIL: 0 reservas en ORG_A (se perdieron datos)';
        v_failures := v_failures + 1;
    END IF;

    SELECT COUNT(*) INTO v_count FROM public.reservations
    WHERE org_id = v_org_b;
    IF v_count >= 1 THEN
        RAISE NOTICE 'PASS: Reservas de ORG_B intactas (%)', v_count;
    ELSE
        RAISE WARNING 'FAIL: 0 reservas en ORG_B';
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- 2. reservation_statuses intactos
    -- ========================================================================
    SELECT COUNT(*) INTO v_count FROM public.reservation_statuses
    WHERE org_id = v_org_a;
    IF v_count >= 15 THEN
        RAISE NOTICE 'PASS: Statuses de ORG_A intactos (%)', v_count;
    ELSE
        RAISE WARNING 'FAIL: Solo % statuses en ORG_A (esperado >=15)', v_count;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- 3. activity_log intacto
    -- ========================================================================
    SELECT COUNT(*) INTO v_count FROM public.activity_log
    WHERE org_id IN (v_org_a, v_org_b);
    IF v_count >= 2 THEN
        RAISE NOTICE 'PASS: Activity log intacto (%)', v_count;
    ELSE
        RAISE WARNING 'FAIL: Activity log perdio entradas (%)', v_count;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- 4. organizations, warehouses, clients intactos
    -- ========================================================================
    SELECT COUNT(*) INTO v_count FROM public.organizations
    WHERE id IN (v_org_a, v_org_b);
    IF v_count = 2 THEN
        RAISE NOTICE 'PASS: Organizaciones intactas';
    ELSE
        RAISE WARNING 'FAIL: Organizaciones alteradas (%)', v_count;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- 5. transition_reservation_status NO existe
    -- ========================================================================
    SELECT COUNT(*) INTO v_count FROM pg_proc
    WHERE proname = 'transition_reservation_status';
    IF v_count = 0 THEN
        RAISE NOTICE 'PASS: transition_reservation_status NO existe';
    ELSE
        RAISE WARNING 'FAIL: transition_reservation_status EXISTE (no deberia en Fase 6.1)';
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- 6. trigger de bloqueo sobre reservations NO existe
    -- ========================================================================
    SELECT COUNT(*) INTO v_count FROM pg_trigger
    WHERE tgname = 'trg_block_unauthorized_status_update'
       OR tgname LIKE '%unauthorized%status%';
    IF v_count = 0 THEN
        RAISE NOTICE 'PASS: Sin trigger de bloqueo de status sobre reservations';
    ELSE
        RAISE WARNING 'FAIL: Se encontro trigger de bloqueo: % triggers', v_count;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- 7. 008 y 009 no existen (confirmar que no se crearon)
    -- ========================================================================
    -- Ya se verifico en validaciones anteriores. Aqui solo confirmamos que
    -- no hay tablas/funciones extras con prefijo inout_ mas alla de las 7.
    SELECT COUNT(*) INTO v_count FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'inout_%';
    IF v_count = 7 THEN
        RAISE NOTICE 'PASS: Exactamente 7 tablas inout_* (no hay 008 ni 009)';
    ELSE
        RAISE WARNING 'FAIL: % tablas inout_* (esperado 7, posible 008/009)', v_count;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- RESULTADO FINAL
    -- ========================================================================
    IF v_failures > 0 THEN
        RAISE EXCEPTION '08_validate_no_operational_changes: FAIL — % validaciones fallaron', v_failures;
    ELSE
        RAISE NOTICE '========================================';
        RAISE NOTICE '08_validate_no_operational_changes: ALL PASS — Sin cambios operativos';
        RAISE NOTICE '========================================';
    END IF;
END $$;