import { supabase } from '../lib/supabase';

export interface Cluster {
  id: string;
  org_id: string;
  client_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClusterWithStats extends Cluster {
  provider_count: number;
  user_count: number;
}

export interface ClusterProvider {
  id: string;
  name: string;
}

export interface ClientUser {
  user_id: string;
  name: string;
  email: string;
}

export interface UserClusterAssignment {
  id: string;
  cluster_id: string;
  cluster_name: string;
  cluster_description: string | null;
  is_active: boolean;
}

// ──────────────────────────────────────────────────────────
// Clusters CRUD
// ──────────────────────────────────────────────────────────

async function getClusters(orgId: string, clientId: string): Promise<ClusterWithStats[]> {
  const { data: clusters, error } = await supabase
    .from('provider_clusters')
    .select('*')
    .eq('org_id', orgId)
    .eq('client_id', clientId)
    .order('name', { ascending: true });

  if (error) throw error;
  if (!clusters || clusters.length === 0) return [];

  const clusterIds = clusters.map((c: Cluster) => c.id);

  // Contar proveedores por cluster
  const { data: itemRows, error: itemErr } = await supabase
    .from('provider_cluster_items')
    .select('cluster_id')
    .in('cluster_id', clusterIds);

  if (itemErr) throw itemErr;

  // Contar usuarios asignados por cluster
  const { data: userRows, error: userErr } = await supabase
    .from('user_provider_clusters')
    .select('cluster_id')
    .in('cluster_id', clusterIds);

  if (userErr) throw userErr;

  const providerCounts: Record<string, number> = {};
  const userCounts: Record<string, number> = {};

  for (const row of itemRows ?? []) {
    providerCounts[row.cluster_id] = (providerCounts[row.cluster_id] ?? 0) + 1;
  }
  for (const row of userRows ?? []) {
    userCounts[row.cluster_id] = (userCounts[row.cluster_id] ?? 0) + 1;
  }

  return (clusters as Cluster[]).map((c) => ({
    ...c,
    provider_count: providerCounts[c.id] ?? 0,
    user_count: userCounts[c.id] ?? 0,
  }));
}

async function createCluster(
  orgId: string,
  clientId: string,
  payload: { name: string; description?: string; created_by?: string }
): Promise<Cluster> {
  const { data, error } = await supabase
    .from('provider_clusters')
    .insert({
      org_id: orgId,
      client_id: clientId,
      name: payload.name.trim(),
      description: payload.description?.trim() || null,
      is_active: true,
      created_by: payload.created_by ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as Cluster;
}

async function updateCluster(
  orgId: string,
  clusterId: string,
  patch: { name?: string; description?: string | null; is_active?: boolean }
): Promise<Cluster> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.description !== undefined) updates.description = patch.description;
  if (patch.is_active !== undefined) updates.is_active = patch.is_active;

  const { data, error } = await supabase
    .from('provider_clusters')
    .update(updates)
    .eq('id', clusterId)
    .eq('org_id', orgId)
    .select('*')
    .single();

  if (error) throw error;
  return data as Cluster;
}

async function deleteCluster(orgId: string, clusterId: string): Promise<void> {
  const { error } = await supabase
    .from('provider_clusters')
    .delete()
    .eq('id', clusterId)
    .eq('org_id', orgId);

  if (error) throw error;
}

// ──────────────────────────────────────────────────────────
// Cluster items (providers inside a cluster)
// ──────────────────────────────────────────────────────────

async function getClusterProviders(orgId: string, clusterId: string): Promise<ClusterProvider[]> {
  const { data, error } = await supabase
    .from('provider_cluster_items')
    .select('provider_id, providers!provider_cluster_items_provider_id_fkey(id, name, active)')
    .eq('org_id', orgId)
    .eq('cluster_id', clusterId);

  if (error) throw error;

  return ((data ?? []) as any[])
    .filter((r) => r.providers?.active !== false)
    .map((r) => ({ id: r.providers.id, name: r.providers.name }));
}

async function setClusterProviders(
  orgId: string,
  clusterId: string,
  providerIds: string[]
): Promise<void> {
  // Delete all existing items for this cluster
  const { error: delErr } = await supabase
    .from('provider_cluster_items')
    .delete()
    .eq('org_id', orgId)
    .eq('cluster_id', clusterId);

  if (delErr) throw delErr;

  if (providerIds.length === 0) return;

  const { error: insErr } = await supabase
    .from('provider_cluster_items')
    .insert(
      providerIds.map((pid) => ({ org_id: orgId, cluster_id: clusterId, provider_id: pid }))
    );

  if (insErr) throw insErr;
}

// ──────────────────────────────────────────────────────────
// Users of a client
// ──────────────────────────────────────────────────────────

async function getClientUsers(orgId: string, clientId: string): Promise<ClientUser[]> {
  const { data, error } = await supabase
    .from('user_clients')
    .select('user_id, profiles!user_clients_user_id_fkey(id, name, email)')
    .eq('org_id', orgId)
    .eq('client_id', clientId);

  if (error) throw error;

  return ((data ?? []) as any[])
    .filter((r) => r.profiles)
    .map((r) => ({
      user_id: r.user_id,
      name: r.profiles.name ?? r.profiles.email ?? r.user_id,
      email: r.profiles.email ?? '',
    }));
}

// ──────────────────────────────────────────────────────────
// User ↔ Cluster assignments
// ──────────────────────────────────────────────────────────

async function getUserClusters(
  orgId: string,
  userId: string,
  clientId: string
): Promise<UserClusterAssignment[]> {
  const { data, error } = await supabase
    .from('user_provider_clusters')
    .select('id, cluster_id, provider_clusters!user_provider_clusters_cluster_id_fkey(id, name, description, is_active)')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('client_id', clientId);

  if (error) throw error;

  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    cluster_id: r.cluster_id,
    cluster_name: r.provider_clusters?.name ?? '',
    cluster_description: r.provider_clusters?.description ?? null,
    is_active: r.provider_clusters?.is_active ?? true,
  }));
}

