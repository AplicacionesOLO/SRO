
import { useState } from 'react';

interface ExitFormProps {
  reservation: {
    id: string;
    chofer: string;
    matricula: string;
    dua?: string | null;
    provider_name?: string | null;
    warehouse_name?: string | null;
  } | null;
  onSubmit: () => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export default function ExitForm({
  reservation,
  onSubmit,
  onCancel,
  isSubmitting
}: ExitFormProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSubmitClick = () => {
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    setShowConfirm(false);
    await onSubmit();
  };

  if (!reservation) {
    return (
      <div className="text-center py-12">
        <i className="ri-error-warning-line text-5xl text-gray-400"></i>
        <p className="mt-4 text-gray-600">No hay datos de reserva seleccionados</p>
        <button
          onClick={onCancel}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap cursor-pointer"
        >
          <i className="ri-arrow-left-line"></i>
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
            <i className="ri-logout-box-line text-xl sm:text-2xl text-emerald-600"></i>
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Registrar Salida</h2>
            <p className="text-sm text-gray-600">Confirme los datos del vehículo que sale del almacén</p>
          </div>
        </div>
      </div>

      {/* Formulario */}
      <div className="space-y-6">
        {/* Información precargada - Solo lectura */}
        <div className="bg-gray-50 rounded-lg p-4 sm:p-6 border border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <i className="ri-information-line text-lg text-gray-600"></i>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Datos de la Reserva
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {/* Matrícula */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Matrícula
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <i className="ri-car-line text-gray-400"></i>
                </div>
                <input
                  type="text"
                  value={reservation.matricula}
                  readOnly
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg text-gray-900 font-semibold cursor-not-allowed"
                />
              </div>
            </div>

            {/* Chofer */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Chofer
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <i className="ri-user-line text-gray-400"></i>
                </div>
                <input
                  type="text"
                  value={reservation.chofer}
                  readOnly
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg text-gray-900 cursor-not-allowed"
                />
              </div>
            </div>

            {/* Proveedor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Proveedor
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <i className="ri-building-line text-gray-400"></i>
                </div>
                <input
                  type="text"
                  value={reservation.provider_name || 'N/A'}
                  readOnly
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg text-gray-900 cursor-not-allowed"
                />
              </div>
            </div>

            {/* Almacén */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Almacén
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <i className="ri-store-2-line text-gray-400"></i>
                </div>
                <input
                  type="text"
                  value={reservation.warehouse_name || 'N/A'}
                  readOnly
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg text-gray-900 cursor-not-allowed"
                />
              </div>
            </div>

            {/* DUA (si existe) */}
            {reservation.dua && (
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  DUA
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <i className="ri-file-text-line text-gray-400"></i>
                  </div>
                  <input
                    type="text"
                    value={reservation.dua}
                    readOnly
                    className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg text-gray-900 cursor-not-allowed"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Nota informativa */}
          <div className="mt-4 flex items-start gap-2 text-xs text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <i className="ri-information-line text-blue-600 mt-0.5 flex-shrink-0"></i>
            <p>
              Los datos mostrados provienen de la reserva seleccionada y no pueden ser modificados.
            </p>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
          >
            <i className="ri-close-line"></i>
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleSubmitClick}
            disabled={isSubmitting}
            className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <i className="ri-loader-4-line animate-spin"></i>
                Registrando...
              </>
            ) : (
              <>
                <i className="ri-check-line"></i>
                Registrar Salida
              </>
            )}
          </button>
        </div>
      </div>

      {/* Modal de confirmación */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                <i className="ri-question-line text-2xl text-emerald-600"></i>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  ¿Registrar salida?
                </h3>
                <p className="text-sm text-gray-600 mb-6">
                  Se registrará la salida del vehículo <strong>{reservation.matricula}</strong> conducido por <strong>{reservation.chofer}</strong>.
                </p>
                <div className="flex flex-col-reverse sm:flex-row gap-3">
                  <button
                    onClick={() => setShowConfirm(false)}
                    disabled={isSubmitting}
                    className="w-full sm:w-auto px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={isSubmitting}
                    className="w-full sm:flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
                  >
                    {isSubmitting ? 'Registrando...' : 'Aceptar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
