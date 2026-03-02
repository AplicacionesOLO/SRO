import { supabase } from '../lib/supabase';
import type { Warehouse, WarehouseFormData } from '../types/warehouse';

const normalizeTime = (t?: string | null, fallback = '06:00:00') => {
  const value = (t || '').trim();
  if (!value) return fallback;
  if (/^\d{2}:\d{2}$/.test(value)) return `${value}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(value)) return value;
  return fallback;
};

export const warehousesService = {
  async getWarehouses(orgId: string): Promise<Warehouse[]> {
    console.log('[WarehousesService] getWarehouses', { orgId });

    const { data, error } = await supabase
      .from('warehouses')
      .select('id, org_id, name, location, country_id, business_start_time, business_end_time, slot_interval_minutes, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[WarehousesService] getWarehouses error', {
        error,
        message: error.message,
        details: (error as any).details,
        hint: (error as any).hint
      });
      throw error;
    }

    return (data || []) as Warehouse[];
  },

  // Alias para compatibilidad con páginas que esperan getAll()
  async getAll(orgId: string): Promise<Warehouse[]> {
    return this.getWarehouses(orgId);
  },

  async createWarehouse(orgId: string, formData: WarehouseFormData): Promise<Warehouse> {
    console.log('[WarehousesService] createWarehouse', { orgId, name: formData.name });

    if (!formData.country_id) throw new Error('El país es requerido');

    const { data, error } = await supabase
      .from('warehouses')
      .insert({
        org_id: orgId,
        name: formData.name.trim(),
        location: formData.location?.trim() || null,
        country_id: formData.country_id,
        business_start_time: normalizeTime(formData.business_start_time, '06:00:00'),
        business_end_time: normalizeTime(formData.business_end_time, '17:00:00'),
        slot_interval_minutes: formData.slot_interval_minutes || 60
      })
      .select('id, org_id, name, location, country_id, business_start_time, business_end_time, slot_interval_minutes, created_at')
      .single();

    if (error) {
      console.error('[WarehousesService] createWarehouse error', error);

      if (error.code === '23505' && error.message?.includes('warehouses_org_name_unique')) {
        throw new Error('Ya existe un almacén con ese nombre en tu organización');
      }

      throw error;
    }

    if (!data) throw new Error('No se pudo crear el almacén');
    return data as Warehouse;
  },

  async updateWarehouse(id: string, orgId: string, formData: WarehouseFormData): Promise<Warehouse> {
    console.log('[WarehousesService] updateWarehouse', { id, orgId, name: formData.name });

    if (!formData.country_id) throw new Error('El país es requerido');

    const { data, error } = await supabase
      .from('warehouses')
      .update({
        name: formData.name.trim(),
        location: formData.location?.trim() || null,
        country_id: formData.country_id,
        business_start_time: normalizeTime(formData.business_start_time, '06:00:00'),
        business_end_time: normalizeTime(formData.business_end_time, '17:00:00'),
        slot_interval_minutes: formData.slot_interval_minutes || 60
      })
      .eq('id', id)
      .eq('org_id', orgId)
      .select('id, org_id, name, location, country_id, business_start_time, business_end_time, slot_interval_minutes, created_at')
      .single();

    if (error) {
      console.error('[WarehousesService] updateWarehouse error', error);

      if (error.code === '23505' && error.message?.includes('warehouses_org_name_unique')) {
        throw new Error('Ya existe otro almacén con ese nombre en tu organización');
      }

      if (error.code === 'PGRST116') {
        throw new Error('No tienes permisos para actualizar este almacén o no existe');
      }

      throw error;
    }

    if (!data) throw new Error('No se pudo actualizar el almacén');
    return data as Warehouse;
  },

  async deleteWarehouse(id: string, orgId: string): Promise<void> {
    console.log('[WarehousesService] deleteWarehouse', { id, orgId });

    const { error } = await supabase
      .from('warehouses')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId);

    if (error) {
      console.error('[WarehousesService] deleteWarehouse error', error);

      if (error.code === 'PGRST116') {
        throw new Error('No tienes permisos para eliminar este almacén o no existe');
      }

      throw error;
    }
  },

  /**
   * Obtiene los IDs de clientes asignados a un almacén
   */
  async getWarehouseClients(orgId: string, warehouseId: string): Promise<string[]> {
    console.log('[WarehousesService] getWarehouseClients', { orgId, warehouseId });

    const { data, error } = await supabase
      .from('warehouse_clients')
      .select('client_id')
      .eq('org_id', orgId)
      .eq('warehouse_id', warehouseId);

    if (error) {
      console.error('[WarehousesService] getWarehouseClients error', error);
      throw error;
    }

    return (data || []).map((row) => row.client_id);
  },

  /**
   * Asigna clientes a un almacén (diff: inserta nuevos, elimina desmarcados)
   */
  async setWarehouseClients(orgId: string, warehouseId: string, clientIds: string[]): Promise<void> {
    console.log('[WarehousesService] setWarehouseClients', { orgId, warehouseId, clientIds });

    try {
      // 1. Obtener asignaciones actuales
      const current = await this.getWarehouseClients(orgId, warehouseId);
      const currentSet = new Set(current);
      const newSet = new Set(clientIds);

      // 2. Calcular diff
      const toInsert = clientIds.filter((id) => !currentSet.has(id));
      const toDelete = current.filter((id) => !newSet.has(id));

      console.log('[WarehousesService] setWarehouseClients diff', {
        current: current.length,
        new: clientIds.length,
        toInsert: toInsert.length,
        toDelete: toDelete.length,
      });

      // 3. Eliminar desmarcados
      if (toDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('warehouse_clients')
          .delete()
          .eq('org_id', orgId)
          .eq('warehouse_id', warehouseId)
          .in('client_id', toDelete);

        if (deleteError) {
          console.error('[WarehousesService] delete error', deleteError);
          throw deleteError;
        }
      }

      // 4. Insertar nuevos
      if (toInsert.length > 0) {
        const rows = toInsert.map((clientId) => ({
          org_id: orgId,
          warehouse_id: warehouseId,
          client_id: clientId,
        }));

        const { error: insertError } = await supabase
          .from('warehouse_clients')
          .insert(rows);

        if (insertError) {
          console.error('[WarehousesService] insert error', insertError);

          // Manejar duplicados (por si acaso)
          if (insertError.code === '23505') {
            throw new Error('Algunos clientes ya están asignados a este almacén');
          }

          throw insertError;
        }
      }

      console.log('[WarehousesService] setWarehouseClients success');
    } catch (error) {
      console.error('[WarehousesService] setWarehouseClients error', error);
      throw error;
    }
  }
};
