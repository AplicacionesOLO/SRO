import { useState, useEffect } from 'react';
import type { CreateCasetillaIngresoInput, PendingReservation } from '../../../types/casetilla';
import PhotoUploader from '../../../components/base/PhotoUploader';

interface IngresoFormProps {
  onSubmit: (data: CreateCasetillaIngresoInput) => Promise<void>;
  onCancel: () => void;
  initialData?: Partial<CreateCasetillaIngresoInput>;
  /** Reserva vinculada completa (para advertencia de sobrescritura y validación DUA) */
  linkedReservation?: PendingReservation | null;
  isSubmitting?: boolean;
  orgId: string;
  initialFotos?: string[];
  onFotosChange?: (urls: string[]) => void;
  /** Clave de sessionStorage para persistencia directa del PhotoUploader */
  photoSessionKey?: string;
}

/** Detecta qué campos del ingreso difieren de los datos actuales de la reserva */
function detectOverwrites(
  formData: CreateCasetillaIngresoInput,
  reservation: PendingReservation
): string[] {
  const changed: string[] = [];

  const check = (reservationVal: string | null | undefined, ingresoVal: string | undefined, label: string) => {
    const rv = (reservationVal ?? '').trim();
    const iv = (ingresoVal ?? '').trim();
    if (rv && iv && rv !== iv) changed.push(label);
  };

  check(reservation.chofer, formData.chofer, 'Chofer');
  check(reservation.placa, formData.matricula, 'Matrícula');
  check(reservation.dua, formData.dua, 'DUA');
  check(reservation.orden_compra, formData.orden_compra, 'Orden de Compra');
  check(reservation.numero_pedido, formData.numero_pedido, 'Número de Pedido');
  check(reservation.notes, formData.observaciones, 'Observaciones');

  return changed;
}

