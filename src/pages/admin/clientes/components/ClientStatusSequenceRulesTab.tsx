import { useState, useEffect } from 'react';
import type { ClientStatusSequenceRule, ClientStatusSequenceRuleFormData } from '../../../../types/client';
import { clientStatusSequenceRulesService } from '../../../../services/clientStatusSequenceRulesService';
import { supabase } from '../../../../lib/supabase';

interface ClientStatusSequenceRulesTabProps {
  orgId: string;
  clientId: string;
  canManage: boolean;
}

interface StatusItem {
  id: string;
  name: string;
  code: string;
}

interface RoleItem {
  id: string;
  name: string;
}

interface UserItem {
  id: string;
  name: string;
  email: string;
}

export default function ClientStatusSequenceRulesTab({
  orgId,
  clientId,
  canManage,
}: ClientStatusSequenceRulesTabProps) {
  const [rule, setRule] = useState<ClientStatusSequenceRule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [allStatuses, setAllStatuses] = useState<StatusItem[]>([]);
  const [allRoles, setAllRoles] = useState<RoleItem[]>([]);
  const [allUsers, setAllUsers] = useState<UserItem[]>([]);

  const [enabled, setEnabled] = useState(false);
  const [sequence, setSequence] = useState<string[]>([]);
  const [bypassRoleIds, setBypassRoleIds] = useState<string[]>([]);
  const [bypassUserIds, setBypassUserIds] = useState<string[]>([]);

  useEffect(() => {
    loadData();
    loadCatalogs();
  }, [orgId, clientId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [own, def] = await Promise.all([
        clientStatusSequenceRulesService.getByClient(orgId, clientId),
        clientStatusSequenceRulesService.getDefault(orgId),
      ]);

      setRule(own);

      // Regla efectiva: la del cliente si existe, si no la secuencia por defecto
      const effective = own ?? def;
      if (effective) {
        setEnabled(effective.is_active);
        setSequence(effective.status_sequence || []);
        setBypassRoleIds(effective.bypass_role_ids || []);
        setBypassUserIds(effective.bypass_user_ids || []);
      }
    } catch (err: any) {
      setError(err?.message || 'Error al cargar la regla de secuencia');
    } finally {
      setLoading(false);
    }
  };

  const loadCatalogs = async () => {
    try {
      const [{ data: statuses }, { data: roles }, { data: profiles }] = await Promise.all([
        supabase
          .from('reservation_statuses')
          .select('id, name, code')
          .eq('org_id', orgId)
          .eq('is_active', true)
          .order('order_index', { ascending: true }),
        supabase.from('roles').select('id, name').order('name', { ascending: true }),
        supabase.from('profiles').select('id, name, email').order('name', { ascending: true }),
      ]);

      setAllStatuses((statuses || []) as StatusItem[]);
      setAllRoles((roles || []) as RoleItem[]);
      setAllUsers((profiles || []) as UserItem[]);
    } catch {
      // non-blocking
    }
  };

  const statusName = (id: string): string => allStatuses.find((s) => s.id === id)?.name || id;

  // Estados que todavía no están en la secuencia estricta
  const availableStatuses = allStatuses.filter((s) => !sequence.includes(s.id));

  const addToSequence = (id: string) => setSequence((prev) => [...prev, id]);
  const removeFromSequence = (id: string) => setSequence((prev) => prev.filter((x) => x !== id));
  const moveInSequence = (index: number, dir: -1 | 1) => {
    setSequence((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const toggleRole = (id: string) =>
    setBypassRoleIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleUser = (id: string) =>
    setBypassUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleSave = async () => {
    if (enabled && sequence.length === 0) {
      setError('La secuencia debe tener al menos un estado cuando el control está activo.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const payload: ClientStatusSequenceRuleFormData = {
        status_sequence: enabled ? sequence : [],
        bypass_role_ids: bypassRoleIds,
        bypass_user_ids: bypassUserIds,
        is_active: enabled,
      };

      const saved = await clientStatusSequenceRulesService.upsert(orgId, clientId, payload);
      setRule(saved);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err?.message || 'Error al guardar la regla de secuencia');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <i className="ri-loader-4-line text-2xl text-rose-600 animate-spin"></i>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <i className="ri-error-warning-line text-red-600 text-base mt-0.5"></i>
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <i className="ri-checkbox-circle-line text-green-600 text-base"></i>
            <p className="text-sm text-green-800">Regla de secuencia guardada correctamente</p>
          </div>
        </div>
      )}

      {!rule && (
        <div className="bg-sky-50 border border-sky-200 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <i className="ri-information-line text-sky-600 text-base mt-0.5"></i>
            <p className="text-sm text-sky-800">
              Este cliente está heredando la secuencia por defecto de la organización. Al guardar,
              se creará una secuencia propia para este cliente.
            </p>
          </div>
        </div>
      )}

      {/* Toggle de activación */}
      <label
        className={`flex items-start gap-3 p-4 border rounded-xl transition-colors cursor-pointer ${
          enabled ? 'bg-rose-50 border-rose-300' : 'bg-gray-50 border-gray-200'
        } ${!canManage ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          disabled={!canManage || saving}
          className="w-4 h-4 text-rose-600 border-gray-300 rounded focus:ring-rose-500 disabled:opacity-50 mt-0.5"
        />
        <div className="flex-1">
          <span className="text-sm font-semibold text-gray-900 block">
            Activar control de secuencia de estados
          </span>
          <span className="text-xs text-gray-500 mt-0.5 block">
            Obliga a respetar un orden estricto entre estados. Si un estado se intenta poner antes
            de lo permitido, la acción se bloquea con una explicación. Los roles y usuarios
            autorizados pueden saltarse la regla.
          </span>
        </div>
      </label>

      {enabled && (
        <>
          {/* Constructor de secuencia */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Secuencia estricta de estados
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Ordená los estados que deben respetar una secuencia. Los estados que <strong>no</strong>{' '}
              incluyas acá son circunstanciales y pueden asignarse en cualquier momento.
            </p>

            {sequence.length === 0 ? (
              <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                <i className="ri-flow-chart text-3xl text-gray-400 mb-2 w-8 h-8 flex items-center justify-center mx-auto"></i>
                <p className="text-xs text-gray-500">
                  Agregá al menos un estado para definir la secuencia.
                </p>
              </div>
            ) : (
              <div className="space-y-2 mb-4">
                {sequence.map((statusId, index) => (
                  <div
                    key={statusId}
                    className="flex items-center gap-2 p-2.5 bg-rose-50 border border-rose-200 rounded-lg"
                  >
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-rose-600 text-white text-xs font-bold flex items-center justify-center">
                      {index + 1}
                    </span>
                    <span className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">
                      {statusName(statusId)}
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => moveInSequence(index, -1)}
                        disabled={!canManage || saving || index === 0}
                        className="p-1.5 text-gray-500 hover:text-rose-700 hover:bg-rose-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Subir"
                      >
                        <i className="ri-arrow-up-line text-base w-4 h-4 flex items-center justify-center"></i>
                      </button>
                      <button
                        type="button"
                        onClick={() => moveInSequence(index, 1)}
                        disabled={!canManage || saving || index === sequence.length - 1}
                        className="p-1.5 text-gray-500 hover:text-rose-700 hover:bg-rose-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Bajar"
                      >
                        <i className="ri-arrow-down-line text-base w-4 h-4 flex items-center justify-center"></i>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFromSequence(statusId)}
                        disabled={!canManage || saving}
                        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                        title="Quitar"
                      >
                        <i className="ri-close-line text-base w-4 h-4 flex items-center justify-center"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {availableStatuses.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Agregar estado a la secuencia:</p>
                <div className="flex flex-wrap gap-2">
                  {availableStatuses.map((status) => (
                    <button
                      key={status.id}
                      type="button"
                      onClick={() => addToSequence(status.id)}
                      disabled={!canManage || saving}
                      className="px-3 py-1.5 text-xs font-medium rounded-full border transition-colors whitespace-nowrap bg-gray-50 border-gray-200 text-gray-600 hover:border-rose-300 hover:text-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <i className="ri-add-line mr-1"></i>
                      {status.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Roles autorizados (bypass) */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Roles que se saltan la regla
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Los usuarios con estos roles pueden ejecutar cualquier transición de estado, incluso
              si rompe la secuencia (por ejemplo Full Access y Admin).
            </p>
            {allRoles.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Cargando roles...</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {allRoles.map((role) => {
                  const isSelected = bypassRoleIds.includes(role.id);
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => toggleRole(role.id)}
                      disabled={!canManage || saving}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors whitespace-nowrap ${
                        isSelected
                          ? 'bg-rose-100 border-rose-300 text-rose-800'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {role.name}
                    </button>
                  );
                })}
              </div>
            )}
            {bypassRoleIds.length > 0 && (
              <p className="text-xs text-rose-600 mt-2 font-medium">
                {bypassRoleIds.length} rol(es) con permiso para saltarse la regla
              </p>
            )}
          </div>

          {/* Usuarios autorizados (bypass) */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Usuarios que se saltan la regla
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Estos usuarios específicos pueden ejecutar cualquier transición sin importar su rol.
            </p>
            {allUsers.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Cargando usuarios...</p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {allUsers.map((user) => {
                  const isSelected = bypassUserIds.includes(user.id);
                  return (
                    <label
                      key={user.id}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                        isSelected ? 'bg-rose-50 border-rose-200' : 'bg-white border-gray-100 hover:bg-gray-50'
                      } ${!canManage || saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleUser(user.id)}
                        disabled={!canManage || saving}
                        className="w-3.5 h-3.5 text-rose-600 border-gray-300 rounded focus:ring-rose-500 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{user.name || user.email}</p>
                        {user.name && user.email && (
                          <p className="text-xs text-gray-500 truncate">{user.email}</p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
            {bypassUserIds.length > 0 && (
              <p className="text-xs text-rose-600 mt-2 font-medium">
                {bypassUserIds.length} usuario(s) con permiso para saltarse la regla
              </p>
            )}
          </div>
        </>
      )}

      {canManage && (
        <div className="pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
          >
            {saving && <i className="ri-loader-4-line animate-spin text-base"></i>}
            {saving ? 'Guardando...' : 'Guardar Regla de Secuencia'}
          </button>
        </div>
      )}
    </div>
  );
}