import { supabase } from '../lib/supabase';

/**
 * Servicio para leer/escribir la lista de estados bloqueados POR CLIENTE.
 * Usa la columna `blocked_status_ids` (jsonb) en la tabla `client_rules`.
 *
 * La regla es POR CLIENTE: si Cofersa bloquea "Confirmada",
 * solo las reservas de Cofersa quedan bloqueadas.
 *
 * IMPORTANTE: La evaluación usa `client_id` directo de la reserva (columna real en BD).
 * NO se infiere desde shipper_provider → client_providers (eso era poco confiable).
 */
export const clientBlockedStatusesService = {
  /**
   * Lee los status_ids bloqueados para un cliente específico.
   * Retorna array vacío si no hay configuración.
   */
  async getBlockedStatusIds(orgId: string, clientId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('client_rules')
      .select('blocked_status_ids')
      .eq('org_id', orgId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return [];

    const raw = data.blocked_status_ids;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw as string[];
    return [];
  },

  /**
   * Guarda (upsert) la lista de status_ids bloqueados para un cliente.
   */
  async setBlockedStatusIds(orgId: string, clientId: string, statusIds: string[]): Promise<void> {
    const { data: existing } = await supabase
      .from('client_rules')
      .select('id')
      .eq('org_id', orgId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase
        .from('client_rules')
        .update({
          blocked_status_ids: statusIds,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('client_rules')
        .insert({
          org_id: orgId,
          client_id: clientId,
          blocked_status_ids: statusIds,
          edit_cutoff_hours: 0,
          allow_all_docks: false,
          dock_allocation_mode: 'SEQUENTIAL',
        });

      if (error) throw error;
    }
  },

  /**
   * Obtiene el client_id de una reserva usando la columna directa `client_id`.
   * Si no tiene client_id directo, intenta inferirlo via shipper_provider → client_providers
   * como fallback de compatibilidad.
   *
   * Retorna null si no se puede determinar el cliente.
   */
  async getClientIdForReservation(orgId: string, reservationId: string): Promise<string | null> {
    // 1) Intentar obtener client_id directo de la reserva
    const { data: reservation } = await supabase
      .from('reservations')
      .select('client_id, shipper_provider')
      .eq('id', reservationId)
      .maybeSingle();

    if (!reservation) return null;

    // ✅ Usar client_id directo si está disponible
    if (reservation.client_id) {
      return reservation.client_id;
    }

    // Fallback: inferir desde shipper_provider → client_providers
    if (reservation.shipper_provider) {
      const { data: cp } = await supabase
        .from('client_providers')
        .select('client_id')
        .eq('org_id', orgId)
        .eq('provider_id', reservation.shipper_provider)
        .maybeSingle();

      if (cp?.client_id) {
        return cp.client_id;
      }
    }

    return null;
  },

  /**
   * Verifica si una reserva está bloqueada para edición según las reglas del cliente.
   * Usa client_id directo de la reserva.
   * Retorna false si no se puede determinar el cliente (fail-open).
   */
  async isReservationBlocked(
    orgId: string,
    reservationId: string,
    statusId: string | null | undefined
  ): Promise<boolean> {
    if (!statusId) return false;

    try {
      const clientId = await this.getClientIdForReservation(orgId, reservationId);
      if (!clientId) return false;

      const blockedIds = await this.getBlockedStatusIds(orgId, clientId);
      return blockedIds.includes(statusId);
    } catch {
      return false;
    }
  },

  /**
   * Verifica si una reserva está bloqueada usando client_id ya conocido (sin fetch extra).
   * Útil cuando ya tenemos el client_id en memoria (ej: desde el objeto reservation).
   */
  async isBlockedByClientId(
    orgId: string,
    clientId: string | null | undefined,
    statusId: string | null | undefined
  ): Promise<boolean> {
    if (!clientId || !statusId) return false;

    try {
      const blockedIds = await this.getBlockedStatusIds(orgId, clientId);
      return blockedIds.includes(statusId);
    } catch {
      return false;
    }
  },
};
