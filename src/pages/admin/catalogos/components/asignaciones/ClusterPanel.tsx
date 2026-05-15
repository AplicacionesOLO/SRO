import { useState } from 'react';
import { clusterService, type ClusterWithStats, type Cluster } from '@/services/clusterService';
import type { Provider } from '@/types/catalog';
import ClusterModal from './ClusterModal';
import ClusterBulkImportModal from './ClusterBulkImportModal';

interface Props {
  orgId: string;
  clientId: string;
  clientName: string;
  clusters: ClusterWithStats[];
  clientProviders: Provider[];
  createdBy?: string;
  onChanged: () => void;
}

export default function ClusterPanel({
  orgId,
  clientId,
  clientName,
  clusters,
  clientProviders,
  createdBy,
  onChanged,
}: Props) {
  const [showModal, setShowModal] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [editingCluster, setEditingCluster] = useState<Cluster | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const existingClusterNames = clusters.map((c) => c.name);

  function openCreate() {
    setEditingCluster(null);
    setShowModal(true);
  }

  function openEdit(cluster: ClusterWithStats) {
    setEditingCluster(cluster as Cluster);
    setShowModal(true);
  }

  async function handleToggleActive(cluster: ClusterWithStats) {
    try {
      await clusterService.updateCluster(orgId, cluster.id, { is_active: !cluster.is_active });
      onChanged();
    } catch {
      // ignore
    }
  }

  async function handleDelete(clusterId: string) {
    setDeletingId(clusterId);
    try {
      await clusterService.deleteCluster(orgId, clusterId);
      onChanged();
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-teal-50 shrink-0">
            <i className="ri-stack-line text-teal-600 text-sm"></i>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">Clusters</h3>
            <p className="text-xs text-gray-400">{clusters.length} cluster{clusters.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            title="Carga masiva desde Excel"
            onClick={() => setShowBulkImport(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-teal-200 text-teal-700 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-file-excel-line"></i>
            Excel
          </button>
          <button
            type="button"
            title="Crear nuevo cluster"
            onClick={openCreate}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-add-line"></i>
            Nuevo
          </button>
        </div>
      </div>

      {/* List */}
      <div className="divide-y divide-gray-50">
        {clusters.length === 0 ? (
          <div className="py-10 text-center">
            <div className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 mx-auto mb-3">
              <i className="ri-stack-line text-gray-400 text-lg"></i>
            </div>
            <p className="text-sm text-gray-500">Sin clusters para este cliente</p>
            <p className="text-xs text-gray-400 mt-1">Creá el primero para agrupar proveedores</p>
          </div>
        ) : (
          clusters.map((cluster) => (
            <div key={cluster.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-gray-800 truncate">{cluster.name}</span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        cluster.is_active
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {cluster.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  {cluster.description && (
                    <p className="text-xs text-gray-400 truncate mb-1">{cluster.description}</p>
                  )}
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <i className="ri-truck-line text-gray-400"></i>
                      {cluster.provider_count} proveedor{cluster.provider_count !== 1 ? 'es' : ''}
                    </span>
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <i className="ri-user-line text-gray-400"></i>
                      {cluster.user_count} usuario{cluster.user_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    title={cluster.is_active ? 'Desactivar' : 'Activar'}
                    onClick={() => handleToggleActive(cluster)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-amber-500 hover:bg-amber-50 transition-colors cursor-pointer"
                  >
                    <i className={cluster.is_active ? 'ri-eye-line' : 'ri-eye-off-line'}></i>
                  </button>
                  <button
                    type="button"
                    title="Editar"
                    onClick={() => openEdit(cluster)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors cursor-pointer"
                  >
                    <i className="ri-edit-line"></i>
                  </button>
                  {confirmDeleteId === cluster.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleDelete(cluster.id)}
                        disabled={deletingId === cluster.id}
                        className="text-xs px-2 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 cursor-pointer whitespace-nowrap"
                      >
                        {deletingId === cluster.id ? '...' : 'Confirmar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer whitespace-nowrap"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      title="Eliminar"
                      onClick={() => setConfirmDeleteId(cluster.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <i className="ri-delete-bin-line"></i>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Cluster create/edit modal */}
      {showModal && (
        <ClusterModal
          orgId={orgId}
          clientId={clientId}
          cluster={editingCluster}
          clientProviders={clientProviders}
          createdBy={createdBy}
          onSave={onChanged}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Bulk import modal */}
      {showBulkImport && (
        <ClusterBulkImportModal
          orgId={orgId}
          clientId={clientId}
          clientName={clientName}
          clientProviders={clientProviders}
          existingClusterNames={existingClusterNames}
          createdBy={createdBy}
          onClose={() => setShowBulkImport(false)}
          onDone={onChanged}
        />
      )}
    </div>
  );
}