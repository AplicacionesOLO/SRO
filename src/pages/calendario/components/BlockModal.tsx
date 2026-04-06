import { useState, useEffect, useCallback } from 'react';
import { usePermissions } from '../../../hooks/usePermissions';
import { calendarService, type DockTimeBlock, type Dock } from '../../../services/calendarService';
import { ConfirmModal } from '../../../components/base/ConfirmModal';
import { useFormDraft, getDraftAge } from '../../../hooks/useReservationDraft';
import {
  toWarehouseDateString,
  toWarehouseTimeString,
  fromWarehouseLocalToUtc,
  DEFAULT_TIMEZONE,
} from '../../../utils/timezoneUtils';

interface BlockModalProps {
  block: DockTimeBlock | null;
  docks: Dock[];
  onClose: () => void;
  onSave: () => void;
  /** Timezone IANA del almacén seleccionado */
  warehouseTimezone?: string;
  /** Habilita la edición de un bloqueo existente */
  allowEdit?: boolean;
  /** Muestra título "Renovar Bloqueo" en lugar de "Editar Bloqueo" */
  renewalMode?: boolean;
}

const WEEKDAYS = [
  { label: 'L', value: 1 },
  { label: 'M', value: 2 },
  { label: 'X', value: 3 },
  { label: 'J', value: 4 },
  { label: 'V', value: 5 },
  { label: 'S', value: 6 },
  { label: 'D', value: 0 },
];

const WEEKS_OPTIONS = [1, 2, 3, 4, 6, 8, 12];

/**
 * Convierte un Date UTC a string 'YYYY-MM-DDTHH:MM' en el timezone del almacén.
 * Esto es lo que necesita el input type="datetime-local".
 */
function toDatetimeLocalInTz(dateUtc: Date, timezone: string): string {
  const dateStr = toWarehouseDateString(dateUtc, timezone);
  const timeStr = toWarehouseTimeString(dateUtc, timezone);
  return `${dateStr}T${timeStr}`;
}

