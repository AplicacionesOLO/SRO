import { useState, useEffect, useCallback } from 'react';
import { vehicleTypesService } from '../../../../services/vehicleTypesService';
import { countriesService } from '../../../../services/countriesService';
import type { VehicleType } from '../../../../types/catalog';
import { useFormDraft, getDraftAge } from '../../../../hooks/useReservationDraft';
import { ConfirmModal } from '../../../../components/base/ConfirmModal';

interface VehicleTypeModalProps {
  orgId: string;
  /** País por defecto (ej: el país del almacén activo) */
  defaultCountryId?: string | null;
  vehicleType: VehicleType | null;
  onClose: () => void;
  onSave: () => void;
}

interface CountryOption {
  id: string;
  name: string;
}

export default function VehicleTypeModal({ orgId, defaultCountryId, vehicleType, onClose, onSave }: VehicleTypeModalProps) {
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [countryId, setCountryId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Países
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(false);

  // ── Draft persistence ─────────────────────────────────────────────────────
  const isNewRecord = !vehicleType;
  const DRAFT_KEY = `draft_vehicle_type_${orgId}_new`;
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [draftAgeLabel, setDraftAgeLabel] = useState('');

  interface VehicleTypeDraft { name: string; countryId: string }
  const { saveDraft, clearDraft, readDraft } = useFormDraft<VehicleTypeDraft>({ storageKey: DRAFT_KEY, isNewRecord });

  // Cargar países disponibles
  useEffect(() => {
    if (!orgId) return;
    setCountriesLoading(true);
    countriesService.getAll(orgId)
      .then(data => setCountries(data.map(c => ({ id: c.id, name: c.name }))))
      .catch(() => setCountries([]))
      .finally(() => setCountriesLoading(false));
  }, [orgId]);

  useEffect(() => {
    if (vehicleType) {
      setName(vehicleType.name);
      setIsActive(vehicleType.is_active ?? vehicleType.active ?? true);
      setCountryId(vehicleType.country_id || '');
      setShowDraftBanner(false);
    } else {
      const draft = readDraft();
      if (draft) {
        setName(draft.formData.name);
        setCountryId(draft.formData.countryId || defaultCountryId || '');
        setDraftAgeLabel(getDraftAge(draft.savedAt));
        setShowDraftBanner(true);
      } else {
        setName('');
        setCountryId(defaultCountryId || '');
        setShowDraftBanner(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleType, defaultCountryId]);

  // Auto-save borrador
  useEffect(() => {
    if (!isNewRecord) return;
    saveDraft({ name, countryId });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, countryId, isNewRecord]);

  const handleClose = useCallback(() => {
    if (isNewRecord && name.trim()) {
      setShowDiscardConfirm(true);
      return;
    }
    clearDraft();
    onClose();
  }, [isNewRecord, name, clearDraft, onClose]);

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
    if (!name.trim()) { setError('El nombre es requerido'); return; }
    if (!countryId) { setError('El país es requerido'); return; }

    try {
      setSaving(true);
      setError(null);

      if (vehicleType) {
        await vehicleTypesService.update(vehicleType.id, { name: name.trim(), active: isActive, country_id: countryId });
      } else {
        await vehicleTypesService.create(orgId, name.trim(), countryId);
      }

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
            {vehicleType ? 'Editar Tipo de Vehículo' : 'Nuevo Tipo de Vehículo'}
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
                      className="px-3 py-1 text-xs font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 whitespace-nowrap cursor-pointer">
                      Continuar
                    </button>
                    <button type="button" onClick={() => { clearDraft(); setName(''); setCountryId(defaultCountryId || ''); setShowDraftBanner(false); }}
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

          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              placeholder="Ej: Cava 350" required />
          </div>

          {/* País */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              País <span className="text-red-500">*</span>
            </label>
            {countriesLoading ? (
              <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
                <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
                Cargando países...
              </div>
            ) : (
              <select
                value={countryId}
                onChange={(e) => setCountryId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm bg-white cursor-pointer"
                required
              >
                <option value="">Seleccionar país</option>
                {countries.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            <p className="mt-2 text-xs text-gray-500">
              Este tipo de vehículo solo será visible en los almacenes del país seleccionado.
            </p>
            {countries.length === 0 && !countriesLoading && (
              <p className="mt-1 text-xs text-amber-600">
                No hay países configurados. Creá un país en Almacenes antes de agregar tipos de vehículo.
              </p>
            )}
          </div>

          {/* Activo (solo al editar) */}
          {vehicleType && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-gray-300 cursor-pointer" />
                <span className="text-sm font-medium text-gray-700">Activo</span>
              </label>
              {!isActive && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                  <i className="ri-alert-line text-amber-600 w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5"></i>
                  <div>
                    <p className="text-xs font-semibold text-amber-800">Atención: inactivar un tipo de vehículo puede afectar reservas ya creadas.</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Las reservas existentes seguirán funcionando, pero este tipo ya no será visible en nuevas reservas.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

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
        message="¿Qué hacemos con los datos del tipo de vehículo que ingresaste?"
        confirmText="Descartar y cerrar"
        cancelText="Conservar borrador"
        showCancel
        onConfirm={handleDiscardAndClose}
        onCancel={handleKeepAndClose}
      />
    </div>
  );
}