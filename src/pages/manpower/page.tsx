import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { collaboratorsService } from '../../services/collaboratorsService';
import { countriesService } from '../../services/countriesService';
import { warehousesService } from '../../services/warehousesService';
import { CollaboratorModal } from './components/CollaboratorModal';
import { ManpowerControlModal } from './components/ManpowerControlModal';
import type { Collaborator, CollaboratorFormData, WorkType } from '../../types/collaborator';
import type { Country, Warehouse } from '../../types/warehouse';

export default function ManpowerPage() {
  const { user } = useAuth();
  const { can, loading: permsLoading, orgId } = usePermissions();

  const canView = can('manpower.view');
  const canManage = can('manpower.manage');

  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [viewAll, setViewAll] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCollaborator, setEditingCollaborator] = useState<Collaborator | null>(null);

  // Modal Control
  const [isControlModalOpen, setIsControlModalOpen] = useState(false);

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // =========================
  // Wrappers "callXService" (para no romper nada)
  // =========================
  const callCountriesService = useCallback(async (orgId: string) => {
    try {
      // ✅ tu countriesService real tiene getAll/getActive y ahora también getCountries
      if (typeof (countriesService as any).getCountries === 'function') {
        return await (countriesService as any).getCountries(orgId);
      }
      if (typeof (countriesService as any).getActive === 'function') {
        return await (countriesService as any).getActive(orgId);
      }
      return await countriesService.getAll(orgId);
    } catch (err) {
      console.error('[Manpower] callCountriesService error', err);
      throw err;
    }
  }, []);

  const callWarehousesService = useCallback(async (orgId: string) => {
    try {
      // ✅ tu warehousesService tiene getWarehouses y alias getAll
      if (typeof (warehousesService as any).getWarehouses === 'function') {
        return await (warehousesService as any).getWarehouses(orgId);
      }
      return await (warehousesService as any).getAll(orgId);
    } catch (err) {
      console.error('[Manpower] callWarehousesService error', err);
      throw err;
    }
  }, []);

  const callWorkTypesService = useCallback(async (orgId: string) => {
    try {
      // collaboratorsService.getWorkTypes existe en tu código original
      return await collaboratorsService.getWorkTypes(orgId);
    } catch (err) {
      console.error('[Manpower] callWorkTypesService error', err);
      throw err;
    }
  }, []);

const countryNameById = useMemo(() => {
  const m = new Map<string, string>();
  countries.forEach(c => m.set(c.id, c.name));
  return m;
}, [countries]);

