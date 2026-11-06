/**
 * Posición del sol (aproximación de la NOAA, error < 1°: de sobra para luz y sombras).
 * Devuelve elevación sobre el horizonte y azimut desde el norte hacia el este, en radianes.
 */
export function sunPosition(time: number, lat: number, lng: number) {
  const rad = Math.PI / 180;
  const d = time / 86_400_000 - 10957.5; // días desde J2000
  const g = (357.529 + 0.98560028 * d) * rad;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;
  const H = (gmst * 15 + lng) * rad - ra;
  const phi = lat * rad;
  const elevation = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const azimuth = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(H));
  return { elevation, azimuth };
}

/** Dirección unitaria hacia un astro en la escena: norte = -z, este = +x, arriba = +y. */
export function skyDirection(elevation: number, azimuth: number): [number, number, number] {
  const c = Math.cos(elevation);
  return [Math.sin(azimuth) * c, Math.sin(elevation), -Math.cos(azimuth) * c];
}

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
