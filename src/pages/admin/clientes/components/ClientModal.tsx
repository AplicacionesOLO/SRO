import { useState, useEffect, useCallback } from 'react';
import type { Client, ClientFormData } from '../../../../types/client';
import { useFormDraft, getDraftAge } from '../../../../hooks/useReservationDraft';
import { ConfirmModal } from '../../../../components/base/ConfirmModal';
import { usePermissions } from '../../../../hooks/usePermissions';

interface ClientModalProps {
  isOpen: boolean;
  client: Client | null;
  onClose: () => void;
  onSave: (data: ClientFormData) => Promise<void>;
}

export default function ClientModal({ isOpen, client, onClose, onSave }: ClientModalProps) {
  const { orgId } = usePermissions();

  const [formData, setFormData] = useState<ClientFormData>({
    name: '',
    legal_id: '',
    email: '',
    phone: '',
    address: '',
    notes: '',
    is_active: true
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Draft persistence ─────────────────────────────────────────────────────
  const isNewRecord = !client;
  const DRAFT_KEY = `draft_client_${orgId || 'local'}_new`;
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [draftAgeLabel, setDraftAgeLabel] = useState('');
  const { saveDraft, clearDraft, readDraft } = useFormDraft<ClientFormData>({ storageKey: DRAFT_KEY, isNewRecord });

  useEffect(() => {
    if (client) {
      setFormData({
        name: client.name,
        legal_id: client.legal_id || '',
        email: client.email || '',
        phone: client.phone || '',
        address: client.address || '',
        notes: client.notes || '',
        is_active: client.is_active
      });
      setShowDraftBanner(false);
    } else {
      if (isOpen) {
        const draft = readDraft();
        if (draft) {
          setFormData(draft.formData);
          setDraftAgeLabel(getDraftAge(draft.savedAt));
          setShowDraftBanner(true);
        } else {
          setFormData({ name: '', legal_id: '', email: '', phone: '', address: '', notes: '', is_active: true });
          setShowDraftBanner(false);
        }
      }
    }
    setError(null);
  }, [client, isOpen]);

  // Auto-save borrador
  useEffect(() => {
    if (!isOpen || !isNewRecord) return;
    saveDraft(formData);
  }, [formData, isOpen, isNewRecord]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError('El nombre es requerido');
      return;
    }

    try {
      setSaving(true);
      await onSave(formData);
      clearDraft();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error al guardar cliente');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {client ? 'Editar Cliente' : 'Nuevo Cliente'}
          </h2>
          <button
            onClick={handleClose}
            disabled={saving}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            <i className="ri-close-line text-xl w-5 h-5 flex items-center justify-center"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* Banner de borrador */}
          {showDraftBanner && (
            <div className="mb-4 bg-teal-50 border border-teal-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <i className="ri-save-line text-teal-600 text-lg w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5"></i>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-teal-900">Borrador guardado {draftAgeLabel}</p>
                  <p className="text-xs text-teal-700 mt-0.5">Se restauraron los datos que ingresaste anteriormente.</p>
                  <div className="flex gap-2 mt-3">
                    <button type="button" onClick={() => setShowDraftBanner(false)}
                      className="px-3 py-1.5 text-xs font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap">
                      Continuar con el borrador
                    </button>
                    <button type="button" onClick={() => { clearDraft(); setFormData({ name: '', legal_id: '', email: '', phone: '', address: '', notes: '', is_active: true }); setShowDraftBanner(false); }}
                      className="px-3 py-1.5 text-xs font-medium border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap">
                      Descartar y empezar nuevo
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <i className="ri-error-warning-line text-red-600 text-lg mt-0.5"></i>
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="Nombre del cliente"
                disabled={saving}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                RUT / ID Legal
              </label>
              <input
                type="text"
                value={formData.legal_id}
                onChange={(e) => setFormData({ ...formData, legal_id: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="12.345.678-9"
                disabled={saving}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="cliente@ejemplo.com"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="+56 9 1234 5678"
                  disabled={saving}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="Dirección completa"
                disabled={saving}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                placeholder="Notas adicionales sobre el cliente"
                disabled={saving}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                disabled={saving}
              />
              <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
                Cliente activo
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
            >
              {saving && <i className="ri-loader-4-line animate-spin"></i>}
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>

      <ConfirmModal
        isOpen={showDiscardConfirm}
        type="warning"
        title="Tenés un borrador sin guardar"
        message="¿Qué hacemos con los datos del cliente que ingresaste?"
        confirmText="Descartar y cerrar"
        cancelText="Conservar borrador"
        showCancel
        onConfirm={handleDiscardAndClose}
        onCancel={handleKeepAndClose}
      />
    </div>
  );
}
