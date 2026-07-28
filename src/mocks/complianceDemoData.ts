import type {
  ComplianceSummary,
  ComplianceMetric,
  ComplianceReservation,
  RuleEngineExecution,
  RuleEngineStage,
  EvaluatedRule,
  ComplianceIncident,
  ComplianceTimelineEvent,
  ComplianceAuditEvent,
  WarehouseResolution,
  ComplianceTechnicalContext,
  ComplianceReservationDetail,
} from '@/types/compliance';

// ─── Métricas demo ────────────────────────────────────────────────────

export const demoMetrics: ComplianceMetric[] = [
  { label: 'Reservas evaluadas', value: 1247, previousValue: 1180, changePercent: 5.7, icon: 'ri-file-list-3-line', color: 'teal', tooltip: 'Total de reservas que pasaron por el Rule Engine en el período' },
  { label: 'Flujo correcto', value: 1103, previousValue: 1040, changePercent: 6.1, icon: 'ri-check-double-line', color: 'emerald', tooltip: 'Reservas que completaron todas las transiciones sin advertencias ni bloqueos', filterResult: 'PASS' },
  { label: 'Incidencias abiertas', value: 42, previousValue: 38, changePercent: 10.5, icon: 'ri-error-warning-line', color: 'amber', tooltip: 'Incidencias que requieren atención o resolución', filterView: 'incidents', filterIncidentStatus: 'OPEN' },
  { label: 'Transiciones bloqueadas', value: 18, previousValue: 12, changePercent: 50, icon: 'ri-forbid-line', color: 'red', tooltip: 'Intentos de transición bloqueados por reglas del motor', filterResult: 'BLOCK' },
  { label: 'Overrides realizados', value: 7, previousValue: 5, changePercent: 40, icon: 'ri-shield-flash-line', color: 'violet', tooltip: 'Overrides autorizados por ADMIN o Full Access', filterResult: 'BLOCK' },
  { label: 'Tiempo promedio resolución', value: 14.3, previousValue: 18.1, changePercent: -21, icon: 'ri-timer-line', color: 'cyan', tooltip: 'Minutos promedio desde que se abre una incidencia hasta su resolución', format: 'duration' },
];

export const demoSummary: ComplianceSummary = {
  totalPeriod: 1247,
  totalEvaluated: 1247,
  passed: 1103,
  warned: 84,
  blocked: 18,
  errored: 2,
  notEvaluated: 40,
  openIncidents: 42,
  overrides: 7,
  avgResolutionMs: 858000,
  compliancePercent: 88.5,
  periodStart: '2026-07-01T00:00:00Z',
  periodEnd: '2026-07-24T23:59:59Z',
  metrics: demoMetrics,
  dataSource: 'demo',
  dataLoadError: false,
};

// ─── Pipeline demo ─────────────────────────────────────────────────────

