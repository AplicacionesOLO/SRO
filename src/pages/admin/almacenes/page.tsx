import { useState, useEffect } from 'react';
import { usePermissions } from '../../../hooks/usePermissions';
import { warehousesService } from '../../../services/warehousesService';
import { clientsService } from '../../../services/clientsService';
import { Warehouse, WarehouseFormData } from '../../../types/warehouse';
import type { Client } from '../../../types/client';
import WarehouseModal from './components/WarehouseModal';
import CountriesModal from './components/CountriesModal';
import { ConfirmModal } from '../../../components/base/ConfirmModal';

import type { Country } from '../../../types/catalog';
import { countriesService } from '../../../services/countriesService';

export default function AlmacenesPage() {
  const { orgId, userId, can, loading: permissionsLoading } = usePermissions();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [filteredWarehouses, setFilteredWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Países
  const [countries, setCountries] = useState<Country[]>([]);
  const [selectedCountryId, setSelectedCountryId] = useState<string>('all');
  const [loadingCountries, setLoadingCountries] = useState(false);
  const [showCountriesModal, setShowCountriesModal] = useState(false);
  // Clientes
  const [clients, setClients] = useState<Client[]>([]);
  const [assignedClientIds, setAssignedClientIds] = useState<string[]>([]);
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);

  // Toast de éxito
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal de confirmación/error
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'success' | 'warning' | 'error' | 'info';
    title: string;
    message: string;
    showCancel?: boolean;
    onConfirm: () => void;
    onCancel?: () => void;
  }>({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // Estado para eliminación pendiente
  const [pendingDeleteWarehouse, setPendingDeleteWarehouse] = useState<Warehouse | null>(null);

  console.log('[AlmacenesPage] snapshot', {
    orgId,
    userId,
    canView: can('warehouses.view'),
    warehousesCount: warehouses.length,
  });

  const loadCountries = async () => {
    if (!orgId) return;
    try {
      setLoadingCountries(true);
      const data = await countriesService.getAll(orgId);
      setCountries(data || []);
    } catch (e) {
      console.error('[AlmacenesPage] loadCountries error', e);
      setCountries([]);
    } finally {
      setLoadingCountries(false);
    }
  };

  const loadClients = async () => {
    if (!orgId) return;
    try {
      console.log('[AlmacenesPage] 🔍 loadClients START', { orgId });
      const data = await clientsService.listClients(orgId);
      console.log('[AlmacenesPage] ✅ loadClients SUCCESS', { 
        count: data?.length || 0,
        clients: data?.map(c => ({ id: c.id, name: c.name, is_active: c.is_active }))
      });
      setClients(data || []);
    } catch (e) {
      console.error('[AlmacenesPage] ❌ loadClients error', e);
      setClients([]);
    }
  };

  const loadWarehouses = async () => {
    if (!orgId) return;

    try {
      setLoading(true);
      setLoadError(null);

      console.log('[AlmacenesPage] loadWarehouses request', { orgId });
      const data = await warehousesService.getWarehouses(orgId);

      console.log('[AlmacenesPage] loadWarehouses success', { count: data.length });
      setWarehouses(data);
    } catch (error) {
      console.error('[AlmacenesPage] loadWarehouses error', error);
      const message = error instanceof Error ? error.message : 'Error al cargar almacenes';
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!permissionsLoading && orgId) {
      console.log('[AlmacenesPage] 🚀 Initializing - loading data...', {
        orgId,
        userId,
        permissionsLoaded: !permissionsLoading
      });
      loadCountries();
      loadClients();
      loadWarehouses();
    }
  }, [permissionsLoading, orgId]);

  // Filtrar por búsqueda + país
  useEffect(() => {
    let result = [...warehouses];

    if (selectedCountryId !== 'all') {
      result = result.filter((w) => w.country_id === selectedCountryId);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (w) =>
          w.name.toLowerCase().includes(term) ||
          (w.location && w.location.toLowerCase().includes(term))
      );
    }

    setFilteredWarehouses(result);
  }, [searchTerm, warehouses, selectedCountryId]);

  const handleCreate = async () => {
    if (!can('warehouses.create')) {
      setConfirmModal({
        isOpen: true,
        type: 'error',
        title: 'Sin permisos',
        message: 'No tienes permisos para crear almacenes',
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false }))
      });
      return;
    }
    setEditingWarehouse(null);
    setAssignedClientIds([]);
    
    console.log('[AlmacenesPage] 🆕 handleCreate - Opening modal', {
      clientsCount: clients.length,
      activeClientsCount: clients.filter(c => c.is_active).length,
      canManageClients: can('admin.warehouses.update') || can('warehouses.update') || can('admin.warehouses.clients.manage')
    });
    
    setShowModal(true);
  };

  const handleEdit = async (warehouse: Warehouse) => {
    if (!can('warehouses.update')) {
      setConfirmModal({
        isOpen: true,
        type: 'error',
        title: 'Sin permisos',
        message: 'No tienes permisos para editar almacenes',
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false }))
      });
      return;
    }

    // Cargar clientes asignados
    try {
      console.log('[AlmacenesPage] 📝 handleEdit - Loading warehouse clients', { warehouseId: warehouse.id });
      const clientIds = await warehousesService.getWarehouseClients(orgId!, warehouse.id);
      console.log('[AlmacenesPage] ✅ Warehouse clients loaded', { count: clientIds.length, clientIds });
      setAssignedClientIds(clientIds);
    } catch (error) {
      console.error('[AlmacenesPage] ❌ loadWarehouseClients error', error);
      setAssignedClientIds([]);
    }

    setEditingWarehouse(warehouse);
    
    console.log('[AlmacenesPage] 📝 handleEdit - Opening modal', {
      warehouseName: warehouse.name,
      clientsCount: clients.length,
      assignedCount: assignedClientIds.length,
      canManageClients: can('admin.warehouses.update') || can('warehouses.update') || can('admin.warehouses.clients.manage')
    });
    
    setShowModal(true);
  };

  const handleSave = async (formData: WarehouseFormData, clientIds: string[]) => {
    if (!orgId) throw new Error('No hay organización seleccionada');

    console.log('[AlmacenesPage] 💾 handleSave', {
      mode: editingWarehouse ? 'update' : 'create',
      payload: formData,
      clientIds,
    });

    try {
      let warehouseId: string;

      if (editingWarehouse) {
        await warehousesService.updateWarehouse(editingWarehouse.id, orgId, formData);
        warehouseId = editingWarehouse.id;
        setSuccessMessage('Almacén actualizado correctamente');
      } else {
        const newWarehouse = await warehousesService.createWarehouse(orgId, formData);
        warehouseId = newWarehouse.id;
        setSuccessMessage('Almacén creado correctamente');
      }

      // Guardar asignación de clientes (si tiene permiso)
      // Fallback: usar warehouses.update o admin.warehouses.clients.manage si admin.warehouses.update no existe
      const canManageClients = can('admin.warehouses.update') || can('warehouses.update') || can('admin.warehouses.clients.manage');
      console.log('[AlmacenesPage] 💾 Saving client assignments', { 
        canManageClients, 
        clientIdsCount: clientIds.length,
        permissions: {
          'admin.warehouses.update': can('admin.warehouses.update'),
          'warehouses.update': can('warehouses.update'),
          'admin.warehouses.clients.manage': can('admin.warehouses.clients.manage')
        }
      });
      
      if (canManageClients) {
        await warehousesService.setWarehouseClients(orgId, warehouseId, clientIds);
        console.log('[AlmacenesPage] ✅ Client assignments saved');
      } else {
        console.warn('[AlmacenesPage] ⚠️ User cannot manage clients - skipping assignment');
      }

      setShowModal(false);
      setEditingWarehouse(null);
      setAssignedClientIds([]);
      await loadWarehouses();

      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('[AlmacenesPage] handleSave error', error);
      throw error;
    }
  };

  const handleDelete = async (warehouse: Warehouse) => {
    if (!can('warehouses.delete')) {
      setConfirmModal({
        isOpen: true,
        type: 'error',
        title: 'Sin permisos',
        message: 'No tienes permisos para eliminar almacenes',
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false }))
      });
      return;
    }

    // Mostrar modal de confirmación
    setPendingDeleteWarehouse(warehouse);
    setConfirmModal({
      isOpen: true,
      type: 'warning',
      title: 'Confirmar eliminación',
      message: `¿Estás seguro de eliminar el almacén "${warehouse.name}"? Esta acción no se puede deshacer.`,
      showCancel: true,
      onConfirm: () => confirmDeleteWarehouse(warehouse),
      onCancel: () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setPendingDeleteWarehouse(null);
      }
    });
  };

  const confirmDeleteWarehouse = async (warehouse: Warehouse) => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
    
    try {
      console.log('[AlmacenesPage] delete request', { id: warehouse.id });
      await warehousesService.deleteWarehouse(warehouse.id, orgId!);
      setSuccessMessage('Almacén eliminado correctamente');
      await loadWarehouses();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('[AlmacenesPage] delete error', error);
      const message = error instanceof Error ? error.message : 'Error al eliminar el almacén';
      setConfirmModal({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: message,
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false }))
      });
    } finally {
      setPendingDeleteWarehouse(null);
    }
  };

  const getCountryName = (countryId: string | null | undefined) => {
    if (!countryId) return '—';
    return countries.find((c) => c.id === countryId)?.name || '—';
  };

  if (permissionsLoading || !orgId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
          <p className="text-gray-600">
            {permissionsLoading ? 'Cargando permisos...' : 'Verificando organización...'}
          </p>
        </div>
      </div>
    );
  }

  if (!can('warehouses.view')) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <i className="ri-lock-line text-6xl text-red-500 mb-4"></i>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Acceso Denegado</h2>
          <p className="text-gray-600 mb-6">No tienes permisos para ver los almacenes.</p>
          <button
            onClick={() => window.history.back()}
            className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  // Fallback: usar warehouses.update o admin.warehouses.clients.manage si admin.warehouses.update no existe
  const canManageClients = can('admin.warehouses.update') || can('warehouses.update') || can('admin.warehouses.clients.manage');
  
  console.log('[AlmacenesPage] 🔐 Permissions check', {
    'admin.warehouses.update': can('admin.warehouses.update'),
    'warehouses.update': can('warehouses.update'),
    'admin.warehouses.clients.manage': can('admin.warehouses.clients.manage'),
    'canManageClients (final)': canManageClients,
    'clients.length': clients.length,
    'activeClients': clients.filter(c => c.is_active).length
  });

  return (
    <div className="p-6">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowCountriesModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
        >
          <i className="ri-flag-line"></i>
          Países
        </button>

        {can('warehouses.create') && (
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-add-line"></i>
            Nuevo Almacén
          </button>
        )}
      </div>


      {successMessage && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-3">
            <i className="ri-checkbox-circle-line text-green-600 text-xl"></i>
            <p className="text-sm text-green-800">{successMessage}</p>
          </div>
        </div>
      )}

      {loadError && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start gap-3">
            <i className="ri-error-warning-line text-yellow-600 text-xl mt-0.5"></i>
            <div className="flex-1">
              <h3 className="font-semibold text-yellow-900 mb-1">Error al cargar almacenes</h3>
              <p className="text-sm text-yellow-800">{loadError}</p>
              <button
                onClick={loadWarehouses}
                className="mt-3 text-sm text-yellow-700 hover:text-yellow-900 font-medium underline"
              >
                Reintentar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="mb-6 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="relative max-w-md w-full">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre o ubicación..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">País:</span>
          <select
            value={selectedCountryId}
            onChange={(e) => setSelectedCountryId(e.target.value)}
            disabled={loadingCountries}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          >
            <option value="all">{loadingCountries ? 'Cargando...' : 'Todos'}</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Lista */}
      <div className="grid gap-4">
        {filteredWarehouses.map((warehouse) => (
          <div
            key={warehouse.id}
            className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">{warehouse.name}</h3>

                <div className="text-xs text-gray-500 mb-2">
                  <i className="ri-flag-line mr-1 w-3 h-3 inline-flex items-center justify-center"></i>
                  {getCountryName(warehouse.country_id)}
                </div>

                {warehouse.location && (
                  <p className="text-sm text-gray-600 mb-1">
                    <i className="ri-map-pin-line mr-1 w-4 h-4 inline-flex items-center justify-center"></i>
                    {warehouse.location}
                  </p>
                )}

                {warehouse.business_start_time && warehouse.business_end_time && (
                  <p className="text-xs text-gray-500">
                    <i className="ri-time-line mr-1 w-3 h-3 inline-flex items-center justify-center"></i>
                    Horario: {warehouse.business_start_time.substring(0, 5)} - {warehouse.business_end_time.substring(0, 5)} | Intervalo:{' '}
                    {warehouse.slot_interval_minutes || 60} min
                  </p>
                )}

                <p className="text-xs text-gray-400 mt-2">
                  Creado: {new Date(warehouse.created_at).toLocaleDateString('es-ES')}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {can('warehouses.update') && (
                  <button
                    onClick={() => handleEdit(warehouse)}
                    className="p-2 text-gray-600 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                    title="Editar"
                  >
                    <i className="ri-edit-line text-lg w-5 h-5 flex items-center justify-center"></i>
                  </button>
                )}
                {can('warehouses.delete') && (
                  <button
                    onClick={() => handleDelete(warehouse)}
                    className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Eliminar"
                  >
                    <i className="ri-delete-bin-line text-lg w-5 h-5 flex items-center justify-center"></i>
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {!loading && filteredWarehouses.length === 0 && (
          <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
            <i className="ri-inbox-line text-5xl text-gray-400 mb-3"></i>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No hay almacenes</h3>
            <p className="text-gray-600">Probá cambiando el país o la búsqueda.</p>
          </div>
        )}
      </div>

      {!loading && warehouses.length > 0 && (
        <div className="mt-4 text-sm text-gray-600">
          Mostrando {filteredWarehouses.length} de {warehouses.length} almacenes
        </div>
      )}

      {showCountriesModal && (
        <CountriesModal
          isOpen={showCountriesModal}
          orgId={orgId}
          onClose={() => setShowCountriesModal(false)}
          onChanged={(list) => {
            setCountries(list);
            if (selectedCountryId !== 'all' && !list.some((c) => c.id === selectedCountryId)) {
              setSelectedCountryId('all');
            }
          }}
        />
      )}

      {showModal && (
        <WarehouseModal
          orgId={orgId}
          warehouse={editingWarehouse}
          countries={countries}
          clients={clients}
          assignedClientIds={assignedClientIds}
          canManageClients={canManageClients}
          onClose={() => {
            setShowModal(false);
            setEditingWarehouse(null);
            setAssignedClientIds([]);
          }}
          onSave={handleSave}
        />
      )}

      {/* Modal de confirmación */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        type={confirmModal.type}
        title={confirmModal.title}
        message={confirmModal.message}
        showCancel={confirmModal.showCancel}
        onConfirm={confirmModal.onConfirm}
        onCancel={confirmModal.onCancel}
      />
    </div>
  );
}
