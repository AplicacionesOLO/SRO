import { useState, useCallback } from 'react';
import type { ComplianceFilters, IncidentSeverity, ComplianceResult, IncidentStatus } from '@/types/compliance';

interface ComplianceFiltersBarProps {
  filters: ComplianceFilters;
  onFiltersChange: (filters: ComplianceFilters) => void;
  availableWarehouses: { id: string; name: string }[];
  availableClients: { id: string; name: string }[];
  onRefresh: () => void;
  lastUpdated: string | null;
  loading?: boolean;
  isDemo?: boolean;
}

export default function ComplianceFiltersBar({
  filters,
  onFiltersChange,
  availableWarehouses,
  availableClients,
  onRefresh,
  lastUpdated,
  loading,
  isDemo,
}: ComplianceFiltersBarProps) {
  const [showFilters, setShowFilters] = useState(false);

  const update = useCallback(
    (patch: Partial<ComplianceFilters>) => {
      onFiltersChange({ ...filters, ...patch, page: 1 });
    },
    [filters, onFiltersChange]
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Búsqueda */}
        <div className="relative flex-1 w-full">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
          <input
            type="text"
            placeholder="Buscar reserva, placa, conductor, proveedor..."
            value={filters.searchTerm}
            onChange={(e) => update({ searchTerm: e.target.value })}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
          />
          {filters.searchTerm && (
            <button
              onClick={() => update({ searchTerm: '' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <i className="ri-close-line"></i>
            </button>
          )}
        </div>

        {/* Botón filtros */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
            showFilters ? 'bg-teal-50 border-teal-300 text-teal-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <i className="ri-filter-line"></i>
          Filtros
        </button>

        {/* Actualizar */}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
        >
          <i className={`ri-refresh-line ${loading ? 'animate-spin' : ''}`}></i>
          Actualizar
        </button>

        {/* Última actualización */}
        {lastUpdated && (
          <span className="text-xs text-gray-400 whitespace-nowrap">
            {lastUpdated}
          </span>
        )}
      </div>

      {/* Panel de filtros expandibles */}
      {showFilters && (
        <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Resultado */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Resultado</label>
            <select
              value={filters.result ?? ''}
              onChange={(e) => update({ result: (e.target.value || null) as ComplianceResult | null })}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white cursor-pointer"
            >
              <option value="">Todos</option>
              <option value="PASS">Aprobadas</option>
              <option value="WARN">Con advertencia</option>
              <option value="BLOCK">Bloqueadas</option>
              <option value="ERROR">Con error</option>
              <option value="NOT_EVALUATED">Sin evaluar</option>
            </select>
          </div>

          {/* Severidad */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Severidad</label>
            <select
              value={filters.severity ?? ''}
              onChange={(e) => update({ severity: (e.target.value || null) as IncidentSeverity | null })}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white cursor-pointer"
            >
              <option value="">Todas</option>
              <option value="INFO">INFO</option>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </div>

          {/* Warehouse */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Almacén</label>
            <select
              value={filters.warehouseId ?? ''}
              onChange={(e) => update({ warehouseId: e.target.value || null })}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white cursor-pointer"
            >
              <option value="">Todos</option>
              {availableWarehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          {/* Estado de incidencia */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Estado incidencia</label>
            <select
              value={filters.incidentStatus ?? ''}
              onChange={(e) => update({ incidentStatus: (e.target.value || null) as IncidentStatus | null })}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white cursor-pointer"
            >
              <option value="">Todas</option>
              <option value="OPEN">Abiertas</option>
              <option value="IN_REVIEW">En revisión</option>
              <option value="RESOLVED">Resueltas</option>
              <option value="DISMISSED">Descartadas</option>
              <option value="VOIDED">Anuladas</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}