export const demoPipelineStages: RuleEngineStage[] = [
  { id: 'context', name: 'Reservation Context', status: 'success', processedCount: 1247, durationMs: 2, icon: 'ri-database-2-line', summary: 'Contexto de reserva resuelto: dock, warehouse, organización, cliente', details: 'Resuelve el warehouse vía dock_id → docks.warehouse_id. Carga metadata de la reserva y su historial de estados.' },
  { id: 'loader', name: 'Rule Loader', status: 'success', processedCount: 1247, durationMs: 8, icon: 'ri-book-open-line', summary: '16 reglas cargadas · 8 aplicables en promedio · 8 omitidas', details: 'Carga las reglas activas filtrando por org_id, warehouse_id (resuelto) y client_id. Reglas con warehouse_id=NULL aplican a nivel organización.\n📊 Por reserva: 16 cargadas | 8 aplicables (6 PASSED + 2 FAILED) | 8 omitidas (NOT_APPLICABLE)\n📦 Total: 16 × 1,247 = 19,952 reglas evaluadas en el período' },
  { id: 'evaluator', name: 'Rule Evaluator', status: 'warning', processedCount: 1247, durationMs: 32, icon: 'ri-scales-line', summary: '1,103 PASS · 84 WARN · 18 BLOCK · 2 ERROR · 40 NOT_EVALUATED', details: '📥 Entrada: 16 reglas cargadas, 8 aplicables en promedio\n📊 Resultados por reserva:\n   · 7,482 PASSED (6 × 1,247)\n   · 2,494 FAILED (2 × 1,247)\n   · 9,976 SKIPPED/NOT_APPLICABLE (8 × 1,247)\n📊 Resultados agregados: 1,103 PASS · 84 WARN · 18 BLOCK · 2 ERROR · 40 NOT EVALUATED\n🔑 Regla determinante más frecuente: R14 (Warehouse consistency) — 42 incidencias\n⏱️ Tiempo promedio por regla: 2.0 ms | Tiempo total de evaluación: 32 ms' },
  { id: 'resolver', name: 'Conflict Resolver', status: 'success', processedCount: 1247, durationMs: 5, icon: 'ri-git-branch-line', summary: '0 conflictos detectados, 7 overrides aplicados', details: 'Resuelve conflictos cuando múltiples reglas generan acciones contradictorias. Los overrides requieren autorización y se registran en auditoría.' },
  { id: 'incident', name: 'Incident Generator', status: 'warning', processedCount: 1247, durationMs: 4, icon: 'ri-alert-line', summary: '102 incidencias generadas, 42 abiertas, 60 resueltas', details: 'Genera incidencias para reglas FAILED y BLOCK. Agrupa por idempotency_key para evitar duplicados. Escala severidad si la incidencia reabre.' },
  { id: 'notifier', name: 'Notification Dispatcher', status: 'success', processedCount: 1247, durationMs: 12, icon: 'ri-notification-3-line', summary: '186 notificaciones enviadas, 0 fallidas', details: 'Despacha notificaciones según configuración de severidad. Los BLOCK generan notificación inmediata; los WARN se agrupan en lotes de 5 minutos.' },
];

export const demoPipelineExecution: RuleEngineExecution = {
  id: 'demo-exec-001',
  reservationId: 'demo-res-001',
  stages: demoPipelineStages,
  result: 'WARN',
  severity: 'HIGH',
  startedAt: '2026-07-24T10:15:00Z',
  completedAt: '2026-07-24T10:15:00Z',
  totalDurationMs: 63,
  isDemo: true,
};

// ─── Warehouse Resolution demo ──────────────────────────────────────────

export const demoWarehouseResolution: WarehouseResolution = {
  reservationId: 'demo-res-001',
  dockId: 'dock-uuid-001',
  dockName: 'Andén A-12',
  resolvedWarehouseId: 'wh-uuid-003',
  warehouseName: 'Almacén Central #3',
  orgName: 'Operaciones Logísticas CR',
  couldNotResolve: false,
};

// ─── Reglas demo ────────────────────────────────────────────────────────

