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
      console.error('[ActivityLogService] ❌ Missing required params', {
        orgId,
        entityType,
        entityId
      });
      throw new Error('Falta orgId o reservationId');
    }

    console.log('[ActivityLogService] 🔍 Fetching activity logs', {
      orgId,
      entityType,
      entityId,
      orderAsc
    });

    // ✅ Query EXACTO sin join primero
    const query = supabase
      .from('activity_log')
      .select('*')
      .eq('org_id', orgId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: orderAsc });

    console.log('[ActivityLogService] 📊 Query filters', {
      table: 'activity_log',
      filters: {
        org_id: orgId,
        entity_type: entityType,
        entity_id: entityId
      },
      order: orderAsc ? 'ASC' : 'DESC'
    });

    const { data, error } = await query;

    if (error) {
      console.error('[ActivityLogService] ❌ Error fetching logs:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });
      throw error;
    }

    console.log('[ActivityLogService] ✅ Logs fetched', {
      count: data?.length || 0,
      firstLog: data?.[0] || null
    });

    // ✅ Opcional: resolver actor_user_id contra profiles (sin romper si falla)
    if (data && data.length > 0) {
      const actorIds = [...new Set(data.map(log => log.actor_user_id).filter(Boolean))];
      
      if (actorIds.length > 0) {
        console.log('[ActivityLogService] 🔍 Fetching actors', { actorIds });
        
        // ✅ Usar columnas reales: id, name, email
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, name, email')
          .in('id', actorIds);

        if (profilesError) {
          console.warn('[ActivityLogService] ⚠️ Could not fetch profiles (RLS?)', profilesError);
        } else {
          console.log('[ActivityLogService] ✅ Actors fetched', { count: profiles?.length || 0 });
          
          // ✅ Mapear actores a los logs con fallback: name || email || 'Usuario'
          const profilesMap = new Map(
            profiles?.map(p => [p.id, {
              id: p.id,
              name: p.name || p.email || 'Usuario',
              email: p.email
            }]) || []
          );
          
          return data.map(log => ({
            ...log,
            actor: log.actor_user_id ? profilesMap.get(log.actor_user_id) : null
          }));
        }
      }
    }

    return data || [];
  }
};
