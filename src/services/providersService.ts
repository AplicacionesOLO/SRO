import { supabase } from '../lib/supabase';
import type { Provider } from '../types/catalog';

export const providersService = {
  async getAll(orgId: string): Promise<Provider[]> {
    console.log('[providersService] ========== FETCHING ALL PROVIDERS ==========');
    console.log('[providersService] Query params:', { orgId, filterActive: false });
    
    const { data, error } = await supabase
      .from('providers')
      .select('id, org_id, name, active, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[providersService] ❌ ERROR fetching all providers', { 
        error, 
        message: error.message, 
        details: error.details, 
        hint: error.hint,
        code: error.code
      });
      throw error;
    }

    console.log('[providersService] ✅ Query successful');
    console.log('[providersService] Result:', { 
      count: data?.length || 0,
      firstRow: data && data.length > 0 ? {
        id: data[0].id,
        name: data[0].name,
        org_id: data[0].org_id,
        active: data[0].active
      } : null
    });
    console.log('[providersService] ================================================');
    
    return data || [];
  },

  async getActive(orgId: string): Promise<Provider[]> {
    console.log('[providersService] ========== FETCHING ACTIVE PROVIDERS ==========');
    console.log('[providersService] Query params:', { orgId, filterActive: true });
    
    const { data, error } = await supabase
      .from('providers')
      .select('id, org_id, name, active, created_at')
      .eq('org_id', orgId)
      .eq('active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('[providersService] ❌ ERROR fetching active providers', { 
        error, 
        message: error.message, 
        details: error.details, 
        hint: error.hint,
        code: error.code
      });
      throw error;
    }

    console.log('[providersService] ✅ Query successful');
    console.log('[providersService] Result:', { 
      count: data?.length || 0,
      firstRow: data && data.length > 0 ? {
        id: data[0].id,
        name: data[0].name,
        org_id: data[0].org_id,
        active: data[0].active
      } : null
    });
    console.log('[providersService] ================================================');
    
    return data || [];
  },

  async createProvider(orgId: string, name: string): Promise<Provider> {
    console.log('[providersService] Creating provider:', { orgId, name });
    
    const { data, error } = await supabase
      .from('providers')
      .insert({
        org_id: orgId,
        name: name.trim(),
        active: true
      })
      .select('id, org_id, name, active, created_at')
      .single();

    if (error) {
      console.error('[providersService] ❌ ERROR creating provider', { 
        error, 
        message: error.message, 
        details: error.details, 
        hint: error.hint,
        code: error.code
      });
      throw error;
    }

    console.log('[providersService] ✅ Provider created:', { id: data.id, name: data.name });
    return data;
  },

  async updateProvider(id: string, updates: Partial<Pick<Provider, 'name' | 'active'>>): Promise<Provider> {
    console.log('[providersService] Updating provider:', { id, updates });
    
    const { data, error } = await supabase
      .from('providers')
      .update(updates)
      .eq('id', id)
      .select('id, org_id, name, active, created_at')
      .single();

    if (error) {
      console.error('[providersService] ❌ ERROR updating provider', { 
        error, 
        message: error.message, 
        details: error.details, 
        hint: error.hint,
        code: error.code
      });
      throw error;
    }

    console.log('[providersService] ✅ Provider updated:', { id: data.id });
    return data;
  },

  async deleteProvider(id: string): Promise<void> {
    console.log('[providersService] Soft deleting provider:', { id });
    
    const { error } = await supabase
      .from('providers')
      .update({ active: false })
      .eq('id', id);

    if (error) {
      console.error('[providersService] ❌ ERROR soft deleting provider', { 
        error, 
        message: error.message, 
        details: error.details, 
        hint: error.hint,
        code: error.code
      });
      throw error;
    }

    console.log('[providersService] ✅ Provider soft deleted:', { id });
  }
};
