import { useEffect, useState } from 'react';
import { CONTAINER_SLOTS, DISPATCH_STAGE_META, SLOT_COLORS, SLOT_LABELS, dispatchEvents, dispatchPallets, occupiedCells, type DispatchItem, type DispatchStage, type PutawayItem } from '../lib/appolo';
import PhotoStrip from './PhotoStrip';
import { appoloPhotoUrls } from '../../../services/appoloOpsService';
import type { AppoloMode, AppoloStatus } from '../useAppolo';
import type { AppoloSlotType } from '../../../services/appoloOpsService';
import StateTimeline from '../../../components/feature/state-times/StateTimeline';
import { buildSegments } from '../../../utils/stateTimes';

const STATUS_META: Record<AppoloStatus, { label: string; dot: string }> = {
  off: { label: 'Apagado', dot: 'bg-gray-400' },
  no_config: { label: 'Sin configurar', dot: 'bg-gray-400' },
  loading: { label: 'Conectando…', dot: 'bg-amber-500' },
  ok: { label: 'Conectado', dot: 'bg-green-500' },
  error: { label: 'Sin conexión', dot: 'bg-red-500' },
  demo: { label: 'Demostración', dot: 'bg-violet-500' },
};

const STAGES: DispatchStage[] = ['CARGANDO', 'PREPARANDO', 'ESPERA_CHOFER', 'VALIDACION', 'RECHAZADO', 'DESPACHADO'];

export function AppoloStatusBadge({ status, realtimeOk }: { status: AppoloStatus; realtimeOk: boolean }) {
  const meta = STATUS_META[status];
  const live = status === 'ok' && realtimeOk;
  return (
    <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-gray-500" title="Despachos y acomodo desde AppOLO">
      <span className={`h-2 w-2 rounded-full ${meta.dot} ${live ? 'animate-pulse' : ''}`}></span>
      AppOLO · {status === 'ok' ? (realtimeOk ? 'tiempo real' : 'conectado') : meta.label.toLowerCase()}
    </span>
  );
}

