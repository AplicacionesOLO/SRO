import { supabase } from '../lib/supabase';
import type { Provider } from '../types/catalog';

export const providersService = {
  async getAll(orgId: string): Promise<Provider[]> {
    const pageSize = 1000;
    let from = 0;
    let allProviders: Provider[] = [];

    while (true) {
      const { data, error } = await supabase
        .from('providers')
        .select('id, org_id, name, active, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      allProviders = allProviders.concat(data ?? []);
      if ((data ?? []).length < pageSize) break;
      from += pageSize;
    }

    return allProviders;
  },

  async getActive(orgId: string): Promise<Provider[]> {
    const pageSize = 1000;
    let from = 0;
    let allProviders: Provider[] = [];

    while (true) {
      const { data, error } = await supabase
        .from('providers')
        .select('id, org_id, name, active, created_at')
        .eq('org_id', orgId)
        .eq('active', true)
        .order('name', { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      allProviders = allProviders.concat(data ?? []);
      if ((data ?? []).length < pageSize) break;
      from += pageSize;
    }

    return allProviders;
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
   *
   * IMPORTANTE: usa !inner solo cuando hay warehouseId específico, para garantizar
   * que solo aparezcan proveedores realmente asignados a ese almacén.
   * Con warehouseId null devuelve todos (incluyendo los sin almacén asignado).
   */
  async getByWarehouse(orgId: string, warehouseId: string | null, activeOnly = false): Promise<Provider[]> {
    if (!warehouseId) {
      // Acceso global: devolver todos los proveedores de la org
      return activeOnly ? this.getActive(orgId) : this.getAll(orgId);
    }

    // JOIN directo con !inner: evita pasar cientos de IDs en la URL (causa 400 Bad Request)
    // y garantiza que solo aparezcan proveedores asignados a este almacén específico.
    // Paginado en bloques de 1000 para orgs con >1000 proveedores por almacén.
    const pageSize = 1000;
    let from = 0;
    let allProviders: Provider[] = [];

    while (true) {
      let query = supabase
        .from('providers')
        .select('id, org_id, name, active, created_at, provider_warehouses!inner(warehouse_id)')
        .eq('org_id', orgId)
        .eq('provider_warehouses.warehouse_id', warehouseId)
        .order('name', { ascending: true })
        .range(from, from + pageSize - 1);

      if (activeOnly) {
        query = query.eq('active', true);
      }

      const { data, error } = await query;
      if (error) throw error;

      const page = (data ?? []).map(({ provider_warehouses: _pw, ...p }: any) => p as Provider);
      allProviders = allProviders.concat(page);
      if (page.length < pageSize) break;
      from += pageSize;
    }

    return allProviders;
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