import { useState, useEffect } from 'react';
import type { ClientInternalTransferRule, ClientInternalTransferRuleFormData } from '../../../../types/client';
import { clientInternalTransferRulesService } from '../../../../services/clientInternalTransferRulesService';
import { supabase } from '../../../../lib/supabase';

interface ClientInternalTransferRulesTabProps {
  orgId: string;
  clientId: string;
  canManage: boolean;
}

interface UserItem {
  id: string;
  name: string | null;
  email: string | null;
}

export default function ClientInternalTransferRulesTab({
  orgId,
  clientId,
  canManage,
}: ClientInternalTransferRulesTabProps) {
  const [rule, setRule] = useState<ClientInternalTransferRule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [allUsers, setAllUsers] = useState<UserItem[]>([]);
  const [userSearch, setUserSearch] = useState('');

  const [enabled, setEnabled] = useState(false);
  const [allowedUserIds, setAllowedUserIds] = useState<string[]>([]);

  useEffect(() => {
    loadData();
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, clientId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await clientInternalTransferRulesService.getByClient(orgId, clientId);
      setRule(data);
      if (data) {
        setEnabled(data.is_active);
        setAllowedUserIds(data.allowed_user_ids || []);
      } else {
        setEnabled(false);
        setAllowedUserIds([]);
      }
    } catch (err: any) {
      setError(err?.message || 'Error al cargar la regla de Traslado Interno');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, email')
        .order('name', { ascending: true });
      setAllUsers((data || []) as UserItem[]);
    } catch {
      // non-blocking
    }
  };

  const toggleUser = (id: string) =>
    setAllowedUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleSave = async () => {
    if (enabled && allowedUserIds.length === 0) {
      setError('Seleccioná al menos un usuario autorizado para activar la regla.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const payload: ClientInternalTransferRuleFormData = {
        allowed_user_ids: allowedUserIds,
        is_active: enabled,
      };

      const saved = await clientInternalTransferRulesService.upsert(orgId, clientId, payload);
      setRule(saved);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err?.message || 'Error al guardar la regla de Traslado Interno');
    } finally {
      setSaving(false);
    }
  };

  const filteredUsers = allUsers.filter((u) => {
    if (!userSearch.trim()) return true;
    const term = userSearch.toLowerCase();
    return (u.name || '').toLowerCase().includes(term) || (u.email || '').toLowerCase().includes(term);
  });

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
            <p className="text-sm text-green-800">Regla de Traslado Interno guardada correctamente</p>
          </div>
        </div>
      )}

      {/* Toggle de activación */}
      <label
        className={`flex items-start gap-3 p-4 border rounded-xl transition-colors cursor-pointer ${
          enabled ? 'bg-teal-50 border-teal-300' : 'bg-gray-50 border-gray-200'
        } ${!canManage ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          disabled={!canManage || saving}
          className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500 disabled:opacity-50 mt-0.5"
        />
        <div className="flex-1">
          <span className="text-sm font-semibold text-gray-900 block">Activar Traslado Interno</span>
          <span className="text-xs text-gray-500 mt-0.5 block">
            Los usuarios autorizados verán el check "Traslado Interno" al crear reservas de este
            cliente. Las reservas marcadas quedan exentas de No Arribó, no exigen fotos en el
            Punto Control IN/OUT y pueden omitir los estados ligados al IN/OUT.
          </span>
        </div>
      </label>

      {enabled && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <label className="block text-sm font-semibold text-gray-900 mb-1">
            Usuarios autorizados
          </label>
          <p className="text-xs text-gray-500 mb-3">
            Solo estos usuarios verán y podrán activar el check de Traslado Interno para este cliente.
          </p>

          <div className="relative mb-3">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-base"></i>
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Buscar usuario por nombre o email..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          {allUsers.length === 0 ? (
            <p className="text-xs text-gray-400 italic">Cargando usuarios...</p>
          ) : filteredUsers.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No hay usuarios que coincidan con la búsqueda.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-1">
              {filteredUsers.map((user) => {
                const isSelected = allowedUserIds.includes(user.id);
                return (
                  <label
                    key={user.id}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                      isSelected ? 'bg-teal-50 border-teal-200' : 'bg-white border-gray-100 hover:bg-gray-50'
                    } ${!canManage || saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleUser(user.id)}
                      disabled={!canManage || saving}
                      className="w-3.5 h-3.5 text-teal-600 border-gray-300 rounded focus:ring-teal-500 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{user.name || user.email || '—'}</p>
                      {user.name && user.email && (
                        <p className="text-xs text-gray-500 truncate">{user.email}</p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {allowedUserIds.length > 0 && (
            <p className="text-xs text-teal-700 mt-2 font-medium">
              {allowedUserIds.length} usuario(s) autorizado(s)
            </p>
          )}
        </div>
      )}

      {canManage && (
        <div className="pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
          >
            {saving && <i className="ri-loader-4-line animate-spin text-base"></i>}
            {saving ? 'Guardando...' : 'Guardar Regla de Traslado Interno'}
          </button>
        </div>
      )}
    </div>
  );
}