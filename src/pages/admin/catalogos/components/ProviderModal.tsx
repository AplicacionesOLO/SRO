import { useState, useEffect, useCallback } from 'react';
import { providersService } from '../../../../services/providersService';
import { warehousesService } from '../../../../services/warehousesService';
import { clientsService } from '../../../../services/clientsService';
import type { Provider } from '../../../../types/catalog';
import { useFormDraft, getDraftAge } from '../../../../hooks/useReservationDraft';
import { ConfirmModal } from '../../../../components/base/ConfirmModal';

interface ProviderModalProps {
  orgId: string;
  warehouseId?: string | null;
  provider: Provider | null;
  onClose: () => void;
  onSave: () => void;
}

interface WarehouseOption {
  id: string;
  name: string;
}

export default function ProviderModal({ orgId, warehouseId, provider, onClose, onSave }: ProviderModalProps) {
  const [formData, setFormData] = useState({
    name: provider?.name || '',
    active: provider?.active ?? true,
    provider_type: provider?.provider_type || 'almacenaje',
    provider_code: provider?.provider_code || '',
    source: provider?.source || '',
    client_id: provider?.client_id || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Almacenes disponibles y seleccionados
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<string[]>([]);
  const [warehousesLoading, setWarehousesLoading] = useState(false);

  // Clientes disponibles para vincular (IDCOMPANIA)
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);

  // ── Draft persistence ─────────────────────────────────────────────────────
  const isNewRecord = !provider;
  const DRAFT_KEY = `draft_provider_${orgId}_new`;
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [draftAgeLabel, setDraftAgeLabel] = useState('');
  const { saveDraft, clearDraft, readDraft } = useFormDraft<typeof formData>({ storageKey: DRAFT_KEY, isNewRecord });

  // Cargar almacenes y clientes disponibles
  useEffect(() => {
    if (!orgId) return;
    setWarehousesLoading(true);
    warehousesService.getAll(orgId)
      .then(data => setWarehouses(data.map(w => ({ id: w.id, name: w.name }))))
      .catch(() => setWarehouses([]))
      .finally(() => setWarehousesLoading(false));
    clientsService.listClients(orgId)
      .then(data => setClients(data.map(c => ({ id: c.id, name: c.name }))))
      .catch(() => setClients([]));
  }, [orgId]);

  // Cargar almacenes asignados al editar
  useEffect(() => {
    if (provider) {
      setFormData({ name: provider.name, active: provider.active, provider_type: provider.provider_type || 'almacenaje', provider_code: provider.provider_code || '', source: provider.source || '', client_id: provider.client_id || '' });
      setShowDraftBanner(false);
      // Cargar warehouses asignados
      providersService.getProviderWarehouses(orgId, provider.id)
        .then(ids => setSelectedWarehouseIds(ids))
        .catch(() => setSelectedWarehouseIds([]));
    } else {
      const draft = readDraft();
      if (draft) {
        setFormData(draft.formData);
        setDraftAgeLabel(getDraftAge(draft.savedAt));
        setShowDraftBanner(true);
      } else {
        setFormData({ name: '', active: true, provider_type: 'almacenaje', provider_code: '', source: '', client_id: '' });
        setShowDraftBanner(false);
      }
      // Pre-seleccionar almacén activo si hay uno
      if (warehouseId) {
        setSelectedWarehouseIds([warehouseId]);
      } else {
        setSelectedWarehouseIds([]);
      }
    }
  }, [provider, warehouseId]);

  // Auto-save borrador
  useEffect(() => {
    if (!isNewRecord) return;
    saveDraft(formData);
  }, [formData, isNewRecord]);

  const handleClose = useCallback(() => {
    if (isNewRecord && formData.name.trim()) {
      setShowDiscardConfirm(true);
      return;
    }
    clearDraft();
    onClose();
  }, [isNewRecord, formData.name, clearDraft, onClose]);

  const handleDiscardAndClose = useCallback(() => {
    setShowDiscardConfirm(false);
    clearDraft();
    onClose();
  }, [clearDraft, onClose]);

  const handleKeepAndClose = useCallback(() => {
    setShowDiscardConfirm(false);
    onClose();
  }, [onClose]);

  const handleToggleWarehouse = (wid: string) => {
    setSelectedWarehouseIds(prev =>
      prev.includes(wid) ? prev.filter(id => id !== wid) : [...prev, wid]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) { setError('El nombre es requerido'); return; }
    try {
      setSaving(true);
      setError(null);
      let savedProviderId: string;

      if (provider) {
        await providersService.updateProvider(provider.id, {
          name: formData.name.trim(),
          active: formData.active,
          provider_type: formData.provider_type,
          provider_code: formData.provider_code.trim() || null,
          source: formData.source.trim() || null,
          client_id: formData.client_id || null,
        });
        savedProviderId = provider.id;
      } else {
        const created = await providersService.createProvider(orgId, formData.name.trim(), formData.provider_type, formData.provider_code.trim() || null, formData.source.trim() || null, formData.client_id || null);
        savedProviderId = created.id;
      }

      // Guardar relación con almacenes
      await providersService.setProviderWarehouses(orgId, savedProviderId, selectedWarehouseIds);

      clearDraft();
      onSave();
    } catch (err: any) {
      setError(err?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            {provider ? 'Editar Proveedor' : 'Nuevo Proveedor'}
          </h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
            <i className="ri-close-line text-2xl w-6 h-6 flex items-center justify-center"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Banner de borrador */}
          {showDraftBanner && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <i className="ri-save-line text-teal-600 text-lg w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5"></i>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-teal-900">Borrador guardado {draftAgeLabel}</p>
                  <div className="flex gap-2 mt-2">
                    <button type="button" onClick={() => setShowDraftBanner(false)}
                      className="px-3 py-1 text-xs font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 whitespace-nowrap">
                      Continuar
                    </button>
                    <button type="button" onClick={() => { clearDraft(); setFormData({ name: '', active: true, provider_type: 'almacenaje', provider_code: '', source: '', client_id: '' }); setShowDraftBanner(false); }}
                      className="px-3 py-1 text-xs border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 whitespace-nowrap">
                      Descartar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>}

          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Nombre <span className="text-red-500">*</span></label>
            <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              placeholder="Nombre del proveedor" required />
          </div>

          {/* Código de proveedor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Código</label>
            <input type="text" value={formData.provider_code} onChange={(e) => setFormData({ ...formData, provider_code: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              placeholder="Ej: PROV-001" />
          </div>

          {/* Origen */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Origen</label>
            <input type="text" value={formData.source} onChange={(e) => setFormData({ ...formData, source: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              placeholder="Ej: EPA, Cofersa, API..." />
          </div>

          {/* Cliente asociado (IDCOMPANIA) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Cliente asociado</label>
            <p className="text-xs text-gray-500 mb-2">Vincula este proveedor al cliente que lo gestiona (equivalente al IDCOMPANIA del sistema externo)</p>
            <select
              value={formData.client_id}
              onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm bg-white cursor-pointer"
            >
              <option value="">Sin cliente asociado</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Estado (solo al editar) */}
          {provider && (
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={formData.active} onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="rounded border-gray-300" />
                <span className="text-sm font-medium text-gray-700">Activo</span>
              </label>
            </div>
          )}

          {/* Tipo de proveedor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Tipo de proveedor</label>
            <div className="flex flex-col gap-2">
              <label
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                  formData.provider_type === 'almacenaje'
                    ? 'border-teal-500 bg-teal-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={formData.provider_type === 'almacenaje'}
                  onChange={() => setFormData({ ...formData, provider_type: 'almacenaje' })}
                  className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-800">Almacenaje</span>
                  <p className="text-xs text-gray-500">Proveedor estándar con material almacenado en racks convencionales</p>
                </div>
              </label>
              <label
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                  formData.provider_type === 'pesado'
                    ? 'border-teal-500 bg-teal-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={formData.provider_type === 'pesado'}
                  onChange={() => setFormData({ ...formData, provider_type: 'pesado' })}
                  className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-800">Pesado</span>
                  <p className="text-xs text-gray-500">Materiales manejados en patio, cantilever o zonas especiales (tubos, varillas, láminas, etc.)</p>
                </div>
              </label>
            </div>
          </div>

          {/* Selector de almacenes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Almacenes asignados
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Seleccioná los almacenes donde este proveedor opera. Si no seleccionás ninguno, no aparecerá en ningún almacén.
            </p>

            {warehousesLoading ? (
              <div className="flex items-center gap-2 py-3 text-sm text-gray-500">
                <i className="ri-loader-4-line animate-spin"></i>
                Cargando almacenes...
              </div>
            ) : warehouses.length === 0 ? (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500">
                No hay almacenes disponibles
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                {warehouses.map(w => (
                  <label key={w.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedWarehouseIds.includes(w.id)}
                      onChange={() => handleToggleWarehouse(w.id)}
                      className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                    />
                    <div className="flex items-center gap-2 flex-1">
                      <i className="ri-store-2-line text-gray-400 text-sm w-4 h-4 flex items-center justify-center"></i>
                      <span className="text-sm text-gray-800">{w.name}</span>
                    </div>
                    {warehouseId === w.id && (
                      <span className="text-xs text-teal-600 font-medium">Activo</span>
                    )}
                  </label>
                ))}
              </div>
            )}

            {selectedWarehouseIds.length > 0 && (
              <p className="mt-2 text-xs text-teal-700">
                {selectedWarehouseIds.length} almacén(es) seleccionado(s)
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={handleClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap cursor-pointer">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>

      <ConfirmModal
        isOpen={showDiscardConfirm}
        type="warning"
        title="Tenés un borrador sin guardar"
        message="¿Qué hacemos con los datos del proveedor que ingresaste?"
        confirmText="Descartar y cerrar"
        cancelText="Conservar borrador"
        showCancel
        onConfirm={handleDiscardAndClose}
        onCancel={handleKeepAndClose}
      />
    </div>
  );
}
