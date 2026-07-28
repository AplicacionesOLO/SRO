# INOUT_FLOW_MIGRATION_SQL_SPECS.md — Especificaciones SQL Detalladas

> **Versión**: 2.0 | **Fecha**: 2026-07-24  
> **Complemento de**: `INOUT_FLOW_MIGRATION_PLAN.md`  
> **Dependencia**: `DATA_MODEL_ALIGNMENT.md` — modelo canónico  
> **Estado**: PENDIENTE APROBACIÓN — No ejecutar SQL

---

## 001_create_inout_tables.sql

```sql
BEGIN;

-- 1. inout_flow_rules (29 columnas, 10 CHECKs, 1 UNIQUE)
CREATE TABLE public.inout_flow_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id),
    warehouse_id UUID REFERENCES public.warehouses(id),
    client_id UUID REFERENCES public.clients(id),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL CHECK (category IN ('missing_event','duplicate','sequence','transition','terminal','consistency','exclusion')),
    trigger_event TEXT NOT NULL CHECK (trigger_event IN ('on_gate_in','on_status_change','on_gate_out','on_schedule','always')),
    conditions_json JSONB NOT NULL DEFAULT '',
    exclusions_json JSONB NOT NULL DEFAULT '',
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

-- 2. inout_flow_incidents (29 columnas, 4 CHECKs, 1 UNIQUE)
CREATE TABLE public.inout_flow_incidents (
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
    metadata_json JSONB NOT NULL DEFAULT '',
    idempotency_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_incidents_idempotency UNIQUE (org_id, idempotency_key)
);

-- 3. inout_state_transition_attempts (23 columnas, 3 CHECKs)
CREATE TABLE public.inout_state_transition_attempts (
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
    metadata_json JSONB NOT NULL DEFAULT '',
    CONSTRAINT ck_attempts_different_status CHECK (previous_status_id <> requested_status_id)
);

-- 4. inout_incident_comments (7 columnas, 1 CHECK)
CREATE TABLE public.inout_incident_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id),
    incident_id UUID NOT NULL REFERENCES public.inout_flow_incidents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    comment_type TEXT NOT NULL DEFAULT 'note' CHECK (comment_type IN ('note','resolution','status_change','override','evidence')),
    content TEXT NOT NULL CHECK (length(content) > 0 AND length(content) <= 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. inout_report_schedules (20 columnas, 1 CHECK)
CREATE TABLE public.inout_report_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id),
    name TEXT NOT NULL,
    description TEXT,
    frequency TEXT NOT NULL CHECK (frequency IN ('immediate','hourly','daily','weekly','manual')),
    schedule_config JSONB NOT NULL DEFAULT '',
    recipients JSONB NOT NULL DEFAULT '[]',
    cc JSONB NOT NULL DEFAULT '[]',
    bcc JSONB NOT NULL DEFAULT '[]',
    filters_json JSONB NOT NULL DEFAULT '',
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

-- 6. inout_report_runs (17 columnas, 2 CHECKs)
CREATE TABLE public.inout_report_runs (
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

-- 7. inout_flow_audit_log (10 columnas)
CREATE TABLE public.inout_flow_audit_log (
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

COMMIT;
```

---

## 002_create_inout_indexes.sql

