import { useState, useEffect, useMemo } from 'react';
import { adminService, type AdminUserRow } from '../../../../services/adminService';
import { sameDayCutoffService, calcCutoffTime } from '../../../../services/sameDayCutoffService';
import { useActiveWarehouse } from '../../../../contexts/ActiveWarehouseContext';
import { supabase } from '../../../../lib/supabase';

interface Props {
  orgId: string;
  clientId: string;
  canManage: boolean;
}

interface WarehouseHours {
  business_end_time: string;
  timezone: string;
}

export default function SameDayCutoffRuleBlock({ orgId, clientId, canManage }: Props) {
  const { activeWarehouseId } = useActiveWarehouse();

  const [enabled, setEnabled] = useState(false);
  const [hours, setHours] = useState(0);
  const [bypassUserIds, setBypassUserIds] = useState<string[]>([]);
  const [allUsers, setAllUsers] = useState<AdminUserRow[]>([]);
  const [warehouseHours, setWarehouseHours] = useState<WarehouseHours | null>(null);
  const [userSearch, setUserSearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // ── Cargar datos iniciales ──────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const [config, bypassIds, users] = await Promise.all([
          sameDayCutoffService.getConfig(orgId, clientId),
          sameDayCutoffService.getBypassUsers(orgId, clientId),
          adminService.getOrgUsers(orgId).catch(() => [] as AdminUserRow[]),
        ]);

        setEnabled(config.same_day_cutoff_enabled);
        setHours(config.same_day_cutoff_hours);
        setBypassUserIds(bypassIds);
        setAllUsers(users);
      } catch (err: any) {
        setError(err?.message || 'Error al cargar configuración');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [orgId, clientId]);

  // ── Cargar horario del almacén activo ───────────────────────────────────
  useEffect(() => {
    if (!activeWarehouseId) {
      setWarehouseHours(null);
      return;
    }
    const fetchWh = async () => {
      const { data } = await supabase
        .from('warehouses')
        .select('business_end_time, timezone')
        .eq('id', activeWarehouseId)
        .maybeSingle();
      if (data) {
        setWarehouseHours({
          business_end_time: data.business_end_time,
          timezone: data.timezone,
        });
      }
    };
    fetchWh();
  }, [activeWarehouseId]);

  // ── Hora de corte calculada dinámicamente ────────────────────────────────
  const cutoffTimeStr = useMemo(() => {
    if (!warehouseHours || hours <= 0) return null;
    const result = calcCutoffTime(warehouseHours.business_end_time, hours);
    return result;
  }, [warehouseHours, hours]);

  const endTimeDisplay = useMemo(() => {
    if (!warehouseHours) return null;
    const parts = warehouseHours.business_end_time.split(':');
    return `${parts[0]}:${parts[1]}`;
  }, [warehouseHours]);

  // ── Guardar ──────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (hours < 0 || hours > 24) {
      setError('Las horas deben estar entre 0 y 24');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await sameDayCutoffService.updateConfig(orgId, clientId, enabled, hours);
      await sameDayCutoffService.setBypassUsers(orgId, clientId, bypassUserIds);

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle de usuario en bypass ──────────────────────────────────────────
  const toggleBypassUser = (userId: string) => {
    setBypassUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const filteredUsers = allUsers.filter((u) => {
    const q = userSearch.toLowerCase();
    return (
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <i className="ri-loader-4-line text-2xl text-teal-600 animate-spin w-6 h-6 flex items-center justify-center"></i>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <i className="ri-error-warning-line text-red-600 text-lg mt-0.5 w-5 h-5 flex items-center justify-center flex-shrink-0"></i>
          <p className="text-sm text-red-800 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <i className="ri-close-line w-4 h-4 flex items-center justify-center"></i>
          </button>
        </div>
      )}

      {/* Toggle principal */}
      <label
        className={`flex items-start gap-3 p-3 border rounded-lg transition-colors ${
          canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
        } ${enabled ? 'bg-orange-50 border-orange-300' : 'bg-gray-50 border-gray-200'}`}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => canManage && setEnabled(e.target.checked)}
          disabled={!canManage || saving}
          className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500 mt-0.5"
        />
        <div className="flex-1">
          <span className="text-sm font-medium text-gray-900 block">
            Activar restricción de reservas del mismo día
          </span>
          <span className="text-xs text-gray-500">
            Cuando está activa, bloquea la creación de reservas para hoy después de la hora de corte.
          </span>
        </div>
      </label>

      {/* Horas antes del cierre */}
      {enabled && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Horas antes del cierre
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="0"
              max="24"
              value={hours}
              onChange={(e) => setHours(parseInt(e.target.value) || 0)}
              disabled={!canManage || saving}
              className="w-28 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100"
            />
            <span className="text-xs text-gray-500">horas</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">Rango: 0–24 horas.</p>
        </div>
      )}

      {/* Texto de ayuda dinámico */}
      {enabled && (
        <div className={`p-3 rounded-lg border text-xs ${
          cutoffTimeStr
            ? 'bg-orange-50 border-orange-200 text-orange-800'
            : 'bg-gray-50 border-gray-200 text-gray-600'
        }`}>
          <div className="flex items-start gap-2">
            <i className="ri-information-line w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5"></i>
            <div>
              {cutoffTimeStr && endTimeDisplay ? (
                <>
                  <span className="font-semibold">
                    Bloqueará nuevas reservas para hoy a partir de las {cutoffTimeStr}
                  </span>
                  <span className="text-orange-700">
                    {' '}(almacén cierra a {endTimeDisplay} − {hours}h = {cutoffTimeStr})
                  </span>
                </>
              ) : !activeWarehouseId ? (
                <span>Seleccioná un almacén activo en el selector superior para ver la hora de corte calculada.</span>
              ) : (
                <span>Define las horas antes del cierre para ver la hora de corte calculada.</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Usuarios con bypass */}
      {enabled && (
        <div className="space-y-2">
          <div>
            <p className="text-xs font-medium text-gray-700 mb-0.5">
              Usuarios que pueden ignorar esta regla
            </p>
            <p className="text-xs text-gray-500 mb-2">
              Admin y Full Access siempre pueden crear reservas sin restricción. Además, podés agregar usuarios específicos aquí.
            </p>
          </div>

          {allUsers.length > 0 && (
            <div className="relative">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm w-4 h-4 flex items-center justify-center"></i>
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Buscar usuario..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
          )}

          {allUsers.length === 0 ? (
            <p className="text-xs text-gray-500 py-2">No hay usuarios disponibles.</p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1 border border-gray-200 rounded-lg p-1 bg-gray-50">
              {filteredUsers.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">Sin resultados</p>
              ) : (
                filteredUsers.map((u) => {
                  const isSelected = bypassUserIds.includes(u.id);
                  return (
                    <label
                      key={u.id}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-orange-50 border border-orange-200'
                          : 'bg-white border border-transparent hover:bg-gray-100'
                      } ${!canManage ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => canManage && toggleBypassUser(u.id)}
                        disabled={!canManage || saving}
                        className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 truncate">
                          {u.full_name || 'Sin nombre'}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{u.email}</p>
                      </div>
                      {isSelected && (
                        <span className="text-xs font-medium text-orange-600 flex-shrink-0">
                          Bypass
                        </span>
                      )}
                    </label>
                  );
                })
              )}
            </div>
          )}

          {bypassUserIds.length > 0 && (
            <p className="text-xs text-gray-500">
              {bypassUserIds.length} usuario(s) pueden ignorar esta regla.
            </p>
          )}
        </div>
      )}

      {/* Botón guardar */}
      {canManage && (
        <div className="pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
          >
            {saving && <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>}
            {saved && !saving && <i className="ri-check-line w-4 h-4 flex items-center justify-center"></i>}
            {saving ? 'Guardando...' : saved ? '¡Guardado!' : 'Guardar'}
          </button>
        </div>
      )}
    </div>
  );
}
