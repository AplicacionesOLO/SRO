import { useState, useEffect, useCallback } from 'react';
import { clientBlockedStatusesService } from '../../../services/clientBlockedStatusesService';
import { calendarService } from '../../../services/calendarService';
import { adminService } from '../../../services/adminService';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import type { ClientBlockedStatusConfig } from '../../../types/client';

interface BlockedStatusesConfigProps {
  orgId: string;
  clientId?: string;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
  roleId: string | null;
  roleName: string | null;
}

interface StatusOption {
  id: string;
  name: string;
  color: string;
}

interface RoleOption {
  id: string;
  name: string;
  description: string | null;
}

export default function BlockedStatusesConfig({ orgId, clientId }: BlockedStatusesConfigProps) {
  const { canLocal } = useAuth();
  const isPrivileged = canLocal('admin.users.create') || canLocal('admin.matrix.update');

  // ── Datos disponibles ──────────────────────────────────────────────────
  const [allStatuses, setAllStatuses] = useState<StatusOption[]>([]);
  const [allRoles, setAllRoles] = useState<RoleOption[]>([]);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);

  // ── Configuración actual ───────────────────────────────────────────────
  const [config, setConfig] = useState<ClientBlockedStatusConfig>({
    blocked_status_ids: [],
    bypass_role_ids: [],
    bypass_user_ids: [],
  });
  const [originalConfig, setOriginalConfig] = useState<ClientBlockedStatusConfig>({
    blocked_status_ids: [],
    bypass_role_ids: [],
    bypass_user_ids: [],
  });

  // ── Selectores desplegables ────────────────────────────────────────────
  const [selectedStatusId, setSelectedStatusId] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userSearch, setUserSearch] = useState('');

  // ── UI state ───────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // ── Carga inicial ──────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      setError('');

      const [statusesData, rolesData] = await Promise.all([
        calendarService.getReservationStatuses(orgId),
        adminService.getRoles(),
      ]);

      setAllStatuses(statusesData.map((s: any) => ({
        id: s.id,
        name: s.name,
        color: s.color || '#6B7280',
      })));
      setAllRoles(rolesData);

      // Cargar usuarios de la org
      try {
        const usersData = await adminService.getOrgUsers(orgId);
        // Enriquecer con role_id desde user_org_roles
        const { data: uorData } = await supabase
          .from('user_org_roles')
          .select('user_id, role_id, roles!user_org_roles_role_id_fkey(id, name)')
          .eq('org_id', orgId);

        const uorMap = new Map<string, { roleId: string; roleName: string }>();
        (uorData || []).forEach((uor: any) => {
          uorMap.set(uor.user_id, {
            roleId: uor.role_id,
            roleName: uor.roles?.name || '',
          });
        });

        setAllUsers(usersData.map((u) => ({
          id: u.id,
          name: u.full_name || u.email || u.id,
          email: u.email || '',
          roleId: uorMap.get(u.id)?.roleId || null,
          roleName: uorMap.get(u.id)?.roleName || null,
        })));
      } catch {
        setAllUsers([]);
      }

      if (clientId) {
        const cfg = await clientBlockedStatusesService.getConfig(orgId, clientId);
        setConfig(cfg);
        setOriginalConfig(cfg);
      }
    } catch {
      setError('Error al cargar la configuración. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [orgId, clientId]);

  useEffect(() => { load(); }, [load]);

  // ── Helpers ────────────────────────────────────────────────────────────
  const getStatusById = (id: string) => allStatuses.find((s) => s.id === id);
  const getRoleById = (id: string) => allRoles.find((r) => r.id === id);
  const getUserById = (id: string) => allUsers.find((u) => u.id === id);

  const availableStatuses = allStatuses.filter((s) => !config.blocked_status_ids.includes(s.id));
  const availableRoles = allRoles.filter((r) => !config.bypass_role_ids.includes(r.id));
  const filteredUsers = allUsers.filter((u) => {
    if (config.bypass_user_ids.includes(u.id)) return false;
    if (!userSearch.trim()) return true;
    const term = userSearch.toLowerCase();
    return (
      u.name.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term)
    );
  });

  // ── Acciones ───────────────────────────────────────────────────────────
  const addStatus = () => {
    if (!selectedStatusId) return;
    setConfig((prev) => ({
      ...prev,
      blocked_status_ids: [...prev.blocked_status_ids, selectedStatusId],
    }));
    setSelectedStatusId('');
    setSaved(false);
  };

  const removeStatus = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      blocked_status_ids: prev.blocked_status_ids.filter((x) => x !== id),
    }));
    setSaved(false);
  };

  const addRole = () => {
    if (!selectedRoleId) return;
    setConfig((prev) => ({
      ...prev,
      bypass_role_ids: [...prev.bypass_role_ids, selectedRoleId],
    }));
    setSelectedRoleId('');
    setSaved(false);
  };

  const removeRole = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      bypass_role_ids: prev.bypass_role_ids.filter((x) => x !== id),
    }));
    setSaved(false);
  };

  const addUser = () => {
    if (!selectedUserId) return;
    setConfig((prev) => ({
      ...prev,
      bypass_user_ids: [...prev.bypass_user_ids, selectedUserId],
    }));
    setSelectedUserId('');
    setUserSearch('');
    setSaved(false);
  };

  const removeUser = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      bypass_user_ids: prev.bypass_user_ids.filter((x) => x !== id),
    }));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!isPrivileged || !clientId) return;
    try {
      setSaving(true);
      setError('');
      await clientBlockedStatusesService.setConfig(orgId, clientId, config);
      setOriginalConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Error al guardar. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    JSON.stringify(config.blocked_status_ids.slice().sort()) !== JSON.stringify(originalConfig.blocked_status_ids.slice().sort()) ||
    JSON.stringify(config.bypass_role_ids.slice().sort()) !== JSON.stringify(originalConfig.bypass_role_ids.slice().sort()) ||
    JSON.stringify(config.bypass_user_ids.slice().sort()) !== JSON.stringify(originalConfig.bypass_user_ids.slice().sort());

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <i className="ri-loader-4-line text-3xl text-teal-600 animate-spin w-8 h-8 flex items-center justify-center"></i>
      </div>
    );
  }

  return (
    <div className="w-full space-y-5">
      {/* Info box */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <i className="ri-information-line text-amber-600 text-lg w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5"></i>
          <div className="text-sm text-amber-800">
            <p className="font-semibold mb-1">Regla compuesta de bloqueo</p>
            <p className="text-amber-700 mb-1">
              Si la reserva de este cliente tiene uno de los estados bloqueados, se bloquea toda edición
              (modal, drag&amp;drop, cambio de estado, cancelar).
            </p>
            <p className="text-amber-700">
              <strong>Excepción:</strong> ADMIN y Full Access siempre pueden editar. Además podés configurar
              roles y usuarios específicos que también puedan saltarse el bloqueo.
            </p>
          </div>
        </div>
      </div>

      {/* ── BLOQUE 1: Estados bloqueados ─────────────────────────────────── */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border-b border-amber-200">
          <div className="w-7 h-7 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <i className="ri-lock-2-line text-amber-600 text-sm w-4 h-4 flex items-center justify-center"></i>
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-900">Estados bloqueados</p>
            <p className="text-xs text-amber-700">Las reservas en estos estados no podrán modificarse</p>
          </div>
          {config.blocked_status_ids.length > 0 && (
            <span className="ml-auto px-2 py-0.5 bg-amber-200 text-amber-800 text-xs font-bold rounded-full">
              {config.blocked_status_ids.length}
            </span>
          )}
        </div>

        <div className="p-4 space-y-3">
          {/* Selector + botón agregar */}
          {isPrivileged && clientId && (
            <div className="flex gap-2">
              <select
                value={selectedStatusId}
                onChange={(e) => setSelectedStatusId(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
              >
                <option value="">Seleccionar estado...</option>
                {availableStatuses.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={addStatus}
                disabled={!selectedStatusId}
                className="px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                <i className="ri-add-line mr-1 w-4 h-4 inline-flex items-center justify-center"></i>
                Agregar
              </button>
            </div>
          )}

          {/* Lista de estados bloqueados */}
          {config.blocked_status_ids.length === 0 ? (
            <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-200">
              <i className="ri-lock-unlock-line text-2xl text-gray-300 w-6 h-6 flex items-center justify-center mx-auto mb-1"></i>
              <p className="text-xs text-gray-400">Ningún estado bloqueado — las reservas se pueden editar libremente</p>
            </div>
          ) : (
            <div className="space-y-2">
              {config.blocked_status_ids.map((id) => {
                const status = getStatusById(id);
                return (
                  <div key={id} className="flex items-center gap-3 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: status?.color || '#6B7280' }}
                    />
                    <span className="flex-1 text-sm font-medium text-amber-900">
                      {status?.name || id}
                    </span>
                    <span className="px-2 py-0.5 bg-amber-200 text-amber-800 text-xs font-semibold rounded-full">
                      Bloqueado
                    </span>
                    {isPrivileged && clientId && (
                      <button
                        type="button"
                        onClick={() => removeStatus(id)}
                        className="w-6 h-6 flex items-center justify-center text-amber-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Quitar estado"
                      >
                        <i className="ri-close-line text-sm w-4 h-4 flex items-center justify-center"></i>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── BLOQUE 2: Roles exceptuados ──────────────────────────────────── */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 bg-teal-50 border-b border-teal-200">
          <div className="w-7 h-7 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <i className="ri-shield-check-line text-teal-600 text-sm w-4 h-4 flex items-center justify-center"></i>
          </div>
          <div>
            <p className="text-sm font-semibold text-teal-900">Roles que pueden saltarse el bloqueo</p>
            <p className="text-xs text-teal-700">Usuarios con estos roles podrán editar aunque la reserva esté bloqueada</p>
          </div>
          {config.bypass_role_ids.length > 0 && (
            <span className="ml-auto px-2 py-0.5 bg-teal-200 text-teal-800 text-xs font-bold rounded-full">
              {config.bypass_role_ids.length}
            </span>
          )}
        </div>

        <div className="p-4 space-y-3">
          {isPrivileged && clientId && (
            <div className="flex gap-2">
              <select
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
              >
                <option value="">Seleccionar rol...</option>
                {availableRoles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={addRole}
                disabled={!selectedRoleId}
                className="px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                <i className="ri-add-line mr-1 w-4 h-4 inline-flex items-center justify-center"></i>
                Agregar
              </button>
            </div>
          )}

          {config.bypass_role_ids.length === 0 ? (
            <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-200">
              <i className="ri-shield-line text-2xl text-gray-300 w-6 h-6 flex items-center justify-center mx-auto mb-1"></i>
              <p className="text-xs text-gray-400">Sin roles exceptuados — solo ADMIN y Full Access pueden editar reservas bloqueadas</p>
            </div>
          ) : (
            <div className="space-y-2">
              {config.bypass_role_ids.map((id) => {
                const role = getRoleById(id);
                return (
                  <div key={id} className="flex items-center gap-3 px-3 py-2.5 bg-teal-50 border border-teal-200 rounded-lg">
                    <div className="w-7 h-7 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <i className="ri-user-settings-line text-teal-600 text-xs w-4 h-4 flex items-center justify-center"></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-teal-900 truncate">{role?.name || id}</p>
                      {role?.description && (
                        <p className="text-xs text-teal-600 truncate">{role.description}</p>
                      )}
                    </div>
                    <span className="px-2 py-0.5 bg-teal-200 text-teal-800 text-xs font-semibold rounded-full whitespace-nowrap">
                      Puede editar
                    </span>
                    {isPrivileged && clientId && (
                      <button
                        type="button"
                        onClick={() => removeRole(id)}
                        className="w-6 h-6 flex items-center justify-center text-teal-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Quitar rol"
                      >
                        <i className="ri-close-line text-sm w-4 h-4 flex items-center justify-center"></i>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── BLOQUE 3: Usuarios exceptuados ───────────────────────────────── */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 border-b border-indigo-200">
          <div className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <i className="ri-user-star-line text-indigo-600 text-sm w-4 h-4 flex items-center justify-center"></i>
          </div>
          <div>
            <p className="text-sm font-semibold text-indigo-900">Usuarios que pueden saltarse el bloqueo</p>
            <p className="text-xs text-indigo-700">Usuarios específicos con acceso de edición aunque su rol no lo permita</p>
          </div>
          {config.bypass_user_ids.length > 0 && (
            <span className="ml-auto px-2 py-0.5 bg-indigo-200 text-indigo-800 text-xs font-bold rounded-full">
              {config.bypass_user_ids.length}
            </span>
          )}
        </div>

        <div className="p-4 space-y-3">
          {isPrivileged && clientId && (
            <div className="space-y-2">
              {/* Búsqueda de usuario */}
              <div className="relative">
                <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm w-4 h-4 flex items-center justify-center"></i>
                <input
                  type="text"
                  placeholder="Buscar usuario por nombre o email..."
                  value={userSearch}
                  onChange={(e) => { setUserSearch(e.target.value); setSelectedUserId(''); }}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              {/* Dropdown de resultados */}
              {userSearch.trim() && filteredUsers.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                  {filteredUsers.slice(0, 8).map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => { setSelectedUserId(u.id); setUserSearch(u.name || u.email); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-indigo-50 transition-colors border-b border-gray-100 last:border-0 ${
                        selectedUserId === u.id ? 'bg-indigo-50' : 'bg-white'
                      }`}
                    >
                      <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <i className="ri-user-line text-gray-500 text-xs w-4 h-4 flex items-center justify-center"></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                        <p className="text-xs text-gray-500 truncate">{u.email}{u.roleName ? ` · ${u.roleName}` : ''}</p>
                      </div>
                      {selectedUserId === u.id && (
                        <i className="ri-check-line text-indigo-600 w-4 h-4 flex items-center justify-center"></i>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {userSearch.trim() && filteredUsers.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">No se encontraron usuarios</p>
              )}

              <button
                type="button"
                onClick={addUser}
                disabled={!selectedUserId}
                className="w-full px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                <i className="ri-add-line mr-1 w-4 h-4 inline-flex items-center justify-center"></i>
                Agregar usuario seleccionado
              </button>
            </div>
          )}

          {config.bypass_user_ids.length === 0 ? (
            <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-200">
              <i className="ri-user-line text-2xl text-gray-300 w-6 h-6 flex items-center justify-center mx-auto mb-1"></i>
              <p className="text-xs text-gray-400">Sin usuarios exceptuados individualmente</p>
            </div>
          ) : (
            <div className="space-y-2">
              {config.bypass_user_ids.map((id) => {
                const u = getUserById(id);
                return (
                  <div key={id} className="flex items-center gap-3 px-3 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <i className="ri-user-star-line text-indigo-600 text-xs w-4 h-4 flex items-center justify-center"></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-indigo-900 truncate">{u?.name || id}</p>
                      {u?.email && <p className="text-xs text-indigo-600 truncate">{u.email}{u.roleName ? ` · ${u.roleName}` : ''}</p>}
                    </div>
                    <span className="px-2 py-0.5 bg-indigo-200 text-indigo-800 text-xs font-semibold rounded-full whitespace-nowrap">
                      Puede editar
                    </span>
                    {isPrivileged && clientId && (
                      <button
                        type="button"
                        onClick={() => removeUser(id)}
                        className="w-6 h-6 flex items-center justify-center text-indigo-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Quitar usuario"
                      >
                        <i className="ri-close-line text-sm w-4 h-4 flex items-center justify-center"></i>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
          <i className="ri-error-warning-line text-red-600 w-4 h-4 flex items-center justify-center"></i>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Sin permisos */}
      {!isPrivileged && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <i className="ri-lock-line text-gray-500 w-4 h-4 flex items-center justify-center"></i>
            <p className="text-sm text-gray-600">
              Solo usuarios con rol <span className="font-semibold">ADMIN</span> o{' '}
              <span className="font-semibold">Full Access</span> pueden modificar esta configuración.
            </p>
          </div>
        </div>
      )}

      {/* Botones guardar / descartar */}
      {isPrivileged && clientId && (
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
              saved
                ? 'bg-teal-600 text-white'
                : hasChanges
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            } disabled:opacity-60`}
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
                Guardando...
              </span>
            ) : saved ? (
              <span className="flex items-center gap-2">
                <i className="ri-check-line w-4 h-4 flex items-center justify-center"></i>
                Guardado
              </span>
            ) : (
              'Guardar configuración'
            )}
          </button>

          {hasChanges && !saving && (
            <button
              type="button"
              onClick={() => { setConfig(originalConfig); setSaved(false); }}
              className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              Descartar cambios
            </button>
          )}
        </div>
      )}
    </div>
  );
}