export const demoEvaluatedRules: EvaluatedRule[] = [
  // ── Aplicables (applied=true) ── 8 reglas: 6 PASSED + 2 FAILED ──
  { code: 'R01', name: 'Valid status transition', category: 'state_validation', priority: 1, severity: 'CRITICAL', applied: true, result: 'PASSED', reason: 'Transición CONFIRMED → ARRIVED_PENDING_UNLOAD es válida en la matriz de estados', conditions: 'from_status = CONFIRMED, to_status = ARRIVED_PENDING_UNLOAD', action: null, evaluationTimeMs: 2 },
  { code: 'R02', name: 'Unidirectional flow', category: 'state_validation', priority: 2, severity: 'HIGH', applied: true, result: 'PASSED', reason: 'No se detectó regresión en el flujo de estados', conditions: 'previous_status in (PENDING, CONFIRMED), current_status = ARRIVED_PENDING_UNLOAD', action: null, evaluationTimeMs: 1 },
  { code: 'R03', name: 'No skip intermediate state', category: 'state_validation', priority: 3, severity: 'HIGH', applied: true, result: 'PASSED', reason: 'Todos los estados intermedios fueron registrados correctamente', conditions: 'missing_states = []', action: null, evaluationTimeMs: 2 },
  { code: 'R05', name: 'Client dock assignment', category: 'client_check', priority: 5, severity: 'MEDIUM', applied: true, result: 'PASSED', reason: 'El dock A-12 está asignado al cliente Importaciones Centroamérica', conditions: 'client_docks contains dock-a12', action: null, evaluationTimeMs: 2 },
  { code: 'R08', name: 'Required documents check', category: 'authorization_check', priority: 8, severity: 'HIGH', applied: true, result: 'FAILED', reason: 'DUA vencido. Fecha de vigencia: 2026-06-15. Se requiere documento actualizado.', conditions: 'document_type = DUA, expiry_date >= current_date', action: 'BLOCK', evaluationTimeMs: 7 },
  { code: 'R10', name: 'Within business hours', category: 'temporal_check', priority: 10, severity: 'LOW', applied: true, result: 'PASSED', reason: '10:15 AM está dentro del horario hábil (07:00-18:00)', conditions: 'current_time between business_start and business_end', action: null, evaluationTimeMs: 1 },
  { code: 'R12', name: 'Not cancelled', category: 'state_validation', priority: 12, severity: 'CRITICAL', applied: true, result: 'PASSED', reason: 'La reserva no está cancelada', conditions: 'is_cancelled = false', action: null, evaluationTimeMs: 1 },
  { code: 'R14', name: 'Warehouse consistency', category: 'warehouse_check', priority: 14, severity: 'HIGH', applied: true, result: 'FAILED', reason: 'Warehouse esperado: Almacén Central #3. Warehouse detectado: Almacén Norte #2. Discrepancia de ubicación.', conditions: 'resolved_warehouse_id = expected_warehouse_id, expected = Almacén Central #3, detected = Almacén Norte #2', action: 'BLOCK', evaluationTimeMs: 4 },
  // ── No aplicables (applied=false) ── 8 reglas omitidas ──
  { code: 'R04', name: 'Cannot transition from terminal', category: 'state_validation', priority: 4, severity: 'CRITICAL', applied: false, result: 'NOT_APPLICABLE', reason: 'El estado actual (ARRIVED_PENDING_UNLOAD) no es terminal', conditions: 'current_status in (CANCELLED, DONE, NO_SHOW)', action: null, evaluationTimeMs: 1 },
  { code: 'R06', name: 'Provider active check', category: 'client_check', priority: 6, severity: 'MEDIUM', applied: false, result: 'NOT_APPLICABLE', reason: 'El proveedor no tiene restricción de actividad en este almacén', conditions: 'provider.status = ACTIVE, provider.warehouse_id = resolved_warehouse_id', action: null, evaluationTimeMs: 1 },
  { code: 'R07', name: 'Import documentation', category: 'authorization_check', priority: 7, severity: 'MEDIUM', applied: false, result: 'NOT_APPLICABLE', reason: 'La operación no es de importación. No se requieren documentos aduanales.', conditions: 'operation_type = IMPORT, document_type = DUA', action: null, evaluationTimeMs: 1 },
  { code: 'R09', name: 'Concurrency check', category: 'concurrency_check', priority: 9, severity: 'MEDIUM', applied: false, result: 'NOT_APPLICABLE', reason: 'No se detectaron operaciones concurrentes sobre la misma reserva', conditions: 'concurrent_operations > 0', action: null, evaluationTimeMs: 1 },
  { code: 'R11', name: 'Same day cutoff', category: 'temporal_check', priority: 11, severity: 'LOW', applied: false, result: 'NOT_APPLICABLE', reason: 'La reserva no tiene configurada regla de cutoff para el mismo día', conditions: 'same_day_cutoff_enabled = true', action: null, evaluationTimeMs: 1 },
  { code: 'R13', name: 'Weight capacity check', category: 'warehouse_check', priority: 13, severity: 'MEDIUM', applied: false, result: 'NOT_APPLICABLE', reason: 'El dock A-12 no tiene límite de peso configurado', conditions: 'dock.max_weight_kg > 0, cargo.weight_kg > dock.max_weight_kg', action: null, evaluationTimeMs: 1 },
  { code: 'R15', name: 'Temperature compliance', category: 'warehouse_check', priority: 15, severity: 'LOW', applied: false, result: 'NOT_APPLICABLE', reason: 'La carga no requiere temperatura controlada', conditions: 'cargo.requires_temperature_control = true', action: null, evaluationTimeMs: 1 },
  { code: 'R16', name: 'Insurance coverage', category: 'authorization_check', priority: 16, severity: 'HIGH', applied: false, result: 'NOT_APPLICABLE', reason: 'El proveedor no tiene requisito de cobertura de seguro para este almacén', conditions: 'provider.insurance_required = true, provider.insurance_valid = false', action: null, evaluationTimeMs: 1 },
];

