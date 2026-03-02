import { supabase } from '../lib/supabase';
import type { OperationalStatus } from '../types/operationalStatus';

/**
 * Service for managing operational statuses (reservation_statuses)
 */
export const operationalStatusService = {
  /**
   * Get all operational statuses for an organization
   */
  async getStatuses(orgId: string): Promise<OperationalStatus[]> {
    try {
      console.log('[operationalStatusService] getStatuses start', { orgId });

      const { data, error } = await supabase
        .from('reservation_statuses')
        .select('*')
        .eq('org_id', orgId)
        .order('order_index', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true });

      if (error) {
        console.error('[operationalStatusService] getStatuses error', error);
        throw error;
      }

      console.log('[operationalStatusService] getStatuses success', { 
        orgId, 
        count: data?.length ?? 0 
      });

      return data || [];
    } catch (error) {
      console.error('[operationalStatusService] getStatuses exception', error);
      throw error;
    }
  },

  /**
   * Check if a status is in use by correspondence rules
   */
  async isStatusInUse(statusId: string, orgId: string): Promise<boolean> {
    try {
      console.log('[operationalStatusService] isStatusInUse start', { statusId, orgId });

      const { data, error } = await supabase
        .from('correspondence_rules')
        .select('id')
        .eq('org_id', orgId)
        .or(`status_from_id.eq.${statusId},status_to_id.eq.${statusId}`)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('[operationalStatusService] isStatusInUse error', error);
        throw error;
      }

      const inUse = !!data;
      console.log('[operationalStatusService] isStatusInUse result', { statusId, inUse });

      return inUse;
    } catch (error) {
      console.error('[operationalStatusService] isStatusInUse exception', error);
      throw error;
    }
  },

  /**
   * Create a new operational status
   */
  async createStatus(status: Omit<OperationalStatus, 'id' | 'created_at'>): Promise<OperationalStatus> {
    try {
      console.log('[operationalStatusService] createStatus start', status);

      const { data, error } = await supabase
        .from('reservation_statuses')
        .insert({
          org_id: status.org_id,
          name: status.name,
          code: status.code,
          color: status.color,
          order_index: status.order_index,
          is_active: status.is_active ?? true,
        })
        .select()
        .single();

      if (error) {
        console.error('[operationalStatusService] createStatus error', error);
        throw error;
      }

      console.log('[operationalStatusService] createStatus success', data);
      return data;
    } catch (error) {
      console.error('[operationalStatusService] createStatus exception', error);
      throw error;
    }
  },

  /**
   * Update an operational status
   */
  async updateStatus(id: string, updates: Partial<OperationalStatus>): Promise<OperationalStatus> {
    try {
      console.log('[operationalStatusService] updateStatus start', { id, updates });

      const { data, error } = await supabase
        .from('reservation_statuses')
        .update({
          name: updates.name,
          code: updates.code,
          color: updates.color,
          order_index: updates.order_index,
          is_active: updates.is_active,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('[operationalStatusService] updateStatus error', error);
        throw error;
      }

      console.log('[operationalStatusService] updateStatus success', data);
      return data;
    } catch (error) {
      console.error('[operationalStatusService] updateStatus exception', error);
      throw error;
    }
  },

  /**
   * Soft-disable a status (set is_active = false)
   */
  async deactivateStatus(id: string): Promise<void> {
    try {
      console.log('[operationalStatusService] deactivateStatus start', { id });

      const { error } = await supabase
        .from('reservation_statuses')
        .update({ is_active: false })
        .eq('id', id);

      if (error) {
        console.error('[operationalStatusService] deactivateStatus error', error);
        throw error;
      }

      console.log('[operationalStatusService] deactivateStatus success', { id });
    } catch (error) {
      console.error('[operationalStatusService] deactivateStatus exception', error);
      throw error;
    }
  },

  /**
   * Activate a status (set is_active = true)
   */
  async activateStatus(id: string): Promise<void> {
    try {
      console.log('[operationalStatusService] activateStatus start', { id });

      const { error } = await supabase
        .from('reservation_statuses')
        .update({ is_active: true })
        .eq('id', id);

      if (error) {
        console.error('[operationalStatusService] activateStatus error', error);
        throw error;
      }

      console.log('[operationalStatusService] activateStatus success', { id });
    } catch (error) {
      console.error('[operationalStatusService] activateStatus exception', error);
      throw error;
    }
  },

  /**
   * Delete a status (physical delete - use with caution)
   */
  async deleteStatus(id: string): Promise<void> {
    try {
      console.log('[operationalStatusService] deleteStatus start', { id });

      const { error } = await supabase
        .from('reservation_statuses')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('[operationalStatusService] deleteStatus error', error);
        throw error;
      }

      console.log('[operationalStatusService] deleteStatus success', { id });
    } catch (error) {
      console.error('[operationalStatusService] deleteStatus exception', error);
      throw error;
    }
  },
};