```sql
BEGIN;

-- inout_flow_rules (6 índices)
CREATE INDEX idx_flow_rules_org_active ON public.inout_flow_rules (org_id, is_active) WHERE is_active = true;
CREATE INDEX idx_flow_rules_trigger ON public.inout_flow_rules (org_id, trigger_event, is_active) WHERE is_active = true;
CREATE INDEX idx_flow_rules_priority ON public.inout_flow_rules (org_id, priority);
CREATE INDEX idx_flow_rules_warehouse ON public.inout_flow_rules (org_id, warehouse_id) WHERE warehouse_id IS NOT NULL;
CREATE INDEX idx_flow_rules_client ON public.inout_flow_rules (org_id, client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_flow_rules_effective ON public.inout_flow_rules (effective_from, effective_to) WHERE effective_from IS NOT NULL OR effective_to IS NOT NULL;

-- inout_flow_incidents (8 índices)
CREATE INDEX idx_incidents_org_status ON public.inout_flow_incidents (org_id, status) WHERE status IN ('nueva','en_revision');
CREATE INDEX idx_incidents_reservation ON public.inout_flow_incidents (org_id, reservation_id);
CREATE INDEX idx_incidents_rule ON public.inout_flow_incidents (org_id, rule_id);
CREATE INDEX idx_incidents_detected ON public.inout_flow_incidents (org_id, first_detected_at DESC);
CREATE INDEX idx_incidents_type ON public.inout_flow_incidents (org_id, incident_type);
CREATE INDEX idx_incidents_severity ON public.inout_flow_incidents (org_id, severity) WHERE severity IN ('alta','critica');
CREATE INDEX idx_incidents_warehouse ON public.inout_flow_incidents (org_id, warehouse_id) WHERE warehouse_id IS NOT NULL;
CREATE INDEX idx_incidents_client ON public.inout_flow_incidents (org_id, client_id) WHERE client_id IS NOT NULL;

-- inout_state_transition_attempts (6 índices)
CREATE INDEX idx_attempts_reservation ON public.inout_state_transition_attempts (reservation_id, attempted_at DESC);
CREATE INDEX idx_attempts_org_time ON public.inout_state_transition_attempts (org_id, attempted_at DESC);
CREATE INDEX idx_attempts_blocked ON public.inout_state_transition_attempts (org_id, result) WHERE result IN ('blocked','failed_validation');
CREATE INDEX idx_attempts_user ON public.inout_state_transition_attempts (attempted_by, attempted_at DESC);
CREATE INDEX idx_attempts_parent ON public.inout_state_transition_attempts (parent_attempt_id) WHERE parent_attempt_id IS NOT NULL;
CREATE INDEX idx_attempts_pending_warning ON public.inout_state_transition_attempts (confirmation_status) WHERE confirmation_status = 'pending';

-- inout_incident_comments (1 índice)
CREATE INDEX idx_incident_comments_incident ON public.inout_incident_comments (incident_id, created_at DESC);

-- inout_report_schedules (2 índices)
CREATE INDEX idx_schedules_org_active ON public.inout_report_schedules (org_id, is_active) WHERE is_active = true;
CREATE INDEX idx_schedules_next ON public.inout_report_schedules (next_scheduled_at) WHERE is_active = true AND next_scheduled_at IS NOT NULL;

-- inout_report_runs (3 índices)
CREATE INDEX idx_runs_org_time ON public.inout_report_runs (org_id, created_at DESC);
CREATE INDEX idx_runs_schedule ON public.inout_report_runs (schedule_id, created_at DESC) WHERE schedule_id IS NOT NULL;
CREATE INDEX idx_runs_status ON public.inout_report_runs (status) WHERE status IN ('programado','en_proceso','reintentando');

-- inout_flow_audit_log (3 índices)
CREATE INDEX idx_audit_org_time ON public.inout_flow_audit_log (org_id, created_at DESC);
CREATE INDEX idx_audit_entity ON public.inout_flow_audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_user ON public.inout_flow_audit_log (user_id, created_at DESC) WHERE user_id IS NOT NULL;

COMMIT;
```

---

## 003_create_inout_rls.sql

