import { supabase } from '../lib/supabase';

export interface Country {
  id: string;
  org_id: string;
  code: string;
  name: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export const countriesService = {
  async getAll(orgId: string): Promise<Country[]> {
    console.log('[CountriesService] getAll', { orgId });

    try {
      const { data, error } = await supabase
        .from('countries')
        .select('id, org_id, code, name, is_active, created_at, updated_at')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) {
        console.error('[CountriesService] getAll error', {
          error,
          message: error.message,
          details: (error as any)?.details,
          hint: (error as any)?.hint
        });
        throw error;
      }

      return (data || []) as Country[];
    } catch (err) {
      console.error('[CountriesService] getAll catch', err);
      throw err;
    }
  },

  // ✅ Alias: algunas páginas llaman getCountries()
  async getCountries(orgId: string): Promise<Country[]> {
    return this.getAll(orgId);
  },

  async getActive(orgId: string): Promise<Country[]> {
    return this.getAll(orgId);
  },

  async create(orgId: string, name: string, code: string): Promise<Country> {
    const cleanName = name.trim();
    const cleanCode = code.trim().toUpperCase();

    if (!cleanName) throw new Error('El nombre del país es requerido');
    if (!cleanCode) throw new Error('El código del país es requerido');
    if (cleanCode.length < 2 || cleanCode.length > 3) {
      throw new Error('El código debe tener 2 o 3 caracteres');
    }

    console.log('[CountriesService] create', { orgId, name: cleanName, code: cleanCode });

    try {
      const { data, error } = await supabase
        .from('countries')
        .insert({
          org_id: orgId,
          name: cleanName,
          code: cleanCode,
          is_active: true
        })
        .select('id, org_id, code, name, is_active, created_at, updated_at')
        .single();

      if (error) {
        console.error('[CountriesService] create error', {
          error,
          message: error.message,
          details: (error as any)?.details,
          hint: (error as any)?.hint
        });
        if (error.code === '23505') {
          throw new Error('Ya existe un país con ese nombre o código');
        }
        throw error;
      }

      if (!data) throw new Error('No se pudo crear el país');
      return data as Country;
    } catch (err) {
      console.error('[CountriesService] create catch', err);
      throw err;
    }
  },

  async update(orgId: string, id: string, name: string, code: string): Promise<Country> {
    const cleanName = name.trim();
    const cleanCode = code.trim().toUpperCase();

    if (!cleanName) throw new Error('El nombre del país es requerido');
    if (!cleanCode) throw new Error('El código del país es requerido');
    if (cleanCode.length < 2 || cleanCode.length > 3) {
      throw new Error('El código debe tener 2 o 3 caracteres');
    }

    console.log('[CountriesService] update', { orgId, id, name: cleanName, code: cleanCode });

    try {
      const { data, error } = await supabase
        .from('countries')
        .update({
          name: cleanName,
          code: cleanCode,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('org_id', orgId)
        .select('id, org_id, code, name, is_active, created_at, updated_at')
        .single();

      if (error) {
        console.error('[CountriesService] update error', {
          error,
          message: error.message,
          details: (error as any)?.details,
          hint: (error as any)?.hint
        });
        if (error.code === '23505') {
          throw new Error('Ya existe un país con ese nombre o código');
        }
        throw error;
      }

      if (!data) throw new Error('No se pudo actualizar el país');
      return data as Country;
    } catch (err) {
      console.error('[CountriesService] update catch', err);
      throw err;
    }
  },

  async delete(orgId: string, id: string): Promise<void> {
    console.log('[CountriesService] delete (soft)', { orgId, id });

    try {
      const { error } = await supabase
        .from('countries')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('org_id', orgId);

      if (error) {
        console.error('[CountriesService] delete error', {
          error,
          message: error.message,
          details: (error as any)?.details,
          hint: (error as any)?.hint
        });
        throw error;
      }
    } catch (err) {
      console.error('[CountriesService] delete catch', err);
      throw err;
    }
  },

  async remove(orgId: string, id: string): Promise<void> {
    return this.delete(orgId, id);
  },

  async getById(orgId: string, id: string): Promise<Country | null> {
    console.log('[CountriesService] getById', { orgId, id });

    try {
      const { data, error } = await supabase
        .from('countries')
        .select('id, org_id, code, name, is_active, created_at, updated_at')
        .eq('id', id)
        .eq('org_id', orgId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        console.error('[CountriesService] getById error', {
          error,
          message: error.message,
          details: (error as any)?.details,
          hint: (error as any)?.hint
        });
        throw error;
      }

      return data as Country;
    } catch (err) {
      console.error('[CountriesService] getById catch', err);
      throw err;
    }
  }
};

