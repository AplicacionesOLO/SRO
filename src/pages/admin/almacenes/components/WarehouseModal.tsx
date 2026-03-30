import { useState, FormEvent, useEffect, useCallback } from 'react';
import { Warehouse, WarehouseFormData } from '../../../../types/warehouse';
import type { Country } from '../../../../types/catalog';
import type { Client } from '../../../../types/client';
import { useFormDraft, getDraftAge } from '../../../../hooks/useReservationDraft';
import { ConfirmModal } from '../../../../components/base/ConfirmModal';

interface WarehouseModalProps {
  orgId: string;
  warehouse: Warehouse | null;
  countries: Country[];
  clients: Client[];
  assignedClientIds: string[];
  canManageClients: boolean;
  onClose: () => void;
  onSave: (formData: WarehouseFormData, clientIds: string[]) => Promise<void>;
}

export default function WarehouseModal({
  warehouse,
  countries,
  clients,
  assignedClientIds,
  canManageClients,
  onClose,
  onSave,
}: WarehouseModalProps) {
  const [formData, setFormData] = useState<WarehouseFormData>({
    name: '',
    location: '',
    country_id: '',
    business_start_time: '06:00',
    business_end_time: '17:00',
    slot_interval_minutes: 60,
  });

  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Draft persistence ─────────────────────────────────────────────────────
  const isNewRecord = !warehouse;
  const DRAFT_KEY = `draft_warehouse_new`;
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [draftAgeLabel, setDraftAgeLabel] = useState('');

  interface WarehouseDraft { formData: WarehouseFormData; selectedClientIds: string[] }
  const { saveDraft, clearDraft, readDraft } = useFormDraft<WarehouseDraft>({ storageKey: DRAFT_KEY, isNewRecord });

  useEffect(() => {
    if (warehouse) {
      setFormData({
        name: warehouse.name || '',
        location: (warehouse as any).location || '',
        country_id: warehouse.country_id || '',
        business_start_time: (warehouse as any).business_start_time || '06:00',
        business_end_time: (warehouse as any).business_end_time || '17:00',
        slot_interval_minutes: (warehouse as any).slot_interval_minutes || 60,
      });
      setSelectedClientIds(assignedClientIds || []);
      setShowDraftBanner(false);
    } else {
      const draft = readDraft();
      if (draft) {
        setFormData(draft.formData.formData);
        setSelectedClientIds(draft.formData.selectedClientIds || []);
        setDraftAgeLabel(getDraftAge(draft.savedAt));
        setShowDraftBanner(true);
      } else {
        setFormData({ name: '', location: '', country_id: '', business_start_time: '06:00', business_end_time: '17:00', slot_interval_minutes: 60 });
        setSelectedClientIds([]);
        setShowDraftBanner(false);
      }
    }
    setErrors({});
  }, [warehouse, assignedClientIds]);

  // Auto-save borrador
  useEffect(() => {
    if (!isNewRecord) return;
    saveDraft({ formData, selectedClientIds });
  }, [formData, selectedClientIds, isNewRecord]);

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

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = 'El nombre es requerido';
    else if (formData.name.trim().length < 2) newErrors.name = 'El nombre debe tener al menos 2 caracteres';

    if (!formData.country_id) newErrors.country_id = 'El país es requerido';

    if (formData.business_end_time <= formData.business_start_time) {
      newErrors.business_end_time = 'La hora fin debe ser mayor que la hora inicio';
    }

    if (![15, 30, 60].includes(formData.slot_interval_minutes)) {
      newErrors.slot_interval_minutes = 'El intervalo debe ser 15, 30 o 60 minutos';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setErrors({});
    try {
      await onSave(
        { ...formData, name: formData.name.trim(), location: formData.location?.trim() || '' },
        selectedClientIds
      );
      clearDraft();
    } catch (error: any) {
      setErrors((prev) => ({ ...prev, submit: error?.message || 'Error al guardar el almacén' }));
    } finally {
      setSaving(false);
    }
  };

  const toggleClient = (clientId: string) => {
    setSelectedClientIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]
    );
  };

  const activeClients = clients.filter((c) => c.is_active);
  const filteredClients = activeClients.filter((c) => {
    if (!clientSearch.trim()) return true;
    const term = clientSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(term) ||
      (c.legal_id && c.legal_id.toLowerCase().includes(term)) ||
      (c.email && c.email.toLowerCase().includes(term))
    );
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            {warehouse ? 'Editar Almacén' : 'Nuevo Almacén'}
          </h2>
          <button onClick={handleClose} disabled={saving}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <i className="ri-close-line text-xl w-5 h-5 flex items-center justify-center"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Banner de borrador */}
          {showDraftBanner && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <i className="ri-save-line text-teal-600 text-lg w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5"></i>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-teal-900">Borrador guardado {draftAgeLabel}</p>
                  <p className="text-xs text-teal-700 mt-0.5">Se restauraron los datos del almacén que ingresaste anteriormente.</p>
                  <div className="flex gap-2 mt-3">
                    <button type="button" onClick={() => setShowDraftBanner(false)}
                      className="px-3 py-1.5 text-xs font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap">
                      Continuar con el borrador
                    </button>
                    <button type="button" onClick={() => { clearDraft(); setFormData({ name: '', location: '', country_id: '', business_start_time: '06:00', business_end_time: '17:00', slot_interval_minutes: 60 }); setSelectedClientIds([]); setShowDraftBanner(false); }}
                      className="px-3 py-1.5 text-xs font-medium border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap">
                      Descartar y empezar nuevo
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {errors.submit && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{errors.submit}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={`w-full px-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent ${
                errors.name ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Ej: Almacén Central"
              disabled={saving}
              autoFocus
            />
            {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ubicación
            </label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              placeholder="Ej: Calle Principal 123, Ciudad"
              disabled={saving}
            />
            <p className="mt-1 text-xs text-gray-500">
              Opcional: dirección o descripción de la ubicación
            </p>
          </div>

          {/* País */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              País <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.country_id}
              onChange={(e) => setFormData({ ...formData, country_id: e.target.value })}
              className={`w-full px-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent ${
                errors.country_id ? 'border-red-500' : 'border-gray-300'
              }`}
              disabled={saving}
              required
            >
              <option value="">Seleccionar país</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.country_id && <p className="mt-1 text-sm text-red-500">{errors.country_id}</p>}
          </div>

          <div className="border-t border-gray-200 pt-4 mt-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Configuración de Agenda
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hora inicio reservas <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  value={formData.business_start_time}
                  onChange={(e) => setFormData({ ...formData, business_start_time: e.target.value })}
                  className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  disabled={saving}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hora fin reservas <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  value={formData.business_end_time}
                  onChange={(e) => setFormData({ ...formData, business_end_time: e.target.value })}
                  className={`w-full px-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent ${
                    errors.business_end_time ? 'border-red-500' : 'border-gray-300'
                  }`}
                  disabled={saving}
                />
                {errors.business_end_time && (
                  <p className="mt-1 text-sm text-red-500">{errors.business_end_time}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Intervalo de agenda <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.slot_interval_minutes}
                  onChange={(e) =>
                    setFormData({ ...formData, slot_interval_minutes: parseInt(e.target.value, 10) })
                  }
                  className={`w-full px-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent ${
                    errors.slot_interval_minutes ? 'border-red-500' : 'border-gray-300'
                  }`}
                  disabled={saving}
                >
                  <option value={15}>15 minutos</option>
                  <option value={30}>30 minutos</option>
                  <option value={60}>60 minutos</option>
                </select>
                {errors.slot_interval_minutes && (
                  <p className="mt-1 text-sm text-red-500">{errors.slot_interval_minutes}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Define el tamaño de los segmentos en el calendario
                </p>
              </div>
            </div>
          </div>

          {/* Sección de Clientes con acceso */}
          {canManageClients && (
            <div className="border-t border-gray-200 pt-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">
                  Clientes con acceso
                </h3>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                  Seleccionados: {selectedClientIds.length}
                </span>
              </div>

              <p className="text-xs text-gray-600 mb-3">
                Define qué clientes pueden acceder a los andenes de este almacén
              </p>

              {/* Buscador */}
              <div className="relative mb-3">
                <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm w-4 h-4 flex items-center justify-center"></i>
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Buscar cliente..."
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  disabled={saving}
                />
              </div>

              {/* Lista de clientes */}
              {activeClients.length === 0 ? (
                <div className="text-center py-6 bg-gray-50 rounded-lg border border-gray-200">
                  <i className="ri-user-line text-3xl text-gray-400 mb-2"></i>
                  <p className="text-sm text-gray-600">No hay clientes activos</p>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
                  {filteredClients.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-sm text-gray-500">No se encontraron clientes</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-200">
                      {filteredClients.map((client) => (
                        <label
                          key={client.id}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedClientIds.includes(client.id)}
                            onChange={() => toggleClient(client.id)}
                            disabled={saving}
                            className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500 cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {client.name}
                            </p>
                            {client.legal_id && (
                              <p className="text-xs text-gray-500 truncate">
                                {client.legal_id}
                              </p>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button type="button" onClick={handleClose} disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap">
              {saving ? (
                <>
                  <i className="ri-loader-4-line animate-spin text-lg w-5 h-5 flex items-center justify-center"></i>
                  Guardando...
                </>
              ) : (
                <>
                  <i className="ri-save-line text-lg w-5 h-5 flex items-center justify-center"></i>
                  {warehouse ? 'Actualizar' : 'Crear'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <ConfirmModal
        isOpen={showDiscardConfirm}
        type="warning"
        title="Tenés un borrador sin guardar"
        message="¿Qué hacemos con los datos del almacén que ingresaste?"
        confirmText="Descartar y cerrar"
        cancelText="Conservar borrador"
        showCancel
        onConfirm={handleDiscardAndClose}
        onCancel={handleKeepAndClose}
      />
    </div>
  );
}
