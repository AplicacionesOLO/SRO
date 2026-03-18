import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

interface DockCategory {
  id: string;
  name: string;
  code: string;
  color: string;
}

interface DockStatus {
  id: string;
  name: string;
  code: string;
  color: string;
  is_blocking: boolean;
}

interface Dock {
  id: string;
  name: string;
  reference?: string | null;
  header_color?: string | null;
  category_id: string;
  status_id: string;
  is_active: boolean;
  warehouse_id?: string | null;
}

interface Warehouse {
  id: string;
  name: string;
  location: string | null;
}

interface DockModalProps {
  dock: Dock | null;
  categories: DockCategory[];
  statuses: DockStatus[];
  orgId: string;
  onClose: () => void;
  onSave: () => void;
}

/** Calcula si el texto sobre un fondo hex debe ser claro u oscuro */
function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#111827' : '#FFFFFF';
}

/** Valida que un string sea un color hex válido tipo #RRGGBB */
function isValidHex(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

export default function DockModal({ dock, categories, statuses, orgId, onClose, onSave }: DockModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    reference: '',
    header_color: '',
    category_id: '',
    status_id: '',
    warehouse_id: '',
    is_active: true
  });
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hexInputValue, setHexInputValue] = useState('');

  useEffect(() => {
    const loadWarehouses = async () => {
      try {
        setLoadingWarehouses(true);
        const { data, error } = await supabase
          .from('warehouses')
          .select('id, name, location')
          .eq('org_id', orgId)
          .order('name');

        if (error) throw error;
        setWarehouses(data || []);
      } catch (error: any) {
        setErrors({ general: 'Error al cargar almacenes' });
      } finally {
        setLoadingWarehouses(false);
      }
    };

    if (orgId) {
      loadWarehouses();
    }
  }, [orgId]);

  useEffect(() => {
    if (dock) {
      const color = dock.header_color || '';
      setFormData({
        name: dock.name,
        reference: dock.reference || '',
        header_color: color,
        category_id: dock.category_id,
        status_id: dock.status_id,
        warehouse_id: dock.warehouse_id || '',
        is_active: dock.is_active
      });
      setHexInputValue(color);
    } else {
      setFormData({
        name: '',
        reference: '',
        header_color: '',
        category_id: categories[0]?.id || '',
        status_id: statuses[0]?.id || '',
        warehouse_id: '',
        is_active: true
      });
      setHexInputValue('');
    }
  }, [dock, categories, statuses]);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    }
    if (!formData.category_id) {
      newErrors.category_id = 'La categoría es requerida';
    }
    if (!formData.status_id) {
      newErrors.status_id = 'El estado es requerido';
    }
    if (formData.header_color && !isValidHex(formData.header_color)) {
      newErrors.header_color = 'Color inválido. Usa formato #RRGGBB';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleHexInputChange = (value: string) => {
    setHexInputValue(value);
    // Normalizar: asegurar que empiece con #
    const normalized = value.startsWith('#') ? value : `#${value}`;
    if (isValidHex(normalized)) {
      setFormData(prev => ({ ...prev, header_color: normalized }));
      setErrors(prev => ({ ...prev, header_color: '' }));
    } else {
      setFormData(prev => ({ ...prev, header_color: value }));
    }
  };

  const handleColorPickerChange = (value: string) => {
    setFormData(prev => ({ ...prev, header_color: value }));
    setHexInputValue(value);
    setErrors(prev => ({ ...prev, header_color: '' }));
  };

  const handleClearColor = () => {
    setFormData(prev => ({ ...prev, header_color: '' }));
    setHexInputValue('');
    setErrors(prev => ({ ...prev, header_color: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    try {
      setSaving(true);

      const dataToSave = {
        name: formData.name.trim(),
        reference: formData.reference.trim() || null,
        header_color: formData.header_color.trim() || null,
        category_id: formData.category_id,
        status_id: formData.status_id,
        warehouse_id: formData.warehouse_id || null,
        is_active: formData.is_active,
        updated_at: new Date().toISOString()
      };

      if (dock) {
        const { error } = await supabase
          .from('docks')
          .update(dataToSave)
          .eq('id', dock.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('docks')
          .insert({
            org_id: orgId,
            ...dataToSave
          });

        if (error) throw error;
      }

      onSave();
    } catch (error: any) {
      setErrors({ general: error?.message || 'Error al guardar andén' });
    } finally {
      setSaving(false);
    }
  };

  const previewColor = isValidHex(formData.header_color) ? formData.header_color : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            {dock ? 'Editar Andén' : 'Nuevo Andén'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <i className="ri-close-line text-xl w-5 h-5 flex items-center justify-center"></i>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errors.general && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {errors.general}
            </div>
          )}

          {/* Nombre */}
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
              placeholder="Ej: 1012"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-500">{errors.name}</p>
            )}
          </div>

          {/* Referencia */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Referencia
            </label>
            <input
              type="text"
              value={formData.reference}
              onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
              maxLength={120}
              className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              placeholder="Ej: El coco"
            />
            <p className="mt-1 text-xs text-gray-500">
              Opcional: descripción o referencia adicional del andén
            </p>
          </div>

          {/* Color del encabezado */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Color del encabezado
            </label>

            <div className="flex items-center gap-3">
              {/* Color picker nativo */}
              <div className="relative flex-shrink-0">
                <input
                  type="color"
                  value={previewColor || '#6366f1'}
                  onChange={(e) => handleColorPickerChange(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer p-0.5"
                  title="Seleccionar color"
                />
              </div>

              {/* Input hex */}
              <input
                type="text"
                value={hexInputValue}
                onChange={(e) => handleHexInputChange(e.target.value)}
                maxLength={7}
                placeholder="#RRGGBB"
                className={`flex-1 px-4 py-2 text-sm font-mono border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent ${
                  errors.header_color ? 'border-red-500' : 'border-gray-300'
                }`}
              />

              {/* Botón limpiar */}
              {formData.header_color && (
                <button
                  type="button"
                  onClick={handleClearColor}
                  className="flex-shrink-0 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                  title="Sin color"
                >
                  <i className="ri-close-line w-4 h-4 flex items-center justify-center"></i>
                </button>
              )}
            </div>

            {errors.header_color && (
              <p className="mt-1 text-sm text-red-500">{errors.header_color}</p>
            )}

            {/* Preview */}
            {previewColor ? (
              <div
                className="mt-2 rounded-lg px-3 py-2 flex flex-col items-center justify-center gap-0.5"
                style={{ backgroundColor: previewColor }}
              >
                <span
                  className="text-sm font-semibold leading-tight"
                  style={{ color: getContrastColor(previewColor) }}
                >
                  {formData.name || 'Andén'}
                </span>
                {formData.reference && (
                  <span
                    className="text-[10px] leading-tight"
                    style={{ color: getContrastColor(previewColor), opacity: 0.8 }}
                  >
                    {formData.reference}
                  </span>
                )}
              </div>
            ) : (
              <p className="mt-1 text-xs text-gray-500">
                Opcional. Si no se asigna, se usa el color de la categoría del andén.
              </p>
            )}
          </div>

          {/* Almacén */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Almacén
            </label>
            {loadingWarehouses ? (
              <div className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg bg-gray-50 text-gray-500">
                Cargando almacenes...
              </div>
            ) : warehouses.length === 0 ? (
              <div className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg bg-gray-50 text-gray-500">
                No hay almacenes disponibles
              </div>
            ) : (
              <select
                value={formData.warehouse_id}
                onChange={(e) => setFormData({ ...formData, warehouse_id: e.target.value })}
                className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              >
                <option value="">Sin almacén</option>
                {warehouses.map(warehouse => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}{warehouse.location ? ` - ${warehouse.location}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Categoría */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Categoría <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.category_id}
              onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
              className={`w-full px-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent ${
                errors.category_id ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">Seleccionar categoría</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            {errors.category_id && (
              <p className="mt-1 text-sm text-red-500">{errors.category_id}</p>
            )}
          </div>

          {/* Estado */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Estado <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.status_id}
              onChange={(e) => setFormData({ ...formData, status_id: e.target.value })}
              className={`w-full px-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent ${
                errors.status_id ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">Seleccionar estado</option>
              {statuses.map(status => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </select>
            {errors.status_id && (
              <p className="mt-1 text-sm text-red-500">{errors.status_id}</p>
            )}
          </div>

          {/* Activo */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
              />
              <span className="text-sm font-medium text-gray-700">Andén activo</span>
            </label>
          </div>

          {/* Botones */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
            >
              {saving ? (
                <>
                  <i className="ri-loader-4-line animate-spin text-lg w-5 h-5 flex items-center justify-center"></i>
                  Guardando...
                </>
              ) : (
                <>
                  <i className="ri-save-line text-lg w-5 h-5 flex items-center justify-center"></i>
                  {dock ? 'Actualizar' : 'Crear'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
