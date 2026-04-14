import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { usePermissions } from '../../hooks/usePermissions';
import { useUserScope } from '../../hooks/useUserScope';
import { useActiveWarehouse } from '../../contexts/ActiveWarehouseContext';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import {
  calendarService,
  type Reservation,
  type DockTimeBlock,
  type Dock,
  type Warehouse,
} from '../../services/calendarService';
import ReservationModal from './components/ReservationModal';
import BlockModal from './components/BlockModal';
import OperationalStatusesTab from './components/OperationalStatusesTab';
import PreReservationMiniModal from './components/PreReservationMiniModal';
import { useAuth } from '../../contexts/AuthContext';
import { sortDocksByNameNumber } from '../../utils/sortDocks';
import { ConfirmModal } from '../../components/base/ConfirmModal';
import { dockAllocationService, type DockAllocationRule } from '../../services/dockAllocationService';
import { providersService } from '../../services/providersService';
import { userProvidersService } from '../../services/userProvidersService';
import { useClientPickupRulesContext } from '../../contexts/ClientPickupRulesContext';
import BlocksManagementTab from './components/BlocksManagementTab';
import ReservationHoverCard from './components/ReservationHoverCard';
import BlockedStatusesConfig from './components/BlockedStatusesConfig';
import { useBlockedStatuses } from '../../hooks/useBlockedStatuses';
import { clientBlockedStatusesService } from '../../services/clientBlockedStatusesService';
import {
  getWarehouseTimezone,
  getStartOfDayInTimezone,
  getEndOfDayInTimezone,
  isSameDayInTimezone,
  toWarehouseDateString,
  toWarehouseTimeString,
  getDatePartsInTimezone,
} from '../../utils/timezoneUtils';

/**
 * Calcula el offset UTC del timezone dado en el instante actual.
 * Retorna string tipo "UTC-4" o "UTC-6" o "UTC-4:30".
 */
