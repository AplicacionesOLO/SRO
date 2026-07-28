// ─── Tipos para el submódulo Compliance Center ──────────────────────────

/** Feature flag: modo demo mientras el backend no está implementado */
export const INOUT_COMPLIANCE_DEMO_MODE = true;

/** Modo de fuente de datos: cuando se conectan datos reales pero Rule Engine sigue en demo */
export type ComplianceDataSource = 'demo' | 'hybrid' | 'live';

/** Indicador visual de fuente de dato */
export type DataSourceTag = 'REAL' | 'SIMULADO';

/** Resultado de evaluación de una transición */
export type ComplianceResult = 'PASS' | 'WARN' | 'BLOCK' | 'ERROR' | 'NOT_EVALUATED';

/** Estado de un nodo del pipeline */
export type PipelineNodeStatus = 'pending' | 'processing' | 'success' | 'warning' | 'blocked' | 'error' | 'skipped';

/** Estado de una incidencia */
export type IncidentStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED' | 'VOIDED';

/** Severidad de una incidencia */
export type IncidentSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Resultado de una regla evaluada */
export type RuleResult = 'PASSED' | 'FAILED' | 'SKIPPED' | 'NOT_APPLICABLE' | 'ERROR';

/** Categoría de regla */
export type RuleCategory = 'state_validation' | 'warehouse_check' | 'client_check' | 'temporal_check' | 'concurrency_check' | 'authorization_check' | 'system';

// ─── Métricas ────────────────────────────────────────────────────────────

export interface ComplianceMetric {
  label: string;
  value: number;
  previousValue?: number;
  changePercent?: number;
  icon: string;
  color: string;
  tooltip: string;
  format?: 'number' | 'percent' | 'duration';
  filterResult?: ComplianceResult;
  filterView?: 'incidents';
  filterIncidentStatus?: IncidentStatus;
}

export interface ComplianceSummary {
  /** Total de reservas operativas en el período (REAL desde BD) */
  totalPeriod: number;
  /** Reservas que pasaron por el Rule Engine — 0 mientras el motor no esté conectado */
  totalEvaluated: number;
  passed: number;
  warned: number;
  blocked: number;
  errored: number;
  notEvaluated: number;
  openIncidents: number;
  overrides: number;
  avgResolutionMs: number;
  compliancePercent: number;
  periodStart: string;
  periodEnd: string;
  metrics: ComplianceMetric[];
  /** Modo de fuente de datos */
  dataSource: ComplianceDataSource;
  /** Si true, hubo error al cargar datos reales y se muestran datos demo */
  dataLoadError: boolean;
}

// ─── Pipeline ────────────────────────────────────────────────────────────

export interface RuleEngineStage {
  id: string;
  name: string;
  status: PipelineNodeStatus;
  processedCount: number;
  durationMs: number;
  icon: string;
  summary: string;
  details?: string;
}

export interface RuleEngineExecution {
  id: string;
  reservationId: string;
  stages: RuleEngineStage[];
  result: ComplianceResult;
  severity: IncidentSeverity | null;
  startedAt: string;
  completedAt: string;
  totalDurationMs: number;
  isDemo: boolean;
}

// ─── Warehouse Resolution ────────────────────────────────────────────────

export interface WarehouseResolution {
  reservationId: string;
  dockId: string | null;
  dockName: string | null;
  resolvedWarehouseId: string | null;
  warehouseName: string | null;
  orgName: string | null;
  couldNotResolve: boolean;
}

// ─── Reglas evaluadas ────────────────────────────────────────────────────

export interface EvaluatedRule {
  code: string;
  name: string;
  category: RuleCategory;
  priority: number;
  severity: IncidentSeverity;
  applied: boolean;
  result: RuleResult;
  reason: string | null;
  conditions: string | null;
  action: string | null;
  evaluationTimeMs: number;
}

// ─── Incidencias ─────────────────────────────────────────────────────────

export interface ComplianceIncident {
  id: string;
  reservationId: string;
  code: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  warehouseId: string | null;
  warehouseName: string | null;
  ruleCode: string | null;
  ruleName: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  occurrenceCount: number;
  lastDetectedAt: string;
  openDurationHours: number;
}

// ─── Timeline ────────────────────────────────────────────────────────────

export type TimelineEventType =
  | 'reservation_created'
  | 'arrival'
  | 'check_in'
  | 'status_change'
  | 'rule_evaluation'
  | 'transition_allowed'
  | 'transition_blocked'
  | 'incident_created'
  | 'notification_sent'
  | 'comment_added'
  | 'override_requested'
  | 'override_applied'
  | 'incident_resolved'
  | 'system';

