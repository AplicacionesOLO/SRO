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

export default function DockModal({ dock, categories, statuses, orgId, onClose, onSave }: DockModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    category_id: '',
    status_id: '',
    warehouse_id: '',
    is_active: true
  });
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Cargar almacenes
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
      } catch (error) {
        console.error('[DockModal] loadWarehouses error', error);
        setWarehouses([]);
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
      setFormData({
        name: dock.name,
        category_id: dock.category_id,
        status_id: dock.status_id,
        warehouse_id: dock.warehouse_id || '',
        is_active: dock.is_active
      });
    } else {
      setFormData({
        name: '',
        category_id: categories[0]?.id || '',
        status_id: statuses[0]?.id || '',
        warehouse_id: '',
        is_active: true
      });
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

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    try {
      setSaving(true);

      const dataToSave = {
        name: formData.name.trim(),
        category_id: formData.category_id,
        status_id: formData.status_id,
        warehouse_id: formData.warehouse_id || null,
        is_active: formData.is_active,
        updated_at: new Date().toISOString()
      };

      if (dock) {
        // Actualizar
        const { error } = await supabase
          .from('docks')
          .update(dataToSave)
          .eq('id', dock.id);

        if (error) throw error;
      } else {
        // Crear
        const { error } = await supabase
          .from('docks')
          .insert({
            org_id: orgId,
            ...dataToSave
          });

        if (error) throw error;
      }

      onSave();
    } catch (error) {
      console.error('[Docks] saveError', error);
      alert('Error al guardar el andén');
    } finally {
      setSaving(false);
    }
  };

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
              placeholder="Ej: Andén 1"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-500">{errors.name}</p>
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
            <p className="mt-1 text-xs text-gray-500">
              Opcional: asocia este andén a un almacén específico
            </p>
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
            <p className="mt-1 text-xs text-gray-500">
              Los andenes inactivos no aparecerán en el calendario
            </p>
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
