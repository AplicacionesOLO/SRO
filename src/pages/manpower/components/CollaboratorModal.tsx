import { useState, useEffect } from 'react';
import type { Collaborator, CollaboratorFormData, WorkType } from '../../../types/collaborator';
import type { Country } from '../../../types/warehouse';
import type { Warehouse } from '../../../types/warehouse';

interface CollaboratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CollaboratorFormData) => Promise<void>;
  collaborator?: Collaborator | null;
  countries: Country[];
  workTypes: WorkType[];
  warehouses: Warehouse[];
  canManage: boolean;
}

export function CollaboratorModal({
  isOpen,
  onClose,
  onSave,
  collaborator,
  countries,
  workTypes,
  warehouses,
  canManage
}: CollaboratorModalProps) {
  const [formData, setFormData] = useState<CollaboratorFormData>({
    full_name: '',
    ficha: '',
    cedula: '',
    country_id: '',
    work_type_id: '',
    is_active: true,
    warehouse_ids: []
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Cargar datos del colaborador al editar
  useEffect(() => {
    if (collaborator) {
      setFormData({
        full_name: collaborator.full_name,
        ficha: collaborator.ficha || '',
        cedula: collaborator.cedula || '',
        country_id: collaborator.country_id,
        work_type_id: collaborator.work_type_id,
        is_active: collaborator.is_active,
        warehouse_ids: collaborator.warehouses?.map(w => w.id) || []
      });
    } else {
      setFormData({
        full_name: '',
        ficha: '',
        cedula: '',
        country_id: '',
        work_type_id: '',
        is_active: true,
        warehouse_ids: []
      });
    }
    setErrors({});
  }, [collaborator, isOpen]);

  // Filtrar almacenes por país seleccionado
  const filteredWarehouses = warehouses.filter(
    w => !formData.country_id || w.country_id === formData.country_id
  );

  // Validar formulario
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.full_name.trim()) {
      newErrors.full_name = 'El nombre completo es requerido';
    }

    if (!formData.country_id) {
      newErrors.country_id = 'El país es requerido';
    }

    if (!formData.work_type_id) {
      newErrors.work_type_id = 'El tipo de trabajo es requerido';
    }

    if (formData.warehouse_ids.length === 0) {
      newErrors.warehouse_ids = 'Debe asignar al menos un almacén';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Manejar cambio de país
  const handleCountryChange = (countryId: string) => {
    setFormData(prev => ({
      ...prev,
      country_id: countryId,
      warehouse_ids: [] // Limpiar almacenes seleccionados
    }));
  };

  // Manejar toggle de almacén
  const handleWarehouseToggle = (warehouseId: string) => {
    setFormData(prev => ({
      ...prev,
      warehouse_ids: prev.warehouse_ids.includes(warehouseId)
        ? prev.warehouse_ids.filter(id => id !== warehouseId)
        : [...prev.warehouse_ids, warehouseId]
    }));
  };

  // Guardar
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setLoading(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Error saving collaborator:', error);
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
            {collaborator ? 'Editar Colaborador' : 'Nuevo Colaborador'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={loading}
          >
            <i className="ri-close-line text-2xl"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Nombre Completo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nombre Completo <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.full_name}
              onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              placeholder="Ingrese el nombre completo"
              disabled={!canManage || loading}
            />
            {errors.full_name && (
              <p className="mt-1 text-sm text-red-600">{errors.full_name}</p>
            )}
          </div>

          {/* Ficha y Cédula */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ficha
              </label>
              <input
                type="text"
                value={formData.ficha}
                onChange={(e) => setFormData(prev => ({ ...prev, ficha: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="Número de ficha"
                disabled={!canManage || loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cédula
              </label>
              <input
                type="text"
                value={formData.cedula}
                onChange={(e) => setFormData(prev => ({ ...prev, cedula: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="Número de cédula"
                disabled={!canManage || loading}
              />
            </div>
          </div>

          {/* País */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              País <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.country_id}
              onChange={(e) => handleCountryChange(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              disabled={!canManage || loading}
            >
              <option value="">Seleccione un país</option>
              {countries.map(country => (
                <option key={country.id} value={country.id}>
                  {country.name}
                </option>
              ))}
            </select>
            {errors.country_id && (
              <p className="mt-1 text-sm text-red-600">{errors.country_id}</p>
            )}
          </div>

          {/* Tipo de Trabajo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de Trabajo <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.work_type_id}
              onChange={(e) => setFormData(prev => ({ ...prev, work_type_id: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              disabled={!canManage || loading}
            >
              <option value="">Seleccione un tipo de trabajo</option>
              {workTypes.map(type => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
            {errors.work_type_id && (
              <p className="mt-1 text-sm text-red-600">{errors.work_type_id}</p>
            )}
          </div>

          {/* Almacenes Asignados */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Almacenes Asignados <span className="text-red-500">*</span>
            </label>
            {!formData.country_id ? (
              <p className="text-sm text-gray-500 italic">
                Seleccione un país primero para ver los almacenes disponibles
              </p>
            ) : filteredWarehouses.length === 0 ? (
              <p className="text-sm text-gray-500 italic">
                No hay almacenes disponibles para el país seleccionado
              </p>
            ) : (
              <div className="border border-gray-300 rounded-lg p-4 max-h-48 overflow-y-auto space-y-2">
                {filteredWarehouses.map(warehouse => (
                  <label
                    key={warehouse.id}
                    className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-2 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={formData.warehouse_ids.includes(warehouse.id)}
                      onChange={() => handleWarehouseToggle(warehouse.id)}
                      className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                      disabled={!canManage || loading}
                    />
                    <span className="text-sm text-gray-700">{warehouse.name}</span>
                  </label>
                ))}
              </div>
            )}
            {errors.warehouse_ids && (
              <p className="mt-1 text-sm text-red-600">{errors.warehouse_ids}</p>
            )}
          </div>

          {/* Estado */}
          <div className="flex items-center space-x-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                className="sr-only peer"
                disabled={!canManage || loading}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
            </label>
            <span className="text-sm font-medium text-gray-700">
              {formData.is_active ? 'Activo' : 'Inactivo'}
            </span>
          </div>

          {/* Botones */}
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
