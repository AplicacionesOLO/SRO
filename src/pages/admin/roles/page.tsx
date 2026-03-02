import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { usePermissions } from '../../../hooks/usePermissions';
import { ConfirmModal } from '../../../components/base/ConfirmModal';

interface Role {
  id: string;
  name: string;
  description: string;
  created_at: string;
  user_count?: number;
}

interface Permission {
  id: string;
  name: string;
  description: string;
  category: string;
}

interface RolePermission {
  permission_id: string;
}

// Popup state interface
interface PopupState {
  isOpen: boolean;
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message: string;
}

export default function RolesPage() {
  const { can, loading: permissionsLoading, orgId } = usePermissions();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  
  // Popup state
  const [popup, setPopup] = useState<PopupState>({
    isOpen: false,
    type: 'success',
    title: '',
    message: ''
  });

  const showPopup = (type: PopupState['type'], title: string, message: string) => {
    setPopup({ isOpen: true, type, title, message });
  };

  const closePopup = () => {
    setPopup(prev => ({ ...prev, isOpen: false }));
  };

  // ✅ CORRECCIÓN PROBLEMA 1: Usar formato correcto con puntos (admin.roles.xxx)
  const canCreate = can('admin.roles.create');
  const canEdit = can('admin.roles.update');
  const canDelete = can('admin.roles.delete');

  console.log('[RolesPage] Permisos evaluados', {
    canCreate,
    canEdit,
    canDelete,
    orgId,
    permissionsLoading
  });

  useEffect(() => {
    if (!permissionsLoading && orgId) {
      loadRoles();
      loadPermissions();
    }
  }, [permissionsLoading, orgId]);

  // ✅ Guard: Si está cargando permisos o no hay orgId, mostrar loading
  if (permissionsLoading || !orgId) {
    console.log('[RolesPage] Guard triggered', { permissionsLoading, orgId });
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

  const loadRoles = async () => {
    try {
      setLoading(true);
      
      // ✅ CORRECCIÓN PROBLEMA 2: Query correcta con count hint
      // Paso 1: Obtener todos los roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('roles')
        .select('*')
        .order('name');

      if (rolesError) throw rolesError;

      console.log('[RolesPage] Roles cargados', { count: rolesData?.length || 0 });

      // Paso 2: Contar usuarios por rol con filtro de organización
      const { data: countsData, error: countsError } = await supabase
        .from('user_org_roles')
        .select('role_id, org_id')
        .eq('org_id', orgId);

      if (countsError) {
        console.error('[RolesPage] Error al contar usuarios:', countsError);
      }

      console.log('[RolesPage] Conteos obtenidos', { 
        totalRecords: countsData?.length || 0,
        orgId 
      });

      // Paso 3: Agrupar conteos por role_id
      const countsByRole = (countsData || []).reduce((acc, record) => {
        acc[record.role_id] = (acc[record.role_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      console.log('[RolesPage] Conteos agrupados', countsByRole);

      // Paso 4: Combinar roles con sus conteos
      const formattedRoles = (rolesData || []).map((role) => ({
        ...role,
        user_count: countsByRole[role.id] || 0
      }));

      console.log('[RolesPage] Roles formateados', {
        total: formattedRoles.length,
        sample: formattedRoles.slice(0, 3).map(r => ({ name: r.name, count: r.user_count }))
      });

      setRoles(formattedRoles);
    } catch (error) {
      console.error('[RolesPage] Error loading roles:', error);
      setRoles([]); // ✅ Fallback a array vacío
    } finally {
      setLoading(false);
    }
  };

  const loadPermissions = async () => {
    try {
      const { data, error } = await supabase
        .from('permissions')
        .select('*')
        .order('category')
        .order('name');

      if (error) throw error;
      setPermissions(data || []);
    } catch (error) {
      console.error('[RolesPage] Error loading permissions:', error);
      setPermissions([]); // ✅ Fallback a array vacío
    }
  };

  const loadRolePermissions = async (roleId: string) => {
    try {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('permission_id')
        .eq('role_id', roleId);

      if (error) throw error;
      setSelectedPermissions(data?.map((rp: RolePermission) => rp.permission_id) || []);
    } catch (error) {
      console.error('[RolesPage] Error loading role permissions:', error);
      setSelectedPermissions([]); // ✅ Fallback a array vacío
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingRole) {
        const { error } = await supabase
          .from('roles')
          .update({
            name: formData.name,
            description: formData.description
          })
          .eq('id', editingRole.id);

        if (error) throw error;
        showPopup('success', 'Rol actualizado', `El rol "${formData.name}" se ha actualizado correctamente.`);
      } else {
        const { error } = await supabase
          .from('roles')
          .insert({
            name: formData.name,
            description: formData.description
          });

        if (error) throw error;
        showPopup('success', 'Rol creado', `El rol "${formData.name}" se ha creado correctamente.`);
      }

      setShowModal(false);
      setEditingRole(null);
      setFormData({ name: '', description: '' });
      loadRoles();
    } catch (error: any) {
      console.error('[RolesPage] Error saving role:', error);
      showPopup('error', 'Error al guardar', error.message || 'No se pudo guardar el rol. Intenta nuevamente.');
    }
  };

  const handleEdit = (role: Role) => {
    setEditingRole(role);
    setFormData({
      name: role.name,
      description: role.description
    });
    setShowModal(true);
  };

  const confirmDelete = (role: Role) => {
    setRoleToDelete(role);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!roleToDelete) return;

    try {
      const { error } = await supabase
        .from('roles')
        .delete()
        .eq('id', roleToDelete.id);

      if (error) throw error;
      
      const roleName = roleToDelete.name;
      setShowDeleteModal(false);
      setRoleToDelete(null);
      loadRoles();
      showPopup('success', 'Rol eliminado', `El rol "${roleName}" se ha eliminado correctamente.`);
    } catch (error: any) {
      console.error('[RolesPage] Error deleting role:', error);
      setShowDeleteModal(false);
      setRoleToDelete(null);
      showPopup('error', 'Error al eliminar', error.message || 'No se pudo eliminar el rol. Puede que tenga usuarios asignados.');
    }
  };

  const handleManagePermissions = async (role: Role) => {
    setSelectedRole(role);
    await loadRolePermissions(role.id);
    setShowPermissionsModal(true);
  };

  const handlePermissionToggle = (permissionId: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permissionId)
        ? prev.filter((id) => id !== permissionId)
        : [...prev, permissionId]
    );
  };

  const handleSavePermissions = async () => {
    if (!selectedRole) return;

    try {
      // Eliminar permisos existentes
      await supabase
        .from('role_permissions')
        .delete()
        .eq('role_id', selectedRole.id);

      // Insertar nuevos permisos
      if (selectedPermissions.length > 0) {
        const { error } = await supabase
          .from('role_permissions')
          .insert(
            selectedPermissions.map((permissionId) => ({
              role_id: selectedRole.id,
              permission_id: permissionId
            }))
          );

        if (error) throw error;
      }

      const roleName = selectedRole.name;
      setShowPermissionsModal(false);
      setSelectedRole(null);
      setSelectedPermissions([]);
      showPopup('success', 'Permisos guardados', `Los permisos del rol "${roleName}" se han actualizado correctamente.`);
    } catch (error: any) {
      console.error('[RolesPage] Error saving permissions:', error);
      showPopup('error', 'Error al guardar permisos', error.message || 'No se pudieron guardar los permisos. Intenta nuevamente.');
    }
  };

  // ✅ Fallback arrays seguros
  const safePermissions = permissions ?? [];
  const safeRoles = roles ?? [];

  const groupedPermissions = safePermissions.reduce((acc, perm) => {
    const category = perm.category || 'Sin categoría';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Roles</h1>
          <p className="text-sm text-gray-600 mt-1">Administra los roles y sus permisos</p>
        </div>
        {canCreate && (
          <button
            onClick={() => {
              setEditingRole(null);
              setFormData({ name: '', description: '' });
              setShowModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-add-line"></i>
            Nuevo Rol
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-6 py-3 font-semibold text-gray-700">Rol</th>
                <th className="text-left px-6 py-3 font-semibold text-gray-700">Descripción</th>
                <th className="text-center px-6 py-3 font-semibold text-gray-700">Usuarios</th>
                <th className="text-left px-6 py-3 font-semibold text-gray-700">Creado</th>
                <th className="text-right px-6 py-3 font-semibold text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {safeRoles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 flex items-center justify-center rounded-full bg-gray-100 mb-3">
                        <i className="ri-shield-user-line text-2xl text-gray-400"></i>
                      </div>
                      <p className="text-gray-500">No hay roles registrados</p>
                    </div>
                  </td>
                </tr>
              ) : (
                safeRoles.map((role) => (
                  <tr key={role.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
                          <i className="ri-shield-user-line text-teal-600"></i>
                        </div>
                        <span className="font-semibold text-gray-900">{role.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-gray-600 line-clamp-1 max-w-xs">{role.description || '—'}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">
                        <i className="ri-user-line text-xs"></i>
                        {role.user_count}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {formatDate(role.created_at)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && (
                          <button
                            onClick={() => handleManagePermissions(role)}
                            className="w-8 h-8 flex items-center justify-center text-teal-600 hover:bg-teal-50 rounded-lg transition-colors cursor-pointer"
                            title="Gestionar Permisos"
                          >
                            <i className="ri-key-line"></i>
                          </button>
                        )}
                        {canEdit && (
                          <button
                            onClick={() => handleEdit(role)}
                            className="w-8 h-8 flex items-center justify-center text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                            title="Editar"
                          >
                            <i className="ri-edit-line"></i>
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => confirmDelete(role)}
                            className="w-8 h-8 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Eliminar"
                          >
                            <i className="ri-delete-bin-line"></i>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Crear/Editar Rol */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">
                {editingRole ? 'Editar Rol' : 'Nuevo Rol'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre del Rol
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descripción
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  rows={3}
                  required
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
                >
                  {editingRole ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Gestionar Permisos */}
      {showPermissionsModal && selectedRole && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Permisos de {selectedRole.name}</h2>
                <p className="text-sm text-gray-600 mt-1">Selecciona los permisos para este rol</p>
              </div>
              <button
                onClick={() => setShowPermissionsModal(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-6">
                {Object.entries(groupedPermissions).map(([category, perms]) => (
                  <div key={category} className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 mb-3 capitalize">{category}</h3>
                    <div className="space-y-2">
                      {perms.map((perm) => (
                        <label
                          key={perm.id}
                          className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedPermissions.includes(perm.id)}
                            onChange={() => handlePermissionToggle(perm.id)}
                            className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{perm.name}</div>
                            {perm.description && (
                              <div className="text-sm text-gray-600">{perm.description}</div>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t border-gray-200">
              <button
                onClick={() => setShowPermissionsModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                Cancelar
              </button>
              <button
                onClick={handleSavePermissions}
                className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
              >
                Guardar Permisos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmar Eliminación */}
      {showDeleteModal && roleToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <i className="ri-alert-line text-red-600 text-2xl"></i>
              </div>
              <h3 className="text-lg font-bold text-gray-900 text-center mb-2">
                ¿Eliminar rol?
              </h3>
              <p className="text-gray-600 text-center mb-6">
                ¿Estás seguro de eliminar el rol <strong>{roleToDelete.name}</strong>? Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setRoleToDelete(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Popup de notificaciones */}
      <ConfirmModal
        isOpen={popup.isOpen}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onConfirm={closePopup}
        confirmText="Aceptar"
      />
    </div>
  );
}