async function assignClusterToUser(
  orgId: string,
  userId: string,
  clientId: string,
  clusterId: string,
  createdBy?: string
): Promise<void> {
  const { error } = await supabase
    .from('user_provider_clusters')
    .upsert(
      { org_id: orgId, user_id: userId, client_id: clientId, cluster_id: clusterId, created_by: createdBy ?? null },
      { onConflict: 'user_id,cluster_id' }
    );

  if (error) throw error;
}

async function removeClusterFromUser(
  orgId: string,
  userId: string,
  clusterId: string
): Promise<void> {
  const { error } = await supabase
    .from('user_provider_clusters')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('cluster_id', clusterId);

  if (error) throw error;
}

async function setUserClusters(
  orgId: string,
  userId: string,
  clientId: string,
  clusterIds: string[],
  createdBy?: string
): Promise<void> {
  // Fetch current assignments for this user+client
  const { data: current, error: fetchErr } = await supabase
    .from('user_provider_clusters')
    .select('cluster_id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('client_id', clientId);

  if (fetchErr) throw fetchErr;

  const currentIds = (current ?? []).map((r: any) => r.cluster_id as string);
  const toInsert = clusterIds.filter((id) => !currentIds.includes(id));
  const toDelete = currentIds.filter((id) => !clusterIds.includes(id));

  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from('user_provider_clusters')
      .delete()
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .in('cluster_id', toDelete);

    if (delErr) throw delErr;
  }

  if (toInsert.length > 0) {
    const { error: insErr } = await supabase
      .from('user_provider_clusters')
      .insert(
        toInsert.map((cid) => ({
          org_id: orgId,
          user_id: userId,
          client_id: clientId,
          cluster_id: cid,
          created_by: createdBy ?? null,
        }))
      );

    if (insErr) throw insErr;
  }
}

// ──────────────────────────────────────────────────────────
// Copy assignments between users
// ──────────────────────────────────────────────────────────

