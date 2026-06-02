import { useState, useEffect, useCallback } from 'react';
import { usePermissions } from '../../../../hooks/usePermissions';
import { useDebouncedValue } from '../../../../hooks/useDebouncedValue';
import { providersService } from '../../../../services/providersService';
import { clientsService } from '../../../../services/clientsService';
import type { Provider } from '../../../../types/catalog';
import { Pagination } from '../../../../components/base/Pagination';
import ProviderModal from './ProviderModal';
import ProviderBulkImportModal from './ProviderBulkImportModal';
import ProviderSyncModal from './ProviderSyncModal';
import ProviderExcelSyncModal from './ProviderExcelSyncModal';

interface ProvidersTabProps {
  orgId: string;
  warehouseId: string | null;
}

const PAGE_SIZE = 25;

export default function ProvidersTab({ orgId, warehouseId }: ProvidersTabProps) {
  const { can } = usePermissions();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOnlyActive, setShowOnlyActive] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, 350);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  const [isExcelSyncOpen, setIsExcelSyncOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [assignments, setAssignments] = useState<Record<string, string>>();
  const [clientsMap, setClientsMap] = useState<Record<string, string>>();

  const canRead = can('providers.view');
  const canCreate = can('providers.create');
  const canUpdate = can('providers.update');
  const canDelete = can('providers.delete');

  const loadProviders = useCallback(async (page: number, search?: string) => {
    if (!canRead) { setLoading(false); return; }
    try {
      setLoading(true);
      setError(undefined);
      const { data, total, totalPages: pages } = showOnlyActive
        ? await providersService.getActivePaginated(orgId, page, PAGE_SIZE, search)
        : await providersService.getAllPaginated(orgId, page, PAGE_SIZE, search);
      setProviders(data);
      setTotalPages(pages);
      setTotalItems(total);
      if (data.length > 0) {
        try {
          const asgn = await providersService.getProviderAssignmentsOptimized(orgId, data);
          setAssignments(asgn);
        } catch {
          setAssignments({});
        }
      } else {
        setAssignments({});
      }
    } catch (err: any) {
      const raw = err?.message ?? '';
      const isFetchError = raw.toLowerCase().includes('failed to fetch') || raw.toLowerCase().includes('networkerror');
      setError(isFetchError
        ? 'Error de conexión. Reintentando...'
        : raw || 'Error al cargar proveedores');
    } finally {
      setLoading(false);
    }
  }, [orgId, showOnlyActive, canRead]);

  // Cargar datos cuando cambian org, filtro, página, o búsqueda debounced
  useEffect(() => {
    if (canRead) {
      loadProviders(currentPage, debouncedSearch);
    } else setLoading(false);
  }, [orgId, currentPage, showOnlyActive, canRead, loadProviders, debouncedSearch]);

  // Cargar clientes una sola vez
  useEffect(() => {
    if (canRead) {
      clientsService.listClients(orgId)
        .then(data => {
          const map: Record<string, string> = {};
          data.forEach(c => { map[c.id] = c.name; });
          setClientsMap(map);
        })
        .catch(() => setClientsMap({}));
    }
  }, [orgId, canRead]);

  // Reset a página 1 cuando cambia la búsqueda
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, showOnlyActive]);

  const handleCreate = () => { setEditingProvider(undefined); setIsModalOpen(true); };
  const handleEdit = (provider: Provider) => { setEditingProvider(provider); setIsModalOpen(true); };

  const handleDelete = async (provider: Provider) => {
    if (!confirm(`¿Desactivar el proveedor "${provider.name}"?`)) return;
    try {
      await providersService.deleteProvider(provider.id);
      await loadProviders(currentPage, debouncedSearch);
    } catch (err: any) {
      setError(err?.message || 'Error al eliminar');
    }
  };

  const handleSave = async () => { await loadProviders(currentPage, debouncedSearch); setIsModalOpen(false); };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  if (!canRead) return (
    <div className="text-center py-12">
      <i className="ri-lock-line text-6xl text-red-500 mb-4"></i>
      <p className="text-gray-600">No tienes permisos para ver proveedores</p>
    </div>
  );

  return (
    <div>
      {/* Header toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 flex items-center justify-center"></i>
            <input
              type="text"
              placeholder="Buscar proveedores..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer whitespace-nowrap">
            <input type="checkbox" checked={showOnlyActive} onChange={(e) => { setShowOnlyActive(e.target.checked); setCurrentPage(1); }} className="rounded border-gray-300" />
            Solo activos
          </label>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setIsExcelSyncOpen(true)}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer text-sm"
            >
              <i className="ri-file-excel-2-line w-4 h-4 flex items-center justify-center"></i>
              Excel
            </button>
            <button
              onClick={() => setIsSyncOpen(true)}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer text-sm"
            >
              <i className="ri-refresh-line w-4 h-4 flex items-center justify-center"></i>
              API
            </button>
            <button
              onClick={() => setIsBulkImportOpen(true)}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer text-sm"
            >
              <i className="ri-upload-cloud-line w-4 h-4 flex items-center justify-center"></i>
              Masiva
            </button>
            <button onClick={handleCreate} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer text-sm">
              <i className="ri-add-line w-4 h-4 flex items-center justify-center"></i>
              Nuevo
            </button>
          </div>
        )}
      </div>

      {/* Total count */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">
          {totalItems} proveedores en total
          {debouncedSearch && <span className="text-gray-400 ml-1">(filtrado por "{debouncedSearch}")</span>}
        </p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mb-4"></div>
          <p className="text-gray-600">Cargando proveedores...</p>
        </div>
      ) : providers.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <i className="ri-inbox-line text-6xl text-gray-400 mb-4"></i>
          <p className="text-gray-600">
            {debouncedSearch ? `No hay proveedores que coincidan con "${debouncedSearch}"` : 'No hay proveedores registrados'}
          </p>
          {!debouncedSearch && canCreate && (
            <p className="text-sm text-gray-500 mt-2">Crea un proveedor para empezar</p>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Origen</th>
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Código</th>
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Cliente</th>
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Nombre</th>
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Asignado</th>
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Estado</th>
                  <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((provider) => {
                  const assignmentText = assignments[provider.id];
                  const isUnassigned = !assignmentText || assignmentText === 'Sin asignación';
                  const autoClient = isUnassigned && provider.source
                    ? providersService.resolveClientBySource(provider.source)
                    : null;
                  return (
                  <tr key={provider.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-2.5 px-3 text-sm text-gray-600 whitespace-nowrap">
                      {provider.source ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                          {provider.source.toUpperCase()}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-sm text-gray-700 font-mono whitespace-nowrap">
                      {provider.provider_code ? provider.provider_code.toUpperCase() : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-sm whitespace-nowrap">
                      {provider.client_id && clientsMap[provider.client_id] ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200">
                          {clientsMap[provider.client_id]}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-sm text-gray-900 font-medium whitespace-nowrap max-w-[200px] truncate" title={provider.name.toUpperCase()}>
                      {provider.name.toUpperCase()}
                    </td>
                    <td className="py-2.5 px-3 text-sm max-w-[180px]">
                      {assignmentText === undefined ? (
                        <span className="text-gray-300 text-xs">—</span>
                      ) : isUnassigned ? (
                        autoClient ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200 whitespace-nowrap">
                            <i className="ri-magic-line w-3 h-3 flex items-center justify-center"></i>
                            {autoClient.name}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs italic">Sin asignación</span>
                        )
                      ) : (
                        <span className="text-gray-600 text-xs leading-snug block truncate" title={assignmentText}>
                          {assignmentText}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${provider.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {provider.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canUpdate && (
                          <button onClick={() => handleEdit(provider)} className="p-1.5 text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded-md transition-colors cursor-pointer" title="Editar">
                            <i className="ri-edit-line w-4 h-4 flex items-center justify-center"></i>
                          </button>
                        )}
                        {canDelete && provider.active && (
                          <button onClick={() => handleDelete(provider)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer" title="Desactivar">
                            <i className="ri-delete-bin-line w-4 h-4 flex items-center justify-center"></i>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={PAGE_SIZE}
            totalItems={totalItems}
            onPageChange={handlePageChange}
            pageSizeOptions={[25, 50, 100]}
          />
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

      {isBulkImportOpen && (
        <ProviderBulkImportModal
          orgId={orgId}
          onClose={() => setIsBulkImportOpen(false)}
          onImportDone={() => loadProviders(1, debouncedSearch)}
        />
      )}
      {isSyncOpen && (
        <ProviderSyncModal
          orgId={orgId}
          onClose={() => setIsSyncOpen(false)}
          onSyncDone={() => loadProviders(1, debouncedSearch)}
        />
      )}
      {isExcelSyncOpen && (
        <ProviderExcelSyncModal
          onClose={() => { setIsExcelSyncOpen(false); loadProviders(1, debouncedSearch); }}
          onDone={() => {}}
        />
      )}
    </div>
  );
}