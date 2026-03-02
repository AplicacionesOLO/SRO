import { useState, useEffect } from 'react';
import { manpowerControlService } from '../../../services/manpowerControlService';
import type { CountryStats, WarehouseStats, WorkTypeStats, ControlData } from '../../../services/manpowerControlService';

interface ManpowerControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
}

type ViewLevel = 'countries' | 'warehouses' | 'workTypes';

export function ManpowerControlModal({ isOpen, onClose, orgId }: ManpowerControlModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [controlData, setControlData] = useState<ControlData | null>(null);

  // Estados de navegación
  const [currentLevel, setCurrentLevel] = useState<ViewLevel>('countries');
  const [selectedCountry, setSelectedCountry] = useState<CountryStats | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<WarehouseStats | null>(null);
  const [workTypeStats, setWorkTypeStats] = useState<WorkTypeStats[]>([]);

  // Cargar datos iniciales
  useEffect(() => {
    if (isOpen && orgId) {
      loadControlData();
    }
  }, [isOpen, orgId]);

  const loadControlData = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await manpowerControlService.getControlData(orgId);
      setControlData(data);
    } catch (err: any) {
      console.error('[ManpowerControlModal] Error loading control data:', err);
      setError(err?.message || 'Error al cargar los datos de control');
    } finally {
      setLoading(false);
    }
  };

  // Seleccionar país y pasar a nivel de almacenes
  const handleCountrySelect = (country: CountryStats) => {
    setSelectedCountry(country);
    setCurrentLevel('warehouses');
  };

  // Seleccionar almacén y cargar tipos de trabajo
  const handleWarehouseSelect = async (warehouse: WarehouseStats) => {
    setSelectedWarehouse(warehouse);
    setLoading(true);
    setError(null);

    try {
      if (!selectedCountry) return;

      const workTypes = await manpowerControlService.getWorkTypesByWarehouse(
        orgId,
        selectedCountry.id,
        warehouse.id
      );
      setWorkTypeStats(workTypes);
      setCurrentLevel('workTypes');
    } catch (err: any) {
      console.error('[ManpowerControlModal] Error loading work types:', err);
      setError(err?.message || 'Error al cargar los tipos de trabajo');
    } finally {
      setLoading(false);
    }
  };

  // Volver al nivel anterior
  const handleBack = () => {
    if (currentLevel === 'workTypes') {
      setCurrentLevel('warehouses');
      setSelectedWarehouse(null);
      setWorkTypeStats([]);
    } else if (currentLevel === 'warehouses') {
      setCurrentLevel('countries');
      setSelectedCountry(null);
      setSelectedWarehouse(null);
    }
  };

  // Cerrar modal y resetear estado
  const handleClose = () => {
    setCurrentLevel('countries');
    setSelectedCountry(null);
    setSelectedWarehouse(null);
    setWorkTypeStats([]);
    setError(null);
    onClose();
  };

  // Filtrar almacenes por país seleccionado
  const filteredWarehouses = controlData?.warehouses.filter(w => {
    if (!selectedCountry) return false;
    // Necesitamos obtener el country_id del almacén
    // Por ahora usamos una query adicional en el service
    return true;
  }) || [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {currentLevel !== 'countries' && (
              <button
                onClick={handleBack}
                className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                disabled={loading}
              >
                <i className="ri-arrow-left-line text-xl"></i>
              </button>
            )}
            <h2 className="text-xl font-semibold text-gray-900">
              {currentLevel === 'countries' && 'Control - Países'}
              {currentLevel === 'warehouses' && `Control - Almacenes de ${selectedCountry?.name}`}
              {currentLevel === 'workTypes' && `Control - Tipos de Trabajo en ${selectedWarehouse?.name}`}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={loading}
          >
            <i className="ri-close-line text-2xl"></i>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && !controlData ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="ri-error-warning-line text-3xl text-red-600"></i>
              </div>
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={loadControlData}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
              >
                Reintentar
              </button>
            </div>
          ) : (
            <>
              {/* Nivel A: Grid de Países */}
              {currentLevel === 'countries' && controlData && (
                <div>
                  {controlData.countries.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i className="ri-global-line text-3xl text-gray-400"></i>
                      </div>
                      <p className="text-gray-600">No hay países con colaboradores</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {controlData.countries.map(country => (
                        <button
                          key={country.id}
                          onClick={() => handleCountrySelect(country)}
                          className="bg-white border-2 border-gray-200 rounded-lg p-6 hover:border-teal-500 hover:shadow-md transition-all text-left"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
                              <i className="ri-global-line text-2xl text-teal-600"></i>
                            </div>
                            <i className="ri-arrow-right-line text-xl text-gray-400"></i>
                          </div>
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">
                            {country.name}
                          </h3>
                          <div className="flex items-center space-x-2 text-gray-600">
                            <i className="ri-user-line text-lg"></i>
                            <span className="text-2xl font-bold text-teal-600">
                              {country.totalCollaborators}
                            </span>
                            <span className="text-sm">colaboradores</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Nivel B: Grid de Almacenes */}
              {currentLevel === 'warehouses' && controlData && selectedCountry && (
                <div>
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                    </div>
                  ) : filteredWarehouses.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i className="ri-building-line text-3xl text-gray-400"></i>
                      </div>
                      <p className="text-gray-600">No hay almacenes con colaboradores en este país</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredWarehouses.map(warehouse => (
                        <button
                          key={warehouse.id}
                          onClick={() => handleWarehouseSelect(warehouse)}
                          className="bg-white border-2 border-gray-200 rounded-lg p-6 hover:border-teal-500 hover:shadow-md transition-all text-left"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                              <i className="ri-building-line text-2xl text-blue-600"></i>
                            </div>
                            <i className="ri-arrow-right-line text-xl text-gray-400"></i>
                          </div>
                          <h3 className="text-lg font-semibold text-gray-900 mb-3">
                            {warehouse.name}
                          </h3>
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2 text-gray-600">
                              <i className="ri-user-line text-lg"></i>
                              <span className="text-xl font-bold text-blue-600">
                                {warehouse.totalCollaborators}
                              </span>
                              <span className="text-sm">colaboradores</span>
                            </div>
                            <div className="flex items-center space-x-2 text-gray-600">
                              <i className="ri-file-list-line text-lg"></i>
                              <span className="text-xl font-bold text-gray-600">
                                {warehouse.totalRecords}
                              </span>
                              <span className="text-sm">registros</span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Nivel C: Tabla de Tipos de Trabajo */}
              {currentLevel === 'workTypes' && (
                <div>
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                    </div>
                  ) : workTypeStats.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i className="ri-briefcase-line text-3xl text-gray-400"></i>
                      </div>
                      <p className="text-gray-600">No hay tipos de trabajo registrados</p>
                    </div>
                  ) : (
                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Tipo de Trabajo
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Cantidad de Colaboradores
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {workTypeStats.map((workType, index) => (
                            <tr key={workType.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-4">
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                                    <i className="ri-briefcase-line text-lg text-purple-600"></i>
                                  </div>
                                  <span className="text-sm font-medium text-gray-900">
                                    {workType.name}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <span className="text-2xl font-bold text-purple-600">
                                  {workType.totalCollaborators}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t px-6 py-4 flex justify-end">
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
