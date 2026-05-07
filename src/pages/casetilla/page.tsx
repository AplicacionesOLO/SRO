import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useUserScope } from '../../hooks/useUserScope';
import { useActiveWarehouse } from '../../contexts/ActiveWarehouseContext';
import WarehousePageHeader from '../../components/feature/WarehousePageHeader';
import WarehouseSelector from '../../components/feature/WarehouseSelector';
import IngresoForm from './components/IngresoForm';
import PendingReservationsGrid from './components/PendingReservationsGrid';
import ExitReservationsGrid from './components/ExitReservationsGrid';
import ExitForm from './components/ExitForm';
import DurationReportGrid from './components/DurationReportGrid';
import NoShowReservationsGrid from './components/NoShowReservationsGrid';
import { ConfirmModal } from '../../components/base/ConfirmModal';
import QRScannerModal from '../../components/feature/QRScannerModal';
import { casetillaService } from '../../services/casetillaService';
import { supabase } from '../../lib/supabase';
import { toWarehouseDateString, DEFAULT_TIMEZONE } from '../../utils/timezoneUtils';
import type { PendingReservation, ExitEligibleReservation, NoShowReservation } from '../../types/casetilla';

const SESSION_KEY = 'casetilla_ui_state';
const FOTOS_INGRESO_KEY = 'casetilla_fotos_ingreso';
const FOTOS_SALIDA_KEY  = 'casetilla_fotos_salida';
const FORM_DATA_INGRESO_KEY = 'casetilla_form_ingreso';

type ViewMode = 'HOME' | 'INGRESO' | 'PENDIENTES' | 'SALIDA' | 'DURACION' | 'NO_SHOW';

interface PersistedUIState {
  viewMode: ViewMode;
  fotosIngreso: string[];
  fotosSalida: string[];
  selectedReservation: PendingReservation | null;
  selectedExitReservation: ExitEligibleReservation | null;
  selectedDate: string | null; // ISO string YYYY-MM-DD
}

const readSession = (): Partial<PersistedUIState> => {
  try { const raw = sessionStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
};
const writeSession = (state: PersistedUIState) => {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(state)); } catch { /* noop */ }
};
const clearSession = () => {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(FOTOS_INGRESO_KEY);
    sessionStorage.removeItem(FOTOS_SALIDA_KEY);
    sessionStorage.removeItem(FORM_DATA_INGRESO_KEY);
  } catch { /* noop */ }
};