```sql
BEGIN;

ALTER TABLE public.inout_flow_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inout_flow_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inout_state_transition_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inout_incident_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inout_report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inout_report_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inout_flow_audit_log ENABLE ROW LEVEL SECURITY;

-- === inout_flow_rules ===

CREATE POLICY "Flow rules - SELECT" ON public.inout_flow_rules FOR SELECT
USING (org_id IN (
    SELECT uor.org_id FROM public.user_org_roles uor
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = auth.uid() AND p.name = 'casetilla.flow_report.rules.view'
));

CREATE POLICY "Flow rules - INSERT" ON public.inout_flow_rules FOR INSERT
WITH CHECK (org_id IN (
    SELECT uor.org_id FROM public.user_org_roles uor
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = auth.uid() AND p.name = 'casetilla.flow_report.rules.manage'
));

CREATE POLICY "Flow rules - UPDATE" ON public.inout_flow_rules FOR UPDATE
USING (org_id IN (
    SELECT uor.org_id FROM public.user_org_roles uor
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = auth.uid() AND p.name = 'casetilla.flow_report.rules.manage'
))
WITH CHECK (org_id IN (
    SELECT uor.org_id FROM public.user_org_roles uor
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = auth.uid() AND p.name = 'casetilla.flow_report.rules.manage'
));

-- === inout_flow_incidents ===

CREATE POLICY "Incidents - SELECT" ON public.inout_flow_incidents FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.user_org_roles uor
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = auth.uid() AND uor.org_id = inout_flow_incidents.org_id
      AND p.name = 'casetilla.flow_report.incidents.view'
));

CREATE POLICY "Incidents - INSERT" ON public.inout_flow_incidents FOR INSERT WITH CHECK (true);
CREATE POLICY "Incidents - UPDATE" ON public.inout_flow_incidents FOR UPDATE USING (true) WITH CHECK (true);

-- === inout_state_transition_attempts ===

CREATE POLICY "Attempts - SELECT" ON public.inout_state_transition_attempts FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.user_org_roles uor
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = auth.uid() AND uor.org_id = inout_state_transition_attempts.org_id
      AND p.name = 'casetilla.flow_report.audit.view'
));

CREATE POLICY "Attempts - INSERT" ON public.inout_state_transition_attempts FOR INSERT WITH CHECK (true);
CREATE POLICY "Attempts - UPDATE" ON public.inout_state_transition_attempts FOR UPDATE USING (true) WITH CHECK (true);

-- === inout_incident_comments ===

CREATE POLICY "Comments - SELECT" ON public.inout_incident_comments FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.user_org_roles uor
    WHERE uor.user_id = auth.uid() AND uor.org_id = inout_incident_comments.org_id
));

CREATE POLICY "Comments - INSERT" ON public.inout_incident_comments FOR INSERT
WITH CHECK (org_id IN (
    SELECT uor.org_id FROM public.user_org_roles uor WHERE uor.user_id = auth.uid()
));

CREATE POLICY "Comments - UPDATE" ON public.inout_incident_comments FOR UPDATE
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Comments - DELETE" ON public.inout_incident_comments FOR DELETE
USING (user_id = auth.uid());

-- === inout_report_schedules ===

CREATE POLICY "Schedules - SELECT" ON public.inout_report_schedules FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.user_org_roles uor
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = auth.uid() AND uor.org_id = inout_report_schedules.org_id
      AND p.name = 'casetilla.flow_report.schedules.manage'
));

CREATE POLICY "Schedules - INSERT" ON public.inout_report_schedules FOR INSERT
WITH CHECK (org_id IN (
    SELECT uor.org_id FROM public.user_org_roles uor
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = auth.uid() AND p.name = 'casetilla.flow_report.schedules.manage'
));

CREATE POLICY "Schedules - UPDATE" ON public.inout_report_schedules FOR UPDATE
USING (EXISTS (
    SELECT 1 FROM public.user_org_roles uor
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = auth.uid() AND uor.org_id = inout_report_schedules.org_id
      AND p.name = 'casetilla.flow_report.schedules.manage'
))
WITH CHECK (org_id IN (
    SELECT uor.org_id FROM public.user_org_roles uor
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = auth.uid() AND p.name = 'casetilla.flow_report.schedules.manage'
));

CREATE POLICY "Schedules - DELETE" ON public.inout_report_schedules FOR DELETE
USING (EXISTS (
    SELECT 1 FROM public.user_org_roles uor
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = auth.uid() AND uor.org_id = inout_report_schedules.org_id
      AND p.name = 'casetilla.flow_report.schedules.manage'
));

-- === inout_report_runs ===

CREATE POLICY "Runs - SELECT" ON public.inout_report_runs FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.user_org_roles uor
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = auth.uid() AND uor.org_id = inout_report_runs.org_id
      AND p.name = 'casetilla.flow_report.audit.view'
));

CREATE POLICY "Runs - INSERT" ON public.inout_report_runs FOR INSERT WITH CHECK (true);
CREATE POLICY "Runs - UPDATE" ON public.inout_report_runs FOR UPDATE USING (true) WITH CHECK (true);

-- === inout_flow_audit_log ===

CREATE POLICY "Audit - SELECT" ON public.inout_flow_audit_log FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.user_org_roles uor
    JOIN public.role_permissions rp ON uor.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = auth.uid() AND uor.org_id = inout_flow_audit_log.org_id
      AND p.name = 'casetilla.flow_report.audit.view'
));

CREATE POLICY "Audit - INSERT" ON public.inout_flow_audit_log FOR INSERT WITH CHECK (true);

COMMIT;
```

---

## 004_create_inout_permissions.sql

```sql
BEGIN;

INSERT INTO public.permissions (name, description, category) VALUES
('casetilla.flow_report.view',              'Ver el módulo de Cumplimiento Logístico', 'casetilla'),
('casetilla.flow_report.rules.view',        'Ver reglas de flujo IN/OUT',              'casetilla'),
('casetilla.flow_report.rules.manage',      'Crear, editar y gestionar reglas',        'casetilla'),
('casetilla.flow_report.incidents.view',    'Ver incidencias de flujo',                'casetilla'),
('casetilla.flow_report.incidents.resolve', 'Gestionar incidencias (asignar, resolver, ignorar)', 'casetilla'),
('casetilla.flow_report.incidents.override', 'Ejecutar override administrativo de reglas block', 'casetilla'),
('casetilla.flow_report.reports.send',      'Enviar reportes manuales',                'casetilla'),
('casetilla.flow_report.schedules.manage',  'Gestionar programación de reportes',      'casetilla'),
('casetilla.flow_report.audit.view',        'Ver bitácora de auditoría de flujo',      'casetilla');

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE p.name LIKE 'casetilla.flow_report.%'
  AND (r.name ILIKE '%admin%' OR r.name ILIKE '%superadmin%' OR r.name ILIKE '%full_access%' OR r.name ILIKE '%super_admin%')
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp2 WHERE rp2.role_id = r.id AND rp2.permission_id = p.id
  );

COMMIT;
```