const workTypeNameById = useMemo(() => {
  const m = new Map<string, string>();
  workTypes.forEach(wt => m.set(wt.id, wt.name));
  return m;
}, [workTypes]);
// =========================
// Carga inicial
// =========================
const loadInitialData = useCallback(async () => {
  console.log('[Manpower] loadInitialData org resolve', {
    resolvedOrgId: orgId
  });

  if (!orgId) {
    setError('Sin organización asignada');
    setCountries([]);
    setWarehouses([]);
    setWorkTypes([]);
    setLoading(false);
    return;
  }

  setLoading(true);
  setError(null);

  try {
    const [countriesData, warehousesData, workTypesData] = await Promise.all([
      callCountriesService(orgId),
      callWarehousesService(orgId),
      callWorkTypesService(orgId),
    ]);

    console.log('[Manpower] initial data loaded', {
      countries: Array.isArray(countriesData) ? countriesData.length : 'not-array',
      warehouses: Array.isArray(warehousesData) ? warehousesData.length : 'not-array',
      workTypes: Array.isArray(workTypesData) ? workTypesData.length : 'not-array'
    });

    setCountries(Array.isArray(countriesData) ? countriesData : []);
    setWarehouses(Array.isArray(warehousesData) ? warehousesData : []);
    setWorkTypes(Array.isArray(workTypesData) ? workTypesData : []);
  } catch (err: any) {
    console.error('[Manpower] Error loading initial data:', err);
    setError(err?.message || 'Error al cargar los datos iniciales');
    setCountries([]);
    setWarehouses([]);
    setWorkTypes([]);
  } finally {
    setLoading(false);
  }
}, [orgId, callCountriesService, callWarehousesService, callWorkTypesService]);
// =========================
// Cargar colaboradores
// =========================
const loadCollaborators = useCallback(async () => {
  console.log('[Manpower] loadCollaborators org resolve', {
    resolvedOrgId: orgId,
    viewAll,
    selectedCountry,
    selectedWarehouse
  });

  if (!orgId) return;

  if (!viewAll && !selectedCountry && !selectedWarehouse) {
    setCollaborators([]);
    return;
  }

  setLoading(true);
  setError(null);

  try {
    const data = await collaboratorsService.getCollaborators(orgId, {
      countryId: selectedCountry,
      warehouseId: selectedWarehouse,
      viewAll
    });

    setCollaborators(Array.isArray(data) ? data : []);
    setCurrentPage(1);
  } catch (err: any) {
    console.error('[Manpower] Error loading collaborators:', err);
    setError(err?.message || 'Error al cargar los colaboradores');
    setCollaborators([]);
  } finally {
    setLoading(false);
  }
}, [orgId, viewAll, selectedCountry, selectedWarehouse]);

  // =========================
  // Effects
  // =========================
  useEffect(() => {
    if (permsLoading) return;
    if (!canView && !canManage) return;

    loadInitialData();
  }, [permsLoading, canView, canManage, loadInitialData]);

  useEffect(() => {
    if (permsLoading) return;
    if (!canView && !canManage) return;

    loadCollaborators();
  }, [permsLoading, canView, canManage, loadCollaborators]);

  // =========================
  // Memos
  // =========================
  const filteredCollaborators = useMemo(() => {
    if (!searchTerm.trim()) return collaborators;

    const term = searchTerm.toLowerCase();
    return collaborators.filter(c =>
      c.full_name?.toLowerCase().includes(term) ||
      c.ficha?.toLowerCase().includes(term) ||
      c.cedula?.toLowerCase().includes(term)
    );
  }, [collaborators, searchTerm]);

  const totalPages = Math.ceil(filteredCollaborators.length / itemsPerPage);

  const paginatedCollaborators = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredCollaborators.slice(start, start + itemsPerPage);
  }, [filteredCollaborators, currentPage]);

  const filteredWarehouses = useMemo(() => {
    if (!selectedCountry) return warehouses;
    return warehouses.filter(w => w.country_id === selectedCountry);
  }, [warehouses, selectedCountry]);

  // =========================
  // Handlers
  // =========================
  const handleCountryChange = (countryId: string) => {
    setSelectedCountry(countryId);
    setSelectedWarehouse('');
  };

const handleCreate = async (data: CollaboratorFormData) => {
  if (!orgId || !user?.id) return;

  try {
    await collaboratorsService.createCollaborator(orgId, user.id, data);
    await loadCollaborators();
    setIsModalOpen(false);
  } catch (err) {
    console.error('[Manpower] Error creating collaborator:', err);
    throw err;
  }
};


const handleEdit = async (data: CollaboratorFormData) => {
  if (!orgId || !user?.id || !editingCollaborator) return;

  try {
    await collaboratorsService.updateCollaborator(orgId, user.id, editingCollaborator.id, data);
    await loadCollaborators();
    setIsModalOpen(false);
    setEditingCollaborator(null);
  } catch (err) {
    console.error('[Manpower] Error updating collaborator:', err);
    throw err;
  }
};


