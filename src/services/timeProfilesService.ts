// FILE: src/services/timeProfilesService.ts
import { supabase } from '../lib/supabase';
import type { ProviderCargoTimeProfile } from '../types/catalog';

export const timeProfilesService = {
  async getAll(orgId: string): Promise<ProviderCargoTimeProfile[]> {
    const { data, error } = await supabase
      .from('provider_cargo_time_profiles')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Obtener perfiles de tiempo filtrados por almacén activo.
   * Si warehouseId es null → devuelve todos los de la org.
   */
  async getByWarehouse(orgId: string, warehouseId: string | null): Promise<ProviderCargoTimeProfile[]> {
    let query = supabase
      .from('provider_cargo_time_profiles')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (warehouseId) {
      query = query.eq('warehouse_id', warehouseId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  // ✅ UPSERT: si ya existe (org_id,provider_id,cargo_type_id), actualiza en vez de fallar
  async create(
    orgId: string,
    providerId: string,
    cargoTypeId: string,
    avgMinutes: number,
    warehouseId?: string | null
  ): Promise<ProviderCargoTimeProfile> {
    const avg = Number(avgMinutes);

    const payload: any = {
      org_id: orgId,
      provider_id: providerId,
      cargo_type_id: cargoTypeId,
      avg_minutes: avg,
      source: 'manual',
    };

    if (warehouseId) {
      payload.warehouse_id = warehouseId;
    }

    const { data, error } = await supabase
      .from('provider_cargo_time_profiles')
      .upsert(payload, { onConflict: 'org_id,provider_id,cargo_type_id' })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  // ✅ Update reforzado con orgId (más seguro con RLS)
  async update(
    orgId: string,
    id: string,
    updates: Partial<Pick<ProviderCargoTimeProfile, 'provider_id' | 'cargo_type_id' | 'avg_minutes'>>
  ): Promise<ProviderCargoTimeProfile> {
    const safeUpdates: any = { ...updates };

    if (safeUpdates.avg_minutes !== undefined) {
      safeUpdates.avg_minutes = Number(safeUpdates.avg_minutes);
    }

    const { data, error } = await supabase
      .from('provider_cargo_time_profiles')
      .update(safeUpdates)
      .eq('id', id)
      .eq('org_id', orgId)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  async delete(orgId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from('provider_cargo_time_profiles')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId);

    if (error) throw error;
  },

  async getMatchingProfile(
    orgId: string,
    providerId: string,
    cargoTypeId: string
  ): Promise<ProviderCargoTimeProfile | null> {
    const { data, error } = await supabase
      .from('provider_cargo_time_profiles')
      .select('*')
      .eq('org_id', orgId)
      .eq('provider_id', providerId)
      .eq('cargo_type_id', cargoTypeId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async findMatchingProfile(
    orgId: string,
    providerId: string,
    cargoTypeId: string
  ): Promise<ProviderCargoTimeProfile | null> {
    return this.getMatchingProfile(orgId, providerId, cargoTypeId);
  },
};