// ─── Incidencias demo ───────────────────────────────────────────────────

export const demoIncidents: ComplianceIncident[] = [
  { id: 'inc-001', reservationId: 'res-8472', code: 'INC-2026-0847', title: 'Discrepancia de warehouse detectada', description: 'El vehículo se presentó en Almacén Central #5 pero la cita estaba programada para Almacén Norte #2.', severity: 'HIGH', status: 'OPEN', warehouseId: 'wh-uuid-005', warehouseName: 'Almacén Central #5', ruleCode: 'R14', ruleName: 'Warehouse consistency', createdAt: '2026-07-24T08:22:00Z', updatedAt: '2026-07-24T09:15:00Z', resolvedAt: null, resolvedBy: null, assigneeId: 'user-001', assigneeName: 'Carlos Méndez', occurrenceCount: 1, lastDetectedAt: '2026-07-24T08:22:00Z', openDurationHours: 2.2 },
  { id: 'inc-002', reservationId: 'res-9102', code: 'INC-2026-0846', title: 'Intento de transición inválida', description: 'Se intentó mover la reserva de CONFIRMED directamente a DISPATCHED, saltando todos los estados intermedios requeridos.', severity: 'HIGH', status: 'OPEN', warehouseId: 'wh-uuid-003', warehouseName: 'Almacén Central #3', ruleCode: 'R03', ruleName: 'No skip intermediate state', createdAt: '2026-07-24T08:10:00Z', updatedAt: '2026-07-24T08:10:00Z', resolvedAt: null, resolvedBy: null, assigneeId: 'user-002', assigneeName: 'María Solano', occurrenceCount: 2, lastDetectedAt: '2026-07-24T08:15:00Z', openDurationHours: 2.4 },
  { id: 'inc-003', reservationId: 'res-7654', code: 'INC-2026-0845', title: 'Overflow de concurrencia', description: 'Dos operadores intentaron registrar el ingreso simultáneamente para la misma reserva.', severity: 'MEDIUM', status: 'IN_REVIEW', warehouseId: 'wh-uuid-001', warehouseName: 'Almacén Norte #2', ruleCode: 'R09', ruleName: 'Concurrency check', createdAt: '2026-07-24T07:55:00Z', updatedAt: '2026-07-24T09:30:00Z', resolvedAt: null, resolvedBy: null, assigneeId: 'user-003', assigneeName: 'Roberto Jiménez', occurrenceCount: 1, lastDetectedAt: '2026-07-24T07:55:00Z', openDurationHours: 2.7 },
  { id: 'inc-004', reservationId: 'res-5543', code: 'INC-2026-0844', title: 'Documentación incompleta detectada', description: 'La reserva no tiene DUA asociado a pesar de ser una operación de importación.', severity: 'LOW', status: 'RESOLVED', warehouseId: 'wh-uuid-002', warehouseName: 'Depósito Sur', ruleCode: 'R07', ruleName: 'Import documentation', createdAt: '2026-07-23T16:40:00Z', updatedAt: '2026-07-24T07:00:00Z', resolvedAt: '2026-07-24T07:00:00Z', resolvedBy: 'Ana Vega', assigneeId: 'user-004', assigneeName: 'Ana Vega', occurrenceCount: 1, lastDetectedAt: '2026-07-23T16:40:00Z', openDurationHours: 14.3 },
  { id: 'inc-005', reservationId: 'res-1123', code: 'INC-2026-0843', title: 'Timeout de notificación', description: 'El sistema de notificaciones no respondió a tiempo. Reintento exitoso en el segundo intento.', severity: 'INFO', status: 'DISMISSED', warehouseId: 'wh-uuid-003', warehouseName: 'Almacén Central #3', ruleCode: null, ruleName: null, createdAt: '2026-07-24T06:12:00Z', updatedAt: '2026-07-24T06:14:00Z', resolvedAt: '2026-07-24T06:14:00Z', resolvedBy: 'Sistema', assigneeId: null, assigneeName: null, occurrenceCount: 1, lastDetectedAt: '2026-07-24T06:12:00Z', openDurationHours: 0.03 },
];

