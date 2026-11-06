/**
 * Coordenadas del almacén a partir de la dirección que se guarda en su configuración
 * (`warehouses.location`). Se usan solo para el sol y el clima de la vista realista.
 *
 * Orden de prueba:
 *  1. Coordenadas escritas en la dirección ("9.99, -84.27").
 *  2. Plus code de Google Maps, completo ("849VXQPG+CQV") o corto con su ciudad ("XQPG+CQV, Alajuela").
 *  3. Búsqueda por nombre de las partes de la dirección (Open-Meteo, gratis y sin llave),
 *     aceptando solo resultados de la misma zona horaria del almacén.
 *  4. La capital del país según la zona horaria.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
  /** De dónde salió: exacta (coordenadas / plus code) o aproximada (ciudad / país) */
  source: 'coords' | 'pluscode' | 'ciudad' | 'pais';
  label?: string;
}

const OLC = '23456789CFGHJMPQRVWX';
const STORAGE_KEY = 'p3d.geo.v4';

const TZ_FALLBACK: Record<string, [number, number, string]> = {
  'America/Costa_Rica': [9.9281, -84.0907, 'San José'],
  'America/Caracas': [10.4806, -66.9036, 'Caracas'],
  'America/Panama': [8.9824, -79.5199, 'Panamá'],
  'America/Guatemala': [14.6349, -90.5069, 'Guatemala'],
  'America/El_Salvador': [13.6929, -89.2182, 'San Salvador'],
  'America/Tegucigalpa': [14.0723, -87.1921, 'Tegucigalpa'],
  'America/Managua': [12.1364, -86.2514, 'Managua'],
  'America/Bogota': [4.711, -74.0721, 'Bogotá'],
  'America/Mexico_City': [19.4326, -99.1332, 'Ciudad de México'],
  'America/Santo_Domingo': [18.4861, -69.9312, 'Santo Domingo'],
  'America/Lima': [-12.0464, -77.0428, 'Lima'],
};

/* ─────────────────────────────── Plus codes (Open Location Code) ─────────────────────────────── */

function olcDecode(full: string): { lat: number; lng: number } | null {
  const c = full.replace('+', '').toUpperCase();
  const n = Math.min(c.length, 10);
  if (n < 8 || n % 2) return null;
  let lat = 0;
  let lng = 0;
  let res = 20;
  for (let i = 0; i < n; i += 2) {
    const a = OLC.indexOf(c[i]);
    const b = OLC.indexOf(c[i + 1]);
    if (a < 0 || b < 0) return null;
    lat += a * res;
    lng += b * res;
    if (i + 2 < n) res /= 20;
  }
  return { lat: lat - 90 + res / 2, lng: lng - 180 + res / 2 };
}

function olcEncodePrefix(lat: number, lng: number, digits: number) {
  let la = Math.min(179.999999, Math.max(0, lat + 90));
  let ln = (((lng + 180) % 360) + 360) % 360;
  let out = '';
  let res = 20;
  while (out.length < digits) {
    const a = Math.min(19, Math.floor(la / res));
    const b = Math.min(19, Math.floor(ln / res));
    out += OLC[a] + OLC[b];
    la -= a * res;
    ln -= b * res;
    res /= 20;
  }
  return out.slice(0, digits);
}

/** Código corto ("XQPG+CQV") → completo, usando una referencia cercana (la ciudad). */
function olcRecover(short: string, ref: { lat: number; lng: number }) {
  const sep = short.indexOf('+');
  const pad = 8 - sep;
  if (pad <= 0) return olcDecode(short);
  const resolution = Math.pow(20, 2 - pad / 2);
  const half = resolution / 2;
  const p = olcDecode(olcEncodePrefix(ref.lat, ref.lng, pad) + short.slice(0, sep) + '+' + short.slice(sep + 1));
  if (!p) return null;
  let { lat, lng } = p;
  if (ref.lat + half < lat && lat - resolution >= -90) lat -= resolution;
  else if (ref.lat - half > lat && lat + resolution <= 90) lat += resolution;
  if (ref.lng + half < lng) lng -= resolution;
  else if (ref.lng - half > lng) lng += resolution;
  return { lat, lng };
}

/* ─────────────────────────────── Búsqueda por nombre ─────────────────────────────── */

interface GeoHit {
  latitude: number;
  longitude: number;
  timezone?: string;
  name: string;
  admin1?: string;
  population?: number;
  feature_code?: string;
}

