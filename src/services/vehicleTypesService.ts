import { supabase } from '../lib/supabase';
import type { VehicleType } from '../types/catalog';

/**
 * Servicio del catálogo "Tipos de Vehículo".
 * Alcance por PAÍS: cada tipo pertenece a un país y solo es visible en los
 * almacenes de ese país. La visibilidad por almacén se resuelve a partir del
 * país del almacén (warehouses.country_id).
 */
export const vehicleTypesService = {
  async getAll(orgId: string, countryId?: string | null): Promise<VehicleType[]> {
    let query = supabase
      .from('vehicle_types')
      .select('*')
      .eq('org_id', orgId)
      .order('name', { ascending: true });

    if (countryId) {
      query = query.eq('country_id', countryId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as VehicleType[];
  },

  async getActive(orgId: string, countryId?: string | null): Promise<VehicleType[]> {
    let query = supabase
      .from('vehicle_types')
      .select('*')
      .eq('org_id', orgId)
      .eq('active', true)
      .order('name', { ascending: true });

    if (countryId) {
      query = query.eq('country_id', countryId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as VehicleType[];
  },

  /**
   * Obtener tipos de vehículo filtrados por país.
   */
  async getByCountry(orgId: string, countryId: string | null, activeOnly = false): Promise<VehicleType[]> {
    if (!countryId) {
      return activeOnly ? this.getActive(orgId) : this.getAll(orgId);
    }
    return activeOnly ? this.getActive(orgId, countryId) : this.getAll(orgId, countryId);
  },

  /**
   * Obtener tipos de vehículo visibles para un almacén.
   * Resuelve el país del almacén y devuelve solo los tipos de ese país.
   * Si warehouseId es null → devuelve todos los de la org (acceso global).
   */
  async getByWarehouse(orgId: string, warehouseId: string | null, activeOnly = false): Promise<VehicleType[]> {
    if (!warehouseId) {
      return activeOnly ? this.getActive(orgId) : this.getAll(orgId);
    }

    const { data: wh, error: whErr } = await supabase
      .from('warehouses')
      .select('country_id')
      .eq('id', warehouseId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (whErr) throw whErr;

    const countryId = (wh?.country_id as string | null) ?? null;
    if (!countryId) return [];

    return this.getByCountry(orgId, countryId, activeOnly);
  },

  async create(orgId: string, name: string, countryId: string): Promise<VehicleType> {
    const { data, error } = await supabase
      .from('vehicle_types')
      .insert({ org_id: orgId, name, country_id: countryId, active: true })
      .select()
      .single();

    if (error) throw error;
    return data as VehicleType;
  },

  async update(
    id: string,
    updates: Partial<Pick<VehicleType, 'name' | 'active' | 'country_id'>>,
  ): Promise<VehicleType> {
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