import { supabase } from '../lib/supabase';
import type { ActivityLog } from '../types/activityLog';

export const activityLogService = {
  /**
   * Obtener logs de actividad para una entidad específica
   */
  async getActivityLogs(
    orgId: string,
    entityType: string,
    entityId: string,
    orderAsc: boolean = false
  ): Promise<ActivityLog[]> {
    // ✅ Validación de parámetros
    if (!orgId || !entityId) {
      // console.error('[ActivityLogService] ❌ Missing required params', {
      //   orgId,
      //   entityType,
      //   entityId
      // });
      throw new Error('Falta orgId o reservationId');
    }

    /**console.log('[ActivityLogService] 🔍 Fetching activity logs', {
      orgId,
      entityType,
      entityId,
      orderAsc
    });*/

    // ✅ Query EXACTO sin join primero
    const query = supabase
      .from('activity_log')
      .select('*')
      .eq('org_id', orgId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: orderAsc });

    /**console.log('[ActivityLogService] 📊 Query filters', {
      table: 'activity_log',
      filters: {
        org_id: orgId,
        entity_type: entityType,
        entity_id: entityId
      },
      order: orderAsc ? 'ASC' : 'DESC'
    });*/

    const { data, error } = await query;

    if (error) {
      // console.error('[ActivityLogService] ❌ Error fetching logs:', {
      //   code: error.code,
      //   message: error.message,
      //   details: error.details,
      //   hint: error.hint
      // });
      throw error;
    }

    /**console.log('[ActivityLogService] ✅ Logs fetched', {
      count: data?.length || 0,
      firstLog: data?.[0] || null
    });*/

    // ✅ Resolver actor_user_id → nombre.
    //    Se usa la función segura get_actor_labels (SECURITY DEFINER) para que
    //    cualquier rol pueda ver el nombre del autor, sin depender de la RLS de profiles.
    if (data && data.length > 0) {
      const actorIds = [...new Set(data.map(log => log.actor_user_id).filter(Boolean))] as string[];

      if (actorIds.length > 0) {
        const { data: labels, error: labelsError } = await supabase.rpc('get_actor_labels', {
          _actor_ids: actorIds,
        });

        if (!labelsError && labels) {
          const labelsMap = new Map(
            (labels as Array<{ id: string; name: string }>).map(p => [p.id, {
              id: p.id,
              name: p.name || 'Usuario',
            }])
          );

          return data.map(log => ({
            ...log,
            actor: log.actor_user_id ? (labelsMap.get(log.actor_user_id) ?? null) : null
          }));
        }

        // Fallback: select directo (puede fallar por RLS en roles restringidos)
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, name, email')
          .in('id', actorIds);

        if (!profilesError) {
          const profilesMap = new Map(
            (profiles || []).map(p => [p.id, {
              id: p.id,
              name: p.name || p.email || 'Usuario',
              email: p.email
            }])
          );

          return data.map(log => ({
            ...log,
            actor: log.actor_user_id ? (profilesMap.get(log.actor_user_id) ?? null) : null
          }));
        }
      }
    }

    return data || [];
  },

  /**
   * Traduce una lista de IDs de estado a { nombre, color } usando una función
   * segura (SECURITY DEFINER). Funciona para cualquier rol, sin depender de la
   * RLS de reservation_statuses, y solo devuelve los IDs solicitados.
   */
  async resolveStatusLabels(
    orgId: string,
    statusIds: string[]
  ): Promise<Array<{ id: string; name: string; color: string }>> {
    if (!orgId || !statusIds || statusIds.length === 0) return [];

    try {
      const { data, error } = await supabase.rpc('get_status_labels', {
        _org_id: orgId,
        _status_ids: statusIds,
      });

      if (error) return [];
      return (data || []) as Array<{ id: string; name: string; color: string }>;
    } catch {
      return [];
    }
  },

  /**
   * Escribir una entrada de actividad desde el frontend.
   * No bloqueante: si falla, no interrumpe el flujo principal.
   */
  async writeLog(entry: {
    orgId: string;
    entityType: string;
    entityId: string;
    action: string;
    field?: string | null;
    oldValue?: string | null;
    newValue?: string | null;
    metadata?: Record<string, any> | null;
  }): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from('activity_log').insert({
      org_id: entry.orgId,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      action: entry.action,
      field: entry.field ?? null,
      old_value: entry.oldValue ?? null,
      new_value: entry.newValue ?? null,
      metadata: entry.metadata ?? null,
      actor_user_id: user?.id ?? null,
    });

    if (error) {
      // Silencioso — no fallar el flujo principal
    }
  }
};