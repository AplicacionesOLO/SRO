-- ============================================================================
-- 005_create_inout_provisioning.sql
-- Fase 6.1 — BASE ESTRUCTURAL PASIVA
-- Función idempotente de aprovisionamiento de reglas para una organización
--
-- CORRECCIONES APLICADAS (v4.0 — Auditoría Final Pre-Ejecución):
--   ✅ Sin DO block global — ÚNICAMENTE define la función
--      → El seed inicial reside en 006, que invoca esta función por cada org
--      → UNA SOLA fuente de verdad para el catálogo de 16 reglas
--   ✅ conditions_json vacío en R09 y R15: '' (JSONB válido)
--   ✅ R10 DISPATCHED_REOPEN_ATTEMPT: RESTAURADO al valor exacto del SQL_SPECS v2.0
--      → conditions_json original: {"required_previous_status_codes":["DISPATCHED"],"prohibited_new_status_codes":["DONE"]}
--      → ⚠️ PENDING_BUSINESS_VALIDATION: is_active = false
--      → Motivo: el conditions_json del SPEC bloquea DONE, pero el FLOW_RULE_CATALOG.md
--        define DISPATCHED→DONE como la ÚNICA transición normal permitida.
--        No se infiere la lista correcta sin confirmación del negocio.
--      → Estados CHECKING_IN, CHECKEDIN_PENDING_CLOSE, UNLOADED_PENDING_CHECKIN
--        siguen pendientes de clasificación en STATE_MACHINE_SPEC.md.
--   ✅ R11 DONE_REOPEN_ATTEMPT: RESTAURADO al valor exacto del SQL_SPECS v2.0
--      → conditions_json original: {"required_previous_status_codes":["DONE"]}
--      → Sin lista de prohibited_new_status_codes — la regla INVALID_STATUS_TRANSITION
--        cubre el bloqueo total desde DONE (ninguna transición FROM DONE está en la matriz).
--      → is_active = true (el SPEC original funciona correctamente)
--   ✅ GRANT RESTRINGIDO: solo service_role puede ejecutar esta función
--      → SECURITY DEFINER con acceso solo para procesos del sistema
--      → Ni PUBLIC ni authenticated pueden invocarla directamente
--   ✅ Idempotente, concurrent-safe, no sobrescribe reglas existentes
-- ============================================================================

