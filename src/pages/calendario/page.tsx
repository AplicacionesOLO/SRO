import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { usePermissions } from '../../hooks/usePermissions';
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

type ViewMode = '1day' | '3days' | '7days';
type TabMode = 'calendar' | 'statuses';

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

const TIMEZONE = 'America/Costa_Rica';
const BUFFER_DAYS = 2;

// ✅ Función para obtener inicio de día en timezone específico
const getStartOfDay = (date: Date, timezone: string): Date => {
  const dateStr = date.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD
  const startStr = `${dateStr}T00:00:00`;
  return new Date(new Date(startStr).toLocaleString('en-US', { timeZone: timezone }));
};

// ✅ Función para obtener fin de día en timezone específico
const getEndOfDay = (date: Date, timezone: string): Date => {
  const dateStr = date.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD
  const endStr = `${dateStr}T23:59:59.999`;
  return new Date(new Date(endStr).toLocaleString('en-US', { timeZone: timezone }));
};

const getNowInTimezone = (timezone: string): Date => {
  return new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
};

// ✅ NUEVO: Helper para comparar si dos fechas son el mismo día en timezone
const isSameDayTz = (day: Date, nowTz: Date, timezone: string): boolean => {
  const dayStart = getStartOfDay(day, timezone);
  const nowStart = getStartOfDay(nowTz, timezone);
  return dayStart.getTime() === nowStart.getTime();
};

