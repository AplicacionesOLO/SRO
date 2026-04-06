import { useState, useEffect } from 'react';
import { usePermissions } from '../../../../hooks/usePermissions';
import { providersService } from '../../../../services/providersService';
import type { Provider } from '../../../../types/catalog';
import ProviderModal from './ProviderModal';

interface ProvidersTabProps {
  orgId: string;
  warehouseId: string | null;
}

export default function ProvidersTab({ orgId, warehouseId }: ProvidersTabProps) {
  const { can } = usePermissions();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOnlyActive, setShowOnlyActive] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | undefined>();
  const [error, setError] = useState<string | undefined>();

  const canRead = can('providers.view');
  const canCreate = can('providers.create');
  const canUpdate = can('providers.update');
  const canDelete = can('providers.delete');

  useEffect(() => {
    if (canRead) loadProviders();
    else setLoading(false);
  }, [orgId, warehouseId, showOnlyActive, canRead]);

  const loadProviders = async () => {
    try {
      setLoading(true);
      setError(undefined);
      // Si hay almacén activo → filtrar por almacén; si no → mostrar todos (acceso global)
      const data = await providersService.getByWarehouse(orgId, warehouseId, showOnlyActive);
      setProviders(data);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar proveedores');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => { setEditingProvider(undefined); setIsModalOpen(true); };
  const handleEdit = (provider: Provider) => { setEditingProvider(provider); setIsModalOpen(true); };

  const handleDelete = async (provider: Provider) => {
    if (!confirm(`¿Desactivar el proveedor "${provider.name}"?`)) return;
    try {
      await providersService.deleteProvider(provider.id);
      await loadProviders();
    } catch (err: any) {
      setError(err?.message || 'Error al eliminar');
    }
  };

  const handleSave = async () => { await loadProviders(); setIsModalOpen(false); };

  const filteredProviders = providers.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

  if (!canRead) return (
    <div className="text-center py-12">
      <i className="ri-lock-line text-6xl text-red-500 mb-4"></i>
      <p className="text-gray-600">No tienes permisos para ver proveedores</p>
    </div>
  );

  if (loading) return (
    <div className="text-center py-12">
      <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mb-4"></div>
      <p className="text-gray-600">Cargando proveedores...</p>
    </div>
  );

  return (
    <div>
      {/* Aviso si no hay almacén seleccionado */}
      {!warehouseId && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
          <i className="ri-information-line text-amber-500 w-5 h-5 flex items-center justify-center"></i>
          <p className="text-sm text-amber-700">Mostrando proveedores de todos los almacenes. Selecciona un almacén para filtrar.</p>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="relative">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 flex items-center justify-center"></i>
            <input
              type="text"
              placeholder="Buscar proveedores..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={showOnlyActive} onChange={(e) => setShowOnlyActive(e.target.checked)} className="rounded border-gray-300" />
            Solo activos
          </label>
        </div>
        {canCreate && (
          <button onClick={handleCreate} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer">
            <i className="ri-add-line w-5 h-5 flex items-center justify-center"></i>
            Nuevo Proveedor
          </button>
        )}
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {filteredProviders.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <i className="ri-inbox-line text-6xl text-gray-400 mb-4"></i>
          <p className="text-gray-600">
            {warehouseId ? 'No hay proveedores asignados a este almacén' : 'No hay proveedores registrados'}
          </p>
          {warehouseId && canCreate && (
            <p className="text-sm text-gray-500 mt-2">Crea un proveedor y asígnalo a este almacén</p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Nombre</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Estado</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Creado</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredProviders.map((provider) => (
                <tr key={provider.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-900">{provider.name}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${provider.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {provider.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">{new Date(provider.created_at).toLocaleDateString('es-ES')}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {canUpdate && (
                        <button onClick={() => handleEdit(provider)} className="p-2 text-gray-600 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors cursor-pointer" title="Editar">
                          <i className="ri-edit-line w-5 h-5 flex items-center justify-center"></i>
                        </button>
                      )}
                      {canDelete && provider.active && (
                        <button onClick={() => handleDelete(provider)} className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer" title="Desactivar">
                          <i className="ri-delete-bin-line w-5 h-5 flex items-center justify-center"></i>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <ProviderModal
          orgId={orgId}
          warehouseId={warehouseId}
          provider={editingProvider || null}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