export function AppoloSummary({
  mode,
  onModeChange,
  status,
  error,
  realtimeOk,
  configured,
  items,
  putaways,
  equipment,
  onSelect,
  onViewLot,
  selectedId,
}: {
  mode: AppoloMode;
  onModeChange: (m: AppoloMode) => void;
  status: AppoloStatus;
  error: string | null;
  realtimeOk: boolean;
  configured: boolean;
  items: DispatchItem[];
  putaways: PutawayItem[];
  equipment: { label: string; activos: number; mantenimiento: number }[] | null;
  onSelect: (it: DispatchItem) => void;
  onViewLot: () => void;
  selectedId: string | null;
}) {
  const counts: Partial<Record<DispatchStage, number>> = {};
  for (const it of items) counts[it.stage] = (counts[it.stage] ?? 0) + 1;
  const visible = [...items].sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || a.since - b.since);
  const waiting = items.filter((i) => i.inLot);
  const oldest = waiting.reduce<number | null>((m, i) => (m === null || i.since < m ? i.since : m), null);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900">Despachos y acomodo</p>
          <AppoloStatusBadge status={status} realtimeOk={realtimeOk} />
        </div>
        <div className="flex rounded-lg border border-gray-300 bg-white p-0.5 text-xs">
          {(
            [
              ['off', 'Apagado'],
              ['live', 'AppOLO'],
              ['demo', 'Demo'],
            ] as [AppoloMode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              disabled={m === 'live' && !configured}
              title={m === 'live' && !configured ? 'Falta configurar la API de AppOLO (VITE_APPOLO_OPS_URL)' : undefined}
              className={`rounded-md px-2 py-1 whitespace-nowrap ${mode === m ? 'bg-teal-600 text-white' : 'text-gray-700'} ${
                m === 'live' && !configured ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'demo' && (
        <p className="mt-2 rounded-md bg-violet-50 px-2 py-1 text-[11px] text-violet-800">
          Datos de ejemplo para validar la vista. No son despachos reales.
        </p>
      )}
      {error && <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700">{error}. El resto del 3D sigue funcionando.</p>}
      {mode === 'off' && (
        <p className="mt-2 text-xs text-gray-500">
          Activá AppOLO para ver los despachos en los andenes de despacho y el acomodo a racks.
        </p>
      )}

      {mode !== 'off' && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {STAGES.map((st) => (
              <div key={st} className="rounded-md border border-gray-100 px-2 py-1">
                <div className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: DISPATCH_STAGE_META[st].color }}></span>
                  <span className="text-sm font-bold text-gray-900">{counts[st] ?? 0}</span>
                </div>
                <p className="truncate text-[10px] text-gray-500">{DISPATCH_STAGE_META[st].label}</p>
              </div>
            ))}
          </div>

          {waiting.length > 0 && (
            <button
              onClick={onViewLot}
              className="mt-3 flex w-full items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-left text-xs text-amber-900 hover:bg-amber-100 cursor-pointer"
            >
              <span>
                <i className="ri-parking-box-line mr-1"></i>
                <b>{waiting.length}</b> en espera de salida
                {oldest !== null && (
                  <>
                    {' '}
                    · el más antiguo desde{' '}
                    {new Date(oldest).toLocaleString('es-CR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </>
                )}
              </span>
              <span className="font-medium">Ver zona</span>
            </button>
          )}

          {visible.length > 0 && (
            <ul className="mt-3 max-h-56 divide-y divide-gray-100 overflow-y-auto text-sm">
              {visible.map((it) => {
                const meta = DISPATCH_STAGE_META[it.stage];
                return (
                  <li key={it.id}>
                    <button
                      onClick={() => onSelect(it)}
                      className={`flex w-full items-center gap-2 px-1 py-1.5 text-left hover:bg-gray-50 cursor-pointer ${
                        selectedId === it.id ? 'bg-teal-50' : ''
                      }`}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-white" style={{ backgroundColor: meta.color }}>
                        <i className={`${meta.icon} text-xs`}></i>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-gray-900">
                          {it.dispatch.placa || it.dispatch.referencia || 'Sin placa'}
                          {it.dispatch.tienda ? ` · ${it.dispatch.tienda}` : ''}
                        </span>
                        <span className="block truncate text-[11px] text-gray-500">
                          Puerta {it.dispatch.puerta ?? '—'} · {meta.label}
                          {it.note && !it.pose && !it.leaving ? ` · ${it.note}` : ''}
                        </span>
                      </span>
                      {it.stage === 'CARGANDO' && <span className="text-xs font-bold tabular-nums text-blue-700">{Math.round(it.progress * 100)}%</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-3 border-t border-gray-100 pt-2">
            <p className="text-xs font-semibold text-gray-700">
              <i className="ri-stack-line mr-1"></i>Acomodo en curso: {putaways.length}
            </p>
            {putaways.map((p) => (
              <div key={p.id} className="mt-1">
                <div className="flex justify-between text-[11px] text-gray-600">
                  <span className="truncate">{p.reception.proveedor || 'Recepción'} · ~{p.pallets} tarimas</span>
                  <span className="tabular-nums">
                    {Math.round(p.progress * 100)}%{p.estimated ? ' (est.)' : ''}
                  </span>
                </div>
                <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-gray-200">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.round(p.progress * 100)}%` }}></div>
                </div>
              </div>
            ))}
            <p className="mt-1 text-[10px] text-gray-400">
              Tiempos de inicio y fin reales de AppOLO; las posiciones en rack son ilustrativas.
            </p>
          </div>

          {equipment && (
            <div className="mt-2 flex flex-wrap gap-1 border-t border-gray-100 pt-2">
              {equipment.map((e) => (
                <span key={e.label} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700" title={`${e.mantenimiento} en mantenimiento`}>
                  {e.label}: {e.activos}
                  {e.mantenimiento > 0 && <span className="text-amber-600"> · {e.mantenimiento} mant.</span>}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Hora si es de hoy; fecha y hora si es de otro día (hay despachos esperando desde hace semanas). */
function when(iso: string, fmt: (iso?: string | null) => string) {
  const t = new Date(iso);
  if (Date.now() - t.getTime() < 20 * 3_600_000) return fmt(iso);
  return t.toLocaleString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Fotos de carga del despacho: las que vengan en la foto del día o, si no, se piden a AppOLO. */
function DispatchPhotos({ inline, count, load }: { inline: string[]; count: number; load?: () => Promise<string[]> }) {
  const [fetched, setFetched] = useState<string[] | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const need = inline.length === 0 && count > 0 && !!load;

  useEffect(() => {
    if (!need || !load) return;
    let alive = true;
    setState('loading');
    load()
      .then((urls) => {
        if (!alive) return;
        setFetched(urls);
        setState('idle');
      })
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
  }, [need, load]);

  const photos = inline.length > 0 ? inline : fetched ?? [];
  return (
    <div className="mt-3 rounded-lg border border-gray-200 p-3">
      {photos.length > 0 ? (
        <PhotoStrip label="Fotos de carga (AppOLO)" icon="ri-camera-line text-blue-600" photos={photos} />
      ) : (
        <p className="text-xs text-gray-500">
          <i className={`${state === 'loading' ? 'ri-loader-4-line inline-block animate-spin' : 'ri-camera-line'} mr-1`}></i>
          {state === 'loading'
            ? `Cargando ${count} foto${count === 1 ? '' : 's'} de AppOLO…`
            : state === 'error'
              ? 'No se pudieron traer las fotos de AppOLO.'
              : `${count} foto${count === 1 ? '' : 's'} registrada${count === 1 ? '' : 's'} en AppOLO${load ? '' : ' (AppOLO todavía no envía las imágenes)'}.`}
        </p>
      )}
    </div>
  );
}

export function DispatchCard({
  item,
  dockName,
  fmt,
  onClose,
  onView,
  compact = false,
  clock,
  live = false,
  fmtTime,
  loadPhotos,
}: {
  item: DispatchItem;
  dockName: string;
  fmt: (iso?: string | null) => string;
  onClose: () => void;
  onView?: () => void;
  compact?: boolean;
  /** Hora de referencia de los tiempos por estado */
  clock?: number;
  live?: boolean;
  fmtTime?: (ms: number) => string;
  /** Pide a AppOLO las fotos del despacho (URLs firmadas) al abrir la tarjeta */
  loadPhotos?: () => Promise<string[]>;
}) {
  const d = item.dispatch;
  const meta = DISPATCH_STAGE_META[item.stage];
  const rows: [string, string | null | undefined][] = [
    ['Puerta', d.puerta ? `${d.puerta}${dockName ? ` (andén ${dockName})` : ''}` : null],
    ['Destino', d.tienda],
    ['Referencia', d.referencia],
    ['Transportista', d.transportista],
    ['Chofer', d.chofer],
    ['Tarimas', `${dispatchPallets(d)} (${d.tarimas_s ?? 0} sencillas · ${d.tarimas_d ?? 0} dobles)`],
    ['Creado', when(d.created_at, fmt)],
    ['En este estado desde', when(new Date(item.since).toISOString(), fmt)],
  ];
  return (
    <div className={`rounded-lg bg-white ${compact ? 'bg-white/95 p-3 shadow-lg' : 'border border-gray-200 p-4'} text-sm`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-gray-500">Despacho · AppOLO</p>
          <p className={`${compact ? '' : 'text-lg'} font-bold text-gray-900`}>{d.placa || 'Sin placa'}</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">
          <i className="ri-close-line text-xl"></i>
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <span className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ backgroundColor: meta.color }}>
          {meta.label}
        </span>
        {d.estado_nombre && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">{d.estado_nombre}</span>}
      </div>
      {(item.stage === 'CARGANDO' || occupiedCells(item.cells) > 0) && (
        <>
          <div className="mt-2 flex justify-between text-xs">
            <span className="font-medium text-gray-700">
              Carga del contenedor
              {!item.cellsReal && <span className="ml-1 font-normal text-gray-400">(estimado)</span>}
            </span>
            <span className="font-bold tabular-nums">
              {occupiedCells(item.cells)}/{CONTAINER_SLOTS} · {Math.round(item.progress * 100)}%
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-200">
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.round(item.progress * 100)}%` }}></div>
          </div>
          {!compact && <ContainerMap cells={item.cells} />}
        </>
      )}
      {!compact && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-gray-500">{k}</dt>
                <dd className="font-medium text-gray-900 break-words">{v}</dd>
              </div>
            ))}
        </dl>
      )}
      {!compact && (appoloPhotoUrls(d.fotos).length > 0 || (d.fotos_count ?? 0) > 0) && (
        <DispatchPhotos key={d.id} inline={appoloPhotoUrls(d.fotos)} count={d.fotos_count ?? 0} load={loadPhotos} />
      )}
      {!compact && clock !== undefined && fmtTime && (
        <div className="mt-3">
          <StateTimeline segments={buildSegments(dispatchEvents(d), clock)} now={clock} live={live} fmtTime={fmtTime} />
        </div>
      )}
      {item.note && !item.pose && !item.leaving && <p className="mt-2 text-[11px] text-amber-700">{item.note}</p>}
      {onView && item.pose && (
        <button onClick={onView} className="mt-2 w-full rounded-md bg-teal-600 px-2 py-1 text-xs font-medium text-white hover:bg-teal-700 cursor-pointer">
          <i className="ri-eye-line mr-1"></i>Ver carga en 3D
        </button>
      )}
    </div>
  );
}

/** Mapa del contenedor como en AppOLO: 12 filas × 2, posición 1–2 al fondo. */
function ContainerMap({ cells }: { cells: AppoloSlotType[] }) {
  const counts = (['S', 'D', 'T', 'C'] as const).map((t) => [t, cells.filter((c) => c === t).length] as const).filter(([, n]) => n > 0);
  return (
    <div className="mt-2">
      <div className="mx-auto w-fit rounded-md border border-gray-300 bg-gray-50 p-1.5">
        <p className="mb-1 text-center text-[9px] uppercase tracking-wide text-gray-400">Fondo</p>
        <div className="grid grid-cols-2 gap-1">
          {cells.map((t, i) => (
            <div
              key={i}
              title={`Posición ${i + 1} · ${SLOT_LABELS[t]}`}
              className="flex h-[18px] w-[30px] items-center justify-center rounded text-[9px] font-bold tabular-nums"
              style={{ backgroundColor: SLOT_COLORS[t], color: t === 'E' ? '#64748b' : '#fff' }}
            >
              {i + 1}
            </div>
          ))}
        </div>
        <p className="mt-1 text-center text-[9px] uppercase tracking-wide text-gray-400">Puerta</p>
      </div>
      <div className="mt-1.5 flex flex-wrap justify-center gap-2 text-[10px] text-gray-600">
        {(['E', 'S', 'D', 'T', 'C'] as const).map((t) => (
          <span key={t} className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border border-gray-300" style={{ backgroundColor: SLOT_COLORS[t] }}></span>
            {SLOT_LABELS[t]}
          </span>
        ))}
      </div>
      {counts.length > 0 && (
        <p className="mt-1 text-center text-[10px] text-gray-500">
          {counts.map(([t, n]) => `${n} ${SLOT_LABELS[t].toLowerCase()}`).join(' · ')} (posiciones)
        </p>
      )}
    </div>
  );
}
