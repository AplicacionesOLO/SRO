import { useState, useEffect } from 'react';
import { usePermissions } from '../../../../hooks/usePermissions';
import { timeProfilesService } from '../../../../services/timeProfilesService';
import { providersService } from '../../../../services/providersService';
import { cargoTypesService } from '../../../../services/cargoTypesService';
import { supabase } from '../../../../lib/supabase';
import { timeAnalyticsService, type ProviderSuggestion } from '../../../../services/timeAnalyticsService';
import type { ProviderCargoTimeProfile, ProviderWithClients, CargoType } from '../../../../types/catalog';
import TimeProfileModal from './TimeProfileModal';
import TimeProfileBulkImportModal from './TimeProfileBulkImportModal';
import { exportTimeProfilesToExcel } from '../../../../utils/timeProfileExcelParser';

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
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Record<string, ProviderSuggestion>>({});
  const [suggestionList, setSuggestionList] = useState<ProviderSuggestion[]>([]);
  const [isComputing, setIsComputing] = useState(false);
  const [computeError, setComputeError] = useState<string | null>(null);
  const [analyzedReservations, setAnalyzedReservations] = useState<number | null>(null);
  const [validSamples, setValidSamples] = useState<number | null>(null);
  const [activatingKey, setActivatingKey] = useState<string | null>(null);

  const canRead = can('time_profiles.view');
  const canCreate = can('time_profiles.create');
  const canUpdate = can('time_profiles.update');
  const canDelete = can('time_profiles.delete');

  useEffect(() => {
    if (canRead) {
      loadData();
      computeSuggestions(false);
    } else {
      setLoading(false);
    }
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

      // Rescue inactive providers referenced by time profiles (single batch query)
      const missingProviderIds = [...new Set(
        profilesData
          .map(p => p.provider_id)
          .filter(pid => !providersData.some(prov => prov.id === pid)),
      )];
      if (missingProviderIds.length > 0) {
        const { data: rescued } = await supabase
          .from('providers')
          .select('id, name, active, provider_code, source, source_code, org_id, provider_type')
          .in('id', missingProviderIds);
        if (rescued && rescued.length > 0) {
          setProviders(prev => {
            const existing = new Set(prev.map(p => p.id));
            const toAdd: ProviderWithClients[] = rescued
              .filter((r: any) => !existing.has(r.id))
              .map((r: any) => ({ ...r, clientNames: [] }));
            return [...prev, ...toAdd];
          });
        }
      }
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

  const computeSuggestions = async (silent = false) => {
    try {
      if (!silent) setIsComputing(true);
      setComputeError(null);
      const result = await timeAnalyticsService.computeAnalytics(orgId, warehouseId);
      const map: Record<string, ProviderSuggestion> = {};
      for (const s of result.providerSuggestions) {
        map[`${s.providerId}::${s.cargoTypeId}`] = s;
      }
      setSuggestions(map);
      setSuggestionList(result.providerSuggestions);
      setAnalyzedReservations(result.analyzedReservations);
      setValidSamples(result.validSamples);
    } catch (err: any) {
      setComputeError(err?.message || 'Error al calcular sugeridos');
    } finally {
      if (!silent) setIsComputing(false);
    }
  };

  const handleComputeSuggestions = () => computeSuggestions(true);

  const handleActivate = async (s: ProviderSuggestion) => {
    if (!canCreate) return;
    if (!s.providerId || !s.cargoTypeId) {
      setError('No se puede activar: falta el proveedor o el tipo de carga.');
      return;
    }
    const key = `${s.providerId}::${s.cargoTypeId}`;
    try {
      setActivatingKey(key);
      setError(undefined);
      await timeProfilesService.activateFromSuggestion(
        orgId,
        s.providerId,
        s.cargoTypeId,
        s.avgMinutes,
        s.sampleSize,
        warehouseId,
      );
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Error al activar el perfil');
    } finally {
      setActivatingKey(null);
    }
  };

  const getSuggestion = (providerId: string, cargoTypeId: string): ProviderSuggestion | undefined => {
    return suggestions[`${providerId}::${cargoTypeId}`];
  };

  const hasProfile = (providerId: string, cargoTypeId: string): boolean => {
    return timeProfiles.some(p => p.provider_id === providerId && p.cargo_type_id === cargoTypeId);
  };

  const pendingSuggestions = suggestionList.filter(s => !hasProfile(s.providerId, s.cargoTypeId));

  const handleExportExcel = async () => {
    // Resolve warehouse names for all profiles with warehouse_id
    const warehouseIds = [...new Set(timeProfiles.map(p => p.warehouse_id).filter(Boolean))] as string[];
    const warehouseNames: Record<string, string> = {};
    if (warehouseIds.length > 0) {
      const { data: whData } = await supabase
        .from('warehouses')
        .select('id, name')
        .eq('org_id', orgId)
        .in('id', warehouseIds);
      for (const wh of (whData ?? [])) {
        warehouseNames[wh.id] = wh.name;
      }
    }

    const exportRows = timeProfiles.map((profile) => {
      const pInfo = getProviderInfo(profile.provider_id);
      return {
        providerCode: providers.find(p => p.id === profile.provider_id)?.provider_code || '',
        providerName: pInfo.name,
        cargoTypeName: getCargoTypeName(profile.cargo_type_id),
        warehouseName: profile.warehouse_id ? (warehouseNames[profile.warehouse_id] || '') : '',
        avgMinutes: profile.avg_minutes,
        secondsPerUnit: profile.seconds_per_unit ?? null,
        providerActive: pInfo.active === false ? 'No' : 'Sí',
        source: profile.source || 'manual',
      };
    });

    exportTimeProfilesToExcel(exportRows);
  };

  const getProviderInfo = (id: string) => {
    const p = providers.find(p => p.id === id);
    return p ? { name: p.name, active: p.active } : { name: 'Desconocido', active: null as boolean | null };
  };
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
        <div className="flex items-center gap-2">
          <button onClick={handleComputeSuggestions} disabled={isComputing} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer text-sm disabled:opacity-50 disabled:cursor-not-allowed" title="Calcular tiempo sugerido real (IN → OUT) para proveedores con más de 10 reservas">
            <i className={`ri-bar-chart-box-line text-lg w-5 h-5 flex items-center justify-center ${isComputing ? 'animate-pulse' : ''}`}></i>
            {isComputing ? 'Calculando...' : 'Recalcular sugeridos'}
          </button>
          <button onClick={handleExportExcel} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer text-sm" title="Descargar Excel">
            <i className="ri-download-line text-lg w-5 h-5 flex items-center justify-center"></i>
            Descargar Excel
          </button>
          {canCreate && (
            <button onClick={() => setIsImportModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer text-sm" title="Importar Excel">
              <i className="ri-upload-line text-lg w-5 h-5 flex items-center justify-center"></i>
              Importar Excel
            </button>
          )}
          {canCreate && (
            <button onClick={handleCreate} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer">
              <i className="ri-add-line text-lg w-5 h-5 flex items-center justify-center"></i>
              Nuevo perfil
            </button>
          )}
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      {computeError && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{computeError}</div>}
      {!isComputing && analyzedReservations !== null && (
        <div className="mb-4 p-3 bg-teal-50 border border-teal-200 rounded-lg flex items-center gap-2">
          <i className="ri-database-2-line text-teal-600 w-5 h-5 flex items-center justify-center"></i>
          <p className="text-sm text-teal-800">
            Analizadas <strong>{analyzedReservations}</strong> reservas con IN/OUT · <strong>{validSamples ?? 0}</strong> citas válidas tras descartar tiempos atípicos.
          </p>
        </div>
      )}
      {!isComputing && Object.keys(suggestions).length === 0 && (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500">
          Sin sugeridos disponibles: solo se muestran proveedores con más de 10 citas con IN/OUT registrado.
        </div>
      )}

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
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Sugerido</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Origen</th>
                {(canUpdate || canDelete) && <th className="text-right py-3 px-4 text-sm font-semibold text-gray-900">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {timeProfiles.map((profile) => (
                <tr key={profile.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    {(() => {
                      const info = getProviderInfo(profile.provider_id);
                      return (
                        <div className="flex items-center gap-2">
                          <i className="ri-truck-line text-gray-400 w-5 h-5 flex items-center justify-center"></i>
                          <span className="text-sm text-gray-900">{info.name}</span>
                          {info.active === false && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">Inactivo</span>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="py-3 px-4"><div className="flex items-center gap-2"><i className="ri-box-3-line text-gray-400 w-5 h-5 flex items-center justify-center"></i><span className="text-sm text-gray-900">{getCargoTypeName(profile.cargo_type_id)}</span></div></td>
                  <td className="py-3 px-4"><span className="text-sm text-gray-900 font-medium">{profile.avg_minutes} min</span></td>
                  <td className="py-3 px-4">
                    {(() => {
                      const s = getSuggestion(profile.provider_id, profile.cargo_type_id);
                      if (!s) return <span className="text-sm text-gray-400">-</span>;
                      return (
                        <div className="flex flex-col">
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-700">
                            <i className="ri-lightbulb-line w-4 h-4 flex items-center justify-center"></i>
                            {s.avgMinutes} min
                          </span>
                          <span className="text-xs text-gray-500">{s.sampleSize} citas</span>
                        </div>
                      );
                    })()}
                  </td>
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

      {pendingSuggestions.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-2">
            <i className="ri-lightbulb-line text-amber-500 w-5 h-5 flex items-center justify-center"></i>
            <h3 className="text-base font-semibold text-gray-900">Proveedores con datos suficientes (sin perfil)</h3>
          </div>
          <p className="text-sm text-gray-500 mb-4">Estos proveedores tienen más de 10 citas con IN/OUT y aún no tienen un perfil de tiempo. El valor sugerido es el promedio real de descarga (descartando citas atípicas).</p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Proveedor</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Tipo de carga</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Sugerido</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Citas</th>
                  {canCreate && <th className="text-right py-3 px-4 text-sm font-semibold text-gray-900">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {pendingSuggestions.map(s => (
                  <tr key={`${s.providerId}::${s.cargoTypeId}`} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <i className="ri-truck-line text-gray-400 w-5 h-5 flex items-center justify-center"></i>
                        <span className="text-sm text-gray-900">{s.providerName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <i className="ri-box-3-line text-gray-400 w-5 h-5 flex items-center justify-center"></i>
                        <span className="text-sm text-gray-900">{s.cargoTypeName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-700">
                        <i className="ri-lightbulb-line w-4 h-4 flex items-center justify-center"></i>
                        {s.avgMinutes} min
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">{s.sampleSize}</td>
                    {canCreate && (
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end">
                          <button
                            onClick={() => handleActivate(s)}
                            disabled={activatingKey === `${s.providerId}::${s.cargoTypeId}` || !s.providerId || !s.cargoTypeId}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Crear perfil de tiempo con el valor sugerido"
                          >
                            <i className={`w-4 h-4 flex items-center justify-center ${activatingKey === `${s.providerId}::${s.cargoTypeId}` ? 'ri-loader-4-line animate-spin' : 'ri-check-line'}`}></i>
                            {activatingKey === `${s.providerId}::${s.cargoTypeId}` ? 'Activando...' : 'Activar'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isModalOpen && (
        <TimeProfileModal orgId={orgId} profile={editingProfile ?? null} providers={providers} cargoTypes={cargoTypes} onClose={() => setIsModalOpen(false)} onSave={handleSave} />
      )}

      {isImportModalOpen && (
        <TimeProfileBulkImportModal
          orgId={orgId}
          existingProfiles={timeProfiles}
          onClose={() => setIsImportModalOpen(false)}
          onDone={loadData}
        />
      )}
    </div>
  );
}
