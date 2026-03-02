import { supabase } from '../lib/supabase';
import type { CargoType } from '../types/catalog';

export const cargoTypesService = {
  async getAll(orgId: string): Promise<CargoType[]> {
    console.log('[CargoTypes] Fetching cargo types', { orgId });
    
    const { data, error } = await supabase
      .from('cargo_types')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[CargoTypes] Error fetching cargo types', { error, message: error.message, details: error.details, hint: error.hint });
      throw error;
    }

    console.log('[CargoTypes] Fetched', { count: data?.length || 0 });
    return data || [];
  },

  async getActive(orgId: string): Promise<CargoType[]> {
    console.log('[CargoTypes] Fetching active cargo types', { orgId });
    
    const { data, error } = await supabase
      .from('cargo_types')
      .select('*')
      .eq('org_id', orgId)
      .eq('active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('[CargoTypes] Error fetching active cargo types', { error, message: error.message, details: error.details, hint: error.hint });
      throw error;
    }

    console.log('[CargoTypes] Fetched active', { count: data?.length || 0 });
    return data || [];
  },

  async create(orgId: string, name: string, defaultMinutes?: number): Promise<CargoType> {
    console.log('[CargoTypes] Creating', { orgId, name, defaultMinutes });
    
    const { data, error } = await supabase
      .from('cargo_types')
      .insert({
        org_id: orgId,
        name,
        default_minutes: defaultMinutes,
        active: true
      })
      .select()
      .single();

    if (error) {
      console.error('[CargoTypes] Error creating', { error, message: error.message, details: error.details, hint: error.hint });
      throw error;
    }

    console.log('[CargoTypes] Created', { id: data.id });
    return data;
  },

  // Alias para compatibilidad con CargoTypeModal
  async createCargoType(orgId: string, name: string, defaultMinutes?: number | null, isDynamic?: boolean): Promise<CargoType> {
    console.log('[CargoTypes] Creating cargo type', { orgId, name, defaultMinutes, isDynamic });
    
    // Payload exacto que se va a insertar
    const payload = {
      org_id: orgId,
      name,
      default_minutes: defaultMinutes || undefined,
      is_dynamic: isDynamic || false,
      active: true
    };
    
    console.log('[CargoTypes] INSERT payload:', JSON.stringify(payload, null, 2));
    
    const { data, error } = await supabase
      .from('cargo_types')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('[CargoTypes] Error creating cargo type', { 
        error, 
        message: error.message, 
        details: error.details, 
        hint: error.hint,
        code: error.code 
      });
      
      // Detectar error de schema cache
      if (error.code === 'PGRST204' || error.message?.includes('could not find') || error.message?.includes('schema cache')) {
        const cacheError = new Error('Schema cache desactualizado. Por favor, recargue el schema cache de Supabase API desde el dashboard.');
        console.error('[CargoTypes] ⚠️ SCHEMA CACHE ERROR:', cacheError.message);
        throw cacheError;
      }
      
      throw error;
    }

    console.log('[CargoTypes] Cargo type created', { id: data.id });
    return data;
  },

  async update(id: string, updates: Partial<Pick<CargoType, 'name' | 'default_minutes' | 'active'>>): Promise<CargoType> {
    console.log('[CargoTypes] Updating', { id, updates });
    
    const { data, error } = await supabase
      .from('cargo_types')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[CargoTypes] Error updating', { error, message: error.message, details: error.details, hint: error.hint });
      throw error;
    }

    console.log('[CargoTypes] Updated', { id: data.id });
    return data;
  },

  // Alias para compatibilidad con CargoTypeModal
  async updateCargoType(id: string, updates: Partial<Pick<CargoType, 'name' | 'default_minutes' | 'is_dynamic' | 'is_active'>>): Promise<CargoType> {
    console.log('[CargoTypes] Updating cargo type', { id, updates });
    
    // Mapeo correcto: is_active del modal → active en la tabla
    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.default_minutes !== undefined) updateData.default_minutes = updates.default_minutes;
    if (updates.is_dynamic !== undefined) updateData.is_dynamic = updates.is_dynamic;
    if (updates.is_active !== undefined) updateData.active = updates.is_active; // ✅ Mapeo correcto
    
    console.log('[CargoTypes] UPDATE payload:', JSON.stringify(updateData, null, 2));
    
    const { data, error } = await supabase
      .from('cargo_types')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[CargoTypes] Error updating cargo type', { 
        error, 
        message: error.message, 
        details: error.details, 
        hint: error.hint,
        code: error.code 
      });
      
      // Detectar error de schema cache
      if (error.code === 'PGRST204' || error.message?.includes('could not find') || error.message?.includes('schema cache')) {
        const cacheError = new Error('Schema cache desactualizado. Por favor, recargue el schema cache de Supabase API desde el dashboard.');
        console.error('[CargoTypes] ⚠️ SCHEMA CACHE ERROR:', cacheError.message);
        throw cacheError;
      }
      
      throw error;
    }

    console.log('[CargoTypes] Cargo type updated', { id: data.id });
    return data;
  },

  async softDelete(id: string): Promise<void> {
    console.log('[CargoTypes] Soft deleting', { id });
    
    const { error } = await supabase
      .from('cargo_types')
      .update({ active: false })
      .eq('id', id);

    if (error) {
      console.error('[CargoTypes] Error soft deleting', { error, message: error.message, details: error.details, hint: error.hint });
      throw error;
    }

    console.log('[CargoTypes] Deleted', { id });
  }
};

// Log de métodos disponibles para diagnóstico
console.log('[CargoTypesService] methods', Object.keys(cargoTypesService));
