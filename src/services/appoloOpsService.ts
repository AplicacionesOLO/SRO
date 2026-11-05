import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

/**
 * Integración de solo lectura con AppOLO (despachos y acomodo) para el módulo Proceso 3D.
 *
 * SRO NO guarda copia de los datos de AppOLO: los consulta en vivo a la API de AppOLO
 * y escucha un canal de avisos en tiempo real. El contrato completo está en
 * docs/integracion-appolo-proceso3d.md (versión 1).
 *
 * Configuración: VITE_APPOLO_OPS_URL = URL base de la función `ops-3d-snapshot` de AppOLO.
 * Sin esa variable la integración queda apagada y el 3D funciona igual que antes.
 */

export const APPOLO_CONTRACT_VERSION = 1;

/** Tipo de tarima en una posición del contenedor (despacho_dev_layout.slots[].type). */
export type AppoloSlotType = 'E' | 'S' | 'D' | 'T' | 'C';

export interface AppoloDispatchChange {
  estado: string;
  /** ISO */
  at: string;
}

export interface AppoloDispatch {
  id: string;
  /** Código de despacho_dev_estados (creado, en proceso, chofer_pendiente, completo, …) */
  estado: string;
  estado_nombre?: string | null;
  /** Puerta / andén de despacho tal como la registra AppOLO */
  puerta: string | null;
  placa: string | null;
  chofer?: string | null;
  transportista?: string | null;
  tienda?: string | null;
  referencia?: string | null;
  tipo?: string | null;
  tarimas_s?: number | null;
  tarimas_d?: number | null;
  /** 24 posiciones del contenedor (12 filas × 2), del frente hacia la puerta. Opcional. */
  layout?: AppoloSlotType[] | null;
  created_at: string;
  updated_at?: string | null;
  finalized_at?: string | null;
  /** Cambios de estado con su hora (despacho_dev_actividad), ordenados */
  history?: AppoloDispatchChange[] | null;
  /** Cantidad de fotos registradas en AppOLO para el despacho */
  fotos_count?: number | null;
  /** URLs firmadas (temporales, https) de las fotos del despacho. Opcional. */
  fotos?: string[] | null;
}

export interface AppoloReception {
  id: string;
  /** Id de la reserva de SRO (accion_recepcion.reservaId) */
  reserva_id: string | null;
  /** Andén de la descarga (idAnden) */
  puerta?: string | null;
  proveedor?: string | null;
  tipo_descarga?: string | null;
  bultos?: number | null;
  /** Inicio y fin del acomodo / recepción (ISO) */
  started_at?: string | null;
  completed_at?: string | null;
  /** URLs firmadas (temporales, https) de las fotos de la recepción. Opcional. */
  fotos?: string[] | null;
}

export interface AppoloEquipmentFamily {
  familia: string;
  activos: number;
  mantenimiento?: number;
  inactivos?: number;
}

export interface AppoloRealtimeGrant {
  /** URL del proyecto Supabase de AppOLO */
  url: string;
  /** Llave pública (anon) de AppOLO */
  anon_key: string;
  /** JWT de corta duración que autoriza SOLO a escuchar `channel` */
  token: string;
  /** Canal privado de avisos, p. ej. "ops3d:<bodega_id>" */
  channel: string;
  /** ISO */
  expires_at: string;
}

export interface AppoloSnapshot {
  version: number;
  generated_at: string;
  bodega?: { id: string; nombre?: string | null } | null;
  /** Catálogo de puertas de despacho que usa AppOLO (para dibujar las que no existen en SRO) */
  doors?: string[] | null;
  dispatches: AppoloDispatch[];
  receptions: AppoloReception[];
  equipment?: AppoloEquipmentFamily[] | null;
  realtime?: AppoloRealtimeGrant | null;
}

export class AppoloError extends Error {
  constructor(
    message: string,
    public readonly kind: 'config' | 'auth' | 'network' | 'contract' | 'server'
  ) {
    super(message);
  }
}

/** URL pública de la función (no es secreta: exige la sesión SRO del usuario). La variable de entorno la sobrescribe. */
const DEFAULT_OPS_URL = 'https://azwuzsukvqjogcfqljhg.supabase.co/functions/v1/ops-3d-snapshot';
const OPS_URL = (import.meta.env.VITE_APPOLO_OPS_URL as string | undefined)?.trim() || DEFAULT_OPS_URL;