// ─── Timeline demo ──────────────────────────────────────────────────────

export const demoTimeline: ComplianceTimelineEvent[] = [
  { id: 'evt-01', timestamp: '2026-07-24T09:00:00Z', type: 'reservation_created', actor: 'user-maria', actorName: 'María Solano', description: 'Reserva creada para 24/07/2026 10:00 AM', source: 'frontend_calendar', metadata: { dock: 'Andén A-12', provider: 'Logística Express S.A.' } },
  { id: 'evt-02', timestamp: '2026-07-24T10:05:00Z', type: 'arrival', actor: 'user-carlos', actorName: 'Carlos Méndez', description: 'Vehículo arribó a Punto de Control', source: 'casetilla_ingreso', metadata: { gate: 'Puerta Principal', truckPlate: 'C-123456' } },
  { id: 'evt-03', timestamp: '2026-07-24T10:06:00Z', type: 'status_change', actor: 'user-carlos', actorName: 'Carlos Méndez', description: 'Estado cambió de CONFIRMED → ARRIVED_PENDING_UNLOAD', source: 'casetilla_ingreso', metadata: { fromStatus: 'CONFIRMED', toStatus: 'ARRIVED_PENDING_UNLOAD' } },
  { id: 'evt-04', timestamp: '2026-07-24T10:15:00Z', type: 'rule_evaluation', actor: null, actorName: null, description: 'Rule Engine evaluó 16 reglas: 6 PASSED, 2 FAILED, 8 NOT_APPLICABLE', source: 'rule_engine', metadata: { rulesEvaluated: 16, passed: 6, failed: 2, notApplicable: 8, durationMs: 63 } },
  { id: 'evt-05', timestamp: '2026-07-24T10:15:00Z', type: 'transition_allowed', actor: null, actorName: null, description: 'Transición permitida: verificación de warehouse consistente', source: 'rule_engine', metadata: { resolvedWarehouse: 'Almacén Central #3', expectedWarehouse: 'Almacén Central #3' } },
  { id: 'evt-06', timestamp: '2026-07-24T10:15:30Z', type: 'notification_sent', actor: null, actorName: null, description: 'Notificación de ingreso enviada al cliente', source: 'notification_dispatcher', metadata: { channel: 'email', recipient: 'cliente@ejemplo.com' } },
  { id: 'evt-07', timestamp: '2026-07-24T14:30:00Z', type: 'status_change', actor: 'user-roberto', actorName: 'Roberto Jiménez', description: 'Estado cambió de UNLOADING → DISCHARGED', source: 'frontend_calendar', metadata: { fromStatus: 'UNLOADING', toStatus: 'DISCHARGED' } },
  { id: 'evt-08', timestamp: '2026-07-24T15:45:00Z', type: 'status_change', actor: 'user-ana', actorName: 'Ana Vega', description: 'Estado cambió de DISCHARGED → DISPATCHED', source: 'casetilla_salida', metadata: { fromStatus: 'DISCHARGED', toStatus: 'DISPATCHED' } },
  { id: 'evt-09', timestamp: '2026-07-24T15:46:00Z', type: 'notification_sent', actor: null, actorName: null, description: 'Notificación de salida enviada', source: 'notification_dispatcher', metadata: { channel: 'email', recipient: 'proveedor@logistica.com' } },
];

// ─── Auditoría demo ─────────────────────────────────────────────────────

