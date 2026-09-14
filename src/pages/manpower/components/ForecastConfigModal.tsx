import { useState, useEffect } from 'react';

interface ForecastConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (marginPct: number, appointmentLimit: number | null) => Promise<void> | void;
  marginPct: number;
  appointmentLimit: number | null;
  saving?: boolean;
}

export default function ForecastConfigModal({
  isOpen,
  onClose,
  onSave,
  marginPct,
  appointmentLimit,
  saving,
}: ForecastConfigModalProps) {
  const [margin, setMargin] = useState<number>(marginPct);
  const [limit, setLimit] = useState<string>(appointmentLimit != null ? String(appointmentLimit) : '');

  useEffect(() => {
    if (isOpen) {
      setMargin(marginPct);
      setLimit(appointmentLimit != null ? String(appointmentLimit) : '');
    }
  }, [isOpen, marginPct, appointmentLimit]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const limitValue = limit.trim() === '' ? null : Number(limit);
    onSave(margin, limitValue);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose}></div>
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Configuración del pronóstico</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Margen recomendado (%)
            </label>
            <input
              type="number"
              min={0}
              max={200}
              value={margin}
              onChange={(e) => setMargin(Number(e.target.value))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              Los recursos recomendados se calculan sumando este % sobre el mínimo de cada regla.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Tope de citas por día
            </label>
            <input
              type="number"
              min={0}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="Sin tope"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              Si un día supera este número de citas, se dispara la alerta de mano de obra externa.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}