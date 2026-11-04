import { useCallback, useEffect, useRef, useState } from 'react';
import {
  appoloConfigured,
  appoloOpsService,
  AppoloError,
  type AppoloSnapshot,
} from '../../services/appoloOpsService';
import { buildRoute, type Pose, type SiteLayout } from './lib/layout';
import { samePose } from './lib/plan';
import { DISPATCH_STAGE_META, lotRoute, type DispatchItem } from './lib/appolo';
import type { TruckVisual } from './components/Truck3D';

export type AppoloMode = 'off' | 'live' | 'demo';
export type AppoloStatus = 'off' | 'no_config' | 'loading' | 'ok' | 'error' | 'demo';

/**
 * Conexión de solo lectura con AppOLO: consulta la foto del día y escucha los avisos
 * en tiempo real. Cualquier falla se informa en pantalla y NO afecta al resto del 3D.
 */
export function useAppoloSnapshot(params: {
  mode: AppoloMode;
  warehouseId: string | null;
  date: string;
  tz: string;
  isToday: boolean;
  /** Foto de demostración (se genera fuera para usar los datos de SRO) */
  demo: AppoloSnapshot | null;
}) {
  const { mode, warehouseId, date, tz, isToday, demo } = params;
  const [snapshot, setSnapshot] = useState<AppoloSnapshot | null>(null);
  const [status, setStatus] = useState<AppoloStatus>('off');
  const [error, setError] = useState<string | null>(null);
  const [realtimeOk, setRealtimeOk] = useState(false);
  const seq = useRef(0);

  const fetchNow = useCallback(async () => {
    if (mode !== 'live' || !warehouseId) return;
    const my = ++seq.current;
    try {
      const snap = await appoloOpsService.snapshot({ sroWarehouseId: warehouseId, date, tz });
      if (my !== seq.current) return;
      setSnapshot(snap);
      setStatus('ok');
      setError(null);
    } catch (e) {
      if (my !== seq.current) return;
      setStatus('error');
      setError(e instanceof AppoloError ? e.message : 'Error al consultar AppOLO');
    }
  }, [mode, warehouseId, date, tz]);

  // Modo / almacén / fecha
  useEffect(() => {
    seq.current++;
    setRealtimeOk(false);
    if (mode === 'off') {
      setSnapshot(null);
      setStatus('off');
      setError(null);
      return;
    }
    if (mode === 'demo') {
      setStatus('demo');
      setError(null);
      return;
    }
    if (!appoloConfigured()) {
      setSnapshot(null);
      setStatus('no_config');
      setError(null);
      return;
    }
    if (!warehouseId) {
      setSnapshot(null);
      setStatus('off');
      return;
    }
    setSnapshot(null);
    setStatus('loading');
    fetchNow();
  }, [mode, warehouseId, date, tz, fetchNow]);

  useEffect(() => {
    if (mode === 'demo') setSnapshot(demo);
  }, [mode, demo]);

  // Tiempo real: avisos de AppOLO → nueva consulta (con pausa corta para agrupar ráfagas)
  const fetchRef = useRef(fetchNow);
  fetchRef.current = fetchNow;
  const grant = mode === 'live' && isToday ? snapshot?.realtime ?? null : null;
  const grantKey = grant ? `${grant.url}|${grant.channel}|${grant.token}` : '';
  useEffect(() => {
    if (!grant) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = appoloOpsService.listen(
      grant,
      () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fetchRef.current(), 1000);
      },
      setRealtimeOk
    );
    // Renovar el permiso del canal antes de que venza (la consulta devuelve uno nuevo)
    const expires = new Date(grant.expires_at).getTime() - Date.now() - 60_000;
    const renew = Number.isFinite(expires) ? setTimeout(() => fetchRef.current(), Math.max(30_000, expires)) : null;
    return () => {
      if (timer) clearTimeout(timer);
      if (renew) clearTimeout(renew);
      stop();
      setRealtimeOk(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grantKey]);

  const realtimeOkRef = useRef(false);
  realtimeOkRef.current = realtimeOk;
  // Respaldo: cada 2 min si el canal no está conectado (o cada 10 si lo está); nada con la pestaña oculta
  useEffect(() => {
    if (mode !== 'live' || !isToday || !appoloConfigured() || !warehouseId) return;
    let ticks = 0;
    const id = setInterval(() => {
      if (document.hidden) return;
      ticks++;
      if (!realtimeOkRef.current ? ticks % 2 === 0 : ticks % 10 === 0) fetchRef.current();
    }, 60_000);
    return () => clearInterval(id);
  }, [mode, isToday, warehouseId]);
  return { snapshot, status, error, realtimeOk, refresh: fetchNow };
}

/**
 * Camiones de despacho: igual que los de SRO, cada cambio de pose genera una ruta animada.
 * Se mantiene aparte de los camiones de las citas para no tocar esa lógica.
 */
export function useDispatchTrucks(params: {
  items: DispatchItem[];
  layout: SiteLayout;
  positions: Map<string, Pose>;
  /** true = colocar sin animar (primera carga, cambio de modo o salto en el recorrido) */
  snap: boolean;
}) {
  const { items, layout, positions, snap } = params;
  const [visuals, setVisuals] = useState<Map<string, TruckVisual>>(new Map());

  useEffect(() => {
    setVisuals((prev) => {
      const next = new Map(prev);
      let changed = false;
      const seen = new Set<string>();
      for (const it of items) {
        seen.add(it.id);
        const old = prev.get(it.id);
        const meta = DISPATCH_STAGE_META[it.stage];
        const base = {
          id: it.id,
          plate: it.dispatch.placa || it.dispatch.referencia || 'Despacho',
          statusColor: meta.color,
          statusName: `Despacho · ${meta.label}`,
        };
        if (it.pose) {
          if (!old) {
            // primera vez: en el patio aparece directo; en un andén llega desde la calle
            next.set(it.id, {
              ...base,
              pose: it.pose,
              route: snap || it.inLot ? [] : buildRoute(layout, null, it.pose),
              routeVersion: 1,
            });
            changed = true;
          } else if (!samePose(old.pose, it.pose)) {
            const from = positions.get(it.id) ?? old.pose;
            const route = snap ? [] : it.inLot ? lotRoute(layout, from, it.pose) : buildRoute(layout, from, it.pose);
            next.set(it.id, { ...base, pose: it.pose, route, routeVersion: old.routeVersion + 1 });
            changed = true;
          } else if (old.statusColor !== base.statusColor || old.statusName !== base.statusName || old.plate !== base.plate) {
            next.set(it.id, { ...old, ...base });
            changed = true;
          }
        } else if (old?.pose) {
          if (snap || !it.leaving) {
            next.delete(it.id);
          } else {
            const from = positions.get(it.id) ?? old.pose;
            next.set(it.id, { ...old, ...base, pose: null, route: buildRoute(layout, from, null, true), routeVersion: old.routeVersion + 1 });
          }
          changed = true;
        }
      }
      for (const [id, v] of prev) {
        // los que van saliendo terminan su recorrido aunque ya no estén en la foto
        if (!seen.has(id) && (v.pose || snap)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [items, layout, positions, snap]);

  const onGone = useCallback((id: string) => {
    setVisuals((prev) => {
      const v = prev.get(id);
      if (!v || v.pose) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  return { visuals, onGone };
}