export const demoAuditLog: ComplianceAuditEvent[] = [
  { id: 'aud-01', userId: 'user-carlos', userName: 'Carlos Méndez', action: 'Registró ingreso en Punto de Control', timestamp: '2026-07-24T10:06:00Z', source: 'casetilla_ingreso', ipAddress: '192.168.1.45', previousState: 'CONFIRMED', newState: 'ARRIVED_PENDING_UNLOAD', comment: null, activityLogId: 'act-001' },
  { id: 'aud-02', userId: null, userName: 'Rule Engine', action: 'Evaluación de reglas completada', timestamp: '2026-07-24T10:15:00Z', source: 'rule_engine', ipAddress: null, previousState: null, newState: null, comment: '16 evaluadas: 6 PASSED, 2 FAILED (R08, R14), 8 NOT_APPLICABLE', activityLogId: null },
  { id: 'aud-03', userId: 'user-roberto', userName: 'Roberto Jiménez', action: 'Cambió estado de reserva', timestamp: '2026-07-24T14:30:00Z', source: 'frontend_calendar', ipAddress: '192.168.2.12', previousState: 'UNLOADING', newState: 'DISCHARGED', comment: 'Descarga completada', activityLogId: 'act-003' },
  { id: 'aud-04', userId: 'user-ana', userName: 'Ana Vega', action: 'Registró salida en Punto de Control', timestamp: '2026-07-24T15:45:00Z', source: 'casetilla_salida', ipAddress: '192.168.1.50', previousState: 'DISCHARGED', newState: 'DISPATCHED', comment: null, activityLogId: 'act-004' },
  { id: 'aud-05', userId: 'user-admin', userName: 'Admin Sistema', action: 'Override aplicado — transición forzada', timestamp: '2026-07-23T11:20:00Z', source: 'admin_override', ipAddress: '192.168.1.10', previousState: 'BLOCKED', newState: 'IN_PROGRESS', comment: 'Fallo de comunicación con la terminal justificó el override', activityLogId: 'act-099' },
];

// ─── Contexto técnico demo ──────────────────────────────────────────────

export const demoTechnicalContext: ComplianceTechnicalContext = {
  reservationContext: {
    id: 'res-8472',
    org_id: 'org-001',
    dock_id: 'dock-a12',
    start_datetime: '2026-07-24T10:00:00Z',
    status_id: 'status-confirmed',
    is_cancelled: false,
    operation_type: 'distribucion',
    shipper_provider: 'prov-logistica-express',
  },
  resolvedWarehouseId: 'wh-uuid-003',
  applicableRules: ['R01', 'R02', 'R03', 'R05', 'R08', 'R10', 'R12', 'R14'],
  conditionsJson: {
    from_status: 'CONFIRMED',
    to_status: 'ARRIVED_PENDING_UNLOAD',
    resolved_warehouse_id: 'wh-uuid-003',
    dock_id: 'dock-a12',
    is_cancelled: false,
    current_time: '2026-07-24T10:15:00Z',
    business_hours: { start: '07:00', end: '18:00' },
  },
  evaluatedJson: {
    rules_evaluated: 16,
    applicable: 8,
    passed: 6,
    failed: 2,
    not_applicable: 8,
    details: {
      R01: { result: 'PASSED', reason: 'Transición válida en matriz de estados', timeMs: 2 },
      R02: { result: 'PASSED', reason: 'Sin regresión en flujo de estados', timeMs: 1 },
      R03: { result: 'PASSED', reason: 'Sin saltos de estados intermedios', timeMs: 2 },
      R04: { result: 'NOT_APPLICABLE', reason: 'Estado actual no es terminal', timeMs: 1 },
      R05: { result: 'PASSED', reason: 'Dock asignado al cliente', timeMs: 2 },
      R06: { result: 'NOT_APPLICABLE', reason: 'Proveedor sin restricción de actividad', timeMs: 1 },
      R07: { result: 'NOT_APPLICABLE', reason: 'Operación no es de importación', timeMs: 1 },
      R08: { result: 'FAILED', reason: 'DUA vencido — fecha vigencia 2026-06-15', timeMs: 7 },
      R09: { result: 'NOT_APPLICABLE', reason: 'Sin operaciones concurrentes', timeMs: 1 },
      R10: { result: 'PASSED', reason: 'Dentro de horario hábil', timeMs: 1 },
      R11: { result: 'NOT_APPLICABLE', reason: 'Sin regla de cutoff configurada', timeMs: 1 },
      R12: { result: 'PASSED', reason: 'Reserva no cancelada', timeMs: 1 },
      R13: { result: 'NOT_APPLICABLE', reason: 'Dock sin límite de peso', timeMs: 1 },
      R14: { result: 'FAILED', reason: 'Warehouse esperado: Almacén Central #3, detectado: Almacén Norte #2', timeMs: 4 },
      R15: { result: 'NOT_APPLICABLE', reason: 'Carga sin requerimiento de temperatura', timeMs: 1 },
      R16: { result: 'NOT_APPLICABLE', reason: 'Proveedor sin requisito de seguro', timeMs: 1 },
    },
  },
  resolutionJson: {
    finalResult: 'WARN',
    blockerRule: 'R08',
    decisiveRule: 'R08 — Required documents check',
    applicableCount: 8,
    passedCount: 6,
    failedCount: 2,
    warnings: ['DUA vencido (R08) — acción BLOCK', 'Discrepancia de warehouse (R14) — acción BLOCK'],
    overridesApplied: [],
    conflictResolved: false,
    totalEvaluationMs: 25,
  },
  incidentPayload: null,
  notificationPayload: {
    channels: ['email'],
    recipients: ['cliente@ejemplo.com'],
    template: 'arrival_notification',
    sent: true,
    timestamp: '2026-07-24T10:15:30Z',
  },
};

