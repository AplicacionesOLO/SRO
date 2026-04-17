import { useState, useEffect } from 'react';
import { usePermissions } from '../../../../hooks/usePermissions';
import { timeProfilesService } from '../../../../services/timeProfilesService';
import { providersService } from '../../../../services/providersService';
import { cargoTypesService } from '../../../../services/cargoTypesService';
import type { ProviderCargoTimeProfile, ProviderWithClients, CargoType } from '../../../../types/catalog';
import TimeProfileModal from './TimeProfileModal';

interface TimeProfilesTabProps {
  orgId: string;
  warehouseId: string | null;
}

export default function TimeProfilesTab({ orgId, warehouseId }: TimeProfilesTabProps) {
  const { can } = usePermissions();
  const [timeProfiles, setTimeProfiles] = useState<ProviderCargoTimeProfile[]>([]);
  const [providers, setProviders] = useState<ProviderWithClients[]>([]);
  const [cargoTypes, setCargoTypes] = useState<CargoType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ProviderCargoTimeProfile | undefined>();
  const [error, setError] = useState<string | undefined>();

  const canRead = can('time_profiles.view');
  const canCreate = can('time_profiles.create');
  const canUpdate = can('time_profiles.update');
  const canDelete = can('time_profiles.delete');

  useEffect(() => {
    if (canRead) loadData();
    else setLoading(false);
  }, [orgId, warehouseId, canRead]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [profilesData, providersData, cargoTypesData] = await Promise.all([
        timeProfilesService.getByWarehouse(orgId, warehouseId),
        warehouseId
          ? providersService.getByWarehouseWithClientContext(orgId, warehouseId)
          : providersService.getActive(orgId).then(list => list.map(p => ({ ...p, clientNames: [] }))),
        cargoTypesService.getByWarehouse(orgId, warehouseId, true),
      ]);
      setTimeProfiles(profilesData);
      setProviders(providersData);
      setCargoTypes(cargoTypesData);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar perfiles de tiempo');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => { setEditingProfile(undefined); setIsModalOpen(true); };
  const handleEdit = (p: ProviderCargoTimeProfile) => { setEditingProfile(p); setIsModalOpen(true); };

  const handleDelete = async (id: string) => {
    if (!canDelete || !confirm('¿Eliminar este perfil de tiempo?')) return;
    try {
      await timeProfilesService.delete(orgId, id);
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Error al eliminar');
    }
  };

  const handleSave = async () => { setIsModalOpen(false); await loadData(); };

  const getProviderName = (id: string) => providers.find(p => p.id === id)?.name || 'Desconocido';
  const getCargoTypeName = (id: string) => cargoTypes.find(c => c.id === id)?.name || 'Desconocido';

  if (!canRead) return <div className="text-center py-12"><i className="ri-lock-line text-6xl text-red-500 mb-4"></i><p className="text-gray-600">No tienes permisos para ver perfiles de tiempo</p></div>;
  if (loading) return <div className="flex items-center justify-center py-12"><div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mb-4"></div></div>;

  return (
    <div>
      {!warehouseId && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
          <i className="ri-information-line text-amber-500 w-5 h-5 flex items-center justify-center"></i>
          <p className="text-sm text-amber-700">Mostrando perfiles de todos los almacenes. Selecciona un almacén para filtrar.</p>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Perfiles de tiempo</h2>
          <p className="text-sm text-gray-600 mt-1">Define tiempos promedio por proveedor y tipo de carga</p>
        </div>
        {canCreate && (
          <button onClick={handleCreate} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer">
            <i className="ri-add-line text-lg w-5 h-5 flex items-center justify-center"></i>
            Nuevo perfil
          </button>
        )}
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {timeProfiles.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <i className="ri-time-line text-6xl text-gray-400 mb-4"></i>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay perfiles de tiempo</h3>
          <p className="text-gray-600 mb-6">{warehouseId ? 'No hay perfiles asignados a este almacén' : 'Comienza creando tu primer perfil'}</p>
          {canCreate && <button onClick={handleCreate} className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer">Crear perfil</button>}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Proveedor</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Tipo de carga</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Tiempo promedio</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Origen</th>
                {(canUpdate || canDelete) && <th className="text-right py-3 px-4 text-sm font-semibold text-gray-900">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {timeProfiles.map((profile) => (
                <tr key={profile.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4"><div className="flex items-center gap-2"><i className="ri-truck-line text-gray-400 w-5 h-5 flex items-center justify-center"></i><span className="text-sm text-gray-900">{getProviderName(profile.provider_id)}</span></div></td>
                  <td className="py-3 px-4"><div className="flex items-center gap-2"><i className="ri-box-3-line text-gray-400 w-5 h-5 flex items-center justify-center"></i><span className="text-sm text-gray-900">{getCargoTypeName(profile.cargo_type_id)}</span></div></td>
                  <td className="py-3 px-4"><span className="text-sm text-gray-900 font-medium">{profile.avg_minutes} min</span></td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${profile.source === 'manual' ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-700'}`}>
                      {profile.source === 'manual' ? 'Manual' : 'Calculado'}
                    </span>
                  </td>
                  {(canUpdate || canDelete) && (
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        {canUpdate && <button onClick={() => handleEdit(profile)} className="p-2 text-gray-600 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors cursor-pointer" title="Editar"><i className="ri-edit-line text-lg w-5 h-5 flex items-center justify-center"></i></button>}
                        {canDelete && <button onClick={() => handleDelete(profile.id)} className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer" title="Eliminar"><i className="ri-delete-bin-line text-lg w-5 h-5 flex items-center justify-center"></i></button>}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <TimeProfileModal orgId={orgId} profile={editingProfile ?? null} providers={providers} cargoTypes={cargoTypes} onClose={() => setIsModalOpen(false)} onSave={handleSave} />
      )}
    </div>
  );
}
