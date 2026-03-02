import { useState, useEffect } from 'react';
import { adminService, type Permission } from '../../../services/adminService';

export default function PermissionsTab() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingPermission, setEditingPermission] = useState<Permission | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', category: '' });

  // Modal de confirmación de eliminación
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    permissionId: string | null;
    permissionName: string;
  }>({
    isOpen: false,
    permissionId: null,
    permissionName: ''
  });

  // Modal de error
  const [errorModal, setErrorModal] = useState<{
    isOpen: boolean;
    message: string;
  }>({
    isOpen: false,
    message: ''
  });

  useEffect(() => {
    loadPermissions();
  }, []);

  const loadPermissions = async () => {
    try {
      setLoading(true);
      const data = await adminService.getPermissions();
      setPermissions(data);
    } catch (error) {
      console.error('Error al cargar permisos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPermission) {
        await adminService.updatePermission(editingPermission.id, formData);
      } else {
        await adminService.createPermission(formData);
      }
      await loadPermissions();
      setShowModal(false);
      setEditingPermission(null);
      setFormData({ name: '', description: '', category: '' });
    } catch (error: any) {
      setErrorModal({
        isOpen: true,
        message: error.message || 'No se pudo guardar el permiso'
      });
    }
  };

  const handleEdit = (permission: Permission) => {
    setEditingPermission(permission);
    setFormData({ 
      name: permission.name, 
      description: permission.description || '', 
      category: permission.category || '' 
    });
    setShowModal(true);
  };

  const handleDelete = (permission: Permission) => {
    setDeleteModal({
      isOpen: true,
      permissionId: permission.id,
      permissionName: permission.name
    });
  };

  const confirmDelete = async () => {
    if (!deleteModal.permissionId) return;

    try {
      await adminService.deletePermission(deleteModal.permissionId);
      await loadPermissions();
      setDeleteModal({ isOpen: false, permissionId: null, permissionName: '' });
    } catch (error: any) {
      setDeleteModal({ isOpen: false, permissionId: null, permissionName: '' });
      setErrorModal({
        isOpen: true,
        message: error.message || 'No se pudo eliminar el permiso'
      });
    }
  };

  const cancelDelete = () => {
    setDeleteModal({ isOpen: false, permissionId: null, permissionName: '' });
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingPermission(null);
    setFormData({ name: '', description: '', category: '' });
  };

  const categories = ['all', ...new Set(permissions.map(p => p.category).filter(Boolean))];

  const filteredPermissions = permissions.filter(permission => {
    const matchesSearch = 
      permission.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (permission.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    
    const matchesCategory = selectedCategory === 'all' || permission.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const groupedPermissions = filteredPermissions.reduce((acc, permission) => {
    const category = permission.category || 'Sin categoría';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(permission);
    return acc;
  }, {} as Record<string, Permission[]>);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Catálogo de Permisos</h2>
          <p className="text-sm text-gray-600">Gestiona todos los permisos del sistema</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
        >
          <i className="ri-add-line text-lg w-5 h-5 flex items-center justify-center"></i>
          Nuevo Permiso
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1">
          <div className="relative">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre o descripción..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
        </div>

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
        >
          <option value="all">Todas las categorías</option>
          {categories.filter(c => c !== 'all').map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      {/* Lista de permisos agrupados */}
      <div className="space-y-6">
        {Object.entries(groupedPermissions).map(([category, perms]) => (
          <div key={category} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">{category}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{perms.length} permisos</p>
            </div>
            <div className="divide-y divide-gray-200">
              {perms.map((permission) => (
                <div key={permission.id} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono text-teal-600 bg-teal-50 px-2 py-1 rounded">
                          {permission.name}
                        </code>
                      </div>
                      {permission.description && (
                        <p className="text-sm text-gray-600 mt-2">{permission.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => handleEdit(permission)}
                        className="text-teal-600 hover:text-teal-700"
                        title="Editar"
                      >
                        <i className="ri-edit-line text-lg"></i>
                      </button>
                      <button
                        onClick={() => handleDelete(permission)}
                        className="text-gray-400 hover:text-red-600"
                        title="Eliminar"
                      >
                        <i className="ri-delete-bin-line text-lg"></i>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {filteredPermissions.length === 0 && (
        <div className="text-center py-12">
          <i className="ri-search-line text-4xl text-gray-300 mb-2"></i>
          <p className="text-gray-500">No se encontraron permisos</p>
        </div>
      )}

      {/* Modal de formulario */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingPermission ? 'Editar Permiso' : 'Nuevo Permiso'}
              </h3>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre del Permiso *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  required
                  placeholder="Ej: reservations.create"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Categoría
                </label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="Ej: Reservas"
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descripción
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  rows={3}
                  placeholder="Descripción del permiso"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
                >
                  {editingPermission ? 'Guardar Cambios' : 'Crear Permiso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de confirmación de eliminación */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full">
                <i className="ri-alert-line text-2xl text-red-600 w-6 h-6 flex items-center justify-center"></i>
              </div>
              
              <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
                Confirmar Eliminación
              </h3>
              
              <p className="text-sm text-gray-600 text-center mb-6">
                ¿Estás seguro de que deseas eliminar el permiso <strong>{deleteModal.permissionName}</strong>?
                <br />
                Esta acción no se puede deshacer y puede afectar a los roles que lo usan.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={cancelDelete}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de error */}
      {errorModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full">
                <i className="ri-error-warning-line text-2xl text-red-600 w-6 h-6 flex items-center justify-center"></i>
              </div>
              
              <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
                Error
              </h3>
              
              <p className="text-sm text-gray-600 text-center mb-6">
                {errorModal.message}
              </p>

              <button
                onClick={() => setErrorModal({ isOpen: false, message: '' })}
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