---

## 005_create_inout_provisioning.sql

```sql
-- ⛔ NO EJECUTAR — Especificación. El SQL se generará al aprobarse la Fase 6.1.
--
-- CREATE OR REPLACE FUNCTION public.provision_inout_flow_for_org(p_org_id UUID)
-- RETURNS JSONB
-- LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'pg_catalog', 'public'
-- AS $$
-- DECLARE
--     v_admin_profile_id UUID;
--     v_rules_created INTEGER := 0;
--     v_rules_existing INTEGER := 0;
-- BEGIN
--     -- 1. Validar que la organización exista
--     IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_org_id) THEN
--         RETURN jsonb_build_object('success', false, 'message', 'Organización no encontrada');
--     END IF;
--     -- 2. Obtener perfil administrador para created_by
--     SELECT p.id INTO v_admin_profile_id FROM public.profiles p
--     JOIN public.user_org_roles uor ON p.id = uor.user_id
--     WHERE uor.org_id = p_org_id LIMIT 1;
--     IF v_admin_profile_id IS NULL THEN
--         RETURN jsonb_build_object('success', false, 'message', 'Sin perfil admin');
--     END IF;
--     -- 3. Insertar 16 reglas con ON CONFLICT DO NOTHING
--     -- (mismo bloque de seeds que 006, pero envuelto en conteo)
--     -- 4. Retornar resumen
--     RETURN jsonb_build_object(
--         'success', true, 'org_id', p_org_id,
--         'rules_created', v_rules_created,
--         'rules_existing', v_rules_existing,
--         'permissions_checked', 9
--     );
-- END;
-- $$;
--
-- REVOKE EXECUTE ON FUNCTION public.provision_inout_flow_for_org FROM PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.provision_inout_flow_for_org TO authenticated, service_role;
```

**Propósito**: Función idempotente de aprovisionamiento. Crea reglas faltantes sin sobrescribir configuración existente. Puede ejecutarse múltiples veces. Retorna conteo estructurado.

**Idempotencia**: 100%. `ON CONFLICT (org_id, code) DO NOTHING` garantiza cero duplicados.

---

## 006_seed_inout_rules.sql

