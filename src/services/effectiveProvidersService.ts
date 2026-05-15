import { supabase } from '../lib/supabase';

export type ProviderOrigin = 'individual' | 'cluster' | 'both';

export interface EffectiveProvider {
  provider_id: string;
  provider_name: string;
  origin: ProviderOrigin;
  cluster_names: string[];
}

export interface EffectiveSummary {
  providers: EffectiveProvider[];
  individual_count: number;
  cluster_count: number;
  total_unique: number;
}

/**
 * Calcula los proveedores efectivos de un usuario para un cliente dado.
 *
 * Proveedores individuales = user_providers ∩ client_providers del cliente.
 * Proveedores por cluster = user_provider_clusters → provider_cluster_items → providers.
 *
 * La intersección user_providers ∩ client_providers garantiza que se muestren
 * solo proveedores relevantes para ese cliente, sin necesidad de agregar client_id
 * a la tabla user_providers.
 */
export async function getEffectiveProviders(
  orgId: string,
  userId: string,
  clientId: string
): Promise<EffectiveSummary> {
  // 1. Proveedores del cliente
  const { data: cpRows, error: cpErr } = await supabase
    .from('client_providers')
    .select('provider_id')
    .eq('org_id', orgId)
    .eq('client_id', clientId);

  if (cpErr) throw cpErr;

  const clientProviderIds = new Set((cpRows ?? []).map((r: any) => r.provider_id as string));

  // 2. Proveedores individuales del usuario (intersección con client_providers)
  const { data: upRows, error: upErr } = await supabase
    .from('user_providers')
    .select('provider_id, providers!user_providers_provider_id_fkey(id, name, active)')
    .eq('org_id', orgId)
    .eq('user_id', userId);

  if (upErr) throw upErr;

  const individualMap = new Map<string, string>(); // provider_id → name

  for (const row of (upRows ?? []) as any[]) {
    if (
      row.providers?.active !== false &&
      clientProviderIds.has(row.provider_id)
    ) {
      individualMap.set(row.provider_id, row.providers.name);
    }
  }

  // 3. Clusters asignados al usuario para este cliente
  const { data: upcRows, error: upcErr } = await supabase
    .from('user_provider_clusters')
    .select('cluster_id, provider_clusters!user_provider_clusters_cluster_id_fkey(id, name, is_active)')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('client_id', clientId);

  if (upcErr) throw upcErr;

  const clusterIds = (upcRows ?? []).map((r: any) => r.cluster_id as string);
  const clusterNameMap = new Map<string, string>(); // cluster_id → cluster_name

  for (const row of (upcRows ?? []) as any[]) {
    clusterNameMap.set(row.cluster_id, row.provider_clusters?.name ?? '');
  }

  // 4. Proveedores de los clusters asignados
  const clusterProviderMap = new Map<string, string[]>(); // provider_id → [cluster_names]

  if (clusterIds.length > 0) {
    const { data: pciRows, error: pciErr } = await supabase
      .from('provider_cluster_items')
      .select('cluster_id, provider_id, providers!provider_cluster_items_provider_id_fkey(id, name, active)')
      .in('cluster_id', clusterIds);

    if (pciErr) throw pciErr;

    for (const row of (pciRows ?? []) as any[]) {
      if (row.providers?.active === false) continue;
      const pid = row.provider_id as string;
      const clusterName = clusterNameMap.get(row.cluster_id) ?? '';
      if (!clusterProviderMap.has(pid)) {
        clusterProviderMap.set(pid, []);
      }
      clusterProviderMap.get(pid)!.push(clusterName);
      // Register provider name if not already known
      if (!individualMap.has(pid) && row.providers?.name) {
        // We'll track names separately
      }
    }

    // Re-fetch names for cluster-only providers
    const allClusterProviderIds = [...clusterProviderMap.keys()];
    if (allClusterProviderIds.length > 0) {
      const { data: pNames, error: pNamesErr } = await supabase
        .from('providers')
        .select('id, name')
        .in('id', allClusterProviderIds);

      if (pNamesErr) throw pNamesErr;

      for (const p of (pNames ?? []) as any[]) {
        if (!individualMap.has(p.id)) {
          clusterProviderMap.set(p.id, clusterProviderMap.get(p.id) ?? []);
        }
      }

      // Build name lookup
      const nameById = new Map<string, string>();
      for (const p of (pNames ?? []) as any[]) {
        nameById.set(p.id, p.name);
      }

      // Build effective providers
      const effectiveMap = new Map<string, EffectiveProvider>();

      // Add individual providers
      for (const [pid, pname] of individualMap) {
        effectiveMap.set(pid, {
          provider_id: pid,
          provider_name: pname,
          origin: 'individual',
          cluster_names: [],
        });
      }

      // Merge cluster providers
      for (const [pid, cnames] of clusterProviderMap) {
        if (effectiveMap.has(pid)) {
          // Already in individual — mark as 'both'
          const existing = effectiveMap.get(pid)!;
          existing.origin = 'both';
          existing.cluster_names = [...new Set(cnames)];
        } else {
          effectiveMap.set(pid, {
            provider_id: pid,
            provider_name: nameById.get(pid) ?? pid,
            origin: 'cluster',
            cluster_names: [...new Set(cnames)],
          });
        }
      }

      const providers = [...effectiveMap.values()].sort((a, b) =>
        a.provider_name.localeCompare(b.provider_name, 'es', { sensitivity: 'base' })
      );

      return {
        providers,
        individual_count: providers.filter((p) => p.origin === 'individual' || p.origin === 'both').length,
        cluster_count: providers.filter((p) => p.origin === 'cluster' || p.origin === 'both').length,
        total_unique: providers.length,
      };
    }
  }

  // No cluster providers — only individual
  const providers: EffectiveProvider[] = [...individualMap.entries()].map(([pid, pname]) => ({
    provider_id: pid,
    provider_name: pname,
    origin: 'individual' as ProviderOrigin,
    cluster_names: [],
  }));

  return {
    providers,
    individual_count: providers.length,
    cluster_count: 0,
    total_unique: providers.length,
  };
}

export const effectiveProvidersService = {
  getEffectiveProviders,
};