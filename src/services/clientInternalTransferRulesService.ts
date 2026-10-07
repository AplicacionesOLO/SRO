import { supabase } from '../lib/supabase';
import type {
  ClientInternalTransferRule,
  ClientInternalTransferRuleFormData,
} from '../types/client';

/**
 * Service para la regla de Traslado Interno.
 *
 * Permite configurar, por cliente, la lista de usuarios autorizados a ver y
 * usar el check "Traslado Interno" al crear/editar una reserva.
 *
 * Cuando una reserva queda marcada como Traslado Interno:
 *   - Nunca se marca No Arribó.
 *   - No exige fotos en el Punto Control IN/OUT.
 *   - Puede omitir los estados ligados al IN/OUT.
 */
export const clientInternalTransferRulesService = {
  /** Obtiene la regla de Traslado Interno de un cliente (o null si no existe). */
  async getByClient(orgId: string, clientId: string): Promise<ClientInternalTransferRule | null> {
    const { data, error } = await supabase
      .from('client_internal_transfer_rules')
      .select('*')
      .eq('org_id', orgId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (error) throw error;
    return (data as ClientInternalTransferRule) || null;
  },

  /** Lista todas las reglas de Traslado Interno de la organización. */
  async listByOrg(orgId: string): Promise<ClientInternalTransferRule[]> {
    const { data, error } = await supabase
      .from('client_internal_transfer_rules')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as ClientInternalTransferRule[];
  },

  /** Crea o actualiza la regla de Traslado Interno de un cliente. */
  async upsert(
    orgId: string,
    clientId: string,
    payload: ClientInternalTransferRuleFormData
  ): Promise<ClientInternalTransferRule> {
    if (!orgId) throw new Error('orgId es requerido');
    if (!clientId) throw new Error('clientId es requerido');

    const { data: existing } = await supabase
      .from('client_internal_transfer_rules')
      .select('id')
      .eq('org_id', orgId)
      .eq('client_id', clientId)
      .maybeSingle();

    const row = {
      org_id: orgId,
      client_id: clientId,
      allowed_user_ids: payload.allowed_user_ids || [],
      is_active: payload.is_active ?? false,
      updated_at: new Date().toISOString(),
    };

    if (existing?.id) {
      const { data, error } = await supabase
        .from('client_internal_transfer_rules')
        .update(row)
        .eq('id', existing.id)
        .select('*')
        .single();

      if (error) throw error;
      return data as ClientInternalTransferRule;
    }

    const { data, error } = await supabase
      .from('client_internal_transfer_rules')
      .insert({ ...row, created_at: new Date().toISOString() })
      .select('*')
      .single();

    if (error) throw error;
    return data as ClientInternalTransferRule;
  },

  /**
   * ¿El usuario está autorizado a ver/usar el check de Traslado Interno para
   * un cliente? Requiere que la regla exista, esté activa y que el usuario
   * figure en la lista de autorizados.
   */
  async isUserAuthorized(
    orgId: string,
    clientId: string | null | undefined,
    userId: string | null | undefined
  ): Promise<boolean> {
    if (!orgId || !clientId || !userId) return false;
    try {
      const rule = await this.getByClient(orgId, clientId);
      if (!rule || rule.is_active !== true) return false;
      return (rule.allowed_user_ids || []).includes(userId);
    } catch {
      return false;
    }
  },
};