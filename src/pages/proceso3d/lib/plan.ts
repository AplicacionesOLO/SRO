import type { Reservation } from '../../../services/calendarService';
import type { GateTimes } from '../../../services/proceso3dService';
import { approachPose, dockPose, exitPose, exitQueuePose, yardPose, type Pose, type SiteLayout } from './layout';
import { PHASE_META, UNLOADING_NOW, type TruckPhase } from './phases';

export interface PlanItem {
  id: string;
  phase: TruckPhase;
  /** null = no se dibuja (fuera del sitio o fila demasiado larga) */
  pose: Pose | null;
  /** true si estaba en andén según el dato pero el andén ya estaba ocupado */
  conflict?: boolean;
}

const MAX_APPROACH_VISIBLE = 8;
const MAX_EXIT_VISIBLE = 6;
const MAX_EXIT_QUEUE_VISIBLE = 12;

/**
 * Asigna una pose a cada cita según su fase.
 * `yardSlots` es un registro persistente (id → cajón) para que un camión
 * no cambie de cajón en el patio mientras sigue esperando.
 */
export function buildPlan(
  reservations: Reservation[],
  phaseOf: (r: Reservation) => TruckPhase,
  gateTimes: Map<string, GateTimes>,
  layout: SiteLayout,
  yardSlots: Map<string, number>
): PlanItem[] {
  const sorted = [...reservations].sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));
  const items: PlanItem[] = [];
  const occupiedDocks = new Set<string>();
  const patio: Reservation[] = [];
  const approaching: Reservation[] = [];
  const exiting: Reservation[] = [];
  const porSalir: Reservation[] = [];
  const phases = new Map<string, TruckPhase>();

  for (const r of sorted) phases.set(r.id, phaseOf(r));

  // 1) Andenes primero, para detectar choques. Si dos citas reclaman el mismo andén,
  //    se lo queda la que está descargando; la otra pasa al patio marcada como choque.
  const dockPriority = (r: Reservation) => (UNLOADING_NOW.has((r.status?.code ?? '').toUpperCase()) ? 0 : 1);
  const byDockPriority = [...sorted].sort((a, b) => dockPriority(a) - dockPriority(b));
  for (const r of byDockPriority) {
    if (phases.get(r.id) !== 'EN_ANDEN') continue;
    const pose = dockPose(layout, r.dock_id);
    if (pose && !occupiedDocks.has(r.dock_id)) {
      occupiedDocks.add(r.dock_id);
      items.push({ id: r.id, phase: 'EN_ANDEN', pose });
    } else {
      patio.push(r);
      phases.set(r.id, 'PATIO');
      items.push({ id: r.id, phase: 'EN_ANDEN', pose: null, conflict: true });
    }
  }

  for (const r of sorted) {
    const ph = phases.get(r.id)!;
    if (ph === 'PATIO' && !patio.includes(r)) patio.push(r);
    else if (ph === 'EN_CAMINO') approaching.push(r);
    else if (ph === 'SALIENDO') exiting.push(r);
    else if (ph === 'POR_SALIR') porSalir.push(r);
    else if (ph !== 'EN_ANDEN' && ph !== 'PATIO') items.push({ id: r.id, phase: ph, pose: null });
  }

  // 2) Patio con cajones estables
  const patioIds = new Set(patio.map((r) => r.id));
  for (const id of [...yardSlots.keys()]) if (!patioIds.has(id)) yardSlots.delete(id);
  const used = new Set(yardSlots.values());
  const byArrival = [...patio].sort((a, b) =>
    (gateTimes.get(a.id)?.ingresoAt ?? a.start_datetime).localeCompare(gateTimes.get(b.id)?.ingresoAt ?? b.start_datetime)
  );
  for (const r of byArrival) {
    if (!yardSlots.has(r.id)) {
      let slot = 0;
      while (used.has(slot)) slot++;
      yardSlots.set(r.id, slot);
      used.add(slot);
    }
    const conflictItem = items.find((i) => i.id === r.id && i.conflict);
    const pose = yardPose(layout, yardSlots.get(r.id)!);
    if (conflictItem) conflictItem.pose = pose;
    else items.push({ id: r.id, phase: 'PATIO', pose });
  }

  // 3) Fila de llegada y salida (se van corriendo)
  approaching.forEach((r, i) =>
    items.push({ id: r.id, phase: 'EN_CAMINO', pose: i < MAX_APPROACH_VISIBLE ? approachPose(layout, i) : null })
  );
  // Fila de salida hacia la aguja: primero el que terminó antes
  porSalir
    .sort((a, b) => (a.actual_end_datetime ?? a.end_datetime).localeCompare(b.actual_end_datetime ?? b.end_datetime))
    .forEach((r, i) =>
      items.push({ id: r.id, phase: 'POR_SALIR', pose: i < MAX_EXIT_QUEUE_VISIBLE ? exitQueuePose(layout, i) : null })
    );
  exiting.forEach((r, i) =>
    items.push({ id: r.id, phase: 'SALIENDO', pose: i < MAX_EXIT_VISIBLE ? exitPose(layout, i) : null })
  );

  return items.map((it) => (PHASE_META[it.phase].visible || it.conflict ? it : { ...it, pose: null }));
}

export function samePose(a: Pose | null, b: Pose | null) {
  if (!a || !b) return a === b;
  return Math.abs(a.x - b.x) < 0.05 && Math.abs(a.z - b.z) < 0.05;
}
