import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { clusterService, type UserClusterAssignment, type ClusterWithStats } from '@/services/clusterService';
import { effectiveProvidersService, type EffectiveProvider } from '@/services/effectiveProvidersService';
import type { Provider } from '@/types/catalog';

interface Props {
  orgId: string;
  userId: string;
  clientId: string;
  userName: string;
  userEmail: string;
  availableClusters: ClusterWithStats[];
  clientProviders: Provider[];
  createdBy?: string;
  onClose: () => void;
  onChanged: () => void;
}

type DrawerTab = 'clusters' | 'individual' | 'effective';

const originLabel: Record<string, string> = {
  individual: 'Individual',
  cluster: 'Por cluster',
  both: 'Ambos',
};
const originColor: Record<string, string> = {
  individual: 'bg-blue-50 text-blue-600',
  cluster: 'bg-teal-50 text-teal-600',
  both: 'bg-purple-50 text-purple-600',
};

export default function UserDetailDrawer({
  orgId,
  userId,
  clientId,
  userName,
  userEmail,
  availableClusters,
  clientProviders,
  createdBy,
  onClose,
  onChanged,
}: Props) {
  const [tab, setTab] = useState<DrawerTab>('clusters');
  const [assignedClusters, setAssignedClusters] = useState<UserClusterAssignment[]>([]);
  const [effectiveProviders, setEffectiveProviders] = useState<EffectiveProvider[]>([]);
  const [individualProviders, setIndividualProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  const [addingClusterId, setAddingClusterId] = useState('');
  const [addingProviderId, setAddingProviderId] = useState('');
  const [saving, setSaving] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [clusters, effective] = await Promise.all([
        clusterService.getUserClusters(orgId, userId, clientId),
        effectiveProvidersService.getEffectiveProviders(orgId, userId, clientId),
      ]);
      setAssignedClusters(clusters);
      setEffectiveProviders(effective.providers);
      // Individual = those with origin 'individual' or 'both'
      const indivIds = new Set(
        effective.providers
          .filter((p) => p.origin === 'individual' || p.origin === 'both')
          .map((p) => p.provider_id)
      );
      setIndividualProviders(clientProviders.filter((p) => indivIds.has(p.id)));
    } finally {
      setLoading(false);
    }
  }, [orgId, userId, clientId, clientProviders]);

  useEffect(() => { load(); }, [load]);

  // Clusters not yet assigned
  const assignedClusterIds = new Set(assignedClusters.map((c) => c.cluster_id));
  const unassignedClusters = availableClusters.filter(
    (c) => c.is_active && !assignedClusterIds.has(c.id)
  );

  // Individual providers not yet assigned
  const individualProviderIds = new Set(individualProviders.map((p) => p.id));
  const availableToAdd = clientProviders.filter(
    (p) => !individualProviderIds.has(p.id) &&
      p.name.toLowerCase().includes(providerSearch.toLowerCase())
  );

  async function handleRemoveCluster(clusterId: string) {
    setSaving(true);
    try {
      await clusterService.removeClusterFromUser(orgId, userId, clusterId);
      await load();
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function handleAddCluster() {
    if (!addingClusterId) return;
    setSaving(true);
    try {
      await clusterService.assignClusterToUser(orgId, userId, clientId, addingClusterId, createdBy ?? undefined);
      setAddingClusterId('');
      await load();
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function handleAddIndividual() {
    if (!addingProviderId) return;
    setSaving(true);
    try {
      await supabase.from('user_providers').upsert(
        { org_id: orgId, user_id: userId, provider_id: addingProviderId },
        { onConflict: 'org_id,user_id,provider_id' }
      );
      setAddingProviderId('');
      await load();
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveIndividual(providerId: string) {
    setSaving(true);
    try {
      await supabase.from('user_providers')
        .delete()
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .eq('provider_id', providerId);
      await load();
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  const initials = userName.trim().split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  const tabs: { id: DrawerTab; label: string; count?: number }[] = [
    { id: 'clusters', label: 'Clusters', count: assignedClusters.length },
    { id: 'individual', label: 'Individuales', count: individualProviders.length },
    { id: 'effective', label: 'Efectivos', count: effectiveProviders.length },
  ];

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white shadow-xl flex flex-col h-full">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Asignaciones del usuario</h2>
            <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer rounded-lg hover:bg-gray-100">
              <i className="ri-close-line text-lg"></i>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
              <span className="text-sm font-semibold text-teal-700">{initials}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">{userName}</p>
              <p className="text-xs text-gray-400">{userEmail}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                tab === t.id
                  ? 'border-teal-500 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
              {t.count !== undefined && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-500'}`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600"></div>
            </div>
          ) : (
            <>
              {/* Clusters tab */}
              {tab === 'clusters' && (
                <div className="space-y-3">
                  {/* Add cluster */}
                  {unassignedClusters.length > 0 && (
                    <div className="flex items-center gap-2">
                      <select
                        value={addingClusterId}
                        onChange={(e) => setAddingClusterId(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-teal-400 cursor-pointer"
                      >
                        <option value="">Agregar cluster...</option>
                        {unassignedClusters.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleAddCluster}
                        disabled={!addingClusterId || saving}
                        className="px-3 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                      >
                        Agregar
                      </button>
                    </div>
                  )}

                  {/* Assigned clusters */}
                  {assignedClusters.length === 0 ? (
                    <div className="py-8 text-center">
                      <i className="ri-stack-line text-3xl text-gray-300 block mb-2"></i>
                      <p className="text-sm text-gray-400">Sin clusters asignados</p>
                    </div>
                  ) : (
                    assignedClusters.map((ac) => (
                      <div key={ac.cluster_id} className="flex items-center justify-between p-3 bg-teal-50 rounded-lg border border-teal-100">
                        <div>
                          <p className="text-sm font-medium text-teal-800">{ac.cluster_name}</p>
                          {ac.cluster_description && (
                            <p className="text-xs text-teal-600 mt-0.5">{ac.cluster_description}</p>
                          )}
                          {!ac.is_active && (
                            <span className="text-xs text-amber-600 font-medium">Cluster inactivo</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveCluster(ac.cluster_id)}
                          disabled={saving}
                          className="w-7 h-7 flex items-center justify-center text-teal-400 hover:text-red-500 hover:bg-red-50 rounded-lg cursor-pointer"
                        >
                          <i className="ri-delete-bin-line text-sm"></i>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Individual providers tab */}
              {tab === 'individual' && (
                <div className="space-y-3">
                  {/* Add individual */}
                  <div>
                    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg mb-2">
                      <i className="ri-search-line text-gray-400 text-sm w-4 h-4 flex items-center justify-center"></i>
                      <input
                        type="text"
                        value={providerSearch}
                        onChange={(e) => setProviderSearch(e.target.value)}
                        placeholder="Buscar proveedor para agregar..."
                        className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder-gray-400"
                      />
                    </div>
                    {providerSearch && availableToAdd.length > 0 && (
                      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-36 overflow-y-auto mb-2">
                        {availableToAdd.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={async () => {
                              setAddingProviderId(p.id);
                              setSaving(true);
                              try {
                                await supabase.from('user_providers').upsert(
                                  { org_id: orgId, user_id: userId, provider_id: p.id },
                                  { onConflict: 'org_id,user_id,provider_id' }
                                );
                                setProviderSearch('');
                                await load();
                                onChanged();
                              } finally {
                                setSaving(false);
                                setAddingProviderId('');
                              }
                            }}
                            disabled={saving}
                            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-teal-50 hover:text-teal-700 flex items-center gap-2 cursor-pointer"
                          >
                            <i className="ri-add-line text-teal-500 shrink-0"></i>
                            <span className="truncate">{p.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {individualProviders.length === 0 ? (
                    <div className="py-8 text-center">
                      <i className="ri-truck-line text-3xl text-gray-300 block mb-2"></i>
                      <p className="text-sm text-gray-400">Sin proveedores individuales</p>
                      <p className="text-xs text-gray-400 mt-1">Buscá un proveedor arriba para agregar</p>
                    </div>
                  ) : (
                    individualProviders.map((p) => (
                      <div key={p.id} className="flex items-center justify-between px-3 py-2.5 bg-blue-50 rounded-lg border border-blue-100">
                        <span className="text-sm font-medium text-blue-800">{p.name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveIndividual(p.id)}
                          disabled={saving}
                          className="w-7 h-7 flex items-center justify-center text-blue-400 hover:text-red-500 hover:bg-red-50 rounded-lg cursor-pointer"
                        >
                          <i className="ri-delete-bin-line text-sm"></i>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Effective providers tab */}
              {tab === 'effective' && (
                <div className="space-y-2">
                  {effectiveProviders.length === 0 ? (
                    <div className="py-8 text-center">
                      <i className="ri-list-check text-3xl text-gray-300 block mb-2"></i>
                      <p className="text-sm text-gray-400">Sin proveedores efectivos</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-gray-400 mb-3">
                        Total único: <strong>{effectiveProviders.length}</strong> proveedores
                      </p>
                      {effectiveProviders.map((p) => (
                        <div key={p.provider_id} className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-100">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-700 truncate">{p.provider_name}</p>
                            {p.cluster_names.length > 0 && (
                              <p className="text-xs text-gray-400 truncate">{p.cluster_names.join(', ')}</p>
                            )}
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ml-2 ${originColor[p.origin]}`}>
                            {originLabel[p.origin]}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}