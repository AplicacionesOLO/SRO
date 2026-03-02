
import { useState, useEffect, useRef } from 'react';
import type { CargoType, Provider } from '../../../types/catalog';
import { cargoTypesService } from '../../../services/cargoTypesService';
import { providersService } from '../../../services/providersService';
import { userProvidersService } from '../../../services/userProvidersService';
import { timeProfilesService } from '../../../services/timeProfilesService';
import { dockAllocationService } from '../../../services/dockAllocationService';
import { useAuth } from '../../../contexts/AuthContext';

interface PreReservationMiniModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  warehouseId: string | null;
  warehouseLabel: string;
  onConfirm: (data: {
    cargoTypeId: string;
    providerId: string;
    clientId: string;
    requiredMinutes: number;
  }) => void;
}

export default function PreReservationMiniModal({
  isOpen,
  onClose,
  orgId,
  warehouseId,
  warehouseLabel,
  onConfirm,
}: PreReservationMiniModalProps) {
  const { user, canLocal } = useAuth();

  const [selectedCargoTypeId, setSelectedCargoTypeId] = useState<string>('');
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [cargoTypes, setCargoTypes] = useState<CargoType[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);

  // duración calculada por perfil o fallback
  const [requiredMinutes, setRequiredMinutes] = useState<number>(30);
  const [durationSource, setDurationSource] = useState<
    'profile' | 'cargo_default' | 'fallback_30' | 'none'
  >('none');
  const [loadingDuration, setLoadingDuration] = useState(false);

  // clientId resuelto desde el proveedor seleccionado
  const [resolvedClientId, setResolvedClientId] = useState<string>('');
  const [loadingClient, setLoadingClient] = useState(false);
  const [clientError, setClientError] = useState<string>('');

  // Evita race conditions (cambios rápidos de selects)
  const reqKeyRef = useRef<string>('');

  // Determinar si el usuario es privilegiado (admin/full_access)
  const isPrivileged =
    canLocal('admin.users.update') ||
    canLocal('admin.users.create') ||
    canLocal('admin.warehouses.update') ||
    user?.role === 'ADMIN' ||
    user?.role === 'admin' ||
    user?.role === 'SUPERADMIN' ||
    user?.role === 'superadmin';

  // Cargar catálogos cuando se abre el modal
  useEffect(() => {
    if (isOpen && orgId && user?.id) {
      loadCatalogs();
    }
  }, [isOpen, orgId, user?.id]);

  const loadCatalogs = async () => {
    setLoading(true);
    try {
      console.log('[PreReservationMiniModal] 🔍 Loading catalogs', {
        orgId,
        userId: user?.id,
        userRole: user?.role,
        isPrivileged,
      });

      const cargoTypesData = await cargoTypesService.getActive(orgId);

      let providersData: Provider[] = [];

      if (isPrivileged) {
        console.log(
          '[PreReservationMiniModal] 👑 Usuario privilegiado - cargando TODOS los proveedores',
        );
        providersData = await providersService.getActive(orgId);
      } else {
        console.log(
          '[PreReservationMiniModal] 👤 Usuario invitado - cargando solo proveedores asignados',
        );
        const userProviders = await userProvidersService.getUserProviders(
          orgId,
          user!.id,
        );

        providersData = userProviders.map(up => ({
          id: up.id,
          name: up.name,
          org_id: orgId,
          active: true,
          created_at: '',
          updated_at: '',
        }));
      }

      setCargoTypes(cargoTypesData);
      setProviders(providersData);

      console.log('[PreReservationMiniModal] ✅ Catalogs loaded', {
        cargoTypesCount: cargoTypesData.length,
        providersCount: providersData.length,
      });

      // Auto‑seleccionar si hay 1 solo proveedor
      if (providersData.length === 1 && !selectedProviderId) {
        const singleProvider = providersData[0];
        setSelectedProviderId(singleProvider.id);
        console.log('[PreReservationMiniModal] 🎯 Auto‑selecting single provider', {
          providerId: singleProvider.id,
          providerName: singleProvider.name,
        });
      }
    } catch (error) {
      console.error('[PreReservationMiniModal] ❌ Error loading catalogs', error);
    } finally {
      setLoading(false);
    }
  };

  // Resolver clientId cuando cambia el proveedor seleccionado
  useEffect(() => {
    if (!isOpen || !orgId || !selectedProviderId) {
      setResolvedClientId('');
      setClientError('');
      setLoadingClient(false);
      return;
    }

    const resolveClient = async () => {
      setLoadingClient(true);
      setClientError('');
      setResolvedClientId('');

      try {
        const clientId = await dockAllocationService.resolveClientIdFromProvider(
          orgId,
          selectedProviderId,
          warehouseId,
        );

        if (clientId) {
          setResolvedClientId(clientId);
          console.log('[PreReservationMiniModal] ✅ Client resolved', {
            providerId: selectedProviderId,
            clientId,
          });
        } else {
          setResolvedClientId('');
          setClientError(
            'No se encontró un cliente vinculado a este proveedor. Las reglas de andenes no se aplicarán.',
          );
          console.warn('[PreReservationMiniModal] ⚠️ No client found for provider', {
            providerId: selectedProviderId,
          });
        }
      } catch (err) {
        console.error('[PreReservationMiniModal] ❌ Error resolving client', err);
        setResolvedClientId('');
        setClientError('Error al resolver el cliente del proveedor.');
      } finally {
        setLoadingClient(false);
      }
    };

    resolveClient();
  }, [isOpen, orgId, selectedProviderId, warehouseId]);

  // Resetear form cuando se cierra
  useEffect(() => {
    if (!isOpen) {
      setSelectedCargoTypeId('');
      setSelectedProviderId('');
      setRequiredMinutes(30);
      setDurationSource('none');
      setLoadingDuration(false);
      setResolvedClientId('');
      setLoadingClient(false);
      setClientError('');
      reqKeyRef.current = '';
    }
  }, [isOpen]);

  const selectedCargoType = cargoTypes.find(ct => ct.id === selectedCargoTypeId);

  // Buscar avg_minutes del perfil cuando hay combinación
  useEffect(() => {
    if (!isOpen) return;

    const cargoTypeId = selectedCargoTypeId;
    const providerId = selectedProviderId;

    if (!cargoTypeId || !providerId) {
      const def = selectedCargoType?.default_minutes ?? null;

      if (typeof def === 'number' && def >= 5) {
        setRequiredMinutes(def);
        setDurationSource('cargo_default');
      } else {
        setRequiredMinutes(30);
        setDurationSource(selectedCargoType ? 'fallback_30' : 'none');
      }

      setLoadingDuration(false);
      reqKeyRef.current = '';
      return;
    }

    const reqKey = `${orgId}:${providerId}:${cargoTypeId}`;
    reqKeyRef.current = reqKey;

    const run = async () => {
      setLoadingDuration(true);
      try {
        const profile = await timeProfilesService.findMatchingProfile(
          orgId,
          providerId,
          cargoTypeId,
        );

        if (reqKeyRef.current !== reqKey) return;

        if (profile?.avg_minutes && profile.avg_minutes >= 5) {
          setRequiredMinutes(profile.avg_minutes);
          setDurationSource('profile');
          return;
        }

        const def = selectedCargoType?.default_minutes ?? null;
        if (typeof def === 'number' && def >= 5) {
          setRequiredMinutes(def);
          setDurationSource('cargo_default');
        } else {
          setRequiredMinutes(30);
          setDurationSource('fallback_30');
        }
      } catch (error) {
        console.error('[PreReservationMiniModal] Error loading time profile', error);

        const def = selectedCargoType?.default_minutes ?? null;
        if (typeof def === 'number' && def >= 5) {
          setRequiredMinutes(def);
          setDurationSource('cargo_default');
        } else {
          setRequiredMinutes(30);
          setDurationSource('fallback_30');
        }
      } finally {
        if (reqKeyRef.current === reqKey) setLoadingDuration(false);
      }
    };

    run();
  }, [
    isOpen,
    orgId,
    selectedCargoTypeId,
    selectedProviderId,
    selectedCargoType?.default_minutes,
  ]);

  const canContinue =
    Boolean(selectedCargoTypeId && selectedProviderId) &&
    requiredMinutes >= 5 &&
    !loadingClient;

  const handleConfirm = () => {
    if (!canContinue || !selectedCargoTypeId || !selectedProviderId) return;

    // Si no hay clientId resuelto, permitir continuar pero sin reglas de andenes
    console.log('[PreReservationMiniModal] Confirming', {
      cargoTypeId: selectedCargoTypeId,
      providerId: selectedProviderId,
      clientId: resolvedClientId || '(none)',
      requiredMinutes,
      durationSource,
    });

    onConfirm({
      cargoTypeId: selectedCargoTypeId,
      providerId: selectedProviderId,
      clientId: resolvedClientId,
      requiredMinutes,
    });
  };

  const handleCancel = () => {
    console.log('[PreReservationMiniModal] Cancelled');
    onClose();
  };

  if (!isOpen) return null;

  const isProviderDisabled = providers.length === 1 || loading;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Nueva Reserva</h2>
            <button
              onClick={handleCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <i className="ri-close-line text-xl"></i>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Info de Almacén actual */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <div className="flex items-start gap-2">
              <i className="ri-building-2-line text-blue-600 text-lg flex-shrink-0 mt-0.5"></i>
              <div className="flex-1 text-sm">
                <p className="font-medium text-blue-900 mb-1">Almacén seleccionado</p>
                <p className="text-blue-700">{warehouseLabel}</p>
                <p className="text-xs text-blue-600 mt-1">
                  Podés cambiar el almacén desde el selector principal si necesitás ver otros
                  andenes
                </p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <i className="ri-loader-4-line text-3xl text-teal-600 animate-spin"></i>
              <p className="mt-2 text-sm text-gray-600">Cargando catálogos...</p>
            </div>
          ) : (
            <>
              {/* Tipo de Carga */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Carga <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedCargoTypeId}
                  onChange={e => setSelectedCargoTypeId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  disabled={loading}
                >
                  <option value="">Seleccionar tipo de carga</option>
                  {cargoTypes.map(ct => (
                    <option key={ct.id} value={ct.id}>
                      {ct.name}
                      {ct.default_minutes ? ` (${ct.default_minutes} min)` : ''}
                    </option>
                  ))}
                </select>
                {cargoTypes.length === 0 && !loading && (
                  <p className="mt-1 text-xs text-amber-600">
                    No hay tipos de carga activos. Creá uno desde Catálogos.
                  </p>
                )}
              </div>

              {/* Proveedor / Expedidor */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Proveedor / Expedidor <span className="text-red-500">*</span>
                </label>

                {providers.length === 1 && (
                  <div className="mb-2 bg-blue-50 border border-blue-200 rounded-md p-2">
                    <div className="flex items-start gap-2">
                      <i className="ri-information-line text-blue-600 text-sm flex-shrink-0 mt-0.5"></i>
                      <p className="text-xs text-blue-700">
                        Proveedor preseleccionado (es tu único proveedor asignado)
                      </p>
                    </div>
                  </div>
                )}

                {providers.length > 1 && !isPrivileged && (
                  <div className="mb-2 bg-blue-50 border border-blue-200 rounded-md p-2">
                    <div className="flex items-start gap-2">
                      <i className="ri-information-line text-blue-600 text-sm flex-shrink-0 mt-0.5"></i>
                      <p className="text-xs text-blue-700">
                        Mostrando {providers.length} proveedores asignados a tu usuario
                      </p>
                    </div>
                  </div>
                )}

                {providers.length === 0 && !loading && (
                  <div className="mb-2 bg-amber-50 border border-amber-200 rounded-md p-2">
                    <div className="flex items-start gap-2">
                      <i className="ri-alert-line text-amber-600 text-sm flex-shrink-0 mt-0.5"></i>
                      <p className="text-xs text-amber-700">
                        No tenés proveedores asignados. Contactá a un administrador para que te
                        asigne proveedores.
                      </p>
                    </div>
                  </div>
                )}

                <select
                  value={selectedProviderId}
                  onChange={e => setSelectedProviderId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  disabled={isProviderDisabled || providers.length === 0}
                >
                  <option value="">
                    {providers.length === 0 ? 'Sin proveedores asignados' : 'Seleccionar proveedor'}
                  </option>
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                {/* Indicador de resolución de cliente */}
                {selectedProviderId && loadingClient && (
                  <p className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                    <i className="ri-loader-4-line animate-spin text-sm"></i>
                    Resolviendo cliente vinculado...
                  </p>
                )}
                {selectedProviderId && !loadingClient && clientError && (
                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded-md p-2">
                    <div className="flex items-start gap-2">
                      <i className="ri-alert-line text-amber-600 text-sm flex-shrink-0 mt-0.5"></i>
                      <p className="text-xs text-amber-700">{clientError}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Info de Duración */}
              <div className="bg-teal-50 border border-teal-200 rounded-md p-3">
                <div className="flex items-start gap-2">
                  <i className="ri-time-line text-teal-600 text-lg flex-shrink-0 mt-0.5"></i>
                  <div className="flex-1 text-sm text-teal-900">
                    <p className="font-medium mb-1">
                      Duración requerida:{' '}
                      {selectedCargoType
                        ? loadingDuration
                          ? 'calculando...'
                          : `${requiredMinutes} min`
                        : '—'}
                    </p>
                    <p className="text-teal-700">
                      {loadingDuration
                        ? 'Buscando tiempo promedio para esta combinación...'
                        : durationSource === 'profile'
                        ? 'Usando tiempo promedio del perfil (Proveedor x Tipo de carga).'
                        : durationSource === 'cargo_default'
                        ? 'No hay perfil para la combinación; usando minutos por defecto del tipo de carga.'
                        : durationSource === 'fallback_30'
                        ? 'No hay minutos definidos; usando fallback de 30 min.'
                        : 'El calendario habilitará solo espacios con tiempo continuo suficiente'}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors whitespace-nowrap"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canContinue || loading || loadingDuration || providers.length === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            Elegir espacio en calendario
          </button>
        </div>
      </div>
    </div>
  );
}
