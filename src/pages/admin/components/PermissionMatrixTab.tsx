import { useState, useEffect } from 'react';
import { adminService, type Role, type Permission, type RolePermission } from '../../../services/adminService';
import { useAuth } from '../../../contexts/AuthContext';

export default function PermissionMatrixTab() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [updating, setUpdating] = useState<string | null>(null);

  // Modal de error
  const [errorModal, setErrorModal] = useState<{
    isOpen: boolean;
    message: string;
  }>({
    isOpen: false,
    message: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [rolesData, permsData, rolePermsData] = await Promise.all([
        adminService.getRoles(),
        adminService.getPermissions(),
        adminService.getRolePermissions(),
      ]);
      setRoles(rolesData);
      setPermissions(permsData);
      setRolePermissions(rolePermsData);
    } catch (error) {
      console.error('Error al cargar datos:', error);
    } finally {
      setLoading(false);
    }
  };

  const hasPermission = (roleId: string, permissionId: string): boolean => {
    return rolePermissions.some(
      rp => rp.role_id === roleId && rp.permission_id === permissionId
    );
  };

  const togglePermission = async (roleId: string, permissionId: string) => {
    if (!user?.orgId) return;
    
    const key = `${roleId}:${permissionId}`;
    setUpdating(key);

    try {
      const hasIt = hasPermission(roleId, permissionId);
      if (hasIt) {
        await adminService.removePermissionFromRole(roleId, permissionId, user.orgId);
      } else {
        await adminService.addPermissionToRole(roleId, permissionId, user.orgId);
      }
      await loadData();
    } catch (error: any) {
      setErrorModal({
        isOpen: true,
        message: error.message || 'No se pudo actualizar el permiso'
      });
    } finally {
      setUpdating(null);
    }
  };

  const selectAllForRole = async (roleId: string, permissionIds: string[]) => {
    if (!user?.orgId) return;
    
    setUpdating(`role:${roleId}`);
    try {
      await adminService.bulkUpdateRolePermissions(roleId, permissionIds, user.orgId);
      await loadData();
    } catch (error: any) {
      setErrorModal({
        isOpen: true,
        message: error.message || 'No se pudo actualizar los permisos'
      });
    } finally {
      setUpdating(null);
    }
  };

  const selectAllForCategory = async (category: string) => {
    if (!user?.orgId) return;
    
    const categoryPerms = filteredPermissions.filter(p => p.category === category);
    const permIds = categoryPerms.map(p => p.id);

    setUpdating(`category:${category}`);
    try {
      for (const role of roles) {
        const currentPerms = rolePermissions
          .filter(rp => rp.role_id === role.id)
          .map(rp => rp.permission_id);
        
        const newPerms = [...new Set([...currentPerms, ...permIds])];
        await adminService.bulkUpdateRolePermissions(role.id, newPerms, user.orgId);
      }
      await loadData();
    } catch (error: any) {
      setErrorModal({
        isOpen: true,
        message: error.message || 'No se pudo actualizar los permisos'
      });
    } finally {
      setUpdating(null);
    }
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
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Matriz de Permisos</h2>
        <p className="text-sm text-gray-600">Asigna permisos a cada rol haciendo click en las casillas</p>
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
              placeholder="Buscar permisos..."
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

      {/* Matriz con CSS Grid */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          {/* Encabezados */}
          <div 
            className="grid bg-gray-50 border-b border-gray-200"
            style={{
              gridTemplateColumns: `400px repeat(${roles.length}, 160px)`
            }}
          >
            <div className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
              Permiso
            </div>
            {roles.map((role) => (
              <div key={role.id} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 last:border-r-0">
                <div className="flex flex-col items-center gap-1">
                  <span>{role.name}</span>
                  <button
                    onClick={() => {
                      const permsInView = filteredPermissions.map(p => p.id);
                      selectAllForRole(role.id, permsInView);
                    }}
                    disabled={updating === `role:${role.id}`}
                    className="text-xs text-teal-600 hover:text-teal-700 font-normal normal-case whitespace-nowrap disabled:opacity-50"
                  >
                    {updating === `role:${role.id}` ? 'Actualizando...' : 'Seleccionar todo'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Contenido */}
          <div>
            {Object.entries(groupedPermissions).map(([category, perms]) => (
              <div key={`category-${category}`}>
                {/* Fila de categoría */}
                <div 
                  className="grid bg-gray-50 border-b border-gray-200"
                  style={{
                    gridTemplateColumns: `400px repeat(${roles.length}, 160px)`
                  }}
                >
                  <div className="px-6 py-3 border-r border-gray-200">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-900">{category}</span>
                      <button
                        onClick={() => selectAllForCategory(category)}
                        disabled={updating === `category:${category}`}
                        className="text-xs text-teal-600 hover:text-teal-700 whitespace-nowrap disabled:opacity-50"
                      >
                        {updating === `category:${category}` ? 'Actualizando...' : 'Seleccionar categoría'}
                      </button>
                    </div>
                  </div>
                  {roles.map((role) => (
                    <div key={role.id} className="px-4 py-3 border-r border-gray-200 last:border-r-0"></div>
                  ))}
                </div>

                {/* Filas de permisos */}
                {perms.map((permission, index) => (
                  <div 
                    key={permission.id}
                    className={`grid border-b border-gray-200 hover:bg-gray-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                    style={{
                      gridTemplateColumns: `400px repeat(${roles.length}, 160px)`
                    }}
                  >
                    <div className="px-6 py-4 border-r border-gray-200">
                      <div>
                        <code className="text-xs font-mono text-gray-900">{permission.name}</code>
                        {permission.description && (
                          <p className="text-xs text-gray-500 mt-1">{permission.description}</p>
                        )}
                      </div>
                    </div>
                    {roles.map((role) => {
                      const key = `${role.id}:${permission.id}`;
                      const isChecked = hasPermission(role.id, permission.id);
                      const isUpdating = updating === key;

                      return (
                        <div key={role.id} className="px-4 py-4 flex items-center justify-center border-r border-gray-200 last:border-r-0">
                          <button
                            onClick={() => togglePermission(role.id, permission.id)}
                            disabled={isUpdating}
                            className="inline-flex items-center justify-center w-6 h-6 rounded transition-colors disabled:opacity-50"
                          >
                            {isUpdating ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-teal-600"></div>
                            ) : (
                              <div
                                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                                  isChecked
                                    ? 'bg-teal-600 border-teal-600'
                                    : 'border-gray-300 hover:border-teal-400'
                                }`}
                              >
                                {isChecked && (
                                  <i className="ri-check-line text-white text-sm"></i>
                                )}
                              </div>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {filteredPermissions.length === 0 && (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-lg mt-4">
          <i className="ri-search-line text-4xl text-gray-300 mb-2"></i>
          <p className="text-gray-500">No se encontraron permisos</p>
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
