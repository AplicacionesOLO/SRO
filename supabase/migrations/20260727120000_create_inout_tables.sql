-- ============================================================================
-- 001_create_inout_tables.sql
-- Fase 6.1 — BASE ESTRUCTURAL PASIVA
-- Crea las 7 tablas del módulo IN/OUT Flow
--
-- CORRECCIONES APLICADAS (v3.0 — Auditoría Final):
--   ✅ inout_incident_comments.incident_id: ON DELETE RESTRICT (no CASCADE)
--   ✅ Tablas de auditoría: Sin CASCADE. Conservan historial completo.
--   ✅ 6 columnas JSONB con DEFAULT '' corregido a DEFAULT ''
--      → conditions_json, exclusions_json, metadata_json (×2),
--        schedule_config, filters_json
--   ✅ inout_flow_rules: CHECK constraint prohíbe is_system_rule=true con fully_editable
--   ✅ inout_flow_incidents: UNIQUE (org_id, idempotency_key)
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. inout_flow_rules — Catálogo de reglas de flujo IN/OUT
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inout_flow_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id),
    warehouse_id UUID REFERENCES public.warehouses(id),
    client_id UUID REFERENCES public.clients(id),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL CHECK (category IN ('missing_event','duplicate','sequence','transition','terminal','consistency','exclusion')),
    trigger_event TEXT NOT NULL CHECK (trigger_event IN ('on_gate_in','on_status_change','on_gate_out','on_schedule','always')),
    conditions_json JSONB NOT NULL DEFAULT '{}',
    exclusions_json JSONB NOT NULL DEFAULT '{}',
    severity TEXT NOT NULL DEFAULT 'media' CHECK (severity IN ('informativa','baja','media','alta','critica')),
    enforcement_mode TEXT NOT NULL DEFAULT 'observe' CHECK (enforcement_mode IN ('observe','warn','block')),
    creates_incident BOOLEAN NOT NULL DEFAULT true,
    is_system_rule BOOLEAN NOT NULL DEFAULT false,
    edit_policy TEXT NOT NULL DEFAULT 'fully_editable' CHECK (edit_policy IN ('locked','configuration_only','fully_editable')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    applies_retroactively BOOLEAN NOT NULL DEFAULT false,
    grace_period_minutes INTEGER CHECK (grace_period_minutes IS NULL OR grace_period_minutes >= 0),
    notification_mode TEXT NOT NULL DEFAULT 'none' CHECK (notification_mode IN ('none','immediate','hourly','daily','weekly')),
    deduplication_window_hours INTEGER NOT NULL DEFAULT 24 CHECK (deduplication_window_hours >= 1 AND deduplication_window_hours <= 8760),
    effective_from TIMESTAMPTZ,
    effective_to TIMESTAMPTZ,
    priority INTEGER NOT NULL DEFAULT 100 CHECK (priority > 0),
    schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    updated_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_flow_rules_org_code UNIQUE (org_id, code),
    CONSTRAINT ck_flow_rules_effective CHECK (effective_from IS NULL OR effective_to IS NULL OR effective_from < effective_to),
    CONSTRAINT ck_flow_rules_system_not_full_editable CHECK (NOT (is_system_rule = true AND edit_policy = 'fully_editable'))
);

COMMENT ON TABLE public.inout_flow_rules IS 'Catálogo de reglas de flujo IN/OUT. Cada regla define condiciones, exclusiones, severidad y modo de enforcement.';
COMMENT ON COLUMN public.inout_flow_rules.warehouse_id IS 'Alcance opcional por almacén. NULL = aplica a toda la organización.';
COMMENT ON COLUMN public.inout_flow_rules.client_id IS 'Alcance opcional por cliente. NULL = aplica a todos los clientes.';
COMMENT ON COLUMN public.inout_flow_rules.edit_policy IS 'Política de edición: locked (inmutable), configuration_only (solo parámetros), fully_editable (todo). Prohibido fully_editable en reglas de sistema.';