function getUtcOffsetLabel(timezone: string): string {
  try {
    const now = new Date();
    // Obtener la hora en UTC y en el timezone destino
    const utcParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(now);
    const tzParts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(now);

    const utcH = parseInt(utcParts.find(p => p.type === 'hour')?.value || '0', 10);
    const utcM = parseInt(utcParts.find(p => p.type === 'minute')?.value || '0', 10);
    const tzH = parseInt(tzParts.find(p => p.type === 'hour')?.value || '0', 10);
    const tzM = parseInt(tzParts.find(p => p.type === 'minute')?.value || '0', 10);

    let diffMin = (tzH * 60 + tzM) - (utcH * 60 + utcM);
    // Ajustar si cruza medianoche
    if (diffMin > 720) diffMin -= 1440;
    if (diffMin < -720) diffMin += 1440;

    const sign = diffMin >= 0 ? '+' : '-';
    const absDiff = Math.abs(diffMin);
    const h = Math.floor(absDiff / 60);
    const m = absDiff % 60;
    return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${m.toString().padStart(2, '0')}`;
  } catch {
    return '';
  }
}

type ViewMode = '1day' | '3days' | '7days';
type TabMode = 'calendar' | 'statuses' | 'blocks';

interface TimeSlot {
  hour: number;
  minute: number;
  label: string;
}

interface CalendarEvent {
  type: 'reservation' | 'block' | 'free';
  id?: string;
  dockId: string;
  startTime: Date;
  endTime: Date;
  data?: Reservation | DockTimeBlock;
}

// Fallback timezone cuando no hay almacén seleccionado
const DEFAULT_FALLBACK_TZ = 'America/Costa_Rica';
const BUFFER_DAYS = 2;

export default function CalendarioPage() {
  const { can, orgId, loading: permLoading } = usePermissions();
  const { user } = useAuth();
  const { lastRuleChange } = useClientPickupRulesContext();
  const { isPrivileged: isPrivilegedUser } = useBlockedStatuses(orgId);
  const {
    allowedWarehouseIds,
    availableWarehouses: scopeWarehouses,
    isGlobalAccess,
    loading: scopeLoading,
  } = useUserScope();

  // ── Almacén activo desde contexto compartido ──────────────────────────────
  const {
    allowedWarehouses,
    activeWarehouseId: ctxWarehouseId,
    activeWarehouse: ctxActiveWarehouse,
    setActiveWarehouseId: ctxSetWarehouseId,
    hasMultipleWarehouses,
    loading: activeWhLoading,
    selectionInvalidated,
    acknowledgeInvalidation,
  } = useActiveWarehouse();

  // ── Banner de borrador pendiente ──────────────────────────────────────────
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [resumeDraftAge, setResumeDraftAge] = useState('');

  useEffect(() => {
    if (!orgId) return;
    try {
      const raw = localStorage.getItem(`draft_reservation_${orgId}_new`);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft?.formData && draft?.savedAt) {
        const ms = Date.now() - new Date(draft.savedAt).getTime();
        const minutes = Math.floor(ms / 60_000);
        let age = 'hace un momento';
        if (minutes >= 1 && minutes < 60) age = `hace ${minutes} min`;
        else if (minutes >= 60) { const h = Math.floor(minutes / 60); age = `hace ${h} h`; }
        setResumeDraftAge(age);
        setShowResumeBanner(true);
      }
    } catch { /* draft corrupto */ }
  }, [orgId]);

  // ✅ Estado de rango dinámico
  const [rangeDays, setRangeDays] = useState<number>(3); // 1, 3, o 7
  const [anchorDate, setAnchorDate] = useState(new Date());

  const [tabMode, setTabMode] = useState<TabMode>('calendar');
  const [docks, setDocks] = useState<Dock[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [blocks, setBlocks] = useState<DockTimeBlock[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados de warehouses — ahora sincronizados con el contexto activo
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseLoading, setWarehouseLoading] = useState(false);
  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
  // Flag para saber si ya se ejecutó la lógica de auto-selección inicial
  const warehouseInitDoneRef = useRef(false);

  const [reserveModalOpen, setReserveModalOpen] = useState(false);
  const [reserveModalSlot, setReserveModalSlot] = useState<any>(null);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  /** ID de la reserva original cuando se está creando una copia */
  const [copyOfReservationId, setCopyOfReservationId] = useState<string | null>(null);
  /** Datos del borrador de copia — se usa para pre-cargar el modal cuando el usuario elige un espacio */
  const [copyDraft, setCopyDraft] = useState<any | null>(null);

  const [selectedBlock, setSelectedBlock] = useState<DockTimeBlock | null>(null);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);

  // ✅ NUEVO: Separar términos de búsqueda
  const [dockSearchTerm, setDockSearchTerm] = useState(''); // Para filtrar andenes (si se necesita)
  const [reservationSearchTerm, setReservationSearchTerm] = useState(''); // Para filtrar reservas
  
  // ✅ NUEVO: Debounce del término de búsqueda de reservas (300ms)
  const debouncedReservationSearch = useDebouncedValue(reservationSearchTerm, 300);

  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const [providers, setProviders] = useState<{ id: string; name: string }[]>([]);
  // IDs de proveedores asignados al usuario actual — para calcular acceso por reserva
  const [userProviderIds, setUserProviderIds] = useState<Set<string>>(new Set());

  const [draggedEvent, setDraggedEvent] = useState<CalendarEvent | null>(null);

  // ✅ NUEVO: Estados para flujo de preselección
  const [preModalOpen, setPreModalOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [requiredMinutes, setRequiredMinutes] = useState(0);
  const [preCargoTypeId, setPreCargoTypeId] = useState('');
  const [preProviderId, setPreProviderId] = useState('');

  // ✅ NUEVO: Estado para reglas de asignación de andenes
  const [allocationRule, setAllocationRule] = useState<DockAllocationRule | null>(null);
  const [allocationLoading, setAllocationLoading] = useState(false);
  const [allocationError, setAllocationError] = useState<string>('');
  const [enabledDockIds, setEnabledDockIds] = useState<Set<string>>(new Set());

  // ✅ NUEVO: Estado para el indicador de hora actual
  const [nowTz, setNowTz] = useState<Date>(new Date());

  // ✅ Refs para sincronización de scroll horizontal
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const headerInnerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // ✅ Caché para evitar refetch innecesario
  const cacheRef = useRef<Map<string, { reservations: Reservation[]; blocks: DockTimeBlock[] }>>(new Map());

  // ✅ Flag para distinguir "primer mount con lastRuleChange ya seteado" vs "lastRuleChange cambió mientras estaba montado"
  const ruleChangeInitialMountRef = useRef(false);

  // ✅ Constante de ancho de columna — reducida para mayor densidad visual
  const COL_W = 170;

  // ✅ Actualizar nowTz cada 60 segundos (nowTz es siempre Date UTC real)
  useEffect(() => {
    const interval = setInterval(() => {
      setNowTz(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // warehouseId efectivo = el del contexto activo
  const warehouseId = ctxWarehouseId;

  // ✅ Moved all useMemo hooks here (no hooks after returns)
  const canView = useMemo(() => can('calendar.view'), [can]);
  const canCreate = useMemo(() => can('reservations.create'), [can]);
  const hasLimitedStatusView = useMemo(() => can('reservations.limit_status_view'), [can]);
  const canMove = useMemo(() => can('reservations.move'), [can]);
  const canBlockCreate = useMemo(() => can('dock_blocks.create'), [can]);
  const canBlockUpdate = useMemo(() => can('dock_blocks.update'), [can]);
  const canBlockDelete = useMemo(() => can('dock_blocks.delete'), [can]);
  const canViewBlocks = useMemo(() => can('dock_blocks.view'), [can]);
  const canManageStatuses = useMemo(() => can('operational_statuses.view'), [can]);

  // Computed: almacén seleccionado
  const selectedWarehouse = useMemo(() => {
    if (!warehouseId) return null;
    return warehouses.find((w) => w.id === warehouseId) || null;
  }, [warehouseId, warehouses]);

  // ✅ Timezone dinámico del almacén seleccionado — fuente de verdad para todo el calendario
  const warehouseTimezone = useMemo(
    () => getWarehouseTimezone(selectedWarehouse),
    [selectedWarehouse]
  );

  // ✅ Calcular rango de fechas basado en rangeDays y anchorDate (simétrico)
  const dateRange = useMemo(() => {
    const halfRange = Math.floor(rangeDays / 2);

    const startDate = new Date(anchorDate);
    startDate.setDate(anchorDate.getDate() - halfRange);

    const endDate = new Date(anchorDate);
    endDate.setDate(anchorDate.getDate() + (rangeDays - halfRange - 1));

    // ✅ Usar timezone del almacén seleccionado (o fallback)
    const tz = warehouseTimezone;
    const startOfRange = getStartOfDayInTimezone(startDate, tz);
    const endOfRange = getEndOfDayInTimezone(endDate, tz);

    const bufferStart = new Date(startOfRange);
    bufferStart.setDate(bufferStart.getDate() - BUFFER_DAYS);

    const bufferEnd = new Date(endOfRange);
    bufferEnd.setDate(bufferEnd.getDate() + BUFFER_DAYS);

    return {
      startDate: startOfRange,
      endDate: endOfRange,
      bufferStart,
      bufferEnd,
    };
  }, [anchorDate, rangeDays, warehouseTimezone]);

  // ✅ Calcular días visibles en el calendario
  const daysInView = useMemo(() => {
    const days: Date[] = [];
    const current = new Date(dateRange.startDate);

    while (current <= dateRange.endDate) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return days;
  }, [dateRange]);

  // ✅ Filtrado de docks memorizado (SIN searchTerm de reservas)
  const filteredDocks = useMemo(() => {
    let filtered = docks;

    if (filterCategory !== 'all') {
      filtered = filtered.filter((dock) => dock.category_id === filterCategory);
    }

    // ✅ OPCIONAL: Si en el futuro necesitas filtrar docks por nombre, usa dockSearchTerm
    // if (dockSearchTerm) {
    //   const term = dockSearchTerm.toLowerCase();
    //   filtered = filtered.filter((dock) => dock.name.toLowerCase().includes(term));
    // }

    // ✅ Ordenar por número natural
    return [...filtered].sort(sortDocksByNameNumber);
  }, [docks, filterCategory]); // ✅ REMOVIDO: searchTerm

  // ✅ NUEVO: Filtrado de reservas en memoria (NO refetch)
  const filteredReservations = useMemo(() => {
    if (!debouncedReservationSearch.trim()) {
      return reservations;
    }

    const term = debouncedReservationSearch.toLowerCase().trim();

    return reservations.filter((r) => {
      // Búsqueda por DUA
      if (r.dua && r.dua.toLowerCase().includes(term)) return true;

      // Búsqueda por factura/invoice (si existe el campo)
      if ((r as any).invoice && (r as any).invoice.toLowerCase().includes(term)) return true;

      // Búsqueda por chofer/driver
      if (r.driver && r.driver.toLowerCase().includes(term)) return true;

      // Búsqueda por ID parcial (primeros 8 caracteres)
      if (r.id && r.id.slice(0, 8).toLowerCase().includes(term)) return true;

      return false;
    });
  }, [reservations, debouncedReservationSearch]);

  // ✅ NUEVO: Recalcular enabledDockIds cuando cambia allocationRule o filteredDocks
  // NOTA: enabledDockIds ahora se usa solo para el banner informativo (conteo).
  // La habilitación real por slot se hace con getEnabledDockIdsForSlot en cada celda.
  useEffect(() => {
    if (!selectionMode) {
      setEnabledDockIds(new Set());
      return;
    }

    const allIds = filteredDocks.map((d) => d.id);
    const { enabled } = dockAllocationService.getEnabledDockIds(allocationRule, allIds);
    setEnabledDockIds(enabled);
  }, [selectionMode, allocationRule, filteredDocks]);

  // ✅ Calcular ancho total: días × andenes × ancho de columna
  const totalWidth = useMemo(() => {
    return daysInView.length * filteredDocks.length * COL_W;
  }, [daysInView.length, filteredDocks.length]);

  // ✅ Horario hábil del almacén seleccionado (o defaults si "Ver todos")
  const businessStart = selectedWarehouse?.business_start_time || '06:00:00';
  const businessEnd = selectedWarehouse?.business_end_time || '17:00:00';
  const slotInterval = selectedWarehouse?.slot_interval_minutes || 60;

  const parseTimeToMinutes = (t: string): number => {
    // acepta "HH:MM" o "HH:MM:SS"
    const [hh, mm] = t.split(':');
    const h = Number(hh || 0);
    const m = Number(mm || 0);
    return h * 60 + m;
  };

  const businessStartMinutes = useMemo(() => parseTimeToMinutes(businessStart), [businessStart]);
  const businessEndMinutes = useMemo(() => parseTimeToMinutes(businessEnd), [businessEnd]);

  // ✅ Cada fila (slot) mide 60px, entonces px/minuto depende del intervalo
  const PX_PER_MINUTE_DYNAMIC = useMemo(() => 60 / slotInterval, [slotInterval]);

  // ✅ Construye un Date sumando ms desde la medianoche del almacén en UTC.
  // Usa el timezone del almacén seleccionado, NO el del browser.
  const buildDateFromMinutes = useCallback(
    (day: Date, minutesFromMidnight: number) => {
      const dayStartTz = getStartOfDayInTimezone(day, warehouseTimezone);
      return new Date(dayStartTz.getTime() + minutesFromMidnight * 60_000);
    },
    [warehouseTimezone]
  );

  // ✅ Minuto real donde empieza el grid visual (incluye off-hours antes del horario hábil).
  // El grid muestra hasta 2 slots antes del inicio del negocio, por eso el top de las
  // reservas debe calcularse desde este punto, NO desde businessStartMinutes.
  const gridStartMinutes = useMemo(
    () => Math.max(0, businessStartMinutes - slotInterval * 2),
    [businessStartMinutes, slotInterval]
  );

  // ✅ Calcula top desde el inicio REAL del grid (incluyendo off-hours), NO desde businessStart.
  // Antes usaba businessStartMinutes → causaba desfase cuando hay slots off-hours arriba.
  const getTopFromBusinessStart = useCallback(
    (date: Date): number => {
      const dayStart = getStartOfDayInTimezone(date, warehouseTimezone);
      const minutesFromMidnight = (date.getTime() - dayStart.getTime()) / 60_000;
      const minutesFromGridStart = minutesFromMidnight - gridStartMinutes;
      return minutesFromGridStart * PX_PER_MINUTE_DYNAMIC;
    },
    [gridStartMinutes, PX_PER_MINUTE_DYNAMIC, warehouseTimezone]
  );

  const calculateEventHeightDynamic = useCallback(
    (startTime: Date, endTime: Date): number => {
      const durationMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
      return durationMinutes * PX_PER_MINUTE_DYNAMIC;
    },
    [PX_PER_MINUTE_DYNAMIC]
  );

  // ✅ Clamp visual (si algo viene fuera de horario, no rompe el layout)
  const clampEventToBusinessHours = useCallback(
    (day: Date, start: Date, end: Date): { top: number; height: number } | null => {
      const dayBusinessStart = buildDateFromMinutes(day, businessStartMinutes);
      const dayBusinessEnd = buildDateFromMinutes(day, businessEndMinutes);

      const clampedStart = start < dayBusinessStart ? dayBusinessStart : start;
      const clampedEnd = end > dayBusinessEnd ? dayBusinessEnd : end;

      if (clampedEnd <= clampedStart) return null;

      const top = getTopFromBusinessStart(clampedStart);
      const height = calculateEventHeightDynamic(clampedStart, clampedEnd);

      // protección extra
      if (!Number.isFinite(top) || !Number.isFinite(height) || height <= 0) return null;

      return { top, height };
    },
    [
      buildDateFromMinutes,
      businessStartMinutes,
      businessEndMinutes,
      getTopFromBusinessStart,
      calculateEventHeightDynamic,
    ]
  );

  const isWithinBusinessHours = useCallback(
    (day: Date, start: Date, end: Date): boolean => {
      const dayBusinessStart = buildDateFromMinutes(day, businessStartMinutes);
      const dayBusinessEnd = buildDateFromMinutes(day, businessEndMinutes);
      return start >= dayBusinessStart && end <= dayBusinessEnd;
    },
    [buildDateFromMinutes, businessStartMinutes, businessEndMinutes]
  );

  // Generar slots de tiempo (según horario hábil + intervalo configurable)
  // Incluye slots fuera de horario (off-hours) para señal visual
  const timeSlots: TimeSlot[] = useMemo(() => {
    const slots: TimeSlot[] = [];

    // Protección: si por alguna razón viene mal configurado
    if (businessEndMinutes <= businessStartMinutes) return slots;

    // ── Slots ANTES del horario hábil (off-hours top) ──
    // Mostrar hasta 2 slots antes del inicio (máximo desde las 00:00)
    const offHoursBeforeStart = Math.max(0, businessStartMinutes - slotInterval * 2);
    for (let min = offHoursBeforeStart; min < businessStartMinutes; min += slotInterval) {
      const h = Math.floor(min / 60);
      const m = min % 60;
      slots.push({
        hour: h,
        minute: m,
        label: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`,
      });
    }

    // ── Slots DENTRO del horario hábil ──
    for (let min = businessStartMinutes; min < businessEndMinutes; min += slotInterval) {
      const h = Math.floor(min / 60);
      const m = min % 60;
      slots.push({
        hour: h,
        minute: m,
        label: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`,
      });
    }

    // ── Slots DESPUÉS del horario hábil (off-hours bottom) ──
    // Mostrar hasta 2 slots después del fin (máximo hasta las 23:59)
    const offHoursAfterEnd = Math.min(24 * 60, businessEndMinutes + slotInterval * 2);
    for (let min = businessEndMinutes; min < offHoursAfterEnd; min += slotInterval) {
      const h = Math.floor(min / 60);
      const m = min % 60;
      slots.push({
        hour: h,
        minute: m,
        label: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`,
      });
    }

    return slots;
  }, [businessStartMinutes, businessEndMinutes, slotInterval]);

  // ✅ Ejecutar carga solo cuando esté listo (incluyendo scope de permisos)
  const ready = useMemo(() => !!orgId && !permLoading && !scopeLoading, [orgId, permLoading, scopeLoading]);

  // ✅ Label para almacén (para PreReservationMiniModal)
  const warehouseLabel = useMemo(() => {
    if (selectedWarehouse) return selectedWarehouse.name;
    return 'Ver todos los andenes';
  }, [selectedWarehouse]);

  // Cargar warehouses al montar — usa scopeWarehouses del useUserScope (ya filtrados por permisos)
  useEffect(() => {
    if (!orgId || scopeLoading) return;

    setWarehouseLoading(true);
    calendarService.getWarehouses(orgId).then((fullData) => {
      const filtered = isGlobalAccess
        ? fullData
        : fullData.filter((w) => scopeWarehouses.some((sw) => sw.id === w.id));
      setWarehouses(filtered);
    }).catch(() => {
      const data: Warehouse[] = scopeWarehouses.map((w) => ({
        id: w.id,
        org_id: orgId,
        name: w.name,
        location: w.location,
        business_start_time: '06:00:00',
        business_end_time: '17:00:00',
        slot_interval_minutes: 60,
        timezone: w.timezone,
      }));
      setWarehouses(data);
    }).finally(() => {
      setWarehouseLoading(false);
    });
  }, [orgId, scopeLoading, scopeWarehouses, isGlobalAccess]);

  // ── Auto-selección inteligente de almacén al cargar ──────────────────────
  // Reglas:
  //   1 warehouse  → el contexto ya lo auto-selecciona (ActiveWarehouseContext)
  //                  aquí solo nos aseguramos de NO abrir el modal
  //   >1 warehouse → si no hay selección activa → abrir modal automáticamente
  //   0 warehouses → no hacer nada
  //   selección invalidada → abrir modal para re-seleccionar
  useEffect(() => {
    // Esperar a que el scope y el contexto de warehouse estén listos
    if (activeWhLoading || scopeLoading) return;
    // Esperar a que la lista de warehouses esté cargada (o confirmar que no hay)
    if (warehouses.length === 0 && !isGlobalAccess) return;

    // ── Caso: selección invalidada (warehouse ya no en scope) ──────────────
    if (selectionInvalidated) {
      if (warehouses.length === 1) {
        // Ahora solo tiene 1 → auto-seleccionar directamente, sin modal
        ctxSetWarehouseId(warehouses[0].id);
        acknowledgeInvalidation();
      } else if (warehouses.length > 1) {
        // Tiene múltiples → abrir modal para elegir
        setWarehouseModalOpen(true);
        acknowledgeInvalidation();
      }
      warehouseInitDoneRef.current = true;
      return;
    }

    // ── Caso: 1 solo almacén ───────────────────────────────────────────────
    // El contexto ya lo seleccionó automáticamente en su inicialización.
    // Aquí solo garantizamos que el modal NUNCA se abra.
    if (warehouses.length === 1) {
      // Si por algún motivo el contexto aún no lo tiene (race condition), forzarlo
      if (!ctxWarehouseId) {
        ctxSetWarehouseId(warehouses[0].id);
      }
      warehouseInitDoneRef.current = true;
      return;
    }

    // ── Caso: >1 almacén sin selección activa (primera vez) ───────────────
    if (!warehouseInitDoneRef.current && warehouses.length > 1 && !ctxWarehouseId) {
      warehouseInitDoneRef.current = true;
      setWarehouseModalOpen(true);
      return;
    }

    // Marcar como inicializado si aún no lo está
    if (!warehouseInitDoneRef.current) {
      warehouseInitDoneRef.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWhLoading, scopeLoading, warehouses.length, ctxWarehouseId, isGlobalAccess, selectionInvalidated]);

  // ✅ Cargar datos con caché inteligente (SIN searchTerm)
  // forceRefresh=true omite el caché y siempre va a la BD
  const loadData = useCallback(async (forceRefresh = false) => {
    if (!orgId) return;

    try {
      setLoading(true);

      const { bufferStart, bufferEnd } = dateRange;

      // ✅ CORREGIDO: Generar cache key SIN searchTerm
      const cacheKey = `${orgId}:${bufferStart.toISOString()}:${bufferEnd.toISOString()}:${
        warehouseId || 'all'
      }:${filterCategory}`;

      // Verificar caché (solo si no es forceRefresh)
      if (!forceRefresh) {
        const cached = cacheRef.current.get(cacheKey);
        if (cached) {
          setReservations(cached.reservations);
          setBlocks(cached.blocks);
          setLoading(false);
          return;
        }
      }

      // Cargar datos en paralelo — pasar allowedWarehouseIds para segregación
      const [docksData, reservationsData, blocksData, statusesData, categoriesData] = await Promise.all([
        calendarService.getDocks(orgId, warehouseId, allowedWarehouseIds),
        calendarService.getReservations(orgId, bufferStart.toISOString(), bufferEnd.toISOString(), allowedWarehouseIds),
        calendarService.getDockTimeBlocks(orgId, bufferStart.toISOString(), bufferEnd.toISOString()),
        calendarService.getReservationStatuses(orgId),
        calendarService.getDockCategories(orgId),
      ]);

      // // console.log('[Calendar] docksCountBeforeFilter', { count: docksData.length, warehouseId });

      // Filtrar reservas y bloques para mostrar solo los del warehouse seleccionado
      const dockIds = new Set(docksData.map((d) => d.id));
      const filteredReservations = reservationsData.filter((r) => dockIds.has(r.dock_id));
      const filteredBlocks = blocksData.filter((b) => dockIds.has(b.dock_id));

      // // console.log('[Calendar] docksCountAfterFilter', {
      //   count: docksData.length,
      //   reservations: filteredReservations.length,
      //   blocks: filteredBlocks.length,
      //   warehouseId,
      // });

      // // console.log('[Calendar] Data loaded', {
      //   docks: docksData.length,
      //   reservations: filteredReservations.length,
      //   blocks: filteredBlocks.length,
      //   statuses: statusesData.length,
      //   categories: categoriesData.length,
      //   warehouseId,
      // });

      setDocks(docksData);
      setReservations(filteredReservations);
      setBlocks(filteredBlocks);
      setStatuses(statusesData);
      setCategories(categoriesData);

      // Guardar en caché
      cacheRef.current.set(cacheKey, {
        reservations: filteredReservations,
        blocks: filteredBlocks,
      });

      // Limpiar caché viejo (mantener solo últimas 10 entradas)
      if (cacheRef.current.size > 10) {
        const firstKey = cacheRef.current.keys().next().value;
        if (firstKey) cacheRef.current.delete(firstKey);
      }
    } catch (error: any) {
      // console.error('[Calendar] loadError', {
      //   message: error.message,
      //   code: error.code,
      //   details: error.details,
      // });
    } finally {
      setLoading(false);
    }
  }, [orgId, dateRange, rangeDays, warehouseId, filterCategory]); // ✅ REMOVIDO: searchTerm

  // ── Mantener refs sincronizados con valores actuales ─────────────────────
  useEffect(() => { loadDataRef.current = loadData; }, [loadData]);

  // ── Cuando el modal se cierra, ejecutar refetch pendiente si lo hay ───────
  useEffect(() => {
    reserveModalOpenRef.current = reserveModalOpen;

    if (!reserveModalOpen && pendingRealtimeRefreshRef.current) {
      pendingRealtimeRefreshRef.current = false;
      cacheRef.current.clear();
      loadData(true);
    }
  }, [reserveModalOpen, loadData]);

  useEffect(() => {
    if (!ready) return;
    loadData();
  }, [ready, loadData]);

  // ── Flag para posponer refetch cuando el modal está abierto ──────────────
  const pendingRealtimeRefreshRef = useRef(false);
  // ── Refs para acceder a valores actuales dentro del handler realtime (evita stale closure) ──
  const reserveModalOpenRef = useRef(false);
  const loadDataRef = useRef<(forceRefresh?: boolean) => Promise<void>>(async () => {});

  // ✅ FIX BUG 2 (v2): Realtime subscription a la tabla reservations.
  //
  // IMPORTANTE: Supabase Realtime con filtro por columna (org_id=eq.X) en eventos UPDATE
  // requiere REPLICA IDENTITY FULL en la tabla. Sin eso, el filtro no funciona para UPDATEs.
  // Solución: suscribir SIN filtro de columna y filtrar manualmente en el handler.
  //
  // Cuando llega un cambio:
  // - Si el modal está cerrado → invalidar caché y recargar inmediatamente
  // - Si el modal está abierto → marcar pendingRealtimeRefreshRef para recargar al cerrar
  useEffect(() => {
    if (!orgId || !ready) return;

    const channel = supabase
      .channel(`calendar_reservations_rt_${orgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservations',
        },
        (payload) => {
          const recordOrgId =
            (payload.new as any)?.org_id || (payload.old as any)?.org_id;
          if (recordOrgId && recordOrgId !== orgId) return;

          const isModalOpen = reserveModalOpenRef.current;

          if (isModalOpen) {
            pendingRealtimeRefreshRef.current = true;
            return;
          }

          cacheRef.current.clear();
          loadDataRef.current(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // Solo re-montar cuando cambia orgId o ready — NO incluir reserveModalOpen ni loadData
  // para evitar re-suscripciones innecesarias. El handler usa closure sobre reserveModalOpen.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, ready]);

  // ✅ Recargar bloques automáticamente cuando cambian reglas de Cliente Retira
  // NOTA: colocado DESPUÉS de loadData para tener la referencia correcta.
  // El flag ruleChangeInitialMountRef evita doble carga en el primer mount
  // cuando lastRuleChange ya tiene un valor (el main effect ya lo maneja).
  useEffect(() => {
    if (lastRuleChange === 0 || !ready) return;

    // En el primer render (mount), evitar doble carga — el main effect ya lo maneja
    if (!ruleChangeInitialMountRef.current) {
      ruleChangeInitialMountRef.current = true;
      return;
    }

    // lastRuleChange cambió mientras el componente estaba montado → refrescar
    cacheRef.current.clear();
    loadData();
  }, [lastRuleChange, ready, loadData]);

  // Handler para seleccionar almacén — actualiza el contexto global
  // ✅ FIX BUG 1: Resetear estado local ANTES de cambiar el contexto para evitar
  // que se vean datos del almacén anterior mientras carga el nuevo.
  // NO llamar loadData() aquí — el useEffect que depende de [ready, loadData]
  // se disparará automáticamente cuando warehouseId cambie en el contexto.
  const handleWarehouseSelect = (selectedId: string | null) => {
    setWarehouseModalOpen(false);

    // ── Reset inmediato del estado visual ──────────────────────────────────
    setDocks([]);
    setReservations([]);
    setBlocks([]);
    setLoading(true);

    // ── Limpiar caché completo para forzar refetch limpio ──────────────────
    cacheRef.current.clear();

    // ── Actualizar contexto global (dispara re-render + useEffect de loadData) ──
    ctxSetWarehouseId(selectedId);
  };

  // ✅ Navegación: Ir a hoy
  const goToToday = () => {
    setAnchorDate(new Date());
  };

  const handlePickDate = (value: string) => {
    if (!value) return;
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return;
    // ✅ Usar UTC noon para evitar ambigüedad de timezone del browser
    setAnchorDate(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));
    setRangeDays(1); // cuando eliges fecha, mostramos 1 día
  };

  // ✅ Navegación: Ir hacia atrás (mover anchorDate)
  const goToPrevious = () => {
    const newAnchor = new Date(anchorDate);
    newAnchor.setDate(anchorDate.getDate() - rangeDays);
    setAnchorDate(newAnchor);
  };

  // ✅ Navegación: Ir hacia adelante (mover anchorDate)
  const goToNext = () => {
    const newAnchor = new Date(anchorDate);
    newAnchor.setDate(anchorDate.getDate() + rangeDays);
    setAnchorDate(newAnchor);
  };

  // ✅ Cambiar modo de vista (actualizar rangeDays)
  const handleViewModeChange = (mode: ViewMode) => {
    const newRangeDays = mode === '1day' ? 1 : mode === '3days' ? 3 : 7;
    setRangeDays(newRangeDays);
  };

  const formatDayHeader = (date: Date): string => {
    // ✅ Usar timezone del almacén para obtener el día correcto
    const parts = getDatePartsInTimezone(date, warehouseTimezone);
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const months = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    ];
    return `${days[parts.weekday]}, ${parts.day} de ${months[parts.month - 1]} de ${parts.year}`;
  };

  /**
   * Normaliza un timestamp al minuto exacto (trunca segundos y milisegundos).
   * Esto evita el bug de off-by-one cuando una reserva tiene end_datetime con
   * segundos residuales (ej: 09:00:30), que haría que el slot de 09:00 se
   * bloqueara incorrectamente porque 09:00 < 09:00:30 = true.
   */
  const truncateToMinute = useCallback((d: Date): Date => {
    return new Date(Math.floor(d.getTime() / 60_000) * 60_000);
  }, []);

  // ✅ Helper para validar si un slot es elegible (usa timezone del almacén)
  // Acepta un flag `diagnose` para emitir un log detallado de la causa exacta del bloqueo.
  const isSlotEligible = useCallback(
    (dockId: string, day: Date, timeSlot: TimeSlot, diagnose = false): boolean => {
      // diag: función de diagnóstico silenciada (solo activa en desarrollo si se necesita)
      const diag = (_reason: string, _extra?: Record<string, unknown>) => {
        void _reason; void _extra;
        /* diagnóstico desactivado */
        void ({
          dockId,
          slotLabel: `${timeSlot.hour.toString().padStart(2,'0')}:${timeSlot.minute.toString().padStart(2,'0')}`,
          day: toWarehouseDateString(day, warehouseTimezone),
          warehouseTimezone,
          requiredMinutes,
          businessStart: `${Math.floor(businessStartMinutes/60).toString().padStart(2,'0')}:${(businessStartMinutes%60).toString().padStart(2,'0')}`,
          businessEnd: `${Math.floor(businessEndMinutes/60).toString().padStart(2,'0')}:${(businessEndMinutes%60).toString().padStart(2,'0')}`,
          allocationMode: allocationRule?.dockAllocationMode ?? 'none',
          allowAllDocks: allocationRule?.allowAllDocks ?? true,
          enabledDockIdsCount: enabledDockIds.size,
          allocationError: allocationError || null,
          ..._extra,
        });
      };

      if (!selectionMode || requiredMinutes < 5) {
        diag('selectionMode off or requiredMinutes < 5', { selectionMode, requiredMinutes });
        return false;
      }

      // Calcular slotStart usando timezone del almacén
      const dayStartTz = getStartOfDayInTimezone(day, warehouseTimezone);
      const slotStart = new Date(dayStartTz.getTime() + (timeSlot.hour * 60 + timeSlot.minute) * 60_000);
      const slotEnd = new Date(slotStart.getTime() + requiredMinutes * 60_000);

      // Per-slot dock allocation
      if (allocationRule && !allocationRule.allowAllDocks && allocationRule.clientDocks.length > 0) {
        const enabledForSlot = dockAllocationService.getEnabledDockIdsForSlot(
          allocationRule.clientDocks,
          allocationRule.dockAllocationMode,
          reservations,
          slotStart,
          slotEnd
        );
        if (!enabledForSlot.has(dockId)) {
          // Calcular qué andenes están ocupados en este slot para el diagnóstico
          const busyInSlot = allocationRule.clientDocks
            .filter(cd => {
              const busy = reservations.some(r => {
                if (r.dock_id !== cd.dockId) return false;
                const rS = truncateToMinute(new Date(r.start_datetime));
                const rE = truncateToMinute(new Date(r.end_datetime));
                return rS < slotEnd && rE > slotStart;
              });
              return busy;
            })
            .map(cd => cd.dockId);
          diag('allocation mode — dock not enabled for this slot', {
            slotStart: slotStart.toISOString(),
            slotEnd: slotEnd.toISOString(),
            enabledForSlot: [...enabledForSlot],
            busyDocksInSlot: busyInSlot,
            clientDocks: allocationRule.clientDocks.map(cd => ({ id: cd.dockId, order: cd.dockOrder })),
            mode: allocationRule.dockAllocationMode,
          });
          return false;
        }
      } else {
        if (enabledDockIds.size > 0 && !enabledDockIds.has(dockId)) {
          diag('dock not in enabledDockIds (global rule)', { enabledDockIds: [...enabledDockIds] });
          return false;
        }
        if (enabledDockIds.size === 0 && allocationError) {
          diag('allocationError and no enabledDockIds', { allocationError });
          return false;
        }
      }

      const nowUtc = new Date();
      // Bloquear días en el pasado (comparar en timezone del almacén)
      const startOfToday = getStartOfDayInTimezone(nowUtc, warehouseTimezone);
      const startOfSlotDay = getStartOfDayInTimezone(day, warehouseTimezone);
      if (startOfSlotDay < startOfToday) {
        diag('past day', { startOfSlotDay: startOfSlotDay.toISOString(), startOfToday: startOfToday.toISOString() });
        return false;
      }

      // Si es hoy, bloquear horas anteriores a "ahora"
      if (startOfSlotDay.getTime() === startOfToday.getTime() && slotStart < nowUtc) {
        diag('past time (today)', { slotStart: slotStart.toISOString(), nowUtc: nowUtc.toISOString() });
        return false;
      }

      // Validar dentro del horario hábil usando minutos desde medianoche en TZ del almacén
      const { hour: slotStartH, minute: slotStartM } = getDatePartsInTimezone(slotStart, warehouseTimezone);
      const { hour: slotEndH, minute: slotEndM } = getDatePartsInTimezone(slotEnd, warehouseTimezone);
      const slotStartMin = slotStartH * 60 + slotStartM;
      const slotEndMin = slotEndH * 60 + slotEndM;
      if (slotStartMin < businessStartMinutes) {
        diag('business hours — slotStart before businessStart', { slotStartMin, businessStartMinutes });
        return false;
      }
      if (slotEndMin > businessEndMinutes) {
        diag('business hours — slotEnd after businessEnd', { slotEndMin, businessEndMinutes, slotEnd: slotEnd.toISOString() });
        return false;
      }

      // No cruzar a otro día (en timezone del almacén)
      const slotStartDate = toWarehouseDateString(slotStart, warehouseTimezone);
      const slotEndDate = toWarehouseDateString(slotEnd, warehouseTimezone);
      if (slotStartDate !== slotEndDate && slotEndMin > 0) {
        diag('crosses midnight', { slotStartDate, slotEndDate, slotEndMin });
        return false;
      }

      // Conflictos con reservas
      const conflictingReservation = reservations.find((r) => {
        if (r.dock_id !== dockId) return false;
        const rStart = truncateToMinute(new Date(r.start_datetime));
        const rEnd = truncateToMinute(new Date(r.end_datetime));
        return slotStart < rEnd && slotEnd > rStart;
      });
      if (conflictingReservation) {
        const rStart = truncateToMinute(new Date(conflictingReservation.start_datetime));
        const rEnd = truncateToMinute(new Date(conflictingReservation.end_datetime));
        diag('reservation overlap', {
          reservationId: conflictingReservation.id,
          rStart: rStart.toISOString(),
          rEnd: rEnd.toISOString(),
          slotStart: slotStart.toISOString(),
          slotEnd: slotEnd.toISOString(),
          rawRStart: conflictingReservation.start_datetime,
          rawREnd: conflictingReservation.end_datetime,
        });
        return false;
      }

      // Conflictos con bloques
      const conflictingBlock = blocks.find((b) => {
        if (b.dock_id !== dockId) return false;
        const bStart = truncateToMinute(new Date(b.start_datetime));
        const bEnd = truncateToMinute(new Date(b.end_datetime));
        return slotStart < bEnd && slotEnd > bStart;
      });
      if (conflictingBlock) {
        const bStart = truncateToMinute(new Date(conflictingBlock.start_datetime));
        const bEnd = truncateToMinute(new Date(conflictingBlock.end_datetime));
        diag('dock block overlap', {
          blockId: conflictingBlock.id,
          bStart: bStart.toISOString(),
          bEnd: bEnd.toISOString(),
          slotStart: slotStart.toISOString(),
          slotEnd: slotEnd.toISOString(),
          reason: conflictingBlock.reason,
        });
        return false;
      }

      void diagnose;
      return true;
    },
    [
      selectionMode,
      requiredMinutes,
      reservations,
      blocks,
      businessStartMinutes,
      businessEndMinutes,
      enabledDockIds,
      allocationError,
      allocationRule,
      warehouseTimezone,
      truncateToMinute,
    ]
  );

  const handleSelectSlot = useCallback(
    (slot: any) => {
      if (slot.eventType === 'reservation' && slot.data) {
        setSelectedReservation(slot.data as Reservation);
        setReserveModalSlot(null);
        setReserveModalOpen(true);
      } else if (slot.eventType === 'block' && slot.data) {
        if (canBlockUpdate || canBlockDelete) {
          setSelectedBlock(slot.data as DockTimeBlock);
          setIsBlockModalOpen(true);
        }
      } else if (slot.eventType === 'free') {
        return;
      }
    },
    [canCreate, canBlockUpdate, canBlockDelete]
  );

  // ✅ handleCellClick con timezone del almacén
  const handleCellClick = useCallback(
    (e: React.MouseEvent, dockId: string, day: Date, timeSlot: TimeSlot) => {
      // Construir cellStart usando timezone del almacén (no setHours del browser)
      const dayStartTz = getStartOfDayInTimezone(day, warehouseTimezone);
      const cellStart = new Date(dayStartTz.getTime() + (timeSlot.hour * 60 + timeSlot.minute) * 60_000);

      const cellEnd = new Date(cellStart.getTime() + slotInterval * 60_000);

      // ✅ NUEVO: Si estamos en modo selección
      if (selectionMode) {
        const eligible = isSlotEligible(dockId, day, timeSlot);
        if (!eligible) {
          // Diagnóstico automático: loggear la causa exacta del bloqueo
          isSlotEligible(dockId, day, timeSlot, true);
          return;
        }

        // Slot elegible: calcular end según requiredMinutes
        const calculatedEnd = new Date(cellStart.getTime() + requiredMinutes * 60 * 1000);

        // ✅ Seguridad extra: no permitir pasar el horario hábil (aunque isSlotEligible ya lo filtra)
        if (!isWithinBusinessHours(day, cellStart, calculatedEnd)) return;

        // ✅ Si hay un borrador de copia, mezclar sus datos con el slot elegido
        if (copyDraft) {
          const { _copyOfId, _durationMinutes, ...copyFields } = copyDraft;
          setReserveModalSlot({
            ...copyFields,
            dock_id: dockId,
            start_datetime: cellStart.toISOString(),
            end_datetime: calculatedEnd.toISOString(),
          });
          setCopyOfReservationId(_copyOfId || null);
          setCopyDraft(null);
        } else {
          setReserveModalSlot({
            dock_id: dockId,
            start_datetime: cellStart.toISOString(),
            end_datetime: calculatedEnd.toISOString(),
            cargo_type: preCargoTypeId,
            shipper_provider: preProviderId,
          });
        }

        setSelectedReservation(null);
        setReserveModalOpen(true);

        // Salir del modo selección
        setSelectionMode(false);
        setRequiredMinutes(0);
        setPreCargoTypeId('');
        setPreProviderId('');
        return;
      }

      // Flujo normal
      handleSelectSlot({
        dockId,
        date: day.toISOString(),
        time: timeSlot.label,
        eventType: 'free',
        startTime: cellStart,
        endTime: cellEnd,
      });
    },
    [
      handleSelectSlot,
      selectionMode,
      isSlotEligible,
      requiredMinutes,
      preCargoTypeId,
      preProviderId,
      slotInterval,
      isWithinBusinessHours,
      copyDraft,
    ]
  );

  // ✅ Handler de drag start
  const handleDragStart = (e: React.DragEvent, event: CalendarEvent) => {
    if (event.type === 'reservation' && canMove) {
      setDraggedEvent(event);
      e.dataTransfer.effectAllowed = 'move';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetDockId: string, targetDay: Date, targetSlot: TimeSlot) => {
    e.preventDefault();

    if (!draggedEvent || draggedEvent.type !== 'reservation' || !draggedEvent.data) return;

    const reservation = draggedEvent.data as Reservation;

    // ── Bloqueo por estado (regla compuesta con bypass) ──────────────────
    if (reservation.status_id) {
      const blocked = await clientBlockedStatusesService.isBlockedForUser(
        orgId!,
        (reservation as any).client_id ?? null,
        reservation.status_id,
        user?.id ?? null,
        null, // role_id se evalúa en el servicio con caché del hook
        isPrivilegedUser
      );
      if (blocked) {
        setNotifyModal({
          isOpen: true,
          type: 'warning',
          title: 'Reserva bloqueada',
          message: 'Esta reserva no puede modificarse en su estado actual. Tu rol no tiene permiso para moverla.',
        });
        setDraggedEvent(null);
        return;
      }
    }

    const duration = new Date(reservation.end_datetime).getTime() - new Date(reservation.start_datetime).getTime();

    // ✅ Usar timezone del almacén para construir la nueva hora de inicio
    const dayStartTz = getStartOfDayInTimezone(targetDay, warehouseTimezone);
    const newStart = new Date(dayStartTz.getTime() + (targetSlot.hour * 60 + targetSlot.minute) * 60_000);

    const newEnd = new Date(newStart.getTime() + duration);

    // ✅ Restricciones: no cruzar de día y no salir del horario hábil
    if (newStart.toDateString() !== newEnd.toDateString()) {
      setNotifyModal({
        isOpen: true,
        type: 'warning',
        title: 'No se puede mover',
        message: 'No se puede mover la reserva porque cruzaría al día siguiente.'
      });
      setDraggedEvent(null);
      return;
    }
    if (!isWithinBusinessHours(targetDay, newStart, newEnd)) {
      setNotifyModal({
        isOpen: true,
        type: 'warning',
        title: 'Fuera de horario',
        message: 'No se puede mover la reserva fuera del horario permitido del almacén.'
      });
      setDraggedEvent(null);
      return;
    }

    // ✅ Restricciones: evitar solapes contra otras reservas/bloques (UI-side)
    // ✅ FIX: Normalizar timestamps al minuto para evitar off-by-one con segundos residuales
    const willConflictReservation = reservations.some((r) => {
      if (r.id === reservation.id) return false;
      if (r.dock_id !== targetDockId) return false;
      const rStart = truncateToMinute(new Date(r.start_datetime));
      const rEnd = truncateToMinute(new Date(r.end_datetime));
      return newStart < rEnd && newEnd > rStart;
    });

    const willConflictBlock = blocks.some((b) => {
      if (b.dock_id !== targetDockId) return false;
      const bStart = truncateToMinute(new Date(b.start_datetime));
      const bEnd = truncateToMinute(new Date(b.end_datetime));
      return newStart < bEnd && newEnd > bStart;
    });

    if (willConflictReservation || willConflictBlock) {
      setNotifyModal({
        isOpen: true,
        type: 'warning',
        title: 'Conflicto de horario',
        message: 'No se puede mover la reserva porque hay un conflicto de horario.'
      });
      setDraggedEvent(null);
      return;
    }

    try {
      await calendarService.updateReservation(reservation.id, {
        dock_id: targetDockId,
        start_datetime: newStart.toISOString(),
        end_datetime: newEnd.toISOString(),
      });

      // Limpiar caché y recargar
      cacheRef.current.clear();
      await loadData();
    } catch (error: any) {
      setNotifyModal({
        isOpen: true,
        type: 'error',
        title: 'Error al mover',
        message: error.message || 'Error al mover la reserva. Puede haber un conflicto de horario.'
      });
    } finally {
      setDraggedEvent(null);
    }
  };

  // ✅ Ref para las etiquetas de fecha (una por día) — en la capa independiente
  const dateLabelRefs = useRef<Map<string, HTMLSpanElement>>(new Map());
  // ✅ Ref para el contenedor de la fila de fechas independiente
  const dateRowRef = useRef<HTMLDivElement | null>(null);
  // ✅ Ref para el div de fondos de color de la fila de fechas (se sincroniza con transform)
  const dateBgRowRef = useRef<HTMLDivElement | null>(null);

  // ✅ Función que recalcula posiciones de fechas dado un scrollLeft
  const updateDateLabels = useCallback((scrollLeft: number, viewportW: number) => {
    const TIME_COL_W = 80;
    const docksCount = filteredDocks.length;
    const dayW = docksCount * COL_W;
    const scrollableW = viewportW - TIME_COL_W;

    daysInView.forEach((day, dayIndex) => {
      const key = day.toISOString();
      const labelEl = dateLabelRefs.current.get(key);
      if (!labelEl) return;

      const labelW = labelEl.offsetWidth || 180;

      // Inicio y fin del bloque del día en coordenadas absolutas del scroll
      const dayAbsStart = dayIndex * dayW;
      const dayAbsEnd = dayAbsStart + dayW;

      // Área visible del scroll (en coordenadas del contenido)
      const viewAbsStart = scrollLeft;
      const viewAbsEnd = scrollLeft + scrollableW;

      // Intersección visible del día con el viewport
      const visibleStart = Math.max(dayAbsStart, viewAbsStart);
      const visibleEnd = Math.min(dayAbsEnd, viewAbsEnd);

      // Posición left del label en coordenadas del VIEWPORT (no del contenido)
      // = centro del área visible del día - mitad del label - offset de la columna de horas
      let newLeft: number;
      if (visibleEnd <= visibleStart) {
        // Día fuera de vista: ocultar
        labelEl.style.opacity = '0';
        return;
      }

      labelEl.style.opacity = '1';

      // Centro del área visible del día en coordenadas del viewport
      const visibleCenterViewport = (visibleStart + visibleEnd) / 2 - scrollLeft + TIME_COL_W;
      newLeft = visibleCenterViewport - labelW / 2;

      // Clamp: no salir de los límites del día en el viewport
      const dayLeftInViewport = dayAbsStart - scrollLeft + TIME_COL_W;
      const dayRightInViewport = dayAbsEnd - scrollLeft + TIME_COL_W;
      newLeft = Math.max(dayLeftInViewport, Math.min(newLeft, dayRightInViewport - labelW));
      // Clamp adicional: no salir del área scrolleable visible
      newLeft = Math.max(TIME_COL_W, Math.min(newLeft, TIME_COL_W + scrollableW - labelW));

      labelEl.style.left = `${newLeft}px`;
    });
  }, [daysInView, filteredDocks.length, COL_W]);

  // ✅ Recalcular posición de etiquetas de fecha en el render inicial y cuando cambian días/docks.
  // Se usa un doble rAF para garantizar que el browser haya completado el layout y los
  // offsetWidth de los spans de fecha sean correctos antes de calcular posiciones.
  // Sin esto, en el primer paint los spans tienen offsetWidth=0 y las etiquetas quedan en left=0.
  React.useLayoutEffect(() => {
    const container = bodyScrollRef.current;
    if (!container) return;

    const syncLayout = () => {
      const scrollLeft = container.scrollLeft;
      const viewportW = container.offsetWidth;

      // Sincronizar header de andenes
      if (headerInnerRef.current) {
        headerInnerRef.current.style.transform = `translateX(-${scrollLeft}px)`;
      }
      // Sincronizar fondos de color de la fila de fechas
      if (dateBgRowRef.current) {
        dateBgRowRef.current.style.transform = `translateX(-${scrollLeft}px)`;
      }
      // Recalcular posición de etiquetas de fecha (capa independiente)
      updateDateLabels(scrollLeft, viewportW);
    };

    // Primer rAF: esperar a que el browser complete el paint inicial
    // Segundo rAF: garantizar que los offsetWidth de los spans estén disponibles
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(syncLayout);
      return raf2;
    });

    return () => {
      cancelAnimationFrame(raf1);
    };
  }, [daysInView, filteredDocks, updateDateLabels]);

  // ✅ Handler de scroll con sincronización horizontal usando RAF
  const handleBodyScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollLeft = e.currentTarget.scrollLeft;
    const viewportW = e.currentTarget.offsetWidth;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      // Sincronizar header (andenes)
      if (headerInnerRef.current) {
        headerInnerRef.current.style.transform = `translateX(-${scrollLeft}px)`;
      }
      // Sincronizar fondos de color de la fila de fechas
      if (dateBgRowRef.current) {
        dateBgRowRef.current.style.transform = `translateX(-${scrollLeft}px)`;
      }
      // Actualizar posición de etiquetas de fecha (capa independiente)
      updateDateLabels(scrollLeft, viewportW);
    });
  }, [updateDateLabels]);

  // ✅ Modal de notificación (state)
  const [notifyModal, setNotifyModal] = useState({
    isOpen: false,
    type: 'info' as 'info' | 'warning' | 'error' | 'success',
    title: '',
    message: '',
  });

  // ✅ NUEVO: Handler para confirmar preselección y activar modo selección
  const handlePreReservationConfirm = useCallback(async (payload: { cargoTypeId: string; providerId: string; clientId: string; requiredMinutes: number }) => {
    setPreCargoTypeId(payload.cargoTypeId);
    setPreProviderId(payload.providerId);
    setRequiredMinutes(payload.requiredMinutes);
    setPreModalOpen(false);

    setAllocationLoading(true);
    setAllocationError('');
    setAllocationRule(null);

    const clientId = payload.clientId;

    if (!clientId) {
      setAllocationError('No se encontró un cliente vinculado al proveedor. Las reglas de andenes no se aplicarán.');
      setAllocationRule(null);
      setSelectionMode(true);
      return;
    }

    try {
      const rule = await dockAllocationService.getDockAllocationRule(
        orgId!,
        clientId
      );

      if (!rule) {
        setAllocationError('No se pudieron cargar las reglas del cliente. Contactá a un administrador.');
        setAllocationRule(null);
      } else {
        setAllocationRule(rule);
        setAllocationError('');
      }
    } catch (err: any) {
      setAllocationError('No se pudieron cargar las reglas del cliente. Contactá a un administrador.');
      setAllocationRule(null);
    } finally {
      setAllocationLoading(false);
      setSelectionMode(true);
    }
  }, [orgId, warehouseId]);

  // ✅ NUEVO: Handler para salir del modo selección
  const handleExitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setRequiredMinutes(0);
    setPreCargoTypeId('');
    setPreProviderId('');
    setAllocationRule(null);
    setAllocationError('');
    setEnabledDockIds(new Set());
  }, []);

  useEffect(() => {
    if (!orgId) return;
    providersService.getActive(orgId).then(setProviders).catch(() => {});
  }, [orgId]);

  // Cargar proveedores asignados al usuario actual (para calcular acceso por reserva)
  useEffect(() => {
    if (!orgId || !user?.id) return;
    userProvidersService.getUserProviders(orgId, user.id)
      .then((ups) => setUserProviderIds(new Set(ups.map((p) => p.id))))
      .catch(() => {});
  }, [orgId, user?.id]);

  // ── Handler: Copiar reserva ───────────────────────────────────────────────
  // Cierra el modal actual, guarda los datos de la copia en memoria y activa
  // el modo selección de espacio directamente (igual que "Elegir espacio en calendario").
  // El usuario elige un slot → se abre el modal con los datos pre-cargados en ese espacio.
  const handleCopyReservation = useCallback(async (sourceReservation: Reservation) => {
    // Determinar estado inicial seguro: buscar "Pendiente" o tomar el primero
    const safeStatus = statuses.find(
      (s) =>
        (s.code || '').toLowerCase().includes('pendiente') ||
        (s.name || '').toLowerCase().includes('pendiente') ||
        (s.code || '').toLowerCase().includes('pending')
    ) || statuses[0];

    // Calcular duración original para respetar el tiempo requerido
    const srcStart = new Date(sourceReservation.start_datetime);
    const srcEnd = new Date(sourceReservation.end_datetime);
    const durationMinutes = Math.round((srcEnd.getTime() - srcStart.getTime()) / 60_000);

    // Construir el borrador de copia con todos los campos copiables
    const draft = {
      shipper_provider: sourceReservation.shipper_provider,
      cargo_type: sourceReservation.cargo_type,
      transport_type: sourceReservation.transport_type,
      notes: sourceReservation.notes,
      purchase_order: sourceReservation.purchase_order,
      truck_plate: sourceReservation.truck_plate,
      order_request_number: sourceReservation.order_request_number,
      driver: sourceReservation.driver,
      dua: sourceReservation.dua,
      invoice: sourceReservation.invoice,
      status_id: safeStatus?.id || '',
      client_id: (sourceReservation as any).client_id,
      _copyOfId: sourceReservation.id,
      _durationMinutes: durationMinutes,
    };

    // Cerrar modal actual
    setReserveModalOpen(false);
    setSelectedReservation(null);
    setReserveModalSlot(null);
    setCopyOfReservationId(null);

    // Guardar borrador de copia en memoria
    setCopyDraft(draft);

    // Cargar reglas de asignación de andenes del cliente (igual que handlePreReservationConfirm)
    setAllocationLoading(true);
    setAllocationError('');
    setAllocationRule(null);

    const clientId = (sourceReservation as any).client_id || null;

    if (clientId) {
      try {
        const rule = await dockAllocationService.getDockAllocationRule(orgId!, clientId);
        if (rule) {
          setAllocationRule(rule);
          setAllocationError('');
        } else {
          setAllocationError('No se pudieron cargar las reglas del cliente.');
          setAllocationRule(null);
        }
      } catch {
        setAllocationError('No se pudieron cargar las reglas del cliente.');
        setAllocationRule(null);
      }
    } else {
      setAllocationRule(null);
    }

    setAllocationLoading(false);

    // Activar modo selección con la duración de la reserva original
    setPreCargoTypeId(sourceReservation.cargo_type || '');
    setPreProviderId(sourceReservation.shipper_provider || '');
    setRequiredMinutes(durationMinutes > 0 ? durationMinutes : 60);
    setSelectionMode(true);
  }, [statuses, orgId]);

  // ✅ Render
  if (permLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <i className="ri-loader-4-line text-4xl text-teal-600 animate-spin"></i>
          <p className="mt-4 text-gray-600">Cargando calendario...</p>
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <i className="ri-lock-line text-6xl text-red-500 mb-4"></i>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Acceso Denegado</h2>
          <p className="text-gray-600">No tienes permisos para ver el calendario.</p>
        </div>
      </div>
    );
  }

  const getCategoryColor = (cat: any): string => {
    if (!cat) return '#F9FAFB';
    if (typeof cat === 'object' && cat.color) return `${cat.color}15`;
    return '#F9FAFB';
  };

  /**
   * Mezcla un color hex con blanco para generar un tono pastel sólido.
   * blend=0 → color original | blend=1 → blanco puro
   * Usar blend ~0.82 para fondo pastel, ~0.55 para borde de contorno.
   */
  const hexToTint = (hex: string, blend: number): string => {
    if (!hex || hex.length < 7) return blend > 0.7 ? '#f3f4f6' : '#9ca3af';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const pr = Math.round(r + (255 - r) * blend);
    const pg = Math.round(g + (255 - g) * blend);
    const pb = Math.round(b + (255 - b) * blend);
    return `#${pr.toString(16).padStart(2, '0')}${pg.toString(16).padStart(2, '0')}${pb.toString(16).padStart(2, '0')}`;
  };

  /** Devuelve color de texto con contraste adecuado para un fondo hex */
  const getContrastColor = (hex: string): string => {
    if (!hex || hex.length < 7) return '#111827';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#111827' : '#FFFFFF';
  };

  return (
    // ── Wrapper raíz: ocupa todo el ancho disponible de la app ──────────
    // fontSize base con clamp() controla la percepción visual de escala
    // sin limitar el ancho — la UI llena el espacio pero se ve compacta.
    <div
      className="h-screen flex flex-col bg-gray-50 w-full overflow-hidden"
      style={{ fontSize: 'clamp(11px, 0.78vw, 13px)' }}
    >
      {/* Header con título del almacén activo */}
      <div className="bg-white border-b border-gray-200">
        <div className="flex items-center justify-between" style={{ paddingLeft: 'clamp(12px, 1.2vw, 20px)', paddingRight: 'clamp(12px, 1.2vw, 20px)', paddingTop: '6px', paddingBottom: '6px' }}>
          <div className="flex items-center gap-2">
            <h1 className="font-semibold text-gray-900" style={{ fontSize: 'clamp(11px, 0.8vw, 13px)' }}>
              {selectedWarehouse ? (
                <span className="flex items-center gap-1.5">
                  <i className="ri-building-2-line text-teal-600 w-4 h-4 flex items-center justify-center"></i>
                  {selectedWarehouse.name}
                  <span className="text-xs font-normal text-gray-500">
                    ({getUtcOffsetLabel(warehouseTimezone)})
                  </span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-gray-600">
                  <i className="ri-stack-line w-4 h-4 flex items-center justify-center"></i>
                  Todos los almacenes
                </span>
              )}
            </h1>
            {selectedWarehouse && (
              <span className="px-1.5 py-0.5 bg-teal-50 text-teal-700 text-[11px] font-medium rounded-full">
                Almacén activo
              </span>
            )}
          </div>
          {warehouses.length > 1 && (
            <button
              onClick={() => setWarehouseModalOpen(true)}
              className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1"
            >
              <i className="ri-exchange-line w-3.5 h-3.5 flex items-center justify-center"></i>
              Cambiar almacén
            </button>
          )}
        </div>
      </div>

      {/* Pestañas de navegación */}
      <div className="bg-white border-b border-gray-200">
        <div style={{ paddingLeft: 'clamp(12px, 1.2vw, 20px)' }}>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setTabMode('calendar')}
              className={`font-medium border-b-2 transition-colors whitespace-nowrap ${
                tabMode === 'calendar'
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
              style={{ padding: 'clamp(5px, 0.45vw, 8px) clamp(10px, 0.9vw, 16px)', fontSize: 'clamp(10px, 0.72vw, 12px)' }}
            >
              <i className="ri-calendar-line mr-1.5 inline-flex items-center justify-center" style={{ fontSize: 'clamp(10px, 0.72vw, 12px)' }}></i>
              Calendario
            </button>
            {canManageStatuses && (
              <button
                onClick={() => setTabMode('statuses')}
                className={`font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tabMode === 'statuses'
                    ? 'border-teal-600 text-teal-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
                style={{ padding: 'clamp(5px, 0.45vw, 8px) clamp(10px, 0.9vw, 16px)', fontSize: 'clamp(10px, 0.72vw, 12px)' }}
              >
                <i className="ri-list-check mr-1.5 inline-flex items-center justify-center" style={{ fontSize: 'clamp(10px, 0.72vw, 12px)' }}></i>
                Estatus Op
              </button>
            )}
            {canViewBlocks && (
              <button
                onClick={() => setTabMode('blocks')}
                className={`font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tabMode === 'blocks'
                    ? 'border-teal-600 text-teal-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
                style={{ padding: 'clamp(5px, 0.45vw, 8px) clamp(10px, 0.9vw, 16px)', fontSize: 'clamp(10px, 0.72vw, 12px)' }}
              >
                <i className="ri-lock-line mr-1.5 inline-flex items-center justify-center" style={{ fontSize: 'clamp(10px, 0.72vw, 12px)' }}></i>
                Bloqueos
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Contenido según pestaña */}
      {tabMode === 'statuses' ? (
        <div className="flex-1 overflow-auto p-6">
          <OperationalStatusesTab orgId={orgId!} />
        </div>
      ) : tabMode === 'blocks' && canViewBlocks ? (
        <div className="flex-1 overflow-auto">
          <BlocksManagementTab />
        </div>
      ) : (
        <>
          {/* Banner de borrador pendiente */}
          {showResumeBanner && (
            <div className="bg-teal-50 border-b border-teal-200 px-4 py-2 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <i className="ri-save-line text-teal-600 text-base w-4 h-4 flex items-center justify-center"></i>
                <p className="text-xs text-teal-900">
                  <span className="font-semibold">Tenés un borrador de reserva sin finalizar</span>
                  <span className="text-teal-700 ml-1">({resumeDraftAge})</span>
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => { setShowResumeBanner(false); setReserveModalOpen(true); setSelectedReservation(null); setReserveModalSlot(null); }}
                  className="px-2.5 py-1 bg-teal-600 text-white text-xs font-semibold rounded-md hover:bg-teal-700 transition-colors whitespace-nowrap"
                >Continuar</button>
                <button
                  onClick={() => { localStorage.removeItem(`draft_reservation_${orgId}_new`); setShowResumeBanner(false); }}
                  className="px-2.5 py-1 border border-gray-300 bg-white text-gray-700 text-xs font-medium rounded-md hover:bg-gray-50 transition-colors whitespace-nowrap"
                >Descartar</button>
              </div>
            </div>
          )}

          {/* Banner de modo selección */}
          {selectionMode && (
            <div className={`text-white px-4 py-2 flex items-center justify-between ${copyDraft ? 'bg-teal-700' : 'bg-teal-600'}`}>
              <div className="flex items-center gap-2">
                <i className={`text-base w-4 h-4 flex items-center justify-center ${copyDraft ? 'ri-file-copy-line' : 'ri-cursor-line'}`}></i>
                <div>
                  <p className="font-semibold text-xs">
                    {copyDraft
                      ? `Seleccioná un espacio para ubicar la copia de la reserva #${(copyDraft._copyOfId || '').slice(0, 8)}`
                      : 'Modo selección activo'}
                  </p>
                  <p className="text-[11px] text-teal-100">
                    {copyDraft
                      ? `Hacé clic en un espacio disponible (verde) — ${requiredMinutes} min requeridos. La reserva original no se modifica.`
                      : `Seleccioná un espacio disponible en el calendario (${requiredMinutes} min requeridos)`}
                    {allocationRule && !allocationRule.allowAllDocks && (
                      <span className="ml-2">
                        — Cliente: {allocationRule.clientName} | Modo: {allocationRule.dockAllocationMode === 'ODD_FIRST' ? 'Intercalado' : 'Secuencial'} | Andenes habilitados: {enabledDockIds.size}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    console.log('[Availability-DIAG] === DIAGNÓSTICO COMPLETO DE SLOTS ===');
                    console.log('[Availability-DIAG] requiredMinutes:', requiredMinutes);
                    console.log('[Availability-DIAG] allocationRule:', allocationRule);
                    console.log('[Availability-DIAG] enabledDockIds:', [...enabledDockIds]);
                    console.log('[Availability-DIAG] reservations en rango:', reservations.length);
                    console.log('[Availability-DIAG] blocks en rango:', blocks.length);
                    let blockedCount = 0;
                    let eligibleCount = 0;
                    daysInView.forEach(day => {
                      filteredDocks.forEach(dock => {
                        timeSlots.forEach(slot => {
                          const eligible = isSlotEligible(dock.id, day, slot);
                          if (!eligible) {
                            blockedCount++;
                            if (blockedCount <= 20) {
                              isSlotEligible(dock.id, day, slot, true);
                            }
                          } else {
                            eligibleCount++;
                          }
                        });
                      });
                    });
                    console.log(`[Availability-DIAG] RESUMEN: ${eligibleCount} elegibles, ${blockedCount} bloqueados (mostrando primeros 20)`);
                  }}
                  className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 rounded-md font-medium transition-colors whitespace-nowrap text-xs"
                  title="Diagnóstico: ver en consola por qué los slots están bloqueados"
                >
                  <i className="ri-bug-line mr-1 w-3.5 h-3.5 inline-flex items-center justify-center"></i>
                  Diagnóstico
                </button>
                <button
                  onClick={() => {
                    handleExitSelectionMode();
                    setCopyDraft(null);
                    setCopyOfReservationId(null);
                  }}
                  className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-md font-medium transition-colors whitespace-nowrap text-xs"
                >
                  <i className="ri-close-line mr-1.5 w-3.5 h-3.5 inline-flex items-center justify-center"></i>
                  Salir
                </button>
              </div>
            </div>
          )}

          {/* Banner de error de reglas */}
          {selectionMode && allocationError && (
            <div className="bg-amber-500 text-white px-4 py-2 flex items-center gap-2">
              <i className="ri-alert-line text-base w-4 h-4 flex items-center justify-center"></i>
              <div>
                <p className="font-semibold text-xs">Reglas no disponibles</p>
                <p className="text-[11px] text-amber-100">{allocationError}</p>
              </div>
            </div>
          )}

          {/* Banner de carga de reglas */}
          {selectionMode && allocationLoading && (
            <div className="bg-blue-500 text-white px-4 py-2 flex items-center gap-2">
              <i className="ri-loader-4-line text-base w-4 h-4 flex items-center justify-center animate-spin"></i>
              <p className="font-medium text-xs">Cargando reglas de asignación de andenes...</p>
            </div>
          )}

          {/* Barra superior de controles
              padding horizontal usa clamp() para no "respirar" demasiado en pantallas anchas */}
          <div
            className="bg-white border-b border-gray-200 py-2"
            style={{ paddingLeft: 'clamp(12px, 1.2vw, 20px)', paddingRight: 'clamp(12px, 1.2vw, 20px)' }}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Botón Hoy — padding con clamp para escala fluida */}
                <button
                  onClick={goToToday}
                  className="bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium whitespace-nowrap"
                  style={{ padding: 'clamp(3px, 0.3vw, 6px) clamp(8px, 0.7vw, 12px)', fontSize: 'inherit' }}
                >
                  Hoy
                </button>

                {/* Input de fecha */}
                <input
                  type="date"
                  value={anchorDate.toISOString().slice(0, 10)}
                  onChange={(e) => handlePickDate(e.target.value)}
                  className="bg-white border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  style={{ padding: 'clamp(3px, 0.3vw, 6px) clamp(6px, 0.5vw, 10px)', fontSize: 'inherit' }}
                />

                {/* Flechas de navegación */}
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={goToPrevious}
                    className="hover:bg-gray-100 rounded-md flex items-center justify-center"
                    style={{ padding: 'clamp(3px, 0.3vw, 6px)' }}
                  >
                    <i className="ri-arrow-left-s-line" style={{ fontSize: 'clamp(13px, 1vw, 16px)' }}></i>
                  </button>
                  <button
                    onClick={goToNext}
                    className="hover:bg-gray-100 rounded-md flex items-center justify-center"
                    style={{ padding: 'clamp(3px, 0.3vw, 6px)' }}
                  >
                    <i className="ri-arrow-right-s-line" style={{ fontSize: 'clamp(13px, 1vw, 16px)' }}></i>
                  </button>
                </div>

                {/* Selector de vista 1/3/7 días */}
                <div className="flex items-center gap-0.5 bg-gray-100 rounded-md" style={{ padding: '2px' }}>
                  {([['1day', '1 día', 1], ['3days', '3 días', 3], ['7days', '7 días', 7]] as const).map(([mode, label, days]) => (
                    <button
                      key={mode}
                      onClick={() => handleViewModeChange(mode)}
                      className={`rounded font-medium transition-colors whitespace-nowrap ${
                        rangeDays === days ? 'bg-white shadow-sm' : 'hover:bg-gray-200'
                      }`}
                      style={{ padding: 'clamp(2px, 0.2vw, 4px) clamp(8px, 0.65vw, 12px)', fontSize: 'inherit' }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Selector de almacén + Nueva Reserva */}
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center rounded-md font-medium whitespace-nowrap ${
                      warehouseLoading
                        ? 'bg-gray-100 text-gray-500'
                        : selectedWarehouse
                        ? 'bg-teal-50 text-teal-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                    style={{ padding: 'clamp(3px, 0.3vw, 6px) clamp(8px, 0.65vw, 10px)', fontSize: 'inherit' }}
                  >
                    <i className="ri-building-2-line mr-1" style={{ fontSize: 'clamp(11px, 0.8vw, 13px)' }}></i>
                    {warehouseLoading
                      ? 'Cargando…'
                      : selectedWarehouse
                      ? (
                        <>
                          Almacén: {selectedWarehouse.name}
                          <span className="ml-1 font-normal opacity-70" style={{ fontSize: 'clamp(10px, 0.7vw, 11px)' }}>
                            ({getUtcOffsetLabel(warehouseTimezone)})
                          </span>
                        </>
                      )
                      : 'Ver todos los andenes'}
                  </span>

                  <button
                    onClick={() => setWarehouseModalOpen(true)}
                    disabled={warehouseLoading}
                    className="bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 whitespace-nowrap font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ padding: 'clamp(3px, 0.3vw, 6px) clamp(8px, 0.65vw, 12px)', fontSize: 'inherit' }}
                  >
                    Seleccionar Almacén
                  </button>

                  {canCreate && (
                    <button
                      onClick={() => setPreModalOpen(true)}
                      disabled={selectionMode}
                      className="bg-teal-600 text-white rounded-md hover:bg-teal-700 font-medium whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ padding: 'clamp(3px, 0.3vw, 6px) clamp(8px, 0.65vw, 12px)', fontSize: 'inherit' }}
                      title="Crear reserva"
                    >
                      <i className="ri-add-line mr-1" style={{ fontSize: 'clamp(11px, 0.8vw, 13px)' }}></i>
                      Nueva Reserva
                    </button>
                  )}
                </div>
              </div>

              {/* Lado derecho: buscador + categoría + bloquear */}
              <div className="flex items-center gap-1.5 flex-wrap justify-end ml-auto">
                <div style={{ minWidth: 'clamp(160px, 14vw, 280px)', maxWidth: '320px' }}>
                  <input
                    type="text"
                    placeholder="Buscar por DUA, Factura o Chofer..."
                    value={reservationSearchTerm}
                    onChange={(e) => setReservationSearchTerm(e.target.value)}
                    className="w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    style={{ padding: 'clamp(3px, 0.3vw, 6px) clamp(8px, 0.65vw, 10px)', fontSize: 'inherit' }}
                  />
                </div>

                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="shrink-0 border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500"
                  style={{ padding: 'clamp(3px, 0.3vw, 6px) clamp(8px, 0.65vw, 10px)', fontSize: 'inherit' }}
                >
                  <option value="all">Todas las categorías</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>

                {canBlockCreate && (
                  <button
                    onClick={() => {
                      setSelectedBlock(null);
                      setIsBlockModalOpen(true);
                    }}
                    className="shrink-0 bg-gray-800 text-white rounded-md hover:bg-gray-900 font-medium whitespace-nowrap"
                    style={{ padding: 'clamp(3px, 0.3vw, 6px) clamp(8px, 0.65vw, 12px)', fontSize: 'inherit' }}
                  >
                    <i className="ri-lock-line mr-1" style={{ fontSize: 'clamp(11px, 0.8vw, 13px)' }}></i>
                    Bloquear Tiempo
                  </button>
                )}
              </div>
            </div>

            <div className="mt-1 text-gray-500" style={{ fontSize: 'clamp(10px, 0.65vw, 11px)' }}>
              Andenes visibles: {filteredDocks.length} | Mostrando {daysInView.length} días
              <span className="ml-3">
                Horario: {businessStart.slice(0, 5)} - {businessEnd.slice(0, 5)} | Intervalo: {slotInterval} min
              </span>
            </div>
          </div>

          {/* Calendario Scheduler */}
          <div className="flex-1 overflow-hidden">
            {filteredDocks.length === 0 ? (
              <div className="h-full flex items-center justify-center p-6">
                <div className="text-center max-w-md">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="ri-inbox-line text-4xl text-gray-400 w-10 h-10 flex items-center justify-center"></i>
                  </div>
                  {selectedWarehouse ? (
                    <>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">
                        Este almacén no tiene andenes asignados
                      </h3>
                      <p className="text-gray-600 mb-6">
                        El almacén "{selectedWarehouse.name}" no tiene andenes asignados. Ve a la sección de
                        Andenes y asigna un almacén, o selecciona otro almacén.
                      </p>
                      <div className="flex items-center justify-center gap-3">
                        <button
                          onClick={() => window.REACT_APP_NAVIGATE('/andenes')}
                          className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium whitespace-nowrap"
                        >
                          <i className="ri-road-map-line mr-2 w-4 h-4 inline-flex items-center justify-center"></i>
                          Ir a Andenes
                        </button>
                        <button
                          onClick={() => setWarehouseModalOpen(true)}
                          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium whitespace-nowrap"
                        >
                          <i className="ri-building-2-line mr-2 w-4 h-4 inline-flex items-center justify-center"></i>
                          Cambiar Almacén
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">No hay andenes disponibles</h3>
                      <p className="text-gray-600 mb-6">
                        No se encontraron andenes con los filtros actuales. Ajusta los filtros o crea nuevos
                        andenes.
                      </p>
                      <button
                        onClick={() => window.REACT_APP_NAVIGATE('/andenes')}
                        className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium whitespace-nowrap"
                      >
                        <i className="ri-road-map-line mr-2 w-4 h-4 inline-flex items-center justify-center"></i>
                        Ir a Andenes
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col">
                {/* Encabezado FIJO (días + andenes) — estructura en 2 capas */}
                <div className="flex-shrink-0 bg-white border-b border-gray-200">

                  {/* ── CAPA 1: Fila de FECHAS — altura con clamp para escala estable ── */}
                  <div
                    ref={dateRowRef}
                    className="relative border-b border-gray-200 overflow-hidden"
                    style={{ backgroundColor: '#f9fafb', height: 'clamp(28px, 2.2vw, 34px)' }}
                  >
                    {/* Espacio de la columna de horas */}
                    <div className="absolute left-0 top-0 w-20 h-full border-r border-gray-200 bg-white z-10" />

                    {/* Fondos de color por día */}
                    <div className="absolute left-20 top-0 bottom-0 overflow-hidden" style={{ right: 0 }}>
                      <div
                        ref={dateBgRowRef}
                        className="flex h-full will-change-transform"
                        style={{ width: totalWidth, minWidth: totalWidth }}
                      >
                        {daysInView.map((day) => {
                          const isToday = isSameDayInTimezone(day, nowTz, warehouseTimezone);
                          const dayW = filteredDocks.length * COL_W;
                          return (
                            <div
                              key={day.toISOString()}
                              className="flex-shrink-0 border-r border-gray-200 h-full"
                              style={{
                                width: `${dayW}px`,
                                minWidth: `${dayW}px`,
                                backgroundColor: isToday ? '#f0fdf4' : '#f9fafb',
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {/* Etiquetas de fecha */}
                    {daysInView.map((day) => {
                      const isToday = isSameDayInTimezone(day, nowTz, warehouseTimezone);
                      return (
                        <span
                          key={day.toISOString()}
                          ref={(el) => {
                            if (el) dateLabelRefs.current.set(day.toISOString(), el);
                            else dateLabelRefs.current.delete(day.toISOString());
                          }}
                          className={`absolute font-semibold whitespace-nowrap pointer-events-none flex items-center gap-1 z-20 ${isToday ? 'text-teal-700' : 'text-gray-900'}`}
                          style={{
                            fontSize: 'clamp(10px, 0.72vw, 12px)',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            left: '0px',
                          }}
                        >
                          {isToday && <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-500 flex-shrink-0" />}
                          {formatDayHeader(day)}
                        </span>
                      );
                    })}
                  </div>

                  {/* ── CAPA 2: Fila de ANDENES ── */}
                  <div className="flex">
                    {/* Espacio para columna de horas */}
                    <div className="w-20 flex-shrink-0 border-r border-gray-200 bg-white" />

                    {/* Header scrolleable horizontalmente */}
                    <div className="flex-1 overflow-hidden">
                      <div
                        ref={headerInnerRef}
                        style={{ width: totalWidth, minWidth: totalWidth }}
                        className="flex will-change-transform"
                      >
                        {daysInView.map((day) => {
                          const dayW = filteredDocks.length * COL_W;
                          return (
                            <div
                              key={day.toISOString()}
                              className="flex-shrink-0 border-r border-gray-200"
                              style={{ width: `${dayW}px`, minWidth: `${dayW}px` }}
                            >
                              {/* Fila de andenes — altura con clamp para escala estable */}
                              <div className="flex" style={{ height: 'clamp(30px, 2.4vw, 38px)' }}>
                                {filteredDocks.map((dock) => {
                                  const hasCustomColor = !!(dock as any).header_color;
                                  const bgColor = hasCustomColor
                                    ? (dock as any).header_color
                                    : getCategoryColor(dock.category);
                                  const nameColor = hasCustomColor
                                    ? getContrastColor((dock as any).header_color)
                                    : '#111827';
                                  const refColor = hasCustomColor
                                    ? getContrastColor((dock as any).header_color)
                                    : '#6B7280';

                                  return (
                                    <div
                                      key={dock.id}
                                      className="flex-shrink-0 border-r border-gray-200 flex flex-col items-center justify-center px-1.5"
                                      style={{
                                        width: `${COL_W}px`,
                                        minWidth: `${COL_W}px`,
                                        backgroundColor: bgColor,
                                      }}
                                    >
                                      <span
                                        className="font-semibold truncate w-full text-center leading-tight"
                                        style={{ color: nameColor, fontSize: 'clamp(10px, 0.72vw, 12px)' }}
                                      >
                                        {dock.name}
                                      </span>
                                      {dock.reference && (
                                        <span
                                          className="truncate w-full text-center leading-tight mt-0.5"
                                          style={{ color: refColor, opacity: hasCustomColor ? 0.85 : 1, fontSize: 'clamp(9px, 0.6vw, 10px)' }}
                                        >
                                          {dock.reference}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* BODY: Único contenedor con scroll vertical + horizontal */}
                <div ref={bodyScrollRef} className="flex-1 h-full overflow-auto" onScroll={handleBodyScroll}>
                  <div className="flex" style={{ width: totalWidth, minWidth: totalWidth }}>
                    {/* Columna de horas (sticky left + z-30 para quedar arriba) */}
                    <div className="w-20 flex-shrink-0 bg-white border-r border-gray-300 sticky left-0 z-30 shadow">
                      {timeSlots.map((slot) => {
                        const slotMin = slot.hour * 60 + slot.minute;
                        const isOff = slotMin < businessStartMinutes || slotMin >= businessEndMinutes;
                        return (
                          <div
                            key={slot.label}
                            className={`h-[60px] border-b flex items-start justify-end pr-2 pt-1 ${
                              isOff
                                ? 'border-gray-200 text-gray-300 text-[11px] italic'
                                : slot.minute === 0
                                ? 'border-gray-300 text-gray-700 font-semibold text-xs'
                                : 'border-gray-100 text-gray-400 text-[11px]'
                            }`}
                            style={isOff ? { backgroundColor: 'rgba(243,244,246,0.85)' } : undefined}
                          >
                            {slot.label}
                          </div>
                        );
                      })}
                    </div>

                    {/* Grid de días y andenes (z-10 para quedar debajo) */}
                    <div
                      className="flex-shrink-0"
                      style={{ width: `${totalWidth - 80}px`, minWidth: `${totalWidth - 80}px` }}
                    >
                      <div className="flex">
                        {daysInView.map((day, dayIndex) => {
                          const effectiveTzForDay = selectedWarehouse
                            ? warehouseTimezone
                            : (filteredDocks[0]?.warehouse_timezone || warehouseTimezone);

                          const isToday = isSameDayInTimezone(day, nowTz, effectiveTzForDay);

                          const nowTopForDay = isToday
                            ? (() => {
                                const dayStart = getStartOfDayInTimezone(nowTz, effectiveTzForDay);
                                const minutesFromMidnight = (nowTz.getTime() - dayStart.getTime()) / 60_000;
                                const minutesFromGridStart = minutesFromMidnight - gridStartMinutes;
                                return minutesFromGridStart * PX_PER_MINUTE_DYNAMIC;
                              })()
                            : -1;

                          const totalGridHeight = timeSlots.length * 60;
                          const shouldShowNowIndicator = isToday && nowTopForDay >= 0 && nowTopForDay <= totalGridHeight;

                          return (
                            <div
                              key={day.toISOString()}
                              className="flex-shrink-0 border-r border-gray-400 relative"
                              style={{
                                width: `${filteredDocks.length * COL_W}px`,
                                minWidth: `${filteredDocks.length * COL_W}px`,
                              }}
                            >
                              {/* Indicador de hora actual (NOW INDICATOR) */}
                              {shouldShowNowIndicator && (
                                <div
                                  className="absolute left-0 right-0 pointer-events-none z-40"
                                  style={{ top: `${nowTopForDay}px` }}
                                >
                                  <div
                                    className="absolute rounded-full"
                                    style={{
                                      width: '10px',
                                      height: '10px',
                                      backgroundColor: '#ef4444',
                                      left: '-5px',
                                      top: '-4px',
                                    }}
                                  />
                                  <div
                                    className="absolute left-0 right-0"
                                    style={{
                                      height: '2px',
                                      backgroundColor: '#ef4444',
                                    }}
                                  />
                                </div>
                              )}

                              {/* Columnas por andén dentro del día */}
                              <div className="flex">
                                {filteredDocks.map((dock) => (
                                  <div
                                    key={dock.id}
                                    className="flex-shrink-0 border-r border-gray-200 relative"
                                    style={{ width: `${COL_W}px`, minWidth: `${COL_W}px` }}
                                  >
                                    <div className="relative">
                                      {/* CAPA GRID (ABAJO) - z-0 */}
                                      <div className="relative z-0">
                                        {timeSlots.map((slot) => {
                                          const eligible = selectionMode ? isSlotEligible(dock.id, day, slot) : false;
                                          const inSelectionMode = selectionMode;
                                          const dockDisabledByRule = inSelectionMode && enabledDockIds.size > 0 && !enabledDockIds.has(dock.id);
                                          const dockBlockedByError = inSelectionMode && !!allocationError && enabledDockIds.size === 0;

                                          const slotMinutes = slot.hour * 60 + slot.minute;
                                          const isOffHours = slotMinutes < businessStartMinutes || slotMinutes >= businessEndMinutes;

                                          return (
                                            <div
                                              key={slot.label}
                                              className={`h-[60px] border-b transition-colors ${
                                                inSelectionMode
                                                  ? eligible
                                                    ? 'cursor-pointer border-teal-300'
                                                    : dockDisabledByRule || dockBlockedByError
                                                    ? 'bg-red-50/40 cursor-not-allowed border-gray-100'
                                                    : 'bg-gray-100/50 cursor-not-allowed border-gray-100'
                                                  : isOffHours
                                                  ? `cursor-default ${slot.minute === 0 ? 'border-gray-200' : 'border-gray-100'}`
                                                  : `hover:bg-gray-50/80 cursor-pointer ${slot.minute === 0 ? 'border-gray-300' : 'border-gray-100'}`
                                              }`}
                                              style={
                                                inSelectionMode && eligible
                                                  ? { backgroundColor: 'rgba(20, 184, 166, 0.60)' }
                                                  : isOffHours && !inSelectionMode
                                                  ? { backgroundColor: 'rgba(243, 244, 246, 0.85)', backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(209,213,219,0.3) 4px, rgba(209,213,219,0.3) 5px)' }
                                                  : undefined
                                              }
                                              onMouseEnter={(e) => {
                                                if (inSelectionMode && eligible) {
                                                  (e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(20, 184, 166, 0.60)';
                                                } else if (inSelectionMode && !eligible) {
                                                  // Diagnóstico al hacer hover sobre slot bloqueado
                                                  isSlotEligible(dock.id, day, slot, true);
                                                }
                                              }}
                                              onMouseLeave={(e) => {
                                                if (inSelectionMode && eligible) {
                                                  (e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(20, 184, 166, 0.35)';
                                                }
                                              }}
                                              onClick={(e) => handleCellClick(e, dock.id, day, slot)}
                                              onDragOver={handleDragOver}
                                              onDrop={(e) => handleDrop(e, dock.id, day, slot)}
                                            />
                                          );
                                        })}
                                      </div>

                                      {/* CAPA OVERLAY (ARRIBA) - z-20 */}
                                      <div className="absolute inset-0 z-20 pointer-events-none">
                                        {/* Renderizar RESERVAS filtradas */}
                                        {filteredReservations
                                          .filter((r) => {
                                            if (r.dock_id !== dock.id) return false;
                                            const rStart = new Date(r.start_datetime);
                                            return isSameDayInTimezone(rStart, day, warehouseTimezone);
                                          })
                                          .map((reservation) => {
                                            const start = new Date(reservation.start_datetime);
                                            const end = new Date(reservation.end_datetime);

                                            const clamped = clampEventToBusinessHours(day, start, end);
                                            if (!clamped) return null;

                                            const { top, height } = clamped;

                                            // Misma lógica que ReservationModal.canViewSensitive
                                            const isOwnerR = reservation.created_by === user?.id;
                                            const hasSameProviderR = reservation.shipper_provider
                                              ? userProviderIds.has(reservation.shipper_provider)
                                              : false;
                                            const canViewSensitiveR = isOwnerR || isPrivilegedUser || hasSameProviderR;

                                            return (
                                              <ReservationHoverCard
                                                key={reservation.id}
                                                isLimitedAccess={!canViewSensitiveR}
                                                data={{
                                                  id: reservation.id,
                                                  startDatetime: reservation.start_datetime,
                                                  endDatetime: reservation.end_datetime,
                                                  statusName: reservation.status?.name,
                                                  statusColor: reservation.status?.color,
                                                  dockName: filteredDocks.find(d => d.id === reservation.dock_id)?.name,
                                                  providerName: canViewSensitiveR ? providers.find(p => p.id === reservation.shipper_provider)?.name : null,
                                                  driver: canViewSensitiveR ? reservation.driver : null,
                                                  truckPlate: canViewSensitiveR ? reservation.truck_plate : null,
                                                  cargoOrigin: canViewSensitiveR ? (reservation as any).cargo_origin : null,
                                                  dua: canViewSensitiveR ? reservation.dua : null,
                                                  invoice: canViewSensitiveR ? reservation.invoice : null,
                                                  purchaseOrder: canViewSensitiveR ? reservation.purchase_order : null,
                                                  pedido: canViewSensitiveR ? reservation.order_request_number : null,
                                                  operationType: (reservation as any).operation_type ?? null,
                                                  notes: canViewSensitiveR ? reservation.notes : null,
                                                  createdByName: canViewSensitiveR ? (reservation.creator?.name || reservation.creator?.email || null) : null,
                                                }}
                                                disabled={selectionMode}
                                              >
                                                <div
                                                  draggable={canMove && !selectionMode}
                                                  onDragStart={(e) => {
                                                    if (selectionMode) { e.preventDefault(); return; }
                                                    handleDragStart(e, {
                                                      type: 'reservation',
                                                      id: reservation.id,
                                                      dockId: dock.id,
                                                      startTime: start,
                                                      endTime: end,
                                                      data: reservation,
                                                    });
                                                  }}
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (selectionMode) {
                                                      setNotifyModal({
                                                        isOpen: true,
                                                        type: 'warning',
                                                        title: 'Espacio ocupado',
                                                        message: 'Ese espacio ya está reservado. Seleccioná un espacio disponible (verde).',
                                                      });
                                                      return;
                                                    }
                                                    handleSelectSlot({
                                                      dockId: dock.id,
                                                      date: day.toISOString(),
                                                      time: '',
                                                      eventType: 'reservation',
                                                      id: reservation.id,
                                                      data: reservation,
                                                      startTime: start,
                                                      endTime: end,
                                                    });
                                                  }}
                                                  className={`absolute left-1 right-1 rounded-lg border border-l-4 shadow-sm hover:shadow transition-shadow overflow-hidden pointer-events-auto ${
                                                    selectionMode ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                                                  }`}
                                                  style={{
                                                    top: `${top}px`,
                                                    height: `${height}px`,
                                                    borderLeftColor: reservation.status?.color || '#6B7280',
                                                    borderColor: hexToTint(reservation.status?.color || '#6B7280', 0.55),
                                                    borderLeftWidth: '4px',
                                                    backgroundColor: hexToTint(reservation.status?.color || '#6B7280', 0.84),
                                                    minHeight: '52px',
                                                  }}
                                                >
                                                  <div
                                                    className="h-full flex flex-col justify-between overflow-hidden"
                                                    style={{ padding: '7px 9px 7px 9px' }}
                                                  >
                                                    {/* Bloque superior: info principal — render adaptativo según height */}
                                                    <div className="flex flex-col gap-0.5 overflow-hidden min-w-0 flex-1">
                                                      {/* ID — siempre visible */}
                                                      <div className="font-bold text-gray-900 truncate text-[13px] leading-tight">
                                                        #{reservation.id.slice(0, 8)}
                                                      </div>
                                                      {/* Proveedor — solo si tiene acceso */}
                                                      {canViewSensitiveR && reservation.shipper_provider && (
                                                        <div className="font-semibold text-gray-700 truncate text-[12px] leading-tight">
                                                          {providers.find(p => p.id === reservation.shipper_provider)?.name || reservation.shipper_provider}
                                                        </div>
                                                      )}
                                                      {/* DUA — solo si tiene acceso */}
                                                      {canViewSensitiveR && reservation.dua && (
                                                        <div className="text-gray-600 truncate text-[11px] leading-tight">
                                                          <span className="text-gray-400">DUA:</span> {reservation.dua}
                                                        </div>
                                                      )}
                                                      {/* Pedido — solo si tiene acceso */}
                                                      {canViewSensitiveR && reservation.order_request_number && (
                                                        <div className="text-gray-600 truncate text-[11px] leading-tight">
                                                          <span className="text-gray-400">Pedido:</span> {reservation.order_request_number}
                                                        </div>
                                                      )}
                                                      {/* Factura — solo si tiene acceso y hay espacio */}
                                                      {canViewSensitiveR && height > 90 && reservation.invoice && (
                                                        <div className="text-gray-600 truncate text-[11px] leading-tight">
                                                          <span className="text-gray-400">Factura:</span> {reservation.invoice}
                                                        </div>
                                                      )}
                                                      {/* Matrícula — solo si tiene acceso y hay espacio */}
                                                      {canViewSensitiveR && height > 105 && reservation.truck_plate && (
                                                        <div className="text-gray-600 truncate text-[11px] leading-tight">
                                                          <span className="text-gray-400">Matrícula:</span> {reservation.truck_plate}
                                                        </div>
                                                      )}
                                                      {/* Chofer — solo si tiene acceso y hay espacio */}
                                                      {canViewSensitiveR && height > 120 && reservation.driver && (
                                                        <div className="text-gray-600 truncate text-[11px] leading-tight">
                                                          <span className="text-gray-400">Chofer:</span> {reservation.driver}
                                                        </div>
                                                      )}
                                                      {/* Creado por — solo si tiene acceso y hay espacio */}
                                                      {canViewSensitiveR && height > 120 && reservation.creator && (reservation.creator.name || reservation.creator.email) && (
                                                        <div className="text-gray-500 truncate text-[10px] leading-tight mt-0.5">
                                                          <span className="text-gray-400">Por:</span> {reservation.creator.name || reservation.creator.email}
                                                        </div>
                                                      )}
                                                      {/* Orden de compra — solo si tiene acceso y hay espacio */}
                                                      {canViewSensitiveR && height > 138 && reservation.purchase_order && (
                                                        <div className="text-gray-600 truncate text-[11px] leading-tight">
                                                          <span className="text-gray-400">OC:</span> {reservation.purchase_order}
                                                        </div>
                                                      )}
                                                      {/* Indicador de acceso limitado en la card */}
                                                      {!canViewSensitiveR && (
                                                        <div className="text-amber-600 truncate text-[10px] leading-tight mt-0.5 flex items-center gap-0.5">
                                                          <i className="ri-eye-off-line" style={{ fontSize: '10px' }}></i>
                                                          <span>Info limitada</span>
                                                        </div>
                                                      )}
                                                    </div>

                                                    {/* Bloque inferior: tipo de operación + estado + hora */}
                                                    <div className="flex flex-col gap-1 mt-1.5 flex-shrink-0 min-w-0">
                                                      {/* Chip de tipo de operación — justo arriba del estado */}
                                                      {(reservation as any).operation_type && (() => {
                                                        const OP_LABELS: Record<string, { label: string; icon: string }> = {
                                                          distribucion: { label: 'Distribución', icon: 'ri-store-2-line' },
                                                          almacen: { label: 'Almacén', icon: 'ri-archive-line' },
                                                          zona_franca: { label: 'Zona Franca', icon: 'ri-global-line' },
                                                        };
                                                        const raw: string = (reservation as any).operation_type;
                                                        const key = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
                                                        const info = OP_LABELS[key] ?? { label: raw, icon: 'ri-flag-line' };
                                                        return (
                                                          <div className="flex items-center gap-1 min-w-0">
                                                            <span
                                                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold leading-tight truncate max-w-full text-gray-900"
                                                              style={{
                                                                backgroundColor: 'rgba(0,0,0,0.06)',
                                                                border: '1px solid rgba(0,0,0,0.10)',
                                                              }}
                                                            >
                                                              <i className={`${info.icon} flex-shrink-0 text-gray-900`} style={{ fontSize: '9px' }} />
                                                              <span className="truncate">{info.label}</span>
                                                            </span>
                                                          </div>
                                                        );
                                                      })()}

                                                      {/* Estado + hora */}
                                                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0">
                                                        <span
                                                          className="px-1.5 py-0.5 rounded text-[11px] font-semibold text-white leading-tight shrink-0"
                                                          style={{ backgroundColor: reservation.status?.color || '#6B7280' }}
                                                        >
                                                          {reservation.status?.name || 'Sin estado'}
                                                        </span>
                                                        <span className="text-[12px] font-semibold text-gray-700 flex items-center gap-0.5 shrink-0 leading-tight">
                                                          <i className="ri-time-line w-3.5 h-3.5 flex items-center justify-center"></i>
                                                          {toWarehouseTimeString(start, warehouseTimezone)}-{toWarehouseTimeString(end, warehouseTimezone)}
                                                        </span>
                                                      </div>
                                                    </div>
                                                  </div>
                                                </div>
                                              </ReservationHoverCard>
                                            );
                                          })}


                                        {/* Renderizar BLOQUES */}
                                        {blocks
                                          .filter((b) => {
                                            if (b.dock_id !== dock.id) return false;
                                            const bStart = new Date(b.start_datetime);
                                            return isSameDayInTimezone(bStart, day, warehouseTimezone);
                                          })
                                          .map((block) => {
                                            const start = new Date(block.start_datetime);
                                            const end = new Date(block.end_datetime);

                                            const clamped = clampEventToBusinessHours(day, start, end);
                                            if (!clamped) return null;

                                            const { top, height } = clamped;

                                            return (
                                              <div
                                                key={block.id}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  if (selectionMode) {
                                                    setNotifyModal({
                                                      isOpen: true,
                                                      type: 'warning',
                                                      title: 'Horario no disponible',
                                                      message: 'Este horario está bloqueado. Seleccioná un espacio disponible (verde).',
                                                    });
                                                    return;
                                                  }
                                                  handleSelectSlot({
                                                    dockId: dock.id,
                                                    date: day.toISOString(),
                                                    time: '',
                                                    eventType: 'block',
                                                    id: block.id,
                                                    data: block,
                                                    startTime: start,
                                                    endTime: end,
                                                  });
                                                }}
                                                className={`absolute left-1 right-1 rounded-lg border border-gray-300/40 bg-gray-500 text-white shadow-sm overflow-hidden pointer-events-auto ${
                                                  selectionMode ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                                                }`}
                                                style={{
                                                  top: `${top}px`,
                                                  height: `${height}px`,
                                                  minHeight: '40px',
                                                }}
                                              >
                                                <div className="h-full flex flex-col justify-between overflow-hidden" style={{ padding: '7px 9px' }}>
                                                  <div className="font-bold text-[13px] leading-tight">Bloqueado</div>
                                                  {block.reason && (
                                                    <div className="text-[12px] font-semibold opacity-90 truncate leading-tight mt-0.5">{block.reason}</div>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ReservationModal con defaults preseleccionados */}
          <ReservationModal
            isOpen={reserveModalOpen}
            reservation={selectedReservation}
            defaults={reserveModalSlot}
            docks={docks}
            statuses={
              hasLimitedStatusView
                ? statuses.filter(s => s.code === 'PENDING' || s.code === 'CANCELLED')
                : statuses
            }
            orgId={orgId!}
            warehouseId={warehouseId}
            warehouseTimezone={warehouseTimezone}
            copyOfId={copyOfReservationId}
            onCopy={handleCopyReservation}
            onClose={() => {
              setReserveModalOpen(false);
              setSelectedReservation(null);
              setReserveModalSlot(null);
              setCopyOfReservationId(null);
              setCopyDraft(null);
            }}
            onSave={async () => {
              setReserveModalOpen(false);
              setSelectedReservation(null);
              setReserveModalSlot(null);
              setCopyOfReservationId(null);
              setCopyDraft(null);
              pendingRealtimeRefreshRef.current = false;
              cacheRef.current.clear();
              await new Promise(resolve => setTimeout(resolve, 300));
              await loadData(true);
            }}
          />

          {isBlockModalOpen && (
            <BlockModal
              block={selectedBlock}
              docks={docks}
              warehouseTimezone={warehouseTimezone}
              onClose={() => {
                setIsBlockModalOpen(false);
                setSelectedBlock(null);
              }}
              onSave={async () => {
                setIsBlockModalOpen(false);
                setSelectedBlock(null);
                cacheRef.current.clear();
                await loadData();
              }}
            />
          )}

          {/* PreReservationMiniModal */}
          <PreReservationMiniModal
            isOpen={preModalOpen}
            onClose={() => setPreModalOpen(false)}
            orgId={orgId!}
            warehouseId={warehouseId}
            warehouseLabel={warehouseLabel}
            onConfirm={handlePreReservationConfirm}
          />
        </>
      )}

      {/* Modal selector de almacén */}
      {warehouseModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                  <i className="ri-building-2-line text-xl text-teal-600 w-5 h-5 flex items-center justify-center"></i>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Seleccionar Almacén</h2>
                  <p className="text-sm text-gray-600">
                    {warehouses.length} almacén{warehouses.length !== 1 ? 'es' : ''} disponible
                    {warehouses.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setWarehouseModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700"
              >
                <i className="ri-close-line text-xl w-5 h-5 flex items-center justify-center"></i>
              </button>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-3">
                {/* Opción "Ver todos" — solo para usuarios con acceso global */}
                {isGlobalAccess && (
                  <button
                    onClick={() => handleWarehouseSelect(null)}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                      warehouseId === null
                        ? 'border-teal-500 bg-teal-50'
                        : 'border-gray-200 hover:border-teal-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900">Ver todos los andenes</h3>
                          {warehouseId === null && <i className="ri-check-line text-teal-600 w-5 h-5 flex items-center justify-center"></i>}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          Muestra los andenes de todos los almacenes sin filtrar
                        </p>
                      </div>
                      <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center ml-4">
                        <i className="ri-stack-line text-xl text-teal-600 w-5 h-5 flex items-center justify-center"></i>
                      </div>
                    </div>
                  </button>
                )}

                {/* Lista de almacenes */}
                {warehouses.length === 0 ? (
                  <div className="text-center py-12">
                    <i className="ri-inbox-line text-5xl text-gray-300 w-12 h-12 flex items-center justify-center mx-auto"></i>
                    <p className="mt-4 text-gray-600">No hay almacenes disponibles</p>
                    <p className="text-sm text-gray-500 mt-2">Crea almacenes desde el módulo de Administración</p>
                  </div>
                ) : (
                  warehouses.map((warehouse) => (
                    <button
                      key={warehouse.id}
                      onClick={() => handleWarehouseSelect(warehouse.id)}
                      className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                        warehouseId === warehouse.id
                          ? 'border-teal-500 bg-teal-50'
                          : 'border-gray-200 hover:border-teal-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-gray-900">{warehouse.name}</h3>
                            {warehouseId === warehouse.id && <i className="ri-check-line text-teal-600 w-5 h-5 flex items-center justify-center"></i>}
                          </div>
                          {warehouse.location && <p className="text-sm text-gray-600 mt-1">{warehouse.location}</p>}
                          {(warehouse as any).business_start_time && (warehouse as any).business_end_time && (
                            <p className="text-xs text-gray-500 mt-1">
                              Horario: {(warehouse as any).business_start_time?.slice(0, 5)} -{' '}
                              {(warehouse as any).business_end_time?.slice(0, 5)} | Intervalo:{' '}
                              {(warehouse as any).slot_interval_minutes || 60} min
                            </p>
                          )}
                        </div>
                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center ml-4">
                          <i className="ri-building-2-fill text-xl text-gray-400 w-5 h-5 flex items-center justify-center"></i>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de notificación */}
      <ConfirmModal
        isOpen={notifyModal.isOpen}
        type={notifyModal.type}
        title={notifyModal.title}
        message={notifyModal.message}
        onConfirm={() => setNotifyModal({ ...notifyModal, isOpen: false })}
        onCancel={() => setNotifyModal({ ...notifyModal, isOpen: false })}
      />
    </div>
  );
}