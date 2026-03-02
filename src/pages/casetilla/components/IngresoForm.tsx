import { useState } from 'react';
import type { CreateCasetillaIngresoInput } from '../../../types/casetilla';

interface IngresoFormProps {
  onSubmit: (data: CreateCasetillaIngresoInput) => Promise<void>;
  onCancel: () => void;
  initialData?: Partial<CreateCasetillaIngresoInput>;
  isSubmitting?: boolean;
}

function IngresoForm({ onSubmit, onCancel, initialData, isSubmitting }: IngresoFormProps) {
  const [formData, setFormData] = useState<CreateCasetillaIngresoInput>({
    chofer: initialData?.chofer || '',
    matricula: initialData?.matricula || '',
    dua: initialData?.dua || '',
    factura: initialData?.factura || '',
    orden_compra: initialData?.orden_compra || '',
    numero_pedido: initialData?.numero_pedido || '',
    reservation_id: initialData?.reservation_id // ✅ NUEVO: Preservar reservation_id
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  const handleChange = (field: keyof CreateCasetillaIngresoInput, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      {/* Header con botón volver - Responsive */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Registro de Ingreso</h2>
          <p className="text-sm text-gray-600 mt-1">Complete los datos del ingreso del vehículo</p>
        </div>
        <button
          onClick={onCancel}
          disabled={isSubmitting}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          <i className="ri-arrow-left-line"></i>
          Volver
        </button>
      </div>

      {/* ✅ NUEVO: Banner informativo si viene de una reserva específica */}
      {formData.reservation_id && (
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 flex items-start gap-3">
          <i className="ri-information-line text-teal-600 text-xl flex-shrink-0 mt-0.5"></i>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-teal-900">Ingreso vinculado a reserva</p>
            <p className="text-sm text-teal-700 mt-1">
              Este ingreso actualizará automáticamente el estado de la reserva seleccionada.
            </p>
          </div>
        </div>
      )}

      {/* Formulario - Responsive */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Grid responsive: 1 columna en móvil, 2 en tablet+ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {/* DUA */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              DUA <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="dua"
              value={formData.dua}
              onChange={(e) => handleChange('dua', e.target.value)}
              disabled={isSubmitting}
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="Ingrese el DUA"
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
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
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
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="Nombre del chofer"
            />
          </div>

          {/* Cédula */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cédula
            </label>
            <input
              type="text"
              name="cedula"
              value={formData.cedula || ''}
              onChange={(e) => handleChange('cedula', e.target.value)}
              disabled={isSubmitting}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
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
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
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
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
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
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed resize-none"
            placeholder="Observaciones adicionales..."
          />
        </div>

        {/* Botones - Responsive */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:w-auto px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap"
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
    </div>
  );
}

export default IngresoForm;