async function geocodeName(name: string): Promise<GeoHit[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=es&format=json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = (await res.json()) as { results?: GeoHit[] };
  return json.results ?? [];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/**
 * Busca cada parte de la dirección y elige el mejor lugar del país del almacén: preferimos
 * ciudades cuya provincia o estado también aparece en la dirección ("Valencia" + "Carabobo"),
 * y entre homónimos, la más poblada. El país entero no sirve (es solo el centro del mapa).
 */
async function bestPlace(names: string[], tz: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const all = names.map(norm);
  let best: { hit: GeoHit; score: number } | null = null;
  for (const n of names) {
    let hits: GeoHit[] = [];
    try {
      hits = await geocodeName(n);
    } catch {
      hits = [];
    }
    for (const h of hits) {
      if (h.timezone !== tz || h.feature_code === 'PCLI') continue;
      const admin = norm(h.admin1 ?? '');
      const adminMatch = all.some((t) => t !== norm(h.name) && t.length > 3 && admin.includes(t));
      const score = (adminMatch ? 2 : 0) + (h.feature_code?.startsWith('PPL') ? 0.5 : 0) + Math.log10((h.population ?? 0) + 1) / 7;
      if (!best || score > best.score) best = { hit: h, score };
    }
  }
  return best ? { lat: best.hit.latitude, lng: best.hit.longitude, label: best.hit.name } : null;
}

/** Calles y referencias: no son nombres de ciudad */
const STREET = /^(av\.?|avda\.?|avenida|calle|carretera|ruta|autopista|bulevar|boulevard|bodega|centro|edificio|local|km|kil[oó]metro|frente|contiguo|diagonal|zona industrial|parque)(\s|\.|$)/i;

/** Partes de la dirección que parecen nombres de lugar (sin números ni frases largas). */
function placeNames(text: string) {
  const out: string[] = [];
  for (const raw of text.split(',')) {
    const t = raw
      .replace(/\(.*?\)/g, '')
      .replace(/^\s*(provincia|cant[oó]n|distrito|estado|municipio)\s+de\s+/i, '')
      // códigos postales y números sueltos fuera ("Valencia 2003" → "Valencia")
      .replace(/\d+/g, '')
      .trim();
    if (!t || /\d/.test(t) || t.length > 40 || t.split(/\s+/).length > 4 || STREET.test(t)) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

async function resolve(location: string, tz: string): Promise<GeoPoint | null> {
  const text = location.trim();

  const coords = text.match(/(-?\d{1,2}\.\d{3,})\s*[, ]\s*(-?\d{1,3}\.\d{3,})/);
  if (coords) return { lat: Number(coords[1]), lng: Number(coords[2]), source: 'coords' };

  const plus = text.toUpperCase().match(/([23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,3})/);
  const names = placeNames(plus ? text.replace(plus[1], '') : text);

  if (plus && plus[1].indexOf('+') === 8) {
    const p = olcDecode(plus[1]);
    if (p) return { ...p, source: 'pluscode' };
  }

  const city = names.length ? await bestPlace(names, tz) : null;
  const fb = TZ_FALLBACK[tz];
  const ref = city ?? (fb ? { lat: fb[0], lng: fb[1], label: fb[2] } : null);

  if (plus && ref) {
    const p = olcRecover(plus[1], ref);
    if (p) return { ...p, source: 'pluscode' };
  }
  if (city) return { lat: city.lat, lng: city.lng, source: 'ciudad', label: city.label };
  if (fb) return { lat: fb[0], lng: fb[1], source: 'pais', label: fb[2] };
  return null;
}

const pending = new Map<string, Promise<GeoPoint | null>>();

/** Coordenadas del almacén (con caché en el navegador por dirección). */
export function warehouseCoords(location: string | null | undefined, tz: string): Promise<GeoPoint | null> {
  const key = `${tz}|${(location ?? '').trim()}`;
  try {
    const cache = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, GeoPoint>;
    if (cache[key]) return Promise.resolve(cache[key]);
  } catch {
    /* sin caché */
  }
  let p = pending.get(key);
  if (!p) {
    p = resolve(location ?? '', tz).then((g) => {
      // las aproximadas por país no se guardan: si la búsqueda falló por red, se reintenta otro día
      if (g && g.source !== 'pais') {
        try {
          const cache = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, GeoPoint>;
          cache[key] = g;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
        } catch {
          /* sin caché */
        }
      }
      return g;
    });
    pending.set(key, p);
  }
  return p;
}
