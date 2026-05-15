import { useState, useEffect } from 'react';
import { clusterService, type ClientUser } from '@/services/clusterService';
import { effectiveProvidersService } from '@/services/effectiveProvidersService';

interface Props {
  orgId: string;
  clientId: string;
  sourceUserId: string;
  sourceUserName: string;
  allUsers: ClientUser[];
  onClose: () => void;
  onDone: () => void;
}

type CopyMode = 'add' | 'replace';

export default function CopyAssignmentsModal({
  orgId,
  clientId,
  sourceUserId,
  sourceUserName,
  allUsers,
  onClose,
  onDone,
}: Props) {
  const [targetUserId, setTargetUserId] = useState('');
  const [copyClusters, setCopyClusters] = useState(true);
  const [copyIndividual, setCopyIndividual] = useState(true);
  const [mode, setMode] = useState<CopyMode>('add');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{
    sourceClusters: string[];
    sourceIndividual: string[];
    targetClusters: string[];
    targetIndividual: string[];
    duplicateClusters: string[];
    duplicateIndividual: string[];
    finalTotal: number;
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const targetUsers = allUsers.filter((u) => u.user_id !== sourceUserId);

  useEffect(() => {
    if (!targetUserId) { setPreview(null); return; }
    buildPreview();
  }, [targetUserId, copyClusters, copyIndividual, mode]);

  async function buildPreview() {
    setLoadingPreview(true);
    try {
      const [srcClusters, tgtClusters, srcEffective, tgtEffective] = await Promise.all([
        clusterService.getUserClusters(orgId, sourceUserId, clientId),
        clusterService.getUserClusters(orgId, targetUserId, clientId),
        effectiveProvidersService.getEffectiveProviders(orgId, sourceUserId, clientId),
        effectiveProvidersService.getEffectiveProviders(orgId, targetUserId, clientId),
      ]);

      const srcClusterNames = srcClusters.map((c) => c.cluster_name);
      const tgtClusterNames = tgtClusters.map((c) => c.cluster_name);
      const srcIndivNames = srcEffective.providers
        .filter((p) => p.origin === 'individual' || p.origin === 'both')
        .map((p) => p.provider_name);
      const tgtIndivNames = tgtEffective.providers
        .filter((p) => p.origin === 'individual' || p.origin === 'both')
        .map((p) => p.provider_name);

      const tgtClusterSet = new Set(tgtClusters.map((c) => c.cluster_id));
      const srcClusterIds = srcClusters.map((c) => c.cluster_id);
      const dupClusters = srcClusters.filter((c) => tgtClusterSet.has(c.cluster_id)).map((c) => c.cluster_name);

      const tgtProvSet = new Set(
        tgtEffective.providers
          .filter((p) => p.origin === 'individual' || p.origin === 'both')
          .map((p) => p.provider_id)
      );
      const srcIndivIds = srcEffective.providers.filter((p) => p.origin === 'individual' || p.origin === 'both');
      const dupIndiv = srcIndivIds.filter((p) => tgtProvSet.has(p.provider_id)).map((p) => p.provider_name);

      // Estimate final total (rough)
      const mergedSet = new Set<string>();
      if (mode === 'replace') {
        // Only source survives
        if (copyClusters) srcClusterIds.forEach((id) => mergedSet.add(`c:${id}`));
        if (copyIndividual) srcIndivIds.forEach((p) => mergedSet.add(`p:${p.provider_id}`));
        if (!copyClusters) tgtClusters.forEach((c) => mergedSet.add(`c:${c.cluster_id}`));
        if (!copyIndividual) {
          tgtEffective.providers
            .filter((p) => p.origin === 'individual' || p.origin === 'both')
            .forEach((p) => mergedSet.add(`p:${p.provider_id}`));
        }
      } else {
        // Add mode: union
        tgtClusters.forEach((c) => mergedSet.add(`c:${c.cluster_id}`));
        tgtEffective.providers
          .filter((p) => p.origin === 'individual' || p.origin === 'both')
          .forEach((p) => mergedSet.add(`p:${p.provider_id}`));
        if (copyClusters) srcClusterIds.forEach((id) => mergedSet.add(`c:${id}`));
        if (copyIndividual) srcIndivIds.forEach((p) => mergedSet.add(`p:${p.provider_id}`));
      }

      setPreview({
        sourceClusters: srcClusterNames,
        sourceIndividual: srcIndivNames,
        targetClusters: tgtClusterNames,
        targetIndividual: tgtIndivNames,
        duplicateClusters: dupClusters,
        duplicateIndividual: dupIndiv,
        finalTotal: mergedSet.size,
      });
    } catch {
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleApply() {
    if (!targetUserId) return;
    if (!copyClusters && !copyIndividual) {
      setError('Seleccioná al menos qué querés copiar');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await clusterService.copyAssignments(orgId, sourceUserId, targetUserId, clientId, {
        copyClusters,
        copyIndividual,
        mode,
      });
      onDone();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Error al copiar asignaciones');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Copiar asignaciones</h2>
            <p className="text-xs text-gray-400 mt-0.5">Desde: <strong>{sourceUserName}</strong></p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-pointer">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          {/* Target user */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Usuario destino</label>
            <select
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-teal-400 cursor-pointer"
            >
              <option value="">Seleccionar usuario...</option>
              {targetUsers.map((u) => (
                <option key={u.user_id} value={u.user_id}>{u.name} — {u.email}</option>
              ))}
            </select>
          </div>

          {/* What to copy */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">¿Qué copiar?</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={copyClusters} onChange={(e) => setCopyClusters(e.target.checked)} className="accent-teal-600 w-4 h-4" />
                <span className="text-sm text-gray-700">Clusters asignados</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={copyIndividual} onChange={(e) => setCopyIndividual(e.target.checked)} className="accent-teal-600 w-4 h-4" />
                <span className="text-sm text-gray-700">Proveedores individuales</span>
              </label>
            </div>
          </div>

          {/* Mode */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Modo</label>
            <div className="grid grid-cols-2 gap-2">
              {(['add', 'replace'] as CopyMode[]).map((m) => (
                <label
                  key={m}
                  className={`flex flex-col gap-0.5 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    mode === m ? 'border-teal-400 bg-teal-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="sr-only" />
                  <span className="text-sm font-medium text-gray-800">
                    {m === 'add' ? 'Agregar' : 'Reemplazar'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {m === 'add'
                      ? 'Suma a las actuales del destino'
                      : 'Borra las actuales del destino y las reemplaza'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Preview */}
          {targetUserId && (
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Vista previa</p>
              {loadingPreview ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-teal-600"></div>
                </div>
              ) : preview ? (
                <div className="space-y-3 text-xs">
                  {copyClusters && (
                    <div>
                      <p className="text-gray-500 mb-1">Clusters origen ({preview.sourceClusters.length}):</p>
                      {preview.sourceClusters.length === 0
                        ? <p className="text-gray-400 italic">Sin clusters</p>
                        : preview.sourceClusters.map((n) => (
                            <span key={n} className={`inline-block mr-1 mb-1 px-2 py-0.5 rounded-full ${preview.duplicateClusters.includes(n) ? 'bg-amber-100 text-amber-700' : 'bg-teal-100 text-teal-700'}`}>
                              {n}{preview.duplicateClusters.includes(n) ? ' (dup)' : ''}
                            </span>
                          ))}
                    </div>
                  )}
                  {copyIndividual && (
                    <div>
                      <p className="text-gray-500 mb-1">Proveedores individuales origen ({preview.sourceIndividual.length}):</p>
                      {preview.sourceIndividual.length === 0
                        ? <p className="text-gray-400 italic">Sin individuales</p>
                        : preview.sourceIndividual.map((n) => (
                            <span key={n} className={`inline-block mr-1 mb-1 px-2 py-0.5 rounded-full ${preview.duplicateIndividual.includes(n) ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                              {n}{preview.duplicateIndividual.includes(n) ? ' (dup)' : ''}
                            </span>
                          ))}
                    </div>
                  )}
                  <div className="pt-2 border-t border-gray-200 flex items-center justify-between">
                    <span className="text-gray-500">Asignaciones finales estimadas</span>
                    <span className="font-semibold text-gray-800">{preview.finalTotal}</span>
                  </div>
                  {(preview.duplicateClusters.length > 0 || preview.duplicateIndividual.length > 0) && (
                    <p className="text-amber-600">Los duplicados marcados se omitirán automáticamente.</p>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer whitespace-nowrap">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={saving || !targetUserId || (!copyClusters && !copyIndividual)}
            className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {saving ? 'Aplicando...' : 'Aplicar copia'}
          </button>
        </div>
      </div>
    </div>
  );
}