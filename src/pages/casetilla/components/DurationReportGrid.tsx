import { useState, useMemo, useEffect, useCallback } from 'react';
import { casetillaService } from '../../../services/casetillaService';
import PhotoViewer from '../../../components/base/PhotoViewer';
import { formatInWarehouseTimezone } from '../../../utils/timezoneUtils';

/**
 * Calcula el offset UTC dinámico de un timezone IANA en el instante actual.
 * Ej: 'America/Caracas' → 'UTC-4', 'America/Costa_Rica' → 'UTC-6'
 */
function getUtcOffsetLabel(timezone: string): string {
  try {
    const now = new Date();
    const utcMs = now.getTime();
    const localMs = new Date(
      now.toLocaleString('en-US', { timeZone: timezone })
    ).getTime();
    const offsetMinutes = Math.round((localMs - utcMs) / 60000);
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absMin = Math.abs(offsetMinutes);
    const h = Math.floor(absMin / 60);
    const m = absMin % 60;
    return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${String(m).padStart(2, '0')}`;
  } catch {
    return 'UTC';
  }
}

interface DurationReportRow {
  reservation_id: string;
  chofer: string;
  matricula: string;
  dua: string | null;
  ingreso_at: string;
  salida_at: string;
  duracion_minutos: number;
  duracion_formato: string;
  fotos_ingreso?: string[] | null;
  fotos_salida?: string[] | null;
  warehouse_timezone?: string;
}

interface DurationReportGridProps {
  orgId: string;
  allowedWarehouseIds?: string[] | null;
  clientId?: string | null;
}

type PageSize = 10 | 30 | 50 | 100 | 'all';

interface PhotoViewerState {
  isOpen: boolean;
  photos: string[];
  initialIndex: number;
  title: string;
}

// Mini componente de thumbnails de fotos
function PhotoThumbnails({
  fotos,
  label,
  colorClass,
  iconClass,
  onOpen,
}: {
  fotos: string[] | null | undefined;
  label: string;
  colorClass: string;
  iconClass: string;
  onOpen: (photos: string[], index: number) => void;
}) {
  if (!fotos || fotos.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className={`text-xs font-medium ${colorClass} flex items-center gap-1`}>
        <i className={iconClass}></i>
        {label}
      </span>
      {fotos.slice(0, 3).map((url, idx) => (
        <button
          key={url}
          onClick={() => onOpen(fotos, idx)}
          className="w-8 h-8 rounded overflow-hidden border border-gray-200 hover:border-gray-400 transition-all cursor-pointer flex-shrink-0 relative group"
          title={`Ver foto ${idx + 1} de ${fotos.length}`}
        >
          <img
            src={url}
            alt={`${label} ${idx + 1}`}
            loading="lazy"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <i className="ri-zoom-in-line text-white text-xs opacity-0 group-hover:opacity-100"></i>
          </div>
        </button>
      ))}
      {fotos.length > 3 && (
        <button
          onClick={() => onOpen(fotos, 3)}
          className="w-8 h-8 rounded overflow-hidden border border-gray-200 bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer flex-shrink-0 flex items-center justify-center"
          title={`Ver todas las fotos`}
        >
          <span className="text-xs font-bold text-gray-600">+{fotos.length - 3}</span>
        </button>
      )}
    </div>
  );
}

// Badge de resumen de fotos para mobile
function PhotoBadge({
  fotosIngreso,
  fotosSalida,
  onOpenIngreso,
  onOpenSalida,
}: {
  fotosIngreso?: string[] | null;
  fotosSalida?: string[] | null;
  onOpenIngreso: () => void;
  onOpenSalida: () => void;
}) {
  const hasIngreso = fotosIngreso && fotosIngreso.length > 0;
  const hasSalida = fotosSalida && fotosSalida.length > 0;

  if (!hasIngreso && !hasSalida) return null;

  return (
    <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
      {hasIngreso && (
        <button
          onClick={onOpenIngreso}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-teal-50 text-teal-700 rounded-full text-xs font-medium hover:bg-teal-100 transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-image-line"></i>
          {fotosIngreso!.length} foto{fotosIngreso!.length > 1 ? 's' : ''} entrada
        </button>
      )}
      {hasSalida && (
        <button
          onClick={onOpenSalida}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium hover:bg-emerald-100 transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-image-line"></i>
          {fotosSalida!.length} foto{fotosSalida!.length > 1 ? 's' : ''} salida
        </button>
      )}
    </div>
  );
}

export default function DurationReportGrid({ orgId, allowedWarehouseIds, clientId }: DurationReportGridProps) {
  const [data, setData] = useState<DurationReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [currentPage, setCurrentPage] = useState(1);

  const [viewer, setViewer] = useState<PhotoViewerState>({
    isOpen: false,
    photos: [],
    initialIndex: 0,
    title: '',
  });

  const openViewer = useCallback((photos: string[], index: number) => {
    setViewer({ isOpen: true, photos, initialIndex: index, title: '' });
  }, []);

  const closeViewer = useCallback(() => {
    setViewer((prev) => ({ ...prev, isOpen: false }));
  }, []);

  useEffect(() => {
    loadDurationReport();
  }, [orgId, allowedWarehouseIds, clientId]);

  const loadDurationReport = async () => {
    setIsLoading(true);
    try {
      const report = await casetillaService.getDurationReport(orgId, undefined, allowedWarehouseIds, clientId);
      setData(report);
    } catch {
      setData([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    if (!Array.isArray(data)) return [];

    let filtered = [...data];

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (row) =>
          row.chofer.toLowerCase().includes(term) ||
          row.matricula.toLowerCase().includes(term) ||
          (row.dua && row.dua.toLowerCase().includes(term))
      );
    }

    if (dateFrom) {
      filtered = filtered.filter((row) => row.ingreso_at >= dateFrom);
    }

    if (dateTo) {
      filtered = filtered.filter((row) => row.ingreso_at <= dateTo + 'T23:59:59');
    }

    filtered.sort((a, b) => {
      const ta = a?.ingreso_at ? new Date(a.ingreso_at).getTime() : 0;
      const tb = b?.ingreso_at ? new Date(b.ingreso_at).getTime() : 0;
      return tb - ta;
    });

    return filtered;
  }, [data, searchTerm, dateFrom, dateTo]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, dateFrom, dateTo, pageSize]);

  const paginatedData = useMemo(() => {
    if (pageSize === 'all') return filteredData;
    const startIndex = (currentPage - 1) * pageSize;
    return filteredData.slice(startIndex, startIndex + pageSize);
  }, [filteredData, currentPage, pageSize]);

  const totalPages = useMemo(() => {
    if (pageSize === 'all') return 1;
    return Math.ceil(filteredData.length / pageSize);
  }, [filteredData.length, pageSize]);

  /**
   * Detecta el/los timezone(s) presentes en los datos filtrados.
   * Si todos son iguales → muestra uno solo con su offset.
   * Si hay mezcla → muestra "Múltiples zonas horarias".
   */
  const timezoneLabel = useMemo(() => {
    if (filteredData.length === 0) return null;
    const tzSet = new Set(filteredData.map((r) => r.warehouse_timezone || 'America/Costa_Rica'));
    if (tzSet.size === 1) {
      const tz = [...tzSet][0];
      const offset = getUtcOffsetLabel(tz);
      return `${tz} (${offset})`;
    }
    return 'Múltiples zonas horarias';
  }, [filteredData]);

  const summary = useMemo(() => {
    if (filteredData.length === 0) {
      return { total: 0, promedioFormato: '00:00', maximoFormato: '00:00', minimoFormato: '00:00', promedio: 0, maximo: 0, minimo: 0 };
    }

    const duraciones = filteredData.map((row) => row.duracion_minutos);
    const total = filteredData.length;
    const suma = duraciones.reduce((acc, val) => acc + val, 0);
    const promedio = Math.round(suma / total);
    const maximo = Math.max(...duraciones);
    const minimo = Math.min(...duraciones);

    const fmt = (mins: number) => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    return { total, promedio, maximo, minimo, promedioFormato: fmt(promedio), maximoFormato: fmt(maximo), minimoFormato: fmt(minimo) };
  }, [filteredData]);

  /**
   * Formatea un timestamp UTC en la zona horaria del almacén asociado a la fila.
   * Si no viene warehouse_timezone, usa America/Costa_Rica como fallback.
   */
  const formatDateTime = (isoString: string, timezone?: string) => {
    const tz = timezone || 'America/Costa_Rica';
    return formatInWarehouseTimezone(new Date(isoString), tz, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const handleClearFilters = () => { setSearchTerm(''); setDateFrom(''); setDateTo(''); setCurrentPage(1); };
  const handlePageSizeChange = (newSize: PageSize) => { setPageSize(newSize); setCurrentPage(1); };
  const handlePrevPage = () => setCurrentPage((prev) => Math.max(1, prev - 1));
  const handleNextPage = () => setCurrentPage((prev) => Math.min(totalPages, prev + 1));

  const pageSizeOptions: { value: PageSize; label: string }[] = [
    { value: 10, label: '10' }, { value: 30, label: '30' }, { value: 50, label: '50' },
    { value: 100, label: '100' }, { value: 'all', label: 'TODOS' },
  ];

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

  return (
    <>
      <PhotoViewer
        photos={viewer.photos}
        isOpen={viewer.isOpen}
        initialIndex={viewer.initialIndex}
        onClose={closeViewer}
      />

      <div className="space-y-6">
        {/* Resumen superior */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-teal-50 rounded-lg p-4 border border-teal-200">
            <div className="flex items-center gap-2 mb-1">
              <i className="ri-file-list-line text-teal-600"></i>
              <span className="text-sm text-teal-700 font-medium">Total Salidas</span>
            </div>
            <p className="text-2xl font-bold text-teal-900">{summary.total}</p>
          </div>

          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <div className="flex items-center gap-2 mb-1">
              <i className="ri-time-line text-green-600"></i>
              <span className="text-sm text-green-700 font-medium">Promedio</span>
            </div>
            <p className="text-2xl font-bold text-green-900">{summary.promedioFormato}</p>
            <p className="text-xs text-green-600 mt-1">{summary.promedio} min</p>
          </div>

          <div className="bg-red-50 rounded-lg p-4 border border-red-200">
            <div className="flex items-center gap-2 mb-1">
              <i className="ri-arrow-up-line text-red-600"></i>
              <span className="text-sm text-red-700 font-medium">Máximo</span>
            </div>
            <p className="text-2xl font-bold text-red-900">{summary.maximoFormato}</p>
            <p className="text-xs text-red-600 mt-1">{summary.maximo} min</p>
          </div>

          <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
            <div className="flex items-center gap-2 mb-1">
              <i className="ri-arrow-down-line text-amber-600"></i>
              <span className="text-sm text-amber-700 font-medium">Mínimo</span>
            </div>
            <p className="text-2xl font-bold text-amber-900">{summary.minimoFormato}</p>
            <p className="text-xs text-amber-600 mt-1">{summary.minimo} min</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Buscar</label>
              <div className="relative">
                <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Chofer, Matrícula o DUA..."
                  className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            <button
              onClick={handleClearFilters}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap cursor-pointer"
            >
              <i className="ri-close-line"></i>
              Limpiar Filtros
            </button>
            <button
              onClick={() => loadDurationReport()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer"
            >
              <i className="ri-refresh-line"></i>
              Actualizar
            </button>
            {timezoneLabel && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500 whitespace-nowrap">
                <i className="ri-time-zone-line text-gray-400"></i>
                Timezone: <span className="font-medium text-gray-700">{timezoneLabel}</span>
              </span>
            )}
          </div>
        </div>

        {/* Tabla / Cards */}
        {filteredData.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <i className="ri-inbox-line text-5xl text-gray-300"></i>
            <p className="mt-4 text-gray-600">No hay registros que mostrar</p>
            {(searchTerm || dateFrom || dateTo) && (
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
            {/* Vista Desktop - Tabla */}
            <div className="hidden lg:block bg-white rounded-lg border border-gray-200 overflow-hidden">
              {timezoneLabel && (
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-1.5">
                  <i className="ri-time-zone-line text-gray-400 text-xs"></i>
                  <span className="text-xs text-gray-500">
                    Horas mostradas en: <span className="font-medium text-gray-700">{timezoneLabel}</span>
                  </span>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Chofer</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Matrícula</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">DUA</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Ingreso</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Salida</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Duración</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Fotos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {paginatedData.map((row) => {
                      const hasIngreso = row.fotos_ingreso && row.fotos_ingreso.length > 0;
                      const hasSalida = row.fotos_salida && row.fotos_salida.length > 0;
                      return (
                        <tr key={row.reservation_id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-sm text-gray-900">{row.chofer}</td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.matricula}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{row.dua || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{formatDateTime(row.ingreso_at, row.warehouse_timezone)}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{formatDateTime(row.salida_at, row.warehouse_timezone)}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-teal-700">{row.duracion_formato}</span>
                              <span className="text-xs text-gray-500">{row.duracion_minutos} min</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {!hasIngreso && !hasSalida ? (
                              <span className="text-xs text-gray-400 italic">Sin fotos</span>
                            ) : (
                              <div className="flex flex-col gap-1.5">
                                <PhotoThumbnails
                                  fotos={row.fotos_ingreso}
                                  label="Entrada"
                                  colorClass="text-teal-600"
                                  iconClass="ri-login-box-line"
                                  onOpen={openViewer}
                                />
                                <PhotoThumbnails
                                  fotos={row.fotos_salida}
                                  label="Salida"
                                  colorClass="text-emerald-600"
                                  iconClass="ri-logout-box-line"
                                  onOpen={openViewer}
                                />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Vista Mobile - Cards */}
            <div className="lg:hidden space-y-4">
              {timezoneLabel && (
                <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                  <i className="ri-time-zone-line text-gray-400 text-xs"></i>
                  <span className="text-xs text-gray-500">
                    Horas en: <span className="font-medium text-gray-700">{timezoneLabel}</span>
                  </span>
                </div>
              )}
              {paginatedData.map((row) => (
                <div
                  key={row.reservation_id}
                  className="bg-white rounded-lg border border-gray-200 p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <i className="ri-user-line text-gray-400"></i>
                        <span className="text-sm font-semibold text-gray-900">{row.chofer}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <i className="ri-car-line text-gray-400"></i>
                        <span className="text-sm font-medium text-gray-700">{row.matricula}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-teal-700">{row.duracion_formato}</div>
                      <div className="text-xs text-gray-500">{row.duracion_minutos} min</div>
                    </div>
                  </div>

                  {row.dua && (
                    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100">
                      <i className="ri-file-text-line text-gray-400"></i>
                      <span className="text-sm text-gray-600">DUA: {row.dua}</span>
                    </div>
                  )}

                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2">
                      <i className="ri-login-box-line text-teal-600 mt-0.5"></i>
                      <div className="flex-1">
                        <span className="text-gray-500">Ingreso:</span>
                        <span className="ml-2 text-gray-900">{formatDateTime(row.ingreso_at, row.warehouse_timezone)}</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <i className="ri-logout-box-line text-emerald-600 mt-0.5"></i>
                      <div className="flex-1">
                        <span className="text-gray-500">Salida:</span>
                        <span className="ml-2 text-gray-900">{formatDateTime(row.salida_at, row.warehouse_timezone)}</span>
                      </div>
                    </div>
                  </div>

                  <PhotoBadge
                    fotosIngreso={row.fotos_ingreso}
                    fotosSalida={row.fotos_salida}
                    onOpenIngreso={() => openViewer(row.fotos_ingreso!, 0)}
                    onOpenSalida={() => openViewer(row.fotos_salida!, 0)}
                  />
                </div>
              ))}
            </div>

            {/* Paginación */}
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
                      <>Mostrando {filteredData.length} de {filteredData.length} registros</>
                    ) : (
                      <>
                        Mostrando {Math.min((currentPage - 1) * (pageSize as number) + 1, filteredData.length)}-
                        {Math.min(currentPage * (pageSize as number), filteredData.length)} de {filteredData.length} registros
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
    </>
  );
}
