-- ============================================================================
-- 03_validate_structure.sql
-- Fase 6.1 — PAQUETE DE PRUEBAS AISLADAS
-- VALIDACIÓN ESTRUCTURAL COMPLETA CON LISTAS EXACTAS DE NOMBRES
-- Cada validación emite PASS o FAIL.
-- Termina con EXCEPTION si alguna validación falla.
-- ============================================================================

\set ON_ERROR_STOP on

\echo '========================================'
\echo '03_validate_structure: Iniciando...'
\echo '========================================'

DO $$
DECLARE
    v_failures INTEGER := 0;
    v_count INTEGER;
    v_found TEXT[];
    v_expected TEXT[];
    v_missing TEXT[];
    v_extra TEXT[];
    v_name TEXT;

    -- Lista exacta de tablas esperadas
    v_tables_expected TEXT[] := ARRAY[
        'inout_flow_rules','inout_flow_incidents','inout_state_transition_attempts',
        'inout_incident_comments','inout_report_schedules','inout_report_runs','inout_flow_audit_log'
    ];

    -- Lista exacta de funciones esperadas
    v_funcs_expected TEXT[] := ARRAY[
        'inout_get_user_org_role','inout_has_permission',
        'inout_generate_idempotency_key','inout_get_max_severity',
        'provision_inout_flow_for_org'
    ];

    -- Lista exacta de índices esperados (29)
    v_indexes_expected TEXT[] := ARRAY[
        'idx_flow_rules_org_active','idx_flow_rules_trigger','idx_flow_rules_priority',
        'idx_flow_rules_warehouse','idx_flow_rules_client','idx_flow_rules_effective',
        'idx_incidents_org_status','idx_incidents_reservation','idx_incidents_rule',
        'idx_incidents_detected','idx_incidents_type','idx_incidents_severity',
        'idx_incidents_warehouse','idx_incidents_client',
        'idx_attempts_reservation','idx_attempts_org_time','idx_attempts_blocked',
        'idx_attempts_user','idx_attempts_parent','idx_attempts_pending_warning',
        'idx_incident_comments_incident',
        'idx_schedules_org_active','idx_schedules_next',
        'idx_runs_org_time','idx_runs_schedule','idx_runs_status',
        'idx_audit_org_time','idx_audit_entity','idx_audit_user'
    ];

    -- Lista exacta de políticas RLS esperadas (13)
    v_policies_expected TEXT[] := ARRAY[
        'Allow SELECT inout_flow_rules for authorized users',
        'Allow INSERT inout_flow_rules for rules.manage',
        'Allow UPDATE inout_flow_rules for rules.manage',
        'Allow SELECT inout_flow_incidents for incidents.view',
        'Allow SELECT inout_state_transition_attempts for audit.view',
        'Allow SELECT inout_incident_comments for org members',
        'Allow INSERT inout_incident_comments for incidents.view',
        'Allow SELECT inout_report_schedules for schedules.manage',
        'Allow INSERT inout_report_schedules for schedules.manage',
        'Allow UPDATE inout_report_schedules for schedules.manage',
        'Allow DELETE inout_report_schedules for schedules.manage',
        'Allow SELECT inout_report_runs for audit.view',
        'Allow SELECT inout_flow_audit_log for audit.view'
    ];

