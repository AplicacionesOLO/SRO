// ─────────────────────────────────────────────────────────────────────────────
// Pruebas unitarias de la regla "No arribó" (noShowRules).
//
// Runner ligero SIN dependencias: usa el ejecutor de TypeScript nativo de Node
// (Node >= 23/24). No importa ningún paquete, sólo el util bajo prueba.
//
// Ejecutar:
//   node src/utils/noShowRules.test.ts
//
// Objetivo: garantizar que la nueva exclusión de importados NO rompa el
// comportamiento previo (nacionales se marcan, canceladas se respetan, la
// tolerancia funciona igual, etc.).
// ─────────────────────────────────────────────────────────────────────────────

import {
  evaluateNoShow,
  shouldMarkNoShow,
  isNoShowExpired,
  isExemptFromNoShow,
  resolveIsImported,
  getNoShowReducedEnd,
  isNoShowStatusCode,
} from './noShowRules.ts';

// ── Mini harness ─────────────────────────────────────────────────────────────
const cases: { name: string; run: () => void }[] = [];

function test(name: string, run: () => void): void {
  cases.push({ name, run });
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${label}: esperado ${e}, recibido ${a}`);
  }
}

// ── Helpers de tiempo ────────────────────────────────────────────────────────
const NOW = new Date('2026-10-06T12:00:00.000Z');
const minutesBeforeNow = (m: number): string => new Date(NOW.getTime() - m * 60_000).toISOString();

// ─────────────────────────────────────────────────────────────────────────────
// 1) Comportamiento PREVIO (no debe romperse)
// ─────────────────────────────────────────────────────────────────────────────

test('Nacional vencida (sin exclusión) → mark', () => {
  const r = evaluateNoShow({
    startDatetime: minutesBeforeNow(120),
    toleranceMinutes: 30,
    isCancelled: false,
    isImported: false,
    excludeImported: false,
    now: NOW,
  });
  assertEqual(r, 'mark', 'decisión');
});

test('Nacional dentro de tolerancia → keep', () => {
  const r = evaluateNoShow({
    startDatetime: minutesBeforeNow(10),
    toleranceMinutes: 30,
    isCancelled: false,
    isImported: false,
    excludeImported: false,
    now: NOW,
  });
  assertEqual(r, 'keep', 'decisión');
});

test('Cancelada (nacional, vencida) → skip_cancelled', () => {
  const r = evaluateNoShow({
    startDatetime: minutesBeforeNow(999),
    toleranceMinutes: 30,
    isCancelled: true,
    isImported: false,
    excludeImported: false,
    now: NOW,
  });
  assertEqual(r, 'skip_cancelled', 'decisión');
});

test('Sin tolerancia (null) → skip_no_tolerance', () => {
  const r = evaluateNoShow({
    startDatetime: minutesBeforeNow(999),
    toleranceMinutes: null,
    isCancelled: false,
    isImported: false,
    now: NOW,
  });
  assertEqual(r, 'skip_no_tolerance', 'decisión');
});

test('Tolerancia 0 → skip_no_tolerance', () => {
  const r = evaluateNoShow({
    startDatetime: minutesBeforeNow(999),
    toleranceMinutes: 0,
    isCancelled: false,
    isImported: false,
    now: NOW,
  });
  assertEqual(r, 'skip_no_tolerance', 'decisión');
});

test('Sin hora de cita → skip_no_start', () => {
  const r = evaluateNoShow({
    startDatetime: null,
    toleranceMinutes: 30,
    isCancelled: false,
    isImported: false,
    now: NOW,
  });
  assertEqual(r, 'skip_no_start', 'decisión');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2) NUEVA regla: exclusión de importados
// ─────────────────────────────────────────────────────────────────────────────

test('Importada vencida + exclusión ON → skip_imported', () => {
  const r = evaluateNoShow({
    startDatetime: minutesBeforeNow(999),
    toleranceMinutes: 30,
    isCancelled: false,
    isImported: true,
    excludeImported: true,
    now: NOW,
  });
  assertEqual(r, 'skip_imported', 'decisión');
});

test('Importada vencida + exclusión OFF → mark (comportamiento previo)', () => {
  const r = evaluateNoShow({
    startDatetime: minutesBeforeNow(999),
    toleranceMinutes: 30,
    isCancelled: false,
    isImported: true,
    excludeImported: false,
    now: NOW,
  });
  assertEqual(r, 'mark', 'decisión');
});

test('Importada con exclusión ON, aún sin vencer → skip_imported (nunca se marca)', () => {
  const r = evaluateNoShow({
    startDatetime: minutesBeforeNow(5),
    toleranceMinutes: 30,
    isCancelled: false,
    isImported: true,
    excludeImported: true,
    now: NOW,
  });
  assertEqual(r, 'skip_imported', 'decisión');
});

test('Cancelada + importada + exclusión ON → skip_cancelled tiene prioridad', () => {
  const r = evaluateNoShow({
    startDatetime: minutesBeforeNow(999),
    toleranceMinutes: 30,
    isCancelled: true,
    isImported: true,
    excludeImported: true,
    now: NOW,
  });
  assertEqual(r, 'skip_cancelled', 'decisión');
});

test('Importada detectada por DUA (is_imported null) + exclusión ON → skip_imported', () => {
  const isImported = resolveIsImported({ is_imported: null, dua: '  DUA-123  ' });
  assertEqual(isImported, true, 'resolveIsImported');
  const r = evaluateNoShow({
    startDatetime: minutesBeforeNow(999),
    toleranceMinutes: 30,
    isCancelled: false,
    isImported,
    excludeImported: true,
    now: NOW,
  });
  assertEqual(r, 'skip_imported', 'decisión');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2b) NUEVA regla: Traslado Interno (exento de No Arribó)
// ─────────────────────────────────────────────────────────────────────────────

test('Traslado Interno vencido → skip_internal_transfer', () => {
  const r = evaluateNoShow({
    startDatetime: minutesBeforeNow(999),
    toleranceMinutes: 30,
    isCancelled: false,
    isImported: false,
    isInternalTransfer: true,
    now: NOW,
  });
  assertEqual(r, 'skip_internal_transfer', 'decisión');
});

test('Traslado Interno dentro de tolerancia → skip_internal_transfer', () => {
  const r = evaluateNoShow({
    startDatetime: minutesBeforeNow(5),
    toleranceMinutes: 30,
    isCancelled: false,
    isInternalTransfer: true,
    now: NOW,
  });
  assertEqual(r, 'skip_internal_transfer', 'decisión');
});

test('Traslado Interno + cancelada → skip_cancelled tiene prioridad', () => {
  const r = evaluateNoShow({
    startDatetime: minutesBeforeNow(999),
    toleranceMinutes: 30,
    isCancelled: true,
    isInternalTransfer: true,
    now: NOW,
  });
  assertEqual(r, 'skip_cancelled', 'decisión');
});

test('Nacional vencida sin Traslado Interno → sigue marcándose (mark)', () => {
  const r = evaluateNoShow({
    startDatetime: minutesBeforeNow(999),
    toleranceMinutes: 30,
    isCancelled: false,
    isImported: false,
    isInternalTransfer: false,
    now: NOW,
  });
  assertEqual(r, 'mark', 'decisión');
});

test('shouldMarkNoShow: Traslado Interno nunca se marca', () => {
  assertEqual(
    shouldMarkNoShow({ startDatetime: minutesBeforeNow(999), toleranceMinutes: 30, isCancelled: false, isInternalTransfer: true, now: NOW }),
    false,
    'traslado interno'
  );
});

test('isExemptFromNoShow: Traslado Interno es exento', () => {
  assertEqual(isExemptFromNoShow({ isInternalTransfer: true }), true, 'traslado interno');
  assertEqual(isExemptFromNoShow({ isInternalTransfer: false, isCancelled: false }), false, 'no traslado');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3) Frontera de tiempo
// ─────────────────────────────────────────────────────────────────────────────

test('Justo en el cutoff (start + tolerancia === ahora) → keep', () => {
  const tolerance = 30;
  const start = new Date(NOW.getTime() - tolerance * 60_000).toISOString();
  const r = isNoShowExpired({ startDatetime: start, toleranceMinutes: tolerance, now: NOW });
  assertEqual(r, false, 'expired');
});

test('Un segundo después del cutoff → mark', () => {
  const tolerance = 30;
  const start = new Date(NOW.getTime() - tolerance * 60_000 - 1000).toISOString();
  const r = isNoShowExpired({ startDatetime: start, toleranceMinutes: tolerance, now: NOW });
  assertEqual(r, true, 'expired');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4) Helpers
// ─────────────────────────────────────────────────────────────────────────────

test('shouldMarkNoShow refleja evaluateNoShow', () => {
  assertEqual(
    shouldMarkNoShow({ startDatetime: minutesBeforeNow(999), toleranceMinutes: 30, isCancelled: false, isImported: false, now: NOW }),
    true,
    'nacional vencida'
  );
  assertEqual(
    shouldMarkNoShow({ startDatetime: minutesBeforeNow(999), toleranceMinutes: 30, isCancelled: false, isImported: true, excludeImported: true, now: NOW }),
    false,
    'importada excluida'
  );
});

test('isExemptFromNoShow: cancelada e importada-excluida son exentas', () => {
  assertEqual(isExemptFromNoShow({ isCancelled: true }), true, 'cancelada');
  assertEqual(isExemptFromNoShow({ isImported: true, excludeImported: true }), true, 'importada excluida');
  assertEqual(isExemptFromNoShow({ isImported: true, excludeImported: false }), false, 'importada sin exclusión');
  assertEqual(isExemptFromNoShow({ isCancelled: false, isImported: false, excludeImported: true }), false, 'nacional');
});

test('resolveIsImported: fuente de verdad y fallback por DUA', () => {
  assertEqual(resolveIsImported({ is_imported: true, dua: null }), true, 'flag true');
  assertEqual(resolveIsImported({ is_imported: false, dua: 'DUA-9' }), false, 'flag false gana sobre DUA');
  assertEqual(resolveIsImported({ is_imported: null, dua: 'DUA-9' }), true, 'null + DUA → importada');
  assertEqual(resolveIsImported({ is_imported: null, dua: '   ' }), false, 'null + DUA vacío → nacional');
  assertEqual(resolveIsImported({ is_imported: null, dua: null }), false, 'null sin DUA → nacional');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5) No arribó → reducción del bloque a 15 min visibles (espacio liberado)
// ─────────────────────────────────────────────────────────────────────────────

test('getNoShowReducedEnd: cita de 1 hora → se reduce a 15 min', () => {
  const reduced = getNoShowReducedEnd('2026-10-06T10:00:00.000Z', '2026-10-06T11:00:00.000Z');
  assertEqual(reduced.toISOString(), '2026-10-06T10:15:00.000Z', 'fin reducido');
});

test('getNoShowReducedEnd: cita de exactamente 15 min → se mantiene', () => {
  const reduced = getNoShowReducedEnd('2026-10-06T10:00:00.000Z', '2026-10-06T10:15:00.000Z');
  assertEqual(reduced.toISOString(), '2026-10-06T10:15:00.000Z', 'fin reducido');
});

test('getNoShowReducedEnd: cita de 5 min → conserva su duración original', () => {
  const reduced = getNoShowReducedEnd('2026-10-06T10:00:00.000Z', '2026-10-06T10:05:00.000Z');
  assertEqual(reduced.toISOString(), '2026-10-06T10:05:00.000Z', 'fin reducido');
});

test('getNoShowReducedEnd: fecha inválida → devuelve el fin planificado', () => {
  const reduced = getNoShowReducedEnd('invalido', '2026-10-06T10:05:00.000Z');
  assertEqual(reduced.toISOString(), '2026-10-06T10:05:00.000Z', 'fin reducido');
});

test('isNoShowStatusCode reconoce NO_SHOW (case-insensitive)', () => {
  assertEqual(isNoShowStatusCode('NO_SHOW'), true, 'NO_SHOW');
  assertEqual(isNoShowStatusCode('no_show'), true, 'no_show');
  assertEqual(isNoShowStatusCode('PENDING'), false, 'PENDING');
  assertEqual(isNoShowStatusCode(null), false, 'null');
  assertEqual(isNoShowStatusCode(undefined), false, 'undefined');
});

// ─────────────────────────────────────────────────────────────────────────────
// Ejecución
// ─────────────────────────────────────────────────────────────────────────────
let passed = 0;
const failures: string[] = [];

for (const c of cases) {
  try {
    c.run();
    passed += 1;
  } catch (err) {
    failures.push(`${c.name} → ${(err as Error).message}`);
  }
}

console.log(`\nNo-Show Rules — ${passed}/${cases.length} pruebas OK`);
if (failures.length > 0) {
  console.error('\nFallos:');
  for (const f of failures) console.error(`  ✗ ${f}`);
  (globalThis as any).process?.exit?.(1);
} else {
  console.log('Todas las pruebas pasaron ✓');
}