```sql
BEGIN;

DO $$
DECLARE
    v_org RECORD;
    v_admin_profile_id UUID;
BEGIN
    FOR v_org IN SELECT id FROM public.organizations LOOP
        SELECT p.id INTO v_admin_profile_id
        FROM public.profiles p
        JOIN public.user_org_roles uor ON p.id = uor.user_id
        JOIN public.role_permissions rp ON uor.role_id = rp.role_id
        JOIN public.permissions perm ON rp.permission_id = perm.id
        WHERE uor.org_id = v_org.id AND perm.name = 'casetilla.flow_report.rules.manage'
        LIMIT 1;
        
        IF v_admin_profile_id IS NULL THEN
            SELECT p.id INTO v_admin_profile_id
            FROM public.profiles p
            JOIN public.user_org_roles uor ON p.id = uor.user_id
            WHERE uor.org_id = v_org.id LIMIT 1;
        END IF;
        
        IF v_admin_profile_id IS NULL THEN CONTINUE; END IF;

        -- R01 STATUS_WITHOUT_GATE_IN
        INSERT INTO public.inout_flow_rules (org_id,code,name,description,category,trigger_event,conditions_json,severity,enforcement_mode,is_system_rule,edit_policy,notification_mode,applies_retroactively,priority,created_by,updated_by)
        VALUES (v_org.id,'STATUS_WITHOUT_GATE_IN','Cambio a estado operativo sin ingreso por casetilla','Detecta cuando una cita avanza a estados operativos sin registro de ingreso en casetilla_ingresos.','missing_event','on_status_change','{"required_new_status_codes":["ARRIVED_PENDING_UNLOAD","IN_PROGRESS","PENDING_DISCHARGE","START","UNLOADING","DISCHARGED"],"require_event_tables":["casetilla_ingresos"],"event_check":"not_exists"}','alta','block',true,'locked','none',true,10,v_admin_profile_id,v_admin_profile_id)
        ON CONFLICT (org_id, code) DO NOTHING;

        -- R02 GATE_OUT_WITHOUT_GATE_IN
        INSERT INTO public.inout_flow_rules (org_id,code,name,description,category,trigger_event,conditions_json,severity,enforcement_mode,is_system_rule,edit_policy,notification_mode,applies_retroactively,priority,created_by,updated_by)
        VALUES (v_org.id,'GATE_OUT_WITHOUT_GATE_IN','Salida por casetilla sin ingreso previo','Detecta salida en casetilla_salidas sin ingreso previo en casetilla_ingresos.','sequence','on_gate_out','{"require_event_tables":["casetilla_ingresos"],"event_check":"exists"}','critica','block',true,'locked','immediate',true,10,v_admin_profile_id,v_admin_profile_id)
        ON CONFLICT (org_id, code) DO NOTHING;

        -- R03 DISPATCHED_WITHOUT_GATE_OUT
        INSERT INTO public.inout_flow_rules (org_id,code,name,description,category,trigger_event,conditions_json,severity,enforcement_mode,is_system_rule,edit_policy,notification_mode,applies_retroactively,priority,created_by,updated_by)
        VALUES (v_org.id,'DISPATCHED_WITHOUT_GATE_OUT','Cambio a DISPATCHED sin salida por casetilla','Detecta cambio a DISPATCHED sin registro de salida.','missing_event','on_status_change','{"required_new_status_codes":["DISPATCHED"],"require_event_tables":["casetilla_salidas"],"event_check":"not_exists"}','alta','block',true,'locked','none',true,10,v_admin_profile_id,v_admin_profile_id)
        ON CONFLICT (org_id, code) DO NOTHING;

        -- R04 DONE_WITHOUT_GATE_OUT
        INSERT INTO public.inout_flow_rules (org_id,code,name,description,category,trigger_event,conditions_json,severity,enforcement_mode,is_system_rule,edit_policy,notification_mode,applies_retroactively,priority,created_by,updated_by)
        VALUES (v_org.id,'DONE_WITHOUT_GATE_OUT','Cambio a DONE sin salida por casetilla','Advierte cuando una cita llega a DONE sin registro de salida.','missing_event','on_status_change','{"required_new_status_codes":["DONE"],"require_event_tables":["casetilla_salidas"],"event_check":"not_exists"}','alta','warn',true,'locked','none',true,20,v_admin_profile_id,v_admin_profile_id)
        ON CONFLICT (org_id, code) DO NOTHING;

        -- R05 DUPLICATE_GATE_IN
        INSERT INTO public.inout_flow_rules (org_id,code,name,description,category,trigger_event,conditions_json,severity,enforcement_mode,is_system_rule,edit_policy,notification_mode,applies_retroactively,priority,created_by,updated_by)
        VALUES (v_org.id,'DUPLICATE_GATE_IN','Ingreso duplicado por casetilla','Detecta más de un ingreso para la misma cita.','duplicate','on_gate_in','{"min_occurrences":2,"event_check":"exists"}','media','observe',true,'locked','none',true,30,v_admin_profile_id,v_admin_profile_id)
        ON CONFLICT (org_id, code) DO NOTHING;

        -- R06 DUPLICATE_GATE_OUT
        INSERT INTO public.inout_flow_rules (org_id,code,name,description,category,trigger_event,conditions_json,severity,enforcement_mode,is_system_rule,edit_policy,notification_mode,applies_retroactively,priority,created_by,updated_by)
        VALUES (v_org.id,'DUPLICATE_GATE_OUT','Salida duplicada por casetilla','Detecta más de una salida para la misma cita.','duplicate','on_gate_out','{"min_occurrences":2,"event_check":"exists"}','media','observe',true,'locked','none',true,30,v_admin_profile_id,v_admin_profile_id)
        ON CONFLICT (org_id, code) DO NOTHING;

        -- R07 GATE_OUT_BEFORE_GATE_IN
        INSERT INTO public.inout_flow_rules (org_id,code,name,description,category,trigger_event,conditions_json,severity,enforcement_mode,is_system_rule,edit_policy,notification_mode,applies_retroactively,priority,created_by,updated_by)
        VALUES (v_org.id,'GATE_OUT_BEFORE_GATE_IN','Salida con timestamp anterior al ingreso','Detecta timestamp de salida anterior al timestamp de ingreso.','sequence','on_gate_out','{"require_event_tables":["casetilla_ingresos","casetilla_salidas"],"require_event_order":[["casetilla_ingresos","casetilla_salidas"]],"require_timestamp_order":[["casetilla_ingresos.created_at","casetilla_salidas.created_at"]]}','critica','block',true,'locked','immediate',true,10,v_admin_profile_id,v_admin_profile_id)
        ON CONFLICT (org_id, code) DO NOTHING;

        -- R08 STATUS_BEFORE_GATE_IN
        INSERT INTO public.inout_flow_rules (org_id,code,name,description,category,trigger_event,conditions_json,severity,enforcement_mode,is_system_rule,edit_policy,notification_mode,applies_retroactively,priority,created_by,updated_by)
        VALUES (v_org.id,'STATUS_BEFORE_GATE_IN','Cambio de estado operativo antes del ingreso','Detecta cambio de estado con timestamp anterior al ingreso por casetilla.','sequence','on_status_change','{"require_event_tables":["casetilla_ingresos"],"event_check":"exists","require_timestamp_order":[["casetilla_ingresos.created_at","activity_log.created_at"]]}','media','observe',true,'locked','none',true,30,v_admin_profile_id,v_admin_profile_id)
        ON CONFLICT (org_id, code) DO NOTHING;

        -- R09 INVALID_STATUS_TRANSITION
        INSERT INTO public.inout_flow_rules (org_id,code,name,description,category,trigger_event,conditions_json,severity,enforcement_mode,is_system_rule,edit_policy,notification_mode,applies_retroactively,priority,created_by,updated_by)
        VALUES (v_org.id,'INVALID_STATUS_TRANSITION','Transición de estado no permitida','Bloquea transiciones no contempladas en la matriz de estados.','transition','on_status_change','','alta','block',true,'locked','none',false,50,v_admin_profile_id,v_admin_profile_id)
        ON CONFLICT (org_id, code) DO NOTHING;

        -- R10 DISPATCHED_REOPEN_ATTEMPT
        INSERT INTO public.inout_flow_rules (org_id,code,name,description,category,trigger_event,conditions_json,severity,enforcement_mode,is_system_rule,edit_policy,notification_mode,applies_retroactively,priority,created_by,updated_by)
        VALUES (v_org.id,'DISPATCHED_REOPEN_ATTEMPT','Intento de reabrir una cita despachada','Bloquea retroceso desde DISPATCHED. Solo permite avanzar a DONE.','terminal','on_status_change','{"required_previous_status_codes":["DISPATCHED"],"prohibited_new_status_codes":["DONE"]}','alta','block',true,'locked','immediate',false,10,v_admin_profile_id,v_admin_profile_id)
        ON CONFLICT (org_id, code) DO NOTHING;

        -- R11 DONE_REOPEN_ATTEMPT
        INSERT INTO public.inout_flow_rules (org_id,code,name,description,category,trigger_event,conditions_json,severity,enforcement_mode,is_system_rule,edit_policy,notification_mode,applies_retroactively,priority,created_by,updated_by)
        VALUES (v_org.id,'DONE_REOPEN_ATTEMPT','Intento de modificar una cita completada','Bloquea cualquier modificación desde DONE. Protección máxima.','terminal','on_status_change','{"required_previous_status_codes":["DONE"]}','alta','block',true,'locked','immediate',false,10,v_admin_profile_id,v_admin_profile_id)
        ON CONFLICT (org_id, code) DO NOTHING;

        -- R12 ACTIVITY_AFTER_CANCELLED
        INSERT INTO public.inout_flow_rules (org_id,code,name,description,category,trigger_event,conditions_json,severity,enforcement_mode,is_system_rule,edit_policy,notification_mode,applies_retroactively,priority,created_by,updated_by)
        VALUES (v_org.id,'ACTIVITY_AFTER_CANCELLED','Actividad posterior a la cancelación','Detecta eventos posteriores a una cancelación.','consistency','on_schedule','{"require_is_cancelled":true}','media','observe',true,'locked','daily',true,30,v_admin_profile_id,v_admin_profile_id)
        ON CONFLICT (org_id, code) DO NOTHING;

        -- R13 ACTIVITY_AFTER_NO_SHOW
        INSERT INTO public.inout_flow_rules (org_id,code,name,description,category,trigger_event,conditions_json,severity,enforcement_mode,is_system_rule,edit_policy,notification_mode,applies_retroactively,priority,created_by,updated_by)
        VALUES (v_org.id,'ACTIVITY_AFTER_NO_SHOW','Actividad posterior a No-Show','Advierte al cambiar estado de cita NO_SHOW.','consistency','on_status_change','{"required_previous_status_codes":["NO_SHOW"]}','media','warn',true,'locked','none',false,30,v_admin_profile_id,v_admin_profile_id)
        ON CONFLICT (org_id, code) DO NOTHING;

        -- R14 WAREHOUSE_MISMATCH
        INSERT INTO public.inout_flow_rules (org_id,code,name,description,category,trigger_event,conditions_json,severity,enforcement_mode,is_system_rule,edit_policy,notification_mode,applies_retroactively,priority,created_by,updated_by)
        VALUES (v_org.id,'WAREHOUSE_MISMATCH','Evento en almacén diferente al de la cita','Detecta eventos en almacén incorrecto.','consistency','always','{"require_same_warehouse":true}','media','observe',true,'locked','daily',true,30,v_admin_profile_id,v_admin_profile_id)
        ON CONFLICT (org_id, code) DO NOTHING;

        -- R15 TEMPORAL_INCONSISTENCY
        INSERT INTO public.inout_flow_rules (org_id,code,name,description,category,trigger_event,conditions_json,severity,enforcement_mode,is_system_rule,edit_policy,notification_mode,applies_retroactively,priority,grace_period_minutes,created_by,updated_by)
        VALUES (v_org.id,'TEMPORAL_INCONSISTENCY','Inconsistencia temporal entre eventos','Detecta orden cronológico inconsistente. Red de seguridad temporal.','consistency','on_schedule','','baja','observe',true,'locked','weekly',true,100,5,v_admin_profile_id,v_admin_profile_id)
        ON CONFLICT (org_id, code) DO NOTHING;

        -- R16 INCOMPLETE_DATA
        INSERT INTO public.inout_flow_rules (org_id,code,name,description,category,trigger_event,conditions_json,severity,enforcement_mode,is_system_rule,edit_policy,notification_mode,applies_retroactively,priority,created_by,updated_by)
        VALUES (v_org.id,'INCOMPLETE_DATA','Datos incompletos en cita operativa','Detecta campos obligatorios vacíos en citas operativas.','consistency','on_schedule','{"required_fields":["driver","truck_plate","purchase_order"]}','baja','observe',true,'locked','weekly',true,100,v_admin_profile_id,v_admin_profile_id)
        ON CONFLICT (org_id, code) DO NOTHING;

    END LOOP;
END $$;

COMMIT;
```

