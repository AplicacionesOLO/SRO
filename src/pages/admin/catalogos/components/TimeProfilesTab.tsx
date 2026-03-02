import { useState, useEffect } from 'react';
import { usePermissions } from '../../../../hooks/usePermissions';
import { timeProfilesService } from '../../../../services/timeProfilesService';
import { providersService } from '../../../../services/providersService';
import { cargoTypesService } from '../../../../services/cargoTypesService';
import type { ProviderCargoTimeProfile, Provider, CargoType } from '../../../../types/catalog';
import TimeProfileModal from './TimeProfileModal';

interface TimeProfilesTabProps {
  orgId: string;
}

export default function TimeProfilesTab({ orgId }: TimeProfilesTabProps) {
  const { can } = usePermissions();
  const [timeProfiles, setTimeProfiles] = useState<ProviderCargoTimeProfile[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [cargoTypes, setCargoTypes] = useState<CargoType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ProviderCargoTimeProfile | undefined>();

  const canRead = can('time_profiles.view');
  const canCreate = can('time_profiles.create');
  const canUpdate = can('time_profiles.update');
  const canDelete = can('time_profiles.delete');

  useEffect(() => {
    if (canRead) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [orgId, canRead]);

  const loadData = async () => {
    try {
      setLoading(true);
      console.log('[TimeProfilesTab] Loading data for orgId:', orgId);
      
      const [profilesData, providersData, cargoTypesData] = await Promise.all([
        timeProfilesService.getAll(orgId),
        providersService.getActive(orgId),
        cargoTypesService.getActive(orgId)
      ]);

      console.log('[TimeProfilesTab] Data loaded:', {
        profiles: profilesData.length,
        providers: providersData.length,
        cargoTypes: cargoTypesData.length
      });

      setTimeProfiles(profilesData);
      setProviders(providersData);
      setCargoTypes(cargoTypesData);
    } catch (error) {
      console.error('[TimeProfilesTab] Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingProfile(undefined);
    setIsModalOpen(true);
  };

  const handleEdit = (profile: ProviderCargoTimeProfile) => {
    setEditingProfile(profile);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!canDelete) return;
    
    if (!confirm('¿Estás seguro de eliminar este perfil de tiempo?')) return;

    try {
      await timeProfilesService.delete(id);
      await loadData();
    } catch (error) {
      console.error('[TimeProfilesTab] Error deleting:', error);
      alert('Error al eliminar el perfil de tiempo');
    }
  };

  const handleSave = async () => {
    setIsModalOpen(false);
    await loadData();
  };

  const getProviderName = (providerId: string) => {
    return providers.find(p => p.id === providerId)?.name || 'Desconocido';
  };

  const getCargoTypeName = (cargoTypeId: string) => {
    return cargoTypes.find(c => c.id === cargoTypeId)?.name || 'Desconocido';
  };

  if (!canRead) {
    return (
      <div className="text-center py-12">
        <i className="ri-lock-line text-6xl text-red-500 mb-4"></i>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Sin permisos</h3>
        <p className="text-gray-600">No tienes permisos para ver perfiles de tiempo</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mb-4"></div>
          <p className="text-gray-600">Cargando perfiles de tiempo...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Perfiles de tiempo</h2>
          <p className="text-sm text-gray-600 mt-1">
            Define tiempos promedio por proveedor y tipo de carga
          </p>
        </div>
        {canCreate && (
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer"
          >
            <i className="ri-add-line text-lg w-5 h-5 flex items-center justify-center"></i>
            Nuevo perfil
          </button>
        )}
      </div>

      {timeProfiles.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <i className="ri-time-line text-6xl text-gray-400 mb-4"></i>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay perfiles de tiempo</h3>
          <p className="text-gray-600 mb-6">Comienza creando tu primer perfil de tiempo</p>
          {canCreate && (
            <button
              onClick={handleCreate}
              className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer"
            >
              Crear perfil
            </button>
          )}
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
                {(canUpdate || canDelete) && (
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-900">Acciones</th>
                )}
              </tr>
            </thead>
            <tbody>
              {timeProfiles.map((profile) => (
                <tr key={profile.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <i className="ri-truck-line text-gray-400 w-5 h-5 flex items-center justify-center"></i>
                      <span className="text-sm text-gray-900">{getProviderName(profile.provider_id)}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <i className="ri-box-3-line text-gray-400 w-5 h-5 flex items-center justify-center"></i>
                      <span className="text-sm text-gray-900">{getCargoTypeName(profile.cargo_type_id)}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-sm text-gray-900 font-medium">{profile.avg_minutes} min</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                      profile.source === 'manual' 
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-purple-50 text-purple-700'
                    }`}>
                      <i className={`${profile.source === 'manual' ? 'ri-edit-line' : 'ri-bar-chart-line'} w-3 h-3 flex items-center justify-center`}></i>
                      {profile.source === 'manual' ? 'Manual' : 'Calculado'}
                    </span>
                  </td>
                  {(canUpdate || canDelete) && (
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        {canUpdate && (
                          <button
                            onClick={() => handleEdit(profile)}
                            className="p-2 text-gray-600 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors cursor-pointer"
                            title="Editar"
                          >
                            <i className="ri-edit-line text-lg w-5 h-5 flex items-center justify-center"></i>
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(profile.id)}
                            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Eliminar"
                          >
                            <i className="ri-delete-bin-line text-lg w-5 h-5 flex items-center justify-center"></i>
                          </button>
                        )}
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
      <TimeProfileModal
        orgId={orgId}
        profile={editingProfile ?? null}
        providers={providers}
        cargoTypes={cargoTypes}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
      />
      )}
    </div>
  );
}