-- ---------------------------------------------------------------------------
-- 2. inout_flow_incidents — Incidencias detectadas por el Rule Engine
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inout_flow_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id),
    reservation_id UUID NOT NULL REFERENCES public.reservations(id),
    warehouse_id UUID REFERENCES public.warehouses(id),
    client_id UUID REFERENCES public.clients(id),
    rule_id UUID REFERENCES public.inout_flow_rules(id),
    incident_type TEXT NOT NULL CHECK (incident_type IN (
        'missing_gate_in','missing_gate_out','duplicate_gate_in','duplicate_gate_out',
        'gate_out_before_gate_in','status_before_gate_in',
        'dispatched_without_gate_out','done_without_gate_out',
        'invalid_status_transition','dispatched_reopen_attempt','done_reopen_attempt',
        'activity_after_cancelled','activity_after_no_show',
        'warehouse_mismatch','temporal_inconsistency','incomplete_data',
        'administrative_override','no_show_reversed','cancelled_reopened'
    )),
    severity TEXT NOT NULL DEFAULT 'media' CHECK (severity IN ('informativa','baja','media','alta','critica')),
    expected_event TEXT,
    detected_event TEXT,
    event_timestamp TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'nueva' CHECK (status IN ('nueva','en_revision','confirmada','resuelta','ignorada','falso_positivo')),
    assigned_to UUID REFERENCES public.profiles(id),
    first_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count >= 1),
    reopened_count INTEGER NOT NULL DEFAULT 0 CHECK (reopened_count >= 0),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES public.profiles(id),
    resolution_note TEXT,
    detected_by_type TEXT NOT NULL DEFAULT 'rule_engine' CHECK (detected_by_type IN ('rule_engine','reconciliation','manual','transition_rpc','external_api')),
    detected_by UUID REFERENCES public.profiles(id),
    source_event_type TEXT CHECK (source_event_type IN ('gate_in','gate_out','status_change','schedule','manual_review')),
    source_event_id TEXT,
    source_activity_log_id UUID REFERENCES public.activity_log(id),
    metadata_json JSONB NOT NULL DEFAULT '{}',
    idempotency_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_incidents_idempotency UNIQUE (org_id, idempotency_key)
);

COMMENT ON TABLE public.inout_flow_incidents IS 'Incidencias de flujo IN/OUT detectadas por el Rule Engine. Una incidencia por cada regla disparada.';
COMMENT ON COLUMN public.inout_flow_incidents.warehouse_id IS 'Warehouse resuelto al momento del evento (snapshot histórico vía dock_id → docks.warehouse_id).';
COMMENT ON COLUMN public.inout_flow_incidents.idempotency_key IS 'Clave determinista MD5(org_id::rule_code::event_reference) para evitar duplicados.';

-- ---------------------------------------------------------------------------
-- 3. inout_state_transition_attempts — Bitácora inmutable de intentos de cambio de estado
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inout_state_transition_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id),
    reservation_id UUID NOT NULL REFERENCES public.reservations(id),
    previous_status_id UUID NOT NULL REFERENCES public.reservation_statuses(id),
    requested_status_id UUID NOT NULL REFERENCES public.reservation_statuses(id),
    applied_status_id UUID REFERENCES public.reservation_statuses(id),
    result TEXT NOT NULL CHECK (result IN ('allowed','blocked','warning_pending','allowed_after_warning','allowed_by_override','failed_validation','no_change')),
    parent_attempt_id UUID REFERENCES public.inout_state_transition_attempts(id),
    confirmation_status TEXT CHECK (confirmation_status IN ('pending','confirmed','rejected')),
    confirmed_at TIMESTAMPTZ,
    confirmed_by UUID REFERENCES public.profiles(id),
    override_requested BOOLEAN NOT NULL DEFAULT false,
    override_authorized BOOLEAN,
    override_justification TEXT,
    blocked_reason TEXT,
    rule_id UUID REFERENCES public.inout_flow_rules(id),
    enforcement_mode_applied TEXT,
    attempted_by UUID NOT NULL REFERENCES public.profiles(id),
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    source TEXT NOT NULL CHECK (source IN ('frontend_calendar','casetilla_ingreso','casetilla_salida','external_api','auto_no_show','admin_override','scheduled_reconciliation','system')),
    source_event_id TEXT,
    ip_address TEXT,
    metadata_json JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT ck_attempts_different_status CHECK (previous_status_id <> requested_status_id)
);

