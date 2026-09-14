import { useState, useEffect, useCallback } from 'react';
import type { Collaborator, CollaboratorFormData, WorkType } from '@/types/collaborator';
import { useFormDraft, getDraftAge } from '@/hooks/useReservationDraft';
import { ConfirmModal } from '@/components/base/ConfirmModal';
import { usePermissions } from '@/hooks/usePermissions';

export interface ActiveWarehouseInfo {
  id: string;
  name: string;
  country_id: string;
  country_name: string;
}

interface CollaboratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CollaboratorFormData) => Promise<void>;
  collaborator?: Collaborator | null;
  workTypes: WorkType[];
  activeWarehouse: ActiveWarehouseInfo | null;
  canManage: boolean;
}

export function CollaboratorModal({
  isOpen,
  onClose,
  onSave,
  collaborator,
  workTypes,
  activeWarehouse,
  canManage
}: CollaboratorModalProps) {
  const { orgId } = usePermissions();

  const [formData, setFormData] = useState<CollaboratorFormData>({
    full_name: '',
    ficha: '',
    cedula: '',
    country_id: '',
    work_type_id: '',
    is_active: true,
    warehouse_ids: []
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Draft persistence ─────────────────────────────────────────────────────
  const isNewRecord = !collaborator;
  const DRAFT_KEY = `draft_collaborator_${orgId || 'local'}_new`;
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [draftAgeLabel, setDraftAgeLabel] = useState('');
  const { saveDraft, clearDraft, readDraft } = useFormDraft<CollaboratorFormData>({ storageKey: DRAFT_KEY, isNewRecord });

  useEffect(() => {
    // País y almacén siempre vienen del switch (almacén activo), no se eligen a mano.
    const derivedCountry = activeWarehouse?.country_id ?? '';
    const derivedWarehouses = activeWarehouse ? [activeWarehouse.id] : [];

    if (collaborator) {
      setFormData({
        full_name: collaborator.full_name,
        ficha: collaborator.ficha || '',
        cedula: collaborator.cedula || '',
        country_id: derivedCountry,
        work_type_id: collaborator.work_type_id,
        is_active: collaborator.is_active,
        warehouse_ids: derivedWarehouses
      });
      setShowDraftBanner(false);
    } else {
      if (isOpen) {
        const draft = readDraft();
        if (draft) {
          setFormData({
            ...draft.formData,
            country_id: derivedCountry,
            warehouse_ids: derivedWarehouses
          });
          setDraftAgeLabel(getDraftAge(draft.savedAt));
          setShowDraftBanner(true);
        } else {
          setFormData({ full_name: '', ficha: '', cedula: '', country_id: derivedCountry, work_type_id: '', is_active: true, warehouse_ids: derivedWarehouses });
          setShowDraftBanner(false);
        }
      }
    }
    setErrors({});
  }, [collaborator, isOpen, activeWarehouse, readDraft]);

  // Auto-save borrador
  useEffect(() => {
    if (!isOpen || !isNewRecord) return;
    saveDraft(formData);
  }, [formData, isOpen, isNewRecord, saveDraft]);

  // Validar formulario
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.full_name.trim()) {
      newErrors.full_name = 'El nombre completo es requerido';
    }

    if (!formData.work_type_id) {
      newErrors.work_type_id = 'El tipo de trabajo es requerido';
    }

    if (!activeWarehouse) {
      newErrors.warehouse = 'Seleccione un almacén en el switch para continuar';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleClose = useCallback(() => {
    if (isNewRecord && formData.full_name.trim()) {
      setShowDiscardConfirm(true);
      return;
    }
    clearDraft();
    onClose();
  }, [isNewRecord, formData.full_name, clearDraft, onClose]);

  const handleDiscardAndClose = useCallback(() => {
    setShowDiscardConfirm(false);
    clearDraft();
    onClose();
  }, [clearDraft, onClose]);

  const handleKeepAndClose = useCallback(() => {
    setShowDiscardConfirm(false);
    onClose();
  }, [onClose]);

  // Guardar
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    // País y almacén siempre se derivan del switch al guardar.
    const payload: CollaboratorFormData = {
      ...formData,
      country_id: activeWarehouse?.country_id ?? '',
      warehouse_ids: activeWarehouse ? [activeWarehouse.id] : []
    };

    setLoading(true);
    try {
      await onSave(payload);
      clearDraft();
      onClose();
    } catch (error) {
      // silenced
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {collaborator ? 'Editar Colaborador' : 'Nuevo Colaborador'}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={loading}
          >
            <i className="ri-close-line text-2xl"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Banner de borrador */}
          {showDraftBanner && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
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
                    <button type="button" onClick={() => { clearDraft(); setFormData(prev => ({ ...prev, full_name: '', ficha: '', cedula: '', work_type_id: '' })); setShowDraftBanner(false); }}
                      className="px-3 py-1.5 text-xs font-medium border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap">
                      Descartar y empezar nuevo
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* País y Almacén (derivados del switch) */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">País y Almacén</p>
            {activeWarehouse ? (
              <div className="flex items-center gap-3">
                <i className="ri-store-2-line text-teal-600 text-xl w-6 h-6 flex items-center justify-center"></i>
                <div>
                  <p className="text-sm font-medium text-gray-900">{activeWarehouse.name}</p>
                  <p className="text-xs text-gray-500">{activeWarehouse.country_name || 'País no definido'}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <i className="ri-information-line text-amber-600 text-lg w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5"></i>
                <p className="text-sm text-amber-800">
                  Seleccioná un almacén en el switch para asignar el colaborador automáticamente.
                </p>
              </div>
            )}
            {errors.warehouse && (
              <p className="mt-2 text-sm text-red-600">{errors.warehouse}</p>
            )}
          </div>

          {/* Nombre Completo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nombre Completo <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.full_name}
              onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              placeholder="Ingrese el nombre completo"
              disabled={!canManage || loading}
            />
            {errors.full_name && (
              <p className="mt-1 text-sm text-red-600">{errors.full_name}</p>
            )}
          </div>

          {/* Ficha y Cédula */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ficha
              </label>
              <input
                type="text"
                value={formData.ficha}
                onChange={(e) => setFormData(prev => ({ ...prev, ficha: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="Número de ficha"
                disabled={!canManage || loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cédula
              </label>
              <input
                type="text"
                value={formData.cedula}
                onChange={(e) => setFormData(prev => ({ ...prev, cedula: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="Número de cédula"
                disabled={!canManage || loading}
              />
            </div>
          </div>

          {/* Tipo de Trabajo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de Trabajo <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.work_type_id}
              onChange={(e) => setFormData(prev => ({ ...prev, work_type_id: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              disabled={!canManage || loading}
            >
              <option value="">Seleccione un tipo de trabajo</option>
              {workTypes.map(type => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
            {errors.work_type_id && (
              <p className="mt-1 text-sm text-red-600">{errors.work_type_id}</p>
            )}
          </div>

          {/* Estado */}
          <div className="flex items-center space-x-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                className="sr-only peer"
                disabled={!canManage || loading}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
            </label>
            <span className="text-sm font-medium text-gray-700">
              {formData.is_active ? 'Activo' : 'Inactivo'}
            </span>
          </div>

          {/* Botones */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors whitespace-nowrap"
              disabled={loading}
            >
              Cancelar
            </button>
            {canManage && (
              <button
                type="submit"
                className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                disabled={loading}
              >
                {loading ? 'Guardando...' : 'Guardar'}
              </button>
            )}
          </div>
        </form>
      </div>

      <ConfirmModal
        isOpen={showDiscardConfirm}
        type="warning"
        title="Tenés un borrador sin guardar"
        message="¿Qué hacemos con los datos del colaborador que ingresaste?"
        confirmText="Descartar y cerrar"
        cancelText="Conservar borrador"
        showCancel
        onConfirm={handleDiscardAndClose}
        onCancel={handleKeepAndClose}
      />
    </div>
  );
}