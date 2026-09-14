import { useState, useEffect } from 'react';
import type {
  ResourceCategory,
  ResourceCategoryFormData,
  ResourceCategoryType,
} from '@/types/manpowerResource';

interface ResourceCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ResourceCategoryFormData) => Promise<void>;
  category?: ResourceCategory | null;
  canManage: boolean;
}

export function ResourceCategoryModal({
  isOpen,
  onClose,
  onSave,
  category,
  canManage,
}: ResourceCategoryModalProps) {
  const [formData, setFormData] = useState<ResourceCategoryFormData>({
    name: '',
    type: 'EQUIPMENT',
    unit_label: '',
    rate_per_hour: null,
    is_active: true,
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name,
        type: category.type,
        unit_label: category.unit_label || '',
        rate_per_hour: category.rate_per_hour ?? null,
        is_active: category.is_active,
      });
    } else {
      setFormData({
        name: '',
        type: 'EQUIPMENT',
        unit_label: '',
        rate_per_hour: null,
        is_active: true,
      });
    }
    setErrors({});
  }, [category, isOpen]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'El nombre es requerido';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await onSave(formData);
      onClose();
    } catch {
      /* el error se muestra desde el padre o se silencia */
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {category ? 'Editar categoría' : 'Nueva categoría'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors" disabled={loading}>
            <i className="ri-close-line text-2xl"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              placeholder="Ej: Montacargas, Personal, Apilador..."
              disabled={!canManage || loading}
            />
            {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { value: 'EQUIPMENT', label: 'Equipo', icon: 'ri-tools-line' },
                  { value: 'PERSONAL', label: 'Personal', icon: 'ri-user-star-line' },
                ] as Array<{ value: ResourceCategoryType; label: string; icon: string }>
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFormData((p) => ({ ...p, type: opt.value }))}
                  className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap ${
                    formData.type === opt.value
                      ? 'border-teal-500 bg-teal-50 text-teal-700'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                  disabled={!canManage || loading}
                >
                  <i className={`${opt.icon} text-lg w-5 h-5 flex items-center justify-center`}></i>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Unidad y ritmo */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Unidad</label>
              <input
                type="text"
                value={formData.unit_label}
                onChange={(e) => setFormData((p) => ({ ...p, unit_label: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                placeholder="personas / unidades"
                disabled={!canManage || loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ritmo (unidades/hora)
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={formData.rate_per_hour ?? ''}
                onChange={(e) =>
                  setFormData((p) => ({
                    ...p,
                    rate_per_hour: e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                placeholder="Ej: 30"
                disabled={!canManage || loading}
              />
            </div>
          </div>

          {/* Estado */}
          <div className="flex items-center space-x-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData((p) => ({ ...p, is_active: e.target.checked }))}
                className="sr-only peer"
                disabled={!canManage || loading}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
            </label>
            <span className="text-sm font-medium text-gray-700">{formData.is_active ? 'Activa' : 'Inactiva'}</span>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
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
    </div>
  );
}