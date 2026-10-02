import { useState, useEffect } from 'react';
import { usePermissions } from '../../../../hooks/usePermissions';
import { vehicleTypesService } from '../../../../services/vehicleTypesService';
import { warehousesService } from '../../../../services/warehousesService';
import { countriesService } from '../../../../services/countriesService';
import type { VehicleType } from '../../../../types/catalog';
import VehicleTypeModal from './VehicleTypeModal';
import { ConfirmModal } from '../../../../components/base/ConfirmModal';

interface VehicleTypesTabProps {
  orgId: string;
  warehouseId: string | null;
}

export default function VehicleTypesTab({ orgId, warehouseId }: VehicleTypesTabProps) {
  const { can } = usePermissions();
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [filteredVehicleTypes, setFilteredVehicleTypes] = useState<VehicleType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingVehicleType, setEditingVehicleType] = useState<VehicleType | null>(null);
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [countriesById, setCountriesById] = useState<Record<string, string>>({});
  const [effectiveCountryId, setEffectiveCountryId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; type: 'success' | 'warning' | 'error' | 'info'; title: string; message: string; showCancel?: boolean; onConfirm: () => void; onCancel?: () => void; }>({ isOpen: false, type: 'info', title: '', message: '', onConfirm: () => {} });

  const canRead = can('vehicle_types.view');
  const canCreate = can('vehicle_types.create');
  const canUpdate = can('vehicle_types.update');
  const canDelete = can('vehicle_types.delete');

  useEffect(() => {
    loadContextAndTypes();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, warehouseId]);

  useEffect(() => {
    const filtered = vehicleTypes.filter(vt => {
      const matchesSearch = vt.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = showActiveOnly ? vt.active : true;
      return matchesSearch && matchesStatus;
    });
    setFilteredVehicleTypes(filtered);
  }, [searchTerm, vehicleTypes, showActiveOnly]);

  const loadContextAndTypes = async () => {
    try {
      setLoading(true);
      setError(null);

      // País del almacén activo (para filtrar) + nombres de país (para mostrar)
      const [warehouses, countries] = await Promise.all([
        warehousesService.getAll(orgId).catch(() => []),
        countriesService.getAll(orgId).catch(() => []),
      ]);
      setCountriesById(Object.fromEntries(countries.map(c => [c.id, c.name])));

      let countryId: string | null = null;
      if (warehouseId) {
        countryId = warehouses.find(w => w.id === warehouseId)?.country_id ?? null;
      }
      setEffectiveCountryId(countryId);

      const data = await vehicleTypesService.getByCountry(orgId, countryId);
      setVehicleTypes(data);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar tipos de vehículo');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => { setEditingVehicleType(null); setShowModal(true); };
  const handleEdit = (vt: VehicleType) => { setEditingVehicleType(vt); setShowModal(true); };

  const handleDelete = (vt: VehicleType) => {
    setConfirmModal({
      isOpen: true, type: 'warning', title: 'Confirmar desactivación',
      message: `¿Desactivar el tipo de vehículo "${vt.name}"?\n\nInactivarlo puede afectar reservas ya creadas que lo estén usando. Las reservas existentes seguirán funcionando, pero este tipo ya no será visible en nuevas reservas.`, showCancel: true,
      onConfirm: () => confirmDelete(vt),
      onCancel: () => setConfirmModal(prev => ({ ...prev, isOpen: false }))
    });
  };

  const confirmDelete = async (vt: VehicleType) => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
    try {
      await vehicleTypesService.deleteVehicleType(vt.id);
      await loadContextAndTypes();
    } catch (err: any) {
      setError(err?.message || 'Error al eliminar');
    }
  };

  const handleSave = async () => { await loadContextAndTypes(); setShowModal(false); };

  if (!canRead) return <div className="text-center py-12"><i className="ri-lock-line text-6xl text-red-500 mb-4"></i><p className="text-gray-600">No tienes permisos para ver tipos de vehículo</p></div>;
  if (loading) return <div className="text-center py-12"><div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mb-4"></div><p className="text-gray-600">Cargando tipos de vehículo...</p></div>;
  if (error) return <div className="text-center py-12"><i className="ri-error-warning-line text-6xl text-red-500 mb-4"></i><p className="text-gray-600 mb-4">{error}</p><button onClick={loadContextAndTypes} className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer">Reintentar</button></div>;

  return (
    <div>
      {!warehouseId ? (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
          <i className="ri-information-line text-amber-500 w-5 h-5 flex items-center justify-center"></i>
          <p className="text-sm text-amber-700">Mostrando tipos de vehículo de todos los países. Seleccioná un almacén para filtrar por su país.</p>
        </div>
      ) : !effectiveCountryId ? (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
          <i className="ri-alert-line text-amber-500 w-5 h-5 flex items-center justify-center"></i>
          <p className="text-sm text-amber-700">El almacén activo no tiene un país asignado. Asignale un país para poder ver sus tipos de vehículo.</p>
        </div>
      ) : (
        <div className="mb-4 p-3 bg-teal-50 border border-teal-200 rounded-lg flex items-center gap-2">
          <i className="ri-map-pin-line text-teal-600 w-5 h-5 flex items-center justify-center"></i>
          <p className="text-sm text-teal-700">Mostrando tipos de vehículo de <span className="font-semibold">{countriesById[effectiveCountryId] || 'el país del almacén activo'}</span>.</p>
        </div>
      )}

      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div className="flex-1 min-w-[220px] max-w-md">
          <div className="relative">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 flex items-center justify-center"></i>
            <input type="text" placeholder="Buscar tipos de vehículo..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input type="checkbox" checked={showActiveOnly} onChange={(e) => setShowActiveOnly(e.target.checked)}
              className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500 cursor-pointer" />
            Solo activos
          </label>
          {canCreate && (
            <button onClick={handleCreate} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer">
              <i className="ri-add-line w-5 h-5 flex items-center justify-center"></i>
              Nuevo Tipo de Vehículo
            </button>
          )}
        </div>
      </div>

      {filteredVehicleTypes.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <i className="ri-inbox-line text-6xl text-gray-400 mb-4"></i>
          <p className="text-gray-600">{warehouseId ? 'No hay tipos de vehículo para el país de este almacén' : 'No hay tipos de vehículo registrados'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Nombre</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">País</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Estado</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredVehicleTypes.map((vt) => (
                <tr key={vt.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-900">
                    <span className="inline-flex items-center gap-2">
                      <i className="ri-truck-line text-gray-400 w-4 h-4 flex items-center justify-center"></i>
                      {vt.name}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    <span className="inline-flex items-center gap-1.5">
                      <i className="ri-map-pin-line text-gray-400 w-4 h-4 flex items-center justify-center"></i>
                      {vt.country_id ? (countriesById[vt.country_id] || '—') : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${vt.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{vt.active ? 'Activo' : 'Inactivo'}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {canUpdate && <button onClick={() => handleEdit(vt)} className="p-2 text-gray-600 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors cursor-pointer" title="Editar"><i className="ri-edit-line w-5 h-5 flex items-center justify-center"></i></button>}
                      {canDelete && vt.active && <button onClick={() => handleDelete(vt)} className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer" title="Desactivar"><i className="ri-delete-bin-line w-5 h-5 flex items-center justify-center"></i></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <VehicleTypeModal orgId={orgId} defaultCountryId={effectiveCountryId} vehicleType={editingVehicleType} onClose={() => setShowModal(false)} onSave={handleSave} />}
      <ConfirmModal isOpen={confirmModal.isOpen} type={confirmModal.type} title={confirmModal.title} message={confirmModal.message} showCancel={confirmModal.showCancel} onConfirm={confirmModal.onConfirm} onCancel={confirmModal.onCancel} />
    </div>
  );
}