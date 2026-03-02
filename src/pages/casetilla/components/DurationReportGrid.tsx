
import { useState, useMemo, useEffect } from 'react';
import { casetillaService } from '../../../services/casetillaService';

interface DurationReportRow {
  reservation_id: string;
  chofer: string;
  matricula: string;
  dua: string | null;
  ingreso_at: string;
  salida_at: string;
  duracion_minutos: number;
  duracion_formato: string;
}

interface DurationReportGridProps {
  orgId: string;
}

type PageSize = 10 | 30 | 50 | 100 | 'all';

export default function DurationReportGrid({ orgId }: DurationReportGridProps) {
  const [data, setData] = useState<DurationReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Cargar datos
  useEffect(() => {
    loadDurationReport();
  }, [orgId]);

  const loadDurationReport = async () => {
    setIsLoading(true);
    try {
      const report = await casetillaService.getDurationReport(orgId);
      setData(report);
    } catch (error) {
      console.error('Error loading duration report:', error);
      setData([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Filtrar y ordenar datos
  const filteredData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    
    let filtered = [...data];

    // Filtro de búsqueda
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (row) =>
          row.chofer.toLowerCase().includes(term) ||
          row.matricula.toLowerCase().includes(term) ||
          (row.dua && row.dua.toLowerCase().includes(term))
      );
    }

    // Filtro de fecha desde
    if (dateFrom) {
      filtered = filtered.filter((row) => row.ingreso_at >= dateFrom);
    }

    // Filtro de fecha hasta
    if (dateTo) {
      filtered = filtered.filter((row) => row.ingreso_at <= dateTo + 'T23:59:59');
    }

    // Ordenar por duración descendente
    filtered.sort((a, b) => {
  const ta = a?.ingreso_at ? new Date(a.ingreso_at).getTime() : 0;
  const tb = b?.ingreso_at ? new Date(b.ingreso_at).getTime() : 0;
  return tb - ta; // DESC
});

    return filtered;
  }, [data, searchTerm, dateFrom, dateTo]);

  // Resetear página cuando cambian los filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, dateFrom, dateTo, pageSize]);

  // Calcular datos paginados
  const paginatedData = useMemo(() => {
    if (pageSize === 'all') {
      return filteredData;
    }
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredData.slice(startIndex, endIndex);
  }, [filteredData, currentPage, pageSize]);

  // Calcular total de páginas
  const totalPages = useMemo(() => {
    if (pageSize === 'all') return 1;
    return Math.ceil(filteredData.length / pageSize);
  }, [filteredData.length, pageSize]);

  // Calcular resumen
  const summary = useMemo(() => {
    if (filteredData.length === 0) {
      return {
        total: 0,
        promedio: 0,
        maximo: 0,
        minimo: 0,
        promedioFormato: '00:00',
        maximoFormato: '00:00',
        minimoFormato: '00:00',
      };
    }

    const duraciones = filteredData.map((row) => row.duracion_minutos);
    const total = filteredData.length;
    const suma = duraciones.reduce((acc, val) => acc + val, 0);
    const promedio = Math.round(suma / total);
    const maximo = Math.max(...duraciones);
    const minimo = Math.min(...duraciones);

    const formatMinutes = (mins: number) => {
      const hours = Math.floor(mins / 60);
      const minutes = mins % 60;
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    };

    return {
      total,
      promedio,
      maximo,
      minimo,
      promedioFormato: formatMinutes(promedio),
      maximoFormato: formatMinutes(maximo),
      minimoFormato: formatMinutes(minimo),
    };
  }, [filteredData]);

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
  };

  const handlePageSizeChange = (newSize: PageSize) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  const pageSizeOptions: { value: PageSize; label: string }[] = [
    { value: 10, label: '10' },
    { value: 30, label: '30' },
    { value: 50, label: '50' },
    { value: 100, label: '100' },
    { value: 'all', label: 'TODOS' },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-600">Cargando reporte...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Resumen superior */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <div className="flex items-center gap-2 mb-1">
            <i className="ri-file-list-line text-blue-600"></i>
            <span className="text-sm text-blue-700 font-medium">Total Salidas</span>
          </div>
          <p className="text-2xl font-bold text-blue-900">{summary.total}</p>
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
          {/* Búsqueda */}
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Buscar
            </label>
            <div className="relative">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Chofer, Matrícula o DUA..."
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Fecha desde */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Desde
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Fecha hasta */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Hasta
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex flex-wrap gap-2 mt-4">
          <button
            onClick={handleClearFilters}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap cursor-pointer"
          >
            <i className="ri-close-line"></i>
            Limpiar Filtros
          </button>
          <button
            onClick={loadDurationReport}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap cursor-pointer"
          >
            <i className="ri-refresh-line"></i>
            Actualizar
          </button>
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
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Chofer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Matrícula
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      DUA
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Ingreso
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Salida
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Duración
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paginatedData.map((row) => (
                    <tr key={row.reservation_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-900">{row.chofer}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.matricula}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{row.dua || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDateTime(row.ingreso_at)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDateTime(row.salida_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-blue-600">{row.duracion_formato}</span>
                          <span className="text-xs text-gray-500">{row.duracion_minutos} min</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Vista Mobile - Cards */}
          <div className="lg:hidden space-y-4">
            {paginatedData.map((row) => (
              <div
                key={row.reservation_id}
                className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm"
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
                    <div className="text-lg font-bold text-blue-600">{row.duracion_formato}</div>
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
                      <span className="ml-2 text-gray-900">{formatDateTime(row.ingreso_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <i className="ri-logout-box-line text-emerald-600 mt-0.5"></i>
                    <div className="flex-1">
                      <span className="text-gray-500">Salida:</span>
                      <span className="ml-2 text-gray-900">{formatDateTime(row.salida_at)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Paginación */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              {/* Selector de registros por página */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">Mostrar:</span>
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                  {pageSizeOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handlePageSizeChange(option.value)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        pageSize === option.value
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Info y navegación */}
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">
                  {pageSize === 'all' ? (
                    <>Mostrando {filteredData.length} de {filteredData.length} registros</>
                  ) : (
                    <>
                      Mostrando {Math.min((currentPage - 1) * pageSize + 1, filteredData.length)}-
                      {Math.min(currentPage * pageSize, filteredData.length)} de {filteredData.length} registros
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
