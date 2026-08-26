import { supabase } from '../lib/supabase';
import type { ClientStatusSequenceRule, ClientStatusSequenceRuleFormData } from '../types/client';

/**
 * Service para la regla de secuencia de estados.
 * Permite configurar un orden estricto de estados por cliente (o una
 * secuencia por defecto para la organización) y qué roles/usuarios
 * pueden saltarse esa regla.
 */
export const clientStatusSequenceRulesService = {
  /**
   * Obtiene la secuencia por defecto de la organización (client_id = NULL).
   */
  async getDefault(orgId: string): Promise<ClientStatusSequenceRule | null> {
    const { data, error } = await supabase
      .from('client_status_sequence_rules')
      .select('*')
      .eq('org_id', orgId)
      .is('client_id', null)
      .maybeSingle();

    if (error) throw error;
    return (data as ClientStatusSequenceRule) || null;
  },

  /**
   * Obtiene la regla de secuencia para un cliente específico.
   */
  async getByClient(orgId: string, clientId: string): Promise<ClientStatusSequenceRule | null> {
    const { data, error } = await supabase
      .from('client_status_sequence_rules')
      .select('*')
      .eq('org_id', orgId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (error) throw error;
    return (data as ClientStatusSequenceRule) || null;
  },

  /**
   * Resuelve la regla efectiva para una reserva: si el cliente tiene una
   * secuencia propia la usa, si no, cae a la secuencia por defecto.
   */
  async resolveForClient(
    orgId: string,
    clientId: string | null
  ): Promise<ClientStatusSequenceRule | null> {
    if (clientId) {
      const rule = await this.getByClient(orgId, clientId);
      if (rule) return rule;
    }
    return this.getDefault(orgId);
  },

  /**
   * Lista todas las reglas de secuencia de la organización.
   */
  async listByOrg(orgId: string): Promise<ClientStatusSequenceRule[]> {
    const { data, error } = await supabase
      .from('client_status_sequence_rules')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as ClientStatusSequenceRule[];
  },

  /**
   * Crea o actualiza la regla de secuencia (por cliente o por defecto).
   */
  async upsert(
    orgId: string,
    clientId: string | null,
    payload: ClientStatusSequenceRuleFormData
  ): Promise<ClientStatusSequenceRule> {
    if (!orgId) throw new Error('orgId es requerido');

    if (payload.is_active !== false && (!Array.isArray(payload.status_sequence) || payload.status_sequence.length === 0)) {
      throw new Error('La secuencia de estados no puede estar vacía');
    }

    let query = supabase.from('client_status_sequence_rules').select('id').eq('org_id', orgId);
    query = clientId ? query.eq('client_id', clientId) : query.is('client_id', null);

    const { data: existing } = await query.maybeSingle();

    const row = {
      org_id: orgId,
      client_id: clientId,
      status_sequence: payload.status_sequence,
      bypass_role_ids: payload.bypass_role_ids || [],
      bypass_user_ids: payload.bypass_user_ids || [],
      is_active: payload.is_active ?? true,
      updated_at: new Date().toISOString(),
    };

    if (existing?.id) {
      const { data, error } = await supabase
        .from('client_status_sequence_rules')
        .update(row)
        .eq('id', existing.id)
        .select('*')
        .single();

      if (error) throw error;
      return data as ClientStatusSequenceRule;
    }

    const { data, error } = await supabase
      .from('client_status_sequence_rules')
      .insert({ ...row, created_at: new Date().toISOString() })
      .select('*')
      .single();

    if (error) throw error;
    return data as ClientStatusSequenceRule;
  },

  /**
   * Valida si una transición de estado es permitida según la secuencia configurada.
   * No modifica nada; devuelve { allowed, bypassed, message }.
   * El bypass por rol/usuario ya se resuelve dentro de la función en base de datos.
   */
  async validateTransition(
    orgId: string,
    reservationId: string,
    newStatusId: string,
    userId?: string | null
  ): Promise<{ allowed: boolean; bypassed: boolean; message: string }> {
    const { data, error } = await supabase.rpc('validate_status_sequence', {
      p_org_id: orgId,
      p_reservation_id: reservationId,
      p_new_status_id: newStatusId,
      p_user_id: userId ?? null,
    });

    if (error) throw error;

    return (data as { allowed: boolean; bypassed: boolean; message: string }) || {
      allowed: true,
      bypassed: false,
      message: '',
    };
  },
};