---

## 007_create_rule_helpers.sql

```sql
BEGIN;

CREATE OR REPLACE FUNCTION public.inout_get_user_org_role(p_user_id UUID, p_org_id UUID) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'pg_catalog', 'public'
AS $$ SELECT r.name FROM public.user_org_roles uor JOIN public.roles r ON uor.role_id = r.id WHERE uor.user_id = p_user_id AND uor.org_id = p_org_id LIMIT 1; $$;
REVOKE EXECUTE ON FUNCTION public.inout_get_user_org_role FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inout_get_user_org_role TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.inout_has_permission(p_user_id UUID, p_org_id UUID, p_permission_name TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'pg_catalog', 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_org_roles uor JOIN public.role_permissions rp ON uor.role_id = rp.role_id JOIN public.permissions p ON rp.permission_id = p.id WHERE uor.user_id = p_user_id AND uor.org_id = p_org_id AND p.name = p_permission_name); $$;
REVOKE EXECUTE ON FUNCTION public.inout_has_permission FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inout_has_permission TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.inout_generate_idempotency_key(p_org_id UUID, p_rule_code TEXT, p_event_reference TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE SET search_path = 'pg_catalog', 'public'
AS $$ SELECT md5(p_org_id::text || '::' || p_rule_code || '::' || p_event_reference); $$;
REVOKE EXECUTE ON FUNCTION public.inout_generate_idempotency_key FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inout_generate_idempotency_key TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.inout_get_max_severity(p_severities TEXT[]) RETURNS TEXT
LANGUAGE sql IMMUTABLE SET search_path = 'pg_catalog', 'public'
AS $$ SELECT CASE WHEN 'critica' = ANY(p_severities) THEN 'critica' WHEN 'alta' = ANY(p_severities) THEN 'alta' WHEN 'media' = ANY(p_severities) THEN 'media' WHEN 'baja' = ANY(p_severities) THEN 'baja' ELSE 'informativa' END; $$;
REVOKE EXECUTE ON FUNCTION public.inout_get_max_severity FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inout_get_max_severity TO authenticated, service_role;

COMMIT;
```

