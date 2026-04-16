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
    warehouseId?: string | null,
    baseMinutes?: number | null,
    minutesPerUnit?: number | null,
    secondsPerUnit?: number | null
  ): Promise<ProviderCargoTimeProfile> {
    const avg = Number(avgMinutes);

    const payload: any = {
      org_id: orgId,
      provider_id: providerId,
      cargo_type_id: cargoTypeId,
      avg_minutes: avg,
      source: 'manual',
    };

    if (warehouseId) payload.warehouse_id = warehouseId;
    if (baseMinutes !== undefined) payload.base_minutes = baseMinutes ?? null;
    if (minutesPerUnit !== undefined) payload.minutes_per_unit = minutesPerUnit ?? null;
    if (secondsPerUnit !== undefined) payload.seconds_per_unit = secondsPerUnit ?? null;

    const { data, error } = await supabase
      .from('provider_cargo_time_profiles')
      .upsert(payload, { onConflict: 'org_id,provider_id,cargo_type_id,warehouse_id' })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  // ✅ Update reforzado con orgId (más seguro con RLS)
  async update(
    orgId: string,
    id: string,
    updates: Partial<Pick<ProviderCargoTimeProfile, 'provider_id' | 'cargo_type_id' | 'avg_minutes' | 'base_minutes' | 'minutes_per_unit' | 'seconds_per_unit'>>
  ): Promise<ProviderCargoTimeProfile> {
    const safeUpdates: any = { ...updates };

    if (safeUpdates.avg_minutes !== undefined) {
      safeUpdates.avg_minutes = Number(safeUpdates.avg_minutes);
    }
    if (safeUpdates.base_minutes !== undefined) {
      safeUpdates.base_minutes = safeUpdates.base_minutes !== null ? Number(safeUpdates.base_minutes) : null;
    }
    if (safeUpdates.minutes_per_unit !== undefined) {
      safeUpdates.minutes_per_unit = safeUpdates.minutes_per_unit !== null ? Number(safeUpdates.minutes_per_unit) : null;
    }
    if (safeUpdates.seconds_per_unit !== undefined) {
      safeUpdates.seconds_per_unit = safeUpdates.seconds_per_unit !== null ? Number(safeUpdates.seconds_per_unit) : null;
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

  /**
   * Busca el perfil de tiempo más específico usando prioridad por almacén:
   *
   * Prioridad 1 — perfil con warehouse_id exacto (si se provee warehouseId)
   * Prioridad 2 — perfil sin warehouse_id (perfil global de la org para esa combinación)
   * Prioridad 3 — null (el modal cae al default del cargo_type o al override manual)
   *
   * Esto garantiza tiempos distintos por almacén sin romper perfiles globales existentes.
   */
  async getMatchingProfile(
    orgId: string,
    providerId: string,
    cargoTypeId: string,
    _startDatetime?: string,
    warehouseId?: string | null
  ): Promise<ProviderCargoTimeProfile | null> {
    // ── Paso 1: buscar perfil específico por almacén ─────────────────────
    if (warehouseId) {
      const { data: warehouseProfile, error: whErr } = await supabase
        .from('provider_cargo_time_profiles')
        .select('*')
        .eq('org_id', orgId)
        .eq('provider_id', providerId)
        .eq('cargo_type_id', cargoTypeId)
        .eq('warehouse_id', warehouseId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (whErr) throw whErr;
      if (warehouseProfile) return warehouseProfile;
    }

    // ── Paso 2: fallback a perfil global (sin warehouse_id) ──────────────
    const { data: globalProfile, error: globalErr } = await supabase
      .from('provider_cargo_time_profiles')
      .select('*')
      .eq('org_id', orgId)
      .eq('provider_id', providerId)
      .eq('cargo_type_id', cargoTypeId)
      .is('warehouse_id', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (globalErr) throw globalErr;
    return globalProfile;
  },

  async findMatchingProfile(
    orgId: string,
    providerId: string,
    cargoTypeId: string,
    warehouseId?: string | null
  ): Promise<ProviderCargoTimeProfile | null> {
    return this.getMatchingProfile(orgId, providerId, cargoTypeId, undefined, warehouseId);
  },
};
