import { useState, useEffect } from 'react';
import { usePermissions } from '../../../hooks/usePermissions';
import { clientsService } from '../../../services/clientsService';
import { providersService } from '../../../services/providersService';
import type { Client, ClientFormData, ClientRules, ClientRulesFormData, ClientProviderPayload } from '../../../types/client';
import type { Dock } from '../../../types/dock';
import type { Provider } from '../../../types/catalog';
import ClientModal from './components/ClientModal';
import ClientDetailDrawer from './components/ClientDetailDrawer';
import { ConfirmModal } from '../../../components/base/ConfirmModal';

export default function ClientesPage() {
  const { orgId, can, loading: permissionsLoading } = usePermissions();

  const [clients, setClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Drawer de detalle
  const [showDrawer, setShowDrawer] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedClientRules, setSelectedClientRules] = useState<ClientRules | null>(null);
  const [allDocks, setAllDocks] = useState<Dock[]>([]);
  const [selectedClientDockIds, setSelectedClientDockIds] = useState<string[]>([]);
  const [allProviders, setAllProviders] = useState<Provider[]>([]);
  const [selectedClientProviders, setSelectedClientProviders] = useState<{ provider_id: string; is_default: boolean }[]>([]);

  // Modal de confirmación
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

  console.log('[ClientesPage] snapshot', {
    orgId,
    canView: can('admin.clients.view'),
    clientsCount: clients.length
  });

  const loadClients = async () => {
    if (!orgId) return;

    try {
      setLoading(true);
      setLoadError(null);

      console.log('[ClientesPage] loadClients request', { orgId });
      const data = await clientsService.listClients(orgId, searchTerm);

      console.log('[ClientesPage] loadClients success', { count: data.length });
      setClients(data);
    } catch (error) {
      console.error('[ClientesPage] loadClients error', error);
      const message = error instanceof Error ? error.message : 'Error al cargar clientes';
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!permissionsLoading && orgId) {
      console.log('[ClientesPage] loading clients...');
      loadClients();
    }
  }, [permissionsLoading, orgId]);

  // Filtrar por búsqueda
  useEffect(() => {
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      setFilteredClients(
        clients.filter(
          (c) =>
            c.name.toLowerCase().includes(term) ||
            (c.legal_id && c.legal_id.toLowerCase().includes(term)) ||
            (c.email && c.email.toLowerCase().includes(term))
        )
      );
    } else {
      setFilteredClients(clients);
    }
  }, [searchTerm, clients]);

  const handleCreate = () => {
    if (!can('admin.clients.create')) {
      setConfirmModal({
        isOpen: true,
        type: 'error',
        title: 'Sin permisos',
        message: 'No tienes permisos para crear clientes',
        onConfirm: () => setConfirmModal((prev) => ({ ...prev, isOpen: false }))
      });
      return;
    }
    setEditingClient(null);
    setShowModal(true);
  };

  const handleEdit = (client: Client) => {
    if (!can('admin.clients.update')) {
      setConfirmModal({
        isOpen: true,
        type: 'error',
        title: 'Sin permisos',
        message: 'No tienes permisos para editar clientes',
        onConfirm: () => setConfirmModal((prev) => ({ ...prev, isOpen: false }))
      });
      return;
    }
    setEditingClient(client);
    setShowModal(true);
  };

  const handleSave = async (formData: ClientFormData) => {
    if (!orgId) throw new Error('No hay organización seleccionada');

    console.log('[ClientesPage] handleSave', {
      mode: editingClient ? 'update' : 'create',
      payload: formData
    });

    try {
      if (editingClient) {
        await clientsService.updateClient(orgId, editingClient.id, formData);
        setSuccessMessage('Cliente actualizado correctamente');
      } else {
        await clientsService.createClient(orgId, formData);
        setSuccessMessage('Cliente creado correctamente');
      }

      setShowModal(false);
      setEditingClient(null);
      await loadClients();

      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('[ClientesPage] handleSave error', error);
      throw error;
    }
  };

  const handleDisable = async (client: Client) => {
    if (!can('admin.clients.delete')) {
      setConfirmModal({
        isOpen: true,
        type: 'error',
        title: 'Sin permisos',
        message: 'No tienes permisos para desactivar clientes',
        onConfirm: () => setConfirmModal((prev) => ({ ...prev, isOpen: false }))
      });
      return;
    }

    setConfirmModal({
      isOpen: true,
      type: 'warning',
      title: 'Confirmar desactivación',
      message: `¿Estás seguro de desactivar el cliente "${client.name}"?`,
      showCancel: true,
      onConfirm: () => confirmDisableClient(client),
      onCancel: () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      }
    });
  };

  const confirmDisableClient = async (client: Client) => {
    setConfirmModal((prev) => ({ ...prev, isOpen: false }));

    try {
      console.log('[ClientesPage] disable request', { id: client.id });
      await clientsService.disableClient(orgId!, client.id);
      setSuccessMessage('Cliente desactivado correctamente');
      await loadClients();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('[ClientesPage] disable error', error);
      const message = error instanceof Error ? error.message : 'Error al desactivar el cliente';
      setConfirmModal({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: message,
        onConfirm: () => setConfirmModal((prev) => ({ ...prev, isOpen: false }))
      });
    }
  };

  const handleViewDetail = async (client: Client) => {
    if (!can('admin.clients.view')) return;

    try {
      console.log('[ClientesPage] loading client detail', { clientId: client.id });

      // Cargar reglas
      const rules = await clientsService.getClientRules(orgId!, client.id);
      setSelectedClientRules(rules);

      // Cargar andenes disponibles
      const docks = await clientsService.listDocks(orgId!);
      setAllDocks(docks);

      // Cargar andenes del cliente
      const clientDockIds = await clientsService.getClientDocks(orgId!, client.id);
      setSelectedClientDockIds(clientDockIds);

      // Cargar proveedores disponibles (solo activos)
      const providers = await providersService.getActive(orgId!);
      setAllProviders(providers);

      // Cargar proveedores del cliente
      const clientProviders = await clientsService.getClientProviders(orgId!, client.id);
      setSelectedClientProviders(clientProviders);

      setSelectedClient(client);
      setShowDrawer(true);
    } catch (error) {
      console.error('[ClientesPage] load detail error', error);
      setConfirmModal({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: 'Error al cargar los detalles del cliente',
        onConfirm: () => setConfirmModal((prev) => ({ ...prev, isOpen: false }))
      });
    }
  };

  const handleUpdateClientFromDrawer = async (data: {
    name: string;
    legal_id?: string;
    email?: string;
    phone?: string;
    address?: string;
    notes?: string;
    is_active: boolean;
  }) => {
    if (!orgId || !selectedClient) return;

    await clientsService.updateClient(orgId, selectedClient.id, {
      ...data,
      is_active: data.is_active
    });

    setSuccessMessage('Cliente actualizado correctamente');
    setTimeout(() => setSuccessMessage(null), 3000);

    // Recargar lista y actualizar cliente seleccionado
    await loadClients();
    const updated = await clientsService.getClient(orgId, selectedClient.id);
    setSelectedClient(updated);
  };

  const handleUpdateRules = async (data: ClientRulesFormData) => {
    if (!orgId || !selectedClient) return;

    const updated = await clientsService.updateClientRules(orgId, selectedClient.id, data);
    setSelectedClientRules(updated);

    setSuccessMessage('Reglas actualizadas correctamente');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleUpdateDocks = async (dockIds: string[]) => {
    if (!orgId || !selectedClient) return;

    await clientsService.setClientDocks(orgId, selectedClient.id, dockIds);
    setSelectedClientDockIds(dockIds);

    setSuccessMessage('Andenes actualizados correctamente');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleUpdateProviders = async (providers: ClientProviderPayload[]) => {
    if (!orgId || !selectedClient) return;

    await clientsService.setClientProviders(orgId, selectedClient.id, providers);
    
    // Recargar proveedores del cliente
    const updatedProviders = await clientsService.getClientProviders(orgId, selectedClient.id);
    setSelectedClientProviders(updatedProviders);

    setSuccessMessage('Proveedores actualizados correctamente');
    setTimeout(() => setSuccessMessage(null), 3000);
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

  if (!can('admin.clients.view')) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <i className="ri-lock-line text-6xl text-red-500 mb-4"></i>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Acceso Denegado</h2>
          <p className="text-gray-600 mb-6">No tienes permisos para ver los clientes.</p>
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

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Clientes</h1>
          <p className="text-sm text-gray-600">Gestiona los clientes y sus permisos de andenes</p>
        </div>

        {can('admin.clients.create') && (
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-add-line"></i>
            Nuevo Cliente
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
              <h3 className="font-semibold text-yellow-900 mb-1">Error al cargar clientes</h3>
              <p className="text-sm text-yellow-800">{loadError}</p>
              <button
                onClick={loadClients}
                className="mt-3 text-sm text-yellow-700 hover:text-yellow-900 font-medium underline"
              >
                Reintentar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Búsqueda */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre, RUT o email..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Lista de clientes */}
      <div className="grid gap-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Cargando clientes...</p>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
            <i className="ri-inbox-line text-5xl text-gray-400 mb-3"></i>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No hay clientes</h3>
            <p className="text-gray-600">
              {searchTerm ? 'Intenta con otra búsqueda.' : 'Crea tu primer cliente para comenzar.'}
            </p>
          </div>
        ) : (
          filteredClients.map((client) => (
            <div
              key={client.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-semibold text-gray-900">{client.name}</h3>
                    {client.is_active ? (
                      <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                        Activo
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                        Inactivo
                      </span>
                    )}
                  </div>

                  {client.legal_id && (
                    <p className="text-sm text-gray-600 mb-1">
                      <i className="ri-file-text-line mr-1 w-4 h-4 inline-flex items-center justify-center"></i>
                      {client.legal_id}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                    {client.email && (
                      <span>
                        <i className="ri-mail-line mr-1 w-3 h-3 inline-flex items-center justify-center"></i>
                        {client.email}
                      </span>
                    )}
                    {client.phone && (
                      <span>
                        <i className="ri-phone-line mr-1 w-3 h-3 inline-flex items-center justify-center"></i>
                        {client.phone}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-400 mt-2">
                    Creado: {new Date(client.created_at).toLocaleDateString('es-ES')}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleViewDetail(client)}
                    className="p-2 text-gray-600 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                    title="Ver detalles"
                  >
                    <i className="ri-eye-line text-lg w-5 h-5 flex items-center justify-center"></i>
                  </button>
                  {can('admin.clients.update') && (
                    <button
                      onClick={() => handleEdit(client)}
                      className="p-2 text-gray-600 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <i className="ri-edit-line text-lg w-5 h-5 flex items-center justify-center"></i>
                    </button>
                  )}
                  {can('admin.clients.delete') && client.is_active && (
                    <button
                      onClick={() => handleDisable(client)}
                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Desactivar"
                    >
                      <i className="ri-close-circle-line text-lg w-5 h-5 flex items-center justify-center"></i>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {!loading && clients.length > 0 && (
        <div className="mt-4 text-sm text-gray-600">
          Mostrando {filteredClients.length} de {clients.length} clientes
        </div>
      )}

      {/* Modal de creación/edición */}
      {showModal && (
        <ClientModal
          isOpen={showModal}
          client={editingClient}
          onClose={() => {
            setShowModal(false);
            setEditingClient(null);
          }}
          onSave={handleSave}
        />
      )}

      {/* Drawer de detalle */}
      {showDrawer && selectedClient && (
        <ClientDetailDrawer
          isOpen={showDrawer}
          client={selectedClient}
          rules={selectedClientRules}
          docks={allDocks}
          clientDockIds={selectedClientDockIds}
          providers={allProviders}
          clientProviders={selectedClientProviders}
          canUpdate={can('admin.clients.update')}
          canAssignDocks={can('admin.clients.assign_docks')}
          canUpdateRules={can('admin.clients.rules.update')}
          canViewProviders={can('admin.clients.providers.view')}
          canManageProviders={can('admin.clients.providers.manage')}
          onClose={() => {
            setShowDrawer(false);
            setSelectedClient(null);
            setSelectedClientRules(null);
            setAllDocks([]);
            setSelectedClientDockIds([]);
            setAllProviders([]);
            setSelectedClientProviders([]);
          }}
          onUpdateClient={handleUpdateClientFromDrawer}
          onUpdateRules={handleUpdateRules}
          onUpdateDocks={handleUpdateDocks}
          onUpdateProviders={handleUpdateProviders}
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
