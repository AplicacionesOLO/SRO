import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { casetillaService } from '../../../services/casetillaService';
import { useSessionStorageState } from '../../../hooks/useSessionStorageState';
import type { ProviderDistributionRow, MonthlyGlobalTimeRow } from '../../../types/casetilla';

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function fmtPct(value: number): string {
  return `${(value * 100).toFixed(3)}%`;
}

function fmtHHMM(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function diferenciaColor(d: number) {
  if (d > 0) return 'text-red-600';
  if (d < 0) return 'text-emerald-600';
  return 'text-gray-500';
}

function renderProviderTypeBadge(providerType: string) {
  const label = providerType === 'pesado' ? 'Pesado' : 'Almacenaje';
  const isHeavy = providerType === 'pesado';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${isHeavy ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
      {label}
    </span>
  );
}

interface ProviderDistributionGridProps {
  orgId: string;
  allowedWarehouseIds?: string[] | null;
  scopeWarehouseIds?: string[] | null;
  clientId?: string | null;
  selectedDate: Date;
  timezone: string;
  warehouseName?: string;
  clientName?: string;
}

type PageSize = 10 | 30 | 50 | 100 | 'all';
type ViewMode = 'ALL' | 'THEORETICAL' | 'REAL';
type AnalysisMode = 'PROVIDER' | 'MONTHLY';

export default function ProviderDistributionGrid({
  orgId,
  allowedWarehouseIds,
  scopeWarehouseIds,
  clientId,
  selectedDate: globalSelectedDate,
  timezone,
  warehouseName,
  clientName,
}: ProviderDistributionGridProps) {
  // WarehouseIds efectivos para el reporte:
  // - Si hay allowedWarehouseIds (almacén específico seleccionado) → usar eso
  // - Si no, usar scopeWarehouseIds (todos los permitidos para el usuario)
  // - Si ambos son null, sin restricción
  const reportWarehouseIds = allowedWarehouseIds ?? scopeWarehouseIds ?? null;

  const [analysisMode, setAnalysisMode] = useSessionStorageState<AnalysisMode>('casetilla_provider_analysisMode', 'PROVIDER');
  const [dataProvider, setDataProvider] = useState<ProviderDistributionRow[]>([]);
  const [dataMonthly, setDataMonthly] = useState<MonthlyGlobalTimeRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useSessionStorageState('casetilla_provider_searchTerm', '');
  const [selectedProvider, setSelectedProvider] = useSessionStorageState('casetilla_provider_selectedProvider', '');
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [viewMode, setViewMode] = useSessionStorageState<ViewMode>('casetilla_provider_viewMode', 'ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [fromDate, setFromDate] = useSessionStorageState('casetilla_provider_fromDate', toISODate(globalSelectedDate));
  const [toDate, setToDate] = useSessionStorageState('casetilla_provider_toDate', toISODate(globalSelectedDate));
  const [dateError, setDateError] = useState<string | null>(null);
  const [earliestDate, setEarliestDate] = useState<string | null>(null);
  const [isLoadingEarliest, setIsLoadingEarliest] = useState(false);

  const fromDateRef = useRef(fromDate);
  const toDateRef = useRef(toDate);
  const viewModeRef = useRef(viewMode);
  const analysisModeRef = useRef(analysisMode);

  useEffect(() => { fromDateRef.current = fromDate; }, [fromDate]);
  useEffect(() => { toDateRef.current = toDate; }, [toDate]);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);
  useEffect(() => { analysisModeRef.current = analysisMode; }, [analysisMode]);

  // Ref para evitar que el primer sync de globalSelectedDate sobrescriba
  // los filtros persistidos al regresar de otra ruta
  const isFirstSync = useRef(true);

  // Sincronizar con fecha global del módulo y recargar automáticamente
  useEffect(() => {
    const newDate = toISODate(globalSelectedDate);
    // En el primer montaje, si hay filtros persistidos, no sobrescribirlos
    if (isFirstSync.current) {
      isFirstSync.current = false;
      // Solo actualizar refs si no hay fecha persistida (first visit ever)
      if (!fromDate && !toDate) {
        setFromDate(newDate);
        setToDate(newDate);
        fromDateRef.current = newDate;
        toDateRef.current = newDate;
        loadReport();
      }
      return;
    }
    setFromDate(newDate);
    setToDate(newDate);
    setDateError(null);
    fromDateRef.current = newDate;
    toDateRef.current = newDate;
    loadReport();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSelectedDate]);

  // Cargar reporte
  const loadReport = useCallback(async () => {
    const fStr = fromDateRef.current;
    const tStr = toDateRef.current;
    const mode = analysisModeRef.current;

    if (!fStr || !tStr) {
      setDateError('Seleccioná ambas fechas');
      return;
    }

    const from = parseLocalDate(fStr);
    const to = parseLocalDate(tStr);

    if (from > to) {
      setDateError('La fecha "Desde" no puede ser mayor que "Hasta"');
      return;
    }

    if (mode === 'PROVIDER') {
      const diffDays = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 183) {
        setDateError('El rango máximo permitido es de 6 meses');
        return;
      }
    }

    setDateError(null);
    setIsLoading(true);
    try {
      if (mode === 'PROVIDER') {
        const report = await casetillaService.getProviderDistributionReport(
          orgId,
          from,
          to,
          timezone,
          reportWarehouseIds,
          clientId
        );
        setDataProvider(report);
      } else {
        const report = await casetillaService.getMonthlyGlobalTimeDistributionReport(
          orgId,
          from,
          to,
          timezone,
          reportWarehouseIds,
          clientId
        );
        setDataMonthly(report);
      }
    } catch {
      if (mode === 'PROVIDER') setDataProvider([]);
      else setDataMonthly([]);
    } finally {
      setIsLoading(false);
    }
  }, [orgId, timezone, reportWarehouseIds, clientId]);

  // Carga inicial al montar
  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cargar fecha origen
  const loadEarliestDate = useCallback(async () => {
    if (earliestDate) {
      setFromDate(earliestDate);
      setToDate(toISODate(new Date()));
      setDateError(null);
      return;
    }
    setIsLoadingEarliest(true);
    try {
      const date = await casetillaService.getEarliestDataDate(orgId, timezone, reportWarehouseIds, clientId);
      setEarliestDate(date);
      if (date) {
        setFromDate(date);
        setToDate(toISODate(new Date()));
        setDateError(null);
      }
    } catch {
      setEarliestDate(null);
    } finally {
      setIsLoadingEarliest(false);
    }
  }, [orgId, timezone, reportWarehouseIds, clientId, earliestDate]);

  // ─── Datos filtrados (modo proveedor) ───────────────────────────────────
  const providerOptions = useMemo(() => {
    const names = [...new Set(dataProvider.map((d) => d.provider_name))].sort((a, b) => a.localeCompare(b));
    return names;
  }, [dataProvider]);

  const filteredProviderData = useMemo(() => {
    let filtered = [...dataProvider];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((row) => row.provider_name.toLowerCase().includes(term));
    }
    if (selectedProvider) {
      filtered = filtered.filter((row) => row.provider_name === selectedProvider);
    }
    return filtered;
  }, [dataProvider, searchTerm, selectedProvider]);

  // ─── Recalcular porcentajes sobre el dataset VISIBLE (filtrado por búsqueda y proveedor)
  const computedProviderData = useMemo(() => {
    const totalTeorico = filteredProviderData.reduce((s, r) => s + r.tiempo_teorico_minutos, 0);
    const totalReal = filteredProviderData.reduce((s, r) => s + r.tiempo_real_minutos, 0);
    const mapped = filteredProviderData.map((r) => ({
      ...r,
      pct_teorico_total: totalTeorico > 0 ? r.tiempo_teorico_minutos / totalTeorico : 0,
      pct_real_total: totalReal > 0 ? r.tiempo_real_minutos / totalReal : 0,
    }));

    // Ordenamiento: primero proveedores con duración real válida (DESC),
    // luego proveedores sin OUT al final
    mapped.sort((a, b) => {
      const aHasReal = a.tiempo_real_minutos > 0;
      const bHasReal = b.tiempo_real_minutos > 0;
      if (aHasReal && !bHasReal) return -1;
      if (!aHasReal && bHasReal) return 1;
      if (aHasReal && bHasReal) {
        return b.tiempo_real_minutos - a.tiempo_real_minutos;
      }
      // Ambos sin duración real — ordenar por citas_con_in DESC
      return b.citas_con_in - a.citas_con_in;
    });

    return mapped;
  }, [filteredProviderData]);

  const providerTotalRow = useMemo<ProviderDistributionRow | null>(() => {
    if (computedProviderData.length === 0) return null;
    const totalTeorico = computedProviderData.reduce((s, r) => s + r.tiempo_teorico_minutos, 0);
    const totalReal = computedProviderData.reduce((s, r) => s + r.tiempo_real_minutos, 0);
    const totalCitasProg = computedProviderData.reduce((s, r) => s + r.citas_programadas, 0);
    const totalCitasIn = computedProviderData.reduce((s, r) => s + r.citas_con_in, 0);
    const totalCitasOut = computedProviderData.reduce((s, r) => s + r.citas_con_out, 0);
    const totalPendOut = computedProviderData.reduce((s, r) => s + r.pendientes_out, 0);
    const dif = totalReal - totalTeorico;
    let difFmt: string;
    if (dif > 0) difFmt = `+${dif} min`;
    else if (dif < 0) difFmt = `${dif} min`;
    else difFmt = '0 min';
    const avgTeorico = totalCitasProg > 0 ? Math.round(totalTeorico / totalCitasProg) : 0;
    const avgReal = totalCitasOut > 0 ? Math.round(totalReal / totalCitasOut) : 0;
    return {
      provider_name: 'TOTAL',
      provider_type: '',
      citas_programadas: totalCitasProg,
      citas_con_in: totalCitasIn,
      citas_con_out: totalCitasOut,
      pendientes_out: totalPendOut,
      tiempo_teorico_minutos: totalTeorico,
      tiempo_teorico_formato: fmtHHMM(totalTeorico),
      tiempo_real_minutos: totalReal,
      tiempo_real_formato: fmtHHMM(totalReal),
      diferencia_minutos: dif,
      diferencia_formato: difFmt,
      pct_teorico_total: totalTeorico > 0 ? 1 : 0,
      pct_real_total: totalReal > 0 ? 1 : 0,
      promedio_teorico_minutos: avgTeorico,
      promedio_teorico_formato: fmtHHMM(avgTeorico),
      promedio_real_minutos: avgReal,
      promedio_real_formato: fmtHHMM(avgReal),
    };
  }, [computedProviderData]);

  // ─── Paginación proveedor ─────────────────────────────────────────────
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedProvider, pageSize, analysisMode]);

  const paginatedProviderData = useMemo(() => {
    if (pageSize === 'all') return computedProviderData;
    const start = (currentPage - 1) * pageSize;
    return computedProviderData.slice(start, start + pageSize);
  }, [computedProviderData, currentPage, pageSize]);

  const totalProviderPages = useMemo(() => {
    if (pageSize === 'all') return 1;
    return Math.ceil(computedProviderData.length / pageSize);
  }, [computedProviderData.length, pageSize]);

  // ─── Paginación mensual ─────────────────────────────────────────────────
  const paginatedMonthlyData = useMemo(() => {
    if (pageSize === 'all') return dataMonthly;
    const start = (currentPage - 1) * pageSize;
    return dataMonthly.slice(start, start + pageSize);
  }, [dataMonthly, currentPage, pageSize]);

  const totalMonthlyPages = useMemo(() => {
    if (pageSize === 'all') return 1;
    return Math.ceil(dataMonthly.length / pageSize);
  }, [dataMonthly.length, pageSize]);

  // ─── Resumen proveedor ──────────────────────────────────────────────────
  const providerSummary = useMemo(() => {
    if (filteredProviderData.length === 0) {
      return {
        totalTeoricoMin: 0,
        totalTeoricoFmt: '00:00',
        totalRealMin: 0,
        totalRealFmt: '00:00',
        diferenciaMin: 0,
        diferenciaFmt: '0 min',
        topProviderName: '-',
        topProviderRealMin: 0,
        topProviderRealFmt: '00:00',
      };
    }
    const totalTeorico = filteredProviderData.reduce((s, r) => s + r.tiempo_teorico_minutos, 0);
    const totalReal = filteredProviderData.reduce((s, r) => s + r.tiempo_real_minutos, 0);
    const diferencia = totalReal - totalTeorico;
    const fmt = (mins: number) => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };
    const top = filteredProviderData.reduce((max, r) => (r.tiempo_real_minutos > max.tiempo_real_minutos ? r : max), filteredProviderData[0]);
    let difFmt: string;
    if (diferencia > 0) difFmt = `+${diferencia} min`;
    else if (diferencia < 0) difFmt = `${diferencia} min`;
    else difFmt = '0 min';
    return {
      totalTeoricoMin: totalTeorico,
      totalTeoricoFmt: fmt(totalTeorico),
      totalRealMin: totalReal,
      totalRealFmt: fmt(totalReal),
      diferenciaMin: diferencia,
      diferenciaFmt: difFmt,
      topProviderName: top.provider_name,
      topProviderRealMin: top.tiempo_real_minutos,
      topProviderRealFmt: fmt(top.tiempo_real_minutos),
    };
  }, [filteredProviderData]);

  // ─── Resumen mensual ────────────────────────────────────────────────────
  const monthlySummary = useMemo(() => {
    if (dataMonthly.length === 0) {
      return {
        totalTeoricoMin: 0,
        totalTeoricoFmt: '00:00',
        totalRealMin: 0,
        totalRealFmt: '00:00',
        diferenciaMin: 0,
        diferenciaFmt: '0 min',
        topMonthName: '-',
        topMonthRealMin: 0,
        topMonthRealFmt: '00:00',
      };
    }
    const totalTeorico = dataMonthly.reduce((s, r) => s + r.tiempo_teorico_minutos, 0);
    const totalReal = dataMonthly.reduce((s, r) => s + r.tiempo_real_minutos, 0);
    const diferencia = totalReal - totalTeorico;
    const fmt = (mins: number) => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };
    const top = dataMonthly.reduce((max, r) => (r.tiempo_real_minutos > max.tiempo_real_minutos ? r : max), dataMonthly[0]);
    let difFmt: string;
    if (diferencia > 0) difFmt = `+${diferencia} min`;
    else if (diferencia < 0) difFmt = `${diferencia} min`;
    else difFmt = '0 min';
    return {
      totalTeoricoMin: totalTeorico,
      totalTeoricoFmt: fmt(totalTeorico),
      totalRealMin: totalReal,
      totalRealFmt: fmt(totalReal),
      diferenciaMin: diferencia,
      diferenciaFmt: difFmt,
      topMonthName: top.month_label,
      topMonthRealMin: top.tiempo_real_minutos,
      topMonthRealFmt: fmt(top.tiempo_real_minutos),
    };
  }, [dataMonthly]);

  // ─── Handlers ───────────────────────────────────────────────────────────
  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedProvider('');
    const resetDate = toISODate(globalSelectedDate);
    setFromDate(resetDate);
    setToDate(resetDate);
    setDateError(null);
    setViewMode('ALL');
    setCurrentPage(1);
  };

  const handlePageSizeChange = (newSize: PageSize) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  const handlePrevPage = () => setCurrentPage((p) => Math.max(1, p - 1));
  const handleNextPage = () => {
    const max = analysisMode === 'PROVIDER' ? totalProviderPages : totalMonthlyPages;
    setCurrentPage((p) => Math.min(max, p + 1));
  };

  // ─── Exportar Excel (.xlsx) ───────────────────────────────────────────
  const handleExportExcel = () => {
    import('xlsx').then((XLSX) => {
      // ── Hoja 1: Metadatos ──────────────────────────────────────────
      const metadataRows = [
        ['Reporte', analysisMode === 'PROVIDER' ? 'Distribución de tiempos por proveedor' : 'Distribución global mensual de tiempos'],
        ['Almacén', warehouseName ?? 'Todos los almacenes permitidos'],
        ['Cliente', clientName ?? 'Todos'],
        ['Desde', fromDate],
        ['Hasta', toDate],
        ['Modo de análisis', analysisMode === 'PROVIDER' ? 'Por proveedor' : 'Global mensual'],
        ['Vista', analysisMode === 'PROVIDER' ? (viewMode === 'ALL' ? 'Todos' : viewMode === 'THEORETICAL' ? 'Teórico' : 'Real') : 'Todos'],
        [],
      ];
      const metadataWs = XLSX.utils.aoa_to_sheet(metadataRows);

      // ── Hoja 2: Datos ──────────────────────────────────────────────
      let dataRows: (string | number)[][] = [];
      let sheetName = '';

      if (analysisMode === 'PROVIDER') {
        sheetName = 'Por proveedor';

        const headersAll = [
          'Proveedor','Código','Cliente','Tipo proveedor','Citas programadas','Citas con IN','Citas con OUT','Pendientes OUT',
          'Tiempo teórico minutos','Tiempo teórico HH:mm','Tiempo real minutos','Tiempo real HH:mm',
          'Diferencia minutos','Diferencia texto','% total teórico','% total real',
          'Promedio teórico minutos','Promedio teórico HH:mm','Promedio real minutos','Promedio real HH:mm',
        ];
        const headersTheoretical = [
          'Proveedor','Código','Cliente','Tipo proveedor','Citas programadas','Tiempo teórico minutos','Tiempo teórico HH:mm',
          '% total teórico','Promedio teórico minutos','Promedio teórico HH:mm',
        ];
        const headersReal = [
          'Proveedor','Código','Cliente','Tipo proveedor','Citas con IN','Citas con OUT','Pendientes OUT','Tiempo real minutos','Tiempo real HH:mm',
          '% total real','Promedio real minutos','Promedio real HH:mm',
        ];

        const vm = viewMode;
        let headers: string[];
        if (vm === 'THEORETICAL') headers = headersTheoretical;
        else if (vm === 'REAL') headers = headersReal;
        else headers = headersAll;

        dataRows.push(headers);

        computedProviderData.forEach((r) => {
          if (vm === 'THEORETICAL') {
            dataRows.push([
              r.provider_name, r.provider_code ?? '', r.client_name ?? '', r.provider_type === 'pesado' ? 'Pesado' : 'Almacenaje', r.citas_programadas, r.tiempo_teorico_minutos, r.tiempo_teorico_formato,
              r.pct_teorico_total, r.promedio_teorico_minutos, r.promedio_teorico_formato,
            ]);
          } else if (vm === 'REAL') {
            dataRows.push([
              r.provider_name, r.provider_code ?? '', r.client_name ?? '', r.provider_type === 'pesado' ? 'Pesado' : 'Almacenaje', r.citas_con_in, r.citas_con_out, r.pendientes_out,
              r.tiempo_real_minutos, r.tiempo_real_formato, r.pct_real_total,
              r.promedio_real_minutos, r.promedio_real_formato,
            ]);
          } else {
            dataRows.push([
              r.provider_name, r.provider_code ?? '', r.client_name ?? '', r.provider_type === 'pesado' ? 'Pesado' : 'Almacenaje', r.citas_programadas, r.citas_con_in, r.citas_con_out, r.pendientes_out,
              r.tiempo_teorico_minutos, r.tiempo_teorico_formato, r.tiempo_real_minutos, r.tiempo_real_formato,
              r.diferencia_minutos, r.diferencia_formato, r.pct_teorico_total, r.pct_real_total,
              r.promedio_teorico_minutos, r.promedio_teorico_formato, r.promedio_real_minutos, r.promedio_real_formato,
            ]);
          }
        });

        // Fila TOTAL
        if (computedProviderData.length > 0) {
          const totalRow: (string | number)[] = ['TOTAL'];
          const sums: Record<string, number> = {};
          computedProviderData.forEach((r) => {
            sums['citas_programadas'] = (sums['citas_programadas'] || 0) + r.citas_programadas;
            sums['citas_con_in'] = (sums['citas_con_in'] || 0) + r.citas_con_in;
            sums['citas_con_out'] = (sums['citas_con_out'] || 0) + r.citas_con_out;
            sums['pendientes_out'] = (sums['pendientes_out'] || 0) + r.pendientes_out;
            sums['tiempo_teorico_min'] = (sums['tiempo_teorico_min'] || 0) + r.tiempo_teorico_minutos;
            sums['tiempo_real_min'] = (sums['tiempo_real_min'] || 0) + r.tiempo_real_minutos;
            sums['diferencia_min'] = (sums['diferencia_min'] || 0) + r.diferencia_minutos;
          });

          if (vm === 'THEORETICAL') {
            totalRow.push('', '', '', sums['citas_programadas'], sums['tiempo_teorico_min'], '', 1, '', '');
          } else if (vm === 'REAL') {
            totalRow.push('', '', '', sums['citas_con_in'], sums['citas_con_out'], sums['pendientes_out'], sums['tiempo_real_min'], '', 1, '', '');
          } else {
            totalRow.push(
              '', '', '', sums['citas_programadas'], sums['citas_con_in'], sums['citas_con_out'], sums['pendientes_out'],
              sums['tiempo_teorico_min'], '', sums['tiempo_real_min'], '', sums['diferencia_min'], '', 1, 1, '', '', '', ''
            );
          }
          dataRows.push(totalRow);
        }
      } else {
        sheetName = 'Global mensual';
        const headers = [
          'Mes','Citas programadas','Citas con IN','Citas con OUT','Pendientes OUT',
          'Tiempo teórico minutos','Tiempo teórico HH:mm','Tiempo real minutos','Tiempo real HH:mm',
          'Diferencia minutos','Diferencia texto','% tiempo real vs teórico',
          'Promedio teórico minutos','Promedio teórico HH:mm','Promedio real minutos','Promedio real HH:mm',
        ];
        dataRows.push(headers);

        dataMonthly.forEach((r) => {
          dataRows.push([
            r.month_label, r.citas_programadas, r.citas_con_in, r.citas_con_out, r.pendientes_out,
            r.tiempo_teorico_minutos, r.tiempo_teorico_formato, r.tiempo_real_minutos, r.tiempo_real_formato,
            r.diferencia_minutos, r.diferencia_formato, r.pct_real_vs_teorico,
            r.promedio_teorico_minutos, r.promedio_teorico_formato, r.promedio_real_minutos, r.promedio_real_formato,
          ]);
        });

        // Fila TOTAL
        if (dataMonthly.length > 0) {
          const sums: Record<string, number> = {};
          dataMonthly.forEach((r) => {
            sums['citas_programadas'] = (sums['citas_programadas'] || 0) + r.citas_programadas;
            sums['citas_con_in'] = (sums['citas_con_in'] || 0) + r.citas_con_in;
            sums['citas_con_out'] = (sums['citas_con_out'] || 0) + r.citas_con_out;
            sums['pendientes_out'] = (sums['pendientes_out'] || 0) + r.pendientes_out;
            sums['tiempo_teorico_min'] = (sums['tiempo_teorico_min'] || 0) + r.tiempo_teorico_minutos;
            sums['tiempo_real_min'] = (sums['tiempo_real_min'] || 0) + r.tiempo_real_minutos;
            sums['diferencia_min'] = (sums['diferencia_min'] || 0) + r.diferencia_minutos;
          });
          dataRows.push([
            'TOTAL', sums['citas_programadas'], sums['citas_con_in'], sums['citas_con_out'], sums['pendientes_out'],
            sums['tiempo_teorico_min'], '', sums['tiempo_real_min'], '', sums['diferencia_min'], '', '', '', '', '', '',
          ]);
        }
      }

      const dataWs = XLSX.utils.aoa_to_sheet(dataRows);

      // Ajustar anchos de columna
      const colCount = dataRows[0]?.length || 1;
      const wscols = Array.from({ length: colCount }, () => ({ wch: 18 }));
      dataWs['!cols'] = wscols;

      // Crear workbook y agregar hojas
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, metadataWs, 'Metadatos');
      XLSX.utils.book_append_sheet(wb, dataWs, sheetName);

      const suffix = analysisMode === 'PROVIDER'
        ? 'distribucion_tiempos_proveedor'
        : 'distribucion_tiempos_global_mensual';
      const filename = `${suffix}_${fromDate}_a_${toDate}.xlsx`;
      XLSX.writeFile(wb, filename);
    });
  };

  // ─── Render loading ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-600">Cargando reporte...</p>
        </div>
      </div>
    );
  }

  const pageSizeOptions: { value: PageSize; label: string }[] = [
    { value: 10, label: '10' },
    { value: 30, label: '30' },
    { value: 50, label: '50' },
    { value: 100, label: '100' },
    { value: 'all', label: 'TODOS' },
  ];

  const totalPages = analysisMode === 'PROVIDER' ? totalProviderPages : totalMonthlyPages;
  const currentData = analysisMode === 'PROVIDER' ? computedProviderData : dataMonthly;
  const paginatedData = analysisMode === 'PROVIDER' ? paginatedProviderData : paginatedMonthlyData;

  return (
    <div className="space-y-6">
      {/* ─── Selector de modo de análisis ───────────────────────────────── */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-700">Modo de análisis:</span>
        <div className="inline-flex bg-gray-100 rounded-lg p-1">
          {([
            { key: 'PROVIDER', label: 'Por proveedor' },
            { key: 'MONTHLY', label: 'Global mensual' },
          ] as { key: AnalysisMode; label: string }[]).map((opt) => (
            <button
              key={opt.key}
              onClick={() => {
                setAnalysisMode(opt.key);
                setCurrentPage(1);
                setDateError(null);
              }}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                analysisMode === opt.key
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Cards de resumen ─────────────────────────────────────────── */}
      {analysisMode === 'PROVIDER' ? (
        <div className={`grid gap-4 ${viewMode === 'ALL' ? 'grid-cols-2 lg:grid-cols-4' : viewMode === 'THEORETICAL' ? 'grid-cols-1 lg:grid-cols-1' : 'grid-cols-2 lg:grid-cols-2'}`}>
          {(viewMode === 'ALL' || viewMode === 'THEORETICAL') && (
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <div className="flex items-center gap-2 mb-1">
                <i className="ri-time-line text-blue-600"></i>
                <span className="text-sm text-blue-700 font-medium">Tiempo teórico total</span>
              </div>
              <p className="text-2xl font-bold text-blue-900">{providerSummary.totalTeoricoFmt}</p>
              <p className="text-xs text-blue-600 mt-1">{providerSummary.totalTeoricoMin} min</p>
            </div>
          )}
          {(viewMode === 'ALL' || viewMode === 'REAL') && (
            <div className="bg-teal-50 rounded-lg p-4 border border-teal-200">
              <div className="flex items-center gap-2 mb-1">
                <i className="ri-time-line text-teal-600"></i>
                <span className="text-sm text-teal-700 font-medium">Tiempo real total</span>
              </div>
              <p className="text-2xl font-bold text-teal-900">{providerSummary.totalRealFmt}</p>
              <p className="text-xs text-teal-600 mt-1">{providerSummary.totalRealMin} min</p>
            </div>
          )}
          {viewMode === 'ALL' && (
            <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
              <div className="flex items-center gap-2 mb-1">
                <i className="ri-arrow-left-right-line text-amber-600"></i>
                <span className="text-sm text-amber-700 font-medium">Diferencia total</span>
              </div>
              <p className={`text-2xl font-bold ${diferenciaColor(providerSummary.diferenciaMin)}`}>
                {providerSummary.diferenciaFmt}
              </p>
            </div>
          )}
          {viewMode === 'ALL' && (
            <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-200">
              <div className="flex items-center gap-2 mb-1">
                <i className="ri-trophy-line text-indigo-600"></i>
                <span className="text-sm text-indigo-700 font-medium">Mayor tiempo real</span>
              </div>
              <p className="text-lg font-bold text-indigo-900 truncate" title={providerSummary.topProviderName}>
                {providerSummary.topProviderName}
              </p>
              <p className="text-xs text-indigo-600 mt-1">
                {providerSummary.topProviderRealFmt} ({providerSummary.topProviderRealMin} min)
              </p>
            </div>
          )}
          {viewMode === 'REAL' && (
            <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-200">
              <div className="flex items-center gap-2 mb-1">
                <i className="ri-trophy-line text-indigo-600"></i>
                <span className="text-sm text-indigo-700 font-medium">Mayor tiempo real</span>
              </div>
              <p className="text-lg font-bold text-indigo-900 truncate" title={providerSummary.topProviderName}>
                {providerSummary.topProviderName}
              </p>
              <p className="text-xs text-indigo-600 mt-1">
                {providerSummary.topProviderRealFmt} ({providerSummary.topProviderRealMin} min)
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="flex items-center gap-2 mb-1">
              <i className="ri-time-line text-blue-600"></i>
              <span className="text-sm text-blue-700 font-medium">Tiempo teórico histórico</span>
            </div>
            <p className="text-2xl font-bold text-blue-900">{monthlySummary.totalTeoricoFmt}</p>
            <p className="text-xs text-blue-600 mt-1">{monthlySummary.totalTeoricoMin} min</p>
          </div>
          <div className="bg-teal-50 rounded-lg p-4 border border-teal-200">
            <div className="flex items-center gap-2 mb-1">
              <i className="ri-time-line text-teal-600"></i>
              <span className="text-sm text-teal-700 font-medium">Tiempo real histórico</span>
            </div>
            <p className="text-2xl font-bold text-teal-900">{monthlySummary.totalRealFmt}</p>
            <p className="text-xs text-teal-600 mt-1">{monthlySummary.totalRealMin} min</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
            <div className="flex items-center gap-2 mb-1">
              <i className="ri-arrow-left-right-line text-amber-600"></i>
              <span className="text-sm text-amber-700 font-medium">Diferencia histórica</span>
            </div>
            <p className={`text-2xl font-bold ${diferenciaColor(monthlySummary.diferenciaMin)}`}>
              {monthlySummary.diferenciaFmt}
            </p>
          </div>
          <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-200">
            <div className="flex items-center gap-2 mb-1">
              <i className="ri-trophy-line text-indigo-600"></i>
              <span className="text-sm text-indigo-700 font-medium">Mayor tiempo real</span>
            </div>
            <p className="text-lg font-bold text-indigo-900 truncate" title={monthlySummary.topMonthName}>
              {monthlySummary.topMonthName}
            </p>
            <p className="text-xs text-indigo-600 mt-1">
              {monthlySummary.topMonthRealFmt} ({monthlySummary.topMonthRealMin} min)
            </p>
          </div>
        </div>
      )}

      {/* ─── Filtros ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
        {/* Selector de vista + rango activo (solo proveedor) */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {analysisMode === 'PROVIDER' && (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">Vista:</span>
              <div className="inline-flex bg-gray-100 rounded-lg p-1">
                {([
                  { key: 'ALL', label: 'Todos' },
                  { key: 'THEORETICAL', label: 'Teórico' },
                  { key: 'REAL', label: 'Real' },
                ] as { key: ViewMode; label: string }[]).map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setViewMode(opt.key)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      viewMode === opt.key
                        ? 'bg-white text-teal-700 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {analysisMode === 'MONTHLY' && (
            <div className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">Global mensual</span>
              <span className="text-gray-400 ml-2">— sin límite de rango</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <i className="ri-calendar-line"></i>
            <span>
              Rango: <span className="font-medium text-gray-900">{fromDate}</span> a{' '}
              <span className="font-medium text-gray-900">{toDate}</span>
            </span>
            {fromDate !== toDate && (
              <span className="text-xs text-gray-400">
                (
                {Math.round(
                  (new Date(toDate + 'T00:00:00').getTime() - new Date(fromDate + 'T00:00:00').getTime()) /
                    (1000 * 60 * 60 * 24)
                ) + 1}{' '}
                días)
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {analysisMode === 'PROVIDER' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Buscar proveedor</label>
                <div className="relative">
                  <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Nombre del proveedor..."
                    className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor</label>
                <select
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
                >
                  <option value="">Todos</option>
                  {providerOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
            />
          </div>
          {analysisMode === 'MONTHLY' && (
            <div className="flex items-end">
              <button
                onClick={loadEarliestDate}
                disabled={isLoadingEarliest}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoadingEarliest ? (
                  <>
                    <i className="ri-loader-4-line animate-spin"></i>
                    Buscando origen...
                  </>
                ) : (
                  <>
                    <i className="ri-history-line"></i>
                    Desde origen hasta hoy
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {dateError && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <i className="ri-error-warning-line"></i>
            {dateError}
          </div>
        )}

        <div className="flex items-end gap-2 flex-wrap">
          <button
            onClick={handleClearFilters}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap cursor-pointer"
          >
            <i className="ri-close-line"></i>
            Limpiar
          </button>
          <button
            onClick={loadReport}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer"
          >
            <i className="ri-refresh-line"></i>
            Actualizar
          </button>
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap cursor-pointer"
          >
            <i className="ri-download-line"></i>
            Descargar
          </button>
        </div>
      </div>

      {/* ─── Tabla / Cards ────────────────────────────────────────────── */}
      {currentData.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <i className="ri-inbox-line text-5xl text-gray-300"></i>
          <p className="mt-4 text-gray-600">No hay registros que mostrar</p>
          {(searchTerm || selectedProvider) && analysisMode === 'PROVIDER' && (
            <button
              onClick={handleClearFilters}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap cursor-pointer"
            >
              <i className="ri-close-line"></i>
              Limpiar Filtros
            </button>
          )}
        </div>
      ) : (
        <>
          {/* ─── Vista Desktop ────────────────────────────────────────── */}
          <div className="hidden lg:block bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {analysisMode === 'PROVIDER' ? (
                      <>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Proveedor</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Código</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Cliente</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Tipo</th>
                        {(viewMode === 'ALL' || viewMode === 'THEORETICAL') && (
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Citas prog.</th>
                        )}
                        {(viewMode === 'ALL' || viewMode === 'REAL') && (
                          <>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Citas IN</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Citas OUT</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Pend. OUT</th>
                          </>
                        )}
                        {(viewMode === 'ALL' || viewMode === 'THEORETICAL') && (
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Tiempo teórico</th>
                        )}
                        {(viewMode === 'ALL' || viewMode === 'REAL') && (
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Tiempo real</th>
                        )}
                        {viewMode === 'ALL' && (
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Diferencia</th>
                        )}
                        {(viewMode === 'ALL' || viewMode === 'THEORETICAL') && (
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">% total teórico</th>
                        )}
                        {(viewMode === 'ALL' || viewMode === 'REAL') && (
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">% total real</th>
                        )}
                        {(viewMode === 'ALL' || viewMode === 'THEORETICAL') && (
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Prom. teórico</th>
                        )}
                        {(viewMode === 'ALL' || viewMode === 'REAL') && (
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Prom. real</th>
                        )}
                      </>
                    ) : (
                      <>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Mes</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Citas prog.</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Citas IN</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Citas OUT</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Pend. OUT</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Tiempo teórico</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Tiempo real</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Diferencia</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">% real vs teórico</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Prom. teórico</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Prom. real</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {analysisMode === 'PROVIDER' ? (
                    <>
                      {paginatedData.map((row: ProviderDistributionRow) => (
                        <tr key={row.provider_name} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.provider_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{row.provider_code ?? <span className="text-gray-400">—</span>}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{row.client_name ?? <span className="text-gray-400">—</span>}</td>
                          <td className="px-4 py-3">{renderProviderTypeBadge(row.provider_type)}</td>
                          {(viewMode === 'ALL' || viewMode === 'THEORETICAL') && (
                            <td className="px-4 py-3 text-sm text-gray-700 text-center">{row.citas_programadas}</td>
                          )}
                          {(viewMode === 'ALL' || viewMode === 'REAL') && (
                            <>
                              <td className="px-4 py-3 text-sm text-gray-700 text-center">{row.citas_con_in}</td>
                              <td className="px-4 py-3 text-sm text-gray-700 text-center">{row.citas_con_out}</td>
                              <td className="px-4 py-3 text-center">
                                {row.pendientes_out > 0 ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                    {row.pendientes_out}
                                  </span>
                                ) : (
                                  <span className="text-sm text-gray-400">0</span>
                                )}
                              </td>
                            </>
                          )}
                          {(viewMode === 'ALL' || viewMode === 'THEORETICAL') && (
                            <td className="px-4 py-3">
                              <div className="flex flex-col">
                                <span className="text-sm font-semibold text-gray-700">{row.tiempo_teorico_formato}</span>
                                <span className="text-xs text-gray-500">{row.tiempo_teorico_minutos} min</span>
                              </div>
                            </td>
                          )}
                          {(viewMode === 'ALL' || viewMode === 'REAL') && (
                            <td className="px-4 py-3">
                              <div className="flex flex-col">
                                <span className="text-sm font-semibold text-teal-700">{row.tiempo_real_formato}</span>
                                <span className="text-xs text-gray-500">{row.tiempo_real_minutos} min</span>
                              </div>
                            </td>
                          )}
                          {viewMode === 'ALL' && (
                            <td className="px-4 py-3">
                              <span className={`text-sm font-semibold whitespace-nowrap ${diferenciaColor(row.diferencia_minutos)}`}>
                                {row.diferencia_formato}
                              </span>
                            </td>
                          )}
                          {(viewMode === 'ALL' || viewMode === 'THEORETICAL') && (
                            <td className="px-4 py-3 text-sm text-gray-700 text-center">{fmtPct(row.pct_teorico_total)}</td>
                          )}
                          {(viewMode === 'ALL' || viewMode === 'REAL') && (
                            <td className="px-4 py-3 text-sm text-gray-700 text-center">{fmtPct(row.pct_real_total)}</td>
                          )}
                          {(viewMode === 'ALL' || viewMode === 'THEORETICAL') && (
                            <td className="px-4 py-3">
                              <div className="flex flex-col">
                                <span className="text-sm font-semibold text-gray-700">{row.promedio_teorico_formato}</span>
                                <span className="text-xs text-gray-500">{row.promedio_teorico_minutos} min</span>
                              </div>
                            </td>
                          )}
                          {(viewMode === 'ALL' || viewMode === 'REAL') && (
                            <td className="px-4 py-3">
                              <div className="flex flex-col">
                                <span className="text-sm font-semibold text-teal-700">{row.promedio_real_formato}</span>
                                <span className="text-xs text-gray-500">{row.promedio_real_minutos} min</span>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                      {providerTotalRow && (
                        <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                          <td className="px-4 py-3 text-sm font-bold text-gray-900">TOTAL</td>
                          <td className="px-4 py-3"><span className="text-sm text-gray-400">—</span></td>
                          <td className="px-4 py-3"><span className="text-sm text-gray-400">—</span></td>
                          <td className="px-4 py-3"><span className="text-sm text-gray-400">—</span></td>
                          {(viewMode === 'ALL' || viewMode === 'THEORETICAL') && (
                            <td className="px-4 py-3 text-sm text-gray-900 text-center">{providerTotalRow.citas_programadas}</td>
                          )}
                          {(viewMode === 'ALL' || viewMode === 'REAL') && (
                            <>
                              <td className="px-4 py-3 text-sm text-gray-900 text-center">{providerTotalRow.citas_con_in}</td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-center">{providerTotalRow.citas_con_out}</td>
                              <td className="px-4 py-3 text-center">
                                {providerTotalRow.pendientes_out > 0 ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                                    {providerTotalRow.pendientes_out}
                                  </span>
                                ) : (
                                  <span className="text-sm text-gray-700">0</span>
                                )}
                              </td>
                            </>
                          )}
                          {(viewMode === 'ALL' || viewMode === 'THEORETICAL') && (
                            <td className="px-4 py-3">
                              <div className="flex flex-col">
                                <span className="text-sm font-semibold text-gray-900">{providerTotalRow.tiempo_teorico_formato}</span>
                                <span className="text-xs text-gray-500">{providerTotalRow.tiempo_teorico_minutos} min</span>
                              </div>
                            </td>
                          )}
                          {(viewMode === 'ALL' || viewMode === 'REAL') && (
                            <td className="px-4 py-3">
                              <div className="flex flex-col">
                                <span className="text-sm font-semibold text-teal-900">{providerTotalRow.tiempo_real_formato}</span>
                                <span className="text-xs text-gray-500">{providerTotalRow.tiempo_real_minutos} min</span>
                              </div>
                            </td>
                          )}
                          {viewMode === 'ALL' && (
                            <td className="px-4 py-3">
                              <span className={`text-sm font-semibold whitespace-nowrap ${diferenciaColor(providerTotalRow.diferencia_minutos)}`}>
                                {providerTotalRow.diferencia_formato}
                              </span>
                            </td>
                          )}
                          {(viewMode === 'ALL' || viewMode === 'THEORETICAL') && (
                            <td className="px-4 py-3 text-sm text-gray-900 text-center">{fmtPct(providerTotalRow.pct_teorico_total)}</td>
                          )}
                          {(viewMode === 'ALL' || viewMode === 'REAL') && (
                            <td className="px-4 py-3 text-sm text-gray-900 text-center">{fmtPct(providerTotalRow.pct_real_total)}</td>
                          )}
                          {(viewMode === 'ALL' || viewMode === 'THEORETICAL') && (
                            <td className="px-4 py-3">
                              <div className="flex flex-col">
                                <span className="text-sm font-semibold text-gray-900">{providerTotalRow.promedio_teorico_formato}</span>
                                <span className="text-xs text-gray-500">{providerTotalRow.promedio_teorico_minutos} min</span>
                              </div>
                            </td>
                          )}
                          {(viewMode === 'ALL' || viewMode === 'REAL') && (
                            <td className="px-4 py-3">
                              <div className="flex flex-col">
                                <span className="text-sm font-semibold text-teal-900">{providerTotalRow.promedio_real_formato}</span>
                                <span className="text-xs text-gray-500">{providerTotalRow.promedio_real_minutos} min</span>
                              </div>
                            </td>
                          )}
                        </tr>
                      )}
                    </>
                  ) : paginatedData.map((row: MonthlyGlobalTimeRow) => (
                        <tr key={row.month_key} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.month_label}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 text-center">{row.citas_programadas}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 text-center">{row.citas_con_in}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 text-center">{row.citas_con_out}</td>
                          <td className="px-4 py-3 text-center">
                            {row.pendientes_out > 0 ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                {row.pendientes_out}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400">0</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-gray-700">{row.tiempo_teorico_formato}</span>
                              <span className="text-xs text-gray-500">{row.tiempo_teorico_minutos} min</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-teal-700">{row.tiempo_real_formato}</span>
                              <span className="text-xs text-gray-500">{row.tiempo_real_minutos} min</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-sm font-semibold whitespace-nowrap ${diferenciaColor(row.diferencia_minutos)}`}>
                              {row.diferencia_formato}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 text-center">{fmtPct(row.pct_real_vs_teorico)}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-gray-700">{row.promedio_teorico_formato}</span>
                              <span className="text-xs text-gray-500">{row.promedio_teorico_minutos} min</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-teal-700">{row.promedio_real_formato}</span>
                              <span className="text-xs text-gray-500">{row.promedio_real_minutos} min</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── Vista Mobile ─────────────────────────────────────────── */}
          <div className="lg:hidden space-y-4">
            {analysisMode === 'PROVIDER' ? (
              <>
                {paginatedData.map((row: ProviderDistributionRow) => (
                  <div key={row.provider_name} className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-gray-900 truncate">{row.provider_name}</h3>
                        <div className="mt-1 flex flex-col gap-0.5">
                          {row.provider_code && (
                            <span className="text-xs text-gray-500">Código: {row.provider_code}</span>
                          )}
                          {row.client_name && (
                            <span className="text-xs text-gray-500">Cliente: {row.client_name}</span>
                          )}
                          <div className="mt-0.5">{renderProviderTypeBadge(row.provider_type)}</div>
                        </div>
                      </div>
                      {viewMode === 'ALL' && (
                        <div className="text-right flex flex-col items-end">
                          <span className={`text-sm font-semibold ${diferenciaColor(row.diferencia_minutos)}`}>
                            {row.diferencia_formato}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      {(viewMode === 'ALL' || viewMode === 'THEORETICAL') && (
                        <div className="bg-gray-50 rounded-md p-2.5">
                          <p className="text-xs text-gray-500 mb-0.5">Citas programadas</p>
                          <p className="text-lg font-bold text-gray-900">{row.citas_programadas}</p>
                        </div>
                      )}
                      {(viewMode === 'ALL' || viewMode === 'REAL') && (
                        <>
                          <div className="bg-gray-50 rounded-md p-2.5">
                            <p className="text-xs text-gray-500 mb-0.5">Citas con IN</p>
                            <p className="text-lg font-bold text-gray-900">{row.citas_con_in}</p>
                          </div>
                          <div className="bg-gray-50 rounded-md p-2.5">
                            <p className="text-xs text-gray-500 mb-0.5">Citas con OUT</p>
                            <p className="text-lg font-bold text-gray-900">{row.citas_con_out}</p>
                          </div>
                          <div className="bg-gray-50 rounded-md p-2.5">
                            <p className="text-xs text-gray-500 mb-0.5">Pendientes OUT</p>
                            <p className={`text-lg font-bold ${row.pendientes_out > 0 ? 'text-amber-700' : 'text-gray-900'}`}>
                              {row.pendientes_out}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="space-y-2 text-sm border-t border-gray-100 pt-3">
                      {(viewMode === 'ALL' || viewMode === 'THEORETICAL') && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Tiempo teórico</span>
                          <span className="font-semibold text-gray-900">
                            {row.tiempo_teorico_formato}{' '}
                            <span className="text-xs font-normal text-gray-500">({row.tiempo_teorico_minutos} min)</span>
                          </span>
                        </div>
                      )}
                      {(viewMode === 'ALL' || viewMode === 'REAL') && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Tiempo real</span>
                          <span className="font-semibold text-teal-700">
                            {row.tiempo_real_formato}{' '}
                            <span className="text-xs font-normal text-gray-500">({row.tiempo_real_minutos} min)</span>
                          </span>
                        </div>
                      )}
                      {viewMode === 'ALL' && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Diferencia</span>
                          <span className={`font-semibold ${diferenciaColor(row.diferencia_minutos)}`}>
                            {row.diferencia_formato}
                          </span>
                        </div>
                      )}
                      {(viewMode === 'ALL' || viewMode === 'THEORETICAL') && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">% sobre total teórico</span>
                          <span className="font-medium text-gray-700">{fmtPct(row.pct_teorico_total)}</span>
                        </div>
                      )}
                      {(viewMode === 'ALL' || viewMode === 'REAL') && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">% sobre total real</span>
                          <span className="font-medium text-gray-700">{fmtPct(row.pct_real_total)}</span>
                        </div>
                      )}
                      {(viewMode === 'ALL' || viewMode === 'THEORETICAL') && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Promedio teórico</span>
                          <span className="font-medium text-gray-900">
                            {row.promedio_teorico_formato}{' '}
                            <span className="text-xs font-normal text-gray-500">({row.promedio_teorico_minutos} min)</span>
                          </span>
                        </div>
                      )}
                      {(viewMode === 'ALL' || viewMode === 'REAL') && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Promedio real</span>
                          <span className="font-medium text-teal-700">
                            {row.promedio_real_formato}{' '}
                            <span className="text-xs font-normal text-gray-500">({row.promedio_real_minutos} min)</span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {providerTotalRow && (
                  <div className="bg-gray-50 rounded-lg border-2 border-gray-300 p-4 font-semibold">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-gray-900 truncate">TOTAL</h3>
                      </div>
                      {viewMode === 'ALL' && (
                        <div className="text-right flex flex-col items-end">
                          <span className={`text-sm font-semibold ${diferenciaColor(providerTotalRow.diferencia_minutos)}`}>
                            {providerTotalRow.diferencia_formato}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      {(viewMode === 'ALL' || viewMode === 'THEORETICAL') && (
                        <div className="bg-gray-100 rounded-md p-2.5">
                          <p className="text-xs text-gray-500 mb-0.5">Citas programadas</p>
                          <p className="text-lg font-bold text-gray-900">{providerTotalRow.citas_programadas}</p>
                        </div>
                      )}
                      {(viewMode === 'ALL' || viewMode === 'REAL') && (
                        <>
                          <div className="bg-gray-100 rounded-md p-2.5">
                            <p className="text-xs text-gray-500 mb-0.5">Citas con IN</p>
                            <p className="text-lg font-bold text-gray-900">{providerTotalRow.citas_con_in}</p>
                          </div>
                          <div className="bg-gray-100 rounded-md p-2.5">
                            <p className="text-xs text-gray-500 mb-0.5">Citas con OUT</p>
                            <p className="text-lg font-bold text-gray-900">{providerTotalRow.citas_con_out}</p>
                          </div>
                          <div className="bg-gray-100 rounded-md p-2.5">
                            <p className="text-xs text-gray-500 mb-0.5">Pendientes OUT</p>
                            <p className={`text-lg font-bold ${providerTotalRow.pendientes_out > 0 ? 'text-amber-700' : 'text-gray-900'}`}>
                              {providerTotalRow.pendientes_out}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="space-y-2 text-sm border-t border-gray-200 pt-3">
                      {(viewMode === 'ALL' || viewMode === 'THEORETICAL') && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Tiempo teórico</span>
                          <span className="font-semibold text-gray-900">
                            {providerTotalRow.tiempo_teorico_formato}{' '}
                            <span className="text-xs font-normal text-gray-500">({providerTotalRow.tiempo_teorico_minutos} min)</span>
                          </span>
                        </div>
                      )}
                      {(viewMode === 'ALL' || viewMode === 'REAL') && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Tiempo real</span>
                          <span className="font-semibold text-teal-900">
                            {providerTotalRow.tiempo_real_formato}{' '}
                            <span className="text-xs font-normal text-gray-500">({providerTotalRow.tiempo_real_minutos} min)</span>
                          </span>
                        </div>
                      )}
                      {viewMode === 'ALL' && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Diferencia</span>
                          <span className={`font-semibold ${diferenciaColor(providerTotalRow.diferencia_minutos)}`}>
                            {providerTotalRow.diferencia_formato}
                          </span>
                        </div>
                      )}
                      {(viewMode === 'ALL' || viewMode === 'THEORETICAL') && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">% sobre total teórico</span>
                          <span className="font-medium text-gray-700">{fmtPct(providerTotalRow.pct_teorico_total)}</span>
                        </div>
                      )}
                      {(viewMode === 'ALL' || viewMode === 'REAL') && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">% sobre total real</span>
                          <span className="font-medium text-gray-700">{fmtPct(providerTotalRow.pct_real_total)}</span>
                        </div>
                      )}
                      {(viewMode === 'ALL' || viewMode === 'THEORETICAL') && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Promedio teórico</span>
                          <span className="font-medium text-gray-900">
                            {providerTotalRow.promedio_teorico_formato}{' '}
                            <span className="text-xs font-normal text-gray-500">({providerTotalRow.promedio_teorico_minutos} min)</span>
                          </span>
                        </div>
                      )}
                      {(viewMode === 'ALL' || viewMode === 'REAL') && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Promedio real</span>
                          <span className="font-medium text-teal-900">
                            {providerTotalRow.promedio_real_formato}{' '}
                            <span className="text-xs font-normal text-gray-500">({providerTotalRow.promedio_real_minutos} min)</span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : paginatedData.map((row: MonthlyGlobalTimeRow) => (
                  <div key={row.month_key} className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-gray-900">{row.month_label}</h3>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <span className={`text-sm font-semibold ${diferenciaColor(row.diferencia_minutos)}`}>
                          {row.diferencia_formato}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="bg-gray-50 rounded-md p-2.5">
                        <p className="text-xs text-gray-500 mb-0.5">Citas programadas</p>
                        <p className="text-lg font-bold text-gray-900">{row.citas_programadas}</p>
                      </div>
                      <div className="bg-gray-50 rounded-md p-2.5">
                        <p className="text-xs text-gray-500 mb-0.5">Citas con IN</p>
                        <p className="text-lg font-bold text-gray-900">{row.citas_con_in}</p>
                      </div>
                      <div className="bg-gray-50 rounded-md p-2.5">
                        <p className="text-xs text-gray-500 mb-0.5">Citas con OUT</p>
                        <p className="text-lg font-bold text-gray-900">{row.citas_con_out}</p>
                      </div>
                      <div className="bg-gray-50 rounded-md p-2.5">
                        <p className="text-xs text-gray-500 mb-0.5">Pendientes OUT</p>
                        <p className={`text-lg font-bold ${row.pendientes_out > 0 ? 'text-amber-700' : 'text-gray-900'}`}>
                          {row.pendientes_out}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm border-t border-gray-100 pt-3">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Tiempo teórico</span>
                        <span className="font-semibold text-gray-900">
                          {row.tiempo_teorico_formato}{' '}
                          <span className="text-xs font-normal text-gray-500">({row.tiempo_teorico_minutos} min)</span>
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Tiempo real</span>
                        <span className="font-semibold text-teal-700">
                          {row.tiempo_real_formato}{' '}
                          <span className="text-xs font-normal text-gray-500">({row.tiempo_real_minutos} min)</span>
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Diferencia</span>
                        <span className={`font-semibold ${diferenciaColor(row.diferencia_minutos)}`}>
                          {row.diferencia_formato}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">% real vs teórico</span>
                        <span className="font-medium text-gray-700">{fmtPct(row.pct_real_vs_teorico)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Promedio teórico</span>
                        <span className="font-medium text-gray-900">
                          {row.promedio_teorico_formato}{' '}
                          <span className="text-xs font-normal text-gray-500">({row.promedio_teorico_minutos} min)</span>
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Promedio real</span>
                        <span className="font-medium text-teal-700">
                          {row.promedio_real_formato}{' '}
                          <span className="text-xs font-normal text-gray-500">({row.promedio_real_minutos} min)</span>
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
          </div>

          {/* ─── Paginación ───────────────────────────────────────────── */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">Mostrar:</span>
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                  {pageSizeOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handlePageSizeChange(option.value)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        pageSize === option.value
                          ? 'bg-white text-teal-700 font-semibold'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">
                  {pageSize === 'all' ? (
                    <>Mostrando {currentData.length} de {currentData.length} registros</>
                  ) : (
                    <>
                      Mostrando {Math.min((currentPage - 1) * (pageSize as number) + 1, currentData.length)}-
                      {Math.min(currentPage * (pageSize as number), currentData.length)} de {currentData.length} registros
                    </>
                  )}
                </span>

                {pageSize !== 'all' && totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePrevPage}
                      disabled={currentPage === 1}
                      className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                        currentPage === 1
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <i className="ri-arrow-left-s-line text-lg"></i>
                    </button>

                    <span className="text-sm font-medium text-gray-700 min-w-[80px] text-center">
                      Página {currentPage} de {totalPages}
                    </span>

                    <button
                      onClick={handleNextPage}
                      disabled={currentPage === totalPages}
                      className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                        currentPage === totalPages
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <i className="ri-arrow-right-s-line text-lg"></i>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}