---

## 008_create_transition_rpc.sql

> **Estado**: NO GENERADO  
> **Fase**: 6.2 — RULE ENGINE COMPLETO  
> **Contenido**: Especificación futura — SIN SQL EJECUTABLE

### Alcance de la RPC completa (Fase 6.2)

La función `transition_reservation_status()` debe implementar desde su primera versión:

- `auth.uid()` resuelto internamente (nunca desde parámetro)
- Autorización: validación de organización y permisos
- `LEFT JOIN public.docks d ON d.id = r.dock_id` para resolver `resolved_warehouse_id`
- `SELECT ... FOR UPDATE` sobre `reservations r` con JOIN a docks
- `p_expected_current_status_id` para bloqueo optimista
- Rule Loader con filtro por `resolved_warehouse_id`
- Rule Evaluator con iteración de reglas ordenadas por prioridad
- Conflict Resolver con precedencia block > warn > observe
- Incident Generator con `idempotency_key` y `ON CONFLICT DO UPDATE`
- Notification Dispatcher con soporte para `immediate` vía `correspondence_outbox`
- `BTRIM(code)` en todas las comparaciones de `reservation_statuses.code` (para manejar `DISCHARGED` con espacio)
- Si `docks.warehouse_id IS NULL`, solo aplican reglas de organización (`warehouse_id IS NULL`)
- `inout_flow_incidents.warehouse_id` almacena el warehouse resuelto como snapshot histórico
- Respuesta JSON estructurada: `{success, blocked, warn, conflict, attempt_id, incident_ids, message}`