async function copyAssignments(
  orgId: string,
  sourceUserId: string,
  targetUserId: string,
  clientId: string,
  options: {
    copyClusters: boolean;
    copyIndividual: boolean;
    mode: 'add' | 'replace';
    createdBy?: string;
  }
): Promise<void> {
  if (options.mode === 'replace') {
    // Remove all current assignments for target user in this client
    if (options.copyClusters) {
      const { error } = await supabase
        .from('user_provider_clusters')
        .delete()
        .eq('org_id', orgId)
        .eq('user_id', targetUserId)
        .eq('client_id', clientId);
      if (error) throw error;
    }
    if (options.copyIndividual) {
      // Get client providers to know which individual assignments belong to this client
      const { data: cpRows, error: cpErr } = await supabase
        .from('client_providers')
        .select('provider_id')
        .eq('org_id', orgId)
        .eq('client_id', clientId);
      if (cpErr) throw cpErr;

      const clientProviderIds = (cpRows ?? []).map((r: any) => r.provider_id as string);
      if (clientProviderIds.length > 0) {
        const { error: delErr } = await supabase
          .from('user_providers')
          .delete()
          .eq('org_id', orgId)
          .eq('user_id', targetUserId)
          .in('provider_id', clientProviderIds);
        if (delErr) throw delErr;
      }
    }
  }

  // Copy clusters
  if (options.copyClusters) {
    const { data: sourceClusters, error: scErr } = await supabase
      .from('user_provider_clusters')
      .select('cluster_id')
      .eq('org_id', orgId)
      .eq('user_id', sourceUserId)
      .eq('client_id', clientId);
    if (scErr) throw scErr;

    const { data: targetClusters, error: tcErr } = await supabase
      .from('user_provider_clusters')
      .select('cluster_id')
      .eq('org_id', orgId)
      .eq('user_id', targetUserId)
      .eq('client_id', clientId);
    if (tcErr) throw tcErr;

    const targetClusterIds = new Set((targetClusters ?? []).map((r: any) => r.cluster_id));
    const toInsert = (sourceClusters ?? [])
      .map((r: any) => r.cluster_id as string)
      .filter((id) => !targetClusterIds.has(id));

    if (toInsert.length > 0) {
      const { error: insErr } = await supabase
        .from('user_provider_clusters')
        .insert(
          toInsert.map((cid) => ({
            org_id: orgId,
            user_id: targetUserId,
            client_id: clientId,
            cluster_id: cid,
            created_by: options.createdBy ?? null,
          }))
        );
      if (insErr) throw insErr;
    }
  }

  // Copy individual providers
  if (options.copyIndividual) {
    const { data: cpRows, error: cpErr } = await supabase
      .from('client_providers')
      .select('provider_id')
      .eq('org_id', orgId)
      .eq('client_id', clientId);
    if (cpErr) throw cpErr;

    const clientProviderIds = new Set((cpRows ?? []).map((r: any) => r.provider_id as string));

    const { data: sourceProviders, error: spErr } = await supabase
      .from('user_providers')
      .select('provider_id')
      .eq('org_id', orgId)
      .eq('user_id', sourceUserId);
    if (spErr) throw spErr;

    const { data: targetProviders, error: tpErr } = await supabase
      .from('user_providers')
      .select('provider_id')
      .eq('org_id', orgId)
      .eq('user_id', targetUserId);
    if (tpErr) throw tpErr;

    const targetProviderIds = new Set((targetProviders ?? []).map((r: any) => r.provider_id));

    const toInsert = (sourceProviders ?? [])
      .map((r: any) => r.provider_id as string)
      .filter((id) => clientProviderIds.has(id) && !targetProviderIds.has(id));

    if (toInsert.length > 0) {
      const { error: insErr } = await supabase
        .from('user_providers')
        .insert(
          toInsert.map((pid) => ({ org_id: orgId, user_id: targetUserId, provider_id: pid }))
        );
      if (insErr) throw insErr;
    }
  }
}

