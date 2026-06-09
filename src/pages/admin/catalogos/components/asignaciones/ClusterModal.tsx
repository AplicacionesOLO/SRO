import { useState, useEffect } from 'react';
import { clusterService, type Cluster } from '@/services/clusterService';
import type { Provider } from '@/types/catalog';
import { formatProviderLabel } from '@/utils/providerFormat';

interface Props {
  orgId: string;
  clientId: string;
  cluster: Cluster | null;
  clientProviders: Provider[];
  createdBy?: string;
  onSave: () => void;
  onClose: () => void;
}

export default function ClusterModal({
  orgId,
  clientId,
  cluster,
  clientProviders,
  createdBy,
  onSave,
  onClose,
}: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedProviderIds, setSelectedProviderIds] = useState<string[]>([]);
  const [providerSearch, setProviderSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (cluster) {
      setName(cluster.name);
      setDescription(cluster.description ?? '');
      loadCurrentProviders();
    }
  }, [cluster]);

  async function loadCurrentProviders() {
    if (!cluster) return;
    try {
      const providers = await clusterService.getClusterProviders(orgId, cluster.id);
      setSelectedProviderIds(providers.map((p) => p.id));
    } catch {
      // ignore
    }
  }

  function toggleProvider(id: string) {
    setSelectedProviderIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  const filteredProviders = clientProviders.filter((p) => {
    const q = providerSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) ||
      (p.provider_code && p.provider_code.toLowerCase().includes(q)) ||
      (p.source && p.source.toLowerCase().includes(q));
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('El nombre es requerido');

    setSaving(true);
    setError('');

    try {
      let clusterId = cluster?.id;

      if (cluster) {
        await clusterService.updateCluster(orgId, cluster.id, {
          name: name.trim(),
          description: description.trim() || null,
        });
      } else {
        const created = await clusterService.createCluster(orgId, clientId, {
          name: name.trim(),
          description: description.trim() || undefined,
          created_by: createdBy,
        });
        clusterId = created.id;
      }

      if (clusterId) {
        await clusterService.setClusterProviders(orgId, clusterId, selectedProviderIds);
      }

      onSave();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Error al guardar el cluster');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {cluster ? 'Editar cluster' : 'Nuevo cluster'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-pointer"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Nombre del cluster <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Cluster importación"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Descripción <span className="text-gray-400">(opcional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Descripción interna del cluster..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-100 resize-none"
            />
          </div>

          {/* Provider selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">
                Proveedores del cluster
              </label>
              <span className="text-xs text-teal-600 font-medium">
                {selectedProviderIds.length} seleccionados
              </span>
            </div>

            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg mb-2">
              <i className="ri-search-line text-gray-400 text-sm w-4 h-4 flex items-center justify-center"></i>
              <input
                type="text"
                value={providerSearch}
                onChange={(e) => setProviderSearch(e.target.value)}
                placeholder="Buscar proveedor..."
                className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder-gray-400"
              />
            </div>

            {clientProviders.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">
                No hay proveedores vinculados a este cliente
              </p>
            ) : (
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                {filteredProviders.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">Sin resultados</p>
                ) : (
                  filteredProviders.map((p) => {
                    const checked = selectedProviderIds.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleProvider(p.id)}
                          className="accent-teal-600 w-4 h-4 shrink-0"
                        />
                        <span className="text-sm text-gray-700 truncate">{formatProviderLabel(p)}</span>
                      </label>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit as any}
            disabled={saving || !name.trim()}
            className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {saving ? 'Guardando...' : cluster ? 'Guardar cambios' : 'Crear cluster'}
          </button>
        </div>
      </div>
    </div>
  );
}