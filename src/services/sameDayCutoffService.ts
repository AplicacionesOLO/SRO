import { supabase } from '../lib/supabase';
import { toWarehouseTimeString } from '../utils/timezoneUtils';

export interface SameDayCutoffConfig {
  same_day_cutoff_enabled: boolean;
  same_day_cutoff_hours: number;
}

export interface WarehouseHours {
  business_start_time: string;
  business_end_time: string;
  timezone: string;
}

export interface CutoffCheckResult {
  /** true → la reserva debe ser bloqueada */
  blocked: boolean;
  /** Hora límite calculada "HH:MM", null si la regla no aplica */
  cutoffTimeStr: string | null;
  /** Mensaje legible para mostrar al usuario */
  message: string;
  /**
   * true → no se pudo verificar la regla (error de red, dato faltante, etc.)
   * En este caso `blocked` es false pero NO se debe tratar como "permitido":
   * el caller debe mostrar un aviso claro y NO crear la reserva.
   */
  verificationFailed?: boolean;
}

const LOG = '[SameDayCutoff]';

/** Convierte "HH:MM:SS" o "HH:MM" → total de minutos desde medianoche */
function timeToMinutes(t: string): number {
  const parts = t.split(':').map(Number);
  return parts[0] * 60 + parts[1];
}