COMMENT ON TABLE public.inout_state_transition_attempts IS 'Bitácora inmutable de TODO intento de cambio de estado, exitoso o bloqueado. Conserva historial completo.';
COMMENT ON COLUMN public.inout_state_transition_attempts.parent_attempt_id IS 'Auto-referencia al intento original en caso de re-intento con confirmación u override. Sin CASCADE: el historial se conserva.';

-- ---------------------------------------------------------------------------
-- 4. inout_incident_comments — Hilo de comentarios por incidencia (APPEND-ONLY)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inout_incident_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id),
    incident_id UUID NOT NULL REFERENCES public.inout_flow_incidents(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    comment_type TEXT NOT NULL DEFAULT 'note' CHECK (comment_type IN ('note','resolution','status_change','override','evidence')),
    content TEXT NOT NULL CHECK (length(content) > 0 AND length(content) <= 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.inout_incident_comments IS 'Comentarios de incidencias. APPEND-ONLY: no se permiten UPDATE ni DELETE. ON DELETE RESTRICT en incident_id conserva historial.';
COMMENT ON COLUMN public.inout_incident_comments.incident_id IS 'FK a inout_flow_incidents con ON DELETE RESTRICT: no se puede eliminar una incidencia que tenga comentarios.';

-- ---------------------------------------------------------------------------
-- 5. inout_report_schedules — Programación de reportes automáticos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inout_report_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id),
    name TEXT NOT NULL,
    description TEXT,
    frequency TEXT NOT NULL CHECK (frequency IN ('immediate','hourly','daily','weekly','manual')),
    schedule_config JSONB NOT NULL DEFAULT '{}',
    recipients JSONB NOT NULL DEFAULT '[]',
    cc JSONB NOT NULL DEFAULT '[]',
    bcc JSONB NOT NULL DEFAULT '[]',
    filters_json JSONB NOT NULL DEFAULT '{}',
    format TEXT NOT NULL DEFAULT 'html' CHECK (format IN ('html','pdf','excel','csv')),
    subject_template TEXT DEFAULT 'Reporte Flujo IN/OUT — {{date}}',
    body_template TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_sent_at TIMESTAMPTZ,
    next_scheduled_at TIMESTAMPTZ,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    updated_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.inout_report_schedules IS 'Configuración de reportes automáticos de flujo IN/OUT.';

-- ---------------------------------------------------------------------------
-- 6. inout_report_runs — Historial de ejecuciones de reportes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inout_report_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id),
    schedule_id UUID REFERENCES public.inout_report_schedules(id),
    execution_type TEXT NOT NULL CHECK (execution_type IN ('manual','automatico')),
    status TEXT NOT NULL DEFAULT 'programado' CHECK (status IN ('programado','en_proceso','enviado','fallido','reintentando')),
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    recipients_snapshot JSONB,
    incident_count INTEGER,
    format TEXT,
    file_url TEXT,
    file_size_bytes BIGINT,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    sent_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.inout_report_runs IS 'Historial de ejecuciones de reportes de flujo IN/OUT.';

-- ---------------------------------------------------------------------------
-- 7. inout_flow_audit_log — Registro inmutable de cambios administrativos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inout_flow_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id),
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    action TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    user_id UUID REFERENCES public.profiles(id),
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.inout_flow_audit_log IS 'Registro inmutable de cambios administrativos sobre el módulo IN/OUT. Solo INSERT, sin UPDATE ni DELETE.';

COMMIT;