export default function BlockModal({
  block,
  docks,
  onClose,
  onSave,
  warehouseTimezone = DEFAULT_TIMEZONE,
  allowEdit = false,
  renewalMode = false,
}: BlockModalProps) {
  const { can, orgId } = usePermissions();
  const [loading, setLoading] = useState(false);

  // formData almacena strings 'YYYY-MM-DDTHH:MM' en el timezone del almacén
  const [formData, setFormData] = useState({
    dock_id: '',
    start_datetime: '',
    end_datetime: '',
    reason: '',
  });

  // Persistencia (solo en modo creación)
  const [isPersistent, setIsPersistent] = useState(false);
  const [persistentWeekdays, setPersistentWeekdays] = useState<number[]>([]);
  const [weeksAhead, setWeeksAhead] = useState(4);

  const [pendingClose, setPendingClose] = useState(false);

  const [notifyModal, setNotifyModal] = useState({
    isOpen: false,
    type: 'info' as 'info' | 'warning' | 'error' | 'success',
    title: '',
    message: '',
  });

  const [confirmDeleteModal, setConfirmDeleteModal] = useState(false);

  // ── Draft persistence ─────────────────────────────────────────────────────
  const isNewRecord = !block;
  const DRAFT_KEY = `draft_block_${orgId || 'local'}_new`;
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [draftAgeLabel, setDraftAgeLabel] = useState('');

  interface BlockDraft { formData: typeof formData; isPersistent: boolean; persistentWeekdays: number[]; weeksAhead: number }
  const { saveDraft, clearDraft, readDraft } = useFormDraft<BlockDraft>({ storageKey: DRAFT_KEY, isNewRecord });

  // Determinar si los campos son editables
  const isEditable = !block || allowEdit;

  useEffect(() => {
    if (block) {
      // ✅ Convertir UTC → timezone del almacén para mostrar en el input
      const startUtc = new Date(block.start_datetime);
      const endUtc = new Date(block.end_datetime);
      setFormData({
        dock_id: block.dock_id,
        start_datetime: toDatetimeLocalInTz(startUtc, warehouseTimezone),
        end_datetime: toDatetimeLocalInTz(endUtc, warehouseTimezone),
        reason: block.reason,
      });
      setShowDraftBanner(false);
    } else {
      const draft = readDraft();
      if (draft) {
        setFormData(draft.formData.formData);
        setIsPersistent(draft.formData.isPersistent);
        setPersistentWeekdays(draft.formData.persistentWeekdays);
        setWeeksAhead(draft.formData.weeksAhead);
        setDraftAgeLabel(getDraftAge(draft.savedAt));
        setShowDraftBanner(true);
      } else {
        // ✅ Hora actual en el timezone del almacén
        const nowUtc = new Date();
        const oneHourLaterUtc = new Date(nowUtc.getTime() + 60 * 60 * 1000);
        setFormData({
          dock_id: docks[0]?.id || '',
          start_datetime: toDatetimeLocalInTz(nowUtc, warehouseTimezone),
          end_datetime: toDatetimeLocalInTz(oneHourLaterUtc, warehouseTimezone),
          reason: '',
        });
        setShowDraftBanner(false);
      }
    }
  }, [block, docks, warehouseTimezone]);

  // Auto-save borrador
  useEffect(() => {
    if (!isNewRecord) return;
    saveDraft({ formData, isPersistent, persistentWeekdays, weeksAhead });
  }, [formData, isPersistent, persistentWeekdays, weeksAhead, isNewRecord]);

  const handlePersistentToggle = (checked: boolean) => {
    setIsPersistent(checked);
    if (checked && formData.start_datetime) {
      // ✅ Calcular día de la semana en el timezone del almacén
      const [datePart] = formData.start_datetime.split('T');
      const [timePart] = formData.start_datetime.split('T').slice(1);
      const startUtc = fromWarehouseLocalToUtc(datePart, timePart || '00:00', warehouseTimezone);
      // getDay() en UTC puede diferir; usamos el datePart directamente
      const dayOfWeek = new Date(`${datePart}T12:00:00Z`).getUTCDay();
      setPersistentWeekdays([dayOfWeek]);
    } else if (!checked) {
      setPersistentWeekdays([]);
    }
  };

  const toggleWeekday = (day: number) => {
    setPersistentWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleNotifyClose = () => {
    setNotifyModal((prev) => ({ ...prev, isOpen: false }));
    if (pendingClose) {
      setPendingClose(false);
      onSave();
    }
  };

  const handleClose = useCallback(() => {
    if (isNewRecord && formData.reason.trim()) {
      setShowDiscardConfirm(true);
      return;
    }
    clearDraft();
    onClose();
  }, [isNewRecord, formData.reason, clearDraft, onClose]);

  const handleDiscardAndClose = useCallback(() => {
    setShowDiscardConfirm(false);
    clearDraft();
    onClose();
  }, [clearDraft, onClose]);

  const handleKeepAndClose = useCallback(() => {
    setShowDiscardConfirm(false);
    onClose();
  }, [onClose]);

  /**
   * Parsea el string 'YYYY-MM-DDTHH:MM' del input (que está en timezone del almacén)
   * y lo convierte a Date UTC usando fromWarehouseLocalToUtc.
   */
  const parseLocalInputToUtc = (datetimeLocal: string): Date => {
    const [datePart, timePart] = datetimeLocal.split('T');
    return fromWarehouseLocalToUtc(datePart, timePart || '00:00', warehouseTimezone);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!orgId) {
      setNotifyModal({ isOpen: true, type: 'error', title: 'Error', message: 'No se pudo identificar la organización' });
      return;
    }

    if (!formData.dock_id || !formData.start_datetime || !formData.end_datetime || !formData.reason) {
      setNotifyModal({ isOpen: true, type: 'warning', title: 'Campos incompletos', message: 'Por favor completa todos los campos' });
      return;
    }

    // ✅ Convertir hora local del almacén → UTC para persistir
    const start = parseLocalInputToUtc(formData.start_datetime);
    const end = parseLocalInputToUtc(formData.end_datetime);

    if (end <= start) {
      setNotifyModal({ isOpen: true, type: 'warning', title: 'Fecha inválida', message: 'La fecha de fin debe ser posterior a la fecha de inicio' });
      return;
    }

    if (isPersistent && !block && persistentWeekdays.length === 0) {
      setNotifyModal({ isOpen: true, type: 'warning', title: 'Días requeridos', message: 'Selecciona al menos un día de la semana para el bloqueo persistente' });
      return;
    }

    try {
      setLoading(true);

      // ── MODO EDICIÓN (actualizar bloqueo existente) ──
      if (block && allowEdit) {
        await calendarService.updateDockTimeBlock(block.id, {
          dock_id: formData.dock_id,
          start_datetime: start.toISOString(),
          end_datetime: end.toISOString(),
          reason: formData.reason,
        });
        clearDraft();
        onSave();
        return;
      }

      // ── MODO CREACIÓN ──
      if (isPersistent) {
        const result = await calendarService.createPersistentDockTimeBlock({
          orgId,
          dockId: formData.dock_id,
          baseStart: start.toISOString(),
          baseEnd: end.toISOString(),
          reason: formData.reason,
          weekdays: persistentWeekdays,
          weeksAhead,
        });

        if (result.created === 0) {
          setNotifyModal({
            isOpen: true,
            type: 'warning',
            title: 'Sin bloqueos creados',
            message: `Los ${result.skipped} bloques generados colisionaron con reglas de Cliente Retira activas y fueron omitidos. Las reglas de cliente tienen prioridad.`,
          });
        } else if (result.skipped > 0) {
          setPendingClose(true);
          setNotifyModal({
            isOpen: true,
            type: 'info',
            title: 'Bloqueos persistentes creados',
            message: `Se crearon ${result.created} bloqueo${result.created !== 1 ? 's' : ''}. ${result.skipped} ${result.skipped !== 1 ? 'fueron omitidos' : 'fue omitido'} por colisión con reglas de Cliente Retira activas.`,
          });
        } else {
          clearDraft();
          onSave();
        }
      } else {
        await calendarService.createDockTimeBlock({
          org_id: orgId,
          dock_id: formData.dock_id,
          start_datetime: start.toISOString(),
          end_datetime: end.toISOString(),
          reason: formData.reason,
        });
        clearDraft();
        onSave();
      }
    } catch (error: any) {
      setNotifyModal({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: error?.message || 'Error al guardar bloqueo',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!block) return;
    setConfirmDeleteModal(false);
    try {
      setLoading(true);
      await calendarService.deleteDockTimeBlock(block.id);
      onSave();
    } catch (error: any) {
      setNotifyModal({ isOpen: true, type: 'error', title: 'Error', message: error?.message || 'Error al eliminar bloqueo' });
    } finally {
      setLoading(false);
    }
  };

  // Título del modal
  const modalTitle = block
    ? renewalMode
      ? 'Renovar Bloqueo'
      : allowEdit
      ? 'Editar Bloqueo'
      : 'Detalles del Bloqueo'
    : 'Nuevo Bloqueo de Tiempo';

  // ✅ Función para resetear a nuevo borrador (usa timezone del almacén)
  const handleDiscardDraftAndStartNew = () => {
    clearDraft();
    const nowUtc = new Date();
    const oneHourLaterUtc = new Date(nowUtc.getTime() + 60 * 60 * 1000);
    setFormData({
      dock_id: docks[0]?.id || '',
      start_datetime: toDatetimeLocalInTz(nowUtc, warehouseTimezone),
      end_datetime: toDatetimeLocalInTz(oneHourLaterUtc, warehouseTimezone),
      reason: '',
    });
    setIsPersistent(false);
    setPersistentWeekdays([]);
    setShowDraftBanner(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{modalTitle}</h2>
            {block && (
              <p className="text-sm text-gray-500 mt-1">
                Creado por {block.creator?.name || 'Usuario'} el{' '}
                {new Date(block.created_at).toLocaleDateString()}
              </p>
            )}
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-2xl text-gray-500"></i>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6">
          {/* Banner de borrador */}
          {showDraftBanner && (
            <div className="mb-4 bg-teal-50 border border-teal-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <i className="ri-save-line text-teal-600 text-lg w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5"></i>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-teal-900">Borrador guardado {draftAgeLabel}</p>
                  <p className="text-xs text-teal-700 mt-0.5">Se restauraron los datos del bloqueo que ingresaste anteriormente.</p>
                  <div className="flex gap-2 mt-2">
                    <button type="button" onClick={() => setShowDraftBanner(false)}
                      className="px-3 py-1 text-xs font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 whitespace-nowrap">
                      Continuar con el borrador
                    </button>
                    <button type="button" onClick={handleDiscardDraftAndStartNew}
                      className="px-3 py-1 text-xs border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 whitespace-nowrap">
                      Descartar y empezar nuevo
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {/* Andén */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Andén *</label>
              <select
                value={formData.dock_id}
                onChange={(e) => setFormData({ ...formData, dock_id: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                required
                disabled={!isEditable}
              >
                <option value="">Seleccionar andén</option>
                {docks.map((dock) => (
                  <option key={dock.id} value={dock.id}>
                    {dock.name} {dock.category ? `- ${dock.category.name}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Fecha y hora inicio */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha y hora de inicio *
                <span className="ml-2 text-xs text-gray-400 font-normal">({warehouseTimezone})</span>
              </label>
              <input
                type="datetime-local"
                value={formData.start_datetime}
                onChange={(e) => setFormData({ ...formData, start_datetime: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                required
                disabled={!isEditable}
              />
            </div>

            {/* Fecha y hora fin */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha y hora de fin *
                <span className="ml-2 text-xs text-gray-400 font-normal">({warehouseTimezone})</span>
              </label>
              <input
                type="datetime-local"
                value={formData.end_datetime}
                onChange={(e) => setFormData({ ...formData, end_datetime: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                required
                disabled={!isEditable}
              />
            </div>

            {/* Motivo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Motivo del bloqueo *
              </label>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none text-sm"
                placeholder="Ej: Mantenimiento programado, reparación de equipos..."
                required
                disabled={!isEditable}
              />
            </div>

            {/* Persistencia (solo en creación) */}
            {!block && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => handlePersistentToggle(!isPersistent)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${isPersistent ? 'bg-teal-500' : 'bg-gray-300'}`}>
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isPersistent ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                    <span className="text-sm font-medium text-gray-700">Bloqueo persistente</span>
                    <span className="text-xs text-gray-400">(se repite semanalmente)</span>
                  </div>
                  <i className={`ri-arrow-${isPersistent ? 'up' : 'down'}-s-line text-gray-400`}></i>
                </button>

                {isPersistent && (
                  <div className="px-4 py-4 space-y-4 border-t border-gray-200">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Repetir los días *
                      </label>
                      <div className="flex gap-2">
                        {WEEKDAYS.map(({ label, value }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => toggleWeekday(value)}
                            className={`w-9 h-9 rounded-full text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                              persistentWeekdays.includes(value)
                                ? 'bg-teal-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {persistentWeekdays.length === 0 && (
                        <p className="text-xs text-red-500 mt-1">Selecciona al menos un día</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Crear bloques para las próximas
                      </label>
                      <div className="flex gap-2 flex-wrap">
                        {WEEKS_OPTIONS.map((w) => (
                          <button
                            key={w}
                            type="button"
                            onClick={() => setWeeksAhead(w)}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                              weeksAhead === w
                                ? 'bg-teal-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {w} {w === 1 ? 'semana' : 'semanas'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                      <i className="ri-information-line text-amber-500 text-sm mt-0.5 flex-shrink-0"></i>
                      <p className="text-xs text-amber-700 leading-relaxed">
                        Las <strong>reglas de Cliente Retira</strong> tienen prioridad. Si un día coincide con una regla de cliente activa, ese bloqueo se omitirá automáticamente sin error.
                      </p>
                    </div>

                    {persistentWeekdays.length > 0 && (
                      <div className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">
                        Se intentarán crear bloques los{' '}
                        <strong>
                          {persistentWeekdays
                            .map((d) => WEEKDAYS.find((w) => w.value === d)?.label)
                            .filter(Boolean)
                            .join(', ')}
                        </strong>{' '}
                        durante las próximas <strong>{weeksAhead} semanas</strong>.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Aviso en modo renovación */}
            {renewalMode && (
              <div className="flex items-start gap-2 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2.5">
                <i className="ri-refresh-line text-teal-600 text-sm mt-0.5 flex-shrink-0"></i>
                <p className="text-xs text-teal-700 leading-relaxed">
                  Estás renovando este bloqueo. Modifica las fechas o la duración según sea necesario y guarda los cambios.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200">
            <div>
              {block && can('dock_blocks.delete') && (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteModal(true)}
                  disabled={loading}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
                >
                  <i className="ri-delete-bin-line mr-2"></i>
                  Eliminar
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
              >
                Cancelar
              </button>
              {/* Botón guardar: creación O edición con allowEdit */}
              {(!block && can('dock_blocks.create')) || (block && allowEdit && can('dock_blocks.update')) ? (
                <button
                  type="submit"
                  disabled={loading || (!block && isPersistent && persistentWeekdays.length === 0)}
                  className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
                >
                  {loading ? (
                    <>
                      <i className="ri-loader-4-line animate-spin mr-2"></i>
                      {block ? 'Guardando...' : isPersistent ? 'Creando bloques...' : 'Guardando...'}
                    </>
                  ) : (
                    <>
                      <i className={`${renewalMode ? 'ri-refresh-line' : 'ri-save-line'} mr-2`}></i>
                      {block
                        ? renewalMode
                          ? 'Confirmar Renovación'
                          : 'Guardar Cambios'
                        : isPersistent
                        ? 'Crear bloqueos persistentes'
                        : 'Crear Bloqueo'}
                    </>
                  )}
                </button>
              ) : null}
            </div>
          </div>
        </form>
      </div>

      <ConfirmModal
        isOpen={notifyModal.isOpen}
        type={notifyModal.type}
        title={notifyModal.title}
        message={notifyModal.message}
        onConfirm={handleNotifyClose}
        onCancel={handleNotifyClose}
      />

      <ConfirmModal
        isOpen={confirmDeleteModal}
        type="warning"
        title="Confirmar eliminación"
        message="¿Estás seguro de que deseas eliminar este bloqueo? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        cancelText="Cancelar"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmDeleteModal(false)}
      />

      <ConfirmModal
        isOpen={showDiscardConfirm}
        type="warning"
        title="Tenés un borrador sin guardar"
        message="¿Qué hacemos con los datos del bloqueo que ingresaste?"
        confirmText="Descartar y cerrar"
        cancelText="Conservar borrador"
        showCancel
        onConfirm={handleDiscardAndClose}
        onCancel={handleKeepAndClose}
      />
    </div>
  );
}
