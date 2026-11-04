import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { supabase } from '../../lib/supabase';
import { usePermissions } from '../../hooks/usePermissions';
import { useUserScope } from '../../hooks/useUserScope';
import { useActiveWarehouse } from '../../contexts/ActiveWarehouseContext';
import { proceso3dService, type Proceso3DData } from '../../services/proceso3dService';
import type { Reservation } from '../../services/calendarService';
import WarehouseScene, { type CameraPreset, type CameraRequest } from './components/WarehouseScene';
import type { UnloadVisual } from './components/Workforce';
import type { TruckVisual } from './components/Truck3D';
import type { DockVisual } from './components/WarehouseSite';
import { buildLayout, buildRoute, type Pose } from './lib/layout';
import { isStaleWithoutExit, livePhase, PHASE_META, PHASE_ORDER, replayPhase, type TruckPhase } from './lib/phases';
import { buildPlan, samePose, type PlanItem } from './lib/plan';
import { crewFor, dockActivity, isLooseCargo, resolveCargo, STAGE_META, unitLabel, type Crew, type DockActivity } from './lib/unloading';
import { ALERT_RED_MIN, ALERT_YELLOW_MIN, truckAlert, type TruckAlert } from './lib/alerts';
import { appoloConfigured } from '../../services/appoloOpsService';
import {
  allocateEquipment,
  buildDispatchPlan,
  buildPutaways,
  demoSnapshot,
  dispatchAlert,
  dispatchPallets,
  equipmentTotals,
  isAppoloId,
  lotStats,
  mapDispatchDoors,
  type DispatchItem,
  type EquipmentUse,
} from './lib/appolo';
import { useAppoloSnapshot, useDispatchTrucks, type AppoloMode } from './useAppolo';
import { AppoloStatusBadge, AppoloSummary, DispatchCard } from './components/AppoloPanel';
import type { DispatchLoadVisual, PutawayVisual } from './components/AppoloOps';
import { UNLOADED } from './lib/phases';

type Mode = 'live' | 'replay';

const DEFAULT_TZ = 'America/Costa_Rica';
const MIN = 60_000;
const SPEEDS = [
  { label: '1 min/s', value: 1 },
  { label: '5 min/s', value: 5 },
  { label: '15 min/s', value: 15 },
  { label: '30 min/s', value: 30 },
];
const OPERATION_LABELS: Record<string, string> = {
  distribucion: 'Distribución',
  almacen: 'Almacén',
  zona_franca: 'Zona franca',
};

function todayIn(tz: string) {
  return formatInTimeZone(new Date(), tz, 'yyyy-MM-dd');
}