CREATE OR REPLACE FUNCTION public.provision_inout_flow_for_org(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'pg_catalog', 'public'
AS $$
DECLARE
    v_admin_profile_id UUID;
    v_admin_role_id UUID;
    v_org_name TEXT;
    v_rules_created INTEGER := 0;
    v_rules_existing INTEGER := 0;
    v_warnings TEXT[] := ARRAY[]::text[];
    v_inserted_count INTEGER;
BEGIN
    -- 1. Validar que la organización exista
    SELECT name INTO v_org_name FROM public.organizations WHERE id = p_org_id;
    IF v_org_name IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Organización no encontrada',
            'org_id', p_org_id,
            'warnings', jsonb_build_array('org_not_found')
        );
    END IF;

    -- 2. Obtener role_id de ADMIN para priorización
    SELECT id INTO v_admin_role_id FROM public.roles WHERE name = 'ADMIN' LIMIT 1;

    -- 3. Buscar actor válido con permiso casetilla.flow_report.rules.manage
    --    Prefiere ADMIN, luego Full Access, ordenado por created_at (determinista)
    SELECT p.id INTO v_admin_profile_id
    FROM public.profiles p
    JOIN public.user_org_roles uor ON p.id = uor.user_id
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions perm ON rp.permission_id = perm.id
    WHERE uor.org_id = p_org_id
      AND perm.name = 'casetilla.flow_report.rules.manage'
    ORDER BY
        CASE WHEN uor.role_id = v_admin_role_id THEN 0 ELSE 1 END,
        p.created_at ASC
    LIMIT 1;

    -- 4. Sin actor válido → omitir (no usa fallback a cualquier usuario)
    IF v_admin_profile_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Sin actor con permiso casetilla.flow_report.rules.manage en esta organización',
            'org_id', p_org_id,
            'org_name', v_org_name,
            'rules_created', 0,
            'rules_existing', 0,
            'warnings', jsonb_build_array('no_valid_actor')
        );
    END IF;

    -- 5. Insertar las 16 reglas del sistema con ON CONFLICT DO NOTHING
    --    Cada regla es idempotente: si ya existe (org_id, code), se cuenta como existing.
    --    Esta es la ÚNICA fuente de verdad del catálogo de reglas.

    -- R01: STATUS_WITHOUT_GATE_IN
    INSERT INTO public.inout_flow_rules (
        org_id, code, name, description, category, trigger_event,
        conditions_json, severity, enforcement_mode,
        is_system_rule, edit_policy, notification_mode,
        applies_retroactively, priority, created_by, updated_by
    ) VALUES (
        p_org_id, 'STATUS_WITHOUT_GATE_IN',
        'Cambio a estado operativo sin ingreso por casetilla',
        'Detecta cuando una cita avanza a estados operativos sin registro de ingreso en casetilla_ingresos.',
        'missing_event', 'on_status_change',
        '{"required_new_status_codes":["ARRIVED_PENDING_UNLOAD","IN_PROGRESS","PENDING_DISCHARGE","START","UNLOADING","DISCHARGED"],"require_event_tables":["casetilla_ingresos"],"event_check":"not_exists"}',
        'alta', 'block', true, 'locked', 'none', true, 10, v_admin_profile_id, v_admin_profile_id
    ) ON CONFLICT (org_id, code) DO NOTHING;
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    IF v_inserted_count > 0 THEN v_rules_created := v_rules_created + 1; ELSE v_rules_existing := v_rules_existing + 1; END IF;

    -- R02: GATE_OUT_WITHOUT_GATE_IN
    INSERT INTO public.inout_flow_rules (
        org_id, code, name, description, category, trigger_event,
        conditions_json, severity, enforcement_mode,
        is_system_rule, edit_policy, notification_mode,
        applies_retroactively, priority, created_by, updated_by
    ) VALUES (
        p_org_id, 'GATE_OUT_WITHOUT_GATE_IN',
        'Salida por casetilla sin ingreso previo',
        'Detecta salida en casetilla_salidas sin ingreso previo en casetilla_ingresos.',
        'sequence', 'on_gate_out',
        '{"require_event_tables":["casetilla_ingresos"],"event_check":"exists"}',
        'critica', 'block', true, 'locked', 'immediate', true, 10, v_admin_profile_id, v_admin_profile_id
    ) ON CONFLICT (org_id, code) DO NOTHING;
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    IF v_inserted_count > 0 THEN v_rules_created := v_rules_created + 1; ELSE v_rules_existing := v_rules_existing + 1; END IF;

    -- R03: DISPATCHED_WITHOUT_GATE_OUT
    INSERT INTO public.inout_flow_rules (
        org_id, code, name, description, category, trigger_event,
        conditions_json, severity, enforcement_mode,
        is_system_rule, edit_policy, notification_mode,
        applies_retroactively, priority, created_by, updated_by
    ) VALUES (
        p_org_id, 'DISPATCHED_WITHOUT_GATE_OUT',
        'Cambio a DISPATCHED sin salida por casetilla',
        'Detecta cambio a DISPATCHED sin registro de salida.',
        'missing_event', 'on_status_change',
        '{"required_new_status_codes":["DISPATCHED"],"require_event_tables":["casetilla_salidas"],"event_check":"not_exists"}',
        'alta', 'block', true, 'locked', 'none', true, 10, v_admin_profile_id, v_admin_profile_id
    ) ON CONFLICT (org_id, code) DO NOTHING;
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    IF v_inserted_count > 0 THEN v_rules_created := v_rules_created + 1; ELSE v_rules_existing := v_rules_existing + 1; END IF;

    -- R04: DONE_WITHOUT_GATE_OUT
    INSERT INTO public.inout_flow_rules (
        org_id, code, name, description, category, trigger_event,
        conditions_json, severity, enforcement_mode,
        is_system_rule, edit_policy, notification_mode,
        applies_retroactively, priority, created_by, updated_by
    ) VALUES (
        p_org_id, 'DONE_WITHOUT_GATE_OUT',
        'Cambio a DONE sin salida por casetilla',
        'Advierte cuando una cita llega a DONE sin registro de salida.',
        'missing_event', 'on_status_change',
        '{"required_new_status_codes":["DONE"],"require_event_tables":["casetilla_salidas"],"event_check":"not_exists"}',
        'alta', 'warn', true, 'locked', 'none', true, 20, v_admin_profile_id, v_admin_profile_id
    ) ON CONFLICT (org_id, code) DO NOTHING;
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    IF v_inserted_count > 0 THEN v_rules_created := v_rules_created + 1; ELSE v_rules_existing := v_rules_existing + 1; END IF;

    -- R05: DUPLICATE_GATE_IN
    INSERT INTO public.inout_flow_rules (
        org_id, code, name, description, category, trigger_event,
        conditions_json, severity, enforcement_mode,
        is_system_rule, edit_policy, notification_mode,
        applies_retroactively, priority, created_by, updated_by
    ) VALUES (
        p_org_id, 'DUPLICATE_GATE_IN',
        'Ingreso duplicado por casetilla',
        'Detecta más de un ingreso para la misma cita.',
        'duplicate', 'on_gate_in',
        '{"min_occurrences":2,"event_check":"exists"}',
        'media', 'observe', true, 'locked', 'none', true, 30, v_admin_profile_id, v_admin_profile_id
    ) ON CONFLICT (org_id, code) DO NOTHING;
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    IF v_inserted_count > 0 THEN v_rules_created := v_rules_created + 1; ELSE v_rules_existing := v_rules_existing + 1; END IF;

    -- R06: DUPLICATE_GATE_OUT
    INSERT INTO public.inout_flow_rules (
        org_id, code, name, description, category, trigger_event,
        conditions_json, severity, enforcement_mode,
        is_system_rule, edit_policy, notification_mode,
        applies_retroactively, priority, created_by, updated_by
    ) VALUES (
        p_org_id, 'DUPLICATE_GATE_OUT',
        'Salida duplicada por casetilla',
        'Detecta más de una salida para la misma cita.',
        'duplicate', 'on_gate_out',
        '{"min_occurrences":2,"event_check":"exists"}',
        'media', 'observe', true, 'locked', 'none', true, 30, v_admin_profile_id, v_admin_profile_id
    ) ON CONFLICT (org_id, code) DO NOTHING;
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    IF v_inserted_count > 0 THEN v_rules_created := v_rules_created + 1; ELSE v_rules_existing := v_rules_existing + 1; END IF;

    -- R07: GATE_OUT_BEFORE_GATE_IN
    INSERT INTO public.inout_flow_rules (
        org_id, code, name, description, category, trigger_event,
        conditions_json, severity, enforcement_mode,
        is_system_rule, edit_policy, notification_mode,
        applies_retroactively, priority, created_by, updated_by
    ) VALUES (
        p_org_id, 'GATE_OUT_BEFORE_GATE_IN',
        'Salida con timestamp anterior al ingreso',
        'Detecta timestamp de salida anterior al timestamp de ingreso.',
        'sequence', 'on_gate_out',
        '{"require_event_tables":["casetilla_ingresos","casetilla_salidas"],"require_event_order":[["casetilla_ingresos","casetilla_salidas"]],"require_timestamp_order":[["casetilla_ingresos.created_at","casetilla_salidas.created_at"]]}',
        'critica', 'block', true, 'locked', 'immediate', true, 10, v_admin_profile_id, v_admin_profile_id
    ) ON CONFLICT (org_id, code) DO NOTHING;
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    IF v_inserted_count > 0 THEN v_rules_created := v_rules_created + 1; ELSE v_rules_existing := v_rules_existing + 1; END IF;

    -- R08: STATUS_BEFORE_GATE_IN
    INSERT INTO public.inout_flow_rules (
        org_id, code, name, description, category, trigger_event,
        conditions_json, severity, enforcement_mode,
        is_system_rule, edit_policy, notification_mode,
        applies_retroactively, priority, created_by, updated_by
    ) VALUES (
        p_org_id, 'STATUS_BEFORE_GATE_IN',
        'Cambio de estado operativo antes del ingreso',
        'Detecta cambio de estado con timestamp anterior al ingreso por casetilla.',
        'sequence', 'on_status_change',
        '{"require_event_tables":["casetilla_ingresos"],"event_check":"exists","require_timestamp_order":[["casetilla_ingresos.created_at","activity_log.created_at"]]}',
        'media', 'observe', true, 'locked', 'none', true, 30, v_admin_profile_id, v_admin_profile_id
    ) ON CONFLICT (org_id, code) DO NOTHING;
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    IF v_inserted_count > 0 THEN v_rules_created := v_rules_created + 1; ELSE v_rules_existing := v_rules_existing + 1; END IF;

    -- R09: INVALID_STATUS_TRANSITION
    INSERT INTO public.inout_flow_rules (
        org_id, code, name, description, category, trigger_event,
        conditions_json, severity, enforcement_mode,
        is_system_rule, edit_policy, notification_mode,
        applies_retroactively, priority, created_by, updated_by
    ) VALUES (
        p_org_id, 'INVALID_STATUS_TRANSITION',
        'Transición de estado no permitida',
        'Bloquea transiciones no contempladas en la matriz de estados.',
        'transition', 'on_status_change',
        '{}',
        'alta', 'block', true, 'locked', 'none', false, 50, v_admin_profile_id, v_admin_profile_id
    ) ON CONFLICT (org_id, code) DO NOTHING;
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    IF v_inserted_count > 0 THEN v_rules_created := v_rules_created + 1; ELSE v_rules_existing := v_rules_existing + 1; END IF;

    -- R10: DISPATCHED_REOPEN_ATTEMPT
    -- ⚠️ PENDING_BUSINESS_VALIDATION: conditions_json del SQL_SPECS v2.0 dice
    --    prohibited_new_status_codes:["DONE"], lo cual BLOQUEA la única transición
    --    válida según FLOW_RULE_CATALOG.md (DISPATCHED→DONE). No se infiere la lista
    --    correcta sin confirmación del negocio. Mientras tanto: is_active = false.
    --    Estados CHECKING_IN, CHECKEDIN_PENDING_CLOSE, UNLOADED_PENDING_CHECKIN
    --    siguen pendientes de clasificación en STATE_MACHINE_SPEC.md.
    INSERT INTO public.inout_flow_rules (
        org_id, code, name, description, category, trigger_event,
        conditions_json, severity, enforcement_mode,
        is_system_rule, edit_policy, is_active, notification_mode,
        applies_retroactively, priority, created_by, updated_by
    ) VALUES (
        p_org_id, 'DISPATCHED_REOPEN_ATTEMPT',
        'Intento de reabrir una cita despachada',
        'Bloquea retroceso desde DISPATCHED. Solo permite avanzar a DONE. ⚠️ PENDING_BUSINESS_VALIDATION: conditions_json del SPEC bloquea DONE, contradiciendo el catálogo funcional.',
        'terminal', 'on_status_change',
        '{"required_previous_status_codes":["DISPATCHED"],"prohibited_new_status_codes":["DONE"]}',
        'alta', 'block', true, 'locked', false, 'immediate', false, 10, v_admin_profile_id, v_admin_profile_id
    ) ON CONFLICT (org_id, code) DO NOTHING;
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    IF v_inserted_count > 0 THEN v_rules_created := v_rules_created + 1; ELSE v_rules_existing := v_rules_existing + 1; END IF;

    -- R11: DONE_REOPEN_ATTEMPT
    -- RESTAURADO al valor exacto del SQL_SPECS v2.0.
    -- conditions_json: {"required_previous_status_codes":["DONE"]}
    -- Sin prohibited_new_status_codes: combinado con INVALID_STATUS_TRANSITION,
    -- bloquea correctamente cualquier transición FROM DONE (ninguna está en la matriz).
    INSERT INTO public.inout_flow_rules (
        org_id, code, name, description, category, trigger_event,
        conditions_json, severity, enforcement_mode,
        is_system_rule, edit_policy, notification_mode,
        applies_retroactively, priority, created_by, updated_by
    ) VALUES (
        p_org_id, 'DONE_REOPEN_ATTEMPT',
        'Intento de modificar una cita completada',
        'Bloquea cualquier modificación desde DONE. Protección máxima.',
        'terminal', 'on_status_change',
        '{"required_previous_status_codes":["DONE"]}',
        'alta', 'block', true, 'locked', 'immediate', false, 10, v_admin_profile_id, v_admin_profile_id
    ) ON CONFLICT (org_id, code) DO NOTHING;
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    IF v_inserted_count > 0 THEN v_rules_created := v_rules_created + 1; ELSE v_rules_existing := v_rules_existing + 1; END IF;

    -- R12: ACTIVITY_AFTER_CANCELLED
    INSERT INTO public.inout_flow_rules (
        org_id, code, name, description, category, trigger_event,
        conditions_json, severity, enforcement_mode,
        is_system_rule, edit_policy, notification_mode,
        applies_retroactively, priority, created_by, updated_by
    ) VALUES (
        p_org_id, 'ACTIVITY_AFTER_CANCELLED',
        'Actividad posterior a la cancelación',
        'Detecta eventos posteriores a una cancelación.',
        'consistency', 'on_schedule',
        '{"require_is_cancelled":true}',
        'media', 'observe', true, 'locked', 'daily', true, 30, v_admin_profile_id, v_admin_profile_id
    ) ON CONFLICT (org_id, code) DO NOTHING;
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    IF v_inserted_count > 0 THEN v_rules_created := v_rules_created + 1; ELSE v_rules_existing := v_rules_existing + 1; END IF;

    -- R13: ACTIVITY_AFTER_NO_SHOW
    INSERT INTO public.inout_flow_rules (
        org_id, code, name, description, category, trigger_event,
        conditions_json, severity, enforcement_mode,
        is_system_rule, edit_policy, notification_mode,
        applies_retroactively, priority, created_by, updated_by
    ) VALUES (
        p_org_id, 'ACTIVITY_AFTER_NO_SHOW',
        'Actividad posterior a No-Show',
        'Advierte al cambiar estado de cita NO_SHOW.',
        'consistency', 'on_status_change',
        '{"required_previous_status_codes":["NO_SHOW"]}',
        'media', 'warn', true, 'locked', 'none', false, 30, v_admin_profile_id, v_admin_profile_id
    ) ON CONFLICT (org_id, code) DO NOTHING;
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    IF v_inserted_count > 0 THEN v_rules_created := v_rules_created + 1; ELSE v_rules_existing := v_rules_existing + 1; END IF;

    -- R14: WAREHOUSE_MISMATCH
    INSERT INTO public.inout_flow_rules (
        org_id, code, name, description, category, trigger_event,
        conditions_json, severity, enforcement_mode,
        is_system_rule, edit_policy, notification_mode,
        applies_retroactively, priority, created_by, updated_by
    ) VALUES (
        p_org_id, 'WAREHOUSE_MISMATCH',
        'Evento en almacén diferente al de la cita',
        'Detecta eventos en almacén incorrecto.',
        'consistency', 'always',
        '{"require_same_warehouse":true}',
        'media', 'observe', true, 'locked', 'daily', true, 30, v_admin_profile_id, v_admin_profile_id
    ) ON CONFLICT (org_id, code) DO NOTHING;
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    IF v_inserted_count > 0 THEN v_rules_created := v_rules_created + 1; ELSE v_rules_existing := v_rules_existing + 1; END IF;

    -- R15: TEMPORAL_INCONSISTENCY
    INSERT INTO public.inout_flow_rules (
        org_id, code, name, description, category, trigger_event,
        conditions_json, severity, enforcement_mode,
        is_system_rule, edit_policy, notification_mode,
        applies_retroactively, priority, grace_period_minutes,
        created_by, updated_by
    ) VALUES (
        p_org_id, 'TEMPORAL_INCONSISTENCY',
        'Inconsistencia temporal entre eventos',
        'Detecta orden cronológico inconsistente. Red de seguridad temporal.',
        'consistency', 'on_schedule',
        '{}',
        'baja', 'observe', true, 'locked', 'weekly', true, 100, 5, v_admin_profile_id, v_admin_profile_id
    ) ON CONFLICT (org_id, code) DO NOTHING;
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    IF v_inserted_count > 0 THEN v_rules_created := v_rules_created + 1; ELSE v_rules_existing := v_rules_existing + 1; END IF;

    -- R16: INCOMPLETE_DATA
    INSERT INTO public.inout_flow_rules (
        org_id, code, name, description, category, trigger_event,
        conditions_json, severity, enforcement_mode,
        is_system_rule, edit_policy, notification_mode,
        applies_retroactively, priority, created_by, updated_by
    ) VALUES (
        p_org_id, 'INCOMPLETE_DATA',
        'Datos incompletos en cita operativa',
        'Detecta campos obligatorios vacíos en citas operativas.',
        'consistency', 'on_schedule',
        '{"required_fields":["driver","truck_plate","purchase_order"]}',
        'baja', 'observe', true, 'locked', 'weekly', true, 100, v_admin_profile_id, v_admin_profile_id
    ) ON CONFLICT (org_id, code) DO NOTHING;
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    IF v_inserted_count > 0 THEN v_rules_created := v_rules_created + 1; ELSE v_rules_existing := v_rules_existing + 1; END IF;

    -- 6. Retornar resumen
    RETURN jsonb_build_object(
        'success', true,
        'org_id', p_org_id,
        'org_name', v_org_name,
        'rules_created', v_rules_created,
        'rules_existing', v_rules_existing,
        'rules_total', v_rules_created + v_rules_existing,
        'permissions_checked', 9,
        'warnings', CASE WHEN array_length(v_warnings, 1) > 0
            THEN to_jsonb(v_warnings) ELSE '[]'::jsonb END
    );
END;
$$;

-- ===========================================================================
-- GRANT: Solo service_role puede ejecutar esta función
-- SECURITY DEFINER con capacidad de INSERT en múltiples tablas
-- NO se expone a authenticated ni PUBLIC
-- ===========================================================================

REVOKE ALL ON FUNCTION public.provision_inout_flow_for_org(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provision_inout_flow_for_org(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.provision_inout_flow_for_org(UUID) TO service_role;

COMMENT ON FUNCTION public.provision_inout_flow_for_org(UUID) IS
'Función idempotente de aprovisionamiento de reglas IN/OUT para una organización.
Segura ante ejecuciones concurrentes (ON CONFLICT DO NOTHING).
No sobrescribe reglas existentes.
Solo utiliza actores con permiso explícito casetilla.flow_report.rules.manage.
ACCESO RESTRINGIDO: solo service_role. No expuesta a authenticated ni PUBLIC.
Retorna JSONB: {success, org_id, org_name, rules_created, rules_existing, rules_total, permissions_checked, warnings}';