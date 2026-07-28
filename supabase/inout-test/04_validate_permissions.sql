-- ============================================================================
-- 04_validate_permissions.sql
-- Fase 6.1 — PAQUETE DE PRUEBAS AISLADAS
-- VALIDACIÓN DE PERMISOS Y ASIGNACIONES
-- ============================================================================

\set ON_ERROR_STOP on

\echo '========================================'
\echo '04_validate_permissions: Iniciando...'
\echo '========================================'

DO $$
DECLARE
    v_count INTEGER;
    v_failures INTEGER := 0;
    v_r RECORD;
    v_perm_name TEXT;
    v_expected_9 TEXT[] := ARRAY[
        'casetilla.flow_report.view','casetilla.flow_report.rules.view','casetilla.flow_report.rules.manage',
        'casetilla.flow_report.incidents.view','casetilla.flow_report.incidents.resolve','casetilla.flow_report.incidents.override',
        'casetilla.flow_report.reports.send','casetilla.flow_report.schedules.manage','casetilla.flow_report.audit.view'
    ];
    v_expected_6 TEXT[] := ARRAY[
        'casetilla.flow_report.view','casetilla.flow_report.rules.view',
        'casetilla.flow_report.incidents.view','casetilla.flow_report.incidents.resolve',
        'casetilla.flow_report.reports.send','casetilla.flow_report.audit.view'
    ];
    v_supervisor_forbidden TEXT[] := ARRAY[
        'casetilla.flow_report.rules.manage','casetilla.flow_report.incidents.override','casetilla.flow_report.schedules.manage'
    ];
BEGIN
    -- ========================================================================
    -- 1. PERMISOS: 9 exactos
    -- ========================================================================
    SELECT COUNT(*) INTO v_count FROM public.permissions
    WHERE name LIKE 'casetilla.flow_report.%';
    IF v_count = 9 THEN
        RAISE NOTICE 'PASS: 9 permisos de Compliance creados';
    ELSE
        RAISE WARNING 'FAIL: % permisos (esperado 9)', v_count;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- 2. ADMIN: 9 permisos
    -- ========================================================================
    SELECT COUNT(*) INTO v_count
    FROM public.role_permissions rp
    JOIN public.roles r ON rp.role_id = r.id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE r.name = 'ADMIN' AND p.name LIKE 'casetilla.flow_report.%';
    IF v_count = 9 THEN
        RAISE NOTICE 'PASS: ADMIN tiene 9 permisos de Compliance';
    ELSE
        RAISE WARNING 'FAIL: ADMIN tiene % permisos (esperado 9)', v_count;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- 3. Full Access: 9 permisos
    -- ========================================================================
    SELECT COUNT(*) INTO v_count
    FROM public.role_permissions rp
    JOIN public.roles r ON rp.role_id = r.id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE r.name = 'Full Access' AND p.name LIKE 'casetilla.flow_report.%';
    IF v_count = 9 THEN
        RAISE NOTICE 'PASS: Full Access tiene 9 permisos de Compliance';
    ELSE
        RAISE WARNING 'FAIL: Full Access tiene % permisos (esperado 9)', v_count;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- 4. SUPERVISOR: 6 permisos
    -- ========================================================================
    SELECT COUNT(*) INTO v_count
    FROM public.role_permissions rp
    JOIN public.roles r ON rp.role_id = r.id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE r.name = 'SUPERVISOR' AND p.name LIKE 'casetilla.flow_report.%';
    IF v_count = 6 THEN
        RAISE NOTICE 'PASS: SUPERVISOR tiene 6 permisos de Compliance';
    ELSE
        RAISE WARNING 'FAIL: SUPERVISOR tiene % permisos (esperado 6)', v_count;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- 5. BASIC_USER: 0 permisos
    -- ========================================================================
    SELECT COUNT(*) INTO v_count
    FROM public.role_permissions rp
    JOIN public.roles r ON rp.role_id = r.id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE r.name = 'BASIC_USER' AND p.name LIKE 'casetilla.flow_report.%';
    IF v_count = 0 THEN
        RAISE NOTICE 'PASS: BASIC_USER tiene 0 permisos de Compliance';
    ELSE
        RAISE WARNING 'FAIL: BASIC_USER tiene % permisos (esperado 0)', v_count;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- 6. SUPERVISOR NO tiene rules.manage, incidents.override, schedules.manage
    -- ========================================================================
    FOREACH v_perm_name IN ARRAY v_supervisor_forbidden LOOP
        SELECT COUNT(*) INTO v_count
        FROM public.role_permissions rp
        JOIN public.roles r ON rp.role_id = r.id
        JOIN public.permissions p ON rp.permission_id = p.id
        WHERE r.name = 'SUPERVISOR' AND p.name = v_perm_name;
        IF v_count = 0 THEN
            RAISE NOTICE 'PASS: SUPERVISOR NO tiene %', v_perm_name;
        ELSE
            RAISE WARNING 'FAIL: SUPERVISOR TIENE % (no deberia)', v_perm_name;
            v_failures := v_failures + 1;
        END IF;
    END LOOP;

    -- ========================================================================
    -- 7. Ningun otro rol recibio permisos de Compliance
    -- ========================================================================
    SELECT COUNT(*) INTO v_count
    FROM public.role_permissions rp
    JOIN public.roles r ON rp.role_id = r.id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE p.name LIKE 'casetilla.flow_report.%'
      AND r.name NOT IN ('ADMIN', 'Full Access', 'SUPERVISOR');
    IF v_count = 0 THEN
        RAISE NOTICE 'PASS: Ningun otro rol recibio permisos de Compliance';
    ELSE
        RAISE WARNING 'FAIL: % roles adicionales recibieron permisos de Compliance', v_count;
        v_failures := v_failures + 1;
    END IF;

    -- ========================================================================
    -- RESULTADO FINAL
    -- ========================================================================
    IF v_failures > 0 THEN
        RAISE EXCEPTION '04_validate_permissions: FAIL — % validaciones fallaron', v_failures;
    ELSE
        RAISE NOTICE '========================================';
        RAISE NOTICE '04_validate_permissions: ALL PASS';
        RAISE NOTICE '========================================';
    END IF;
END $$;