import { supabase } from '../lib/supabase';
import type { Client, ClientFormData, ClientRules, ClientRulesFormData, ClientDock, ClientProviderPayload } from '../types/client';
import type { Dock } from '../types/dock';

export const clientsService = {
  async listClients(orgId: string, search?: string): Promise<Client[]> {
    console.log('[ClientsService] listClients', { orgId, search });

    let query = supabase
      .from('clients')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (search && search.trim()) {
      query = query.ilike('name', `%${search.trim()}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[ClientsService] listClients error', error);
      throw error;
    }

    return (data || []) as Client[];
  },

  async getClient(orgId: string, clientId: string): Promise<Client> {
    console.log('[ClientsService] getClient', { orgId, clientId });

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (error) {
      console.error('[ClientsService] getClient error', error);
      throw error;
    }

    if (!data) {
      throw new Error('Cliente no encontrado');
    }

    return data as Client;
  },

  async createClient(orgId: string, payload: ClientFormData): Promise<Client> {
    console.log('[ClientsService] createClient', { orgId, name: payload.name });

    const { data, error } = await supabase
      .from('clients')
      .insert({
        org_id: orgId,
        name: payload.name.trim(),
        legal_id: payload.legal_id?.trim() || null,
        email: payload.email?.trim() || null,
        phone: payload.phone?.trim() || null,
        address: payload.address?.trim() || null,
        notes: payload.notes?.trim() || null,
        is_active: payload.is_active
      })
      .select('*')
      .single();

    if (error) {
      console.error('[ClientsService] createClient error', error);
      throw error;
    }

    if (!data) throw new Error('No se pudo crear el cliente');
    return data as Client;
  },

  async updateClient(orgId: string, clientId: string, payload: ClientFormData): Promise<Client> {
    console.log('[ClientsService] updateClient', { orgId, clientId, name: payload.name });

    const { data, error } = await supabase
      .from('clients')
      .update({
        name: payload.name.trim(),
        legal_id: payload.legal_id?.trim() || null,
        email: payload.email?.trim() || null,
        phone: payload.phone?.trim() || null,
        address: payload.address?.trim() || null,
        notes: payload.notes?.trim() || null,
        is_active: payload.is_active,
        updated_at: new Date().toISOString()
      })
      .eq('id', clientId)
      .eq('org_id', orgId)
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('[ClientsService] updateClient error', error);
      throw error;
    }

    if (!data) throw new Error('No se pudo actualizar el cliente');
    return data as Client;
  },

  async disableClient(orgId: string, clientId: string): Promise<void> {
    console.log('[ClientsService] disableClient', { orgId, clientId });

    const { error } = await supabase
      .from('clients')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', clientId)
      .eq('org_id', orgId);

    if (error) {
      console.error('[ClientsService] disableClient error', error);
      throw error;
    }
  },

  async getClientRules(orgId: string, clientId: string): Promise<ClientRules> {
    console.log('[ClientsService] getClientRules', { orgId, clientId });

    const { data, error } = await supabase
      .from('client_rules')
      .select('*')
      .eq('client_id', clientId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (error) {
      console.error('[ClientsService] getClientRules error', error);
      throw error;
    }

    // Si no existe, crear una fila con valores por defecto
    if (!data) {
      console.log('[ClientsService] creating default client_rules');
      const { data: newData, error: insertError } = await supabase
        .from('client_rules')
        .insert({
          org_id: orgId,
          client_id: clientId,
          edit_cutoff_hours: 0,
          allow_all_docks: false,
          dock_allocation_mode: 'NONE'
        })
        .select('*')
        .single();

      if (insertError) {
        console.error('[ClientsService] create default rules error', insertError);
        throw insertError;
      }

      return newData as ClientRules;
    }

    return data as ClientRules;
  },

  async updateClientRules(orgId: string, clientId: string, patch: ClientRulesFormData): Promise<ClientRules> {
    console.log('[ClientsService] updateClientRules', { orgId, clientId, patch });

    // Primero verificar si existe
    const { data: existing } = await supabase
      .from('client_rules')
      .select('id')
      .eq('client_id', clientId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (!existing) {
      // Crear si no existe
      const { data, error } = await supabase
        .from('client_rules')
        .insert({
          org_id: orgId,
          client_id: clientId,
          edit_cutoff_hours: patch.edit_cutoff_hours,
          allow_all_docks: patch.allow_all_docks,
          dock_allocation_mode: patch.dock_allocation_mode
        })
        .select('*')
        .single();

      if (error) {
        console.error('[ClientsService] insert client_rules error', error);
        throw error;
      }

      return data as ClientRules;
    }

    // Actualizar si existe
    const { data, error } = await supabase
      .from('client_rules')
      .update({
        edit_cutoff_hours: patch.edit_cutoff_hours,
        allow_all_docks: patch.allow_all_docks,
        dock_allocation_mode: patch.dock_allocation_mode,
        updated_at: new Date().toISOString()
      })
      .eq('client_id', clientId)
      .eq('org_id', orgId)
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('[ClientsService] updateClientRules error', error);
      throw error;
    }

    if (!data) throw new Error('No se pudieron actualizar las reglas');
    return data as ClientRules;
  },

  async listDocks(orgId: string): Promise<Dock[]> {
    console.log('[ClientsService] listDocks', { orgId });

    const { data, error } = await supabase
      .from('docks')
      .select('*')
      .eq('org_id', orgId)
      .order('name', { ascending: true });

    if (error) {
      console.error('[ClientsService] listDocks error', error);
      throw error;
    }

    return (data || []) as Dock[];
  },

  async getClientDocks(orgId: string, clientId: string): Promise<string[]> {
    console.log('[ClientsService] getClientDocks', { orgId, clientId });

    const { data, error } = await supabase
      .from('client_docks')
      .select('dock_id')
      .eq('client_id', clientId)
      .eq('org_id', orgId);

    if (error) {
      console.error('[ClientsService] getClientDocks error', error);
      throw error;
    }

    return (data || []).map((row) => row.dock_id);
  },

  async setClientDocks(orgId: string, clientId: string, dockIds: string[]): Promise<void> {
    console.log('[ClientsService] setClientDocks', { orgId, clientId, dockIds });

    // Obtener los docks actuales
    const currentDockIds = await this.getClientDocks(orgId, clientId);

    // Calcular diferencias
    const toAdd = dockIds.filter((id) => !currentDockIds.includes(id));
    const toRemove = currentDockIds.filter((id) => !dockIds.includes(id));

    console.log('[ClientsService] setClientDocks diff', { toAdd, toRemove });

    // Eliminar los que ya no están
    if (toRemove.length > 0) {
      const { error: deleteError } = await supabase
        .from('client_docks')
        .delete()
        .eq('client_id', clientId)
        .eq('org_id', orgId)
        .in('dock_id', toRemove);

      if (deleteError) {
        console.error('[ClientsService] delete client_docks error', deleteError);
        throw deleteError;
      }
    }

    // Agregar los nuevos
    if (toAdd.length > 0) {
      const rows = toAdd.map((dockId) => ({
        org_id: orgId,
        client_id: clientId,
        dock_id: dockId
      }));

      const { error: insertError } = await supabase
        .from('client_docks')
        .insert(rows);

      if (insertError) {
        console.error('[ClientsService] insert client_docks error', insertError);
        throw insertError;
      }
    }
  },

  async getClientProviders(orgId: string, clientId: string): Promise<{ provider_id: string; is_default: boolean }[]> {
    console.log('[ClientsService] getClientProviders', { orgId, clientId });

    const { data, error } = await supabase
      .from('client_providers')
      .select('provider_id, is_default')
      .eq('client_id', clientId)
      .eq('org_id', orgId);

    if (error) {
      console.error('[ClientsService] getClientProviders error', error);
      throw error;
    }

    return data || [];
  },

  async setClientProviders(orgId: string, clientId: string, providers: ClientProviderPayload[]): Promise<void> {
    console.log('[ClientsService] setClientProviders', { orgId, clientId, providers });

    // Validar que solo haya un default
    const defaultCount = providers.filter(p => p.is_default).length;
    if (defaultCount > 1) {
      throw new Error('Solo puede haber un proveedor por defecto');
    }

    // Obtener proveedores actuales
    const current = await this.getClientProviders(orgId, clientId);
    const currentProviderIds = current.map(p => p.provider_id);
    const newProviderIds = providers.map(p => p.provider_id);

    // Calcular diferencias
    const toAdd = providers.filter(p => !currentProviderIds.includes(p.provider_id));
    const toRemove = currentProviderIds.filter(id => !newProviderIds.includes(id));
    const toUpdate = providers.filter(p => {
      const existing = current.find(c => c.provider_id === p.provider_id);
      return existing && existing.is_default !== (p.is_default || false);
    });

    console.log('[ClientsService] setClientProviders diff', { toAdd, toRemove, toUpdate });

    // Usar transacción implícita con múltiples operaciones
    try {
      // Eliminar los que ya no están
      if (toRemove.length > 0) {
        const { error: deleteError } = await supabase
          .from('client_providers')
          .delete()
          .eq('client_id', clientId)
          .eq('org_id', orgId)
          .in('provider_id', toRemove);

        if (deleteError) {
          console.error('[ClientsService] delete client_providers error', deleteError);
          throw deleteError;
        }
      }

      // Agregar los nuevos
      if (toAdd.length > 0) {
        const rows = toAdd.map((p) => ({
          org_id: orgId,
          client_id: clientId,
          provider_id: p.provider_id,
          is_default: p.is_default || false
        }));

        const { error: insertError } = await supabase
          .from('client_providers')
          .insert(rows);

        if (insertError) {
          console.error('[ClientsService] insert client_providers error', insertError);
          throw insertError;
        }
      }

      // Actualizar los que cambiaron is_default
      for (const p of toUpdate) {
        const { error: updateError } = await supabase
          .from('client_providers')
          .update({ is_default: p.is_default || false })
          .eq('client_id', clientId)
          .eq('org_id', orgId)
          .eq('provider_id', p.provider_id);

        if (updateError) {
          console.error('[ClientsService] update client_providers error', updateError);
          throw updateError;
        }
      }
    } catch (error) {
      console.error('[ClientsService] setClientProviders transaction error', error);
      throw error;
    }
  }
};
