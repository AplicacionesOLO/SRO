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
    const { data, error } = await supabase
      .from('warehouses')
      .select('id, org_id, name, location, country_id, business_start_time, business_end_time, slot_interval_minutes, timezone, no_show_tolerance_minutes, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return (data || []) as Warehouse[];
  },

  // Alias para compatibilidad con páginas que esperan getAll()
  async getAll(orgId: string): Promise<Warehouse[]> {
    return this.getWarehouses(orgId);
  },

  async createWarehouse(orgId: string, formData: WarehouseFormData): Promise<Warehouse> {
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
        slot_interval_minutes: formData.slot_interval_minutes || 60,
        timezone: formData.timezone || 'America/Costa_Rica',
        no_show_tolerance_minutes: formData.no_show_tolerance_minutes ?? null,
      })
      .select('id, org_id, name, location, country_id, business_start_time, business_end_time, slot_interval_minutes, timezone, no_show_tolerance_minutes, created_at')
      .single();

    if (error) {
      if (error.code === '23505' && error.message?.includes('warehouses_org_name_unique')) {
        throw new Error('Ya existe un almacén con ese nombre en tu organización');
      }
      throw error;
    }

    if (!data) throw new Error('No se pudo crear el almacén');
    return data as Warehouse;
  },

  async updateWarehouse(id: string, orgId: string, formData: WarehouseFormData): Promise<Warehouse> {
    if (!formData.country_id) throw new Error('El país es requerido');

    const { data, error } = await supabase
      .from('warehouses')
      .update({
        name: formData.name.trim(),
        location: formData.location?.trim() || null,
        country_id: formData.country_id,
        business_start_time: normalizeTime(formData.business_start_time, '06:00:00'),
        business_end_time: normalizeTime(formData.business_end_time, '17:00:00'),
        slot_interval_minutes: formData.slot_interval_minutes || 60,
        timezone: formData.timezone || 'America/Costa_Rica',
        no_show_tolerance_minutes: formData.no_show_tolerance_minutes ?? null,
      })
      .eq('id', id)
      .eq('org_id', orgId)
      .select('id, org_id, name, location, country_id, business_start_time, business_end_time, slot_interval_minutes, timezone, no_show_tolerance_minutes, created_at')
      .single();

    if (error) {
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
    const { error } = await supabase
      .from('warehouses')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId);

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('No tienes permisos para eliminar este almacén o no existe');
      }
      throw error;
    }
  },

  async getWarehouseClients(orgId: string, warehouseId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('warehouse_clients')
      .select('client_id')
      .eq('org_id', orgId)
      .eq('warehouse_id', warehouseId);

    if (error) {
      throw error;
    }

    return (data || []).map((row) => row.client_id);
  },

  async setWarehouseClients(orgId: string, warehouseId: string, clientIds: string[]): Promise<void> {
    try {
      const current = await this.getWarehouseClients(orgId, warehouseId);
      const currentSet = new Set(current);
      const newSet = new Set(clientIds);

      const toInsert = clientIds.filter((id) => !currentSet.has(id));
      const toDelete = current.filter((id) => !newSet.has(id));

      if (toDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('warehouse_clients')
          .delete()
          .eq('org_id', orgId)
          .eq('warehouse_id', warehouseId)
          .in('client_id', toDelete);

        if (deleteError) {
          throw deleteError;
        }
      }

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
          if (insertError.code === '23505') {
            throw new Error('Algunos clientes ya están asignados a este almacén');
          }
          throw insertError;
        }
      }
    } catch (error) {
      throw error;
    }
  }
};