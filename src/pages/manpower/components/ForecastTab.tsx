import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import { useActiveWarehouse } from '@/contexts/ActiveWarehouseContext';
import { manpowerForecastService } from '@/services/manpowerForecastService';
import { manpowerResourcesService } from '@/services/manpowerResourcesService';
import { exportForecastToExcel } from '@/utils/manpowerForecastExcel';
import ForecastReservationsTable from './ForecastReservationsTable';
import DailyAggregationPanel from './DailyAggregationPanel';
import WeeklyAggregationPanel from './WeeklyAggregationPanel';
import OverloadSuggestionsPanel from './OverloadSuggestionsPanel';
import DurationCalculator from './DurationCalculator';
import ForecastConfigModal from './ForecastConfigModal';
import type {
  ForecastResult,
  ForecastConfig,
  ReservationForecast,
  ForecastResourceAllocation,
} from '@/types/manpowerForecast';
import type { ResourceCategory } from '@/types/manpowerResource';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function ForecastTab() {
  const navigate = useNavigate();
  const { orgId, userId, can } = usePermissions();
  const canManage = can('manpower.manage');
  const {
    activeWarehouseId,
    allowedWarehouses,
    loading: warehouseScopeLoading,
  } = useActiveWarehouse();

  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [result, setResult] = useState<ForecastResult | null>(null);
  const [config, setConfig] = useState<ForecastConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [anchorDate, setAnchorDate] = useState<string>(todayStr());
  const [rangeDays, setRangeDays] = useState<number>(7);
  const [filterWarehouse, setFilterWarehouse] = useState('');

  // Rango efectivo del pronóstico (hacia adelante desde la fecha ancla)
  const endDate = useMemo(
    () => addDaysToDateStr(anchorDate, rangeDays - 1),
    [anchorDate, rangeDays]
  );

  // Por defecto, filtrar por el almacén activo del usuario
  useEffect(() => {
    if (activeWarehouseId) setFilterWarehouse(activeWarehouseId);
  }, [activeWarehouseId]);

  // Vista del pronóstico
  const [view, setView] = useState<'cita' | 'dia' | 'semana'>('cita');

  // Modales
  const [configOpen, setConfigOpen] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcTarget, setCalcTarget] = useState<{
    bultos: number | null;
    allocations: ForecastResourceAllocation[];
  } | null>(null);

  const loadStatic = useCallback(async () => {
    if (!orgId) return;
    try {
      const [cats, cfg] = await Promise.all([
        manpowerResourcesService.getCategories(orgId),
        manpowerForecastService.getConfig(orgId),
      ]);
      setCategories(Array.isArray(cats) ? cats : []);
      setConfig(cfg);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar la configuración');
    }
  }, [orgId]);

  const runForecast = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await manpowerForecastService.buildForecast(
        orgId,
        anchorDate,
        endDate,
        filterWarehouse || null
      );
      setResult(data);
      setConfig(data.config);
    } catch (err: any) {
      setError(err?.message || 'Error al calcular el pronóstico');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [orgId, anchorDate, endDate, filterWarehouse]);

  useEffect(() => {
    loadStatic();
  }, [loadStatic]);

  useEffect(() => {
    runForecast();
  }, [runForecast]);

  const goToToday = () => setAnchorDate(todayStr());
  const handlePickDate = (value: string) => {
    if (value) setAnchorDate(value);
  };
  const goToPrevious = () => setAnchorDate((d) => addDaysToDateStr(d, -rangeDays));
  const goToNext = () => setAnchorDate((d) => addDaysToDateStr(d, rangeDays));

  const summary = useMemo(() => {
    if (!result) return null;
    const withoutRule = result.reservations.filter((r) => !r.matched).length;
    const daysWithExternal = result.daily.filter((d) => d.requires_external).length;
    const totalBultos = result.reservations.reduce((s, r) => s + (r.bultos ?? 0), 0);
    return {
      total: result.reservations.length,
      withoutRule,
      daysWithExternal,
      totalBultos,
    };
  }, [result]);

  const handleSaveConfig = async (marginPct: number, limit: number | null) => {
    if (!orgId || !userId) return;
    setConfigSaving(true);
    try {
      await manpowerForecastService.saveConfig(orgId, userId, {
        recommended_margin_pct: marginPct,
        daily_appointment_limit: limit,
      });
      setConfigOpen(false);
      await runForecast();
    } catch (err: any) {
      alert(err?.message || 'Error al guardar la configuración');
    } finally {
      setConfigSaving(false);
    }
  };

  const openCalculator = (forecast?: ReservationForecast) => {
    setCalcTarget(
      forecast
        ? { bultos: forecast.bultos, allocations: forecast.min_resources }
        : { bultos: null, allocations: [] }
    );
    setCalcOpen(true);
  };

  const handleExport = () => {
    if (result) exportForecastToExcel(result);
  };

  // Abre la cita correspondiente en el calendario, posicionando fecha y almacén
  const openReservation = useCallback(
    (forecast: ReservationForecast) => {
      const params = new URLSearchParams();
      params.set('reservation', forecast.reservation.id);
      const date = forecast.reservation.start_datetime?.slice(0, 10);
      if (date) params.set('date', date);
      if (forecast.warehouse_id) params.set('warehouse', forecast.warehouse_id);
      navigate(`/calendario?${params.toString()}`);
    },
    [navigate]
  );

  if (loading && !result) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Encabezado + acciones */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Pronóstico de recursos</h3>
          <p className="text-sm text-gray-500">
            Qué recursos vas a necesitar por reserva y por día, con mínimo vs recomendado
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => openCalculator()}
            className="px-3 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <i className="ri-calculator-line text-base w-4 h-4 flex items-center justify-center"></i>
            Calculadora
          </button>
          {canManage && (
            <button
              onClick={() => setConfigOpen(true)}
              className="px-3 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <i className="ri-settings-3-line text-base w-4 h-4 flex items-center justify-center"></i>
              Configuración
            </button>
          )}
          <button
            onClick={handleExport}
            disabled={!result || result.reservations.length === 0}
            className="px-3 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
          >
            <i className="ri-file-excel-2-line text-base w-4 h-4 flex items-center justify-center"></i>
            Exportar Excel
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Rango de fechas</label>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={goToToday}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer"
            >
              Hoy
            </button>
            <input
              type="date"
              value={anchorDate}
              onChange={(e) => handlePickDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
            />
            <div className="flex items-center gap-0.5">
              <button
                onClick={goToPrevious}
                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <i className="ri-arrow-left-s-line text-lg w-5 h-5 flex items-center justify-center"></i>
              </button>
              <button
                onClick={goToNext}
                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <i className="ri-arrow-right-s-line text-lg w-5 h-5 flex items-center justify-center"></i>
              </button>
            </div>
            <div className="inline-flex items-center gap-1 rounded-full bg-gray-100 p-1">
              {[1, 3, 7].map((days) => (
                <button
                  key={days}
                  onClick={() => setRangeDays(days)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    rangeDays === days ? 'bg-white text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {days} día{days !== 1 ? 's' : ''}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Almacén</label>
          {allowedWarehouses.length > 1 ? (
            <select
              value={filterWarehouse}
              onChange={(e) => setFilterWarehouse(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
            >
              <option value="">Todos los almacenes</option>
              {allowedWarehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-2 px-4 py-2 bg-teal-50 border border-teal-200 rounded-lg text-sm text-teal-700 font-medium">
              <i className="ri-building-2-line w-4 h-4 flex items-center justify-center"></i>
              {allowedWarehouses[0]?.name ?? (warehouseScopeLoading ? 'Cargando…' : 'Sin almacén')}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <i className="ri-error-warning-line text-red-600 text-lg w-5 h-5 flex items-center justify-center"></i>
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={runForecast}
            className="ml-auto px-3 py-1.5 text-sm font-medium text-red-700 border border-red-300 rounded-lg hover:bg-red-100 transition-colors whitespace-nowrap"
          >
            Reintentar
          </button>
        </div>
      )}

      {result?.warnings && result.warnings.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
          <div className="flex items-center gap-2">
            <i className="ri-error-warning-line text-amber-600 text-lg w-5 h-5 flex items-center justify-center"></i>
            <span className="text-sm font-semibold text-amber-800">Avisos del pronóstico</span>
          </div>
          <ul className="space-y-1 pl-7">
            {result.warnings.map((w, idx) => (
              <li key={idx} className="text-sm text-amber-700 list-disc">{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Tarjetas resumen */}
      {summary && (
        <div className="bg-white border border-gray-200 rounded-lg px-5 py-3 flex items-center gap-8 flex-wrap">
          <div className="flex items-center gap-2.5">
            <i className="ri-calendar-check-line text-lg text-teal-600 w-5 h-5 flex items-center justify-center"></i>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-gray-900 leading-none">{summary.total}</span>
              <span className="text-xs text-gray-500">Reservas</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <i className="ri-alert-line text-lg text-amber-600 w-5 h-5 flex items-center justify-center"></i>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-gray-900 leading-none">{summary.withoutRule}</span>
              <span className="text-xs text-gray-500">Sin regla</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <i className="ri-user-add-line text-lg text-red-600 w-5 h-5 flex items-center justify-center"></i>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-gray-900 leading-none">{summary.daysWithExternal}</span>
              <span className="text-xs text-gray-500">Días con externa</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <i className="ri-box-3-line text-lg text-teal-600 w-5 h-5 flex items-center justify-center"></i>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-gray-900 leading-none">{summary.totalBultos}</span>
              <span className="text-xs text-gray-500">Bultos totales</span>
            </div>
          </div>
        </div>
      )}

      {/* Selector de vista */}
      <div className="inline-flex items-center gap-1 rounded-full bg-gray-100 p-1">
        <button
          onClick={() => setView('cita')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
            view === 'cita' ? 'bg-white text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Por cita
        </button>
        <button
          onClick={() => setView('dia')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
            view === 'dia' ? 'bg-white text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Por día
        </button>
        <button
          onClick={() => setView('semana')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
            view === 'semana' ? 'bg-white text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Por semana
        </button>
      </div>

      {/* Pronóstico por reserva */}
      {view === 'cita' && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-base font-semibold text-gray-900">Por reserva</h4>
            <span className="text-xs text-gray-400">
              Margen recomendado: {config?.recommended_margin_pct ?? 20}%
            </span>
          </div>
          <ForecastReservationsTable
            forecasts={result?.reservations ?? []}
            onCalculate={openCalculator}
            onOpenReservation={openReservation}
          />
        </section>
      )}

      {/* Agregación diaria */}
      {view === 'dia' && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-base font-semibold text-gray-900">Agregación diaria por almacén</h4>
          </div>
          <DailyAggregationPanel daily={result?.daily ?? []} />
        </section>
      )}

      {/* Agregación semanal */}
      {view === 'semana' && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-base font-semibold text-gray-900">Agregación semanal por almacén</h4>
          </div>
          <WeeklyAggregationPanel weekly={result?.weekly ?? []} />
        </section>
      )}

      {/* Sugerencias de calendario */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-base font-semibold text-gray-900">Sugerencias de calendario</h4>
          <span className="text-xs text-gray-400">
            {result?.suggestions?.length ?? 0} sugerencia
            {(result?.suggestions?.length ?? 0) !== 1 ? 's' : ''}
          </span>
        </div>
        <OverloadSuggestionsPanel suggestions={result?.suggestions ?? []} />
      </section>

      {/* Modales */}
      {config && (
        <ForecastConfigModal
          isOpen={configOpen}
          onClose={() => setConfigOpen(false)}
          onSave={handleSaveConfig}
          marginPct={config.recommended_margin_pct}
          appointmentLimit={config.daily_appointment_limit}
          saving={configSaving}
        />
      )}

      <DurationCalculator
        isOpen={calcOpen}
        onClose={() => setCalcOpen(false)}
        categories={categories}
        initialBultos={calcTarget?.bultos ?? null}
        initialAllocations={calcTarget?.allocations ?? []}
      />
    </div>
  );
}