import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useUserScope } from '@/hooks/useUserScope';
import { useActiveWarehouse } from '@/contexts/ActiveWarehouseContext';
import { complianceService } from '@/services/complianceService';
import { INOUT_COMPLIANCE_DEMO_MODE } from '@/types/compliance';
import type {
  ComplianceSummary,
  ComplianceReservation,
  ComplianceFilters,
  ComplianceResult,
  IncidentStatus,
} from '@/types/compliance';
import ComplianceMetrics from './components/ComplianceMetrics';
import ComplianceFiltersBar from './components/ComplianceFiltersBar';
import RuleEnginePipeline from './components/RuleEnginePipeline';
import ComplianceReservationsTable from './components/ComplianceReservationsTable';
import ComplianceIncidentsPanel from './components/ComplianceIncidentsPanel';
import ReservationComplianceDrawer from './components/ReservationComplianceDrawer';
import { demoPipelineStages } from '@/mocks/complianceDemoData';

const DEFAULT_FILTERS: ComplianceFilters = {
  dateFrom: null,
  dateTo: null,
  orgId: null,
  warehouseId: null,
  clientId: null,
  statusCode: null,
  severity: null,
  searchTerm: '',
  result: null,
  incidentStatus: null,
  ruleCode: null,
  page: 1,
  pageSize: 10,
};

type ActiveView = 'overview' | 'incidents';