export default function CasetillaPage() {
  const { user } = useAuth();
  const { can, orgId: currentOrgId } = usePermissions();

  // ── SCOPE CENTRALIZADO ─ usa user_warehouse_access (tabla real) ──────────
  const {
    allowedWarehouseIds: scopeWarehouseIds,
    availableClients: scopeClients,
    loading: scopeLoading,
  } = useUserScope();

  const {
    activeWarehouse,
    allowedWarehouses,
    hasMultipleWarehouses,
    effectiveWarehouseIds,
    setActiveWarehouseId,
    loading: activeWhLoading,
  } = useActiveWarehouse();

  // ── FECHA: estado con persistencia en sessionStorage ──────────────────────
  const todayStr = toWarehouseDateString(new Date(), DEFAULT_TIMEZONE);
  const persistedDate = readSession().selectedDate;
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    // Si hay una fecha persistida, usarla; sino hoy
    return persistedDate || todayStr;
  });

  const [viewMode, setViewModeRaw] = useState<ViewMode>(() => readSession().viewMode || 'HOME');
  const [fotosIngreso, setFotosIngresoRaw] = useState<string[]>(() => {
    const s = readSession();
    if (s.fotosIngreso?.length) return s.fotosIngreso;
    try { const r = sessionStorage.getItem(FOTOS_INGRESO_KEY); if (r) { const u = JSON.parse(r) as string[]; if (u.length) return u; } } catch { /* noop */ }
    return [];
  });
  const [fotosSalida, setFotosSalidaRaw] = useState<string[]>(() => {
    const s = readSession();
    if (s.fotosSalida?.length) return s.fotosSalida;
    try { const r = sessionStorage.getItem(FOTOS_SALIDA_KEY); if (r) { const u = JSON.parse(r) as string[]; if (u.length) return u; } } catch { /* noop */ }
    return [];
  });
  const [selectedReservation, setSelectedReservationRaw] = useState<PendingReservation | null>(() => readSession().selectedReservation || null);
  const [selectedExitReservation, setSelectedExitReservationRaw] = useState<ExitEligibleReservation | null>(() => readSession().selectedExitReservation || null);

  const [pendingReservations, setPendingReservations] = useState<PendingReservation[]>([]);
  const [exitEligibleReservations, setExitEligibleReservations] = useState<ExitEligibleReservation[]>([]);
  const [noShowReservations, setNoShowReservations] = useState<NoShowReservation[]>([]);
  const [isLoadingReservations, setIsLoadingReservations] = useState(false);
  const [isLoadingExitReservations, setIsLoadingExitReservations] = useState(false);
  const [isLoadingNoShow, setIsLoadingNoShow] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  // ── Timezone activo: del almacén seleccionado o fallback ────────────────
  const activeTimezone = activeWarehouse?.timezone || DEFAULT_TIMEZONE;

  // ── QR Scanner state ────────────────────────────────────────────────────
  const [qrScannerMode, setQrScannerMode] = useState<'ingreso' | 'salida' | 'smart' | null>(null);
  const [qrSearching, setQrSearching] = useState(false);
  const [qrError, setQrError] = useState<string>('');

  const [modal, setModal] = useState<{
    isOpen: boolean; type: 'success' | 'warning' | 'error' | 'info';
    title: string; message: string; showCancel: boolean;
    onConfirm: () => void; onCancel?: () => void;
  }>({ isOpen: false, type: 'success', title: '', message: '', showCancel: false, onConfirm: () => {}, onCancel: undefined });

  const orgId = currentOrgId || user?.orgId || null;
  const canView = can('casetilla.view');
  const canCreate = can('casetilla.create') || can('casetilla.manage');
  const canViewNoShow = can('casetilla.no_show.view');
  void canCreate;

  useEffect(() => {
    writeSession({ viewMode, fotosIngreso, fotosSalida, selectedReservation, selectedExitReservation, selectedDate });
  }, [viewMode, fotosIngreso, fotosSalida, selectedReservation, selectedExitReservation, selectedDate]);

  const setViewMode = useCallback((vm: ViewMode) => setViewModeRaw(vm), []);
  const setFotosIngreso = useCallback((urls: string[]) => {
    setFotosIngresoRaw(urls);
    try { const c = readSession(); sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...c, fotosIngreso: urls })); } catch { /* noop */ }
  }, []);
  const setFotosSalida = useCallback((urls: string[]) => {
    setFotosSalidaRaw(urls);
    try { const c = readSession(); sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...c, fotosSalida: urls })); } catch { /* noop */ }
  }, []);
  const setSelectedReservation = useCallback((r: PendingReservation | null) => setSelectedReservationRaw(r), []);
  const setSelectedExitReservation = useCallback((r: ExitEligibleReservation | null) => setSelectedExitReservationRaw(r), []);

  // ── Helper: convertir selectedDate string a Date para los servicios ──────
  const getSelectedDateAsDate = useCallback((): Date => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)); // medio día UTC para evitar edge cases de TZ
  }, [selectedDate]);

  // ── Cargar datos SOLO cuando scope esté resuelto ─────────────────────────
  useEffect(() => {
    if (viewMode === 'PENDIENTES' && orgId && canView && !scopeLoading && !activeWhLoading) {
      loadPendingReservations();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, orgId, canView, scopeLoading, activeWhLoading, selectedClientId, effectiveWarehouseIds, selectedDate]);

  useEffect(() => {
    if (viewMode === 'SALIDA' && orgId && canView && !scopeLoading && !activeWhLoading) {
      loadExitEligibleReservations();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, orgId, canView, scopeLoading, activeWhLoading, selectedClientId, effectiveWarehouseIds, selectedDate]);

  useEffect(() => {
    if (viewMode === 'NO_SHOW' && orgId && canView && !scopeLoading && !activeWhLoading) {
      loadNoShowReservations();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, orgId, canView, scopeLoading, activeWhLoading, selectedClientId, effectiveWarehouseIds, selectedDate]);

  const loadPendingReservations = async () => {
    if (!orgId) return;
    setIsLoadingReservations(true);
    try {
      const dateObj = getSelectedDateAsDate();
      const data = await casetillaService.getPendingReservations(
        orgId,
        effectiveWarehouseIds,
        selectedClientId,
        dateObj,
        activeTimezone
      );
      setPendingReservations(data);
    } catch { showModal('error', 'Error', 'No se pudieron cargar las reservas pendientes'); }
    finally { setIsLoadingReservations(false); }
  };

  const loadExitEligibleReservations = async () => {
    if (!orgId) return;
    setIsLoadingExitReservations(true);
    try {
      const dateObj = getSelectedDateAsDate();
      const data = await casetillaService.getExitEligibleReservations(
        orgId,
        effectiveWarehouseIds,
        selectedClientId,
        dateObj,
        activeTimezone
      );
      setExitEligibleReservations(data);
    } catch { showModal('error', 'Error', 'No se pudieron cargar las reservas elegibles para salida'); }
    finally { setIsLoadingExitReservations(false); }
  };

  const loadNoShowReservations = async () => {
    if (!orgId) return;
    setIsLoadingNoShow(true);
    try {
      const dateObj = getSelectedDateAsDate();
      const data = await casetillaService.getNoShowReservations(
        orgId,
        effectiveWarehouseIds,
        selectedClientId,
        dateObj,
        activeTimezone
      );
      setNoShowReservations(data);
    } catch { showModal('error', 'Error', 'No se pudieron cargar las reservas No arribó'); }
    finally { setIsLoadingNoShow(false); }
  };

  // ── Realtime: recargar listas cuando el cron cambia status_id ───────────
  const loadPendingRef = useRef(loadPendingReservations);
  const loadExitRef = useRef(loadExitEligibleReservations);
  const loadNoShowRef = useRef(loadNoShowReservations);
  const viewModeRef = useRef(viewMode);
  // ── Debounce timer para agrupar múltiples eventos Realtime ───────────────
  const casetillaRealtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ── Flag: el usuario está llenando un formulario de IN/OUT ───────────────
  const isFormOpenRef = useRef(false);
  const selectedExitRef = useRef<ExitEligibleReservation | null>(null);
  const wasFormOpenRef = useRef(false);
  // ── Aviso de actualizaciones pendientes (discreto) ──────────────────────
  const [pendingUpdateBanner, setPendingUpdateBanner] = useState(false);

  useEffect(() => { loadPendingRef.current = loadPendingReservations; }, [loadPendingReservations]);
  useEffect(() => { loadExitRef.current = loadExitEligibleReservations; }, [loadExitEligibleReservations]);
  useEffect(() => { loadNoShowRef.current = loadNoShowReservations; }, [loadNoShowReservations]);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);

  // Sincronizar refs con estado actual (para usar en el handler Realtime)
  useEffect(() => {
    isFormOpenRef.current = viewMode === 'INGRESO' || !!selectedExitReservation;
    selectedExitRef.current = selectedExitReservation;
  }, [viewMode, selectedExitReservation]);

  // Cuando el usuario cierra un formulario (INGRESO o ExitForm), aplicar refresh pendiente
  useEffect(() => {
    const isFormOpen = viewMode === 'INGRESO' || !!selectedExitReservation;
    const wasFormOpen = wasFormOpenRef.current;

    if (wasFormOpen && !isFormOpen) {
      // Formulario cerrado → aplicar refresh si hay actualizaciones pendientes
      setPendingUpdateBanner(false);
      if (viewMode === 'PENDIENTES') loadPendingRef.current();
      else if (viewMode === 'SALIDA') loadExitRef.current();
      else if (viewMode === 'NO_SHOW') loadNoShowRef.current();
    }

    wasFormOpenRef.current = isFormOpen;
  }, [viewMode, selectedExitReservation]);

  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`casetilla_reservations_rt_${orgId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'reservations',
        },
        (payload) => {
          const recordOrgId = (payload.new as any)?.org_id;
          if (recordOrgId && recordOrgId !== orgId) return;

          const isFormOpen = isFormOpenRef.current;

          if (isFormOpen) {
            // Usuario está llenando IN/OUT → NO recargar, marcar como pendiente
            setPendingUpdateBanner(true);
            return;
          }

          // Debounce: agrupar múltiples eventos en una sola recarga
          if (casetillaRealtimeDebounceRef.current) {
            clearTimeout(casetillaRealtimeDebounceRef.current);
          }
          casetillaRealtimeDebounceRef.current = setTimeout(() => {
            casetillaRealtimeDebounceRef.current = null;
            // Recargar solo la vista activa para no disparar requests innecesarios
            const vm = viewModeRef.current;
            if (vm === 'PENDIENTES') {
              loadPendingRef.current();
            } else if (vm === 'SALIDA' && !selectedExitRef.current) {
              loadExitRef.current();
            } else if (vm === 'NO_SHOW') {
              loadNoShowRef.current();
            }
          }, 800);
        }
      )
      .subscribe();

    return () => {
      if (casetillaRealtimeDebounceRef.current) {
        clearTimeout(casetillaRealtimeDebounceRef.current);
        casetillaRealtimeDebounceRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [orgId]);

  const handleOpenIngresoFromPending = async (reservation: PendingReservation) => {
    if (!orgId) return;
    // Validar no-show antes de abrir ingreso
    const { expired, message } = await casetillaService.checkNoShowExpired(reservation.id, orgId);
    if (expired) {
      showModal('warning', 'No se puede registrar ingreso', message);
      return;
    }
    setFotosIngresoRaw([]); setSelectedReservation(reservation); setViewMode('INGRESO');
  };
  const handleOpenExitForm = (reservation: ExitEligibleReservation) => {
    setFotosSalidaRaw([]); setSelectedExitReservation(reservation); setViewMode('SALIDA');
  };

  const handleSubmitIngreso = async (data: any) => {
    if (!orgId || !user?.id) return;
    setIsSubmitting(true);
    try {
      // Usar data.fotos (del estado local del form) como fuente de verdad.
      // fotosIngreso del padre puede tener lag si el último onChange aún no se procesó.
      const fotosFinales: string[] = (data.fotos?.length ? data.fotos : fotosIngreso);
      await casetillaService.createIngreso(orgId, user.id, { ...data, fotos: fotosFinales });
      setModal({ isOpen: true, type: 'success', title: 'Éxito', message: 'Ingreso registrado correctamente', showCancel: false,
        onConfirm: () => { setModal(prev => ({ ...prev, isOpen: false })); setSelectedReservation(null); setFotosIngresoRaw([]); clearSession(); setViewModeRaw('HOME'); }, onCancel: undefined });
    } catch (error: any) { showModal('error', 'Error', error.message || 'No se pudo registrar el ingreso'); }
    finally { setIsSubmitting(false); }
  };

  const handleSubmitSalida = async () => {
    if (!orgId || !user?.id || !selectedExitReservation) return;
    setIsSubmitting(true);
    try {
      await casetillaService.createSalida(orgId, user.id, selectedExitReservation.id, fotosSalida);
      setModal({ isOpen: true, type: 'success', title: 'Éxito', message: 'Salida registrada correctamente', showCancel: false,
        onConfirm: () => { setModal(prev => ({ ...prev, isOpen: false })); setSelectedExitReservation(null); setFotosSalidaRaw([]); clearSession(); setViewModeRaw('HOME'); }, onCancel: undefined });
    } catch (error: any) { showModal('error', 'Error', error.message || 'No se pudo registrar la salida'); }
    finally { setIsSubmitting(false); }
  };

  // ── QR: handler INTELIGENTE — detecta automáticamente IN, OUT, bloqueo ───────────────────────────────────────────────────
  const handleQRScanned = useCallback(async (reservationId: string) => {
    if (!orgId || qrSearching) return;
    setQrSearching(true);
    setQrError('');

    try {
      const { state, reservation } = await casetillaService.getReservationCasetillaState(reservationId, orgId);

      if (state === 'not_found') {
        setQrError('No se encontró ninguna reserva con ese QR en tu organización.');
        setQrSearching(false);
        return;
      }

      if (state === 'cancelled') {
        setQrError('Esta reserva está cancelada y no puede procesarse desde Punto de Control.');
        setQrSearching(false);
        return;
      }

      if (state === 'no_show') {
        setQrError('Esta reserva está marcada como "No arribó" y no puede procesarse desde Punto de Control.');
        setQrSearching(false);
        return;
      }

      if (state === 'expired_no_show') {
        setQrError('Esta reserva superó el tiempo permitido de ingreso y ya no puede procesarse desde Punto de Control.');
        setQrSearching(false);
        return;
      }

      if (state === 'has_salida') {
        setQrError('Esta reserva ya completó su salida.');
        setQrSearching(false);
        return;
      }

      // Validar segregación: la reserva debe estar en un warehouse permitido
      if (reservation) {
        let allowed = false;

        if (effectiveWarehouseIds && effectiveWarehouseIds.length > 0) {
          // Obtener warehouse_id del dock de la reserva
          const { data: dockData } = await supabase
            .from('docks')
            .select('warehouse_id')
            .eq('id', reservation.dock_id)
            .eq('org_id', orgId)
            .maybeSingle();

          if (dockData?.warehouse_id && effectiveWarehouseIds.includes(dockData.warehouse_id)) {
            allowed = true;
          }
        } else {
          allowed = true; // sin restricción de warehouse
        }

        // Validar cliente si hay filtro
        if (selectedClientId) {
          const clientDockIds = await casetillaService.getDockIdsForClient(orgId, selectedClientId);
          if (!clientDockIds.includes(reservation.dock_id)) {
            allowed = false;
          }
        }

        if (!allowed) {
          setQrError('Esta reserva no está en un almacén o cliente permitido para tu usuario.');
          setQrSearching(false);
          return;
        }
      }

      if (state === 'pending') {
        // Cerrar scanner y abrir IN
        setQrScannerMode(null);
        if (reservation) {
          // Convertir PendingReservationRow → PendingReservation (con los campos que necesita IngresoForm)
          // Necesitamos resolver provider_name y warehouse_name
          const { data: dockData } = await supabase
            .from('docks')
            .select('name, warehouse_id')
            .eq('id', reservation.dock_id)
            .eq('org_id', orgId)
            .maybeSingle();

          let providerName = 'N/A';
          if (reservation.shipper_provider) {
            const isUUID = reservation.shipper_provider.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
            if (isUUID) {
              const { data: prov } = await supabase.from('providers').select('name').eq('id', reservation.shipper_provider).maybeSingle();
              providerName = prov?.name ?? 'N/A';
            } else {
              providerName = reservation.shipper_provider;
            }
          }

          let warehouseName = 'N/A';
          if (dockData?.warehouse_id) {
            const { data: wh } = await supabase.from('warehouses').select('name').eq('id', dockData.warehouse_id).maybeSingle();
            warehouseName = wh?.name ?? 'N/A';
          }

          const cargoTypeName = reservation.cargo_type
            ? (await supabase.from('cargo_types').select('name').eq('id', reservation.cargo_type).maybeSingle()).data?.name ?? null
            : null;

          const pendingRes: PendingReservation = {
            id: reservation.id,
            dua: reservation.dua ?? '',
            placa: reservation.truck_plate ?? '',
            chofer: reservation.driver ?? '',
            orden_compra: reservation.purchase_order ?? '',
            numero_pedido: reservation.order_request_number ?? '',
            notes: reservation.notes ?? null,
            provider_name: providerName,
            warehouse_name: warehouseName,
            created_at: reservation.created_at,
            is_imported: reservation.is_imported === true || (reservation.is_imported == null && !!(reservation.dua && reservation.dua.trim().length > 0)),
            cargo_type_name: cargoTypeName,
          };

          setFotosIngresoRaw([]);
          setSelectedReservation(pendingRes);
          setViewMode('INGRESO');
        }
      } else if (state === 'has_ingreso') {
        // Tiene ingreso, no salida → abrir OUT
        // Necesitamos construir ExitEligibleReservation desde la reserva
        setQrScannerMode(null);
        if (reservation) {
          const { data: dockData } = await supabase
            .from('docks')
            .select('name, warehouse_id')
            .eq('id', reservation.dock_id)
            .eq('org_id', orgId)
            .maybeSingle();

          let providerName = 'N/A';
          if (reservation.shipper_provider) {
            const isUUID = reservation.shipper_provider.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
            if (isUUID) {
              const { data: prov } = await supabase.from('providers').select('name').eq('id', reservation.shipper_provider).maybeSingle();
              providerName = prov?.name ?? 'N/A';
            } else {
              providerName = reservation.shipper_provider;
            }
          }

          let warehouseName = 'N/A';
          let warehouseId: string | null = null;
          let warehouseTz = DEFAULT_TIMEZONE;
          if (dockData?.warehouse_id) {
            warehouseId = dockData.warehouse_id;
            const { data: wh } = await supabase.from('warehouses').select('name, timezone').eq('id', dockData.warehouse_id).maybeSingle();
            warehouseName = wh?.name ?? 'N/A';
            warehouseTz = wh?.timezone ?? DEFAULT_TIMEZONE;
          }

          // Obtener fecha de ingreso
          const { data: ingRow } = await supabase
            .from('casetilla_ingresos')
            .select('created_at')
            .eq('reservation_id', reservation.id)
            .eq('org_id', orgId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const exitRes: ExitEligibleReservation = {
            id: reservation.id,
            dua: reservation.dua ?? null,
            matricula: reservation.truck_plate ?? '',
            chofer: reservation.driver ?? '',
            proveedor: providerName,
            almacen: warehouseName,
            provider_name: providerName,
            warehouse_name: warehouseName,
            warehouse_id: warehouseId,
            warehouse_timezone: warehouseTz,
            provider_id: reservation.shipper_provider ?? null,
            orden_compra: reservation.purchase_order ?? '',
            numero_pedido: reservation.order_request_number ?? '',
            fecha_ingreso: ingRow?.created_at ?? null,
            created_at: reservation.created_at,
          };

          setFotosSalidaRaw([]);
          setSelectedExitReservation(exitRes);
          setViewMode('SALIDA');
        }
      }
    } catch {
      setQrError('Error al buscar la reserva. Verificá tu conexión e intentá de nuevo.');
    } finally {
      setQrSearching(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, qrSearching, effectiveWarehouseIds, selectedClientId]);

  const showModal = (type: 'success' | 'warning' | 'error' | 'info', title: string, message: string, onConfirm?: () => void) => {
    const closeModal = () => setModal(prev => ({ ...prev, isOpen: false }));
    setModal({ isOpen: true, type, title, message, showCancel: false, onConfirm: onConfirm || closeModal, onCancel: undefined });
  };

  if (!canView) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <i className="ri-lock-line text-6xl text-gray-400"></i>
          <h2 className="mt-4 text-xl font-semibold text-gray-700">Acceso Denegado</h2>
          <p className="mt-2 text-gray-600">No tienes permisos para acceder a Punto Control IN/OUT</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <WarehousePageHeader
          title="Punto Control IN/OUT"
          subtitle="Gestión de ingresos, salidas y reportes"
          activeWarehouse={activeWarehouse}
          allowedWarehouses={allowedWarehouses}
          hasMultipleWarehouses={hasMultipleWarehouses}
          onWarehouseChange={setActiveWarehouseId}
          loading={activeWhLoading}
        />

        {/* Banner: actualizaciones disponibles (discreto) */}
        {pendingUpdateBanner && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <i className="ri-refresh-line text-blue-600 text-base w-4 h-4 flex items-center justify-center"></i>
              <p className="text-xs text-blue-900">
                <span className="font-semibold">Hay actualizaciones disponibles.</span>
                <span className="text-blue-700 ml-1">Se refrescarán al volver al inicio o cerrar el formulario.</span>
              </p>
            </div>
            <button
              onClick={() => setPendingUpdateBanner(false)}
              className="text-blue-400 hover:text-blue-600 flex-shrink-0"
              title="Descartar aviso"
            >
              <i className="ri-close-line w-4 h-4 flex items-center justify-center"></i>
            </button>
          </div>
        )}

        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div className="flex flex-col sm:flex-row gap-3">
              {hasMultipleWarehouses && (
                <div className="mt-2">
                  <WarehouseSelector variant="chips" />
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              {/* Selector de fecha */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                  <i className="ri-calendar-line mr-1"></i>Fecha:
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    const newDate = e.target.value;
                    if (newDate) {
                      setSelectedDate(newDate);
                      setViewModeRaw('HOME');
                    }
                  }}
                  className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white cursor-pointer"
                />
                {selectedDate !== todayStr && (
                  <button
                    onClick={() => { setSelectedDate(todayStr); setViewModeRaw('HOME'); }}
                    className="text-xs px-2 py-1 bg-teal-50 text-teal-700 rounded-md hover:bg-teal-100 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Hoy
                  </button>
                )}
              </div>
              {/* Selector de cliente */}
              {scopeClients.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                    <i className="ri-user-line mr-1"></i>Cliente:
                  </label>
                  <select
                    value={selectedClientId ?? ''}
                    onChange={(e) => { setSelectedClientId(e.target.value || null); setViewModeRaw('HOME'); }}
                    className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white cursor-pointer min-w-[180px]"
                  >
                    <option value="">Todos los clientes</option>
                    {scopeClients.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </select>
                  {selectedClientId && (
                    <button onClick={() => { setSelectedClientId(null); setViewModeRaw('HOME'); }} className="p-2 text-gray-400 hover:text-gray-600 cursor-pointer" title="Quitar filtro">
                      <i className="ri-close-circle-line text-lg"></i>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          {selectedClientId && scopeClients.length > 0 && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-teal-50 border border-teal-200 rounded-full text-xs text-teal-700 font-medium">
              <i className="ri-filter-line"></i>
              Filtrando por: {scopeClients.find(c => c.id === selectedClientId)?.name}
            </div>
          )}
          {selectedDate !== todayStr && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs text-amber-700 font-medium">
              <i className="ri-calendar-event-line"></i>
              Fecha seleccionada: {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </div>
          )}
        </div>

        {viewMode === 'HOME' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
            {/* ─── Tarjeta QR Inteligente — acceso rápido ──────────── */}
            <div className="bg-teal-50 rounded-xl border-2 border-teal-200 p-6 hover:border-teal-300 transition-colors">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 bg-teal-100 rounded-lg flex items-center justify-center">
                  <i className="ri-qr-scan-line text-2xl sm:text-3xl text-teal-700"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold text-teal-900 mb-2">Leer QR</h2>
                  <p className="text-sm text-teal-700 mb-4">Escaneá un QR para detectar automáticamente si corresponde ingreso o salida</p>
                  <button
                    onClick={() => { setQrError(''); setQrScannerMode('smart'); }}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-teal-700 text-white rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <i className="ri-scan-line"></i>Escanear QR
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 bg-amber-100 rounded-lg flex items-center justify-center">
                  <i className="ri-time-line text-2xl sm:text-3xl text-amber-600"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">Reservas Pendientes</h2>
                  <p className="text-sm text-gray-600 mb-4">Consulte y registre el ingreso de reservas pendientes</p>
                  <button onClick={() => setViewMode('PENDIENTES')} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors whitespace-nowrap cursor-pointer">
                    <i className="ri-list-check"></i>Ver Pendientes
                  </button>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <i className="ri-logout-box-line text-2xl sm:text-3xl text-emerald-600"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">Registrar Salida</h2>
                  <p className="text-sm text-gray-600 mb-4">Registre la salida de vehículos que ya arribaron al almacén</p>
                  <button onClick={() => setViewMode('SALIDA')} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap cursor-pointer">
                    <i className="ri-logout-box-line"></i>Registrar Salida
                  </button>
                </div>
              </div>
            </div>
            {canViewNoShow && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 bg-gray-100 rounded-lg flex items-center justify-center">
                    <i className="ri-user-unfollow-line text-2xl sm:text-3xl text-gray-600"></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">No arribó</h2>
                    <p className="text-sm text-gray-600 mb-4">Reservas que superaron el tiempo de tolerancia sin ingreso</p>
                    <button onClick={() => setViewMode('NO_SHOW')} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors whitespace-nowrap cursor-pointer">
                      <i className="ri-user-unfollow-line"></i>Ver No arribó
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 bg-blue-100 rounded-lg flex items-center justify-center">
                  <i className="ri-time-line text-2xl sm:text-3xl text-blue-600"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">Duración en Punto Control</h2>
                  <p className="text-sm text-gray-600 mb-4">Reporte de tiempos de permanencia en el almacén</p>
                  <button onClick={() => setViewMode('DURACION')} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap cursor-pointer">
                    <i className="ri-bar-chart-line"></i>Ver Reporte
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {viewMode === 'INGRESO' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 lg:p-8">
            <IngresoForm
              orgId={orgId!}
              initialData={{
                chofer: selectedReservation?.chofer || '',
                matricula: selectedReservation?.placa || '',
                dua: selectedReservation?.dua || '',
                factura: '',
                cedula: '',
                orden_compra: selectedReservation?.orden_compra || '',
                numero_pedido: selectedReservation?.numero_pedido || '',
                observaciones: selectedReservation?.notes || '',
                reservation_id: selectedReservation?.id || undefined,
              }}
              linkedReservation={selectedReservation}
              initialFotos={fotosIngreso} onFotosChange={setFotosIngreso} photoSessionKey={FOTOS_INGRESO_KEY}
              formDataSessionKey={FORM_DATA_INGRESO_KEY}
              onSubmit={handleSubmitIngreso}
              onCancel={() => { setSelectedReservation(null); setFotosIngresoRaw([]); clearSession(); setViewModeRaw('HOME'); }}
              isSubmitting={isSubmitting}
            />
          </div>
        )}

        {viewMode === 'PENDIENTES' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 lg:p-8">
            <div className="mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Reservas Pendientes</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {selectedDate === todayStr
                      ? 'Reservas pendientes para hoy'
                      : `Reservas pendientes para el ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
                    }
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setQrError(''); setQrScannerMode('ingreso'); }}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer text-sm font-medium"
                  >
                    <i className="ri-scan-line"></i>Leer QR
                  </button>
                  <button onClick={() => { clearSession(); setViewModeRaw('HOME'); }} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap cursor-pointer">
                    <i className="ri-arrow-left-line"></i>Volver
                  </button>
                </div>
              </div>
              {qrError && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <i className="ri-error-warning-line flex-shrink-0"></i>
                  {qrError}
                  <button onClick={() => setQrError('')} className="ml-auto text-red-400 hover:text-red-600 cursor-pointer"><i className="ri-close-line"></i></button>
                </div>
              )}
              {qrSearching && (
                <div className="flex items-center gap-2 px-4 py-3 bg-teal-50 border border-teal-200 rounded-lg text-sm text-teal-700">
                  <i className="ri-loader-4-line animate-spin flex-shrink-0"></i>
                  Buscando reserva...
                </div>
              )}
            </div>
            <PendingReservationsGrid reservations={pendingReservations} onOpenIngreso={handleOpenIngresoFromPending} isLoading={isLoadingReservations} />
          </div>
        )}

        {viewMode === 'SALIDA' && !selectedExitReservation && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 lg:p-8">
            <div className="mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Registrar Salida</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {selectedDate === todayStr
                      ? 'Reservas disponibles para salida hoy'
                      : `Reservas disponibles para salida el ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
                    }
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setQrError(''); setQrScannerMode('salida'); }}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer text-sm font-medium"
                  >
                    <i className="ri-scan-line"></i>Leer QR
                  </button>
                  <button onClick={() => { clearSession(); setViewModeRaw('HOME'); }} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap cursor-pointer">
                    <i className="ri-arrow-left-line"></i>Volver
                  </button>
                </div>
              </div>
              {qrError && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <i className="ri-error-warning-line flex-shrink-0"></i>
                  {qrError}
                  <button onClick={() => setQrError('')} className="ml-auto text-red-400 hover:text-red-600 cursor-pointer"><i className="ri-close-line"></i></button>
                </div>
              )}
              {qrSearching && (
                <div className="flex items-center gap-2 px-4 py-3 bg-teal-50 border border-teal-200 rounded-lg text-sm text-teal-700">
                  <i className="ri-loader-4-line animate-spin flex-shrink-0"></i>
                  Buscando reserva...
                </div>
              )}
            </div>
            <ExitReservationsGrid reservations={exitEligibleReservations} onOpenExit={handleOpenExitForm} isLoading={isLoadingExitReservations} />
          </div>
        )}

        {viewMode === 'SALIDA' && selectedExitReservation && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 lg:p-8">
            <ExitForm
              orgId={orgId!} reservation={selectedExitReservation}
              initialFotos={fotosSalida} onFotosChange={setFotosSalida} photoSessionKey={FOTOS_SALIDA_KEY}
              onSubmit={handleSubmitSalida}
              onCancel={() => { setSelectedExitReservation(null); setFotosSalidaRaw([]); clearSession(); setViewModeRaw('SALIDA'); }}
              isSubmitting={isSubmitting}
            />
          </div>
        )}

        {viewMode === 'DURACION' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 lg:p-8">
            <div className="mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Duración en Punto Control</h2>
                  <p className="text-sm text-gray-600 mt-1">Reporte de tiempos de permanencia</p>
                </div>
                <button onClick={() => { clearSession(); setViewModeRaw('HOME'); }} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap cursor-pointer">
                  <i className="ri-arrow-left-line"></i>Volver
                </button>
              </div>
            </div>
            <DurationReportGrid orgId={orgId!} allowedWarehouseIds={effectiveWarehouseIds} clientId={selectedClientId} />
          </div>
        )}

        {viewMode === 'NO_SHOW' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 lg:p-8">
            <div className="mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900">No arribó</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {selectedDate === todayStr
                      ? 'Reservas marcadas como No arribó para hoy'
                      : `Reservas marcadas como No arribó para el ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
                    }
                  </p>
                </div>
                <button onClick={() => { clearSession(); setViewModeRaw('HOME'); }} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap cursor-pointer">
                  <i className="ri-arrow-left-line"></i>Volver
                </button>
              </div>
            </div>
            <NoShowReservationsGrid reservations={noShowReservations} isLoading={isLoadingNoShow} />
          </div>
        )}
      </div>

      <ConfirmModal isOpen={modal.isOpen} type={modal.type} title={modal.title} message={modal.message} showCancel={modal.showCancel} onConfirm={modal.onConfirm} onCancel={modal.onCancel} />

      {/* QR Scanner Modal */}
      <QRScannerModal
        isOpen={qrScannerMode !== null}
        onClose={() => { setQrScannerMode(null); }}
        onReservationIdScanned={handleQRScanned}
        title={qrScannerMode === 'ingreso' ? 'Escanear QR — Ingreso' : qrScannerMode === 'salida' ? 'Escanear QR — Salida' : 'Escanear QR'}
      />
    </div>
  );
}
