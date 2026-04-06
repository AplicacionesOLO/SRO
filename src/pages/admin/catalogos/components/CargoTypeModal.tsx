import { useState, useEffect, useCallback } from 'react';
import { cargoTypesService } from '../../../../services/cargoTypesService';
import { warehousesService } from '../../../../services/warehousesService';
import type { CargoType } from '../../../../types/catalog';
import { useFormDraft, getDraftAge } from '../../../../hooks/useReservationDraft';
import { ConfirmModal } from '../../../../components/base/ConfirmModal';

interface CargoTypeModalProps {
  orgId: string;
  warehouseId?: string | null;
  cargoType: CargoType | null;
  onClose: () => void;
  onSave: () => void;
}

interface WarehouseOption {
  id: string;
  name: string;
}

export default function CargoTypeModal({ orgId, warehouseId, cargoType, onClose, onSave }: CargoTypeModalProps) {
  const [name, setName] = useState('');
  const [defaultMinutes, setDefaultMinutes] = useState<string>('');
  const [isDynamic, setIsDynamic] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Almacenes
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<string[]>([]);
  const [warehousesLoading, setWarehousesLoading] = useState(false);

  // ── Draft persistence ─────────────────────────────────────────────────────
  const isNewRecord = !cargoType;
  const DRAFT_KEY = `draft_cargo_type_${orgId}_new`;
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [draftAgeLabel, setDraftAgeLabel] = useState('');

  interface CargoTypeDraft { name: string; defaultMinutes: string; isDynamic: boolean }
  const { saveDraft, clearDraft, readDraft } = useFormDraft<CargoTypeDraft>({ storageKey: DRAFT_KEY, isNewRecord });

  // Cargar almacenes disponibles
  useEffect(() => {
    if (!orgId) return;
    setWarehousesLoading(true);
    warehousesService.getAll(orgId)
      .then(data => setWarehouses(data.map(w => ({ id: w.id, name: w.name }))))
      .catch(() => setWarehouses([]))
      .finally(() => setWarehousesLoading(false));
  }, [orgId]);

  useEffect(() => {
    if (cargoType) {
      setName(cargoType.name);
      setDefaultMinutes(cargoType.default_minutes?.toString() || '');
      setIsDynamic(cargoType.is_dynamic);
      setIsActive(cargoType.is_active);
      setShowDraftBanner(false);
      // Cargar warehouses asignados
      cargoTypesService.getCargoTypeWarehouses(orgId, cargoType.id)
        .then(ids => setSelectedWarehouseIds(ids))
        .catch(() => setSelectedWarehouseIds([]));
    } else {
      const draft = readDraft();
      if (draft) {
        setName(draft.formData.name);
        setDefaultMinutes(draft.formData.defaultMinutes);
        setIsDynamic(draft.formData.isDynamic);
        setDraftAgeLabel(getDraftAge(draft.savedAt));
        setShowDraftBanner(true);
      } else {
        setName('');
        setDefaultMinutes('');
        setIsDynamic(false);
        setShowDraftBanner(false);
      }
      // Pre-seleccionar almacén activo
      if (warehouseId) {
        setSelectedWarehouseIds([warehouseId]);
      } else {
        setSelectedWarehouseIds([]);
      }
    }
  }, [cargoType, warehouseId]);

  // Auto-save borrador
  useEffect(() => {
    if (!isNewRecord) return;
    saveDraft({ name, defaultMinutes, isDynamic });
  }, [name, defaultMinutes, isDynamic, isNewRecord]);

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

  const handleToggleWarehouse = (wid: string) => {
    setSelectedWarehouseIds(prev =>
      prev.includes(wid) ? prev.filter(id => id !== wid) : [...prev, wid]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('El nombre es requerido'); return; }

    try {
      setSaving(true);
      setError(null);
      const minutes = defaultMinutes ? parseInt(defaultMinutes) : null;
      let savedId: string;

      if (cargoType) {
        await cargoTypesService.updateCargoType(cargoType.id, {
          name: name.trim(),
          default_minutes: minutes,
          is_dynamic: isDynamic,
          is_active: isActive,
        });
        savedId = cargoType.id;
      } else {
        const created = await cargoTypesService.createCargoType(orgId, name.trim(), minutes, isDynamic);
        savedId = created.id;
      }

      // Guardar relación con almacenes
      await cargoTypesService.setCargoTypeWarehouses(orgId, savedId, selectedWarehouseIds);

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
            {cargoType ? 'Editar Tipo de Carga' : 'Nuevo Tipo de Carga'}
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
                    <button type="button" onClick={() => { clearDraft(); setName(''); setDefaultMinutes(''); setIsDynamic(false); setShowDraftBanner(false); }}
                      className="px-3 py-1 text-xs border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 whitespace-nowrap">
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
              placeholder="Nombre del tipo de carga" required />
          </div>

          {/* Minutos */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Minutos por defecto</label>
            <input type="number" value={defaultMinutes} onChange={(e) => setDefaultMinutes(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              placeholder="Ej: 60" min="1" />
          </div>

          {/* Dinámico */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isDynamic} onChange={(e) => setIsDynamic(e.target.checked)}
                className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500 cursor-pointer" />
              <span className="text-sm text-gray-700">Dinámico</span>
            </label>
          </div>

          {/* Activo (solo al editar) */}
          {cargoType && (
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-gray-300" />
                <span className="text-sm font-medium text-gray-700">Activo</span>
              </label>
            </div>
          )}

          {/* Selector de almacenes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Almacenes asignados</label>
            <p className="text-xs text-gray-500 mb-3">
              Seleccioná los almacenes donde este tipo de carga aplica.
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
        message="¿Qué hacemos con los datos del tipo de carga que ingresaste?"
        confirmText="Descartar y cerrar"
        cancelText="Conservar borrador"
        showCancel
        onConfirm={handleDiscardAndClose}
        onCancel={handleKeepAndClose}
      />
    </div>
  );
}
