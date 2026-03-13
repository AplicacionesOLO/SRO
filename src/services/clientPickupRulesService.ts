import { supabase } from '../lib/supabase';
import type { ClientPickupRule, ClientPickupRuleFormData } from '../types/client';

/**
 * Invoca la Edge Function para generar bloques de Cliente Retira.
 * No lanza error si falla — la operación principal ya se completó.
 */
async function triggerBlockGeneration(orgId: string, ruleId?: string): Promise<void> {
  try {
    const body: { org_id: string; days_ahead: number; rule_id?: string } = {
      org_id: orgId,
      days_ahead: 30,
    };

    if (ruleId) {
      body.rule_id = ruleId;
    }

    console.log('[ClientPickupRules] triggerBlockGeneration:start', { orgId, ruleId, body });

    const { data, error } = await supabase.functions.invoke('generate-client-pickup-blocks', {
      body,
    });

    if (error) {
      console.error('[ClientPickupRules] triggerBlockGeneration:invoke_error', { error, orgId, ruleId });
    } else {
      console.log('[ClientPickupRules] triggerBlockGeneration:success', { response: data, orgId, ruleId });
    }
  } catch (err) {
    console.error('[ClientPickupRules] triggerBlockGeneration:catch', { err, orgId, ruleId });
  }
}

/**
 * Lista todas las reglas de Cliente Retira para un cliente específico
 */
export async function listByClient(
  orgId: string,
  clientId: string
): Promise<ClientPickupRule[]> {
  const { data, error } = await supabase
    .from('client_pickup_rules')
    .select('*')
    .eq('org_id', orgId)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []) as ClientPickupRule[];
}

/**
 * Obtiene todas las reglas activas de Cliente Retira para un cliente
 */
export async function getActiveByClient(
  orgId: string,
  clientId: string
): Promise<ClientPickupRule[]> {
  const { data, error } = await supabase
    .from('client_pickup_rules')
    .select('*')
    .eq('org_id', orgId)
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []) as ClientPickupRule[];
}

/**
 * Crea una nueva regla de Cliente Retira
 */
export async function create(
  orgId: string,
  clientId: string,
  payload: ClientPickupRuleFormData
): Promise<ClientPickupRule> {
  if (!orgId) {
    throw new Error('orgId es requerido');
  }

  if (!clientId) {
    throw new Error('clientId es requerido');
  }

  if (!payload.dock_id) {
    throw new Error('Debes seleccionar un andén');
  }

  if (payload.block_minutes <= 0) {
    throw new Error('El tiempo de bloqueo debe ser mayor a 0 minutos');
  }

  if (payload.reblock_before_minutes < 0) {
    throw new Error('El tiempo de renovación no puede ser negativo');
  }

  const { data, error } = await supabase
    .from('client_pickup_rules')
    .insert({
      org_id: orgId,
      client_id: clientId,
      dock_id: payload.dock_id,
      block_minutes: payload.block_minutes,
      reblock_before_minutes: payload.reblock_before_minutes,
      is_active: payload.is_active,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('Ya existe una regla activa para este cliente y andén');
    }
    throw error;
  }

  if (!data) {
    throw new Error('No se pudo crear la regla');
  }

  await triggerBlockGeneration(orgId, data.id);

  return data as ClientPickupRule;
}

/**
 * Actualiza una regla existente
 */
export async function update(
  orgId: string,
  ruleId: string,
  payload: Partial<ClientPickupRuleFormData>
): Promise<ClientPickupRule> {
  if (!orgId) {
    throw new Error('orgId es requerido');
  }

  if (!ruleId) {
    throw new Error('ruleId es requerido');
  }

  if (payload.block_minutes !== undefined && payload.block_minutes <= 0) {
    throw new Error('El tiempo de bloqueo debe ser mayor a 0 minutos');
  }

  if (
    payload.reblock_before_minutes !== undefined &&
    payload.reblock_before_minutes < 0
  ) {
    throw new Error('El tiempo de renovación no puede ser negativo');
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (payload.dock_id !== undefined) {
    updateData.dock_id = payload.dock_id;
  }

  if (payload.block_minutes !== undefined) {
    updateData.block_minutes = payload.block_minutes;
  }

  if (payload.reblock_before_minutes !== undefined) {
    updateData.reblock_before_minutes = payload.reblock_before_minutes;
  }

  if (payload.is_active !== undefined) {
    updateData.is_active = payload.is_active;
  }

  const { data, error } = await supabase
    .from('client_pickup_rules')
    .update(updateData)
    .eq('org_id', orgId)
    .eq('id', ruleId)
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      throw new Error('Ya existe una regla activa para este cliente y andén');
    }
    throw error;
  }

  if (!data) {
    throw new Error('No se pudo actualizar la regla');
  }

  await triggerBlockGeneration(orgId, data.id);

  return data as ClientPickupRule;
}

/**
 * Desactiva una regla (soft delete)
 */
export async function deactivate(
  orgId: string,
  ruleId: string
): Promise<void> {
  if (!orgId) {
    throw new Error('orgId es requerido');
  }

  if (!ruleId) {
    throw new Error('ruleId es requerido');
  }

  const { error } = await supabase
    .from('client_pickup_rules')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', orgId)
    .eq('id', ruleId);

  if (error) {
    throw error;
  }
}

/**
 * Activa una regla previamente desactivada
 */
export async function activate(
  orgId: string,
  ruleId: string
): Promise<ClientPickupRule> {
  if (!orgId) {
    throw new Error('orgId es requerido');
  }

  if (!ruleId) {
    throw new Error('ruleId es requerido');
  }

  const { data, error } = await supabase
    .from('client_pickup_rules')
    .update({
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', orgId)
    .eq('id', ruleId)
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      throw new Error('Ya existe una regla activa para este cliente y andén');
    }
    throw error;
  }

  if (!data) {
    throw new Error('No se pudo activar la regla');
  }

  await triggerBlockGeneration(orgId, data.id);

  return data as ClientPickupRule;
}

/**
 * Elimina permanentemente una regla
 */
export async function deleteRule(
  orgId: string,
  ruleId: string
): Promise<void> {
  if (!orgId) {
    throw new Error('orgId es requerido');
  }

  if (!ruleId) {
    throw new Error('ruleId es requerido');
  }

  const { error } = await supabase
    .from('client_pickup_rules')
    .delete()
    .eq('org_id', orgId)
    .eq('id', ruleId);

  if (error) {
    throw error;
  }
}