export function appoloConfigured() {
  return OPS_URL.length > 0;
}

const TIMEOUT_MS = 15_000;

/** Solo URLs https: las fotos vienen firmadas por AppOLO y se muestran tal cual. */
export function appoloPhotoUrls(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((u): u is string => typeof u === 'string' && /^https:\/\//i.test(u));
}

/** Llamada GET a la función de AppOLO con la sesión de SRO. Devuelve el estado y el cuerpo. */
async function opsGet(sroWarehouseId: string, extra: Record<string, string>): Promise<{ status: number; body: unknown }> {
  if (!OPS_URL) throw new AppoloError('Integración con AppOLO no configurada', 'config');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AppoloError('Sesión de SRO no disponible', 'auth');

  const url = new URL(OPS_URL);
  url.searchParams.set('sro_warehouse_id', sroWarehouseId);
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  url.searchParams.set('v', String(APPOLO_CONTRACT_VERSION));

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: ctrl.signal });
  } catch {
    throw new AppoloError('No se pudo conectar con AppOLO', 'network');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 || res.status === 403) throw new AppoloError('AppOLO rechazó el acceso de este usuario', 'auth');
  if (res.status === 404) return { status: 404, body: null };
  if (!res.ok) throw new AppoloError(`AppOLO respondió ${res.status}`, 'server');
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** Persona marcada hoy en el reloj BIT2 (sección 1d del contrato). */
export interface AppoloPersona {
  id: string;
  nombre: string;
  puesto: string | null;
  departamento: string | null;
  escala: 'gerente' | 'coordinador' | 'colaborador';
  coordinador: string;
  gerente: string;
  estado: 'en_sitio' | 'pausa' | 'salio';
  entrada: string | null;
  salida: string | null;
  marcas: string[];
  horario: { entrada: string | null; salida: string | null };
  tarde: boolean;
}

export interface AppoloPersonal {
  disponible: true;
  fecha: string;
  ultima_sync: string | null;
  marcas_hasta: string | null;
  desactualizado: boolean;
  resumen: {
    en_sitio: number;
    en_pausa: number;
    salieron: number;
    por_escala: { gerente: number; coordinador: number; colaborador: number };
  };
  presentes_por_hora: number[];
  personas: AppoloPersona[];
}

function parsePersonal(b: any): AppoloPersonal | { disponible: false } {
  if (!b || typeof b !== 'object' || b.disponible !== true) return { disponible: false };
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const ESCALAS = ['gerente', 'coordinador', 'colaborador'] as const;
  const ESTADOS = ['en_sitio', 'pausa', 'salio'] as const;
  const r = b.resumen ?? {};
  const pe = r.por_escala ?? {};
  return {
    disponible: true,
    fecha: String(b.fecha ?? ''),
    ultima_sync: str(b.ultima_sync ?? b.actualizado_at),
    marcas_hasta: str(b.marcas_hasta),
    desactualizado: b.desactualizado === true,
    resumen: {
      en_sitio: num(r.en_sitio),
      en_pausa: num(r.en_pausa),
      salieron: num(r.salieron),
      por_escala: { gerente: num(pe.gerente), coordinador: num(pe.coordinador), colaborador: num(pe.colaborador) },
    },
    presentes_por_hora: Array.isArray(b.presentes_por_hora) && b.presentes_por_hora.length === 24 ? b.presentes_por_hora.map(num) : [],
    personas: (Array.isArray(b.personas) ? b.personas : [])
      .filter((p: any) => p && p.id != null && typeof p.nombre === 'string')
      .map(
        (p: any): AppoloPersona => ({
          id: String(p.id),
          nombre: p.nombre.trim(),
          puesto: str(p.puesto),
          departamento: str(p.departamento),
          escala: ESCALAS.includes(p.escala) ? p.escala : 'colaborador',
          coordinador: str(p.coordinador) ?? 'Sin coordinador',
          gerente: str(p.gerente) ?? 'Sin gerente',
          estado: ESTADOS.includes(p.estado) ? p.estado : 'en_sitio',
          entrada: str(p.entrada),
          salida: str(p.salida),
          marcas: Array.isArray(p.marcas) ? p.marcas.filter((m: unknown): m is string => typeof m === 'string') : [],
          horario: { entrada: str(p.horario?.entrada), salida: str(p.horario?.salida) },
          tarde: p.tarde === true,
        })
      ),
  };
}