// ─── Reservas demo ──────────────────────────────────────────────────────

export const demoReservations: ComplianceReservation[] = [
  { id: 'res-8472', reservationDate: '2026-07-24', reservationTime: '10:00', clientName: 'Importaciones Centroamérica', clientId: 'client-001', providerName: 'Logística Express S.A.', driver: 'Juan Ramírez', truckPlate: 'C-123456', dockId: 'dock-a12', dockName: 'Andén A-12', warehouseId: 'wh-uuid-003', warehouseName: 'Almacén Central #3', currentStatus: 'ARRIVED_PENDING_UNLOAD', previousStatus: 'CONFIRMED', result: 'WARN', severity: 'HIGH', incidentCount: 2, rulesApplied: 8, rulesTotal: 16, lastActivity: '2026-07-24T15:46:00Z', decisiveRule: 'R08', decisiveRuleName: 'Required documents check', warehouseResolution: { reservationId: 'res-8472', dockId: 'dock-a12', dockName: 'Andén A-12', resolvedWarehouseId: 'wh-uuid-003', warehouseName: 'Almacén Central #3', orgName: 'Operaciones Logísticas CR', couldNotResolve: false }, isDemo: true, isRealData: false },
  { id: 'res-9102', reservationDate: '2026-07-24', reservationTime: '09:30', clientName: 'Distribuidora Pacífico', clientId: 'client-002', providerName: 'Transportes Rápidos', driver: 'Miguel Ángel López', truckPlate: 'C-789012', dockId: 'dock-b05', dockName: 'Andén B-05', warehouseId: 'wh-uuid-005', warehouseName: 'Almacén Central #5', currentStatus: 'CONFIRMED', previousStatus: 'PENDING', result: 'BLOCK', severity: 'HIGH', incidentCount: 2, rulesApplied: 8, rulesTotal: 8, lastActivity: '2026-07-24T08:15:00Z', decisiveRule: 'R03', decisiveRuleName: 'No skip intermediate state', warehouseResolution: { reservationId: 'res-9102', dockId: 'dock-b05', dockName: 'Andén B-05', resolvedWarehouseId: 'wh-uuid-005', warehouseName: 'Almacén Central #5', orgName: 'Operaciones Logísticas CR', couldNotResolve: false }, isDemo: true, isRealData: false },
  { id: 'res-7654', reservationDate: '2026-07-24', reservationTime: '11:00', clientName: 'AgroExportaciones del Sur', clientId: 'client-003', providerName: 'Carga Pesada Internacional', driver: 'Diego Fernández', truckPlate: 'T-456789', dockId: 'dock-c03', dockName: 'Andén C-03', warehouseId: 'wh-uuid-001', warehouseName: 'Almacén Norte #2', currentStatus: 'IN_PROGRESS', previousStatus: 'ARRIVED_PENDING_UNLOAD', result: 'WARN', severity: 'MEDIUM', incidentCount: 1, rulesApplied: 7, rulesTotal: 8, lastActivity: '2026-07-24T09:30:00Z', decisiveRule: 'R14', decisiveRuleName: 'Warehouse consistency', warehouseResolution: { reservationId: 'res-7654', dockId: 'dock-c03', dockName: 'Andén C-03', resolvedWarehouseId: 'wh-uuid-001', warehouseName: 'Almacén Norte #2', orgName: 'Operaciones Logísticas CR', couldNotResolve: false }, isDemo: true, isRealData: false },
  { id: 'res-5543', reservationDate: '2026-07-24', reservationTime: '14:00', clientName: 'Electrónicos Globales', clientId: 'client-004', providerName: 'Mudanzas Seguras', driver: 'Oscar Valverde', truckPlate: 'M-345678', dockId: 'dock-d07', dockName: 'Andén D-07', warehouseId: 'wh-uuid-002', warehouseName: 'Depósito Sur', currentStatus: 'DONE', previousStatus: 'DISPATCHED', result: 'PASS', severity: null, incidentCount: 0, rulesApplied: 8, rulesTotal: 8, lastActivity: '2026-07-24T08:00:00Z', decisiveRule: null, decisiveRuleName: null, warehouseResolution: { reservationId: 'res-5543', dockId: 'dock-d07', dockName: 'Andén D-07', resolvedWarehouseId: 'wh-uuid-002', warehouseName: 'Depósito Sur', orgName: 'Operaciones Logísticas CR', couldNotResolve: false }, isDemo: true, isRealData: false },
  { id: 'res-1123', reservationDate: '2026-07-24', reservationTime: '07:30', clientName: 'Farmacéutica Nacional', clientId: 'client-005', providerName: 'Entregas Prioritarias', driver: 'Luis Guevara', truckPlate: 'P-901234', dockId: 'dock-d01', dockName: 'Andén D-01', warehouseId: 'wh-uuid-003', warehouseName: 'Almacén Central #3', currentStatus: 'DISPATCHED', previousStatus: 'DISCHARGED', result: 'PASS', severity: null, incidentCount: 0, rulesApplied: 8, rulesTotal: 8, lastActivity: '2026-07-24T06:30:00Z', decisiveRule: null, decisiveRuleName: null, warehouseResolution: { reservationId: 'res-1123', dockId: 'dock-d01', dockName: 'Andén D-01', resolvedWarehouseId: 'wh-uuid-003', warehouseName: 'Almacén Central #3', orgName: 'Operaciones Logísticas CR', couldNotResolve: false }, isDemo: true },
  { id: 'res-3390', reservationDate: '2026-07-23', reservationTime: '16:00', clientName: 'Alimentos Premium', clientId: 'client-006', providerName: 'Frío Transporte', driver: 'Erick Solís', truckPlate: 'R-567890', dockId: 'dock-e11', dockName: 'Andén E-11', warehouseId: 'wh-uuid-004', warehouseName: 'Centro de Distribución Este', currentStatus: 'BLOCKED', previousStatus: 'IN_PROGRESS', result: 'ERROR', severity: 'CRITICAL', incidentCount: 3, rulesApplied: 8, rulesTotal: 8, lastActivity: '2026-07-23T18:22:00Z', decisiveRule: 'R09', decisiveRuleName: 'Concurrency check', warehouseResolution: { reservationId: 'res-3390', dockId: 'dock-e11', dockName: 'Andén E-11', resolvedWarehouseId: null, warehouseName: null, orgName: 'Operaciones Logísticas CR', couldNotResolve: true }, isDemo: true, isRealData: false },
];

// ─── Detalle completo demo ──────────────────────────────────────────────

export const demoReservationDetail: ComplianceReservationDetail = {
  ...demoReservations[0],
  execution: { ...demoPipelineExecution, reservationId: 'res-8472' },
  evaluatedRules: demoEvaluatedRules,
  incidents: [demoIncidents[0]],
  timeline: demoTimeline,
  auditLog: demoAuditLog,
  technicalContext: demoTechnicalContext,
};

export function getDemoReservationDetail(reservationId: string): ComplianceReservationDetail {
  return {
    ...demoReservationDetail,
    id: reservationId,
    execution: { ...demoReservationDetail.execution, reservationId },
    warehouseResolution: { ...demoReservationDetail.warehouseResolution, reservationId },
  };
}