BEGIN
    -- ═══════════════════════════════════════════════════════════════════
    -- 1. TABLAS: 7 exactas por nombre
    -- ═══════════════════════════════════════════════════════════════════
    -- Encontradas
    SELECT array_agg(tablename ORDER BY tablename) INTO v_found
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename = ANY(v_tables_expected);

    -- Faltantes
    SELECT array_agg(t ORDER BY t) INTO v_missing
    FROM unnest(v_tables_expected) t
    WHERE t NOT IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public');

    -- Adicionales
    SELECT array_agg(tablename ORDER BY tablename) INTO v_extra
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename LIKE 'inout_%'
      AND tablename <> ALL(v_tables_expected);

    IF v_missing IS NOT NULL THEN
        RAISE WARNING 'FAIL [Tablas]: Faltan: %', array_to_string(v_missing, ', ');
        v_failures := v_failures + 1;
    END IF;
    IF v_extra IS NOT NULL THEN
        RAISE WARNING 'FAIL [Tablas]: Sobran: %', array_to_string(v_extra, ', ');
        v_failures := v_failures + 1;
    END IF;
    IF v_missing IS NULL AND v_extra IS NULL THEN
        RAISE NOTICE 'PASS [Tablas]: 7 exactas — %', array_to_string(v_found, ', ');
    END IF;

    -- ═══════════════════════════════════════════════════════════════════
    -- 2. RLS ACTIVO en las 7 tablas
    -- ═══════════════════════════════════════════════════════════════════
    SELECT COUNT(*) INTO v_count FROM pg_tables
    WHERE schemaname = 'public' AND rowsecurity = true
      AND tablename = ANY(v_tables_expected);
    IF v_count = 7 THEN
        RAISE NOTICE 'PASS [RLS]: RLS activo en las 7 tablas';
    ELSE
        RAISE WARNING 'FAIL [RLS]: RLS activo en % de 7 tablas', v_count;
        v_failures := v_failures + 1;
    END IF;

    -- ═══════════════════════════════════════════════════════════════════
    -- 3. ÍNDICES: 29 exactos por nombre
    -- ═══════════════════════════════════════════════════════════════════
    -- Encontrados
    SELECT array_agg(indexname ORDER BY indexname) INTO v_found
    FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = ANY(v_indexes_expected);

    -- Faltantes
    SELECT array_agg(t ORDER BY t) INTO v_missing
    FROM unnest(v_indexes_expected) t
    WHERE t NOT IN (SELECT indexname FROM pg_indexes WHERE schemaname = 'public');

    -- Adicionales (índices en tablas inout_* que no están en la lista)
    SELECT array_agg(indexname ORDER BY indexname) INTO v_extra
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = ANY(v_tables_expected)
      AND indexname <> ALL(v_indexes_expected);

    IF v_missing IS NOT NULL THEN
        RAISE WARNING 'FAIL [Índices]: Faltan: %', array_to_string(v_missing, ', ');
        v_failures := v_failures + 1;
    END IF;
    IF v_extra IS NOT NULL THEN
        RAISE WARNING 'FAIL [Índices]: Sobran: %', array_to_string(v_extra, ', ');
        v_failures := v_failures + 1;
    END IF;
    IF v_missing IS NULL AND v_extra IS NULL THEN
        RAISE NOTICE 'PASS [Índices]: 29 exactos';
    END IF;

    -- ═══════════════════════════════════════════════════════════════════
    -- 4. POLÍTICAS RLS: 13 exactas por nombre
    -- ═══════════════════════════════════════════════════════════════════
    -- Encontradas
    SELECT array_agg(policyname ORDER BY policyname) INTO v_found
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(v_tables_expected);

    -- Faltantes
    SELECT array_agg(t ORDER BY t) INTO v_missing
    FROM unnest(v_policies_expected) t
    WHERE t NOT IN (
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = ANY(v_tables_expected)
    );

    -- Adicionales
    SELECT array_agg(policyname ORDER BY policyname) INTO v_extra
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(v_tables_expected)
      AND policyname <> ALL(v_policies_expected);

    IF v_missing IS NOT NULL THEN
        RAISE WARNING 'FAIL [Políticas]: Faltan: %', array_to_string(v_missing, ', ');
        v_failures := v_failures + 1;
    END IF;
    IF v_extra IS NOT NULL THEN
        RAISE WARNING 'FAIL [Políticas]: Sobran: %', array_to_string(v_extra, ', ');
        v_failures := v_failures + 1;
    END IF;
    IF v_missing IS NULL AND v_extra IS NULL THEN
        RAISE NOTICE 'PASS [Políticas]: 13 exactas';
    END IF;

    -- ═══════════════════════════════════════════════════════════════════
    -- 5. FUNCIONES: 5 exactas por nombre
    -- ═══════════════════════════════════════════════════════════════════
    SELECT array_agg(proname ORDER BY proname) INTO v_found
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = ANY(v_funcs_expected);

    SELECT array_agg(t ORDER BY t) INTO v_missing
    FROM unnest(v_funcs_expected) t
    WHERE t NOT IN (
        SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace
    );

    IF v_missing IS NOT NULL THEN
        RAISE WARNING 'FAIL [Funciones]: Faltan: %', array_to_string(v_missing, ', ');
        v_failures := v_failures + 1;
    ELSE
        RAISE NOTICE 'PASS [Funciones]: 5 exactas — %', array_to_string(v_found, ', ');
    END IF;

    -- ═══════════════════════════════════════════════════════════════════
    -- 6. COLUMNAS por tabla
    -- ═══════════════════════════════════════════════════════════════════
    SELECT COUNT(*) INTO v_count FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inout_flow_rules';
    IF v_count = 29 THEN RAISE NOTICE 'PASS [Columnas]: inout_flow_rules = 29';
    ELSE RAISE WARNING 'FAIL [Columnas]: inout_flow_rules tiene % (esperado 29)', v_count; v_failures := v_failures + 1; END IF;

    SELECT COUNT(*) INTO v_count FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inout_flow_incidents';
    IF v_count = 29 THEN RAISE NOTICE 'PASS [Columnas]: inout_flow_incidents = 29';
    ELSE RAISE WARNING 'FAIL [Columnas]: inout_flow_incidents tiene % (esperado 29)', v_count; v_failures := v_failures + 1; END IF;

    SELECT COUNT(*) INTO v_count FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inout_state_transition_attempts';
    IF v_count = 23 THEN RAISE NOTICE 'PASS [Columnas]: inout_state_transition_attempts = 23';
    ELSE RAISE WARNING 'FAIL [Columnas]: inout_state_transition_attempts tiene % (esperado 23)', v_count; v_failures := v_failures + 1; END IF;

    SELECT COUNT(*) INTO v_count FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inout_incident_comments';
    IF v_count = 7 THEN RAISE NOTICE 'PASS [Columnas]: inout_incident_comments = 7';
    ELSE RAISE WARNING 'FAIL [Columnas]: inout_incident_comments tiene % (esperado 7)', v_count; v_failures := v_failures + 1; END IF;

    SELECT COUNT(*) INTO v_count FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inout_report_schedules';
    IF v_count = 20 THEN RAISE NOTICE 'PASS [Columnas]: inout_report_schedules = 20';
    ELSE RAISE WARNING 'FAIL [Columnas]: inout_report_schedules tiene % (esperado 20)', v_count; v_failures := v_failures + 1; END IF;

    SELECT COUNT(*) INTO v_count FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inout_report_runs';
    IF v_count = 17 THEN RAISE NOTICE 'PASS [Columnas]: inout_report_runs = 17';
    ELSE RAISE WARNING 'FAIL [Columnas]: inout_report_runs tiene % (esperado 17)', v_count; v_failures := v_failures + 1; END IF;

    SELECT COUNT(*) INTO v_count FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inout_flow_audit_log';
    IF v_count = 10 THEN RAISE NOTICE 'PASS [Columnas]: inout_flow_audit_log = 10';
    ELSE RAISE WARNING 'FAIL [Columnas]: inout_flow_audit_log tiene % (esperado 10)', v_count; v_failures := v_failures + 1; END IF;

    -- ═══════════════════════════════════════════════════════════════════
    -- 7. JSONB DEFAULTS: todos deben ser válidos (no empty string '')
    -- ═══════════════════════════════════════════════════════════════════
    DECLARE
        v_defaults_ok INTEGER;
        v_expected_cols INTEGER;
    BEGIN
        SELECT COUNT(*) INTO v_defaults_ok FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY(v_tables_expected)
          AND data_type = 'jsonb'
          AND column_default IS NOT NULL
          AND column_default NOT LIKE '%''''''%';

        SELECT COUNT(*) INTO v_expected_cols FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY(v_tables_expected)
          AND data_type = 'jsonb';

        IF v_defaults_ok = v_expected_cols THEN
            RAISE NOTICE 'PASS [JSONB]: %/% columnas JSONB tienen defaults válidos', v_defaults_ok, v_expected_cols;
        ELSE
            RAISE WARNING 'FAIL [JSONB]: % de % columnas JSONB tienen defaults válidos', v_defaults_ok, v_expected_cols;
            v_failures := v_failures + 1;
        END IF;
    END;

    -- ═══════════════════════════════════════════════════════════════════
    -- 8. PRIMARY KEYs en las 7 tablas
    -- ═══════════════════════════════════════════════════════════════════
    SELECT COUNT(*) INTO v_count FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND constraint_type = 'PRIMARY KEY'
      AND table_name = ANY(v_tables_expected);
    IF v_count = 7 THEN
        RAISE NOTICE 'PASS [PK]: 7 PKs';
    ELSE
        RAISE WARNING 'FAIL [PK]: % PKs (esperado 7)', v_count;
        v_failures := v_failures + 1;
    END IF;

    -- ═══════════════════════════════════════════════════════════════════
    -- 9. CONSTRAINTS CLAVE por nombre exacto
    -- ═══════════════════════════════════════════════════════════════════
    SELECT COUNT(*) INTO v_count FROM pg_constraint
    WHERE conname = 'uq_flow_rules_org_code' AND conrelid = 'public.inout_flow_rules'::regclass;
    IF v_count = 1 THEN RAISE NOTICE 'PASS [Constraint]: uq_flow_rules_org_code';
    ELSE RAISE WARNING 'FAIL [Constraint]: uq_flow_rules_org_code no encontrado'; v_failures := v_failures + 1; END IF;

    SELECT COUNT(*) INTO v_count FROM pg_constraint
    WHERE conname = 'uq_incidents_idempotency' AND conrelid = 'public.inout_flow_incidents'::regclass;
    IF v_count = 1 THEN RAISE NOTICE 'PASS [Constraint]: uq_incidents_idempotency';
    ELSE RAISE WARNING 'FAIL [Constraint]: uq_incidents_idempotency no encontrado'; v_failures := v_failures + 1; END IF;

    SELECT COUNT(*) INTO v_count FROM pg_constraint
    WHERE conname = 'ck_attempts_different_status' AND conrelid = 'public.inout_state_transition_attempts'::regclass;
    IF v_count = 1 THEN RAISE NOTICE 'PASS [Constraint]: ck_attempts_different_status';
    ELSE RAISE WARNING 'FAIL [Constraint]: ck_attempts_different_status no encontrado'; v_failures := v_failures + 1; END IF;

    SELECT COUNT(*) INTO v_count FROM pg_constraint
    WHERE conname = 'ck_flow_rules_system_not_full_editable' AND conrelid = 'public.inout_flow_rules'::regclass;
    IF v_count = 1 THEN RAISE NOTICE 'PASS [Constraint]: ck_flow_rules_system_not_full_editable';
    ELSE RAISE WARNING 'FAIL [Constraint]: ck_flow_rules_system_not_full_editable no encontrado'; v_failures := v_failures + 1; END IF;

    SELECT COUNT(*) INTO v_count FROM pg_constraint
    WHERE conname = 'ck_flow_rules_effective' AND conrelid = 'public.inout_flow_rules'::regclass;
    IF v_count = 1 THEN RAISE NOTICE 'PASS [Constraint]: ck_flow_rules_effective';
    ELSE RAISE WARNING 'FAIL [Constraint]: ck_flow_rules_effective no encontrado'; v_failures := v_failures + 1; END IF;

    -- ═══════════════════════════════════════════════════════════════════
    -- 10. FK: incident_comments.incident_id ON DELETE RESTRICT
    -- ═══════════════════════════════════════════════════════════════════
    SELECT COUNT(*) INTO v_count FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu ON rc.constraint_name = kcu.constraint_name
    WHERE kcu.table_name = 'inout_incident_comments'
      AND kcu.column_name = 'incident_id'
      AND rc.delete_rule = 'RESTRICT';
    IF v_count = 1 THEN
        RAISE NOTICE 'PASS [FK]: incident_comments.incident_id ON DELETE RESTRICT';
    ELSE
        RAISE WARNING 'FAIL [FK]: incident_comments.incident_id NO tiene ON DELETE RESTRICT';
        v_failures := v_failures + 1;
    END IF;

    -- ═══════════════════════════════════════════════════════════════════
    -- RESULTADO FINAL
    -- ═══════════════════════════════════════════════════════════════════
    IF v_failures > 0 THEN
        RAISE EXCEPTION '03_validate_structure: FAIL — % validaciones fallaron', v_failures;
    ELSE
        RAISE NOTICE '========================================';
        RAISE NOTICE '03_validate_structure: ALL PASS';
        RAISE NOTICE '========================================';
    END IF;
END $$;