/** Convierte total de minutos → "HH:MM" */
function minutesToTimeStr(totalMins: number): string {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Calcula la hora de corte en formato "HH:MM"
 * cutoff = business_end_time - cutoff_hours
 */
export function calcCutoffTime(businessEndTime: string, cutoffHours: number): string {
  const endMins = timeToMinutes(businessEndTime);
  const cutoffMins = endMins - cutoffHours * 60;
  if (cutoffMins < 0) return '00:00';
  return minutesToTimeStr(cutoffMins);
}

export const sameDayCutoffService = {
  /** Obtiene la configuración de corte del mismo día para un cliente */
  async getConfig(orgId: string, clientId: string): Promise<SameDayCutoffConfig> {
    const { data, error } = await supabase
      .from('client_rules')
      .select('same_day_cutoff_enabled, same_day_cutoff_hours')
      .eq('org_id', orgId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (error) throw error;

    return {
      same_day_cutoff_enabled: data?.same_day_cutoff_enabled ?? false,
      same_day_cutoff_hours: data?.same_day_cutoff_hours ?? 0,
    };
  },

  /** Actualiza la configuración de corte del mismo día */
  async updateConfig(
    orgId: string,
    clientId: string,
    enabled: boolean,
    hours: number
  ): Promise<void> {
    const { data: existing } = await supabase
      .from('client_rules')
      .select('id')
      .eq('org_id', orgId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from('client_rules').insert({
        org_id: orgId,
        client_id: clientId,
        same_day_cutoff_enabled: enabled,
        same_day_cutoff_hours: hours,
        edit_cutoff_hours: 0,
        allow_all_docks: false,
        dock_allocation_mode: 'SEQUENTIAL',
      });
      if (error) throw error;
      return;
    }

    const { error } = await supabase
      .from('client_rules')
      .update({
        same_day_cutoff_enabled: enabled,
        same_day_cutoff_hours: hours,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)
      .eq('client_id', clientId);

    if (error) throw error;
  },

  /** Obtiene los IDs de usuarios que pueden saltarse el corte */
  async getBypassUsers(orgId: string, clientId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('client_same_day_bypass_users')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('client_id', clientId);

    if (error) throw error;
    return (data || []).map((r) => r.user_id);
  },

  /** Sincroniza la lista de usuarios bypass (diff insert/delete) */
  async setBypassUsers(
    orgId: string,
    clientId: string,
    userIds: string[]
  ): Promise<void> {
    const current = await this.getBypassUsers(orgId, clientId);
    const currentSet = new Set(current);
    const newSet = new Set(userIds);

    const toAdd = userIds.filter((id) => !currentSet.has(id));
    const toRemove = current.filter((id) => !newSet.has(id));

    if (toRemove.length > 0) {
      const { error } = await supabase
        .from('client_same_day_bypass_users')
        .delete()
        .eq('org_id', orgId)
        .eq('client_id', clientId)
        .in('user_id', toRemove);
      if (error) throw error;
    }

    if (toAdd.length > 0) {
      const rows = toAdd.map((userId) => ({
        org_id: orgId,
        client_id: clientId,
        user_id: userId,
      }));
      const { error } = await supabase
        .from('client_same_day_bypass_users')
        .insert(rows);
      if (error) throw error;
    }
  },

  /**
   * Verifica si la creación de una reserva para HOY está bloqueada por el cutoff.
   *
   * IMPORTANTE — política de fallos:
   *  - Si cualquier paso no se puede completar (red, dato faltante, etc.)
   *    se retorna `verificationFailed: true` en lugar de fallar abierto.
   *  - El caller DEBE tratar verificationFailed como un bloqueo suave:
   *    mostrar aviso claro y NO crear la reserva.
   *
   * Logs emitidos por consola (siempre visibles en DevTools):
   *  - Hora actual en timezone del almacén
   *  - Hora de corte calculada
   *  - Cliente y usuario evaluados
   *  - Resultado de bypass
   *  - Resultado final (BLOQUEADO / PERMITIDO / FALLO_VERIFICACION)
   */
  async checkCutoff(
    orgId: string,
    clientId: string,
    warehouseId: string,
    tz: string,
    userId: string,
    isPrivileged: boolean
  ): Promise<CutoffCheckResult> {
    // ── Bypass automático: admin / Full Access ─────────────────────────────
    if (isPrivileged) {
      console.log(`${LOG} ✅ BYPASS_PRIVILEGIADO`, {
        usuario: userId,
        cliente: clientId,
        org: orgId,
        motivo: 'isPrivileged=true (admin.users.create | admin.matrix.update)',
      });
      return { blocked: false, cutoffTimeStr: null, message: '' };
    }

    // ── Cargar configuración de la regla para este cliente ─────────────────
    let config: SameDayCutoffConfig;
    try {
      config = await this.getConfig(orgId, clientId);
    } catch (err) {
      console.error(`${LOG} ❌ FALLO_VERIFICACION — error cargando config del cliente`, {
        cliente: clientId,
        org: orgId,
        error: err,
      });
      return {
        blocked: false,
        cutoffTimeStr: null,
        message: 'No se pudo cargar la configuración de corte del mismo día para este cliente.',
        verificationFailed: true,
      };
    }

    // ── Regla desactivada o sin horas configuradas: pasa libre ────────────
    if (!config.same_day_cutoff_enabled || config.same_day_cutoff_hours <= 0) {
      console.log(`${LOG} ⏭️ REGLA_INACTIVA`, {
        cliente: clientId,
        habilitada: config.same_day_cutoff_enabled,
        horas: config.same_day_cutoff_hours,
      });
      return { blocked: false, cutoffTimeStr: null, message: '' };
    }

    // ── Verificar lista de bypass individuales ─────────────────────────────
    let bypassUsers: string[];
    try {
      bypassUsers = await this.getBypassUsers(orgId, clientId);
    } catch (err) {
      console.error(`${LOG} ❌ FALLO_VERIFICACION — error cargando usuarios bypass`, {
        cliente: clientId,
        org: orgId,
        error: err,
      });
      return {
        blocked: false,
        cutoffTimeStr: null,
        message: 'No se pudo verificar la lista de usuarios con bypass para este cliente.',
        verificationFailed: true,
      };
    }

    const hasBypass = bypassUsers.includes(userId);
    console.log(`${LOG} 🔑 Verificación bypass individual`, {
      usuario: userId,
      cliente: clientId,
      usuariosBypass: bypassUsers,
      resultado: hasBypass ? 'BYPASS_ACTIVO' : 'SIN_BYPASS',
    });

    if (hasBypass) {
      return { blocked: false, cutoffTimeStr: null, message: '' };
    }

    // ── Obtener horario operativo del almacén ──────────────────────────────
    const { data: wh, error: whErr } = await supabase
      .from('warehouses')
      .select('business_end_time')
      .eq('id', warehouseId)
      .maybeSingle();

    if (whErr || !wh?.business_end_time) {
      console.error(`${LOG} ❌ FALLO_VERIFICACION — no se pudo obtener horario del almacén`, {
        warehouseId,
        error: whErr,
        data: wh,
      });
      return {
        blocked: false,
        cutoffTimeStr: null,
        message: 'No se pudo obtener el horario operativo del almacén para verificar el corte.',
        verificationFailed: true,
      };
    }

    // ── Calcular hora de corte y comparar contra "ahora" en timezone ───────
    const cutoffTimeStr = calcCutoffTime(wh.business_end_time, config.same_day_cutoff_hours);

    const nowUtc = new Date();
    const nowTimeStr = toWarehouseTimeString(nowUtc, tz);

    const nowMins = timeToMinutes(nowTimeStr);
    const cutoffMins = timeToMinutes(cutoffTimeStr);

    const isBlocked = nowMins >= cutoffMins;

    console.log(`${LOG} 🕐 Evaluación de corte`, {
      cliente: clientId,
      usuario: userId,
      timezone: tz,
      horaActual_enAlmacen: nowTimeStr,
      cierreAlmacen: wh.business_end_time.slice(0, 5),
      horasCutoff: config.same_day_cutoff_hours,
      horaCorteCumplida: cutoffTimeStr,
      horaActual_minutos: nowMins,
      horaCorteCumplida_minutos: cutoffMins,
      resultado: isBlocked ? '🚫 BLOQUEADO' : '✅ PERMITIDO',
    });

    if (isBlocked) {
      return {
        blocked: true,
        cutoffTimeStr,
        message: `No es posible crear reservas para hoy después de las ${cutoffTimeStr}. El corte del mismo día para este cliente se cumplió (${config.same_day_cutoff_hours}h antes del cierre del almacén a las ${wh.business_end_time.slice(0, 5)}).`,
      };
    }

    return { blocked: false, cutoffTimeStr, message: '' };
  },
};
