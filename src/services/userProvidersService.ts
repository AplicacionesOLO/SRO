import { supabase } from '../lib/supabase';

export interface UserProvider {
  id: string;
  name: string;
}

export const userProvidersService = {
  /**
   * Obtiene los proveedores asignados a un usuario específico
   * @param orgId - ID de la organización
   * @param userId - ID del usuario
   * @returns Lista de proveedores activos asignados al usuario
   */
  async getUserProviders(orgId: string, userId: string): Promise<UserProvider[]> {
    console.log('[userProvidersService] ========== FETCHING USER PROVIDERS ==========');
    console.log('[userProvidersService] Query params:', { orgId, userId });
    
    const { data, error } = await supabase
      .from('user_providers')
      .select(`
        provider_id,
        providers!user_providers_provider_id_fkey (
          id,
          name,
          active
        )
      `)
      .eq('org_id', orgId)
      .eq('user_id', userId);

    if (error) {
      console.error('[userProvidersService] ❌ ERROR fetching user providers', { 
        error, 
        message: error.message, 
        details: error.details, 
        hint: error.hint,
        code: error.code
      });
      throw error;
    }

    console.log('[userProvidersService] ✅ Query successful');
    console.log('[userProvidersService] Raw result:', { 
      count: data?.length || 0,
      firstRow: data && data.length > 0 ? data[0] : null
    });

    // Filtrar solo proveedores activos y mapear a formato simple
    const activeProviders = data
      ?.filter((up: any) => up.providers?.active === true)
      .map((up: any) => ({
        id: up.providers.id,
        name: up.providers.name
      })) || [];

    console.log('[userProvidersService] Filtered active providers:', { 
      count: activeProviders.length,
      providers: activeProviders
    });
    console.log('[userProvidersService] ================================================');
    
    return activeProviders;
  },

  /**
   * Asigna proveedores a un usuario (diff inteligente: insert nuevos, delete removidos)
   * @param orgId - ID de la organización
   * @param userId - ID del usuario
   * @param providerIds - Array de IDs de proveedores a asignar
   */
  async setUserProviders(orgId: string, userId: string, providerIds: string[]): Promise<void> {
    console.log('[userProvidersService] ========== SETTING USER PROVIDERS ==========');
    console.log('[userProvidersService] Params:', { orgId, userId, providerIds });

    // 1. Obtener proveedores actuales
    const { data: currentData, error: fetchError } = await supabase
      .from('user_providers')
      .select('provider_id')
      .eq('org_id', orgId)
      .eq('user_id', userId);

    if (fetchError) {
      console.error('[userProvidersService] ❌ ERROR fetching current providers', fetchError);
      throw fetchError;
    }

    const currentProviderIds = currentData?.map((up: any) => up.provider_id) || [];
    console.log('[userProvidersService] Current providers:', currentProviderIds);

    // 2. Calcular diff
    const toInsert = providerIds.filter(id => !currentProviderIds.includes(id));
    const toDelete = currentProviderIds.filter(id => !providerIds.includes(id));

    console.log('[userProvidersService] Diff:', { toInsert, toDelete });

    // 3. Eliminar proveedores removidos
    if (toDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('user_providers')
        .delete()
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .in('provider_id', toDelete);

      if (deleteError) {
        console.error('[userProvidersService] ❌ ERROR deleting providers', deleteError);
        throw deleteError;
      }

      console.log('[userProvidersService] ✅ Deleted providers:', toDelete.length);
    }

    // 4. Insertar nuevos proveedores
    if (toInsert.length > 0) {
      const insertData = toInsert.map(providerId => ({
        org_id: orgId,
        user_id: userId,
        provider_id: providerId
      }));

      const { error: insertError } = await supabase
        .from('user_providers')
        .insert(insertData);

      if (insertError) {
        console.error('[userProvidersService] ❌ ERROR inserting providers', insertError);
        throw insertError;
      }

      console.log('[userProvidersService] ✅ Inserted providers:', toInsert.length);
    }

    console.log('[userProvidersService] ✅ User providers updated successfully');
    console.log('[userProvidersService] ================================================');
  }
};
