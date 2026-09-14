import { useState, useEffect } from 'react';
import type { ResourceCategory } from '@/types/manpowerResource';
import type { Country, Warehouse } from '@/types/warehouse';

export interface ResourceFormData {
  category_id: string;
  country_id: string;
  warehouse_id: string;
  quantity: number;
  rate_per_hour: number | null;
  status: 'ACTIVO' | 'MANTENIMIENTO' | 'INACTIVO';
  notes: string;
}

interface ResourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ResourceFormData) => Promise<void>;
  categories: ResourceCategory[];
  countries: Country[];
  warehouses: Warehouse[];
  canManage: boolean;
  initialData?: {
    id: string;
    category_id: string;
    country_id: string;
    warehouse_id: string;
    quantity: number;
    rate_per_hour: number | null;
    status: 'ACTIVO' | 'MANTENIMIENTO' | 'INACTIVO';
    notes: string | null;
  } | null;
}

export function ResourceModal({
  isOpen,
  onClose,
  onSave,
  categories,
  countries,
  warehouses,
  canManage,
  initialData,
}: ResourceModalProps) {
  const [formData, setFormData] = useState<ResourceFormData>({
    category_id: '',
    country_id: '',
    warehouse_id: '',
    quantity: 1,
    rate_per_hour: null,
    status: 'ACTIVO',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialData) {
      setFormData({
        category_id: initialData.category_id,
        country_id: initialData.country_id,
        warehouse_id: initialData.warehouse_id,
        quantity: initialData.quantity,
        rate_per_hour: initialData.rate_per_hour ?? null,
        status: initialData.status,
        notes: initialData.notes || '',
      });
    } else {
      setFormData({
        category_id: '',
        country_id: '',
        warehouse_id: '',
        quantity: 1,
        rate_per_hour: null,
        status: 'ACTIVO',
        notes: '',
      });
    }
    setErrors({});
  }, [initialData, isOpen]);

  const filteredWarehouses = warehouses.filter(
    (w) => !formData.country_id || w.country_id === formData.country_id
  );

  const selectedCategory = categories.find((c) => c.id === formData.category_id);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.category_id) newErrors.category_id = 'La categoría es requerida';
    if (!formData.country_id) newErrors.country_id = 'El país es requerido';
    if (!formData.warehouse_id) newErrors.warehouse_id = 'El almacén es requerido';
    if (formData.quantity <= 0) newErrors.quantity = 'La cantidad debe ser mayor a 0';
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
      /* silenciado */
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const personalCount = categories.filter((c) => c.type === 'PERSONAL').length;
  const equipmentCount = categories.filter((c) => c.type === 'EQUIPMENT').length;

  const statusOptions = [
    { value: 'ACTIVO', label: 'Activo', icon: 'ri-checkbox-circle-line', color: 'text-green-600 bg-green-50 border-green-300' },
    { value: 'MANTENIMIENTO', label: 'En mantenimiento', icon: 'ri-tools-line', color: 'text-amber-600 bg-amber-50 border-amber-300' },
    { value: 'INACTIVO', label: 'Inactivo', icon: 'ri-stop-circle-line', color: 'text-gray-600 bg-gray-50 border-gray-300' },
  ] as const;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {initialData ? 'Editar recurso' : 'Agregar recurso'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors" disabled={loading}>
            <i className="ri-close-line text-2xl"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Categoría */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Categoría <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.category_id}
              onChange={(e) => setFormData((p) => ({ ...p, category_id: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              disabled={!canManage || loading}
            >
              <option value="">Seleccione una categoría</option>
              {personalCount > 0 && (
                <optgroup label="Personal">
                  {categories
                    .filter((c) => c.type === 'PERSONAL')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </optgroup>
              )}
              {equipmentCount > 0 && (
                <optgroup label="Equipos">
                  {categories
                    .filter((c) => c.type === 'EQUIPMENT')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
            {errors.category_id && <p className="mt-1 text-sm text-red-600">{errors.category_id}</p>}
          </div>

          {/* País y Almacén */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                País <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.country_id}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, country_id: e.target.value, warehouse_id: '' }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                disabled={!canManage || loading}
              >
                <option value="">Seleccione un país</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {errors.country_id && <p className="mt-1 text-sm text-red-600">{errors.country_id}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Almacén <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.warehouse_id}
                onChange={(e) => setFormData((p) => ({ ...p, warehouse_id: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                disabled={!canManage || loading || !formData.country_id}
              >
                <option value="">{formData.country_id ? 'Seleccione un almacén' : 'Elija país primero'}</option>
                {filteredWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              {errors.warehouse_id && <p className="mt-1 text-sm text-red-600">{errors.warehouse_id}</p>}
            </div>
          </div>

          {/* Cantidad y ritmo */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cantidad <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={formData.quantity}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, quantity: e.target.value === '' ? 0 : Number(e.target.value) }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                disabled={!canManage || loading}
              />
              {errors.quantity && <p className="mt-1 text-sm text-red-600">{errors.quantity}</p>}
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
                placeholder={selectedCategory?.rate_per_hour ? `Default: ${selectedCategory.rate_per_hour}` : 'Opcional'}
                disabled={!canManage || loading}
              />
            </div>
          </div>

          {/* Estado */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Estado</label>
            <div className="grid grid-cols-3 gap-2">
              {statusOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFormData((p) => ({ ...p, status: opt.value }))}
                  className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                    formData.status === opt.value
                      ? opt.color
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                  disabled={!canManage || loading}
                >
                  <i className={`${opt.icon} text-base w-4 h-4 flex items-center justify-center`}></i>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Notas</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
              maxLength={500}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none"
              placeholder="Notas opcionales sobre este recurso"
              disabled={!canManage || loading}
            />
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