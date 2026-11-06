/**
 * Animación de llegada al abrir la vista en vivo: se ve una sola vez por almacén y por día
 * (en este navegador). Recargar, volver a la pestaña o refrescar datos coloca los camiones
 * directamente en su lugar.
 *
 * La decisión se toma la primera vez que se pide en esta página y vale unos segundos, para
 * que los camiones de SRO y los despachos de AppOLO (que llegan por separado) la compartan.
 */
const STORAGE_KEY = 'p3d.intro.v1';
const WINDOW_MS = 15_000;
const decided = new Map<string, number>(); // clave → momento en que se concedió (0 = no hay animación)

export function introAllowed(warehouseId: string, day: string): boolean {
  const key = `${warehouseId}|${day}`;
  let at = decided.get(key);
  if (at === undefined) {
    at = 0;
    try {
      const seen = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, string>;
      if (seen[warehouseId] !== day) {
        seen[warehouseId] = day;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
        at = Date.now();
      }
    } catch {
      /* sin almacenamiento: sin animación */
    }
    decided.set(key, at);
  }
  return at > 0 && Date.now() - at < WINDOW_MS;
}
