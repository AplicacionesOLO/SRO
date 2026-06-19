import { useState, useEffect, useCallback } from 'react';
import { usePermissions } from '../../../../hooks/usePermissions';
import { useDebouncedValue } from '../../../../hooks/useDebouncedValue';
import { origenProveedoresService } from '../../../../services/origenProveedoresService';
import { clientsService } from '../../../../services/clientsService';
import type { OrigenProveedor } from '../../../../types/origenProveedor';
import { mockOrigenProveedores, mockClientsForOrigen } from '../../../../mocks/origenProveedores';
import OrigenProveedorModal from './OrigenProveedorModal';

interface OrigenProveedoresTabProps {
  orgId: string;
}

export default function OrigenProveedoresTab({ orgId }: OrigenProveedoresTabProps) {
  const { hasRole } = usePermissions();
  const [origenes, setOrigenes] = useState<OrigenProveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, 300);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrigen, setEditingOrigen] = useState<OrigenProveedor | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [clientsMap, setClientsMap] = useState<Record<string, string>>({});
  const [dataSource, setDataSource] = useState<'db' | 'mock'>('mock');

  const isFullAccess = hasRole('ADMIN') || hasRole('Full Access');

  const loadOrigenes = useCallback(async () => {
    try {
      setLoading(true);
      setError(undefined);
      const data = await origenProveedoresService.list(orgId);
      setOrigenes(data);
      setDataSource('db');
    } catch {
      setOrigenes(mockOrigenProveedores);
      setDataSource('mock');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadOrigenes();
    clientsService.listClients(orgId)
      .then(data => {
        const map: Record<string, string> = {};
        data.forEach(c => { map[c.id] = c.name; });
        setClientsMap(map);
      })
      .catch(() => {
        const map: Record<string, string> = {};
        mockClientsForOrigen.forEach(c => { map[c.id] = c.name; });
        setClientsMap(map);
      });
  }, [loadOrigenes, orgId]);

  const filtered = origenes.filter(o => {
    if (!debouncedSearch.trim()) return true;
    const term = debouncedSearch.toLowerCase();
    return (
      o.source_code.toLowerCase().includes(term) ||
      (o.description && o.description.toLowerCase().includes(term)) ||
      (o.client_id && clientsMap[o.client_id]?.toLowerCase().includes(term))
    );
  });

  const handleCreate = () => {
    setEditingOrigen(null);
    setIsModalOpen(true);
  };

  const handleEdit = (origen: OrigenProveedor) => {
    setEditingOrigen(origen);
    setIsModalOpen(true);
  };

  const handleToggleActive = async (origen: OrigenProveedor) => {
    const newActive = !origen.is_active;
    const action = newActive ? 'activar' : 'desactivar';
    if (!confirm(`¿${action.charAt(0).toUpperCase() + action.slice(1)} el origen "${origen.source_code}"?`)) return;

    if (dataSource === 'mock') {
      setOrigenes(prev => prev.map(o =>
        o.id === origen.id ? { ...o, is_active: newActive } : o
      ));
      return;
    }
    try {
      await origenProveedoresService.toggleActive(origen.id, newActive);
      setOrigenes(prev => prev.map(o =>
        o.id === origen.id ? { ...o, is_active: newActive } : o
      ));
    } catch (err: any) {
      setError(err?.message || `Error al ${action}`);
    }
  };

  const handleSave = (savedOrigen: OrigenProveedor) => {
    setIsModalOpen(false);
    setEditingOrigen(null);

    // Si es mock mode (o creación local por error de conexión),
    // actualizamos el estado local directamente
    if (dataSource === 'mock' || savedOrigen.id.startsWith('local-')) {
      setOrigenes(prev => {
        const exists = prev.findIndex(o => o.id === savedOrigen.id);
        if (exists >= 0) {
          // Update
          return prev.map(o => o.id === savedOrigen.id ? savedOrigen : o);
        }
        // Insert
        return [...prev, savedOrigen];
      });
      return;
    }

    // DB mode: recargar desde el backend
    loadOrigenes();
  };

  if (!isFullAccess) {
    return (
      <div className="text-center py-12">
        <i className="ri-lock-line text-6xl text-red-500 mb-4"></i>
        <p className="text-gray-600">Solo usuarios con acceso completo pueden gestionar orígenes de proveedores</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 flex items-center justify-center"></i>
            <input
              type="text"
              placeholder="Buscar orígenes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
            />
          </div>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer text-sm"
        >
          <i className="ri-add-line w-4 h-4 flex items-center justify-center"></i>
          Nuevo origen
        </button>
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">
          {filtered.length} origen{filtered.length !== 1 ? 'es' : ''}
          {dataSource === 'mock' && (
            <span className="text-amber-500 ml-2 text-xs">(datos demo)</span>
          )}
          {debouncedSearch && <span className="text-gray-400 ml-1">· "{debouncedSearch}"</span>}
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mb-4"></div>
          <p className="text-gray-600">Cargando orígenes...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <i className="ri-inbox-line text-6xl text-gray-400 mb-4"></i>
          <p className="text-gray-600">
            {debouncedSearch ? `No hay orígenes que coincidan con "${debouncedSearch}"` : 'No hay orígenes registrados'}
          </p>
          {!debouncedSearch && (
            <p className="text-sm text-gray-500 mt-2">Creá un origen para empezar</p>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Código</th>
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Cliente</th>
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Descripción</th>
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Estado</th>
                  <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((origen) => {
                  const clientName = origen.client_id ? (clientsMap[origen.client_id] || origen.client_id) : null;
                  return (
                    <tr key={origen.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-2.5 px-3 text-sm text-gray-900 font-mono font-semibold whitespace-nowrap">
                        {origen.source_code.toUpperCase()}
                      </td>
                      <td className="py-2.5 px-3 text-sm whitespace-nowrap">
                        {clientName ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200">
                            {clientName}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">Sin cliente</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-sm text-gray-600 max-w-[320px] truncate" title={origen.description || ''}>
                        {origen.description || <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${origen.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                          {origen.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleEdit(origen)}
                            className="p-1.5 text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded-md transition-colors cursor-pointer"
                            title="Editar"
                          >
                            <i className="ri-edit-line w-4 h-4 flex items-center justify-center"></i>
                          </button>
                          {origen.is_active ? (
                            <button
                              onClick={() => handleToggleActive(origen)}
                              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                              title="Desactivar"
                            >
                              <i className="ri-toggle-line w-4 h-4 flex items-center justify-center"></i>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleToggleActive(origen)}
                              className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors cursor-pointer"
                              title="Activar"
                            >
                              <i className="ri-toggle-fill text-gray-300 w-4 h-4 flex items-center justify-center"></i>
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
        </div>
      )}

      {isModalOpen && (
        <OrigenProveedorModal
          orgId={orgId}
          origen={editingOrigen}
          onClose={() => { setIsModalOpen(false); setEditingOrigen(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}