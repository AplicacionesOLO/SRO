// FILE: src/services/timeProfilesService.ts
import { supabase } from '../lib/supabase';
import type { ProviderCargoTimeProfile } from '../types/catalog';

export const timeProfilesService = {
  async getAll(orgId: string): Promise<ProviderCargoTimeProfile[]> {
    console.log('[TimeProfiles] Fetching time profiles', { orgId });

    const { data, error } = await supabase
      .from('provider_cargo_time_profiles')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[TimeProfiles] Error fetching time profiles', {
        error,
        message: (error as any)?.message,
        details: (error as any)?.details,
        hint: (error as any)?.hint,
      });
      throw error;
    }

    console.log('[TimeProfiles] Fetched', { count: data?.length || 0 });
    return data || [];
  },

  // ✅ UPSERT: si ya existe (org_id,provider_id,cargo_type_id), actualiza en vez de fallar
  async create(
    orgId: string,
    providerId: string,
    cargoTypeId: string,
    avgMinutes: number
  ): Promise<ProviderCargoTimeProfile> {
    console.log('[TimeProfiles] Upserting(create)', { orgId, providerId, cargoTypeId, avgMinutes });

    const avg = Number(avgMinutes);

    const { data, error } = await supabase
      .from('provider_cargo_time_profiles')
      .upsert(
        {
          org_id: orgId,
          provider_id: providerId,
          cargo_type_id: cargoTypeId,
          avg_minutes: avg,
          source: 'manual',
        },
        {
          onConflict: 'org_id,provider_id,cargo_type_id',
        }
      )
      .select('*')
      .single();

    if (error) {
      console.error('[TimeProfiles] Error upserting(create)', {
        error,
        message: (error as any)?.message,
        details: (error as any)?.details,
        hint: (error as any)?.hint,
      });
      throw error;
    }

    console.log('[TimeProfiles] Upserted(create)', { id: data.id });
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

    console.log('[TimeProfiles] Updating', { orgId, id, updates: safeUpdates });

    const { data, error } = await supabase
      .from('provider_cargo_time_profiles')
      .update(safeUpdates)
      .eq('id', id)
      .eq('org_id', orgId)
      .select('*')
      .single();

    if (error) {
      console.error('[TimeProfiles] Error updating', {
        error,
        message: (error as any)?.message,
        details: (error as any)?.details,
        hint: (error as any)?.hint,
      });
      throw error;
    }

    console.log('[TimeProfiles] Updated', { id: data.id });
    return data;
  },

  async delete(orgId: string, id: string): Promise<void> {
    console.log('[TimeProfiles] Deleting', { orgId, id });

    const { error } = await supabase
      .from('provider_cargo_time_profiles')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId);

    if (error) {
      console.error('[TimeProfiles] Error deleting', {
        error,
        message: (error as any)?.message,
        details: (error as any)?.details,
        hint: (error as any)?.hint,
      });
      throw error;
    }

    console.log('[TimeProfiles] Deleted', { id });
  },

  // ✅ Nombre alineado con tu ReservationModal: getMatchingProfile(...)
  async getMatchingProfile(
    orgId: string,
    providerId: string,
    cargoTypeId: string
  ): Promise<ProviderCargoTimeProfile | null> {
    console.log('[TimeProfiles] getMatchingProfile', { orgId, providerId, cargoTypeId });

    const { data, error } = await supabase
      .from('provider_cargo_time_profiles')
      .select('*')
      .eq('org_id', orgId)
      .eq('provider_id', providerId)
      .eq('cargo_type_id', cargoTypeId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[TimeProfiles] Error getMatchingProfile', {
        error,
        message: (error as any)?.message,
        details: (error as any)?.details,
        hint: (error as any)?.hint,
      });
      throw error;
    }

    console.log('[TimeProfiles] getMatchingProfile result', { found: !!data, avgMinutes: data?.avg_minutes });
    return data;
  },

  // (Opcional) alias por compatibilidad si en algún lado llamás findMatchingProfile
  async findMatchingProfile(
    orgId: string,
    providerId: string,
    cargoTypeId: string
  ): Promise<ProviderCargoTimeProfile | null> {
    return this.getMatchingProfile(orgId, providerId, cargoTypeId);
  },
};

