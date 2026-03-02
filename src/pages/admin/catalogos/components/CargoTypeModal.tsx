import { useState, useEffect } from 'react';
import { cargoTypesService } from '../../../../services/cargoTypesService';
import type { CargoType } from '../../../../types/catalog';

interface CargoTypeModalProps {
  orgId: string;
  cargoType: CargoType | null;
  onClose: () => void;
  onSave: () => void;
}

export default function CargoTypeModal({ orgId, cargoType, onClose, onSave }: CargoTypeModalProps) {
  // Log del service al cargar el componente
  console.log('[CargoTypeModal] using service', cargoTypesService);
  console.log('[CargoTypeModal] service methods', Object.keys(cargoTypesService));

  const [name, setName] = useState('');
  const [defaultMinutes, setDefaultMinutes] = useState<string>('');
  const [isDynamic, setIsDynamic] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: cargoType?.name || '',
    defaultMinutes: cargoType?.default_minutes || undefined,
    active: cargoType?.active ?? true
  });

  useEffect(() => {
    if (cargoType) {
      setName(cargoType.name);
      setDefaultMinutes(cargoType.default_minutes?.toString() || '');
      setIsDynamic(cargoType.is_dynamic);
      setIsActive(cargoType.is_active);
    }
  }, [cargoType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('El nombre es requerido');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const minutes = defaultMinutes ? parseInt(defaultMinutes) : null;

      console.log('[CargoTypeModal] Saving', { cargoType: !!cargoType, name, minutes, isDynamic, isActive });

      if (cargoType) {
        await cargoTypesService.updateCargoType(cargoType.id, {
          name: name.trim(),
          default_minutes: minutes,
          is_dynamic: isDynamic,
          is_active: isActive,
        });
      } else {
        await cargoTypesService.createCargoType(orgId, name.trim(), minutes, isDynamic);
      }

      console.log('[CargoTypeModal] Saved successfully');
      onSave();
    } catch (err) {
      console.error('[CargoTypeModal] Error saving', err);
      setError('Error al guardar tipo de carga');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            {cargoType ? 'Editar Tipo de Carga' : 'Nuevo Tipo de Carga'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-2xl w-6 h-6 flex items-center justify-center"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              placeholder="Nombre del tipo de carga"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Minutos por defecto
            </label>
            <input
              type="number"
              value={defaultMinutes}
              onChange={(e) => setDefaultMinutes(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              placeholder="Ej: 60"
              min="1"
            />
          </div>

          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isDynamic}
                onChange={(e) => setIsDynamic(e.target.checked)}
                className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500 cursor-pointer"
              />
              <span className="text-sm text-gray-700">Dinámico</span>
            </label>
          </div>

          {cargoType && (
            <div className="mb-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-700">Activo</span>
              </label>
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
