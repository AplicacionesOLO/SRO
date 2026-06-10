import { supabase } from '../lib/supabase';

export interface UserProvider {
  id: string;
  name: string;
}

export const userProvidersService = {
  /**
   * Obtiene los proveedores asignados a un usuario específico,
   * incluyendo tanto asignaciones directas como las que vienen por clusters.
   * @param orgId - ID de la organización
   * @param userId - ID del usuario
   * @returns Lista de proveedores activos asignados al usuario
   */
  async getUserProviders(orgId: string, userId: string): Promise<UserProvider[]> {
    const providerMap = new Map<string, string>(); // id → name

    // ── 1. Proveedores directos (user_providers) ──────────────────────
    const pageSize = 1000;
    let from = 0;

    while (true) {
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
        .eq('user_id', userId)
        .range(from, from + pageSize - 1);

      if (error) throw error;

      for (const row of (data ?? []) as any[]) {
        if (row.providers?.id) {
          providerMap.set(row.providers.id, row.providers.name);
        }
      }

      if ((data ?? []).length < pageSize) break;
      from += pageSize;
    }

    // ── 2. Proveedores por cluster (user_provider_clusters → provider_cluster_items) ──
    // user_provider_clusters tiene client_id, pero acá necesitamos TODOS los clusters
    // del usuario sin importar el cliente.
    let clusterFrom = 0;
    const allClusterRows: any[] = [];

    while (true) {
      const { data: upcData, error: upcErr } = await supabase
        .from('user_provider_clusters')
        .select('cluster_id')
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .range(clusterFrom, clusterFrom + pageSize - 1);

      if (upcErr) throw upcErr;

      allClusterRows.push(...(upcData ?? []));
      if ((upcData ?? []).length < pageSize) break;
      clusterFrom += pageSize;
    }

    if (allClusterRows.length > 0) {
      const clusterIds = [...new Set(allClusterRows.map((r: any) => r.cluster_id as string))];

      // Obtener provider_ids de los clusters (paginado)
      const clusterProviderIds = new Set<string>();
      let pciFrom = 0;

      while (true) {
        const { data: pciData, error: pciErr } = await supabase
          .from('provider_cluster_items')
          .select('provider_id')
          .in('cluster_id', clusterIds)
          .range(pciFrom, pciFrom + pageSize - 1);

        if (pciErr) throw pciErr;

        for (const row of (pciData ?? []) as any[]) {
          clusterProviderIds.add(row.provider_id);
        }

        if ((pciData ?? []).length < pageSize) break;
        pciFrom += pageSize;
      }

      // Filtrar los que ya tenemos del paso 1
      const missingIds = [...clusterProviderIds].filter((id) => !providerMap.has(id));

      if (missingIds.length > 0) {
        // Obtener nombres de los proveedores faltantes (paginado, todos — activos e inactivos)
        let provFrom = 0;
        while (true) {
          const { data: provData, error: provErr } = await supabase
            .from('providers')
            .select('id, name')
            .eq('org_id', orgId)
            .in('id', missingIds)
            .range(provFrom, provFrom + pageSize - 1);

          if (provErr) throw provErr;

          for (const row of (provData ?? []) as any[]) {
            if (!providerMap.has(row.id)) {
              providerMap.set(row.id, row.name);
            }
          }

          if ((provData ?? []).length < pageSize) break;
          provFrom += pageSize;
        }
      }
    }

    // ── 3. Resultado final ordenado ──────────────────────────────────
    return [...providerMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  },

  /**
   * Asigna proveedores a un usuario (diff inteligente: insert nuevos, delete removidos)
   * @param orgId - ID de la organización
   * @param userId - ID del usuario
   * @param providerIds - Array de IDs de proveedores a asignar
   */
  async setUserProviders(orgId: string, userId: string, providerIds: string[]): Promise<void> {
    // 1. Obtener proveedores actuales — paginado para evitar el límite implícito de 1000 filas.
    // Sin paginación, un usuario con 2291 asignaciones solo devuelve 1000, y el diff
    // calcula toInsert erróneamente con los 1291 "faltantes" → duplicate key en user_providers_unique.
    const pageSize = 1000;
    let from = 0;
    const currentRows: any[] = [];

    while (true) {
      const { data: pageData, error: fetchError } = await supabase
        .from('user_providers')
        .select('provider_id')
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .range(from, from + pageSize - 1);

      if (fetchError) throw fetchError;

      currentRows.push(...(pageData ?? []));
      if ((pageData ?? []).length < pageSize) break;
      from += pageSize;
    }

    const currentProviderIds = currentRows.map((up: any) => up.provider_id);

    // 2. Calcular diff
    const toInsert = providerIds.filter(id => !currentProviderIds.includes(id));
    const toDelete = currentProviderIds.filter(id => !providerIds.includes(id));

    // 3. Eliminar proveedores removidos
    if (toDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('user_providers')
        .delete()
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .in('provider_id', toDelete);

      if (deleteError) {
        throw deleteError;
      }
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
        throw insertError;
      }
    }
  }
};