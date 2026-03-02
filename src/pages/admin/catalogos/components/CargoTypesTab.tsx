import { useState, useEffect } from 'react';
import { usePermissions } from '../../../../hooks/usePermissions';
import { cargoTypesService } from '../../../../services/cargoTypesService';
import type { CargoType } from '../../../../types/catalog';
import CargoTypeModal from './CargoTypeModal';
import { ConfirmModal } from '../../../../components/base/ConfirmModal';

interface CargoTypesTabProps {
  orgId: string;
}

export default function CargoTypesTab({ orgId }: CargoTypesTabProps) {
  const { can } = usePermissions();
  const [cargoTypes, setCargoTypes] = useState<CargoType[]>([]);
  const [filteredCargoTypes, setFilteredCargoTypes] = useState<CargoType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCargoType, setEditingCargoType] = useState<CargoType | null>(null);
  const [showActiveOnly, setShowActiveOnly] = useState(true);

  // Modal de confirmación
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'success' | 'warning' | 'error' | 'info';
    title: string;
    message: string;
    showCancel?: boolean;
    onConfirm: () => void;
    onCancel?: () => void;
  }>({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const canRead = can('cargo_types.view');
  const canCreate = can('cargo_types.create');
  const canUpdate = can('cargo_types.update');
  const canDelete = can('cargo_types.delete');

  useEffect(() => {
    loadCargoTypes();
  }, [orgId]);

  useEffect(() => {
    const filtered = cargoTypes.filter(ct => {
      const matchesSearch = ct.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = showActiveOnly ? ct.active : true;
      return matchesSearch && matchesStatus;
    });
    setFilteredCargoTypes(filtered);
  }, [searchTerm, cargoTypes, showActiveOnly]);

  const loadCargoTypes = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await cargoTypesService.getAll(orgId);
      setCargoTypes(data);
    } catch (err) {
      console.error('[CargoTypesTab] Error loading cargo types:', err);
      setError('Error al cargar tipos de carga');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingCargoType(null);
    setShowModal(true);
  };

  const handleEdit = (cargoType: CargoType) => {
    setEditingCargoType(cargoType);
    setShowModal(true);
  };

  const handleDelete = async (cargoType: CargoType) => {
    setConfirmModal({
      isOpen: true,
      type: 'warning',
      title: 'Confirmar desactivación',
      message: `¿Desactivar el tipo de carga "${cargoType.name}"?`,
      showCancel: true,
      onConfirm: () => confirmDelete(cargoType),
      onCancel: () => setConfirmModal(prev => ({ ...prev, isOpen: false }))
    });
  };

  const confirmDelete = async (cargoType: CargoType) => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
    
    try {
      await cargoTypesService.deleteCargoType(cargoType.id);
      await loadCargoTypes();
    } catch (err) {
      console.error('[CargoTypesTab] Error deleting', err);
      setConfirmModal({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: 'Error al desactivar tipo de carga',
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false }))
      });
    }
  };

  const handleSave = async () => {
    await loadCargoTypes();
    setShowModal(false);
  };

  if (!canRead) {
    return (
      <div className="text-center py-12">
        <i className="ri-lock-line text-6xl text-red-500 mb-4"></i>
        <p className="text-gray-600">No tienes permisos para ver tipos de carga</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mb-4"></div>
        <p className="text-gray-600">Cargando tipos de carga...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <i className="ri-error-warning-line text-6xl text-red-500 mb-4"></i>
        <p className="text-gray-600 mb-4">{error}</p>
        <button
          onClick={loadCargoTypes}
          className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex-1 max-w-md">
          <div className="relative">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 flex items-center justify-center"></i>
            <input
              type="text"
              placeholder="Buscar tipos de carga..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
            />
          </div>
        </div>

        {canCreate && (
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer"
          >
            <i className="ri-add-line w-5 h-5 flex items-center justify-center"></i>
            Nuevo Tipo de Carga
          </button>
        )}
      </div>

      {filteredCargoTypes.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <i className="ri-inbox-line text-6xl text-gray-400 mb-4"></i>
          <p className="text-gray-600">
            {searchTerm ? 'No se encontraron tipos de carga' : 'No hay tipos de carga registrados'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Nombre</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Minutos por defecto</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Dinámico</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Estado</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredCargoTypes.map((cargoType) => (
                <tr key={cargoType.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-900">{cargoType.name}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {cargoType.default_minutes ?? '-'}
                  </td>
                  <td className="py-3 px-4">
                    {cargoType.is_dynamic ? (
                      <i className="ri-check-line text-green-600 w-5 h-5 flex items-center justify-center"></i>
                    ) : (
                      <i className="ri-close-line text-gray-400 w-5 h-5 flex items-center justify-center"></i>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      cargoType.active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {cargoType.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {canUpdate && (
                        <button
                          onClick={() => handleEdit(cargoType)}
                          className="p-2 text-gray-600 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors cursor-pointer"
                          title="Editar"
                        >
                          <i className="ri-edit-line w-5 h-5 flex items-center justify-center"></i>
                        </button>
                      )}
                      {canDelete && cargoType.active && (
                        <button
                          onClick={() => handleDelete(cargoType)}
                          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Desactivar"
                        >
                          <i className="ri-delete-bin-line w-5 h-5 flex items-center justify-center"></i>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <CargoTypeModal
          orgId={orgId}
          cargoType={editingCargoType}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}

      {/* Modal de confirmación */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        type={confirmModal.type}
        title={confirmModal.title}
        message={confirmModal.message}
        showCancel={confirmModal.showCancel}
        onConfirm={confirmModal.onConfirm}
        onCancel={confirmModal.onCancel}
      />
    </div>
  );
}