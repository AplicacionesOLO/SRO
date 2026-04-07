import { supabase } from '../lib/supabase';
import type { ClientBlockedStatusConfig } from '../types/client';

/**
 * Servicio para leer/escribir la configuración compuesta de bloqueo por estados POR CLIENTE.
 *
 * Estructura en client_rules:
 *   - blocked_status_ids: string[]  → estados que bloquean edición
 *   - bypass_role_ids:    string[]  → roles que pueden saltarse el bloqueo
 *   - bypass_user_ids:    string[]  → usuarios específicos que pueden saltarse el bloqueo
 *
 * Prioridad de bypass:
 *   1. ADMIN / Full Access (canLocal admin.users.create || admin.matrix.update) → siempre pasan
 *   2. user.id ∈ bypass_user_ids
 *   3. user.role_id ∈ bypass_role_ids
 */
export const clientBlockedStatusesService = {
  // ─────────────────────────────────────────────────────────────────────────
  // LECTURA
  // ─────────────────────────────────────────────────────────────────────────

  /** Lee la configuración completa de bloqueo para un cliente. */
  async getConfig(orgId: string, clientId: string): Promise<ClientBlockedStatusConfig> {
    const { data, error } = await supabase
      .from('client_rules')
      .select('blocked_status_ids, bypass_role_ids, bypass_user_ids')
      .eq('org_id', orgId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return { blocked_status_ids: [], bypass_role_ids: [], bypass_user_ids: [] };

    return {
      blocked_status_ids: Array.isArray(data.blocked_status_ids) ? data.blocked_status_ids : [],
      bypass_role_ids: Array.isArray(data.bypass_role_ids) ? data.bypass_role_ids : [],
      bypass_user_ids: Array.isArray(data.bypass_user_ids) ? data.bypass_user_ids : [],
    };
  },

  /** Lee solo los status_ids bloqueados (compatibilidad con código existente). */
  async getBlockedStatusIds(orgId: string, clientId: string): Promise<string[]> {
    const config = await this.getConfig(orgId, clientId);
    return config.blocked_status_ids;
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ESCRITURA
  // ─────────────────────────────────────────────────────────────────────────

  /** Guarda (upsert) la configuración completa de bloqueo para un cliente. */
  async setConfig(orgId: string, clientId: string, config: ClientBlockedStatusConfig): Promise<void> {
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
          blocked_status_ids: config.blocked_status_ids,
          bypass_role_ids: config.bypass_role_ids,
          bypass_user_ids: config.bypass_user_ids,
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
          blocked_status_ids: config.blocked_status_ids,
          bypass_role_ids: config.bypass_role_ids,
          bypass_user_ids: config.bypass_user_ids,
          edit_cutoff_hours: 0,
          allow_all_docks: false,
          dock_allocation_mode: 'SEQUENTIAL',
        });
      if (error) throw error;
    }
  },

  /** Guarda solo los status_ids bloqueados (compatibilidad con código existente). */
  async setBlockedStatusIds(orgId: string, clientId: string, statusIds: string[]): Promise<void> {
    const existing = await this.getConfig(orgId, clientId);
    await this.setConfig(orgId, clientId, {
      ...existing,
      blocked_status_ids: statusIds,
    });
  },

  // ─────────────────────────────────────────────────────────────────────────
  // EVALUACIÓN
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Evalúa si una reserva está bloqueada para el usuario actual.
   *
   * @param orgId       - ID de la organización
   * @param clientId    - client_id directo de la reserva
   * @param statusId    - status_id actual de la reserva
   * @param userId      - ID del usuario que intenta editar
   * @param userRoleId  - role_id del usuario (de user_org_roles)
   * @param isPrivileged - true si el usuario tiene admin.users.create o admin.matrix.update
   *
   * Retorna true si la reserva está bloqueada para ese usuario.
   */
  async isBlockedForUser(
    orgId: string,
    clientId: string | null | undefined,
    statusId: string | null | undefined,
    userId: string | null | undefined,
    userRoleId: string | null | undefined,
    isPrivileged: boolean
  ): Promise<boolean> {
    // ADMIN / Full Access siempre pasan
    if (isPrivileged) return false;
    if (!clientId || !statusId) return false;

    try {
      const config = await this.getConfig(orgId, clientId);

      // Si el estado no está en la lista de bloqueados → no bloquear
      if (!config.blocked_status_ids.includes(statusId)) return false;

      // El estado está bloqueado → verificar bypass
      // 1. bypass por usuario específico
      if (userId && config.bypass_user_ids.includes(userId)) return false;

      // 2. bypass por rol
      if (userRoleId && config.bypass_role_ids.includes(userRoleId)) return false;

      // Sin bypass → bloqueado
      return true;
    } catch {
      return false; // fail-open
    }
  },

  /**
   * Versión síncrona para drag/drop (requiere config precargada en caché).
   */
  isBlockedForUserSync(
    config: ClientBlockedStatusConfig | null | undefined,
    statusId: string | null | undefined,
    userId: string | null | undefined,
    userRoleId: string | null | undefined,
    isPrivileged: boolean
  ): boolean {
    if (isPrivileged) return false;
    if (!config || !statusId) return false;
    if (!config.blocked_status_ids.includes(statusId)) return false;
    if (userId && config.bypass_user_ids.includes(userId)) return false;
    if (userRoleId && config.bypass_role_ids.includes(userRoleId)) return false;
    return true;
  },

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS (compatibilidad con código existente)
  // ─────────────────────────────────────────────────────────────────────────

  async getClientIdForReservation(orgId: string, reservationId: string): Promise<string | null> {
    const { data: reservation } = await supabase
      .from('reservations')
      .select('client_id, shipper_provider')
      .eq('id', reservationId)
      .maybeSingle();

    if (!reservation) return null;
    if (reservation.client_id) return reservation.client_id;

    if (reservation.shipper_provider) {
      const { data: cp } = await supabase
        .from('client_providers')
        .select('client_id')
        .eq('org_id', orgId)
        .eq('provider_id', reservation.shipper_provider)
        .maybeSingle();
      if (cp?.client_id) return cp.client_id;
    }

    return null;
  },

  async isReservationBlocked(
    orgId: string,
    reservationId: string,
    statusId: string | null | undefined
  ): Promise<boolean> {
    if (!statusId) return false;
    try {
      const clientId = await this.getClientIdForReservation(orgId, reservationId);
      if (!clientId) return false;
      const ids = await this.getBlockedStatusIds(orgId, clientId);
      return ids.includes(statusId);
    } catch {
      return false;
    }
  },

  async isBlockedByClientId(
    orgId: string,
    clientId: string | null | undefined,
    statusId: string | null | undefined
  ): Promise<boolean> {
    if (!clientId || !statusId) return false;
    try {
      const ids = await this.getBlockedStatusIds(orgId, clientId);
      return ids.includes(statusId);
    } catch {
      return false;
    }
  },
};
