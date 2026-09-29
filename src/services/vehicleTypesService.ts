import { supabase } from '../lib/supabase';
import type { VehicleType } from '../types/catalog';

/**
 * Servicio del catálogo "Tipos de Vehículo".
 * Sigue el mismo patrón que cargoTypesService, con alcance por almacén.
 */
export const vehicleTypesService = {
  async getAll(orgId: string): Promise<VehicleType[]> {
    const { data, error } = await supabase
      .from('vehicle_types')
      .select('*')
      .eq('org_id', orgId)
      .order('name', { ascending: true });

    if (error) throw error;
    return (data || []) as VehicleType[];
  },

  async getActive(orgId: string): Promise<VehicleType[]> {
    const { data, error } = await supabase
      .from('vehicle_types')
      .select('*')
      .eq('org_id', orgId)
      .eq('active', true)
      .order('name', { ascending: true });

    if (error) throw error;
    return (data || []) as VehicleType[];
  },

  /**
   * Obtener tipos de vehículo filtrados por almacén activo.
   * Si warehouseId es null → devuelve todos los de la org (acceso global).
   */
  async getByWarehouse(orgId: string, warehouseId: string | null, activeOnly = false): Promise<VehicleType[]> {
    if (!warehouseId) {
      return activeOnly ? this.getActive(orgId) : this.getAll(orgId);
    }

    const { data: vtwRows, error: vtwErr } = await supabase
      .from('vehicle_type_warehouses')
      .select('vehicle_type_id')
      .eq('org_id', orgId)
      .eq('warehouse_id', warehouseId);

    if (vtwErr) throw vtwErr;

    const vehicleTypeIds = (vtwRows ?? []).map((r: any) => r.vehicle_type_id as string);

    if (vehicleTypeIds.length === 0) return [];

    let query = supabase
      .from('vehicle_types')
      .select('*')
      .eq('org_id', orgId)
      .in('id', vehicleTypeIds)
      .order('name', { ascending: true });

    if (activeOnly) {
      query = query.eq('active', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as VehicleType[];
  },

  /**
   * Obtener los warehouse IDs asignados a un tipo de vehículo.
   */
  async getVehicleTypeWarehouses(orgId: string, vehicleTypeId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('vehicle_type_warehouses')
      .select('warehouse_id')
      .eq('org_id', orgId)
      .eq('vehicle_type_id', vehicleTypeId);

    if (error) throw error;
    return (data ?? []).map((r: any) => r.warehouse_id as string);
  },

  /**
   * Asignar un tipo de vehículo a uno o varios almacenes (reemplaza asignaciones previas).
   */
  async setVehicleTypeWarehouses(orgId: string, vehicleTypeId: string, warehouseIds: string[]): Promise<void> {
    const { error: delErr } = await supabase
      .from('vehicle_type_warehouses')
      .delete()
      .eq('org_id', orgId)
      .eq('vehicle_type_id', vehicleTypeId);

    if (delErr) throw delErr;

    if (warehouseIds.length === 0) return;

    const { error: insErr } = await supabase
      .from('vehicle_type_warehouses')
      .insert(warehouseIds.map(wid => ({ org_id: orgId, vehicle_type_id: vehicleTypeId, warehouse_id: wid })));

    if (insErr) throw insErr;
  },

  async create(orgId: string, name: string): Promise<VehicleType> {
    const { data, error } = await supabase
      .from('vehicle_types')
      .insert({ org_id: orgId, name, active: true })
      .select()
      .single();

    if (error) throw error;
    return data as VehicleType;
  },

  async update(id: string, updates: Partial<Pick<VehicleType, 'name' | 'active'>>): Promise<VehicleType> {
    const { data, error } = await supabase
      .from('vehicle_types')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as VehicleType;
  },

  async deleteVehicleType(id: string): Promise<void> {
    const { error } = await supabase
      .from('vehicle_types')
      .update({ active: false })
      .eq('id', id);
    if (error) throw error;
  },
};