import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../lib/supabase';
import DockModal from './components/DockModal';
import { sortDocksByNameNumber } from '../../utils/sortDocks';

interface DockCategory {
  id: string;
  name: string;
  code: string;
  color: string;
}

interface DockStatus {
  id: string;
  name: string;
  code: string;
  color: string;
  is_blocking: boolean;
}

interface Warehouse {
  id: string;
  name: string;
  location: string | null;
}

interface Dock {
  id: string;
  name: string;
  category_id: string;
  status_id: string;
  warehouse_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category: DockCategory;
  status: DockStatus;
  warehouse: Warehouse | null;
}

export default function AndenesPage() {
  const { user, permissionsLoading } = useAuth();
  const { orgId, can, loading } = usePermissions();
  
  const [docks, setDocks] = useState<Dock[]>([]);
  const [categories, setCategories] = useState<DockCategory[]>([]);
  const [statuses, setStatuses] = useState<DockStatus[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [showOnlyActive, setShowOnlyActive] = useState(true);
  
  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDock, setEditingDock] = useState<Dock | null>(null);

  // Modal de error de permisos
  const [permissionErrorModal, setPermissionErrorModal] = useState<{
    isOpen: boolean;
    message: string;
  }>({
    isOpen: false,
    message: ''
  });

  // ✅ TODOS LOS HOOKS PRIMERO (antes de cualquier return)
  useEffect(() => {
    if (orgId) {
      loadData();
    }
  }, [orgId]);

  // ✅ Funciones auxiliares
  const loadData = async () => {
    try {
      setLoadingData(true);

      // Cargar andenes con categorías, estados y almacenes
      const { data: docksData, error: docksError } = await supabase
        .from('docks')
        .select(`
          id,
          name,
          category_id,
          status_id,
          warehouse_id,
          is_active,
          created_at,
          updated_at,
          category:dock_categories(id, name, code, color),
          status:dock_statuses(id, name, code, color, is_blocking),
          warehouse:warehouses(id, name, location)
        `)
        .eq('org_id', orgId)
        .order('name');

      if (docksError) throw docksError;

      // Cargar categorías
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('dock_categories')
        .select('id, name, code, color')
        .eq('org_id', orgId)
        .order('name');

      if (categoriesError) throw categoriesError;

      // Cargar estados
      const { data: statusesData, error: statusesError } = await supabase
        .from('dock_statuses')
        .select('id, name, code, color, is_blocking')
        .eq('org_id', orgId)
        .order('name');

      if (statusesError) throw statusesError;

      // Cargar almacenes
      const { data: warehousesData, error: warehousesError } = await supabase
        .from('warehouses')
        .select('id, name, location')
        .eq('org_id', orgId)
        .order('name');

      if (warehousesError) throw warehousesError;

      // ✅ Ordenar andenes por número natural
      const sortedDocks = [...(docksData ?? [])].sort(sortDocksByNameNumber);
      setDocks(sortedDocks);
      setCategories(categoriesData || []);
      setStatuses(statusesData || []);
      setWarehouses(warehousesData || []);
    } catch (error) {
      console.error('[Docks] loadError', error);
    } finally {
      setLoadingData(false);
    }
  };

  const handleCreate = () => {
    if (!can('docks.create')) {
      setPermissionErrorModal({
        isOpen: true,
        message: 'No tienes permisos para crear andenes'
      });
      return;
    }
    setEditingDock(null);
    setIsModalOpen(true);
  };

  const handleEdit = (dock: Dock) => {
    if (!can('docks.update')) {
      setPermissionErrorModal({
        isOpen: true,
        message: 'No tienes permisos para editar andenes'
      });
      return;
    }
    setEditingDock(dock);
    setIsModalOpen(true);
  };

  const handleToggleActive = async (dock: Dock) => {
    if (!can('docks.update')) {
      setPermissionErrorModal({
        isOpen: true,
        message: 'No tienes permisos para modificar andenes'
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('docks')
        .update({ 
          is_active: !dock.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', dock.id);

      if (error) throw error;

      await loadData();
    } catch (error) {
      console.error('[Docks] saveError', error);
      setPermissionErrorModal({
        isOpen: true,
        message: 'Error al actualizar el andén'
      });
    }
  };

  const handleSave = async () => {
    await loadData();
    setIsModalOpen(false);
    setEditingDock(null);
  };

  // Filtrar andenes
  const filteredDocks = docks.filter(dock => {
    if (showOnlyActive && !dock.is_active) return false;
    if (searchTerm && !dock.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (selectedCategory !== 'all' && dock.category_id !== selectedCategory) return false;
    if (selectedStatus !== 'all' && dock.status_id !== selectedStatus) return false;
    if (selectedWarehouse !== 'all') {
      if (selectedWarehouse === 'sin-asignar') {
        if (dock.warehouse_id !== null) return false;
      } else {
        if (dock.warehouse_id !== selectedWarehouse) return false;
      }
    }
    return true;
  });

  // ✅ GUARDS DESPUÉS DE TODOS LOS HOOKS
  // ✅ Guard 1: Verificar permisos mientras cargan
  if (permissionsLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-[calc(100vh-80px)]">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mb-4"></div>
            <p className="text-gray-600">Verificando permisos...</p>
          </div>
        </div>
      </div>
    );
  }

  // ✅ Guard 2: Verificar orgId
  if (!orgId) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-[calc(100vh-80px)]">
          <div className="text-center">
            <i className="ri-lock-line text-6xl text-red-500 mb-4"></i>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Acceso Denegado</h2>
            <p className="text-gray-600 mb-6">No tienes una organización asignada.</p>
            <button
              onClick={() => window.history.back()}
              className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
            >
              Volver
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ✅ Guard 3: Verificar permiso docks.view
  if (!can('docks.view')) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-[calc(100vh-80px)]">
          <div className="text-center">
            <i className="ri-lock-line text-6xl text-red-500 mb-4"></i>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Acceso Denegado</h2>
            <p className="text-gray-600 mb-6">No tienes permisos para ver los andenes.</p>
            <button
              onClick={() => window.history.back()}
              className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
            >
              Volver
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ✅ RENDER PRINCIPAL
  return (
    <div className="min-h-screen bg-gray-50">
      
      <div className="px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Gestión de Andenes</h1>
            <p className="text-gray-600">Administra los andenes de tu organización</p>
          </div>
          {can('docks.create') && (
            <button
              onClick={handleCreate}
              className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-add-line text-lg w-5 h-5 flex items-center justify-center"></i>
              Nuevo Andén
            </button>
          )}
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* Búsqueda */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Buscar
              </label>
              <div className="relative">
                <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg w-5 h-5 flex items-center justify-center"></i>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por nombre..."
                  className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Categoría */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Categoría
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              >
                <option value="all">Todas las categorías</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            {/* Estado */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Estado
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              >
                <option value="all">Todos los estados</option>
                {statuses.map(status => (
                  <option key={status.id} value={status.id}>{status.name}</option>
                ))}
              </select>
            </div>

            {/* Almacén */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Almacén
              </label>
              <select
                value={selectedWarehouse}
                onChange={(e) => setSelectedWarehouse(e.target.value)}
                className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              >
                <option value="all">Todos los almacenes</option>
                <option value="sin-asignar">Sin asignar</option>
                {warehouses.map(warehouse => (
                  <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                ))}
              </select>
            </div>

            {/* Solo activos */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filtro
              </label>
              <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={showOnlyActive}
                  onChange={(e) => setShowOnlyActive(e.target.checked)}
                  className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700">Solo activos</span>
              </label>
            </div>
          </div>
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {loadingData ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mb-3"></div>
                <p className="text-sm text-gray-600">Cargando andenes...</p>
              </div>
            </div>
          ) : filteredDocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <i className="ri-inbox-line text-5xl text-gray-300 mb-3"></i>
              <p className="text-gray-600 mb-1">No se encontraron andenes</p>
              <p className="text-sm text-gray-500">Intenta ajustar los filtros o crea un nuevo andén</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nombre
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Almacén
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Categoría
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Activo
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredDocks.map(dock => (
                    <tr key={dock.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{dock.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {dock.warehouse ? (
                          <div className="text-sm text-gray-900">{dock.warehouse.name}</div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Sin asignar</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: `${dock.category.color}20`,
                            color: dock.category.color
                          }}
                        >
                          {dock.category.name}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: `${dock.status.color}20`,
                            color: dock.status.color
                          }}
                        >
                          {dock.status.name}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {dock.is_active ? (
                          <i className="ri-checkbox-circle-fill text-green-500 text-xl w-5 h-5 flex items-center justify-center mx-auto"></i>
                        ) : (
                          <i className="ri-close-circle-fill text-red-500 text-xl w-5 h-5 flex items-center justify-center mx-auto"></i>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          {can('docks.update') && (
                            <>
                              <button
                                onClick={() => handleEdit(dock)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Editar"
                              >
                                <i className="ri-edit-line text-lg w-5 h-5 flex items-center justify-center"></i>
                              </button>
                              <button
                                onClick={() => handleToggleActive(dock)}
                                className={`p-2 rounded-lg transition-colors ${
                                  dock.is_active
                                    ? 'text-red-600 hover:bg-red-50'
                                    : 'text-green-600 hover:bg-green-50'
                                }`}
                                title={dock.is_active ? 'Desactivar' : 'Activar'}
                              >
                                <i className={`${dock.is_active ? 'ri-close-circle-line' : 'ri-checkbox-circle-line'} text-lg w-5 h-5 flex items-center justify-center`}></i>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Resumen */}
        <div className="mt-4 text-sm text-gray-600">
          Mostrando {filteredDocks.length} de {docks.length} andenes
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <DockModal
          dock={editingDock}
          categories={categories}
          statuses={statuses}
          orgId={orgId}
          onClose={() => {
            setIsModalOpen(false);
            setEditingDock(null);
          }}
          onSave={handleSave}
        />
      )}

      {/* Modal de error de permisos */}
      {permissionErrorModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full">
                <i className="ri-lock-line text-2xl text-red-600 w-6 h-6 flex items-center justify-center"></i>
              </div>
              
              <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
                Sin Permisos
              </h3>
              
              <p className="text-sm text-gray-600 text-center mb-6">
                {permissionErrorModal.message}
              </p>

              <button
                onClick={() => setPermissionErrorModal({ isOpen: false, message: '' })}
                className="w-full px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