/** Chofer registrado en AppOLO y boleta de salida del despacho (datos ya existentes, solo lectura). */
export interface AppoloDriverInfo {
  chofer: {
    nombre: string;
    cedula: string | null;
    compania: string | null;
    placa_camion: string | null;
    tipo_vehiculo: string | null;
    celular: string | null;
    cedula_foto: string | null;
  } | null;
  boleta: {
    id: string;
    estado: string | null;
    validada_at: string | null;
    validada_por: string | null;
    checklist: { item: string; ok: boolean | null }[];
    firma: string | null;
    placa_contenedor: string | null;
  } | null;
}

function parseDriverInfo(b: any): AppoloDriverInfo {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const img = (v: unknown) => appoloPhotoUrls([v])[0] ?? null;
  const c = b.chofer && typeof b.chofer === 'object' ? b.chofer : null;
  const bo = b.boleta && typeof b.boleta === 'object' ? b.boleta : null;
  return {
    chofer: c
      ? {
          nombre: str(c.nombre) ?? 'Sin nombre',
          cedula: str(c.cedula),
          compania: str(c.compania),
          placa_camion: str(c.placa_camion),
          tipo_vehiculo: str(c.tipo_vehiculo),
          celular: str(c.celular),
          cedula_foto: img(c.cedula_foto),
        }
      : null,
    boleta: bo
      ? {
          id: String(bo.id ?? ''),
          estado: str(bo.estado),
          validada_at: str(bo.validada_at),
          validada_por: str(bo.validada_por),
          checklist: Array.isArray(bo.checklist)
            ? bo.checklist
                .filter((x: any) => x && typeof x.item === 'string')
                .map((x: any) => ({ item: x.item, ok: typeof x.ok === 'boolean' ? x.ok : null }))
            : [],
          firma: img(bo.firma),
          placa_contenedor: str(bo.placa_contenedor),
        }
      : null,
  };
}

/** Validación mínima del contrato: si AppOLO cambia la forma, se informa en lugar de romper el 3D. */
function parseSnapshot(raw: any): AppoloSnapshot {
  if (!raw || typeof raw !== 'object') throw new AppoloError('Respuesta vacía de AppOLO', 'contract');
  if (raw.version !== APPOLO_CONTRACT_VERSION) {
    throw new AppoloError(`Versión de contrato de AppOLO no soportada (${String(raw.version)})`, 'contract');
  }
  const dispatches = Array.isArray(raw.dispatches) ? raw.dispatches : [];
  const receptions = Array.isArray(raw.receptions) ? raw.receptions : [];
  return {
    version: raw.version,
    generated_at: String(raw.generated_at ?? new Date().toISOString()),
    bodega: raw.bodega ?? null,
    doors: Array.isArray(raw.doors) ? raw.doors.map(String) : null,
    dispatches: dispatches
      .filter((d: any) => d && d.id != null && d.estado != null && d.created_at)
      .map((d: any) => ({ ...d, id: String(d.id), estado: String(d.estado).toLowerCase() })),
    receptions: receptions.filter((r: any) => r && r.id != null).map((r: any) => ({ ...r, id: String(r.id) })),
    equipment: Array.isArray(raw.equipment) ? raw.equipment : null,
    realtime: raw.realtime && raw.realtime.url && raw.realtime.token && raw.realtime.channel ? raw.realtime : null,
  };
}