export default function Proceso3DPage() {
  const { can, orgId, loading: permLoading } = usePermissions();
  const { allowedWarehouseIds, allowedClientIds, loading: scopeLoading } = useUserScope();
  const {
    allowedWarehouses,
    activeWarehouseId,
    activeWarehouse,
    setActiveWarehouseId,
    loading: whLoading,
  } = useActiveWarehouse();

  const tz = activeWarehouse?.timezone || DEFAULT_TZ;
  const [date, setDate] = useState(() => todayIn(tz));
  const isToday = date === todayIn(tz);
  const [mode, setMode] = useState<Mode>('live');
  const [data, setData] = useState<Proceso3DData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [simTime, setSimTime] = useState<number>(() => Date.now());
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(5);
  const [showLabels, setShowLabels] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<TruckPhase | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraRequest>({ name: 'general', nonce: 0 });
  const [cutaway, setCutaway] = useState(false);
  /** Camión cuya descarga se simula en 3D aunque no esté descargando en este momento */
  const [simulateId, setSimulateId] = useState<string | null>(null);
  const sceneBoxRef = useRef<HTMLDivElement>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<'ok' | 'retry' | 'off'>('off');
  const [isFullscreen, setIsFullscreen] = useState(false);
  // AppOLO (despachos y acomodo): solo lectura, se puede apagar sin afectar el resto
  const [appoloMode, setAppoloMode] = useState<AppoloMode>(() => (appoloConfigured() ? 'live' : 'off'));
  const [demoAnchor, setDemoAnchor] = useState(() => Date.now());

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === sceneBoxRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = sceneBoxRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen?.().catch(() => {});
  }, []);
  const [visuals, setVisuals] = useState<Map<string, TruckVisual>>(new Map());

  const snapRef = useRef(true);
  const yardSlotsRef = useRef(new Map<string, number>());
  const positionsRef = useRef(new Map<string, Pose>());

  const dayStart = useMemo(() => fromZonedTime(`${date}T00:00:00`, tz).getTime(), [date, tz]);
  const dayEnd = dayStart + 24 * 60 * MIN;

  // El usuario eligió una fecha distinta a hoy → recorrido del día
  useEffect(() => {
    if (date !== todayIn(tz)) setMode('replay');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // Cambio de día (medianoche) o de zona horaria del almacén: si se estaba viendo "hoy"
  // en vivo, seguir al nuevo día en lugar de quedarse congelado en el anterior.
  const today = todayIn(tz);
  const lastTodayRef = useRef(today);
  useEffect(() => {
    const prev = lastTodayRef.current;
    if (prev === today) return;
    lastTodayRef.current = today;
    if (mode === 'live' && date === prev) setDate(today);
  }, [today, date, mode]);

  // Al cambiar de día se descartan los datos anteriores (el recorrido arranca con los del día nuevo)
  useEffect(() => {
    setData(null);
  }, [dayStart]);

  /* ─────────────────────────────── Carga de datos ─────────────────────────────── */

  const loadSeq = useRef(0);
  const load = useCallback(
    async (silent = false) => {
      if (!orgId || scopeLoading || whLoading) return;
      const seq = ++loadSeq.current;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const tzMap = new Map(allowedWarehouses.map((w) => [w.id, w.timezone]));
        // Margen de 12 h antes para incluir camiones que llegaron el día anterior y siguen en sitio
        const result = await proceso3dService.load({
          orgId,
          warehouseId: activeWarehouseId,
          startISO: new Date(dayStart - 12 * 60 * MIN).toISOString(),
          endISO: new Date(dayEnd).toISOString(),
          allowedWarehouseIds,
          allowedClientIds,
          warehouseTimezoneMap: tzMap,
        });
        if (seq !== loadSeq.current) return;
        setData(result);
        setNow(Date.now());
      } catch (e: any) {
        if (seq === loadSeq.current) setError(e?.message || 'No se pudieron cargar los datos');
      } finally {
        if (seq === loadSeq.current) setLoading(false);
      }
    },
    [orgId, scopeLoading, whLoading, activeWarehouseId, allowedWarehouses, allowedWarehouseIds, allowedClientIds, dayStart, dayEnd]
  );

  useEffect(() => {
    snapRef.current = true;
    yardSlotsRef.current.clear();
    load();
  }, [load]);

  // Tiempo real: cambios en citas o en casetilla recargan (solo para hoy)
  const loadRef = useRef(load);
  loadRef.current = load;
  // Andenes y citas en pantalla: solo los eventos que los afectan provocan una recarga
  const inViewRef = useRef({ docks: new Set<string>(), reservations: new Set<string>() });
  inViewRef.current = {
    docks: new Set((data?.docks ?? []).map((d) => d.id)),
    reservations: new Set((data?.reservations ?? []).map((r) => r.id)),
  };
  const realtimeOkRef = useRef(false);
  realtimeOkRef.current = realtimeStatus === 'ok';
  useEffect(() => {
    if (!orgId || !isToday) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => loadRef.current(true), 1500);
    };
    const trigger = (payload: any) => {
      const row = payload?.new && Object.keys(payload.new).length ? payload.new : payload?.old;
      if (row?.org_id && row.org_id !== orgId) return;
      const view = inViewRef.current;
      if (row?.dock_id !== undefined) {
        // reservations: nueva/cambiada en un andén visible (o que salió de uno)
        const oldDock = payload?.old?.dock_id;
        if (!view.docks.has(row.dock_id) && !(oldDock && view.docks.has(oldDock))) return;
      } else if (row?.reservation_id !== undefined) {
        // casetilla: solo citas cargadas
        if (!view.reservations.has(row.reservation_id)) return;
      }
      schedule();
    };
    const channel = supabase
      .channel(`proceso3d_rt_${orgId}_${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, trigger)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'casetilla_ingresos' }, trigger)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'casetilla_salidas' }, trigger)
      .subscribe((status) => setRealtimeStatus(status === 'SUBSCRIBED' ? 'ok' : status === 'CLOSED' ? 'off' : 'retry'));
    // Respaldo por si se pierde algún evento: cada minuto si el tiempo real está caído,
    // cada 5 minutos si está conectado; nada mientras la pestaña está oculta.
    let ticks = 0;
    const poll = setInterval(() => {
      if (document.hidden) return;
      ticks += 1;
      if (!realtimeOkRef.current || ticks % 5 === 0) loadRef.current(true);
    }, 60_000);
    // Al volver a la pestaña, ponerse al día de inmediato
    const onVisible = () => {
      if (!document.hidden) schedule();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
      setRealtimeStatus('off');
    };
  }, [orgId, isToday]);

  // Reloj en vivo
  useEffect(() => {
    if (mode !== 'live') return;
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, [mode]);

  /* ─────────────────────────────── Reloj del recorrido ─────────────────────────────── */

  const replayMax = isToday ? Math.min(dayEnd, now + 4 * 60 * MIN) : dayEnd;

  // Al entrar a recorrido, arrancar desde el primer movimiento del día
  useEffect(() => {
    if (mode !== 'replay' || !data) return;
    const first = data.reservations
      .map((r) => new Date(data.gateTimes.get(r.id)?.ingresoAt ?? r.start_datetime).getTime())
      .filter((t) => t >= dayStart)
      .sort((a, b) => a - b)[0];
    snapRef.current = true;
    setSimTime(Math.max(dayStart, (first ?? dayStart + 6 * 60 * MIN) - 45 * MIN));
    setPlaying(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, date, data === null]);

  useEffect(() => {
    if (mode !== 'replay' || !playing) return;
    let last = performance.now();
    const id = setInterval(() => {
      const t = performance.now();
      const dt = (t - last) / 1000;
      last = t;
      setSimTime((prev) => {
        const next = prev + dt * speed * MIN;
        if (next >= replayMax) {
          setPlaying(false);
          return replayMax;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [mode, playing, speed, replayMax]);

  /* ─────────────────────────────── Plan y visuales ─────────────────────────────── */

  const sroDockInputs = useMemo(() => {
    const catById = new Map((data?.categories ?? []).map((c) => [c.id, c.name]));
    return (data?.docks ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      categoryName: d.category?.name ?? (d.category_id ? catById.get(d.category_id) : null),
    }));
  }, [data?.docks, data?.categories]);

  /* ─────────────────────────────── AppOLO ─────────────────────────────── */

  const demoSnap = useMemo(() => {
    if (appoloMode !== 'demo' || !data) return null;
    const discharged = data.reservations
      .filter((r) => UNLOADED.has((r.status?.code ?? '').toUpperCase()))
      .map((r) => ({ reservaId: r.id, bultos: r.quantity_value ?? null }));
    return demoSnapshot(sroDockInputs, discharged, demoAnchor);
  }, [appoloMode, data, sroDockInputs, demoAnchor]);

  const appolo = useAppoloSnapshot({
    mode: appoloMode,
    warehouseId: activeWarehouseId,
    date,
    tz,
    isToday,
    demo: demoSnap,
  });

  const doorMap = useMemo(() => mapDispatchDoors(sroDockInputs, appolo.snapshot), [sroDockInputs, appolo.snapshot]);
  // El edificio solo se rearma si cambian las puertas, no en cada actualización de AppOLO
  const extraDocksKey = doorMap.extraDocks.map((d) => `${d.id}=${d.name}`).join('|');
  const extraDocks = useMemo(
    () => doorMap.extraDocks,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [extraDocksKey]
  );

  const layout = useMemo(() => buildLayout([...sroDockInputs, ...extraDocks]), [sroDockInputs, extraDocks]);

  // Si aparecen o desaparecen puertas de despacho, los camiones se reubican sin animar
  useEffect(() => {
    snapRef.current = true;
  }, [extraDocksKey]);

  const currentTime = mode === 'live' ? now : simTime;

  const plan: PlanItem[] = useMemo(() => {
    if (!data) return [];
    const phaseOf =
      mode === 'live'
        ? (r: Reservation) => livePhase(r, data.gateTimes.get(r.id), now)
        : (r: Reservation) => replayPhase(r, data.gateTimes.get(r.id), simTime, now, data.statusHistory.get(r.id));
    // Solo citas del día elegido, más las de la víspera que siguen en sitio
    const relevant = data.reservations.filter((r) => {
      const start = new Date(r.start_datetime).getTime();
      if (start >= dayStart) return true;
      const ph = phaseOf(r);
      return ph === 'PATIO' || ph === 'EN_ANDEN' || ph === 'POR_SALIR' || ph === 'SALIENDO';
    });
    return buildPlan(relevant, phaseOf, data.gateTimes, layout, yardSlotsRef.current);
  }, [data, mode, now, simTime, layout, dayStart]);

  const reservationById = useMemo(() => new Map((data?.reservations ?? []).map((r) => [r.id, r])), [data]);

  // Diferenciar el plan contra lo que ya está dibujado → rutas animadas
  useEffect(() => {
    const snap = snapRef.current;
    snapRef.current = false;
    setVisuals((prev) => {
      const next = new Map(prev);
      let changed = false;
      const inPlan = new Set<string>();
      for (const item of plan) {
        inPlan.add(item.id);
        const r = reservationById.get(item.id);
        if (!r) continue;
        const old = prev.get(item.id);
        const base = {
          id: item.id,
          plate: r.truck_plate || r.driver || 'Sin placa',
          statusColor: r.status?.color || PHASE_META[item.phase].color,
          statusName: r.status?.name || PHASE_META[item.phase].label,
        };
        if (item.pose) {
          if (!old) {
            next.set(item.id, { ...base, pose: item.pose, route: snap ? [] : buildRoute(layout, null, item.pose), routeVersion: 1 });
            changed = true;
          } else if (!samePose(old.pose, item.pose)) {
            const from = positionsRef.current.get(item.id) ?? old.pose;
            next.set(item.id, {
              ...base,
              pose: item.pose,
              route: snap ? [] : buildRoute(layout, from, item.pose),
              routeVersion: old.routeVersion + 1,
            });
            changed = true;
          } else if (old.statusColor !== base.statusColor || old.statusName !== base.statusName || old.plate !== base.plate) {
            next.set(item.id, { ...old, ...base });
            changed = true;
          }
        } else if (old && old.pose) {
          const from = positionsRef.current.get(item.id) ?? old.pose;
          const leavesSite = item.phase === 'FINALIZADO' || item.phase === 'SALIENDO';
          if (snap || !leavesSite) {
            next.delete(item.id);
          } else {
            next.set(item.id, { ...old, ...base, pose: null, route: buildRoute(layout, from, null, true), routeVersion: old.routeVersion + 1 });
          }
          changed = true;
        }
      }
      for (const id of prev.keys()) {
        if (!inPlan.has(id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [plan, layout, reservationById]);

  const handleGone = useCallback((id: string) => {
    setVisuals((prev) => {
      const v = prev.get(id);
      if (!v || v.pose) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const truckList = useMemo(() => [...visuals.values()], [visuals]);


  /* ─────────────────────────────── Descargas en andén ─────────────────────────────── */

  const dockActivities = useMemo(() => {
    const out = new Map<string, { activity: DockActivity; crew: Crew; x: number; loose: boolean }>();
    if (!data) return out;
    const dockById = new Map(data.docks.map((d) => [d.id, d]));
    for (const p of plan) {
      if (p.phase !== 'EN_ANDEN' || p.conflict || !p.pose) continue;
      const r = reservationById.get(p.id);
      const slot = r ? layout.docks.get(r.dock_id) : undefined;
      if (!r || !slot) continue;
      const cargo = resolveCargo(r, data.cargoTypes);
      const activity = dockActivity(r, data.gateTimes.get(r.id), data.statusHistory.get(r.id), currentTime, now, cargo);
      const crew = crewFor(r, dockById.get(r.dock_id)?.warehouse_id ?? activeWarehouseId, data.crewRules, cargo);
      out.set(p.id, { activity, crew, x: slot.x, loose: isLooseCargo(cargo) });
    }
    return out;
  }, [data, plan, reservationById, layout, currentTime, now, activeWarehouseId]);

  const unloads: UnloadVisual[] = useMemo(
    () =>
      [...dockActivities.entries()].map(([id, a]) => {
        const demo = id === simulateId && a.activity.stage !== 'DESCARGANDO';
        return {
          truckId: id,
          dockId: reservationById.get(id)!.dock_id,
          x: a.x,
          stage: demo ? 'DESCARGANDO' : a.activity.stage,
          // el avance se redondea para no redibujar la carga en cada tic del reloj
          progress: Math.round(a.activity.progress * 40) / 40,
          mix: a.crew.mix,
          loose: a.loose,
          demo,
        };
      }),
    [dockActivities, reservationById, simulateId]
  );

  /* ─────────────────────────────── AppOLO en la escena ─────────────────────────────── */

  const lotSlotsRef = useRef(new Map<string, number>());
  const sroOccupied = useMemo(
    () => new Set(plan.filter((p) => p.phase === 'EN_ANDEN' && !p.conflict).map((p) => reservationById.get(p.id)?.dock_id ?? '')),
    [plan, reservationById]
  );

  const dispatchItems: DispatchItem[] = useMemo(
    () => buildDispatchPlan(appolo.snapshot, doorMap, layout, sroOccupied, currentTime, mode === 'live', lotSlotsRef.current),
    [appolo.snapshot, doorMap, layout, sroOccupied, currentTime, mode]
  );

  const putawayItems = useMemo(
    () => buildPutaways(appolo.snapshot, layout, (id) => reservationById.get(id)?.dock_id ?? null, sroDockInputs, currentTime),
    [appolo.snapshot, layout, reservationById, sroDockInputs, currentTime]
  );

  const dispatchTrucks = useDispatchTrucks({
    items: dispatchItems,
    layout,
    positions: positionsRef.current,
    snap: mode === 'replay' && !playing,
  });

  // Equipos activos de AppOLO repartidos entre cargas y acomodos visibles
  const equipmentUse = useMemo(() => {
    const needs: { id: string; want: EquipmentUse }[] = [];
    for (const it of dispatchItems)
      if (it.pose && it.stage === 'CARGANDO') needs.push({ id: it.id, want: { montacargas: 1, apilador: 0, carretilla: 2 } });
    for (const p of putawayItems) needs.push({ id: `put:${p.id}`, want: { montacargas: 1, apilador: 1, carretilla: 0 } });
    for (const it of dispatchItems)
      if (it.pose && it.stage === 'PREPARANDO') needs.push({ id: it.id, want: { montacargas: 0, apilador: 1, carretilla: 0 } });
    return allocateEquipment(appolo.snapshot?.equipment, needs);
  }, [dispatchItems, putawayItems, appolo.snapshot]);

  const loadings: DispatchLoadVisual[] = useMemo(
    () =>
      dispatchItems
        .filter((it) => it.pose && !it.inLot && it.dockId && layout.docks.has(it.dockId))
        .map((it) => ({
          truckId: it.id,
          x: layout.docks.get(it.dockId!)!.x,
          stage: it.stage,
          // redondeado para no redibujar la carga en cada tic del reloj
          progress: Math.round(it.progress * 48) / 48,
          total: dispatchPallets(it.dispatch),
          cells: it.cells,
          equip: equipmentUse.get(it.id) ?? { montacargas: 0, apilador: 0, carretilla: 1 },
        })),
    [dispatchItems, layout, equipmentUse]
  );

  const putaways: PutawayVisual[] = useMemo(
    () =>
      putawayItems.map((p) => ({
        id: p.id,
        x: p.x,
        progress: Math.round(p.progress * 40) / 40,
        pallets: p.pallets,
        equip: equipmentUse.get(`put:${p.id}`) ?? { montacargas: 0, apilador: 0, carretilla: 0 },
      })),
    [putawayItems, equipmentUse]
  );

  const lotInfo = useMemo(() => lotStats(dispatchItems, currentTime), [dispatchItems, currentTime]);
  const putawayDocks = useMemo(() => new Set(putawayItems.map((p) => p.dockId)), [putawayItems]);
  const sceneUnloads = useMemo(
    () => (putawayDocks.size ? unloads.map((u) => (putawayDocks.has(u.dockId) ? { ...u, putawayExternal: true } : u)) : unloads),
    [unloads, putawayDocks]
  );

  const sceneTrucks = useMemo(
    () => (dispatchTrucks.visuals.size ? [...truckList, ...dispatchTrucks.visuals.values()] : truckList),
    [truckList, dispatchTrucks.visuals]
  );
  const dispatchGone = dispatchTrucks.onGone;
  const handleSceneGone = useCallback(
    (id: string) => (isAppoloId(id) ? dispatchGone(id) : handleGone(id)),
    [dispatchGone, handleGone]
  );

  const dockVisuals: DockVisual[] = useMemo(() => {
    if (!data) return [];
    const occupied = new Set(
      plan.filter((p) => p.phase === 'EN_ANDEN' && !p.conflict).map((p) => reservationById.get(p.id)?.dock_id)
    );
    for (const it of dispatchItems) if (it.pose && !it.inLot && it.dockId) occupied.add(it.dockId);
    const catById = new Map(data.categories.map((c) => [c.id, c]));
    const sro = data.docks.map((d) => {
      const cat = d.category ?? (d.category_id ? catById.get(d.category_id) : undefined);
      return {
        id: d.id,
        name: d.name,
        categoryColor: cat?.color || '#0d9488',
        categoryName: cat?.name || 'Sin categoría',
        blocked: !!d.status?.is_blocking,
        occupied: occupied.has(d.id),
      };
    });
    if (!extraDocks.length) return sro;
    const despachoCat = data.categories.find((c) => /despacho|dispatch/i.test(c.name));
    return [
      ...sro,
      ...extraDocks.map((d) => ({
        id: d.id,
        name: d.name,
        categoryColor: despachoCat?.color || '#2563eb',
        categoryName: d.categoryName || 'Despacho',
        blocked: false,
        occupied: occupied.has(d.id),
      })),
    ];
  }, [data, plan, reservationById, dispatchItems, extraDocks]);

  // Nubes de alerta: tiempo esperando salida, andén o cuadrilla (y despachos esperando chofer / validación)
  const alerts = useMemo(() => {
    const out = new Map<string, TruckAlert>();
    if (!data) return out;
    for (const p of plan) {
      if (!p.pose) continue;
      const r = reservationById.get(p.id);
      if (!r) continue;
      const stage = dockActivities.get(p.id)?.activity.stage;
      const a = truckAlert(r, p.phase, stage, data.gateTimes.get(r.id), data.statusHistory.get(r.id), currentTime);
      if (a) out.set(p.id, a);
    }
    for (const it of dispatchItems) {
      const a = dispatchAlert(it);
      if (a && a.since <= currentTime) out.set(it.id, a);
    }
    return out;
  }, [data, plan, reservationById, dockActivities, currentTime, dispatchItems]);

  const alertCounts = useMemo(() => {
    let yellow = 0;
    let red = 0;
    for (const a of alerts.values()) {
      const min = (currentTime - a.since) / MIN;
      if (min >= ALERT_RED_MIN) red++;
      else if (min >= ALERT_YELLOW_MIN) yellow++;
    }
    return { yellow, red };
  }, [alerts, currentTime]);

  const stageCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of dockActivities.values()) c[a.activity.stage] = (c[a.activity.stage] ?? 0) + 1;
    return c;
  }, [dockActivities]);

  const goToCamera = useCallback((name: CameraPreset, focusX?: number) => {
    if (name === 'interior' || name === 'descarga') setCutaway(true);
    setCameraPreset((p) => ({ name, nonce: p.nonce + 1, focusX }));
  }, []);

  /* ─────────────────────────────── Panel lateral ─────────────────────────────── */

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of plan) c[p.phase] = (c[p.phase] ?? 0) + 1;
    return c;
  }, [plan]);

  const dockName = useCallback((id: string) => data?.docks.find((d) => d.id === id)?.name ?? '—', [data]);
  const fmt = useCallback((iso?: string | null) => (iso ? formatInTimeZone(new Date(iso), tz, 'HH:mm') : '—'), [tz]);

  const listItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return plan
      .filter((p) => phaseFilter === 'ALL' || p.phase === phaseFilter)
      .map((p) => ({ plan: p, r: reservationById.get(p.id)! }))
      .filter(({ r }) => {
        if (!r) return false;
        if (!q) return true;
        const provider = r.shipper_provider ? data?.providerNames.get(r.shipper_provider) ?? '' : '';
        return [r.truck_plate, r.driver, r.dua, r.purchase_order, provider, dockName(r.dock_id)]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      })
      .sort(
        (a, b) =>
          PHASE_ORDER.indexOf(a.plan.phase) - PHASE_ORDER.indexOf(b.plan.phase) ||
          a.r.start_datetime.localeCompare(b.r.start_datetime)
      );
  }, [plan, phaseFilter, search, reservationById, data, dockName]);

  const selected = selectedId ? reservationById.get(selectedId) : undefined;
  const selectedDispatch = isAppoloId(selectedId) ? dispatchItems.find((i) => i.id === selectedId) : undefined;
  const dispatchDockName = (it: DispatchItem) =>
    it.dockId ? dockVisuals.find((d) => d.id === it.dockId)?.name ?? '' : '';
  const viewDispatch = (it: DispatchItem) => {
    setSelectedId(it.id);
    const x = it.dockId ? layout.docks.get(it.dockId)?.x : undefined;
    if (it.inLot) goToCamera('esperaDespacho');
    else if (x !== undefined && it.pose) goToCamera('descarga', x);
  };
  const selectedPlan = selectedId ? plan.find((p) => p.id === selectedId) : undefined;
  const selectedGate = selectedId ? data?.gateTimes.get(selectedId) : undefined;
  const selectedActivity = selectedId ? dockActivities.get(selectedId) : undefined;
  const selectedCargo = selected && data ? resolveCargo(selected, data.cargoTypes) : undefined;

  /* ─────────────────────────────── Render ─────────────────────────────── */

  if (permLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <i className="ri-loader-4-line text-3xl text-teal-600 animate-spin"></i>
      </div>
    );
  }

  if (!can('proceso3d.view')) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="ri-lock-line text-3xl text-red-600"></i>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Acceso Denegado</h2>
          <p className="text-gray-600">No tienes permisos para acceder al módulo Proceso 3D.</p>
        </div>
      </div>
    );
  }

  const needsWarehouse = !activeWarehouseId && allowedWarehouses.length > 1;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        {/* Encabezado */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Proceso 3D</h1>
            <p className="text-gray-600 text-sm">
              Simulación del almacén: dónde está cada camión según el estado de su cita.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {allowedWarehouses.length > 1 && (
              <select
                value={activeWarehouseId ?? ''}
                onChange={(e) => setActiveWarehouseId(e.target.value || null)}
                className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm"
              >
                <option value="">Seleccioná un almacén…</option>
                {allowedWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm"
            />
            <div className="flex h-9 rounded-lg border border-gray-300 bg-white p-0.5 text-sm">
              <button
                disabled={!isToday}
                onClick={() => {
                  snapRef.current = true;
                  setMode('live');
                }}
                className={`rounded-md px-3 whitespace-nowrap ${mode === 'live' ? 'bg-teal-600 text-white' : 'text-gray-700'} ${
                  !isToday ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                }`}
                title={isToday ? 'Estado actual de cada cita' : 'Solo disponible para hoy'}
              >
                <i className="ri-live-line mr-1"></i>En vivo
              </button>
              <button
                onClick={() => setMode('replay')}
                className={`rounded-md px-3 whitespace-nowrap cursor-pointer ${mode === 'replay' ? 'bg-teal-600 text-white' : 'text-gray-700'}`}
              >
                <i className="ri-history-line mr-1"></i>Recorrido del día
              </button>
            </div>
            <button
              onClick={() => load()}
              className="h-9 w-9 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 cursor-pointer"
              title="Recargar"
            >
              <i className={`ri-refresh-line ${loading ? 'animate-spin inline-block' : ''}`}></i>
            </button>
          </div>
        </div>

        {/* Resumen por fase */}
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2 mb-4">
          {PHASE_ORDER.map((ph) => {
            const meta = PHASE_META[ph];
            const active = phaseFilter === ph;
            return (
              <button
                key={ph}
                onClick={() => setPhaseFilter(active ? 'ALL' : ph)}
                className={`flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-left cursor-pointer transition ${
                  active ? 'border-teal-500 ring-2 ring-teal-100' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white" style={{ backgroundColor: meta.color }}>
                  <i className={meta.icon}></i>
                </span>
                <span className="min-w-0">
                  <span className="block text-lg font-bold leading-none text-gray-900">{counts[ph] ?? 0}</span>
                  <span className="block truncate text-[11px] text-gray-500">{meta.label}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
          {/* Escena 3D */}
          <div
            ref={sceneBoxRef}
            className={`relative overflow-hidden bg-white ${isFullscreen ? 'flex h-screen w-screen flex-col' : 'rounded-lg border border-gray-200'}`}
          >
            <div className={isFullscreen ? 'min-h-0 flex-1' : 'h-[62vh] min-h-[420px]'}>
              {needsWarehouse ? (
                <div className="flex h-full items-center justify-center text-gray-500">
                  <div className="text-center">
                    <i className="ri-building-2-line text-4xl text-gray-300"></i>
                    <p className="mt-2 text-sm">Seleccioná un almacén para ver su simulación.</p>
                  </div>
                </div>
              ) : data && data.docks.length === 0 && !loading ? (
                <div className="flex h-full items-center justify-center text-gray-500 text-sm">
                  Este almacén no tiene andenes visibles para tu usuario.
                </div>
              ) : (
                <WarehouseScene
                  layout={layout}
                  docks={dockVisuals}
                  trucks={sceneTrucks}
                  unloads={sceneUnloads}
                  loadings={loadings}
                  putaways={putaways}
                  dispatchLot={appoloMode !== 'off' ? lotInfo : undefined}
                  cutaway={cutaway}
                  selectedId={selectedId}
                  highlightDockId={selected?.dock_id ?? selectedDispatch?.dockId ?? null}
                  showLabels={showLabels}
                  truckSpeed={mode === 'replay' ? 18 + speed * 2 : 18}
                  warehouseName={activeWarehouse?.name}
                  cameraPreset={cameraPreset}
                  onSelect={setSelectedId}
                  onGone={handleSceneGone}
                  positions={positionsRef.current}
                  alerts={alerts}
                  alertClock={mode === 'live' ? null : simTime}
                />
              )}
            </div>

            {/* Controles flotantes */}
            <div className="absolute left-3 top-3 flex flex-wrap gap-1">
              {(
                [
                  ['general', 'Vista general', 'ri-earth-line'],
                  ['entrada', 'Entrada', 'ri-door-open-line'],
                  ['frente', 'Frente', 'ri-building-2-line'],
                  ['despacho', 'Patio espera', 'ri-parking-box-line'],
                  ['andenes', 'Andenes', 'ri-truck-line'],
                  ['interior', 'Interior', 'ri-layout-grid-line'],
                ] as [CameraPreset, string, string][]
              ).map(([name, label, icon]) => (
                <button
                  key={name}
                  onClick={() => goToCamera(name)}
                  className="rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-gray-700 shadow hover:bg-white cursor-pointer"
                >
                  <i className={`${icon} mr-1`}></i>
                  {label}
                </button>
              ))}
              <button
                onClick={() => setShowLabels((v) => !v)}
                className={`rounded-md px-2 py-1 text-xs font-medium shadow cursor-pointer ${showLabels ? 'bg-teal-600 text-white' : 'bg-white/90 text-gray-700'}`}
              >
                <i className="ri-price-tag-3-line mr-1"></i>Etiquetas
              </button>
              <button
                onClick={() => setCutaway((v) => !v)}
                className={`rounded-md px-2 py-1 text-xs font-medium shadow cursor-pointer ${cutaway ? 'bg-teal-600 text-white' : 'bg-white/90 text-gray-700'}`}
                title="Quitar el techo para ver la recepción, los racks y las descargas"
              >
                <i className="ri-home-gear-line mr-1"></i>Sin techo
              </button>
              <button
                onClick={toggleFullscreen}
                className="rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-gray-700 shadow hover:bg-white cursor-pointer"
                title={isFullscreen ? 'Salir de pantalla completa (Esc)' : 'Pantalla completa'}
              >
                <i className={`${isFullscreen ? 'ri-fullscreen-exit-line' : 'ri-fullscreen-line'} mr-1`}></i>
                {isFullscreen ? 'Salir' : 'Pantalla completa'}
              </button>
              <span
                className="flex items-center rounded-md bg-white/90 px-2 py-1 text-xs text-gray-600 shadow cursor-help"
                title={[
                  'Navegación',
                  '• Arrastrar: girar',
                  '• Espacio + arrastrar o clic derecho: desplazarse',
                  '• Rueda: acercar hacia el cursor',
                  '• Doble clic: ir a ese punto',
                  '• W A S D / flechas: moverse · Q / E: girar',
                ].join(String.fromCharCode(10))}
              >
                <i className="ri-mouse-line mr-1"></i>Espacio + arrastrar · doble clic · WASD
              </span>
            </div>

            <div className="absolute right-3 top-3 rounded-md bg-white/90 px-3 py-1.5 text-right shadow">
              <div className="flex items-center justify-end gap-1.5 text-[10px] uppercase tracking-wide text-gray-500">
                {mode === 'live' && (
                  <span
                    className={`h-2 w-2 rounded-full ${
                      realtimeStatus === 'ok' ? 'bg-green-500 animate-pulse' : realtimeStatus === 'retry' ? 'bg-amber-500' : 'bg-gray-400'
                    }`}
                    title={realtimeStatus === 'ok' ? 'Conectado en tiempo real' : 'Reconectando…'}
                  ></span>
                )}
                {mode === 'live' ? (realtimeStatus === 'ok' ? 'Tiempo real' : 'Reconectando…') : currentTime > now ? 'Proyección' : 'Recorrido'}
              </div>
              <div className="text-lg font-bold tabular-nums text-gray-900">
                {formatInTimeZone(new Date(currentTime), tz, 'HH:mm')}
              </div>
              {appoloMode !== 'off' && (
                <div className="flex justify-end">
                  <AppoloStatusBadge status={appolo.status} realtimeOk={appolo.realtimeOk} />
                </div>
              )}
              {(alertCounts.red > 0 || alertCounts.yellow > 0) && (
                <div className="mt-1 flex justify-end gap-1 border-t border-gray-200 pt-1">
                  {alertCounts.red > 0 && (
                    <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white" title={`Esperando ${ALERT_RED_MIN} min o más`}>
                      <i className="ri-alarm-warning-fill mr-0.5"></i>
                      {alertCounts.red}
                    </span>
                  )}
                  {alertCounts.yellow > 0 && (
                    <span className="rounded-full bg-yellow-400 px-2 py-0.5 text-[11px] font-bold text-yellow-950" title={`Esperando ${ALERT_YELLOW_MIN} min o más`}>
                      <i className="ri-time-line mr-0.5"></i>
                      {alertCounts.yellow}
                    </span>
                  )}
                </div>
              )}
              {dockActivities.size > 0 && (
                <div className="mt-1 flex flex-col items-end gap-0.5 border-t border-gray-200 pt-1">
                  {(['DESCARGANDO', 'APERTURA', 'ESPERA', 'DESCARGADO'] as const)
                    .filter((st) => stageCounts[st])
                    .map((st) => (
                      <span key={st} className="flex items-center gap-1 text-[11px] text-gray-700">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STAGE_META[st].color }}></span>
                        {stageCounts[st]} {STAGE_META[st].label.toLowerCase()}
                      </span>
                    ))}
                </div>
              )}
            </div>

            {/* Pantalla completa: resumen por fase y camión seleccionado, flotando sobre la escena */}
            {isFullscreen && (
              <div className="absolute left-3 top-12 flex w-72 flex-col gap-2">
                <div className="flex flex-wrap gap-1">
                  {PHASE_ORDER.filter((ph) => PHASE_META[ph].visible).map((ph) => (
                    <span key={ph} className="flex items-center gap-1 rounded-md bg-white/90 px-2 py-0.5 text-[11px] text-gray-700 shadow">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PHASE_META[ph].color }}></span>
                      {counts[ph] ?? 0} {PHASE_META[ph].label.toLowerCase()}
                    </span>
                  ))}
                </div>
                {selectedDispatch && (
                  <DispatchCard
                    compact
                    item={selectedDispatch}
                    dockName={dispatchDockName(selectedDispatch)}
                    fmt={fmt}
                    onClose={() => setSelectedId(null)}
                    onView={() => viewDispatch(selectedDispatch)}
                  />
                )}
                {selected && (
                  <div className="rounded-lg bg-white/95 p-3 text-sm shadow-lg">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-gray-900">{selected.truck_plate || 'Sin placa'}</p>
                        <p className="text-xs text-gray-500">
                          Andén {dockName(selected.dock_id)} · {fmt(selected.start_datetime)} – {fmt(selected.end_datetime)}
                        </p>
                      </div>
                      <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                        <i className="ri-close-line"></i>
                      </button>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {selected.status && (
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ backgroundColor: selected.status.color }}>
                          {selected.status.name}
                        </span>
                      )}
                      {selectedPlan && (
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ backgroundColor: PHASE_META[selectedPlan.phase].color }}>
                          {PHASE_META[selectedPlan.phase].label}
                        </span>
                      )}
                    </div>
                    {selectedActivity && (
                      <>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="font-medium text-gray-700">{STAGE_META[selectedActivity.activity.stage].label}</span>
                          <span className="font-bold tabular-nums">{Math.round(selectedActivity.activity.progress * 100)}%</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-200">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.round(selectedActivity.activity.progress * 100)}%`,
                              backgroundColor: STAGE_META[selectedActivity.activity.stage].color,
                            }}
                          ></div>
                        </div>
                        <div className="mt-2 flex gap-1.5">
                          <button
                            onClick={() => goToCamera('descarga', selectedActivity.x)}
                            className="flex-1 rounded-md bg-teal-600 px-2 py-1 text-xs font-medium text-white hover:bg-teal-700 cursor-pointer"
                          >
                            <i className="ri-eye-line mr-1"></i>Ver descarga
                          </button>
                          {selectedActivity.activity.stage !== 'DESCARGANDO' && (
                            <button
                              onClick={() => {
                                const on = simulateId !== selectedId;
                                setSimulateId(on ? selectedId : null);
                                if (on) goToCamera('descarga', selectedActivity.x);
                              }}
                              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 cursor-pointer"
                            >
                              {simulateId === selectedId ? 'Detener' : 'Simular'}
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50">
                <i className="ri-loader-4-line text-3xl text-teal-600 animate-spin"></i>
              </div>
            )}
            {error && (
              <div className="absolute bottom-3 left-3 right-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Línea de tiempo del recorrido */}
            {mode === 'replay' && (
              <div className="border-t border-gray-200 px-4 py-3 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => {
                    if (simTime >= replayMax) {
                      snapRef.current = true;
                      setSimTime(dayStart + 5 * 60 * MIN);
                    }
                    setPlaying((p) => !p);
                  }}
                  className="h-9 w-9 shrink-0 rounded-full bg-teal-600 text-white hover:bg-teal-700 cursor-pointer"
                  title={playing ? 'Pausa' : 'Reproducir'}
                >
                  <i className={playing ? 'ri-pause-fill' : 'ri-play-fill'}></i>
                </button>
                <input
                  type="range"
                  min={dayStart}
                  max={replayMax}
                  step={MIN}
                  value={Math.min(simTime, replayMax)}
                  onChange={(e) => {
                    snapRef.current = true;
                    setSimTime(Number(e.target.value));
                  }}
                  className="flex-1 min-w-[180px] accent-teal-600"
                />
                <select
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm"
                >
                  {SPEEDS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                {isToday && (
                  <button
                    onClick={() => {
                      snapRef.current = true;
                      setSimTime(Date.now());
                      setPlaying(false);
                    }}
                    className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer whitespace-nowrap"
                  >
                    Ir a ahora
                  </button>
                )}
                <p className="w-full text-[11px] text-gray-500">
                  Ingreso y salida usan las horas reales de la casetilla, y los pasos patio → andén → descarga usan la hora
                  real de cada cambio de estado de la cita. Si una cita no tiene historial, se estima con su horario.
                </p>
              </div>
            )}
          </div>

          {/* Panel lateral */}
          <div className="flex flex-col gap-4 min-h-0">
            {selectedDispatch && (
              <DispatchCard
                item={selectedDispatch}
                dockName={dispatchDockName(selectedDispatch)}
                fmt={fmt}
                onClose={() => setSelectedId(null)}
                onView={() => viewDispatch(selectedDispatch)}
              />
            )}
            <AppoloSummary
              mode={appoloMode}
              onModeChange={(m) => {
                if (m === 'demo') setDemoAnchor(mode === 'live' ? Date.now() : simTime);
                setAppoloMode(m);
              }}
              status={appolo.status}
              error={appolo.error}
              realtimeOk={appolo.realtimeOk}
              configured={appoloConfigured()}
              items={dispatchItems}
              putaways={putawayItems}
              equipment={equipmentTotals(appolo.snapshot?.equipment)}
              onSelect={viewDispatch}
              onViewLot={() => goToCamera('esperaDespacho')}
              selectedId={selectedId}
            />
            {selected && (
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-gray-500">Camión seleccionado</p>
                    <p className="text-lg font-bold text-gray-900">{selected.truck_plate || 'Sin placa'}</p>
                  </div>
                  <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                    <i className="ri-close-line text-xl"></i>
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selected.status && (
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: selected.status.color }}>
                      {selected.status.name}
                    </span>
                  )}
                  {selectedPlan && (
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: PHASE_META[selectedPlan.phase].color }}
                    >
                      {PHASE_META[selectedPlan.phase].label}
                    </span>
                  )}
                  {isStaleWithoutExit(selected, selectedGate, now) && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Sin salida registrada en casetilla
                    </span>
                  )}
                  {selectedPlan?.conflict && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Andén ocupado por otra cita</span>
                  )}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                  <dt className="text-gray-500">Andén</dt>
                  <dd className="font-medium text-gray-900">{dockName(selected.dock_id)}</dd>
                  <dt className="text-gray-500">Cita</dt>
                  <dd className="font-medium text-gray-900">
                    {fmt(selected.start_datetime)} – {fmt(selected.end_datetime)}
                  </dd>
                  <dt className="text-gray-500">Ingreso casetilla</dt>
                  <dd className="font-medium text-gray-900">{fmt(selectedGate?.ingresoAt)}</dd>
                  <dt className="text-gray-500">Salida casetilla</dt>
                  <dd className="font-medium text-gray-900">{fmt(selectedGate?.salidaAt)}</dd>
                  <dt className="text-gray-500">Proveedor</dt>
                  <dd className="font-medium text-gray-900 break-words">
                    {(selected.shipper_provider && data?.providerNames.get(selected.shipper_provider)) || '—'}
                  </dd>
                  <dt className="text-gray-500">Chofer</dt>
                  <dd className="font-medium text-gray-900 break-words">{selected.driver || '—'}</dd>
                  <dt className="text-gray-500">Operación</dt>
                  <dd className="font-medium text-gray-900">
                    {(selected.operation_type && OPERATION_LABELS[selected.operation_type]) || selected.operation_type || '—'}
                  </dd>
                  {selected.dua && (
                    <>
                      <dt className="text-gray-500">DUA</dt>
                      <dd className="font-medium text-gray-900 break-words">{selected.dua}</dd>
                    </>
                  )}
                  {selected.purchase_order && (
                    <>
                      <dt className="text-gray-500">Orden compra</dt>
                      <dd className="font-medium text-gray-900 break-words">{selected.purchase_order}</dd>
                    </>
                  )}
                  {selectedCargo && (
                    <>
                      <dt className="text-gray-500">Tipo de carga</dt>
                      <dd className="font-medium text-gray-900 break-words">{selectedCargo.name}</dd>
                    </>
                  )}
                  {selected.quantity_value != null && (
                    <>
                      <dt className="text-gray-500">Cantidad</dt>
                      <dd className="font-medium text-gray-900">
                        {selected.quantity_value.toLocaleString('es-CR')} {unitLabel(selectedCargo)}
                      </dd>
                    </>
                  )}
                </dl>
                {selectedActivity && (
                  <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: STAGE_META[selectedActivity.activity.stage].color }}
                        ></span>
                        {STAGE_META[selectedActivity.activity.stage].label}
                      </span>
                      <span className="text-sm font-bold tabular-nums text-gray-900">
                        {Math.round(selectedActivity.activity.progress * 100)}%
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.round(selectedActivity.activity.progress * 100)}%`,
                          backgroundColor: STAGE_META[selectedActivity.activity.stage].color,
                        }}
                      ></div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-[11px] text-gray-500">
                      {selected.quantity_value != null && (
                        <span>
                          {Math.round(selected.quantity_value * selectedActivity.activity.progress).toLocaleString('es-CR')} de{' '}
                          {selected.quantity_value.toLocaleString('es-CR')} {unitLabel(selectedCargo)}
                        </span>
                      )}
                      {selectedActivity.activity.startedAt && <span>Inicio {fmt(new Date(selectedActivity.activity.startedAt).toISOString())}</span>}
                      {selectedActivity.activity.endedAt && selectedActivity.activity.stage === 'DESCARGADO' ? (
                        <span>Fin {fmt(new Date(selectedActivity.activity.endedAt).toISOString())}</span>
                      ) : selectedActivity.activity.etaAt ? (
                        <span>Fin estimado {fmt(new Date(selectedActivity.activity.etaAt).toISOString())}</span>
                      ) : null}
                    </div>
                    {selectedActivity.activity.estimated && selectedActivity.activity.stage === 'DESCARGANDO' && (
                      <p className="mt-1 text-[11px] text-amber-700">Avance estimado según el tipo de carga y la cantidad.</p>
                    )}
                    <p className="mt-3 mb-1 text-xs font-medium text-gray-700">
                      Cuadrilla{' '}
                      <span className="font-normal text-gray-500">
                        {selectedActivity.crew.fromRule ? '(regla de Recursos)' : '(por defecto: sin regla para esta carga)'}
                      </span>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedActivity.crew.items.map((it) => (
                        <span key={it.name} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700 ring-1 ring-gray-200">
                          {it.quantity} × {it.name}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => goToCamera('descarga', selectedActivity.x)}
                        className="flex-1 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 cursor-pointer whitespace-nowrap"
                      >
                        <i className="ri-eye-line mr-1"></i>Ver descarga en 3D
                      </button>
                      {selectedActivity.activity.stage !== 'DESCARGANDO' && (
                        <button
                          onClick={() => {
                            const on = simulateId !== selectedId;
                            setSimulateId(on ? selectedId : null);
                            if (on) goToCamera('descarga', selectedActivity.x);
                          }}
                          className={`rounded-lg border px-3 py-1.5 text-sm font-medium cursor-pointer whitespace-nowrap ${
                            simulateId === selectedId
                              ? 'border-amber-400 bg-amber-50 text-amber-800'
                              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                          }`}
                          title="Animar la descarga con la cuadrilla de esta cita, aunque no esté descargando ahora"
                        >
                          <i className={`${simulateId === selectedId ? 'ri-stop-line' : 'ri-play-line'} mr-1`}></i>
                          {simulateId === selectedId ? 'Detener' : 'Simular'}
                        </button>
                      )}
                    </div>
                    {simulateId === selectedId && selectedActivity.activity.stage !== 'DESCARGANDO' && (
                      <p className="mt-1.5 text-[11px] text-amber-700">Simulación: no refleja el avance real de esta cita.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-200 p-3">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-gray-900">
                    Camiones {phaseFilter !== 'ALL' && <span className="text-gray-500">· {PHASE_META[phaseFilter].label}</span>}
                  </h2>
                  <span className="text-xs text-gray-500">{listItems.length}</span>
                </div>
                <div className="relative">
                  <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"></i>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Placa, proveedor, DUA, andén…"
                    className="h-9 w-full rounded-lg border border-gray-300 pl-8 pr-3 text-sm"
                  />
                </div>
              </div>
              <ul className="max-h-[52vh] overflow-y-auto divide-y divide-gray-100">
                {listItems.length === 0 && (
                  <li className="p-6 text-center text-sm text-gray-500">{loading ? 'Cargando…' : 'No hay camiones para mostrar.'}</li>
                )}
                {listItems.map(({ plan: p, r }) => {
                  const meta = PHASE_META[p.phase];
                  const provider = r.shipper_provider ? data?.providerNames.get(r.shipper_provider) : undefined;
                  return (
                    <li key={r.id}>
                      <button
                        onClick={() => setSelectedId(r.id)}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 cursor-pointer ${
                          selectedId === r.id ? 'bg-yellow-50' : ''
                        }`}
                      >
                        <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: r.status?.color || meta.color }}></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-gray-900">{r.truck_plate || 'Sin placa'}</span>
                            <span className="text-xs text-gray-500">{dockName(r.dock_id)}</span>
                          </span>
                          <span className="block truncate text-xs text-gray-500">{provider || r.driver || '—'}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-xs font-medium text-gray-700">{fmt(r.start_datetime)}</span>
                          <span className="block text-[10px]" style={{ color: meta.color }}>
                            {r.status?.name || meta.label}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Leyenda */}
            <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs">
              <p className="mb-2 font-semibold text-gray-900">Leyenda</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-gray-600">
                {(data?.statuses ?? []).map((s) => (
                  <span key={s.id} className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }}></span>
                    {s.name}
                  </span>
                ))}
              </div>
              {(data?.categories ?? []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-gray-100 pt-2 text-gray-600">
                  {data!.categories.map((c) => (
                    <span key={c.id} className="flex items-center gap-1">
                      <span className="h-2.5 w-4 rounded-sm" style={{ backgroundColor: c.color }}></span>
                      Andén {c.name}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-gray-100 pt-2 text-gray-600">
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-green-500"></span>Andén libre</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span>Ocupado</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-500"></span>Bloqueado</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
