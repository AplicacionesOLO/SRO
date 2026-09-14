import { useState, useEffect } from 'react';
import type { ResourceCategory } from '@/types/manpowerResource';
import type { Country, Warehouse } from '@/types/warehouse';
import type { Provider, CargoType } from '@/types/catalog';
import type { ManpowerRule, ManpowerRuleFormData } from '@/types/manpowerRule';

interface RuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ManpowerRuleFormData) => Promise<void>;
  countries: Country[];
  warehouses: Warehouse[];
  cargoTypes: CargoType[];
  categories: ResourceCategory[];
  providers: Provider[];
  canManage: boolean;
  initialData?: ManpowerRule | null;
}

const emptyItem = { category_id: '', quantity: 1 };

export function RuleModal({
  isOpen,
  onClose,
  onSave,
  countries,
  warehouses,
  cargoTypes,
  categories,
  providers,
  canManage,
  initialData,
}: RuleModalProps) {
  const [formData, setFormData] = useState<ManpowerRuleFormData>({
    country_id: '',
    warehouse_id: '',
    cargo_type_id: '',
    min_bultos: null,
    max_bultos: null,
    provider_id: null,
    is_active: true,
    priority: 0,
    notes: '',
    items: [{ ...emptyItem }],
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialData) {
      setFormData({
        country_id: initialData.country_id,
        warehouse_id: initialData.warehouse_id,
        cargo_type_id: initialData.cargo_type_id,
        min_bultos: initialData.min_bultos ?? null,
        max_bultos: initialData.max_bultos ?? null,
        provider_id: initialData.provider_id ?? null,
        is_active: initialData.is_active,
        priority: initialData.priority ?? 0,
        notes: initialData.notes || '',
        items:
          (initialData.items && initialData.items.length > 0
            ? initialData.items.map((i) => ({ category_id: i.category_id, quantity: i.quantity }))
            : [{ ...emptyItem }]),
      });
    } else {
      setFormData({
        country_id: '',
        warehouse_id: '',
        cargo_type_id: '',
        min_bultos: null,
        max_bultos: null,
        provider_id: null,
        is_active: true,
        priority: 0,
        notes: '',
        items: [{ ...emptyItem }],
      });
    }
    setErrors({});
  }, [initialData, isOpen]);

  const filteredWarehouses = warehouses.filter(
    (w) => !formData.country_id || w.country_id === formData.country_id
  );

  const setItem = (index: number, patch: Partial<{ category_id: string; quantity: number }>) => {
    setFormData((p) => ({
      ...p,
      items: p.items.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    }));
  };

  const addItem = () => {
    setFormData((p) => ({ ...p, items: [...p.items, { ...emptyItem }] }));
  };

  const removeItem = (index: number) => {
    setFormData((p) => ({
      ...p,
      items: p.items.length > 1 ? p.items.filter((_, i) => i !== index) : p.items,
    }));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.country_id) newErrors.country_id = 'El país es requerido';
    if (!formData.warehouse_id) newErrors.warehouse_id = 'El almacén es requerido';
    if (!formData.cargo_type_id) newErrors.cargo_type_id = 'El tipo de carga es requerido';

    const min = formData.min_bultos;
    const max = formData.max_bultos;
    if (min == null && max == null) {
      newErrors.range = 'Definí al menos un límite de bultos (mínimo o máximo)';
    } else if (min != null && max != null && min > max) {
      newErrors.range = 'El mínimo no puede ser mayor al máximo';
    }

    const hasItem = formData.items.some((i) => i.category_id && i.quantity > 0);
    if (!hasItem) newErrors.items = 'Agregá al menos un recurso asignado';

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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {initialData ? 'Editar regla' : 'Nueva regla'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={loading}
          >
            <i className="ri-close-line text-2xl"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* País + Almacén */}
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
                <option value="">
                  {formData.country_id ? 'Seleccione un almacén' : 'Elija país primero'}
                </option>
                {filteredWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              {errors.warehouse_id && <p className="mt-1 text-sm text-red-600">{errors.warehouse_id}</p>}
            </div>
          </div>

          {/* Tipo de carga + Proveedor */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tipo de carga <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.cargo_type_id}
                onChange={(e) => setFormData((p) => ({ ...p, cargo_type_id: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                disabled={!canManage || loading}
              >
                <option value="">Seleccione un tipo de carga</option>
                {cargoTypes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {errors.cargo_type_id && <p className="mt-1 text-sm text-red-600">{errors.cargo_type_id}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Proveedor (opcional)
              </label>
              <select
                value={formData.provider_id ?? ''}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, provider_id: e.target.value || null }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                disabled={!canManage || loading}
              >
                <option value="">Sin proveedor (aplica a todos)</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Rango de bultos */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rango de bultos <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <input
                type="number"
                min="0"
                step="1"
                value={formData.min_bultos ?? ''}
                onChange={(e) =>
                  setFormData((p) => ({
                    ...p,
                    min_bultos: e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                placeholder="Mínimo (desde)"
                disabled={!canManage || loading}
              />
              <input
                type="number"
                min="0"
                step="1"
                value={formData.max_bultos ?? ''}
                onChange={(e) =>
                  setFormData((p) => ({
                    ...p,
                    max_bultos: e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                placeholder="Máximo (hasta)"
                disabled={!canManage || loading}
              />
            </div>
            {errors.range && <p className="mt-1 text-sm text-red-600">{errors.range}</p>}
          </div>

          {/* Recursos asignados */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                Recursos asignados <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={addItem}
                className="px-3 py-1.5 text-xs font-medium text-teal-700 border border-teal-300 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors flex items-center gap-1 whitespace-nowrap"
                disabled={!canManage || loading}
              >
                <i className="ri-add-line text-base w-4 h-4 flex items-center justify-center"></i>
                Agregar recurso
              </button>
            </div>

            <div className="space-y-2">
              {formData.items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={item.category_id}
                    onChange={(e) => setItem(idx, { category_id: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                    disabled={!canManage || loading}
                  >
                    <option value="">Seleccione una categoría</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={item.quantity}
                    onChange={(e) =>
                      setItem(idx, {
                        quantity: e.target.value === '' ? 0 : Number(e.target.value),
                      })
                    }
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                    placeholder="Cant."
                    disabled={!canManage || loading}
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="w-8 h-8 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                    title="Quitar"
                    disabled={!canManage || loading}
                  >
                    <i className="ri-delete-bin-line text-base"></i>
                  </button>
                </div>
              ))}
            </div>
            {errors.items && <p className="mt-1 text-sm text-red-600">{errors.items}</p>}
          </div>

          {/* Prioridad + Estado */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Prioridad</label>
              <input
                type="number"
                step="1"
                value={formData.priority}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, priority: e.target.value === '' ? 0 : Number(e.target.value) }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                disabled={!canManage || loading}
              />
              <p className="mt-1 text-xs text-gray-400">Menor número = mayor prioridad</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Estado</label>
              <div className="flex items-center space-x-3 pt-2">
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
                <span className="text-sm font-medium text-gray-700">
                  {formData.is_active ? 'Activa' : 'Inactiva'}
                </span>
              </div>
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
              placeholder="Notas opcionales sobre esta regla"
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