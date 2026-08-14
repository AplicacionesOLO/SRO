import { supabase } from '../lib/supabase';
import type { ClientOverlapRule, ClientOverlapRuleFormData } from '../types/client';

export const clientOverlapRulesService = {
  async getByClient(orgId: string, clientId: string): Promise<ClientOverlapRule | null> {
    const { data, error } = await supabase
      .from('client_overlap_rules')
      .select('*')
      .eq('org_id', orgId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (error) throw error;
    return data as ClientOverlapRule | null;
  },

  async upsert(orgId: string, clientId: string, payload: ClientOverlapRuleFormData): Promise<ClientOverlapRule> {
    const existing = await this.getByClient(orgId, clientId);

    if (existing) {
      const { data, error } = await supabase
        .from('client_overlap_rules')
        .update({
          enabled: payload.enabled,
          min_gap_minutes: payload.min_gap_minutes,
          allowed_status_ids: payload.allowed_status_ids,
          authorized_role_ids: payload.authorized_role_ids,
          authorized_user_ids: payload.authorized_user_ids,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('*')
        .single();

      if (error) throw error;
      return data as ClientOverlapRule;
    }

    const { data, error } = await supabase
      .from('client_overlap_rules')
      .insert({
        org_id: orgId,
        client_id: clientId,
        enabled: payload.enabled,
        min_gap_minutes: payload.min_gap_minutes,
        allowed_status_ids: payload.allowed_status_ids,
        authorized_role_ids: payload.authorized_role_ids,
        authorized_user_ids: payload.authorized_user_ids,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as ClientOverlapRule;
  },
};