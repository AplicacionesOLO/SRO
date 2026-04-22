
import { useState, useEffect, useRef } from 'react';
import type { CargoType, Provider } from '../../../types/catalog';
import { saveGenericDraft, readGenericDraft, clearGenericDraft } from '../../../hooks/useReservationDraft';
import { cargoTypesService } from '../../../services/cargoTypesService';
import { providersService } from '../../../services/providersService';
import { userProvidersService } from '../../../services/userProvidersService';
import { timeProfilesService } from '../../../services/timeProfilesService';
import { dockAllocationService } from '../../../services/dockAllocationService';
import { useAuth } from '../../../contexts/AuthContext';
import SearchSelect from '../../../components/base/SearchSelect';

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
    quantityValue?: number | null;
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

  const DRAFT_KEY = `pre_reservation_draft_${orgId}_${warehouseId || 'all'}`;

  const [selectedCargoTypeId, setSelectedCargoTypeId] = useState<string>('');
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [cargoTypes, setCargoTypes] = useState<CargoType[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);

  // duración calculada por perfil o fallback
  const [requiredMinutes, setRequiredMinutes] = useState<number>(30);
  const [durationSource, setDurationSource] = useState<
    'dynamic_calc' | 'profile' | 'cargo_default' | 'fallback_30' | 'none'
  >('none');
  const [loadingDuration, setLoadingDuration] = useState(false);

  // Campo dinámico: cantidad capturada en este primer modal
  const [quantityValue, setQuantityValue] = useState<string>('');

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

  // Restaurar draft al abrir
  useEffect(() => {
    if (isOpen) {
      const draft = readGenericDraft<{ cargoTypeId: string; providerId: string }>(DRAFT_KEY);
      if (draft) {
        if (draft.formData.cargoTypeId) setSelectedCargoTypeId(draft.formData.cargoTypeId);
        if (draft.formData.providerId) setSelectedProviderId(draft.formData.providerId);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Auto-save draft cuando cambian las selecciones
  useEffect(() => {
    if (!isOpen) return;
    saveGenericDraft(DRAFT_KEY, { cargoTypeId: selectedCargoTypeId, providerId: selectedProviderId });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCargoTypeId, selectedProviderId, isOpen]);

  // Cargar catálogos cuando se abre el modal
  useEffect(() => {
    if (isOpen && orgId && user?.id) {
      loadCatalogs();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, orgId, user?.id, warehouseId]);

  const loadCatalogs = async () => {
    setLoading(true);
    try {
      /**console.log('[PreReservationMiniModal] 🔍 Loading catalogs', {
        orgId,
        userId: user?.id,
        userRole: user?.role,
        isPrivileged,
      });*/

      const cargoTypesData = await cargoTypesService.getByWarehouse(orgId, warehouseId ?? null, true);

      let providersData: Provider[] = [];

      if (isPrivileged) {
        // Usuarios privilegiados: cargar proveedores del almacén activo (no todos los de la org)
        providersData = await providersService.getByWarehouse(orgId, warehouseId ?? null, true);
      } else {
        // Usuarios no privilegiados: proveedores asignados al usuario,
        // intersectados con los del almacén activo
        const [userProviders, warehouseProviders] = await Promise.all([
          userProvidersService.getUserProviders(orgId, user!.id),
          providersService.getByWarehouse(orgId, warehouseId ?? null, true),
        ]);

        const warehouseProviderIds = new Set(warehouseProviders.map((p) => p.id));
        const filtered = warehouseId
          ? userProviders.filter((up) => warehouseProviderIds.has(up.id))
          : userProviders;

        providersData = filtered.map(up => ({
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

      /**console.log('[PreReservationMiniModal] ✅ Catalogs loaded', {
        cargoTypesCount: cargoTypesData.length,
        providersCount: providersData.length,
      });*/

      // Auto‑seleccionar si hay 1 solo proveedor
      if (providersData.length === 1 && !selectedProviderId) {
        const singleProvider = providersData[0];
        setSelectedProviderId(singleProvider.id);
        /**console.log('[PreReservationMiniModal] 🎯 Auto‑selecting single provider', {
          providerId: singleProvider.id,
          providerName: singleProvider.name,
        });*/
      }
    } catch (error: any) {
      // non-blocking catalog load error
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
          /**console.log('[PreReservationMiniModal] ✅ Client resolved', {
            providerId: selectedProviderId,
            clientId,
          });*/
        } else {
          setResolvedClientId('');
          setClientError(
            'No se encontró un cliente vinculado a este proveedor. Las reglas de andenes no se aplicarán.',
          );

        }
      } catch (err: any) {

        setResolvedClientId('');
        setClientError('Error al resolver el cliente del proveedor.');
      } finally {
        setLoadingClient(false);
      }
    };

    resolveClient();
  }, [isOpen, orgId, selectedProviderId, warehouseId]);

  // Resetear form cuando se cierra (NO limpia draft — se preserva para restaurar al reabrir)
  useEffect(() => {
    if (!isOpen) {
      setRequiredMinutes(30);
      setDurationSource('none');
      setLoadingDuration(false);
      setResolvedClientId('');
      setLoadingClient(false);
      setClientError('');
      setQuantityValue('');
      reqKeyRef.current = '';
    }
  }, [isOpen]);

  const selectedCargoType = cargoTypes.find(ct => ct.id === selectedCargoTypeId);
  const isDynamic = selectedCargoType?.is_dynamic === true;

  // Buscar perfil de tiempo y calcular duración requerida
  useEffect(() => {
    if (!isOpen) return;

    const cargoTypeId = selectedCargoTypeId;
    const providerId = selectedProviderId;

    // Sin tipo+proveedor: intentar usar default del tipo si existe
    if (!cargoTypeId || !providerId) {
      // Para tipos dinámicos sin proveedor elegido, no calcular aún
      if (selectedCargoType?.is_dynamic) {
        setRequiredMinutes(30);
        setDurationSource('none');
        setLoadingDuration(false);
        reqKeyRef.current = '';
        return;
      }
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

    // Para tipos dinámicos: recalcular cuando cambia quantityValue también
    const qty = isDynamic ? (quantityValue.trim() ? Number(quantityValue) : null) : null;

    const reqKey = `${orgId}:${providerId}:${cargoTypeId}:${qty ?? ''}`;
    reqKeyRef.current = reqKey;

    const run = async () => {
      setLoadingDuration(true);
      try {
        const profile = await timeProfilesService.findMatchingProfile(orgId, providerId, cargoTypeId, warehouseId);

        if (reqKeyRef.current !== reqKey) return;

        // ── TIPO DINÁMICO ────────────────────────────────────────────────
        if (isDynamic && qty != null && Number.isFinite(qty) && qty > 0) {
          // Rate efectivo: perfil específico > tipo de carga > fallback avg_minutes
          const effectiveSpu =
            (profile?.seconds_per_unit != null ? Number(profile.seconds_per_unit) : null) ??
            (selectedCargoType?.seconds_per_unit != null ? Number(selectedCargoType.seconds_per_unit) : null);

          if (effectiveSpu != null) {
            const dynamicMin = Math.ceil((effectiveSpu * qty) / 60);
            setRequiredMinutes(Math.max(dynamicMin, 5));
            setDurationSource('dynamic_calc');
            return;
          }

          // Sin seconds_per_unit configurado → fallback a avg_minutes del perfil
          if (profile?.avg_minutes && profile.avg_minutes >= 5) {
            setRequiredMinutes(profile.avg_minutes);
            setDurationSource('profile');
            return;
          }
        }

        // ── TIPO FIJO (o dinámico sin qty aún) ──────────────────────────
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
      } catch (error: any) {
  
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
    selectedCargoType?.seconds_per_unit,
    isDynamic,
    quantityValue,
    warehouseId,
  ]);

  // Para dinámicos: requerir cantidad válida antes de habilitar Continuar
  const dynamicQuantityValid = !isDynamic || (
    quantityValue.trim() !== '' &&
    Number.isFinite(Number(quantityValue)) &&
    Number(quantityValue) > 0
  );

  const canContinue =
    Boolean(selectedCargoTypeId && selectedProviderId) &&
    dynamicQuantityValid &&
    requiredMinutes >= 5 &&
    !loadingClient &&
    !loadingDuration;

  const handleConfirm = () => {
    if (!canContinue || !selectedCargoTypeId || !selectedProviderId) return;

    clearGenericDraft(DRAFT_KEY);
    const qty = isDynamic && quantityValue.trim() ? Number(quantityValue) : null;
    onConfirm({
      cargoTypeId: selectedCargoTypeId,
      providerId: selectedProviderId,
      clientId: resolvedClientId,
      requiredMinutes,
      quantityValue: qty,
    });
  };

  const handleCancel = () => {
    clearGenericDraft(DRAFT_KEY);
    setSelectedCargoTypeId('');
    setSelectedProviderId('');
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

                <SearchSelect
                  options={providers.map(p => ({ id: p.id, label: p.name }))}
                  value={selectedProviderId}
                  onChange={setSelectedProviderId}
                  placeholder={
                    providers.length === 0 ? 'Sin proveedores asignados' : 'Buscar proveedor...'
                  }
                  disabled={isProviderDisabled || providers.length === 0}
                />

                {/* Indicador de resolución de cliente */}
                {selectedProviderId && loadingClient && (
                  <p className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                    <i className="ri-loader-4-line animate-spin text-sm"></i>
                    Verificando configuración de andenes...
                  </p>
                )}
                {selectedProviderId && !loadingClient && resolvedClientId && (
                  <p className="mt-1 text-xs text-teal-700 flex items-center gap-1">
                    <i className="ri-checkbox-circle-line text-sm"></i>
                    Reglas de andenes aplicadas automáticamente
                  </p>
                )}
                {selectedProviderId && !loadingClient && clientError && !resolvedClientId && (
                  <p className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                    <i className="ri-information-line text-sm"></i>
                    Este proveedor opera sin asignación de andenes automática
                  </p>
                )}
              </div>

              {/* ── Campo dinámico: aparece solo si el tipo lo requiere ── */}
              {isDynamic && (
                <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <i className="ri-flashlight-line text-amber-600 text-sm flex-shrink-0"></i>
                    <p className="text-xs font-semibold text-amber-900">
                      Este tipo de carga requiere un dato adicional para calcular la duración
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {selectedCargoType?.unit_label || selectedCargoType?.measurement_key || 'Cantidad'}{' '}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={quantityValue}
                      onChange={e => {
                        setQuantityValue(e.target.value);
                      }}
                      placeholder="Ej: 100"
                      className="w-full px-3 py-2 border border-amber-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent text-sm"
                    />
                    {quantityValue && Number(quantityValue) > 0 && (() => {
                      const effectiveSpu =
                        selectedCargoType?.seconds_per_unit != null
                          ? Number(selectedCargoType.seconds_per_unit)
                          : null;
                      if (effectiveSpu == null) return null;
                      const calcMin = Math.ceil((effectiveSpu * Number(quantityValue)) / 60);
                      return (
                        <p className="text-xs text-amber-700 mt-1">
                          ceil({effectiveSpu} seg × {quantityValue} / 60) ={' '}
                          <span className="font-semibold">{calcMin} min</span>
                        </p>
                      );
                    })()}
                  </div>
                </div>
              )}

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
                          : isDynamic && !dynamicQuantityValid
                            ? 'ingresá la cantidad para calcular'
                            : `${requiredMinutes} min`
                        : '—'}
                    </p>
                    <p className="text-teal-700">
                      {loadingDuration
                        ? 'Calculando duración...'
                        : durationSource === 'dynamic_calc'
                        ? `Calculado: ceil(seg/unidad × cantidad / 60) = ${requiredMinutes} min`
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
