import { supabase } from '../lib/supabase';
import type { Provider } from '../types/catalog';

export const providersService = {
  async getAll(orgId: string): Promise<Provider[]> {
    //console.log('[providersService] ========== FETCHING ALL PROVIDERS ==========');
    //console.log('[providersService] Query params:', { orgId, filterActive: false });
    
    const { data, error } = await supabase
      .from('providers')
      .select('id, org_id, name, active, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      // console.error('[providersService] ❌ ERROR fetching all providers', { 
      //   error, 
      //   message: error.message, 
      //   details: error.details, 
      //   hint: error.hint,
      //   code: error.code
      // });
      throw error;
    }

    //console.log('[providersService] ✅ Query successful');
    /**console.log('[providersService] Result:', { 
      count: data?.length || 0,
      firstRow: data && data.length > 0 ? {
        id: data[0].id,
        name: data[0].name,
        org_id: data[0].org_id,
        active: data[0].active
      } : null
    });*/
    //console.log('[providersService] ================================================');
    
    return data || [];
  },

  async getActive(orgId: string): Promise<Provider[]> {
    //console.log('[providersService] ========== FETCHING ACTIVE PROVIDERS ==========');
    //console.log('[providersService] Query params:', { orgId, filterActive: true });
    
    const { data, error } = await supabase
      .from('providers')
      .select('id, org_id, name, active, created_at')
      .eq('org_id', orgId)
      .eq('active', true)
      .order('name', { ascending: true });

    if (error) {
      // console.error('[providersService] ❌ ERROR fetching active providers', { 
      //   error, 
      //   message: error.message, 
      //   details: error.details, 
      //   hint: error.hint,
      //   code: error.code
      // });
      throw error;
    }

    //console.log('[providersService] ✅ Query successful');
    /**console.log('[providersService] Result:', { 
      count: data?.length || 0,
      firstRow: data && data.length > 0 ? {
        id: data[0].id,
        name: data[0].name,
        org_id: data[0].org_id,
        active: data[0].active
      } : null
    });*/
    //console.log('[providersService] ================================================');
    
    return data || [];
  },

  async createProvider(orgId: string, name: string): Promise<Provider> {
    //console.log('[providersService] Creating provider:', { orgId, name });
    
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
      // console.error('[providersService] ❌ ERROR creating provider', { 
      //   error, 
      //   message: error.message, 
      //   details: error.details, 
      //   hint: error.hint,
      //   code: error.code
      // });
      throw error;
    }

    //console.log('[providersService] ✅ Provider created:', { id: data.id, name: data.name });
    return data;
  },

  async updateProvider(id: string, updates: Partial<Pick<Provider, 'name' | 'active'>>): Promise<Provider> {
    //console.log('[providersService] Updating provider:', { id, updates });
    
    const { data, error } = await supabase
      .from('providers')
      .update(updates)
      .eq('id', id)
      .select('id, org_id, name, active, created_at')
      .single();

    if (error) {
      // console.error('[providersService] ❌ ERROR updating provider', { 
      //   error, 
      //   message: error.message, 
      //   details: error.details, 
      //   hint: error.hint,
      //   code: error.code
      // });
      throw error;
    }

    //console.log('[providersService] ✅ Provider updated:', { id: data.id });
    return data;
  },

  async deleteProvider(id: string): Promise<void> {
    //console.log('[providersService] Soft deleting provider:', { id });
    
    const { error } = await supabase
      .from('providers')
      .update({ active: false })
      .eq('id', id);

    if (error) {
      // console.error('[providersService] ❌ ERROR soft deleting provider', { 
      //   error, 
      //   message: error.message, 
      //   details: error.details, 
      //   hint: error.hint,
      //   code: error.code
      // });
      throw error;
    }

    //console.log('[providersService] ✅ Provider soft deleted:', { id });
  },

  /**
   * Obtener proveedores filtrados por almacén activo.
   * Si warehouseId es null → devuelve todos los de la org (acceso global).
   */
  async getByWarehouse(orgId: string, warehouseId: string | null, activeOnly = false): Promise<Provider[]> {
    if (!warehouseId) {
      // Acceso global: devolver todos
      return activeOnly ? this.getActive(orgId) : this.getAll(orgId);
    }

    // Obtener IDs de proveedores asignados a este almacén
    const { data: pwRows, error: pwErr } = await supabase
      .from('provider_warehouses')
      .select('provider_id')
      .eq('org_id', orgId)
      .eq('warehouse_id', warehouseId);

    if (pwErr) throw pwErr;

    const providerIds = (pwRows ?? []).map((r: any) => r.provider_id as string);

    if (providerIds.length === 0) return [];

    let query = supabase
      .from('providers')
      .select('id, org_id, name, active, created_at')
      .eq('org_id', orgId)
      .in('id', providerIds)
      .order('name', { ascending: true });

    if (activeOnly) {
      query = query.eq('active', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  /**
   * Obtener los warehouse IDs asignados a un proveedor.
   */
  async getProviderWarehouses(orgId: string, providerId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('provider_warehouses')
      .select('warehouse_id')
      .eq('org_id', orgId)
      .eq('provider_id', providerId);

    if (error) throw error;
    return (data ?? []).map((r: any) => r.warehouse_id as string);
  },

  /**
   * Asignar un proveedor a uno o varios almacenes (reemplaza asignaciones previas).
   */
  async setProviderWarehouses(orgId: string, providerId: string, warehouseIds: string[]): Promise<void> {
    // Eliminar asignaciones previas
    const { error: delErr } = await supabase
      .from('provider_warehouses')
      .delete()
      .eq('org_id', orgId)
      .eq('provider_id', providerId);

    if (delErr) throw delErr;

    if (warehouseIds.length === 0) return;

    const { error: insErr } = await supabase
      .from('provider_warehouses')
      .insert(warehouseIds.map(wid => ({ org_id: orgId, provider_id: providerId, warehouse_id: wid })));

    if (insErr) throw insErr;
  },

  /**
   * Agregar un proveedor a un almacén específico (sin reemplazar otros).
   */
  async addProviderToWarehouse(orgId: string, providerId: string, warehouseId: string): Promise<void> {
    const { error } = await supabase
      .from('provider_warehouses')
      .upsert({ org_id: orgId, provider_id: providerId, warehouse_id: warehouseId }, {
        onConflict: 'org_id,provider_id,warehouse_id'
      });
    if (error) throw error;
  },
};