### Lo que NO debe tener

- ❌ SQL parcial ejecutable
- ❌ Stub que permita transiciones sin validación
- ❌ `warehouse_id` como columna directa de reservations
- ❌ `GRANT EXECUTE` antes de Fase 6.2
- ❌ Comparaciones de `code` sin `BTRIM()`

---

## 009_enable_status_guard.sql

```sql
-- ⛔ NO EJECUTAR EN FASE 6.1 — SOLO EN FASE 6.5
-- PRECONDICIÓN: todos los callers migrados

BEGIN;

CREATE OR REPLACE FUNCTION public.block_unauthorized_status_update() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'pg_catalog', 'public'
AS $$
BEGIN
    IF OLD.status_id IS NOT DISTINCT FROM NEW.status_id THEN RETURN NEW; END IF;
    IF current_setting('app.transition_authorized', true) = 'true' THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Actualización directa de status_id no permitida. Use transition_reservation_status().';
END;
$$;

DROP TRIGGER IF EXISTS trg_block_unauthorized_status_update ON public.reservations;
CREATE TRIGGER trg_block_unauthorized_status_update
    BEFORE UPDATE OF status_id ON public.reservations
    FOR EACH ROW EXECUTE FUNCTION public.block_unauthorized_status_update();

REVOKE UPDATE (status_id) ON public.reservations FROM authenticated;
REVOKE UPDATE (status_id) ON public.reservations FROM anon;

COMMIT;
```

---

## 010_rollback_inout_module.sql

```sql
BEGIN;

DROP TRIGGER IF EXISTS trg_block_unauthorized_status_update ON public.reservations;
DROP FUNCTION IF EXISTS public.block_unauthorized_status_update();
DROP FUNCTION IF EXISTS public.transition_reservation_status;
DROP FUNCTION IF EXISTS public.inout_get_user_org_role;
DROP FUNCTION IF EXISTS public.inout_has_permission;
DROP FUNCTION IF EXISTS public.inout_generate_idempotency_key;
DROP FUNCTION IF EXISTS public.inout_get_max_severity;

ALTER TABLE IF EXISTS public.inout_flow_rules DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inout_flow_incidents DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inout_state_transition_attempts DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inout_incident_comments DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inout_report_schedules DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inout_report_runs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inout_flow_audit_log DISABLE ROW LEVEL SECURITY;

DELETE FROM public.role_permissions WHERE permission_id IN (SELECT id FROM public.permissions WHERE name LIKE 'casetilla.flow_report.%');
DELETE FROM public.permissions WHERE name LIKE 'casetilla.flow_report.%';

DROP TABLE IF EXISTS public.inout_incident_comments CASCADE;
DROP TABLE IF EXISTS public.inout_flow_audit_log CASCADE;
DROP TABLE IF EXISTS public.inout_report_runs CASCADE;
DROP TABLE IF EXISTS public.inout_report_schedules CASCADE;
DROP TABLE IF EXISTS public.inout_state_transition_attempts CASCADE;
DROP TABLE IF EXISTS public.inout_flow_incidents CASCADE;
DROP TABLE IF EXISTS public.inout_flow_rules CASCADE;

COMMIT;
```