function IngresoForm({
  onSubmit,
  onCancel,
  initialData,
  linkedReservation,
  isSubmitting,
  orgId,
  initialFotos = [],
  onFotosChange,
  photoSessionKey,
}: IngresoFormProps) {
  const [formData, setFormData] = useState<CreateCasetillaIngresoInput>({
    chofer: initialData?.chofer || '',
    matricula: initialData?.matricula || '',
    dua: initialData?.dua || '',
    factura: initialData?.factura || '',
    cedula: initialData?.cedula || '',
    orden_compra: initialData?.orden_compra || '',
    numero_pedido: initialData?.numero_pedido || '',
    observaciones: initialData?.observaciones || '',
    reservation_id: initialData?.reservation_id,
  });

  const [fotos, setFotosLocal] = useState<string[]>(initialFotos);
  const [photoError, setPhotoError] = useState<string | null>(null);

  /** true si DUA es obligatorio para esta reserva (ya tiene DUA o se sabe que es importada) */
  const isDuaRequired = !!(linkedReservation?.is_imported);

  /** Advertencia de sobrescritura: qué campos ya tenían valor en la reserva y el usuario modificó */
  const [overwriteWarning, setOverwriteWarning] = useState<string[]>([]);
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const [pendingSubmitData, setPendingSubmitData] = useState<CreateCasetillaIngresoInput | null>(null);

  useEffect(() => {
    setFotosLocal(initialFotos);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFotosChange = (urls: string[]) => {
    setFotosLocal(urls);
    onFotosChange?.(urls);
    if (urls.length >= 3) setPhotoError(null);
  };

  const handleChange = (field: keyof CreateCasetillaIngresoInput, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Resetear confirmación de sobrescritura si el usuario sigue editando
    if (overwriteConfirmed) setOverwriteConfirmed(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validar fotos
    if (fotos.length < 3) {
      setPhotoError(`Se requieren al menos 3 fotos. Faltan ${3 - fotos.length} foto${3 - fotos.length !== 1 ? 's' : ''}.`);
      return;
    }
    setPhotoError(null);

    const submitData = { ...formData, fotos };

    // Verificar si hay campos que van a sobrescribir datos existentes en la reserva
    if (linkedReservation && !overwriteConfirmed) {
      const changedFields = detectOverwrites(submitData, linkedReservation);
      if (changedFields.length > 0) {
        setOverwriteWarning(changedFields);
        setPendingSubmitData(submitData);
        setShowOverwriteDialog(true);
        return;
      }
    }

    await onSubmit(submitData);
  };

  const handleConfirmOverwrite = async () => {
    setShowOverwriteDialog(false);
    setOverwriteConfirmed(true);
    if (pendingSubmitData) {
      await onSubmit(pendingSubmitData);
    }
  };

  const handleCancelOverwrite = () => {
    setShowOverwriteDialog(false);
    setPendingSubmitData(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Registro de Ingreso</h2>
          <p className="text-sm text-gray-600 mt-1">Complete los datos del ingreso del vehículo</p>
        </div>
        <button
          onClick={onCancel}
          disabled={isSubmitting}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
        >
          <i className="ri-arrow-left-line"></i>
          Volver
        </button>
      </div>

      {/* Banner: ingreso vinculado */}
      {formData.reservation_id && (
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 flex items-start gap-3">
          <i className="ri-link text-teal-600 text-xl flex-shrink-0 mt-0.5"></i>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-teal-900">Ingreso vinculado a reserva</p>
            <p className="text-sm text-teal-700 mt-1">
              Al guardar, el estado de la reserva se actualizará automáticamente y los datos
              del formulario se sincronizarán en la reserva original.
            </p>
          </div>
        </div>
      )}

      {/* Banner: DUA obligatorio por importación */}
      {isDuaRequired && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3">
          <i className="ri-alert-line text-amber-600 text-lg flex-shrink-0"></i>
          <div>
            <p className="text-sm text-amber-800">
              {linkedReservation?.cargo_type_name
                ? <>Tipo de carga: <strong>{linkedReservation.cargo_type_name}</strong> — el campo <strong>DUA</strong> es obligatorio.</>
                : <>Esta reserva es importada — el campo <strong>DUA</strong> es obligatorio.</>
              }
            </p>
          </div>
        </div>
      )}

      {/* Formulario */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">

          {/* DUA */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              DUA {isDuaRequired && <span className="text-red-500">*</span>}
              {!isDuaRequired && <span className="text-gray-400 text-xs ml-1">(opcional)</span>}
            </label>
            <input
              type="text"
              name="dua"
              value={formData.dua}
              onChange={(e) => handleChange('dua', e.target.value)}
              disabled={isSubmitting}
              required={isDuaRequired}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed text-sm"
              placeholder={isDuaRequired ? 'Ingrese el DUA (obligatorio)' : 'Ingrese el DUA'}
            />
          </div>

          {/* Matrícula */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Matrícula <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="matricula"
              value={formData.matricula}
              onChange={(e) => handleChange('matricula', e.target.value)}
              disabled={isSubmitting}
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed text-sm"
              placeholder="Ingrese la matrícula"
            />
          </div>

          {/* Chofer */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Chofer <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="chofer"
              value={formData.chofer}
              onChange={(e) => handleChange('chofer', e.target.value)}
              disabled={isSubmitting}
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed text-sm"
              placeholder="Nombre del chofer"
            />
          </div>

          {/* Cédula */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cédula <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="cedula"
              value={formData.cedula || ''}
              onChange={(e) => handleChange('cedula', e.target.value)}
              disabled={isSubmitting}
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed text-sm"
              placeholder="Cédula del chofer"
            />
          </div>

          {/* Orden de Compra */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Orden de Compra
            </label>
            <input
              type="text"
              name="orden_compra"
              value={formData.orden_compra || ''}
              onChange={(e) => handleChange('orden_compra', e.target.value)}
              disabled={isSubmitting}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed text-sm"
              placeholder="Número de OC"
            />
          </div>

          {/* Número de Pedido */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Número de Pedido
            </label>
            <input
              type="text"
              name="numero_pedido"
              value={formData.numero_pedido || ''}
              onChange={(e) => handleChange('numero_pedido', e.target.value)}
              disabled={isSubmitting}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed text-sm"
              placeholder="Número de pedido"
            />
          </div>
        </div>

        {/* Observaciones - Full width */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Observaciones
          </label>
          <textarea
            name="observaciones"
            value={formData.observaciones || ''}
            onChange={(e) => handleChange('observaciones', e.target.value)}
            disabled={isSubmitting}
            rows={4}
            maxLength={500}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed resize-none text-sm"
            placeholder="Observaciones adicionales..."
          />
          <p className="text-xs text-gray-400 mt-1 text-right">{(formData.observaciones || '').length}/500</p>
        </div>

        {/* Fotos */}
        <div className="border-t border-gray-100 pt-6">
          <PhotoUploader
            orgId={orgId}
            folder="ingreso"
            onChange={handleFotosChange}
            maxPhotos={5}
            disabled={isSubmitting}
            initialUrls={fotos}
            sessionKey={photoSessionKey}
          />
          {photoError && (
            <div className="mt-3 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
              <i className="ri-camera-line text-red-500 flex-shrink-0"></i>
              <p className="text-sm text-red-700 font-medium">{photoError}</p>
            </div>
          )}
        </div>

        {/* Botones */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:w-auto px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <i className="ri-loader-4-line animate-spin"></i>
                Registrando...
              </>
            ) : (
              <>
                <i className="ri-save-line"></i>
                Registrar Ingreso
              </>
            )}
          </button>
        </div>
      </form>

      {/* Dialog de advertencia de sobrescritura */}
      {showOverwriteDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 flex items-center justify-center bg-amber-100 rounded-full flex-shrink-0">
                <i className="ri-error-warning-line text-amber-600 text-xl"></i>
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Actualizar datos de la reserva</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Esta acción actualizará datos existentes de la reserva vinculada.
                  Los siguientes campos serán modificados:
                </p>
              </div>
            </div>

            <ul className="space-y-1 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
              {overwriteWarning.map((field) => (
                <li key={field} className="flex items-center gap-2 text-sm text-amber-800">
                  <i className="ri-edit-line text-amber-500 flex-shrink-0"></i>
                  {field}
                </li>
              ))}
            </ul>

            <p className="text-sm text-gray-500">
              ¿Deseas continuar y actualizar la reserva con los nuevos valores?
            </p>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleCancelOverwrite}
                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium whitespace-nowrap cursor-pointer"
              >
                Revisar datos
              </button>
              <button
                onClick={handleConfirmOverwrite}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm font-medium whitespace-nowrap disabled:opacity-50 cursor-pointer"
              >
                Sí, actualizar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default IngresoForm;