export default function CalendarioPage() {
  const { can, orgId, loading: permLoading } = usePermissions();
  const { user } = useAuth();

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

  // Estados de warehouses
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [warehouseLoading, setWarehouseLoading] = useState(false);
  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);

  const [reserveModalOpen, setReserveModalOpen] = useState(false);
  const [reserveModalSlot, setReserveModalSlot] = useState<any>(null);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);

  const [selectedBlock, setSelectedBlock] = useState<DockTimeBlock | null>(null);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);

  // ✅ NUEVO: Separar términos de búsqueda
  const [dockSearchTerm, setDockSearchTerm] = useState(''); // Para filtrar andenes (si se necesita)
  const [reservationSearchTerm, setReservationSearchTerm] = useState(''); // Para filtrar reservas
  
  // ✅ NUEVO: Debounce del término de búsqueda de reservas (300ms)
  const debouncedReservationSearch = useDebouncedValue(reservationSearchTerm, 300);

  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

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
  const [nowTz, setNowTz] = useState<Date>(getNowInTimezone(TIMEZONE));

  // ✅ Refs para sincronización de scroll horizontal
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const headerInnerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // ✅ Caché para evitar refetch innecesario
  const cacheRef = useRef<Map<string, { reservations: Reservation[]; blocks: DockTimeBlock[] }>>(new Map());

  // ✅ Constante de ancho de columna
  const COL_W = 200;

  // ✅ NUEVO: useEffect para actualizar nowTz cada 60 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      setNowTz(getNowInTimezone(TIMEZONE));
    }, 60000); // 60 segundos

    return () => clearInterval(interval);
  }, []);

  // ✅ Moved all useMemo hooks here (no hooks after returns)
  const canView = useMemo(() => can('calendar.view'), [can]);
  const canCreate = useMemo(() => can('reservations.create'), [can]);
  const canMove = useMemo(() => can('reservations.move'), [can]);
  const canBlockCreate = useMemo(() => can('dock_blocks.create'), [can]);
  const canBlockUpdate = useMemo(() => can('dock_blocks.update'), [can]);
  const canBlockDelete = useMemo(() => can('dock_blocks.delete'), [can]);
  const canManageStatuses = useMemo(() => can('operational_statuses.view'), [can]);

  // Computed: almacén seleccionado
  const selectedWarehouse = useMemo(() => {
    if (!warehouseId) return null;
    return warehouses.find((w) => w.id === warehouseId) || null;
  }, [warehouseId, warehouses]);

  // ✅ Calcular rango de fechas basado en rangeDays y anchorDate (simétrico)
  const dateRange = useMemo(() => {
    const halfRange = Math.floor(rangeDays / 2);

    // Calcular inicio y fin del rango visible
    const startDate = new Date(anchorDate);
    startDate.setDate(anchorDate.getDate() - halfRange);

    const endDate = new Date(anchorDate);
    endDate.setDate(anchorDate.getDate() + (rangeDays - halfRange - 1));

    // Ajustar a inicio/fin de día en timezone correcto
    const startOfRange = getStartOfDay(startDate, TIMEZONE);
    const endOfRange = getEndOfDay(endDate, TIMEZONE);

    // Calcular rango con buffer para prefetch
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
  }, [anchorDate, rangeDays]);

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

  // ✅ Construye un Date con el mismo día (timezone de referencia del calendario) a X minutos desde medianoche
  const buildDateFromMinutes = useCallback(
    (day: Date, minutesFromMidnight: number) => {
      const dayStartTz = getStartOfDay(day, TIMEZONE);
      const dt = new Date(dayStartTz);
      const h = Math.floor(minutesFromMidnight / 60);
      const m = minutesFromMidnight % 60;
      dt.setHours(h, m, 0, 0);
      return dt;
    },
    []
  );

  // ✅ TOP calculado desde la hora de inicio hábil (NO desde 00:00)
  const getTopFromBusinessStart = useCallback(
    (date: Date): number => {
      const minutesFromMidnight = date.getHours() * 60 + date.getMinutes();
      const minutesFromStart = minutesFromMidnight - businessStartMinutes;
      return minutesFromStart * PX_PER_MINUTE_DYNAMIC;
    },
    [businessStartMinutes, PX_PER_MINUTE_DYNAMIC]
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
  const timeSlots: TimeSlot[] = useMemo(() => {
    const slots: TimeSlot[] = [];

    // Protección: si por alguna razón viene mal configurado
    if (businessEndMinutes <= businessStartMinutes) return slots;

    for (let min = businessStartMinutes; min < businessEndMinutes; min += slotInterval) {
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

  // ✅ Ejecutar carga solo cuando esté listo
  const ready = useMemo(() => !!orgId && !permLoading, [orgId, permLoading]);

  // ✅ Label para almacén (para PreReservationMiniModal)
  const warehouseLabel = useMemo(() => {
    if (selectedWarehouse) return selectedWarehouse.name;
    return 'Ver todos los andenes';
  }, [selectedWarehouse]);

  // Cargar warehouses al montar
  useEffect(() => {
    if (!orgId) return;

    const loadWarehouses = async () => {
      setWarehouseLoading(true);
      try {
        const data = await calendarService.getWarehouses(orgId);
        setWarehouses(data);
        console.log('[Calendar] warehouses loaded', { count: data.length });

        // Inicializar warehouseId desde localStorage o mantener null (ver todos)
        const storageKey = `calendar_selected_warehouse_${orgId}`;
        const savedId = localStorage.getItem(storageKey);

        if (savedId === 'null' || savedId === '') {
          setWarehouseId(null);
          console.log('[Calendar] warehouse set to "Ver todos" from localStorage');
        } else if (savedId && data.some((w) => w.id === savedId)) {
          setWarehouseId(savedId);
          console.log('[Calendar] warehouse restored from localStorage', { id: savedId });
        } else {
          setWarehouseId(null);
          console.log('[Calendar] warehouse initialized to "Ver todos" (default)');
        }
      } catch (err) {
        console.error('[Calendar] loadWarehouses error', err);
      } finally {
        setWarehouseLoading(false);
      }
    };

    loadWarehouses();
  }, [orgId]);

  // ✅ Cargar datos con caché inteligente (SIN searchTerm)
  const loadData = useCallback(async () => {
    if (!orgId) return;

    try {
      setLoading(true);

      const { bufferStart, bufferEnd } = dateRange;

      // ✅ CORREGIDO: Generar cache key SIN searchTerm
      const cacheKey = `${orgId}:${bufferStart.toISOString()}:${bufferEnd.toISOString()}:${
        warehouseId || 'all'
      }:${filterCategory}`;

      console.log('[Calendar] loadData', {
        orgId,
        warehouseId,
        bufferStart: bufferStart.toISOString(),
        bufferEnd: bufferEnd.toISOString(),
        rangeDays,
        cacheKey,
        cached: cacheRef.current.has(cacheKey),
      });

      // Verificar caché
      const cached = cacheRef.current.get(cacheKey);

      if (cached) {
        console.log('[Calendar] Using cached data', {
          reservations: cached.reservations.length,
          blocks: cached.blocks.length,
        });
        setReservations(cached.reservations);
        setBlocks(cached.blocks);
        setLoading(false);
        return;
      }

      // Cargar datos en paralelo
      const [docksData, reservationsData, blocksData, statusesData, categoriesData] = await Promise.all([
        calendarService.getDocks(orgId, warehouseId),
        calendarService.getReservations(orgId, bufferStart.toISOString(), bufferEnd.toISOString()),
        calendarService.getDockTimeBlocks(orgId, bufferStart.toISOString(), bufferEnd.toISOString()),
        calendarService.getReservationStatuses(orgId),
        calendarService.getDockCategories(orgId),
      ]);

      console.log('[Calendar] docksCountBeforeFilter', { count: docksData.length, warehouseId });

      // Filtrar reservas y bloques para mostrar solo los del warehouse seleccionado
      const dockIds = new Set(docksData.map((d) => d.id));
      const filteredReservations = reservationsData.filter((r) => dockIds.has(r.dock_id));
      const filteredBlocks = blocksData.filter((b) => dockIds.has(b.dock_id));

      console.log('[Calendar] docksCountAfterFilter', {
        count: docksData.length,
        reservations: filteredReservations.length,
        blocks: filteredBlocks.length,
        warehouseId,
      });

      console.log('[Calendar] Data loaded', {
        docks: docksData.length,
        reservations: filteredReservations.length,
        blocks: filteredBlocks.length,
        statuses: statusesData.length,
        categories: categoriesData.length,
        warehouseId,
      });

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
      console.error('[Calendar] loadError', {
        message: error.message,
        code: error.code,
        details: error.details,
      });
    } finally {
      setLoading(false);
    }
  }, [orgId, dateRange, rangeDays, warehouseId, filterCategory]); // ✅ REMOVIDO: searchTerm

  useEffect(() => {
    if (!ready) return;
    loadData();
  }, [ready, loadData]);

  // Handler para seleccionar almacén
  const handleWarehouseSelect = (selectedId: string | null) => {
    setWarehouseId(selectedId);
    setWarehouseModalOpen(false);

    // Guardar en localStorage
    if (orgId) {
      const storageKey = `calendar_selected_warehouse_${orgId}`;
      localStorage.setItem(storageKey, selectedId || 'null');
    }

    // Limpiar cache y recargar
    cacheRef.current.clear();

    const selected = selectedId ? warehouses.find((w) => w.id === selectedId) : null;
    console.log('[Calendar] warehouse selected', {
      id: selectedId,
      name: selected?.name || 'Ver todos',
    });

    loadData();
  };

  // ✅ Navegación: Ir a hoy
  const goToToday = () => {
    setAnchorDate(new Date());
  };

  const handlePickDate = (value: string) => {
    if (!value) return;
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return;

    setAnchorDate(new Date(y, m - 1, d));
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
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const months = [
      'enero',
      'febrero',
      'marzo',
      'abril',
      'mayo',
      'junio',
      'julio',
      'agosto',
      'septiembre',
      'octubre',
      'noviembre',
      'diciembre',
    ];
    return `${days[date.getDay()]}, ${date.getDate()} de ${
      months[date.getMonth()]
    } de ${date.getFullYear()}`;
  };

  // ✅ NUEVO: Helper para validar si un slot es elegible
  const isSlotEligible = useCallback(
    (dockId: string, day: Date, timeSlot: TimeSlot): boolean => {
      if (!selectionMode || requiredMinutes < 5) return false;

      // ✅ Per-slot dock allocation: calcular habilitados dinámicamente
      if (allocationRule && !allocationRule.allowAllDocks && allocationRule.clientDocks.length > 0) {
        const dayStartTz = getStartOfDay(day, TIMEZONE);
        const slotStartForAlloc = new Date(dayStartTz);
        slotStartForAlloc.setHours(timeSlot.hour, timeSlot.minute, 0, 0);
        const slotEndForAlloc = new Date(slotStartForAlloc.getTime() + requiredMinutes * 60 * 1000);

        const enabledForSlot = dockAllocationService.getEnabledDockIdsForSlot(
          allocationRule.clientDocks,
          allocationRule.dockAllocationMode,
          reservations,
          slotStartForAlloc,
          slotEndForAlloc
        );

        if (!enabledForSlot.has(dockId)) return false;
      } else {
        // Fallback al comportamiento estático anterior
        if (enabledDockIds.size > 0 && !enabledDockIds.has(dockId)) return false;
        if (enabledDockIds.size === 0 && allocationError) return false;
      }

      const dayStartTz = getStartOfDay(day, TIMEZONE);
      const slotStart = new Date(dayStartTz);
      slotStart.setHours(timeSlot.hour, timeSlot.minute, 0, 0);

      const nowTz = getNowInTimezone(TIMEZONE);

      // Bloquear días en el pasado
      const startOfToday = getStartOfDay(nowTz, TIMEZONE);
      const startOfSlotDay = getStartOfDay(day, TIMEZONE);
      if (startOfSlotDay < startOfToday) return false;

      // Si es hoy, bloquear horas anteriores a "ahora"
      if (startOfSlotDay.getTime() === startOfToday.getTime() && slotStart < nowTz) {
        return false;
      }

      const slotEnd = new Date(slotStart.getTime() + requiredMinutes * 60 * 1000);

      // ✅ Validar que el espacio esté dentro del horario hábil del almacén
      const slotStartMin = slotStart.getHours() * 60 + slotStart.getMinutes();
      const slotEndMin = slotEnd.getHours() * 60 + slotEnd.getMinutes();
      if (slotStartMin < businessStartMinutes) return false;
      if (slotEndMin > businessEndMinutes) return false;

      // Regla: no cruzar a otro día
      if (slotStart.toDateString() !== slotEnd.toDateString()) return false;

      // Verificar conflictos con reservas existentes
      const hasReservationConflict = reservations.some((r) => {
        if (r.dock_id !== dockId) return false;
        const rStart = new Date(r.start_datetime);
        const rEnd = new Date(r.end_datetime);
        return slotStart < rEnd && slotEnd > rStart;
      });
      if (hasReservationConflict) return false;

      // Verificar conflictos con bloques
      const hasBlockConflict = blocks.some((b) => {
        if (b.dock_id !== dockId) return false;
        const bStart = new Date(b.start_datetime);
        const bEnd = new Date(b.end_datetime);
        return slotStart < bEnd && slotEnd > bStart;
      });
      if (hasBlockConflict) return false;

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

  // ✅ MODIFICADO: handleCellClick con soporte para modo selección
  const handleCellClick = useCallback(
    (e: React.MouseEvent, dockId: string, day: Date, timeSlot: TimeSlot) => {
      const cellStart = new Date(day);
      cellStart.setHours(timeSlot.hour, timeSlot.minute, 0, 0);

      const cellEnd = new Date(cellStart);
      cellEnd.setMinutes(cellEnd.getMinutes() + slotInterval);

      // ✅ NUEVO: Si estamos en modo selección
      if (selectionMode) {
        const eligible = isSlotEligible(dockId, day, timeSlot);
        if (!eligible) return;

        // Slot elegible: calcular end según requiredMinutes
        const calculatedEnd = new Date(cellStart.getTime() + requiredMinutes * 60 * 1000);

        // ✅ Seguridad extra: no permitir pasar el horario hábil (aunque isSlotEligible ya lo filtra)
        if (!isWithinBusinessHours(day, cellStart, calculatedEnd)) return;

        setReserveModalSlot({
          dock_id: dockId,
          start_datetime: cellStart.toISOString(),
          end_datetime: calculatedEnd.toISOString(),
          cargo_type: preCargoTypeId,
          shipper_provider: preProviderId,
        });
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

    const duration = new Date(reservation.end_datetime).getTime() - new Date(reservation.start_datetime).getTime();

    const newStart = new Date(targetDay);
    newStart.setHours(targetSlot.hour, targetSlot.minute, 0, 0);

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
    const willConflictReservation = reservations.some((r) => {
      if (r.id === reservation.id) return false;
      if (r.dock_id !== targetDockId) return false;
      const rStart = new Date(r.start_datetime);
      const rEnd = new Date(r.end_datetime);
      return newStart < rEnd && newEnd > rStart;
    });

    const willConflictBlock = blocks.some((b) => {
      if (b.dock_id !== targetDockId) return false;
      const bStart = new Date(b.start_datetime);
      const bEnd = new Date(b.end_datetime);
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

  // ✅ Handler de scroll con sincronización horizontal usando RAF (único)
  const handleBodyScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollLeft = e.currentTarget.scrollLeft;

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      if (headerInnerRef.current) {
        headerInnerRef.current.style.transform = `translateX(-${scrollLeft}px)`;
      }
    });
  }, []);

  // ✅ Modal de notificación (state)
  const [notifyModal, setNotifyModal] = useState({
    isOpen: false,
    type: 'info' as 'info' | 'warning' | 'error' | 'success',
    title: '',
    message: '',
  });

  // ✅ NUEVO: Handler para confirmar preselección y activar modo selección
  const handlePreReservationConfirm = useCallback(async (payload: { cargoTypeId: string; providerId: string; clientId: string; requiredMinutes: number }) => {
    console.log('[Calendar] Pre-reservation confirmed', payload);
    setPreCargoTypeId(payload.cargoTypeId);
    setPreProviderId(payload.providerId);
    setRequiredMinutes(payload.requiredMinutes);
    setPreModalOpen(false);

    // ✅ REESCRITO: Cargar reglas usando clientId directamente (no providerId)
    setAllocationLoading(true);
    setAllocationError('');
    setAllocationRule(null);

    const clientId = payload.clientId;

    if (!clientId) {
      console.warn('[DockAllocation] missing clientId - no client linked to provider');
      setAllocationError('No se encontró un cliente vinculado al proveedor. Las reglas de andenes no se aplicarán.');
      setAllocationRule(null);
      setAllocationLoading(false);
      setSelectionMode(true);
      return;
    }

    try {
      console.log('[DockAllocation] context', { orgId, warehouseId, clientId });

      const rule = await dockAllocationService.getDockAllocationRule(
        orgId!,
        clientId
      );

      if (!rule) {
        console.warn('[DockAllocation] missing - could not load allocation rule for clientId', clientId);
        setAllocationError('No se pudieron cargar las reglas del cliente. Contactá a un administrador.');
        setAllocationRule(null);
      } else {
        setAllocationRule(rule);
        setAllocationError('');
        console.log('[DockAllocation] rule loaded successfully', {
          clientId: rule.clientId,
          clientName: rule.clientName,
          mode: rule.dockAllocationMode,
          docksCount: rule.clientDocks.length,
        });
      }
    } catch (err: any) {
      console.error('[DockAllocation] error loading allocation rule', err);
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

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Pestañas de navegación */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTabMode('calendar')}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${
                tabMode === 'calendar'
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <i className="ri-calendar-line mr-2 w-4 h-4 inline-flex items-center justify-center"></i>
              Calendario
            </button>
            {canManageStatuses && (
              <button
                onClick={() => setTabMode('statuses')}
                className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${
                  tabMode === 'statuses'
                    ? 'border-teal-600 text-teal-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <i className="ri-list-check mr-2 w-4 h-4 inline-flex items-center justify-center"></i>
                Estatus Op
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
      ) : (
        <>
          {/* Banner de modo selección */}
          {selectionMode && (
            <div className="bg-teal-600 text-white px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <i className="ri-cursor-line text-xl w-5 h-5 flex items-center justify-center"></i>
                <div>
                  <p className="font-semibold">Modo selección activo</p>
                  <p className="text-sm text-teal-100">
                    Seleccioná un espacio disponible en el calendario ({requiredMinutes} min requeridos)
                    {allocationRule && !allocationRule.allowAllDocks && (
                      <span className="ml-2">
                        — Cliente: {allocationRule.clientName} | Modo: {allocationRule.dockAllocationMode === 'ODD_FIRST' ? 'Intercalado' : 'Secuencial'} | Andenes habilitados: {enabledDockIds.size}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={handleExitSelectionMode}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg font-medium transition-colors whitespace-nowrap"
              >
                <i className="ri-close-line mr-2 w-4 h-4 inline-flex items-center justify-center"></i>
                Salir
              </button>
            </div>
          )}

          {/* ✅ NUEVO: Banner de error de reglas */}
          {selectionMode && allocationError && (
            <div className="bg-amber-500 text-white px-6 py-3 flex items-center gap-3">
              <i className="ri-alert-line text-xl w-5 h-5 flex items-center justify-center"></i>
              <div>
                <p className="font-semibold">Reglas no disponibles</p>
                <p className="text-sm text-amber-100">{allocationError}</p>
              </div>
            </div>
          )}

          {/* ✅ NUEVO: Banner de carga de reglas */}
          {selectionMode && allocationLoading && (
            <div className="bg-blue-500 text-white px-6 py-3 flex items-center gap-3">
              <i className="ri-loader-4-line text-xl w-5 h-5 flex items-center justify-center animate-spin"></i>
              <p className="font-medium">Cargando reglas de asignación de andenes...</p>
            </div>
          )}

          {/* Barra superior de controles */}
          <div className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
              <div className="flex items-center gap-4 flex-wrap">
                <button
                  onClick={goToToday}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-sm whitespace-nowrap"
                >
                  Hoy
                </button>

                <input
                  type="date"
                  value={anchorDate.toISOString().slice(0, 10)}
                  onChange={(e) => handlePickDate(e.target.value)}
                  className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />

                <div className="flex items-center gap-2">
                  <button onClick={goToPrevious} className="p-2 hover:bg-gray-100 rounded-lg">
                    <i className="ri-arrow-left-s-line text-xl w-5 h-5 flex items-center justify-center"></i>
                  </button>
                  <button onClick={goToNext} className="p-2 hover:bg-gray-100 rounded-lg">
                    <i className="ri-arrow-right-s-line text-xl w-5 h-5 flex items-center justify-center"></i>
                  </button>
                </div>

                <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => handleViewModeChange('1day')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                      rangeDays === 1 ? 'bg-white shadow-sm' : 'hover:bg-gray-200'
                    }`}
                  >
                    1 día
                  </button>
                  <button
                    onClick={() => handleViewModeChange('3days')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                      rangeDays === 3 ? 'bg-white shadow-sm' : 'hover:bg-gray-200'
                    }`}
                  >
                    3 días
                  </button>
                  <button
                    onClick={() => handleViewModeChange('7days')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                      rangeDays === 7 ? 'bg-white shadow-sm' : 'hover:bg-gray-200'
                    }`}
                  >
                    7 días
                  </button>
                </div>

                {/* Selector de almacén + Nueva Reserva */}
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                      warehouseLoading
                        ? 'bg-gray-100 text-gray-500'
                        : selectedWarehouse
                        ? 'bg-teal-50 text-teal-700'
                        : 'bg-blue-50 text-blue-700'
                    }`}
                  >
                    <i className="ri-building-2-line mr-2 w-4 h-4 flex items-center justify-center"></i>
                    {warehouseLoading
                      ? 'Cargando…'
                      : selectedWarehouse
                      ? `Almacén: ${selectedWarehouse.name}`
                      : 'Ver todos los andenes'}
                  </span>

                  <button
                    onClick={() => setWarehouseModalOpen(true)}
                    disabled={warehouseLoading}
                    className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 whitespace-nowrap font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Seleccionar Almacén
                  </button>

                  {canCreate && (
                    <button
                      onClick={() => setPreModalOpen(true)}
                      disabled={selectionMode}
                      className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Crear reserva"
                    >
                      <i className="ri-add-line mr-2 w-4 h-4 inline-flex items-center justify-center"></i>
                      Nueva Reserva
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 flex-wrap justify-end ml-auto">
                {/* ✅ CORREGIDO: Input de búsqueda de reservas */}
                <div className="flex-1 min-w-[320px] max-w-[520px]">
                  <input
                    type="text"
                    placeholder="Buscar por DUA, Factura o Chofer..."
                    value={reservationSearchTerm}
                    onChange={(e) => setReservationSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>

                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="shrink-0 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
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
                    className="shrink-0 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 font-medium whitespace-nowrap"
                  >
                    <i className="ri-lock-line mr-2 w-4 h-4 inline-flex items-center justify-center"></i>
                    Bloquear Tiempo
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 text-sm text-gray-600">
              Andenes visibles: {filteredDocks.length} | Mostrando {daysInView.length} días
              <span className="ml-3 text-gray-500">
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
                {/* Encabezado FIJO (días + andenes) */}
                <div className="flex-shrink-0 bg-white border-b border-gray-200">
                  <div className="flex">
                    {/* Espacio para columna de horas */}
                    <div className="w-20 flex-shrink-0 border-r border-gray-200"></div>

                    {/* Header scrolleable horizontalmente (sincronizado) */}
                    <div className="flex-1 overflow-hidden">
                      <div
                        ref={headerInnerRef}
                        style={{ width: totalWidth, minWidth: totalWidth }}
                        className="flex will-change-transform"
                      >
                        {daysInView.map((day) => (
                          <div
                            key={day.toISOString()}
                            className="flex-shrink-0 border-r border-gray-200"
                            style={{
                              width: `${filteredDocks.length * COL_W}px`,
                              minWidth: `${filteredDocks.length * COL_W}px`,
                            }}
                          >
                            <div className="h-12 flex items-center justify-center bg-gray-50 border-b border-gray-200">
                              <span className="font-semibold text-gray-900">{formatDayHeader(day)}</span>
                            </div>

                            <div className="flex h-12">
                              {filteredDocks.map((dock) => (
                                <div
                                  key={dock.id}
                                  className="flex-shrink-0 border-r border-gray-200 flex items-center justify-center px-2"
                                  style={{
                                    width: `${COL_W}px`,
                                    minWidth: `${COL_W}px`,
                                    backgroundColor: getCategoryColor(dock.category),
                                  }}
                                >
                                  <span className="font-medium text-sm text-gray-900 truncate">{dock.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* BODY: Único contenedor con scroll vertical + horizontal */}
                <div ref={bodyScrollRef} className="flex-1 h-full overflow-auto" onScroll={handleBodyScroll}>
                  <div className="flex" style={{ width: totalWidth, minWidth: totalWidth }}>
                    {/* Columna de horas (sticky left + z-30 para quedar arriba) */}
                    <div className="w-20 flex-shrink-0 bg-white border-r border-gray-200 sticky left-0 z-30 shadow-sm">
                      {timeSlots.map((slot) => (
                        <div
                          key={slot.label}
                          className="h-[60px] border-b border-gray-200 flex items-start justify-end pr-2 pt-1 text-xs text-gray-500"
                        >
                          {slot.label}
                        </div>
                      ))}
                    </div>

                    {/* Grid de días y andenes (z-10 para quedar debajo) */}
                    <div
                      className="flex-shrink-0"
                      style={{ width: `${totalWidth - 80}px`, minWidth: `${totalWidth - 80}px` }}
                    >
                      <div className="flex">
                        {daysInView.map((day) => {
                          // ✅ NUEVO: Calcular si este día es "hoy" y si debe mostrar el indicador
                          const isToday = isSameDayTz(day, nowTz, TIMEZONE);
                          const nowTop = isToday ? getTopFromBusinessStart(nowTz) : -1;
                          const maxHeight = (businessEndMinutes - businessStartMinutes) * PX_PER_MINUTE_DYNAMIC;
                          const shouldShowNowIndicator = isToday && nowTop >= 0 && nowTop <= maxHeight;

                          return (
                            <div
                              key={day.toISOString()}
                              className="flex-shrink-0 border-r border-gray-200 relative"
                              style={{
                                width: `${filteredDocks.length * COL_W}px`,
                                minWidth: `${filteredDocks.length * COL_W}px`,
                              }}
                            >
                              {/* ✅ NUEVO: Indicador de hora actual (NOW INDICATOR) */}
                              {shouldShowNowIndicator && (
                                <div
                                  className="absolute left-0 right-0 pointer-events-none z-40"
                                  style={{ top: `${nowTop}px` }}
                                >
                                  {/* Punto rojo al inicio */}
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
                                  {/* Línea roja horizontal */}
                                  <div
                                    className="absolute left-0 right-0"
                                    style={{
                                      height: '2px',
                                      backgroundColor: '#ef4444',
                                    }}
                                  />
                                </div>
                              )}

                              <div className="flex">
                                {filteredDocks.map((dock) => (
                                  <div
                                    key={dock.id}
                                    className="flex-shrink-0 border-r border-gray-200"
                                    style={{ width: `${COL_W}px`, minWidth: `${COL_W}px` }}
                                  >
                                    {/* CONTENEDOR RELATIVE PARA SUPERPONER */}
                                    <div className="relative">
                                      {/* CAPA GRID (ABAJO) - z-0 */}
                                      <div className="relative z-0">
                                        {timeSlots.map((slot) => {
                                          const eligible = selectionMode ? isSlotEligible(dock.id, day, slot) : false;
                                          const inSelectionMode = selectionMode;
                                          // ✅ NUEVO: Verificar si el dock está deshabilitado por reglas
                                          const dockDisabledByRule = inSelectionMode && enabledDockIds.size > 0 && !enabledDockIds.has(dock.id);
                                          const dockBlockedByError = inSelectionMode && allocationError && enabledDockIds.size === 0;

                                          return (
                                            <div
                                              key={slot.label}
                                              className={`h-[60px] border-b border-gray-100 transition-colors ${
                                                inSelectionMode
                                                  ? eligible
                                                    ? 'hover:bg-teal-50 cursor-pointer border-teal-200'
                                                    : dockDisabledByRule || dockBlockedByError
                                                    ? 'bg-red-50/40 cursor-not-allowed'
                                                    : 'bg-gray-100/50 cursor-not-allowed'
                                                  : 'hover:bg-gray-50 cursor-pointer'
                                              }`}
                                              onClick={(e) => handleCellClick(e, dock.id, day, slot)}
                                              onDragOver={handleDragOver}
                                              onDrop={(e) => handleDrop(e, dock.id, day, slot)}
                                            />
                                          );
                                        })}
                                      </div>

                                      {/* CAPA OVERLAY (ARRIBA) - z-20 */}
                                      <div className="absolute inset-0 z-20 pointer-events-none">
                                        {/* ✅ CORREGIDO: Renderizar RESERVAS filtradas */}
                                        {filteredReservations
                                          .filter((r) => {
                                            if (r.dock_id !== dock.id) return false;
                                            const rStart = new Date(r.start_datetime);
                                            return rStart.toDateString() === day.toDateString();
                                          })
                                          .map((reservation) => {
                                            const start = new Date(reservation.start_datetime);
                                            const end = new Date(reservation.end_datetime);

                                            const clamped = clampEventToBusinessHours(day, start, end);
                                            if (!clamped) return null;

                                            const { top, height } = clamped;

                                            return (
                                              <div
                                                key={reservation.id}
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
                                                  // ✅ En modo selección, NO abrir modal de edición
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
                                                className={`absolute left-1 right-1 rounded-lg border-l-4 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden pointer-events-auto ${
                                                  selectionMode ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                                                }`}
                                                style={{
                                                  top: `${top}px`,
                                                  height: `${height}px`,
                                                  borderLeftColor: reservation.status?.color || '#6B7280',
                                                  minHeight: '40px',
                                                }}
                                              >
                                                <div className="p-2 h-full flex flex-col justify-between text-xs">
                                                  <div>
                                                    <div className="font-semibold text-gray-900 truncate">
                                                      #{reservation.id.slice(0, 8)}
                                                    </div>
                                                    <div className="text-gray-600 truncate">{reservation.driver}</div>
                                                    <div className="text-gray-500 truncate text-[10px]">
                                                      DUA: {reservation.dua}
                                                    </div>
                                                  </div>
                                                  <div className="flex items-center justify-between mt-1">
                                                    <span
                                                      className="px-2 py-0.5 rounded text-[10px] font-medium text-white"
                                                      style={{ backgroundColor: reservation.status?.color || '#6B7280' }}
                                                    >
                                                      {reservation.status?.name || 'Sin estado'}
                                                    </span>
                                                    <span className="text-[10px] text-gray-500">
                                                      {start.getHours().toString().padStart(2, '0')}:
                                                      {start.getMinutes().toString().padStart(2, '0')}
                                                    </span>
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}

                                        {/* Renderizar BLOQUES (sin cambios) */}
                                        {blocks
                                          .filter((b) => {
                                            if (b.dock_id !== dock.id) return false;
                                            const bStart = new Date(b.start_datetime);
                                            return bStart.toDateString() === day.toDateString();
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
                                                  // ✅ En modo selección, NO abrir modal de bloque
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
                                                className={`absolute left-1 right-1 rounded-lg bg-gray-400 text-white shadow-sm overflow-hidden pointer-events-auto ${
                                                  selectionMode ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                                                }`}
                                                style={{
                                                  top: `${top}px`,
                                                  height: `${height}px`,
                                                  minHeight: '40px',
                                                }}
                                              >
                                                <div className="p-2 h-full flex flex-col justify-center text-xs">
                                                  <div className="font-semibold">Bloqueado</div>
                                                  <div className="text-[10px] opacity-90 truncate">{block.reason}</div>
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
            statuses={statuses}
            orgId={orgId!}
            onClose={() => {
              setReserveModalOpen(false);
              setSelectedReservation(null);
              setReserveModalSlot(null);
            }}
            onSave={async () => {
              setReserveModalOpen(false);
              setSelectedReservation(null);
              setReserveModalSlot(null);
              cacheRef.current.clear();
              await loadData();
            }}
          />

          {isBlockModalOpen && (
            <BlockModal
              block={selectedBlock}
              docks={docks}
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
                {/* Opción "Ver todos" */}
                <button
                  onClick={() => handleWarehouseSelect(null)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    warehouseId === null
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">Ver todos los andenes</h3>
                        {warehouseId === null && <i className="ri-check-line text-blue-600 w-5 h-5 flex items-center justify-center"></i>}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        Muestra los andenes de todos los almacenes sin filtrar
                      </p>
                    </div>
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center ml-4">
                      <i className="ri-stack-line text-xl text-blue-600 w-5 h-5 flex items-center justify-center"></i>
                    </div>
                  </div>
                </button>

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