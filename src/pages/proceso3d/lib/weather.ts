import { useEffect, useState } from 'react';

/**
 * Clima por hora del almacén desde Open-Meteo (gratis, sin llave). Solo se envían las
 * coordenadas y la fecha. Tiempo real: pronóstico del día; días pasados: el clima que hubo.
 */

export interface WeatherHour {
  time: number;
  temp: number | null;
  /** mm en la hora */
  precip: number;
  /** 0–100 */
  cloud: number;
  code: number;
  wind: number;
  /** lluvia acumulada en las 2 horas anteriores (piso mojado) */
  recentPrecip: number;
}

interface DayWeather {
  hours: WeatherHour[];
}

const cache = new Map<string, { at: number; data: DayWeather | null }>();
const TTL_TODAY = 30 * 60_000;

async function fetchDay(lat: number, lng: number, day: string, tz: string, isToday: boolean): Promise<DayWeather | null> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}|${day}`;
  const hit = cache.get(key);
  if (hit && (!isToday || Date.now() - hit.at < TTL_TODAY)) return hit.data;

  const ageDays = (Date.now() - new Date(`${day}T12:00:00Z`).getTime()) / 86_400_000;
  const base = ageDays > 80 ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast';
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    hourly: 'temperature_2m,precipitation,cloud_cover,weather_code,wind_speed_10m',
    start_date: day,
    end_date: day,
    timezone: tz,
    timeformat: 'unixtime',
  });
  let data: DayWeather | null = null;
  try {
    const res = await fetch(`${base}?${params}`);
    if (res.ok) {
      const j = (await res.json()) as {
        hourly?: {
          time: number[];
          temperature_2m?: (number | null)[];
          precipitation?: (number | null)[];
          cloud_cover?: (number | null)[];
          weather_code?: (number | null)[];
          wind_speed_10m?: (number | null)[];
        };
      };
      const h = j.hourly;
      if (h?.time?.length) {
        const precip = h.time.map((_, i) => h.precipitation?.[i] ?? 0);
        data = {
          hours: h.time.map((t, i) => ({
            time: t * 1000,
            temp: h.temperature_2m?.[i] ?? null,
            precip: precip[i],
            cloud: h.cloud_cover?.[i] ?? 0,
            code: h.weather_code?.[i] ?? 0,
            wind: h.wind_speed_10m?.[i] ?? 0,
            recentPrecip: (precip[i - 1] ?? 0) + (precip[i - 2] ?? 0),
          })),
        };
      }
    }
  } catch {
    data = null;
  }
  cache.set(key, { at: Date.now(), data });
  return data;
}

/** Clima de la hora que se está viendo (tiempo real o la hora del recorrido). */
export function useWeather(params: { enabled: boolean; lat?: number; lng?: number; day: string; tz: string; isToday: boolean; clock: number }) {
  const { enabled, lat, lng, day, tz, isToday, clock } = params;
  const [state, setState] = useState<{ key: string; data: DayWeather | null }>({ key: '', data: null });
  const key = enabled && lat != null && lng != null ? `${lat},${lng}|${day}` : '';
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!key || lat == null || lng == null) return;
    let alive = true;
    fetchDay(lat, lng, day, tz, isToday).then((data) => alive && setState({ key, data }));
    return () => {
      alive = false;
    };
  }, [key, lat, lng, day, tz, isToday, refresh]);

  // Hoy: refrescar cada 30 min
  useEffect(() => {
    if (!key || !isToday) return;
    const id = setInterval(() => setRefresh((n) => n + 1), TTL_TODAY);
    return () => clearInterval(id);
  }, [key, isToday]);

  if (!key || state.key !== key || !state.data) return null;
  const hours = state.data.hours;
  let best = hours[0];
  for (const h of hours) if (h.time <= clock) best = h;
  return best ?? null;
}

/** Descripción corta y emoji del código WMO. */
export function weatherLabel(code: number, isNight: boolean): { text: string; icon: string } {
  if (code === 0) return { text: 'Despejado', icon: isNight ? '🌙' : '☀️' };
  if (code === 1) return { text: 'Mayormente despejado', icon: isNight ? '🌙' : '🌤️' };
  if (code === 2) return { text: 'Parcialmente nublado', icon: isNight ? '☁️' : '⛅' };
  if (code === 3) return { text: 'Nublado', icon: '☁️' };
  if (code === 45 || code === 48) return { text: 'Neblina', icon: '🌫️' };
  if (code >= 51 && code <= 57) return { text: 'Llovizna', icon: '🌦️' };
  if (code === 61 || code === 80) return { text: 'Lluvia ligera', icon: '🌧️' };
  if (code === 63 || code === 81) return { text: 'Lluvia', icon: '🌧️' };
  if (code === 65 || code === 82 || code === 66 || code === 67) return { text: 'Lluvia fuerte', icon: '🌧️' };
  if (code >= 95) return { text: 'Tormenta', icon: '⛈️' };
  return { text: 'Variable', icon: '🌥️' };
}
