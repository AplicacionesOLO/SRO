import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Client } from '@/types/client';
import type { Provider } from '@/types/catalog';
import { clusterService, type ClusterWithStats, type ClientUser } from '@/services/clusterService';
import { clientsService } from '@/services/clientsService';
import { effectiveProvidersService, type EffectiveSummary } from '@/services/effectiveProvidersService';
import ClientSelector from './asignaciones/ClientSelector';
import ClusterPanel from './asignaciones/ClusterPanel';
import UserAssignmentCard from './asignaciones/UserAssignmentCard';
import UserDetailDrawer from './asignaciones/UserDetailDrawer';
import CopyAssignmentsModal from './asignaciones/CopyAssignmentsModal';

const PAGE_SIZE = 9;

interface Props {
  orgId: string;
  userId?: string;
}

export default function AsignacionesTab({ orgId, userId }: Props) {
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clusters, setClusters] = useState<ClusterWithStats[]>([]);
  const [users, setUsers] = useState<ClientUser[]>([]);
  const [clientProviders, setClientProviders] = useState<Provider[]>([]);
  const [effectiveMap, setEffectiveMap] = useState<Record<string, EffectiveSummary>>({});
  const [clusterCountMap, setClusterCountMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [loadingEffective, setLoadingEffective] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const [drawerUserId, setDrawerUserId] = useState<string | null>(null);
  const [copySourceUserId, setCopySourceUserId] = useState<string | null>(null);

  const drawerUser = users.find((u) => u.user_id === drawerUserId) ?? null;
  const copySourceUser = users.find((u) => u.user_id === copySourceUserId) ?? null;

  const loadClientData = useCallback(async (client: Client) => {
    setLoading(true);
    setEffectiveMap({});
    setClusterCountMap({});
    try {
      const [clustersData, usersData] = await Promise.all([
        clusterService.getClusters(orgId, client.id),
        clusterService.getClientUsers(orgId, client.id),
      ]);

      // Cargar proveedores vinculados al cliente con paginación (evita
      // el límite de 1000 registros de Supabase)
      let allProviders: any[] = [];
      let rangeStart = 0;
      const pageSize = 1000;
      while (true) {
        const { data: providersData, error: providersError } = await supabase
          .from('providers')
          .select('id, org_id, name, active, created_at, provider_code, source, source_code, client_providers!inner(client_id, provider_id)')
          .eq('client_providers.client_id', client.id)
          .eq('client_providers.org_id', orgId)
          .eq('active', true)
          .order('name', { ascending: true })
          .range(rangeStart, rangeStart + pageSize - 1);

        if (providersError) {
          break;
        }

        if (!providersData || providersData.length === 0) break;

        allProviders = allProviders.concat(providersData);

        if (providersData.length < pageSize) break;
        rangeStart += pageSize;
      }

      const providers = allProviders.map((p) => ({
        id: p.id,
        org_id: p.org_id,
        name: p.name,
        active: p.active,
        created_at: p.created_at,
        provider_code: p.provider_code,
        source: p.source,
        source_code: p.source_code,
      })) as Provider[];

      setClusters(clustersData);
      setUsers(usersData);
      setClientProviders(providers);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const loadEffective = useCallback(async (client: Client, userList: ClientUser[]) => {
    if (userList.length === 0) return;
    setLoadingEffective(true);
    try {
      const results = await Promise.all(
        userList.map((u) =>
          effectiveProvidersService.getEffectiveProviders(orgId, u.user_id, client.id)
            .then((s) => ({ userId: u.user_id, summary: s }))
            .catch(() => ({ userId: u.user_id, summary: null }))
        )
      );

      const eMap: Record<string, EffectiveSummary> = {};
      for (const r of results) {
        if (r.summary) eMap[r.userId] = r.summary;
      }
      setEffectiveMap(eMap);

      const cResults = await Promise.all(
        userList.map((u) =>
          clusterService.getUserClusters(orgId, u.user_id, client.id)
            .then((cs) => ({ userId: u.user_id, count: cs.length }))
            .catch(() => ({ userId: u.user_id, count: 0 }))
        )
      );
      const cMap: Record<string, number> = {};
      for (const r of cResults) cMap[r.userId] = r.count;
      setClusterCountMap(cMap);
    } finally {
      setLoadingEffective(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (!selectedClient) {
      setClusters([]);
      setUsers([]);
      setClientProviders([]);
      setEffectiveMap({});
      setClusterCountMap({});
      return;
    }
    loadClientData(selectedClient);
  }, [selectedClient, loadClientData]);

  useEffect(() => {
    if (selectedClient && users.length > 0) {
      loadEffective(selectedClient, users);
    }
  }, [selectedClient, users, loadEffective]);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [userSearch]);

  function handleClientSelect(client: Client | null) {
    setSelectedClient(client);
    setDrawerUserId(null);
    setCopySourceUserId(null);
    setUserSearch('');
    setCurrentPage(1);
  }

  function handleDataChanged() {
    if (selectedClient) {
      loadClientData(selectedClient).then(() => {
        if (selectedClient) loadEffective(selectedClient, users);
      });
    }
  }

  function handleClustersChanged() {
    if (selectedClient) {
      clusterService.getClusters(orgId, selectedClient.id).then(setClusters);
      if (users.length > 0) loadEffective(selectedClient, users);
    }
  }

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedUsers = filteredUsers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Stats
  const totalEffective = Object.values(effectiveMap).reduce((acc, s) => acc + s.total_unique, 0);
  const avgEffective = users.length > 0 ? Math.round(totalEffective / users.length) : 0;

  return (
    <div className="space-y-5">
      {/* Client selector row */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <i className="ri-building-line text-gray-400 w-4 h-4 flex items-center justify-center"></i>
          <span className="text-sm font-medium text-gray-600">Cliente:</span>
        </div>
        <ClientSelector orgId={orgId} selectedClient={selectedClient} onSelect={handleClientSelect} />
        {selectedClient && !loading && (
          <div className="flex items-center gap-4 ml-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">Clusters:</span>
              <span className="text-xs font-semibold text-gray-700">{clusters.length}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">Usuarios:</span>
              <span className="text-xs font-semibold text-gray-700">{users.length}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">Prom. efectivos:</span>
              <span className="text-xs font-semibold text-gray-700">{avgEffective}</span>
            </div>
          </div>
        )}
      </div>

      {/* Empty state */}
      {!selectedClient && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 flex items-center justify-center rounded-2xl bg-gray-100 mb-4">
            <i className="ri-building-line text-3xl text-gray-400"></i>
          </div>
          <h3 className="text-base font-semibold text-gray-700 mb-1">Seleccioná un cliente</h3>
          <p className="text-sm text-gray-400 max-w-xs">
            Elegí un cliente para ver y gestionar los clusters de proveedores y las asignaciones de usuarios.
          </p>
        </div>
      )}

      {/* Loading */}
      {selectedClient && loading && (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
        </div>
      )}

      {/* Main content */}
      {selectedClient && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
          {/* Left: Clusters */}
          <div>
            <ClusterPanel
              orgId={orgId}
              clientId={selectedClient.id}
              clientName={selectedClient.name}
              clusters={clusters}
              clientProviders={clientProviders}
              createdBy={userId}
              onChanged={handleClustersChanged}
            />
          </div>

          {/* Right: Users */}
          <div>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-teal-50">
                    <i className="ri-team-line text-teal-600 text-sm"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Usuarios del cliente</h3>
                    <p className="text-xs text-gray-400">
                      {filteredUsers.length} de {users.length} usuario{users.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
                  <i className="ri-search-line text-gray-400 text-sm w-4 h-4 flex items-center justify-center"></i>
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Buscar usuario..."
                    className="w-36 bg-transparent text-sm outline-none text-gray-700 placeholder-gray-400"
                  />
                  {userSearch && (
                    <button
                      type="button"
                      onClick={() => setUserSearch('')}
                      className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer"
                    >
                      <i className="ri-close-line text-xs"></i>
                    </button>
                  )}
                </div>
              </div>

              <div className="p-4">
                {users.length === 0 ? (
                  <div className="py-10 text-center">
                    <div className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 mx-auto mb-3">
                      <i className="ri-team-line text-gray-400 text-lg"></i>
                    </div>
                    <p className="text-sm text-gray-500">Sin usuarios asignados a este cliente</p>
                    <p className="text-xs text-gray-400 mt-1">Asigná usuarios al cliente desde la sección de Usuarios</p>
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="py-10 text-center">
                    <div className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 mx-auto mb-3">
                      <i className="ri-search-line text-gray-400 text-lg"></i>
                    </div>
                    <p className="text-sm text-gray-500">Sin resultados para &quot;{userSearch}&quot;</p>
                    <button
                      type="button"
                      onClick={() => setUserSearch('')}
                      className="mt-2 text-xs text-teal-600 hover:underline cursor-pointer"
                    >
                      Limpiar búsqueda
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {paginatedUsers.map((user) => (
                        <UserAssignmentCard
                          key={user.user_id}
                          user={user}
                          effectiveSummary={effectiveMap[user.user_id] ?? null}
                          clusterCount={clusterCountMap[user.user_id] ?? 0}
                          loadingEffective={loadingEffective}
                          onViewDetail={() => setDrawerUserId(user.user_id)}
                          onCopyAssignments={() => setCopySourceUserId(user.user_id)}
                        />
                      ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100">
                        <p className="text-xs text-gray-400">
                          Mostrando{' '}
                          <span className="font-medium text-gray-600">
                            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredUsers.length)}
                          </span>{' '}
                          de{' '}
                          <span className="font-medium text-gray-600">{filteredUsers.length}</span> usuarios
                        </p>

                        <div className="flex items-center gap-1">
                          {/* Prev */}
                          <button
                            type="button"
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={safePage === 1}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                          >
                            <i className="ri-arrow-left-s-line text-sm"></i>
                          </button>

                          {/* Page numbers */}
                          {Array.from({ length: totalPages }, (_, i) => i + 1)
                            .filter((p) => {
                              if (totalPages <= 7) return true;
                              if (p === 1 || p === totalPages) return true;
                              if (Math.abs(p - safePage) <= 1) return true;
                              return false;
                            })
                            .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                              if (idx > 0 && typeof arr[idx - 1] === 'number' && (p as number) - (arr[idx - 1] as number) > 1) {
                                acc.push('...');
                              }
                              acc.push(p);
                              return acc;
                            }, [])
                            .map((item, idx) =>
                              item === '...' ? (
                                <span key={`ellipsis-${idx}`} className="w-7 h-7 flex items-center justify-center text-xs text-gray-400">
                                  …
                                </span>
                              ) : (
                                <button
                                  key={item}
                                  type="button"
                                  onClick={() => setCurrentPage(item as number)}
                                  className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                    safePage === item
                                      ? 'bg-teal-600 text-white'
                                      : 'text-gray-600 hover:bg-gray-100'
                                  }`}
                                >
                                  {item}
                                </button>
                              )
                            )}

                          {/* Next */}
                          <button
                            type="button"
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={safePage === totalPages}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                          >
                            <i className="ri-arrow-right-s-line text-sm"></i>
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Detail Drawer */}
      {drawerUser && selectedClient && (
        <UserDetailDrawer
          orgId={orgId}
          userId={drawerUser.user_id}
          clientId={selectedClient.id}
          userName={drawerUser.name}
          userEmail={drawerUser.email}
          availableClusters={clusters}
          clientProviders={clientProviders}
          createdBy={userId}
          onClose={() => setDrawerUserId(null)}
          onChanged={handleDataChanged}
        />
      )}

      {/* Copy Assignments Modal */}
      {copySourceUser && selectedClient && (
        <CopyAssignmentsModal
          orgId={orgId}
          clientId={selectedClient.id}
          sourceUserId={copySourceUser.user_id}
          sourceUserName={copySourceUser.name}
          allUsers={users}
          onClose={() => setCopySourceUserId(null)}
          onDone={handleDataChanged}
        />
      )}
    </div>
  );
}