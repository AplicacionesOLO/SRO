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

const OPS_URL = (import.meta.env.VITE_APPOLO_OPS_URL as string | undefined)?.trim() || '';

export function appoloConfigured() {
  return OPS_URL.length > 0;
}

const TIMEOUT_MS = 15_000;

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
