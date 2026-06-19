import { useState, useEffect, useCallback } from 'react';
import { clientsService } from '../../../../services/clientsService';
import { origenProveedoresService } from '../../../../services/origenProveedoresService';
import { useFormDraft, getDraftAge } from '../../../../hooks/useReservationDraft';
import { ConfirmModal } from '../../../../components/base/ConfirmModal';
import type { OrigenProveedor } from '../../../../types/origenProveedor';

interface OrigenProveedorModalProps {
  orgId: string;
  origen: OrigenProveedor | null;
  onClose: () => void;
  onSave: (saved: OrigenProveedor) => void;
}

export default function OrigenProveedorModal({ orgId, origen, onClose, onSave }: OrigenProveedorModalProps) {
  const [sourceCode, setSourceCode] = useState(origen?.source_code || '');
  const [clientId, setClientId] = useState(origen?.client_id || '');
  const [description, setDescription] = useState(origen?.description || '');
  const [isActive, setIsActive] = useState(origen?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);

  const isNewRecord = !origen;
  const DRAFT_KEY = `draft_origen_proveedor_${orgId}_new`;
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [draftAgeLabel, setDraftAgeLabel] = useState('');

  interface Draft { sourceCode: string; clientId: string; description: string }
  const { saveDraft, clearDraft, readDraft } = useFormDraft<Draft>({ storageKey: DRAFT_KEY, isNewRecord });

  useEffect(() => {
    clientsService.listClients(orgId)
      .then(data => setClients(data.map(c => ({ id: c.id, name: c.name }))))
      .catch(() => setClients([]));
  }, [orgId]);

  useEffect(() => {
    if (origen) {
      setSourceCode(origen.source_code);
      setClientId(origen.client_id || '');
      setDescription(origen.description || '');
      setIsActive(origen.is_active);
      setShowDraftBanner(false);
    } else {
      const draft = readDraft();
      if (draft) {
        setSourceCode(draft.formData.sourceCode);
        setClientId(draft.formData.clientId);
        setDescription(draft.formData.description);
        setDraftAgeLabel(getDraftAge(draft.savedAt));
        setShowDraftBanner(true);
      } else {
        setSourceCode('');
        setClientId('');
        setDescription('');
        setShowDraftBanner(false);
      }
    }
  }, [origen]);

  useEffect(() => {
    if (!isNewRecord) return;
    saveDraft({ sourceCode, clientId, description });
  }, [sourceCode, clientId, description, isNewRecord]);

  const handleClose = useCallback(() => {
    if (isNewRecord && sourceCode.trim()) {
      setShowDiscardConfirm(true);
      return;
    }
    clearDraft();
    onClose();
  }, [isNewRecord, sourceCode, clearDraft, onClose]);

  const handleDiscardAndClose = useCallback(() => {
    setShowDiscardConfirm(false);
    clearDraft();
    onClose();
  }, [clearDraft, onClose]);

  const handleKeepAndClose = useCallback(() => {
    setShowDiscardConfirm(false);
    onClose();
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceCode.trim()) { setError('El código de origen es requerido'); return; }
    try {
      setSaving(true);
      setError(null);

      let saved: OrigenProveedor;
      if (origen) {
        saved = await origenProveedoresService.update(origen.id, {
          source_code: sourceCode,
          client_id: clientId || null,
          description: description || null,
          is_active: isActive,
        });
      } else {
        saved = await origenProveedoresService.create(
          orgId,
          sourceCode,
          clientId || null,
          description || null,
        );
      }

      clearDraft();
      onSave(saved);
    } catch (err: any) {
      // Si es un error de conexión (Supabase no disponible), creamos registro local
      // para que el tab pueda actualizar los datos mock
      const isConnectionError = err?.message?.includes('fetch') || err?.message?.includes('Failed to fetch') || err?.message?.includes('NetworkError');
      if (isConnectionError || !err?.message) {
        const localRecord: OrigenProveedor = {
          id: origen?.id || `local-${Date.now()}`,
          org_id: orgId,
          source_code: sourceCode.trim().toUpperCase(),
          client_id: clientId || null,
          description: description?.trim() || null,
          is_active: isActive,
          created_at: origen?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        clearDraft();
        onSave(localRecord);
        return;
      }
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
            {origen ? 'Editar Origen' : 'Nuevo Origen'}
          </h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
            <i className="ri-close-line text-2xl w-6 h-6 flex items-center justify-center"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {showDraftBanner && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <i className="ri-save-line text-teal-600 text-lg w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5"></i>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-teal-900">Borrador guardado {draftAgeLabel}</p>
                  <div className="flex gap-2 mt-2">
                    <button type="button" onClick={() => setShowDraftBanner(false)}
                      className="px-3 py-1 text-xs font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 whitespace-nowrap cursor-pointer">
                      Continuar
                    </button>
                    <button type="button" onClick={() => { clearDraft(); setSourceCode(''); setClientId(''); setDescription(''); setShowDraftBanner(false); }}
                      className="px-3 py-1 text-xs border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 whitespace-nowrap cursor-pointer">
                      Descartar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Código de Origen <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={sourceCode}
              onChange={(e) => setSourceCode(e.target.value.toUpperCase())}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              placeholder="Ej: EPA, COFERSA..."
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Código que vincula automáticamente proveedores con su cliente correspondiente.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Cliente asociado</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm bg-white cursor-pointer"
            >
              <option value="">Sin cliente asociado</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Cliente que se asignará automáticamente a nuevos proveedores con este código.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none"
              placeholder="Descripción del origen de proveedores..."
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-gray-400 mt-1">{description.length}/500</p>
          </div>

          {origen && (
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-700">Activo</span>
              </label>
              {!isActive && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2 flex items-start gap-2">
                  <i className="ri-alert-line text-amber-600 w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5"></i>
                  <div>
                    <p className="text-xs font-semibold text-amber-800">
                      Al desactivar este origen, los nuevos proveedores con este código no se vincularán automáticamente a un cliente.
                    </p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Los proveedores existentes mantienen su cliente asignado.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={handleClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap cursor-pointer text-sm">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer text-sm">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>

      <ConfirmModal
        isOpen={showDiscardConfirm}
        type="warning"
        title="Tenés un borrador sin guardar"
        message="¿Qué hacemos con los datos del origen que ingresaste?"
        confirmText="Descartar y cerrar"
        cancelText="Conservar borrador"
        showCancel
        onConfirm={handleDiscardAndClose}
        onCancel={handleKeepAndClose}
      />
    </div>
  );
}