export const appoloOpsService = {
  /**
   * Foto del día para un almacén de SRO. AppOLO resuelve su bodega a partir del almacén,
   * valida la sesión del usuario de SRO y devuelve solo datos de esa bodega.
   */
  async snapshot(params: { sroWarehouseId: string; date: string; tz: string }): Promise<AppoloSnapshot> {
    if (!OPS_URL) throw new AppoloError('Integración con AppOLO no configurada', 'config');
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new AppoloError('Sesión de SRO no disponible', 'auth');

    const url = new URL(OPS_URL);
    url.searchParams.set('sro_warehouse_id', params.sroWarehouseId);
    url.searchParams.set('date', params.date);
    url.searchParams.set('tz', params.tz);
    url.searchParams.set('v', String(APPOLO_CONTRACT_VERSION));

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: ctrl.signal,
      });
    } catch {
      throw new AppoloError('No se pudo conectar con AppOLO', 'network');
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) throw new AppoloError('AppOLO rechazó el acceso de este usuario', 'auth');
    if (!res.ok) throw new AppoloError(`AppOLO respondió ${res.status}`, 'server');
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new AppoloError('Respuesta inválida de AppOLO', 'contract');
    }
    return parseSnapshot(body);
  },

  /**
   * Fotos de carga de un despacho, a pedido (al abrir su tarjeta). AppOLO valida la sesión,
   * que el despacho sea de la bodega de ese almacén y devuelve URLs firmadas de corta duración.
   */
  async dispatchPhotos(params: { sroWarehouseId: string; despachoId: string }): Promise<string[]> {
    const { status, body } = await opsGet(params.sroWarehouseId, { fotos_despacho: params.despachoId });
    if (status === 404) return [];
    const b = body as { fotos?: unknown } | null;
    // Acepta ["https://…"] o [{ url: "https://…" }]
    const raw = Array.isArray(b?.fotos) ? b!.fotos.map((f: any) => (typeof f === 'string' ? f : f?.url)) : [];
    return appoloPhotoUrls(raw);
  },

  /**
   * Personal marcado hoy en el reloj BIT2 (solo OLO). Exige proceso3d.personal.view en SRO:
   * sin él AppOLO responde 403 ('auth'). Otro almacén → { disponible: false }.
   */
  async personal(params: { sroWarehouseId: string }): Promise<AppoloPersonal | { disponible: false }> {
    let res: { status: number; body: unknown };
    try {
      res = await opsGet(params.sroWarehouseId, { personal: '1' });
    } catch (e) {
      if (e instanceof AppoloError && e.message === 'AppOLO respondió 400') {
        throw new AppoloError('AppOLO todavía no envía el personal del reloj marcador', 'contract');
      }
      throw e;
    }
    const b = res.body as any;
    // Una versión anterior de la función ignora el parámetro y devuelve la foto del día
    if (b && typeof b === 'object' && Array.isArray(b.dispatches)) {
      throw new AppoloError('AppOLO todavía no envía el personal del reloj marcador', 'contract');
    }
    return parsePersonal(b);
  },

  /**
   * Chofer y boleta de salida de un despacho, a pedido (al abrir su tarjeta).
   * null = el despacho no es de esta bodega. Lanza 'contract' si AppOLO aún no ofrece este dato.
   */
  async dispatchDriver(params: { sroWarehouseId: string; despachoId: string }): Promise<AppoloDriverInfo | null> {
    let res: { status: number; body: unknown };
    try {
      res = await opsGet(params.sroWarehouseId, { chofer_despacho: params.despachoId });
    } catch (e) {
      // Una versión anterior de la función rechaza la consulta por faltar la fecha
      if (e instanceof AppoloError && e.message === 'AppOLO respondió 400') {
        throw new AppoloError('AppOLO todavía no envía los datos del chofer y la boleta', 'contract');
      }
      throw e;
    }
    const { status, body } = res;
    if (status === 404) return null;
    const b = body as any;
    // Una versión anterior de la función ignora el parámetro y devuelve la foto del día
    if (!b || typeof b !== 'object' || Array.isArray(b.dispatches) || !('chofer' in b || 'boleta' in b)) {
      throw new AppoloError('AppOLO todavía no envía los datos del chofer y la boleta', 'contract');
    }
    return parseDriverInfo(b);
  },

  /**
   * Escucha los avisos de cambio de AppOLO (broadcast privado, sin datos guardados).
   * Devuelve la función para dejar de escuchar.
   */
  listen(grant: AppoloRealtimeGrant, onChange: () => void, onStatus: (ok: boolean) => void): () => void {
    let client: SupabaseClient | null = null;
    let channel: RealtimeChannel | null = null;
    try {
      client = createClient(grant.url, grant.anon_key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'appolo-ops-3d' },
      });
      client.realtime.setAuth(grant.token);
      channel = client
        .channel(grant.channel, { config: { private: true } })
        .on('broadcast', { event: 'change' }, () => onChange())
        .subscribe((status) => onStatus(status === 'SUBSCRIBED'));
    } catch {
      onStatus(false);
    }
    return () => {
      if (client && channel) client.removeChannel(channel);
      client?.realtime.disconnect();
    };
  },
};