export default function ComplianceCenterPage() {
  const { user } = useAuth();
  const { can, orgId: currentOrgId } = usePermissions();
  const { availableWarehouses, availableClients, loading: scopeLoading } = useUserScope();
  const { activeWarehouse } = useActiveWarehouse();

  // ── Estado ───────────────────────────────────────────────────────────
  const [activeView, setActiveView] = useState<ActiveView>('overview');
  const [filters, setFilters] = useState<ComplianceFilters>(DEFAULT_FILTERS);
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [reservations, setReservations] = useState<ComplianceReservation[]>([]);
  const [reservationsTotal, setReservationsTotal] = useState(0);
  const [reservationsPages, setReservationsPages] = useState(1);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [incidentsTotal, setIncidentsTotal] = useState(0);
  const [incidentsPages, setIncidentsPages] = useState(1);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingReservations, setLoadingReservations] = useState(true);
  const [loadingIncidents, setLoadingIncidents] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<ComplianceReservation | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [resultFilter, setResultFilter] = useState<ComplianceResult | null>(null);

  const orgId = currentOrgId || user?.orgId || null;

  // ── Cargar summary ───────────────────────────────────────────────────
  const loadSummary = useCallback(async () => {
    if (!orgId) return;
    setLoadingSummary(true);
    try {
      const data = await complianceService.getComplianceSummary(orgId, filters);
      setSummary(data);
      setLastUpdated(new Date().toLocaleTimeString('es-CR'));
    } catch (err: any) {
      console.error('[Compliance] Error loading summary:', err);
    } finally {
      setLoadingSummary(false);
    }
  }, [orgId, filters]);

  // ── Cargar reservas ──────────────────────────────────────────────────
  const loadReservations = useCallback(async () => {
    if (!orgId) return;
    setLoadingReservations(true);
    try {
      const effectiveFilters = { ...filters, result: resultFilter };
      const result = await complianceService.getEvaluatedReservations(orgId, effectiveFilters);
      setReservations(result.data);
      setReservationsTotal(result.total);
      setReservationsPages(result.totalPages);
    } catch (err: any) {
      console.error('[Compliance] Error loading reservations:', err);
    } finally {
      setLoadingReservations(false);
    }
  }, [orgId, filters, resultFilter]);

  // ── Cargar incidencias ───────────────────────────────────────────────
  const loadIncidents = useCallback(async () => {
    if (!orgId) return;
    setLoadingIncidents(true);
    try {
      const result = await complianceService.getIncidents(orgId, filters);
      setIncidents(result.data);
      setIncidentsTotal(result.total);
      setIncidentsPages(result.totalPages);
    } catch (err: any) {
      console.error('[Compliance] Error loading incidents:', err);
    } finally {
      setLoadingIncidents(false);
    }
  }, [orgId, filters]);

  // ── Efectos ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (activeView === 'overview') {
      loadReservations();
    } else {
      loadIncidents();
    }
  }, [loadReservations, loadIncidents, activeView]);

  const handleRefresh = () => {
    loadSummary();
    if (activeView === 'overview') {
      loadReservations();
    } else {
      loadIncidents();
    }
  };

  const handleSelectReservation = (reservation: ComplianceReservation) => {
    setSelectedReservation(reservation);
    setDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setSelectedReservation(null);
  };

  const handleResultFilterChange = (result: ComplianceResult | null) => {
    setResultFilter(result);
  };

  // ── Handler: click en métrica → filtro o navegación ──────────────────
  const handleMetricResultFilter = useCallback((result: ComplianceResult | null) => {
    setResultFilter(result);
    setActiveView('overview');
    setFilters((prev) => ({ ...prev, page: 1 }));
  }, []);

  const handleMetricNavigateToIncidents = useCallback((incidentStatus?: IncidentStatus) => {
    setActiveView('incidents');
    setFilters((prev) => ({
      ...prev,
      page: 1,
      incidentStatus: incidentStatus || null,
    }));
  }, []);

  // ── Handler: navegación desde toggle de vista ────────────────────────
  const handleSetActiveView = (view: ActiveView) => {
    setActiveView(view);
    setFilters((prev) => ({ ...prev, page: 1 }));
  };

  const handleReservationsPageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  const handleIncidentsPageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  // ── Permisos ─────────────────────────────────────────────────────────
  const canViewCompliance = can('casetilla.view');

  if (!canViewCompliance) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <i className="ri-shield-check-line text-6xl text-gray-400"></i>
          <h2 className="mt-4 text-xl font-semibold text-gray-700">Acceso Denegado</h2>
          <p className="mt-2 text-gray-600">No tenés permisos para acceder al Compliance Center</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Compliance Center</h1>
              <p className="text-sm text-gray-600 mt-1">
                Monitoreo, evaluación y auditoría del flujo operativo IN/OUT
                {summary?.dataSource === 'hybrid' ? (
                  <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 bg-teal-50 border border-teal-200 rounded-full text-xs font-medium text-teal-700">
                    <i className="ri-database-2-line w-3.5 h-3.5 flex items-center justify-center"></i>
                    Datos operativos reales — Rule Engine pendiente
                  </span>
                ) : INOUT_COMPLIANCE_DEMO_MODE ? (
                  <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-full text-xs font-medium text-amber-700">
                    <i className="ri-eye-line w-3.5 h-3.5 flex items-center justify-center"></i>
                    Modo demostración — Las métricas y evaluaciones son simuladas
                  </span>
                ) : null}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {activeWarehouse && (
                <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
                  <i className="ri-building-2-line text-teal-600 text-sm"></i>
                  <div>
                    <p className="text-[10px] text-teal-600 font-medium uppercase">Almacén</p>
                    <p className="text-xs font-semibold text-teal-900">{activeWarehouse.name}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="mb-4">
          <ComplianceFiltersBar
            filters={filters}
            onFiltersChange={setFilters}
            availableWarehouses={availableWarehouses}
            availableClients={availableClients}
            onRefresh={handleRefresh}
            lastUpdated={lastUpdated}
            loading={loadingSummary || loadingReservations}
            isDemo={INOUT_COMPLIANCE_DEMO_MODE}
          />
        </div>

        {/* Alerta de fallback: datos demo por error de conexión */}
        {summary?.dataLoadError && (
          <div className="mb-4 bg-amber-50 border border-amber-300 rounded-lg p-3 flex items-start gap-3">
            <i className="ri-error-warning-line text-amber-600 text-lg mt-0.5 w-5 h-5 flex items-center justify-center"></i>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">No fue posible cargar datos operativos</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Se muestran datos demostrativos. Verificá la conexión a la base de datos o los permisos de acceso.
              </p>
            </div>
            <button onClick={handleRefresh} className="px-3 py-1.5 text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300 rounded-lg hover:bg-amber-200 cursor-pointer whitespace-nowrap">
              <i className="ri-refresh-line mr-1 w-3 h-3 inline-flex items-center justify-center"></i>
              Reintentar
            </button>
          </div>
        )}

        {/* Toggle vista */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => handleSetActiveView('overview')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeView === 'overview' ? 'bg-teal-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <i className="ri-dashboard-line mr-1.5"></i>
            Vista general
          </button>
          <button
            onClick={() => handleSetActiveView('incidents')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeView === 'incidents' ? 'bg-teal-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <i className="ri-alert-line mr-1.5"></i>
            Incidencias
            {summary && summary.dataSource !== 'hybrid' && summary.openIncidents > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-red-500 text-white rounded-full text-xs">{summary.openIncidents}</span>
            )}
            {summary?.dataSource === 'hybrid' && (
              <span className="ml-1.5 px-1.5 py-0 text-[10px] font-bold bg-gray-100 text-gray-400 border border-gray-200 rounded whitespace-nowrap">NO CONECTADO</span>
            )}
          </button>
        </div>

        {/* Vista General */}
        {activeView === 'overview' && (
          <div className="space-y-4">
            {/* Métricas interactivas */}
            <ComplianceMetrics
              summary={summary}
              loading={loadingSummary}
              onFilterByResult={handleMetricResultFilter}
              onNavigateToIncidents={handleMetricNavigateToIncidents}
              activeResultFilter={resultFilter}
            />

            {/* Pipeline con resumen final */}
            <RuleEnginePipeline
              stages={demoPipelineStages}
              isDemo={INOUT_COMPLIANCE_DEMO_MODE}
              finalResult={summary ? (summary.dataSource === 'hybrid' ? 'NOT_EVALUATED' : (summary.blocked > 0 || summary.warned > 0) ? (summary.blocked > 0 ? 'BLOCK' : 'WARN') : 'PASS') : 'PASS'}
              finalSeverity={summary?.dataSource === 'hybrid' ? null : summary?.blocked > 0 ? 'HIGH' : summary?.warned > 0 ? 'MEDIUM' : null}
              decisiveRule={summary?.dataSource === 'hybrid' ? null : 'R14'}
              decisiveRuleName={summary?.dataSource === 'hybrid' ? null : 'Warehouse consistency'}
              applicableRulesCount={summary?.dataSource === 'hybrid' ? 0 : 8}
              failedRulesCount={summary?.dataSource === 'hybrid' ? 0 : 2}
              passedRulesCount={summary?.dataSource === 'hybrid' ? 0 : 6}
              skippedRulesCount={summary?.dataSource === 'hybrid' ? 0 : 8}
              totalRulesCount={summary?.dataSource === 'hybrid' ? 0 : 16}
              totalDurationMs={summary?.dataSource === 'hybrid' ? 0 : 63}
              isNotEvaluated={summary?.dataSource === 'hybrid'}
            />

            {/* Tabla de reservas */}
            <ComplianceReservationsTable
              reservations={reservations}
              total={reservationsTotal}
              page={filters.page}
              pageSize={filters.pageSize}
              totalPages={reservationsPages}
              loading={loadingReservations}
              selectedId={selectedReservation?.id || null}
              resultFilter={resultFilter}
              isHybrid={summary?.dataSource === 'hybrid'}
              onSelectReservation={handleSelectReservation}
              onPageChange={handleReservationsPageChange}
              onResultFilterChange={handleResultFilterChange}
            />
          </div>
        )}

        {/* Vista Incidencias */}
        {activeView === 'incidents' && (
          <ComplianceIncidentsPanel
            incidents={incidents}
            total={incidentsTotal}
            page={filters.page}
            pageSize={filters.pageSize}
            totalPages={incidentsPages}
            loading={loadingIncidents}
            isHybrid={summary?.dataSource === 'hybrid'}
            onPageChange={handleIncidentsPageChange}
          />
        )}
      </div>

      {/* Drawer de detalle */}
      <ReservationComplianceDrawer
        reservation={selectedReservation}
        isOpen={drawerOpen}
        onClose={handleCloseDrawer}
      />
    </div>
  );
}