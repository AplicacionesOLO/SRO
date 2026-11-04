// ─────────────────────────────────────────────────────────────────────────────
// Pruebas unitarias de los tiempos por estado (stateTimes).
//
// Ejecutar:
//   node src/utils/stateTimes.test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { buildSegments, currentSegment, reservationEvents, segmentMs, totalsByState } from './stateTimes.ts';

const cases: { name: string; run: () => void }[] = [];
const test = (name: string, run: () => void) => cases.push({ name, run });
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: esperado ${e}, recibido ${a}`);
}

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 4, 14, 0); // 08:00 Costa Rica
const at = (m: number) => T0 + m * MIN;
const iso = (m: number) => new Date(at(m)).toISOString();
const names: Record<string, string> = {
  CONFIRMED: 'Confirmada',
  LLEGO_AL_ALMACEN: 'Llegó al almacén',
  IN_PROGRESS: 'En andén',
  UNLOADING: 'Descargando',
  DISCHARGED: 'Descargado',
  DISPATCHED: 'Despachado',
};
const info = (code: string) => (names[code] ? { name: names[code], color: '#000' } : undefined);

test('ingreso → estados → salida: cada tramo empieza en 0', () => {
  const ev = reservationEvents(
    [
      { to: 'CONFIRMED', at: at(-600) },
      { to: 'LLEGO_AL_ALMACEN', at: at(20) },
      { to: 'UNLOADING', at: at(35) },
      { to: 'DISCHARGED', at: at(80) },
      { to: 'DISPATCHED', at: at(90) },
    ],
    { ingresoAt: iso(0), salidaAt: iso(100) },
    info,
    { startIso: iso(10) }
  );
  const segs = buildSegments(ev, at(200));
  eq(
    segs.map((s) => [s.label, segmentMs(s, at(200)) / MIN]),
    [
      ['En patio', 20],
      ['Llegó al almacén', 15],
      ['Descargando', 45],
      ['Descargado', 10],
      ['Despachado', 10],
    ],
    'tramos'
  );
  eq(segs[0].fromGate, true, 'primer tramo desde casetilla');
  eq(segs[4].nextLabel, 'Salida por casetilla', 'cierre por salida');
  eq(currentSegment(segs), null, 'sin tramo en curso');
});

test('tramo en curso se mide hasta ahora y se reinicia al cambiar', () => {
  const ev = reservationEvents(
    [{ to: 'LLEGO_AL_ALMACEN', at: at(5) }, { to: 'IN_PROGRESS', at: at(30) }],
    { ingresoAt: iso(0) },
    info
  );
  const before = currentSegment(buildSegments(ev, at(25)))!;
  eq([before.label, segmentMs(before, at(25)) / MIN], ['Llegó al almacén', 20], 'antes del cambio');
  const after = currentSegment(buildSegments(ev, at(42)))!;
  eq([after.label, segmentMs(after, at(42)) / MIN], ['En andén', 12], 'después del cambio');
});

test('el estado vigente al ingresar nombra el primer tramo', () => {
  const ev = reservationEvents([{ to: 'LLEGO_AL_ALMACEN', at: at(-5) }, { to: 'UNLOADING', at: at(10) }], { ingresoAt: iso(0) }, info);
  eq(buildSegments(ev, at(20)).map((s) => s.label), ['Llegó al almacén', 'Descargando'], 'etiquetas');
});

test('sin ingreso: arranca en el primer estado en sitio', () => {
  const ev = reservationEvents([{ to: 'CONFIRMED', at: at(-300) }, { to: 'UNLOADING', at: at(0) }, { to: 'DISCHARGED', at: at(40) }], undefined, info);
  eq(buildSegments(ev, at(50)).map((s) => [s.label, s.from === at(0) || s.from === at(40)]), [['Descargando', true], ['Descargado', true]], 'tramos');
});

test('despachado sin salida cierra el recorrido; repetir estado no reinicia', () => {
  const ev = reservationEvents(
    [{ to: 'UNLOADING', at: at(0) }, { to: 'UNLOADING', at: at(10) }, { to: 'DISPATCHED', at: at(30) }],
    undefined,
    info
  );
  const segs = buildSegments(ev, at(60));
  eq(segs.map((s) => [s.label, segmentMs(s, at(60)) / MIN]), [['Descargando', 30]], 'tramos');
});

test('ingreso de una cita reprogramada (muy anterior) se ignora', () => {
  const ev = reservationEvents([{ to: 'UNLOADING', at: at(0) }], { ingresoAt: iso(-24 * 60) }, info, { startIso: iso(0) });
  eq(buildSegments(ev, at(5)).map((s) => s.fromGate ?? false), [false], 'sin casetilla');
});

test('totales por estado suman tramos repetidos', () => {
  const ev = reservationEvents(
    [{ to: 'UNLOADING', at: at(0) }, { to: 'IN_PROGRESS', at: at(10) }, { to: 'UNLOADING', at: at(15) }, { to: 'DISCHARGED', at: at(30) }],
    undefined,
    info
  );
  const tot = totalsByState(buildSegments(ev, at(30)), at(30));
  eq([tot.get('UNLOADING')!.ms / MIN, tot.get('UNLOADING')!.count], [25, 2], 'descargando');
});

let failed = 0;
for (const c of cases) {
  try {
    c.run();
    console.log(`✔ ${c.name}`);
  } catch (e) {
    failed++;
    console.error(`✘ ${c.name}\n   ${(e as Error).message}`);
  }
}
console.log(`\n${cases.length - failed}/${cases.length} pruebas OK`);
if (failed) process.exit(1);