export interface ComplianceTimelineEvent {
  id: string;
  timestamp: string;
  type: TimelineEventType;
  actor: string | null;
  actorName: string | null;
  description: string;
  source: string;
  metadata: Record<string, unknown> | null;
}

// ─── Auditoría ───────────────────────────────────────────────────────────

export interface ComplianceAuditEvent {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  timestamp: string;
  source: string;
  ipAddress: string | null;
  previousState: string | null;
  newState: string | null;
  comment: string | null;
  activityLogId: string | null;
}

// ─── Filtros ─────────────────────────────────────────────────────────────

export interface ComplianceFilters {
  dateFrom: string | null;
  dateTo: string | null;
  orgId: string | null;
  warehouseId: string | null;
  clientId: string | null;
  statusCode: string | null;
  severity: IncidentSeverity | null;
  searchTerm: string;
  result: ComplianceResult | null;
  incidentStatus: IncidentStatus | null;
  ruleCode: string | null;
  page: number;
  pageSize: number;
}

// ─── Detalle de reserva para Compliance ──────────────────────────────────

export interface ComplianceReservation {
  id: string;
  reservationDate: string;
  reservationTime: string;
  clientName: string | null;
  clientId: string | null;
  providerName: string | null;
  driver: string | null;
  truckPlate: string | null;
  dockId: string | null;
  dockName: string | null;
  warehouseId: string | null;
  warehouseName: string | null;
  currentStatus: string | null;
  previousStatus: string | null;
  result: ComplianceResult;
  severity: IncidentSeverity | null;
  /** Número de incidencias. null = motor no conectado, 0 = evaluado sin incidencias */
  incidentCount: number | null;
  /** Reglas aplicadas. null = motor no conectado */
  rulesApplied: number | null;
  /** Reglas totales cargadas. null = motor no conectado */
  rulesTotal: number | null;
  lastActivity: string;
  decisiveRule: string | null;
  decisiveRuleName: string | null;
  warehouseResolution: WarehouseResolution;
  isDemo: boolean;
  /** Indica si los datos operativos (reserva, estado, andén, etc.) vienen de BD real */
  isRealData: boolean;
}

export interface ComplianceReservationDetail extends ComplianceReservation {
  execution: RuleEngineExecution;
  evaluatedRules: EvaluatedRule[];
  incidents: ComplianceIncident[];
  timeline: ComplianceTimelineEvent[];
  auditLog: ComplianceAuditEvent[];
  technicalContext: ComplianceTechnicalContext | null;
}

// ─── Contexto técnico ────────────────────────────────────────────────────

export interface ComplianceTechnicalContext {
  reservationContext: Record<string, unknown>;
  resolvedWarehouseId: string | null;
  applicableRules: string[];
  conditionsJson: Record<string, unknown> | null;
  evaluatedJson: Record<string, unknown> | null;
  resolutionJson: Record<string, unknown> | null;
  incidentPayload: Record<string, unknown> | null;
  notificationPayload: Record<string, unknown> | null;
}

// ─── Utilidad: nombre amigable de código de estado ─────────────────────

/** Mapa de códigos de estado técnicos → etiquetas legibles */
export const STATUS_FRIENDLY_NAME: Record<string, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  ARRIVED_PENDING_UNLOAD: 'Pendiente de descarga',
  IN_PROGRESS: 'En progreso',
  START: 'Iniciada',
  UNLOADING: 'Descargando',
  PENDING_DISCHARGE: 'Pendiente de descarga',
  DISCHARGED: 'Descargada',
  DISPATCHED: 'Despachada',
  DONE: 'Completada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No presentado',
  BLOCKED: 'Bloqueada',
};

/** Estados pendientes de clasificación oficial en STATE_MACHINE_SPEC */
export const UNCLASSIFIED_STATUSES = new Set([
  'CHECKING_IN',
  'CHECKEDIN_PENDING_CLOSE',
  'UNLOADED_PENDING_CHECKIN',
]);

/**
 * Obtiene una etiqueta amigable para un código de estado.
 * Los estados no clasificados mantienen su código original.
 */
export function getStatusLabel(code: string | null): string {
  if (!code) return '—';
  const trimmed = code.trim();
  if (UNCLASSIFIED_STATUSES.has(trimmed)) return trimmed;
  return STATUS_FRIENDLY_NAME[trimmed] || trimmed;
}