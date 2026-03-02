import { useState, useEffect } from 'react';
import { adminService, type UserOrgRole, type Role } from '../../../services/adminService';
import { useAuth } from '../../../contexts/AuthContext';

export default function UsersTab() {
  const { user } = useAuth();
  const [userOrgRoles, setUserOrgRoles] = useState<UserOrgRole[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  
  // Modal de agregar usuario
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string | null; email: string | null }>>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);

  // Modal de confirmación de eliminación
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    userId: string | null;
    userName: string;
  }>({
    isOpen: false,
    userId: null,
    userName: ''
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
    loadData();
  }, [user?.orgId]);

  const loadData = async () => {
    if (!user?.orgId) return;

    try {
      setLoading(true);
      const [usersData, rolesData] = await Promise.all([
        adminService.getUserOrgRoles(user.orgId),
        adminService.getRoles(),
      ]);
      setUserOrgRoles(usersData);
      setRoles(rolesData);
      if (rolesData.length > 0 && !selectedRoleId) {
        setSelectedRoleId(rolesData[0].id);
      }
    } catch (error) {
      console.error('Error al cargar datos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRoleId: string) => {
    if (!user?.orgId) return;

    setUpdating(userId);
    try {
      await adminService.updateUserRole(userId, user.orgId, newRoleId);
      await loadData();
    } catch (error: any) {
      setErrorModal({
        isOpen: true,
        message: error.message || 'No se pudo actualizar el rol'
      });
    } finally {
      setUpdating(null);
    }
  };

  const handleSearchUsers = async () => {
    if (!searchEmail.trim()) return;

    setSearching(true);
    try {
      const results = await adminService.searchUsersByEmail(searchEmail);
      setSearchResults(results);
    } catch (error: any) {
      setErrorModal({
        isOpen: true,
        message: error.message || 'Error al buscar usuarios'
      });
    } finally {
      setSearching(false);
    }
  };

  const handleAddUser = async () => {
    if (!user?.orgId || !selectedUserId || !selectedRoleId) return;

    setAdding(true);
    try {
      await adminService.addUserToOrg(selectedUserId, user.orgId, selectedRoleId);
      await loadData();
      handleCloseAddModal();
    } catch (error: any) {
      setErrorModal({
        isOpen: true,
        message: error.message || 'No se pudo agregar el usuario'
      });
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteUser = (userOrgRole: UserOrgRole) => {
    setDeleteModal({
      isOpen: true,
      userId: userOrgRole.user_id,
      userName: userOrgRole.user?.name || userOrgRole.user?.email || 'Usuario'
    });
  };

  const confirmDelete = async () => {
    if (!deleteModal.userId || !user?.orgId) return;

    try {
      await adminService.removeUserFromOrg(deleteModal.userId, user.orgId);
      await loadData();
      setDeleteModal({ isOpen: false, userId: null, userName: '' });
    } catch (error: any) {
      setDeleteModal({ isOpen: false, userId: null, userName: '' });
      setErrorModal({
        isOpen: true,
        message: error.message || 'No se pudo eliminar el usuario'
      });
    }
  };

  const cancelDelete = () => {
    setDeleteModal({ isOpen: false, userId: null, userName: '' });
  };

  const handleCloseAddModal = () => {
    setShowAddModal(false);
    setSearchEmail('');
    setSearchResults([]);
    setSelectedUserId('');
  };

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
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Gestión de Usuarios</h2>
          <p className="text-sm text-gray-600">Asigna roles a los usuarios de tu organización</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
        >
          <i className="ri-user-add-line text-lg w-5 h-5 flex items-center justify-center"></i>
          Agregar Usuario
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Usuario
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Organización
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rol Actual
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Asignado
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {userOrgRoles.map((uor) => (
              <tr key={uor.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
                      <span className="text-teal-600 font-semibold text-sm">
                        {uor.user?.name?.charAt(0).toUpperCase() || uor.user?.email?.charAt(0).toUpperCase() || '?'}
                      </span>
                    </div>
                    <span className="font-medium text-gray-900">
                      {uor.user?.name || 'Sin nombre'}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {uor.user?.email || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {uor.organization?.name || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {updating === uor.user_id ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-teal-600"></div>
                      <span className="text-sm text-gray-500">Actualizando...</span>
                    </div>
                  ) : (
                    <select
                      value={uor.role_id}
                      onChange={(e) => handleRoleChange(uor.user_id, e.target.value)}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    >
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {new Date(uor.assigned_at).toLocaleDateString('es-ES', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => handleDeleteUser(uor)}
                    className="text-gray-400 hover:text-red-600"
                    title="Eliminar usuario"
                  >
                    <i className="ri-delete-bin-line text-lg"></i>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {userOrgRoles.length === 0 && (
          <div className="text-center py-12">
            <i className="ri-team-line text-4xl text-gray-300 mb-2"></i>
            <p className="text-gray-500">No hay usuarios en esta organización</p>
          </div>
        )}
      </div>

      {/* Modal de agregar usuario */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Agregar Usuario a la Organización
              </h3>
              <button
                onClick={handleCloseAddModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>

            <div className="p-6">
              {/* Búsqueda de usuario */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Buscar Usuario por Email
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={searchEmail}
                    onChange={(e) => setSearchEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchUsers()}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="usuario@ejemplo.com"
                  />
                  <button
                    onClick={handleSearchUsers}
                    disabled={searching || !searchEmail.trim()}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {searching ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-600"></div>
                    ) : (
                      <i className="ri-search-line text-lg"></i>
                    )}
                  </button>
                </div>
              </div>

              {/* Resultados de búsqueda */}
              {searchResults.length > 0 && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Seleccionar Usuario
                  </label>
                  <div className="border border-gray-300 rounded-lg max-h-48 overflow-y-auto">
                    {searchResults.map((result) => (
                      <div
                        key={result.id}
                        onClick={() => setSelectedUserId(result.id)}
                        className={`p-3 cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-b-0 ${
                          selectedUserId === result.id ? 'bg-teal-50' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center">
                            <span className="text-teal-600 font-semibold text-xs">
                              {result.name?.charAt(0).toUpperCase() || result.email?.charAt(0).toUpperCase() || '?'}
                            </span>
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-gray-900 text-sm">{result.name || 'Sin nombre'}</p>
                            <p className="text-xs text-gray-600">{result.email}</p>
                          </div>
                          {selectedUserId === result.id && (
                            <i className="ri-check-line text-teal-600 text-lg"></i>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Selección de rol */}
              {selectedUserId && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Asignar Rol
                  </label>
                  <select
                    value={selectedRoleId}
                    onChange={(e) => setSelectedRoleId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCloseAddModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddUser}
                  disabled={!selectedUserId || !selectedRoleId || adding}
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {adding ? 'Agregando...' : 'Agregar Usuario'}
                </button>
              </div>
            </div>
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
                ¿Estás seguro de que deseas eliminar a <strong>{deleteModal.userName}</strong> de la organización?
                <br />
                Esta acción no se puede deshacer.
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
