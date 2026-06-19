import { supabase } from '../lib/supabase';
import type { OrigenProveedor } from '../types/origenProveedor';

export const origenProveedoresService = {
  async list(orgId: string): Promise<OrigenProveedor[]> {
    const { data, error } = await supabase
      .from('origen_proveedores')
      .select('id, org_id, source_code, client_id, description, is_active, created_at, updated_at')
      .eq('org_id', orgId)
      .order('source_code', { ascending: true });

    if (error) throw error;
    return (data ?? []) as OrigenProveedor[];
  },

  async getById(orgId: string, id: string): Promise<OrigenProveedor> {
    const { data, error } = await supabase
      .from('origen_proveedores')
      .select('id, org_id, source_code, client_id, description, is_active, created_at, updated_at')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Origen no encontrado');
    return data as OrigenProveedor;
  },

  async create(
    orgId: string,
    source_code: string,
    client_id: string | null,
    description: string | null,
  ): Promise<OrigenProveedor> {
    const normalizedCode = source_code.trim().toUpperCase();

    const { data, error } = await supabase
      .from('origen_proveedores')
      .insert({
        org_id: orgId,
        source_code: normalizedCode,
        client_id: client_id || null,
        description: description?.trim() || null,
        is_active: true,
      })
      .select('id, org_id, source_code, client_id, description, is_active, created_at, updated_at')
      .single();

    if (error) throw error;
    return data as OrigenProveedor;
  },

  async update(
    id: string,
    updates: {
      source_code?: string;
      client_id?: string | null;
      description?: string | null;
      is_active?: boolean;
    },
  ): Promise<OrigenProveedor> {
    const normalized: Record<string, unknown> = {};
    if (updates.source_code !== undefined) normalized.source_code = updates.source_code.trim().toUpperCase();
    if (updates.client_id !== undefined) normalized.client_id = updates.client_id || null;
    if (updates.description !== undefined) normalized.description = updates.description?.trim() || null;
    if (updates.is_active !== undefined) normalized.is_active = updates.is_active;

    const { data, error } = await supabase
      .from('origen_proveedores')
      .update(normalized)
      .eq('id', id)
      .select('id, org_id, source_code, client_id, description, is_active, created_at, updated_at')
      .single();

    if (error) throw error;
    return data as OrigenProveedor;
  },

  async toggleActive(id: string, is_active: boolean): Promise<void> {
    const { error } = await supabase
      .from('origen_proveedores')
      .update({ is_active })
      .eq('id', id);

    if (error) throw error;
  },
};