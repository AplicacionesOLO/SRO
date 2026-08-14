import { useState, useEffect } from 'react';
import type { ClientOverlapRule, ClientOverlapRuleFormData } from '../../../../types/client';
import { clientOverlapRulesService } from '../../../../services/clientOverlapRulesService';
import { supabase } from '../../../../lib/supabase';

interface ClientOverlapRulesTabProps {
  orgId: string;
  clientId: string;
  canManage: boolean;
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

interface StatusItem {
  id: string;
  name: string;
  code: string;
  color: string;
}

export default function ClientOverlapRulesTab({
  orgId,
  clientId,
  canManage,
}: ClientOverlapRulesTabProps) {
  const [rule, setRule] = useState<ClientOverlapRule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [allStatuses, setAllStatuses] = useState<StatusItem[]>([]);
  const [allRoles, setAllRoles] = useState<RoleItem[]>([]);
  const [allUsers, setAllUsers] = useState<UserItem[]>([]);

  const [form, setForm] = useState<ClientOverlapRuleFormData>({
    enabled: false,
    min_gap_minutes: 15,
    allowed_status_ids: [],
    authorized_role_ids: [],
    authorized_user_ids: [],
  });

  useEffect(() => {
    loadData();
    loadCatalogs();
  }, [orgId, clientId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await clientOverlapRulesService.getByClient(orgId, clientId);
      setRule(data);
      if (data) {
        setForm({
          enabled: data.enabled,
          min_gap_minutes: data.min_gap_minutes,
          allowed_status_ids: data.allowed_status_ids || [],
          authorized_role_ids: data.authorized_role_ids || [],
          authorized_user_ids: data.authorized_user_ids || [],
        });
      }
    } catch (err: any) {
      setError(err?.message || 'Error al cargar regla de superposición');
    } finally {
      setLoading(false);
    }
  };

  const loadCatalogs = async () => {
    try {
      const [{ data: statuses }, { data: roles }, { data: profiles }] = await Promise.all([
        supabase.from('reservation_statuses').select('id, name, code, color').eq('org_id', orgId).eq('is_active', true).order('order_index', { ascending: true }),
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

  const toggleStatus = (statusId: string) => {
    setForm((prev) => ({
      ...prev,
      allowed_status_ids: prev.allowed_status_ids.includes(statusId)
        ? prev.allowed_status_ids.filter((id) => id !== statusId)
        : [...prev.allowed_status_ids, statusId],
    }));
  };

  const toggleRole = (roleId: string) => {
    setForm((prev) => ({
      ...prev,
      authorized_role_ids: prev.authorized_role_ids.includes(roleId)
        ? prev.authorized_role_ids.filter((id) => id !== roleId)
        : [...prev.authorized_role_ids, roleId],
    }));
  };

  const toggleUser = (userId: string) => {
    setForm((prev) => ({
      ...prev,
      authorized_user_ids: prev.authorized_user_ids.includes(userId)
        ? prev.authorized_user_ids.filter((id) => id !== userId)
        : [...prev.authorized_user_ids, userId],
    }));
  };

  const handleSave = async () => {
    if (form.min_gap_minutes < 0) {
      setError('La diferencia mínima de minutos no puede ser negativa');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const saved = await clientOverlapRulesService.upsert(orgId, clientId, form);
      setRule(saved);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err?.message || 'Error al guardar regla de superposición');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <i className="ri-loader-4-line text-2xl text-teal-600 animate-spin"></i>
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
            <p className="text-sm text-green-800">Regla guardada correctamente</p>
          </div>
        </div>
      )}

      {/* ── Toggle de activación ── */}
      <label className={`flex items-start gap-3 p-4 border rounded-xl transition-colors cursor-pointer ${
        form.enabled ? 'bg-violet-50 border-violet-300' : 'bg-gray-50 border-gray-200'
      } ${!canManage ? 'opacity-50 cursor-not-allowed' : ''}`}>
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          disabled={!canManage || saving}
          className="w-4 h-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500 disabled:opacity-50 mt-0.5"
        />
        <div className="flex-1">
          <span className="text-sm font-semibold text-gray-900 block">
            Activar control de superposición
          </span>
          <span className="text-xs text-gray-500 mt-0.5 block">
            Cuando está activo, solo usuarios y roles autorizados pueden crear citas que se superpongan con reservas existentes en el mismo andén.
          </span>
        </div>
      </label>

      {/* ── Configuración: visible solo cuando está activo ── */}
      {form.enabled && (
        <>
          {/* Diferencia mínima de minutos */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Diferencia mínima entre citas
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                max={120}
                value={form.min_gap_minutes}
                onChange={(e) => setForm({ ...form, min_gap_minutes: parseInt(e.target.value) || 0 })}
                disabled={!canManage || saving}
                className="w-24 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent disabled:bg-gray-100"
              />
              <span className="text-sm text-gray-600">minutos</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Si es 0, se permite cualquier superposición (incluso a la misma hora). Si es 15, la nueva cita debe empezar al menos 15 minutos después del inicio de la cita existente.
            </p>
          </div>

          {/* Estados que permiten superposición */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Estados que permiten superposición
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Si una reserva existente está en uno de estos estados, se permite crear otra cita encima sin restricción. Si la reserva existente NO está en uno de estos estados, se bloquea la superposición.
            </p>
            {allStatuses.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Cargando estados...</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {allStatuses.map((status) => {
                  const isSelected = form.allowed_status_ids.includes(status.id);
                  return (
                    <button
                      key={status.id}
                      type="button"
                      onClick={() => toggleStatus(status.id)}
                      disabled={!canManage || saving}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors whitespace-nowrap ${
                        isSelected
                          ? 'bg-violet-100 border-violet-300 text-violet-800'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {status.name}
                    </button>
                  );
                })}
              </div>
            )}
            {form.allowed_status_ids.length > 0 && (
              <p className="text-xs text-violet-600 mt-2 font-medium">
                {form.allowed_status_ids.length} estado(s) seleccionado(s) — las reservas en estos estados no bloquean nuevas citas
              </p>
            )}
          </div>

          {/* Roles autorizados */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Roles autorizados para superponer
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Los usuarios con estos roles pueden crear citas superpuestas sin importar el estado de la cita existente.
            </p>
            {allRoles.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Cargando roles...</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {allRoles.map((role) => {
                  const isSelected = form.authorized_role_ids.includes(role.id);
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => toggleRole(role.id)}
                      disabled={!canManage || saving}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors whitespace-nowrap ${
                        isSelected
                          ? 'bg-violet-100 border-violet-300 text-violet-800'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {role.name}
                    </button>
                  );
                })}
              </div>
            )}
            {form.authorized_role_ids.length > 0 && (
              <p className="text-xs text-violet-600 mt-2 font-medium">
                {form.authorized_role_ids.length} rol(es) autorizado(s)
              </p>
            )}
          </div>

          {/* Usuarios autorizados */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Usuarios autorizados para superponer
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Estos usuarios específicos pueden crear citas superpuestas sin importar el estado de la cita existente, independientemente de su rol.
            </p>
            {allUsers.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Cargando usuarios...</p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {allUsers.map((user) => {
                  const isSelected = form.authorized_user_ids.includes(user.id);
                  return (
                    <label
                      key={user.id}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                        isSelected ? 'bg-violet-50 border-violet-200' : 'bg-white border-gray-100 hover:bg-gray-50'
                      } ${!canManage || saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleUser(user.id)}
                        disabled={!canManage || saving}
                        className="w-3.5 h-3.5 text-violet-600 border-gray-300 rounded focus:ring-violet-500 flex-shrink-0"
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
            {form.authorized_user_ids.length > 0 && (
              <p className="text-xs text-violet-600 mt-2 font-medium">
                {form.authorized_user_ids.length} usuario(s) autorizado(s)
              </p>
            )}
          </div>
        </>
      )}

      {/* Botón de guardar */}
      {canManage && (
        <div className="pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
          >
            {saving && <i className="ri-loader-4-line animate-spin text-base"></i>}
            {saving ? 'Guardando...' : 'Guardar Regla de Superposición'}
          </button>
        </div>
      )}
    </div>
  );
}