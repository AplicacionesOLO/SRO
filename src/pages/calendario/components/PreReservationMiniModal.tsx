import { useState, useEffect, useRef, useCallback } from 'react';
import type { CargoType, Provider } from '../../../types/catalog';
import { saveGenericDraft, readGenericDraft, clearGenericDraft } from '../../../hooks/useReservationDraft';
import { cargoTypesService } from '../../../services/cargoTypesService';
import { providersService } from '../../../services/providersService';
import { userProvidersService } from '../../../services/userProvidersService';
import { timeProfilesService } from '../../../services/timeProfilesService';
import { dockAllocationService } from '../../../services/dockAllocationService';
import { useAuth } from '../../../contexts/AuthContext';
import SearchSelect from '../../../components/base/SearchSelect';
import { formatProviderLabel } from '../../../utils/providerFormat';
import { supabase } from '../../../lib/supabase';

interface PreReservationMiniModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  warehouseId: string | null;
  warehouseLabel: string;
  onConfirm: (data: {
    cargoTypeId: string;
    providerId: string;
    providerName?: string;
    clientId: string;
    clientIds: string[];
    requiredMinutes: number;
    quantityValue?: number | null;
    isConsolidated?: boolean;
    consolidatedProviders?: Array<{ provider_id: string; provider_name: string; package_quantity: number }>;
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
  // ── providers ahora es lazy: resultados de búsqueda server-side, NO la lista completa ──
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [providerSearchLoading, setProviderSearchLoading] = useState(false);

  // duración calculada por perfil o fallback
  const [requiredMinutes, setRequiredMinutes] = useState<number>(30);
  const [durationSource, setDurationSource] = useState<
    'dynamic_calc' | 'profile' | 'cargo_default' | 'fallback_30' | 'none'
  >('none');
  const [loadingDuration, setLoadingDuration] = useState(false);

  // Campo dinámico: cantidad capturada en este primer modal
  const [quantityValue, setQuantityValue] = useState<string>('');

  // clientId resuelto desde el proveedor seleccionado (primario para la reserva)
  const [resolvedClientId, setResolvedClientId] = useState<string>('');
  // TODOS los client_ids válidos para el proveedor en este almacén (para reglas de andenes combinadas)
  const [resolvedClientIds, setResolvedClientIds] = useState<string[]>([]);
  const [loadingClient, setLoadingClient] = useState(false);
  const [clientError, setClientError] = useState<string>('');

  // Reserva consolidada
  const [isConsolidated, setIsConsolidated] = useState(false);
  const [consolidatedProviders, setConsolidatedProviders] = useState<
    Array<{ provider_id: string; provider_name: string; package_quantity: number }>
  >([]);
  const [consolidatedProviderId, setConsolidatedProviderId] = useState('');
  const [consolidatedQuantity, setConsolidatedQuantity] = useState('');
  const [consolidatedError, setConsolidatedError] = useState('');

  // Estados expand/collapse para secciones colapsables en reserva consolidada
  const [expandConsolidated, setExpandConsolidated] = useState(false);
  const [expandDynamic, setExpandDynamic] = useState(false);

  // Evita race conditions (cambios rápidos de selects)
  const reqKeyRef = useRef<string>('');

  // ── Modo no-privilegiado: IDs de proveedores asignados al usuario ──
  const [userProviderIds, setUserProviderIds] = useState<Set<string>>(new Set());
  const [userProviderCount, setUserProviderCount] = useState<number>(-1); // -1 = no cargado aún

  // Determinar si el usuario es privilegiado (admin/full_access)
  const isPrivileged =
    canLocal('admin.users.update') ||
    canLocal('admin.users.create') ||
    canLocal('admin.warehouses.update') ||
    user?.role === 'ADMIN' ||
    user?.role === 'admin' ||
    user?.role === 'SUPERADMIN' ||
    user?.role === 'superadmin';

  // ── Fetch rápido de un solo proveedor por ID (para draft restore) ──
  const fetchSingleProvider = useCallback(async (providerId: string): Promise<Provider | null> => {
    const { data } = await supabase
      .from('providers')
      .select('id, org_id, name, active, provider_type, provider_code, source, source_code, client_id, created_at')
      .eq('id', providerId)
      .maybeSingle();
    return (data as Provider) ?? null;
  }, []);

  // Restaurar draft al abrir
  useEffect(() => {
    if (isOpen) {
      const draft = readGenericDraft<{
        cargoTypeId: string;
        providerId: string;
        isConsolidated?: boolean;
        consolidatedProviders?: Array<{ provider_id: string; provider_name: string; package_quantity: number }>;
      }>(DRAFT_KEY);
      if (draft) {
        if (draft.formData.cargoTypeId) setSelectedCargoTypeId(draft.formData.cargoTypeId);
        if (draft.formData.isConsolidated != null) setIsConsolidated(draft.formData.isConsolidated);
        if (draft.formData.consolidatedProviders) setConsolidatedProviders(draft.formData.consolidatedProviders);
        if (draft.formData.providerId) {
          setSelectedProviderId(draft.formData.providerId);
          // Fetch rápido del proveedor para que SearchSelect muestre su label
          fetchSingleProvider(draft.formData.providerId).then(p => {
            if (p) setProviders(prev => {
              const exists = prev.some(x => x.id === p.id);
              return exists ? prev : [...prev, p];
            });
          });
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Auto-save draft cuando cambian las selecciones
  useEffect(() => {
    if (!isOpen) return;
    saveGenericDraft(DRAFT_KEY, {
      cargoTypeId: selectedCargoTypeId,
      providerId: selectedProviderId,
      isConsolidated,
      consolidatedProviders,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCargoTypeId, selectedProviderId, isOpen, isConsolidated, consolidatedProviders]);

  // ── Carga inicial rápida: solo cargoTypes + (si no es admin) userProviders ──
  useEffect(() => {
    if (isOpen && orgId && user?.id) {
      loadCatalogs();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, orgId, user?.id, warehouseId]);

  const loadCatalogs = async () => {
    console.time('[NewReservation] PreModal ══ TOTAL loadCatalogs ══');
    setLoading(true);
    try {
      console.time('[NewReservation] PreModal ── cargoTypes ──');
      const cargoTypesData = await cargoTypesService.getByWarehouse(orgId, warehouseId ?? null, true);
      console.timeEnd('[NewReservation] PreModal ── cargoTypes ──');
      setCargoTypes(cargoTypesData);

      if (!isPrivileged) {
        console.time('[NewReservation] PreModal ── userProviders ──');
        const userProvs = await userProvidersService.getUserProviders(orgId, user!.id);
        console.timeEnd('[NewReservation] PreModal ── userProviders ──');
        const ids = new Set(userProvs.map(up => up.id));
        setUserProviderIds(ids);
        setUserProviderCount(userProvs.length);

        // Auto-seleccionar si hay exactamente 1 proveedor asignado
        if (userProvs.length === 1) {
          const singleProvider = userProvs[0];
          setSelectedProviderId(singleProvider.id);
          setProviders([{
            id: singleProvider.id,
            name: singleProvider.name,
            org_id: orgId,
            active: true,
            created_at: '',
            updated_at: '',
          }]);
        }
      } else {
        setUserProviderCount(-1); // admin: sin restricción
      }

      console.log('[NewReservation] PreModal ── cargoTypes count:', cargoTypesData.length, '| userProviderCount:', isPrivileged ? 'admin' : userProviderCount);
    } catch (error: any) {
      // non-blocking catalog load error
    } finally {
      setLoading(false);
      console.timeEnd('[NewReservation] PreModal ══ TOTAL loadCatalogs ══');
    }
  };

  // ── Búsqueda server-side de proveedores (debounced por SearchSelect) ──
  const handleProviderSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      // Sin query: si es no-privilegiado y tiene 1 solo proveedor, mantenerlo visible
      if (!isPrivileged && userProviderCount === 1 && selectedProviderId) {
        // mantener el proveedor único en providers para que SearchSelect muestre su label
        return;
      }
      setProviders([]);
      return;
    }

    setProviderSearchLoading(true);
    try {
      const results = await providersService.searchProviders(orgId, warehouseId ?? null, query, 25, true);

      if (!isPrivileged && userProviderIds.size > 0) {
        // Filtrar: solo mostrar proveedores asignados al usuario
        const filtered = results.filter(p => userProviderIds.has(p.id));
        setProviders(filtered);
      } else {
        setProviders(results);
      }
    } catch {
      setProviders([]);
    } finally {
      setProviderSearchLoading(false);
    }
  }, [orgId, warehouseId, isPrivileged, userProviderIds, userProviderCount, selectedProviderId]);

  // Resolver clientId cuando cambia el proveedor seleccionado
  useEffect(() => {
    if (!isOpen || !orgId || !selectedProviderId) {
      setResolvedClientId('');
      setResolvedClientIds([]);
      setClientError('');
      setLoadingClient(false);
      return;
    }

    const resolveClient = async () => {
      setLoadingClient(true);
      setClientError('');
      setResolvedClientId('');
      setResolvedClientIds([]);

      try {
        const clientIds = await dockAllocationService.resolveClientIdsFromProvider(
          orgId,
          selectedProviderId,
          warehouseId,
        );

        if (clientIds.length > 0) {
          setResolvedClientIds(clientIds);
          setResolvedClientId(clientIds[0]);
        } else {
          setResolvedClientIds([]);
          setResolvedClientId('');
          setClientError(
            'No se encontró un cliente vinculado a este proveedor. Las reglas de andenes no se aplicarán.',
          );
        }
      } catch (err: any) {
        setResolvedClientId('');
        setResolvedClientIds([]);
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
      setRequiredMinutes(30);
      setDurationSource('none');
      setLoadingDuration(false);
      setResolvedClientId('');
      setResolvedClientIds([]);
      setLoadingClient(false);
      setClientError('');
      setQuantityValue('');
      reqKeyRef.current = '';
      setIsConsolidated(false);
      setConsolidatedProviders([]);
      setConsolidatedProviderId('');
      setConsolidatedQuantity('');
      setConsolidatedError('');
      setProviders([]);
      setUserProviderIds(new Set());
      setUserProviderCount(-1);
    }
  }, [isOpen]);

  const selectedCargoType = cargoTypes.find(ct => ct.id === selectedCargoTypeId);
  const isDynamic = selectedCargoType?.is_dynamic === true;

  // Calcular total de bultos consolidados
  const totalConsolidatedPackages = consolidatedProviders.reduce((sum, cp) => sum + cp.package_quantity, 0);

  // Buscar perfil de tiempo y calcular duración requerida
  useEffect(() => {
    if (!isOpen) return;

    const cargoTypeId = selectedCargoTypeId;
    const providerId = selectedProviderId;

    // Sin tipo+proveedor: intentar usar default del tipo si existe
    if (!cargoTypeId || !providerId) {
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

    // Para tipos dinámicos: si es consolidado, usar total de bultos como cantidad base
    let effectiveQty: number | null = null;
    if (isDynamic) {
      if (isConsolidated) {
        if (totalConsolidatedPackages > 0) {
          effectiveQty = totalConsolidatedPackages;
        }
      } else {
        effectiveQty = quantityValue.trim() !== '' ? Number(quantityValue) : null;
      }
    }

    const reqKey = `${orgId}:${providerId}:${cargoTypeId}:${effectiveQty ?? ''}:${isConsolidated}`;
    reqKeyRef.current = reqKey;

    const run = async () => {
      setLoadingDuration(true);
      try {
        const profile = await timeProfilesService.findMatchingProfile(orgId, providerId, cargoTypeId, warehouseId);

        if (reqKeyRef.current !== reqKey) return;

        // ── TIPO DINÁMICO ────────────────────────────────────────────────
        if (isDynamic && effectiveQty != null && Number.isFinite(effectiveQty) && effectiveQty > 0) {
          const effectiveSpu =
            (profile?.seconds_per_unit != null ? Number(profile.seconds_per_unit) : null) ??
            (selectedCargoType?.seconds_per_unit != null ? Number(selectedCargoType.seconds_per_unit) : null);

          if (effectiveSpu != null) {
            const dynamicMin = Math.ceil((effectiveSpu * effectiveQty) / 60);
            setRequiredMinutes(Math.max(dynamicMin, 5));
            setDurationSource('dynamic_calc');
            return;
          }

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
    isConsolidated,
    totalConsolidatedPackages,
  ]);

  // Helpers para proveedores consolidados
  const handleAddConsolidatedProvider = () => {
    setConsolidatedError('');

    if (!consolidatedProviderId) {
      setConsolidatedError('Seleccioná un proveedor para agregar.');
      return;
    }

    const qty = Number(consolidatedQuantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setConsolidatedError('La cantidad de bultos debe ser mayor a 0.');
      return;
    }

    if (consolidatedProviders.some(cp => cp.provider_id === consolidatedProviderId)) {
      setConsolidatedError('Este proveedor ya fue agregado.');
      return;
    }

    const providerName = providers.find(p => p.id === consolidatedProviderId)?.name || '—';
    setConsolidatedProviders(prev => [
      ...prev,
      { provider_id: consolidatedProviderId, provider_name: providerName, package_quantity: qty },
    ]);
    setConsolidatedProviderId('');
    setConsolidatedQuantity('');
  };

  const handleRemoveConsolidatedProvider = (providerId: string) => {
    setConsolidatedProviders(prev => prev.filter(cp => cp.provider_id !== providerId));
  };

  // Para dinámicos: requerir cantidad válida antes de habilitar Continuar
  const dynamicQuantityValid = !isDynamic || isConsolidated || (
    quantityValue.trim() !== '' &&
    Number.isFinite(Number(quantityValue)) &&
    Number(quantityValue) > 0
  );

  const providerReady = isConsolidated
    ? consolidatedProviders.length > 0
    : Boolean(selectedProviderId);

  const canContinue =
    Boolean(selectedCargoTypeId && providerReady) &&
    dynamicQuantityValid &&
    requiredMinutes >= 5 &&
    !loadingClient &&
    !loadingDuration;

  const handleConfirm = () => {
    if (!canContinue || !selectedCargoTypeId || (!isConsolidated && !selectedProviderId)) return;

    clearGenericDraft(DRAFT_KEY);
    const qty = isDynamic && !isConsolidated && quantityValue.trim() ? Number(quantityValue) : null;
    const providerName = !isConsolidated && selectedProviderId
      ? providers.find(p => p.id === selectedProviderId)?.name || ''
      : '';
    onConfirm({
      cargoTypeId: selectedCargoTypeId,
      providerId: selectedProviderId,
      providerName,
      clientId: resolvedClientId,
      clientIds: resolvedClientIds,
      requiredMinutes,
      quantityValue: qty,
      isConsolidated,
      consolidatedProviders: isConsolidated ? consolidatedProviders : undefined,
    });
  };

  const handleCancel = () => {
    clearGenericDraft(DRAFT_KEY);
    setSelectedCargoTypeId('');
    setSelectedProviderId('');
    setIsConsolidated(false);
    setConsolidatedProviders([]);
    setConsolidatedProviderId('');
    setConsolidatedQuantity('');
    setConsolidatedError('');
    onClose();
  };

  if (!isOpen) return null;

  // ── Determinar estado visible del selector de proveedores ──
  const isSingleProvider = !isPrivileged && userProviderCount === 1;
  const isNoProviders = !isPrivileged && userProviderCount === 0;
  const isProviderDisabled = isSingleProvider || loading;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
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

              {/* Proveedor / Expedidor — oculto cuando es consolidada */}
              {!isConsolidated && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Proveedor / Expedidor <span className="text-red-500">*</span>
                </label>

                {isSingleProvider && (
                  <div className="mb-2 bg-blue-50 border border-blue-200 rounded-md p-2">
                    <div className="flex items-start gap-2">
                      <i className="ri-information-line text-blue-600 text-sm flex-shrink-0 mt-0.5"></i>
                      <p className="text-xs text-blue-700">
                        Proveedor preseleccionado (es tu único proveedor asignado)
                      </p>
                    </div>
                  </div>
                )}

                {!isPrivileged && userProviderCount > 1 && (
                  <div className="mb-2 bg-blue-50 border border-blue-200 rounded-md p-2">
                    <div className="flex items-start gap-2">
                      <i className="ri-information-line text-blue-600 text-sm flex-shrink-0 mt-0.5"></i>
                      <p className="text-xs text-blue-700">
                        Mostrando {userProviderCount} proveedores asignados a tu usuario
                      </p>
                    </div>
                  </div>
                )}

                {isNoProviders && (
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
                  options={providers.map(p => ({ id: p.id, label: formatProviderLabel(p) }))}
                  value={selectedProviderId}
                  onChange={setSelectedProviderId}
                  placeholder={
                    isNoProviders ? 'Sin proveedores asignados' : 'Buscar proveedor...'
                  }
                  disabled={isProviderDisabled || isNoProviders}
                  onSearch={handleProviderSearch}
                  loading={providerSearchLoading}
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
              )}

              {/* Checkbox Reserva Consolidada */}
              {!isNoProviders && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="pre-consolidated-check"
                    checked={isConsolidated}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setIsConsolidated(checked);
                      if (checked) {
                        setSelectedProviderId('');
                        setQuantityValue('');
                        setResolvedClientId('');
                        setResolvedClientIds([]);
                        setClientError('');
                      } else {
                        setConsolidatedProviders([]);
                        setConsolidatedProviderId('');
                        setConsolidatedQuantity('');
                        setConsolidatedError('');
                        if (isSingleProvider) {
                          setSelectedProviderId(providers[0]?.id || '');
                        }
                      }
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                  />
                  <label htmlFor="pre-consolidated-check" className="text-sm text-gray-700 cursor-pointer select-none">
                    Reserva consolidada
                  </label>
                </div>
              )}

              {/* Panel Consolidado */}
              {isConsolidated && !isNoProviders && (
                <div className="bg-gray-50 border border-gray-200 rounded-md overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandConsolidated(v => !v)}
                    className="w-full flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-gray-100/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <i className="ri-stack-line text-teal-700 text-sm flex-shrink-0"></i>
                      <span className="text-sm font-semibold text-gray-900">Proveedores del consolidado</span>
                    </div>
                    <i className={`ri-arrow-down-s-line text-gray-500 flex-shrink-0 transition-transform duration-200 ${expandConsolidated ? 'rotate-180' : ''}`}></i>
                  </button>
                  {expandConsolidated && (
                    <div className="px-3 pb-3 space-y-3">
                      <div className="flex gap-2 items-end">
                        <div className="flex-1 min-w-0">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Proveedor</label>
                          <SearchSelect
                            options={providers
                              .filter(p => !consolidatedProviders.some(cp => cp.provider_id === p.id))
                              .map(p => ({ id: p.id, label: formatProviderLabel(p) }))}
                            value={consolidatedProviderId}
                            onChange={setConsolidatedProviderId}
                            placeholder="Buscar proveedor..."
                            disabled={isNoProviders}
                            onSearch={handleProviderSearch}
                            loading={providerSearchLoading}
                          />
                        </div>
                        <div className="w-24 flex-shrink-0">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Bultos</label>
                          <input
                            type="number"
                            min={1}
                            value={consolidatedQuantity}
                            onChange={(e) => setConsolidatedQuantity(e.target.value)}
                            placeholder="0"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleAddConsolidatedProvider}
                          className="px-3 py-2 bg-teal-600 text-white text-sm font-medium rounded-md hover:bg-teal-700 transition-colors whitespace-nowrap flex items-center gap-1 flex-shrink-0 cursor-pointer"
                        >
                          <i className="ri-add-line"></i>
                          Agregar
                        </button>
                      </div>

                      {consolidatedError && (
                        <p className="text-xs text-red-600 flex items-center gap-1">
                          <i className="ri-error-warning-line text-sm"></i>
                          {consolidatedError}
                        </p>
                      )}

                      {consolidatedProviders.length > 0 && (
                        <div className="space-y-1.5">
                          {consolidatedProviders.map((cp) => (
                            <div
                              key={cp.provider_id}
                              className="flex items-center justify-between p-2 bg-white border border-gray-200 rounded-md"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <i className="ri-truck-line text-teal-600 text-sm flex-shrink-0"></i>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">{cp.provider_name}</p>
                                  <p className="text-xs text-gray-500">{cp.package_quantity} bulto{cp.package_quantity !== 1 ? 's' : ''}</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveConsolidatedProvider(cp.provider_id)}
                                className="text-red-500 hover:text-red-700 transition-colors flex-shrink-0"
                                title="Eliminar proveedor"
                              >
                                <i className="ri-delete-bin-line text-lg"></i>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between border-t border-gray-200 pt-2">
                        <span className="text-sm font-medium text-gray-700">Total de bultos</span>
                        <span className="text-sm font-bold text-teal-700">{totalConsolidatedPackages}</span>
                      </div>

                      {consolidatedProviders.length === 0 && (
                        <p className="text-xs text-gray-500">
                          Agregá al menos un proveedor con la cantidad de bultos.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Campo dinámico: cantidad (solo si no es consolidado) */}
              {isDynamic && !isConsolidated && (
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
                          ceil({effectiveSpu} seg &times; {quantityValue} / 60) ={' '}
                          <span className="font-semibold">{calcMin} min</span>
                        </p>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Campo dinámico consolidado: panel colapsable */}
              {isDynamic && isConsolidated && (
                <div className="bg-amber-50 border border-amber-200 rounded-md overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandDynamic(v => !v)}
                    className="w-full flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-amber-100/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <i className="ri-flashlight-line text-amber-600 text-sm flex-shrink-0"></i>
                      <p className="text-xs font-semibold text-amber-900">
                        Datos del tipo de carga dinámico
                      </p>
                    </div>
                    <i className={`ri-arrow-down-s-line text-gray-500 flex-shrink-0 transition-transform duration-200 ${expandDynamic ? 'rotate-180' : ''}`}></i>
                  </button>
                  {expandDynamic && (
                    <div className="px-3 pb-3 space-y-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {selectedCargoType?.unit_label || selectedCargoType?.measurement_key || 'Cantidad'}
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={totalConsolidatedPackages}
                        readOnly
                        className="w-full px-3 py-2 border border-amber-300 rounded-md text-sm bg-amber-50/80 text-amber-900 cursor-default select-none"
                      />
                      <p className="text-xs text-amber-700 mt-1">
                        Cantidad total calculada desde los proveedores consolidados.
                      </p>
                    </div>
                  )}
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
                          : isDynamic && !isConsolidated && !dynamicQuantityValid
                            ? 'ingresá la cantidad para calcular'
                            : `${requiredMinutes} min`
                        : '—'}
                    </p>
                    <p className="text-teal-700">
                      {loadingDuration
                        ? 'Calculando duración...'
                        : durationSource === 'dynamic_calc'
                        ? `Calculado: ceil(seg/unidad &times; cantidad / 60) = ${requiredMinutes} min`
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
            disabled={!canContinue || loading || loadingDuration || isNoProviders}
            className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            Elegir espacio en calendario
          </button>
        </div>
      </div>
    </div>
  );
}