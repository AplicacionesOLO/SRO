import { supabase } from '../lib/supabase';

/**
 * Servicio genérico para leer/escribir configuraciones de la organización.
 * Usa la tabla org_settings con clave-valor (jsonb).
 *
 * Clave usada para estados bloqueados: 'blocked_status_ids'
 * Valor esperado: { status_ids: string[] }
 */

export const ORG_SETTINGS_KEYS = {
  BLOCKED_STATUS_IDS: 'blocked_status_ids',
} as const;

export interface BlockedStatusSetting {
  status_ids: string[];
}

export const orgSettingsService = {
  /**
   * Lee el valor de una clave de configuración para la org.
   * Retorna null si no existe.
   */
  async get<T = unknown>(orgId: string, key: string): Promise<T | null> {
    const { data, error } = await supabase
      .from('org_settings')
      .select('value')
      .eq('org_id', orgId)
      .eq('key', key)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return data.value as T;
  },

  /**
   * Guarda (upsert) el valor de una clave de configuración.
   */
  async set<T = unknown>(orgId: string, key: string, value: T): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuario no autenticado');

    const { error } = await supabase
      .from('org_settings')
      .upsert(
        {
          org_id: orgId,
          key,
          value: value as any,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id,key' }
      );

    if (error) throw error;
  },

  /**
   * Lee la lista de status_ids bloqueados para la org.
   * Retorna array vacío si no hay configuración.
   */
  async getBlockedStatusIds(orgId: string): Promise<string[]> {
    const setting = await this.get<BlockedStatusSetting>(orgId, ORG_SETTINGS_KEYS.BLOCKED_STATUS_IDS);
    return setting?.status_ids ?? [];
  },

  /**
   * Guarda la lista de status_ids bloqueados para la org.
   */
  async setBlockedStatusIds(orgId: string, statusIds: string[]): Promise<void> {
    await this.set<BlockedStatusSetting>(orgId, ORG_SETTINGS_KEYS.BLOCKED_STATUS_IDS, {
      status_ids: statusIds,
    });
  },
};