const handleDelete = async (collaborator: Collaborator) => {
  if (!orgId) return;

  if (!confirm(`¿Está seguro de eliminar al colaborador "${collaborator.full_name}"?`)) return;

  try {
    await collaboratorsService.deleteCollaborator(orgId, collaborator.id);
    await loadCollaborators();
  } catch (err) {
    console.error('[Manpower] Error deleting collaborator:', err);
    alert('Error al eliminar el colaborador');
  }
};


  const openCreateModal = () => {
    setEditingCollaborator(null);
    setIsModalOpen(true);
  };

  const openEditModal = (collaborator: Collaborator) => {
    setEditingCollaborator(collaborator);
    setIsModalOpen(true);
  };

  // =========================
  // Guards
  // =========================
  if (permsLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (!canView && !canManage) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="ri-lock-line text-3xl text-red-600"></i>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Acceso Denegado</h2>
          <p className="text-gray-600">
            No tienes permisos para acceder al módulo de Manpower Forecasting.
          </p>
        </div>
      </div>
    );
  }

  // =========================
  // UI
  // =========================
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Manpower</h1>
              <p className="text-gray-600 mt-1">
                Gestión de colaboradores y asignación de almacenes
              </p>
            </div>
            <div className="flex items-center space-x-3">
              {(canView || canManage) && (
                <button
                  onClick={() => setIsControlModalOpen(true)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center space-x-2 whitespace-nowrap"
                >
                  <i className="ri-bar-chart-box-line text-lg"></i>
                  <span>Control</span>
                </button>
              )}
              {canManage && (
                <button
                  onClick={openCreateModal}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center space-x-2 whitespace-nowrap"
                >
                  <i className="ri-add-line text-lg"></i>
                  <span>Nuevo Colaborador</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Toggle Ver Todo */}
            <div className="flex items-center space-x-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={viewAll}
                  onChange={(e) => setViewAll(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
              </label>
              <span className="text-sm font-medium text-gray-700">Ver Todo</span>
            </div>

            {/* Filtro País */}
            <div>
              <select
                value={selectedCountry}
                onChange={(e) => handleCountryChange(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                disabled={viewAll}
              >
                <option value="">Todos los países</option>
                {countries.map(country => (
                  <option key={country.id} value={country.id}>
                    {country.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro Almacén */}
            <div>
              <select
                value={selectedWarehouse}
                onChange={(e) => setSelectedWarehouse(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                disabled={viewAll}
              >
                <option value="">Todos los almacenes</option>
                {filteredWarehouses.map(warehouse => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Búsqueda */}
            <div className="relative">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre, ficha o cédula..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              />
            </div>
          </div>

          {!viewAll && !selectedCountry && !selectedWarehouse && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-2">
              <i className="ri-information-line text-amber-600 text-lg mt-0.5"></i>
              <p className="text-sm text-amber-800">
                Active "Ver Todo" o seleccione al menos un país o almacén para ver los colaboradores.
              </p>
            </div>
          )}
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="ri-error-warning-line text-3xl text-red-600"></i>
              </div>
              <p className="text-red-600">{error}</p>
            </div>
          ) : filteredCollaborators.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="ri-user-line text-3xl text-gray-400"></i>
              </div>
              <p className="text-gray-600">No se encontraron colaboradores</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Nombre Completo
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Ficha
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Cédula
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        País
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Almacenes
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tipo de Trabajo
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Estado
                      </th>
                      {canManage && (
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Acciones
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paginatedCollaborators.map((collaborator) => (
                      <tr key={collaborator.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {collaborator.full_name}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-600">
                            {collaborator.ficha || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-600">
                            {collaborator.cedula || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-600">
                            {countryNameById.get(collaborator.country_id) || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {collaborator.warehouses && collaborator.warehouses.length > 0 ? (
                              collaborator.warehouses.map(warehouse => (
                                <span
                                  key={warehouse.id}
                                  className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-teal-100 text-teal-800"
                                >
                                  {warehouse.name}
                                </span>
                              ))
                            ) : (
                              <span className="text-sm text-gray-400">Sin almacenes</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-600">
                            {workTypeNameById.get(collaborator.work_type_id) || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              collaborator.is_active
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {collaborator.is_active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        {canManage && (
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                onClick={() => openEditModal(collaborator)}
                                className="w-8 h-8 flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Editar"
                              >
                                <i className="ri-edit-line text-lg"></i>
                              </button>
                              <button
                                onClick={() => handleDelete(collaborator)}
                                className="w-8 h-8 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Eliminar"
                              >
                                <i className="ri-delete-bin-line text-lg"></i>
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    Mostrando {(currentPage - 1) * itemsPerPage + 1} a{' '}
                    {Math.min(currentPage * itemsPerPage, filteredCollaborators.length)} de{' '}
                    {filteredCollaborators.length} colaboradores
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                    >
                      <i className="ri-arrow-left-s-line"></i>
                    </button>
                    <span className="text-sm text-gray-600">
                      Página {currentPage} de {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                    >
                      <i className="ri-arrow-right-s-line"></i>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal Colaborador */}
      <CollaboratorModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingCollaborator(null);
        }}
        onSave={editingCollaborator ? handleEdit : handleCreate}
        collaborator={editingCollaborator}
        countries={countries}
        workTypes={workTypes}
        warehouses={warehouses}
        canManage={canManage}
      />

      {/* Modal Control */}
      {orgId && (
        <ManpowerControlModal
          isOpen={isControlModalOpen}
          onClose={() => setIsControlModalOpen(false)}
          orgId={orgId}
        />
      )}
    </div>
  );
}
