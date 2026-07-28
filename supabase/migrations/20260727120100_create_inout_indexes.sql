-- ============================================================================
-- 002_create_inout_indexes.sql
-- Fase 6.1 — BASE ESTRUCTURAL PASIVA
-- Crea 29 índices sobre las 7 tablas del módulo IN/OUT Flow
--
-- CORRECCIONES APLICADAS (v2.1):
--   ✅ Índices de soporte para RLS (org_id siempre en primer lugar)
--   ✅ Índices parciales para queries frecuentes (is_active, status)
--   ✅ Índices para búsquedas por reservation_id, rule_id, user_id
--   ✅ Sin cambios respecto a especificación original — índices son pasivos
-- ============================================================================

BEGIN;

-- ===========================================================================
-- inout_flow_rules (6 índices)
-- ===========================================================================

-- Búsqueda de reglas activas por organización (usado por Rule Loader)
CREATE INDEX IF NOT EXISTS idx_flow_rules_org_active
    ON public.inout_flow_rules (org_id, is_active)
    WHERE is_active = true;

-- Búsqueda de reglas por trigger_event (evaluación en tiempo real)
CREATE INDEX IF NOT EXISTS idx_flow_rules_trigger
    ON public.inout_flow_rules (org_id, trigger_event, is_active)
    WHERE is_active = true;

-- Ordenamiento por prioridad dentro de la organización
CREATE INDEX IF NOT EXISTS idx_flow_rules_priority
    ON public.inout_flow_rules (org_id, priority);

-- Filtro por warehouse (reglas específicas de almacén)
CREATE INDEX IF NOT EXISTS idx_flow_rules_warehouse
    ON public.inout_flow_rules (org_id, warehouse_id)
    WHERE warehouse_id IS NOT NULL;

-- Filtro por cliente (reglas específicas de cliente)
CREATE INDEX IF NOT EXISTS idx_flow_rules_client
    ON public.inout_flow_rules (org_id, client_id)
    WHERE client_id IS NOT NULL;

-- Rango de vigencia (effective_from / effective_to)
CREATE INDEX IF NOT EXISTS idx_flow_rules_effective
    ON public.inout_flow_rules (effective_from, effective_to)
    WHERE effective_from IS NOT NULL OR effective_to IS NOT NULL;

-- ===========================================================================
-- inout_flow_incidents (8 índices)
-- ===========================================================================

-- Incidencias activas por org (dashboard, métricas)
CREATE INDEX IF NOT EXISTS idx_incidents_org_status
    ON public.inout_flow_incidents (org_id, status)
    WHERE status IN ('nueva','en_revision');

-- Búsqueda por reserva (detalle de cita)
CREATE INDEX IF NOT EXISTS idx_incidents_reservation
    ON public.inout_flow_incidents (org_id, reservation_id);

-- Búsqueda por regla (análisis de reglas)
CREATE INDEX IF NOT EXISTS idx_incidents_rule
    ON public.inout_flow_incidents (org_id, rule_id);

-- Orden cronológico (timeline, reportes)
CREATE INDEX IF NOT EXISTS idx_incidents_detected
    ON public.inout_flow_incidents (org_id, first_detected_at DESC);

-- Agrupación por tipo de incidencia
CREATE INDEX IF NOT EXISTS idx_incidents_type
    ON public.inout_flow_incidents (org_id, incident_type);

-- Incidencias graves (alertas)
CREATE INDEX IF NOT EXISTS idx_incidents_severity
    ON public.inout_flow_incidents (org_id, severity)
    WHERE severity IN ('alta','critica');

-- Filtro por warehouse
CREATE INDEX IF NOT EXISTS idx_incidents_warehouse
    ON public.inout_flow_incidents (org_id, warehouse_id)
    WHERE warehouse_id IS NOT NULL;

-- Filtro por cliente
CREATE INDEX IF NOT EXISTS idx_incidents_client
    ON public.inout_flow_incidents (org_id, client_id)
    WHERE client_id IS NOT NULL;

-- ===========================================================================
-- inout_state_transition_attempts (6 índices)
-- ===========================================================================

-- Historial de intentos por reserva
CREATE INDEX IF NOT EXISTS idx_attempts_reservation
    ON public.inout_state_transition_attempts (reservation_id, attempted_at DESC);

-- Timeline por organización
CREATE INDEX IF NOT EXISTS idx_attempts_org_time
    ON public.inout_state_transition_attempts (org_id, attempted_at DESC);

-- Intentos bloqueados (métricas, auditoría)
CREATE INDEX IF NOT EXISTS idx_attempts_blocked
    ON public.inout_state_transition_attempts (org_id, result)
    WHERE result IN ('blocked','failed_validation');

-- Actividad por usuario
CREATE INDEX IF NOT EXISTS idx_attempts_user
    ON public.inout_state_transition_attempts (attempted_by, attempted_at DESC);

-- Re-intentos (confirmación/override vinculados al intento original)
CREATE INDEX IF NOT EXISTS idx_attempts_parent
    ON public.inout_state_transition_attempts (parent_attempt_id)
    WHERE parent_attempt_id IS NOT NULL;

-- Advertencias pendientes de confirmación
CREATE INDEX IF NOT EXISTS idx_attempts_pending_warning
    ON public.inout_state_transition_attempts (confirmation_status)
    WHERE confirmation_status = 'pending';

-- ===========================================================================
-- inout_incident_comments (1 índice)
-- ===========================================================================

-- Hilo de comentarios ordenado cronológicamente
CREATE INDEX IF NOT EXISTS idx_incident_comments_incident
    ON public.inout_incident_comments (incident_id, created_at DESC);

-- ===========================================================================
-- inout_report_schedules (2 índices)
-- ===========================================================================

-- Schedules activos por organización
CREATE INDEX IF NOT EXISTS idx_schedules_org_active
    ON public.inout_report_schedules (org_id, is_active)
    WHERE is_active = true;

-- Próximos envíos programados (cron / polling)
CREATE INDEX IF NOT EXISTS idx_schedules_next
    ON public.inout_report_schedules (next_scheduled_at)
    WHERE is_active = true AND next_scheduled_at IS NOT NULL;

-- ===========================================================================
-- inout_report_runs (3 índices)
-- ===========================================================================

-- Historial de ejecuciones por organización
CREATE INDEX IF NOT EXISTS idx_runs_org_time
    ON public.inout_report_runs (org_id, created_at DESC);

-- Ejecuciones de un schedule específico
CREATE INDEX IF NOT EXISTS idx_runs_schedule
    ON public.inout_report_runs (schedule_id, created_at DESC)
    WHERE schedule_id IS NOT NULL;

-- Runs en progreso (monitoreo)
CREATE INDEX IF NOT EXISTS idx_runs_status
    ON public.inout_report_runs (status)
    WHERE status IN ('programado','en_proceso','reintentando');

-- ===========================================================================
-- inout_flow_audit_log (3 índices)
-- ===========================================================================

-- Auditoría por organización (más frecuente)
CREATE INDEX IF NOT EXISTS idx_audit_org_time
    ON public.inout_flow_audit_log (org_id, created_at DESC);

-- Auditoría por entidad (trazabilidad de un objeto específico)
CREATE INDEX IF NOT EXISTS idx_audit_entity
    ON public.inout_flow_audit_log (entity_type, entity_id, created_at DESC);

-- Auditoría por usuario (accountability)
CREATE INDEX IF NOT EXISTS idx_audit_user
    ON public.inout_flow_audit_log (user_id, created_at DESC)
    WHERE user_id IS NOT NULL;

-- ===========================================================================
-- Total: 29 índices
-- ===========================================================================

COMMIT;