// ──────────────────────────────────────────────────────────
// Bulk import clusters from Excel data
// ──────────────────────────────────────────────────────────

export interface BulkImportGroup {
  name: string;
  description: string | null;
  providerIds: string[];
}

export interface BulkImportResult {
  created: number;
  updated: number;
  providersInserted: number;
  skipped: number;
}

async function bulkImportClusters(
  orgId: string,
  clientId: string,
  groups: BulkImportGroup[],
  existingMode: 'add' | 'replace' | 'skip',
  createdBy?: string
): Promise<BulkImportResult> {
  let created = 0;
  let updated = 0;
  let providersInserted = 0;
  let skipped = 0;

  // Fetch existing clusters for this client
  const { data: existingClusters, error: ecErr } = await supabase
    .from('provider_clusters')
    .select('id, name')
    .eq('org_id', orgId)
    .eq('client_id', clientId);

  if (ecErr) throw ecErr;

  const existingByName = new Map<string, string>(
    (existingClusters ?? []).map((c: any) => [c.name.trim().toLowerCase(), c.id as string])
  );

  for (const group of groups) {
    if (group.providerIds.length === 0) continue;

    const nameLower = group.name.trim().toLowerCase();
    const existingId = existingByName.get(nameLower);

    if (existingId) {
      // Cluster already exists
      if (existingMode === 'skip') {
        skipped++;
        continue;
      }

      if (existingMode === 'replace') {
        // Delete all items for this cluster
        const { error: delErr } = await supabase
          .from('provider_cluster_items')
          .delete()
          .eq('org_id', orgId)
          .eq('cluster_id', existingId);
        if (delErr) throw delErr;

        // Insert new items
        const { error: insErr } = await supabase
          .from('provider_cluster_items')
          .insert(group.providerIds.map((pid) => ({ org_id: orgId, cluster_id: existingId, provider_id: pid })));
        if (insErr) throw insErr;
        providersInserted += group.providerIds.length;
        updated++;
        continue;
      }

      // mode === 'add': fetch existing items, only insert new ones
      const { data: currentItems, error: ciErr } = await supabase
        .from('provider_cluster_items')
        .select('provider_id')
        .eq('org_id', orgId)
        .eq('cluster_id', existingId);
      if (ciErr) throw ciErr;

      const currentProviderIds = new Set((currentItems ?? []).map((r: any) => r.provider_id as string));
      const toInsert = group.providerIds.filter((pid) => !currentProviderIds.has(pid));

      if (toInsert.length > 0) {
        const { error: insErr } = await supabase
          .from('provider_cluster_items')
          .insert(toInsert.map((pid) => ({ org_id: orgId, cluster_id: existingId, provider_id: pid })));
        if (insErr) throw insErr;
        providersInserted += toInsert.length;
      }
      updated++;
    } else {
      // Create new cluster
      const { data: newCluster, error: cErr } = await supabase
        .from('provider_clusters')
        .insert({
          org_id: orgId,
          client_id: clientId,
          name: group.name.trim(),
          description: group.description,
          is_active: true,
          created_by: createdBy ?? null,
        })
        .select('id')
        .single();

      if (cErr) throw cErr;

      const newId = newCluster.id as string;
      existingByName.set(nameLower, newId);

      const { error: insErr } = await supabase
        .from('provider_cluster_items')
        .insert(group.providerIds.map((pid) => ({ org_id: orgId, cluster_id: newId, provider_id: pid })));
      if (insErr) throw insErr;

      providersInserted += group.providerIds.length;
      created++;
    }
  }

  return { created, updated, providersInserted, skipped };
}

// ──────────────────────────────────────────────────────────
// Export
// ──────────────────────────────────────────────────────────

export const clusterService = {
  getClusters,
  createCluster,
  updateCluster,
  deleteCluster,
  getClusterProviders,
  setClusterProviders,
  getClientUsers,
  getUserClusters,
  assignClusterToUser,
  removeClusterFromUser,
  setUserClusters,
  copyAssignments,
  bulkImportClusters,
};