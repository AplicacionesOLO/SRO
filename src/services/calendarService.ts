import { supabase } from '../lib/supabase';
import { emailTriggerService } from './emailTriggerService';

export interface Reservation {
  id: string;
  org_id: string;
  dock_id: string;
  start_datetime: string;
  end_datetime: string;
  dua: string | null;
  invoice: string | null;
  driver: string | null;
  status_id: string | null;
  notes: string | null;
  transport_type: string | null;
  cargo_type: string | null;
  /** Clasificación de la operación: distribucion | almacen | zona_franca */
  operation_type?: string | null;
  is_cancelled: boolean;
  cancel_reason: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  /** Indica si la reserva es consolidada (múltiples proveedores) */
  is_consolidated?: boolean;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string;

  purchase_order?: string | null;
  truck_plate?: string | null;
  order_request_number?: string | null;
  shipper_provider?: string | null;
  /** Origen de la carga */
  cargo_origin?: string | null;
  recurrence?: any | null;
  /** ID del cliente asociado a esta reserva (columna directa en reservations) */
  client_id?: string | null;
  /** BL / Conocimiento del contenedor — solo aplica cuando operation_type=zona_franca + is_imported=true */
  bl_number?: string | null;

  /** Cantidad capturada para tipos de carga dinámicos (contenedores, bultos, líneas, etc.) */
  quantity_value?: number | null;

  /** URL pública del QR simple */
  qr_image_url?: string | null;
  /** URL pública de la ficha de cita completa */
  qr_card_image_url?: string | null;

  status?: {
    name: string;
    code: string;
    color: string;
  };

  /** Perfil del usuario que creó la reserva (enriquecido en frontend) */
  creator?: {
    name: string | null;
    email: string | null;
  } | null;
}

/** Proveedor dentro de una reserva consolidada */
export interface ReservationConsolidatedProvider {
  id: string;
  reservation_id: string;
  org_id: string;
  provider_id: string;
  package_quantity: number;
  created_at: string;
  /** Nombre del proveedor (enriquecido en joins) */
  provider_name?: string;
}

export interface DockTimeBlock {
  id: string;
  org_id: string;
  dock_id: string;
  start_datetime: string;
  end_datetime: string;
  reason: string;
  created_by: string;
  created_at: string;
  creator?: {
    name: string;
    email: string;
  };
  dock?: {
    id: string;
    name: string;
    category?: {
      name: string;
      color: string;
    };
  };
  /** Timezone IANA del almacén asociado al dock (ej: America/Costa_Rica) */
  warehouse_timezone?: string;
}

export interface Dock {
  id: string;
  org_id: string;
  name: string;
  reference?: string | null;
  header_color?: string | null;
  category_id: string | null;
  status_id: string | null;
  is_active: boolean;
  warehouse_id?: string | null;
  /** Timezone IANA del almacén al que pertenece este dock (ej: America/Caracas) */
  warehouse_timezone?: string | null;
  category?: {
    name: string;
    code: string;
    color: string;
  };
  status?: {
    name: string;
    code: string;
    color: string;
    is_blocking: boolean;
  };
}

export interface Warehouse {
  id: string;
  org_id: string;
  name: string;
  location: string | null;

  business_start_time: string; // 'HH:MM:SS'
  business_end_time: string;   // 'HH:MM:SS'
  slot_interval_minutes: number; // 15 | 30 | 60
  timezone: string; // IANA timezone, e.g. 'America/Costa_Rica'
}

/**
 * Tabla: public.reservation_files
 *
 * id uuid
 * org_id uuid
 * reservation_id uuid
 * category text
 * file_name text
 * file_url text
 * file_size int
 * mime_type text
 * uploaded_by uuid
 * uploaded_at timestamptz
 */
export interface ReservationFile {
  id: string;
  org_id: string;
  reservation_id: string;
  category: string;
  file_name: string;
  file_url: string;      // guardamos la URL pública (si el bucket es public) o un URL base; igual sirve como referencia
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: string;
  uploaded_at: string;
}

// ── Cache global para segregation de getDocks ───────────────────────────
interface SegregationCacheEntry {
  allowedDockIds: Set<string>;
  timestamp: number;
}
const segregationCache = new Map<string, SegregationCacheEntry>();
const SEGREGATION_CACHE_TTL = 2 * 60 * 1000; // 2 minutos

// ── Cache global para getVisibleDockIds (solo IDs, ultra-ligero) ───────
interface DockIdsCacheEntry {
  dockIds: string[];
  timestamp: number;
}
const dockIdsCache = new Map<string, DockIdsCacheEntry>();
const DOCK_IDS_CACHE_TTL = 2 * 60 * 1000; // 2 minutos

function getDockIdsCacheKey(
  orgId: string,
  warehouseId: string | null,
  allowedWarehouseIds: string[] | null,
  allowedClientIds: string[] | null
): string {
  const whHash = allowedWarehouseIds ? [...allowedWarehouseIds].sort().join(',') : 'null';
  const clientHash = allowedClientIds ? [...allowedClientIds].sort().join(',') : 'null';
  return `dockIds:${orgId}:${warehouseId || 'all'}:${whHash}:${clientHash}`;
}

// ── Cache global para datos estáticos de calendario ─────────────────────
interface StaticCacheEntry<T> {
  data: T;
  timestamp: number;
}
const statusesCache = new Map<string, StaticCacheEntry<any[]>>();
const categoriesCache = new Map<string, StaticCacheEntry<any[]>>();
const STATIC_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

function getSegregationCacheKey(
  orgId: string,
  warehouseId: string | null,
  allowedClientIds: string[] | null,
  allDockIds: string[]
): string {
  const clientHash = allowedClientIds ? [...allowedClientIds].sort().join(',') : 'null';
  const dockHash = [...allDockIds].sort().join(',');
  return `${orgId}:${warehouseId || 'all'}:${clientHash}:${dockHash}`;
}
// ─────────────────────────────────────────────────────────────────────────

/**
 * ⚙️ Config Storage
 * Cambiá este bucket name si el tuyo se llama diferente en Supabase Storage.
 */
const RESERVATION_FILES_BUCKET = 'reservation-files';
const RESERVATION_QRS_BUCKET = 'reservation-qrs';

const buildQRStoragePath = (orgId: string, reservationId: string) => {
  return `${orgId}/reservations/${reservationId}/qr.png`;
};

const getPublicUrlForQR = (path: string) => {
  const { data } = supabase.storage.from(RESERVATION_QRS_BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? '';
};

/**
 * Genera el QR de una reserva y lo sube a Supabase Storage.
 * Devuelve la URL pública del QR (con cache-buster si forceRefresh) o null si falla.
 * Ejecuta en background; NO bloquea el flujo de creación.
 *
 * @param options.forceRefresh  true = siempre sube y agrega ?t=<ts> para invalidar caché
 */
export async function ensureReservationQR(
  orgId: string,
  reservationId: string,
  options?: { forceRefresh?: boolean }
): Promise<string | null> {
  const forceRefresh = options?.forceRefresh ?? false;
  console.log('[QR] ensureReservationQR START', { reservationId, orgId, forceRefresh });
  try {
    const { generateQRBlob } = await import('@/utils/reservationQr.utils');
    const blob = await generateQRBlob(reservationId);

    const path = buildQRStoragePath(orgId, reservationId);
    console.log('[QR] uploading to storage', { path, bucket: RESERVATION_QRS_BUCKET });

    const { error: uploadError } = await supabase.storage
      .from(RESERVATION_QRS_BUCKET)
      .upload(path, blob, {
        cacheControl: '3600',
        upsert: true,
        contentType: 'image/png',
      });

    if (uploadError) {
      console.error('[QR] upload error', { reservationId, error: uploadError.message });
      return null;
    }

    const baseUrl = getPublicUrlForQR(path);
    // Agregar cache-buster cuando se fuerza regeneración para que los clientes no usen la versión anterior
    const publicUrl = forceRefresh && baseUrl ? `${baseUrl}?t=${Date.now()}` : baseUrl;
    console.log('[QR] upload success', { reservationId, publicUrl });

    // Guardar qr_image_url en la reserva
    if (publicUrl) {
      const { error: updateError } = await supabase
        .from('reservations')
        .update({ qr_image_url: publicUrl })
        .eq('id', reservationId)
        .eq('org_id', orgId);

      if (updateError) {
        console.error('[QR] update reservations.qr_image_url error', { reservationId, error: updateError.message });
      } else {
        console.log('[QR] qr_image_url updated', { reservationId });
      }
    }

    return publicUrl;
  } catch (err: any) {
    console.error('[QR] ensureReservationQR error', { reservationId, error: err?.message ?? String(err) });
    return null;
  }
}

const buildQRCardStoragePath = (orgId: string, reservationId: string) => {
  return `${orgId}/reservations/${reservationId}/card.png`;
};

const getPublicUrlForQRCard = (path: string) => {
  const { data } = supabase.storage.from(RESERVATION_QRS_BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? '';
};

/**
 * Genera la ficha de cita (imagen completa tipo tarjeta) y la sube a Storage.
 * Devuelve la URL pública o null si falla.
 * Esta función es self-contained: resuelve provider name, timezone, genera canvas y sube.
 *
 * @param options.forceRefresh  true = omite el check "ya existe" y sobreescribe siempre
 */
export async function ensureReservationQRCard(
  orgId: string,
  reservationId: string,
  options?: { forceRefresh?: boolean }
): Promise<string | null> {
  const forceRefresh = options?.forceRefresh ?? false;
  console.log('[QR-CARD] ensureReservationQRCard START', { reservationId, orgId, forceRefresh });

  try {
    // 1. Verificar si ya existe (solo si NO es forceRefresh)
    if (!forceRefresh) {
      const { data: existing } = await supabase
        .from('reservations')
        .select('qr_card_image_url')
        .eq('id', reservationId)
        .eq('org_id', orgId)
        .maybeSingle();

      if (existing?.qr_card_image_url) {
        console.log('[QR-CARD] already exists, skipping', { reservationId });
        return existing.qr_card_image_url;
      }
    }

    // 2. Traer datos de la reserva
    const { data: reservation, error: resErr } = await supabase
      .from('reservations')
      .select('id, org_id, dock_id, shipper_provider, start_datetime, end_datetime, operation_type')
      .eq('id', reservationId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (resErr || !reservation) {
      console.error('[QR-CARD] fetch reservation error', { reservationId, error: resErr?.message });
      return null;
    }

    // 3. Resolver nombre del proveedor
    let providerName = reservation.shipper_provider || '—';
    const looksLikeUuid = /^[0-9a-f-]{36}$/i.test(providerName);
    if (looksLikeUuid) {
      const { data: providerData } = await supabase
        .from('providers')
        .select('name')
        .eq('id', providerName)
        .maybeSingle();
      if (providerData?.name) providerName = providerData.name;
    }

    // 4. Resolver timezone del almacén
    let warehouseTimezone = 'America/Costa_Rica';
    if (reservation.dock_id) {
      const { data: dockData } = await supabase
        .from('docks')
        .select('warehouse_id')
        .eq('id', reservation.dock_id)
        .maybeSingle();

      if (dockData?.warehouse_id) {
        const { data: whData } = await supabase
          .from('warehouses')
          .select('timezone')
          .eq('id', dockData.warehouse_id)
          .maybeSingle();
        if (whData?.timezone) warehouseTimezone = whData.timezone;
      }
    }

    // 5. Generar imagen de ficha
    const { generateQRCardBlob } = await import('@/utils/reservationQr.utils');
    const blob = await generateQRCardBlob({
      id: reservationId,
      providerName,
      startDatetime: reservation.start_datetime,
      endDatetime: reservation.end_datetime,
      operationType: reservation.operation_type,
      warehouseTimezone,
    });

    // 6. Subir a Storage
    const path = buildQRCardStoragePath(orgId, reservationId);
    console.log('[QR-CARD] uploading to storage', { path, bucket: RESERVATION_QRS_BUCKET });

    const { error: uploadError } = await supabase.storage
      .from(RESERVATION_QRS_BUCKET)
      .upload(path, blob, {
        cacheControl: '3600',
        upsert: true,
        contentType: 'image/png',
      });

    if (uploadError) {
      console.error('[QR-CARD] upload error', { reservationId, error: uploadError.message });
      return null;
    }

    // 7. Guardar URL pública en la reserva (con cache-buster si forceRefresh)
    const baseUrl = getPublicUrlForQRCard(path);
    const publicUrl = forceRefresh && baseUrl ? `${baseUrl}?t=${Date.now()}` : baseUrl;
    console.log('[QR-CARD] card upload success', { reservationId, publicUrl });

    if (publicUrl) {
      const { error: updateError } = await supabase
        .from('reservations')
        .update({ qr_card_image_url: publicUrl })
        .eq('id', reservationId)
        .eq('org_id', orgId);

      if (updateError) {
        console.error('[QR-CARD] update reservations.qr_card_image_url error', { reservationId, error: updateError.message });
      } else {
        console.log('[QR-CARD] qr_card_image_url updated', { reservationId });
      }
    }

    return publicUrl;
  } catch (err: any) {
    console.error('[QR-CARD] ensureReservationQRCard error', { reservationId, error: err?.message ?? String(err) });
    return null;
  }
}

/**
 * Regenera ambos assets QR (imagen QR simple + ficha de cita) para una reserva actualizada.
 * Sobreescribe el archivo en Storage y agrega ?t=<timestamp> como cache-buster.
 * Registra la regeneración en activity_log.
 * NO BLOQUEA: si falla, la reserva ya fue guardada correctamente.
 *
 * Llamar DESPUÉS de un updateReservation exitoso.
 */
export async function regenerateReservationQRAssets(
  orgId: string,
  reservationId: string
): Promise<void> {
  console.log('[QR] regenerate START', { reservationId });

  try {
    // Regenerar ambos assets en paralelo con forceRefresh = true
    const [qrUrl, cardUrl] = await Promise.all([
      ensureReservationQR(orgId, reservationId, { forceRefresh: true }),
      ensureReservationQRCard(orgId, reservationId, { forceRefresh: true }),
    ]);

    if (qrUrl) {
      console.log('[QR] qr_image_url updated (regenerate)', { reservationId });
    } else {
      console.warn('[QR] regenerate failed: qr_image_url is null', { reservationId });
    }

    if (cardUrl) {
      console.log('[QR] qr_card_image_url updated (regenerate)', { reservationId });
    } else {
      console.warn('[QR] regenerate failed: qr_card_image_url is null', { reservationId });
    }

    if (!qrUrl && !cardUrl) {
      console.error('[QR] regenerate failed: both assets returned null', { reservationId });
      // Registrar el fallo en activity_log de todas formas
      await supabase.from('activity_log').insert({
        org_id: orgId,
        entity_type: 'reservation',
        entity_id: reservationId,
        action: 'updated',
        field: 'qr_regenerated',
        old_value: null,
        new_value: 'ERROR: No se pudieron regenerar los assets QR.',
        actor_user_id: null,
      });
      return;
    }

    // Registrar actividad exitosa
    const { data: { user } } = await supabase.auth.getUser();
    const { error: logError } = await supabase.from('activity_log').insert({
      org_id: orgId,
      entity_type: 'reservation',
      entity_id: reservationId,
      action: 'updated',
      field: 'qr_regenerated',
      old_value: null,
      new_value: 'Ficha QR actualizada automáticamente después de modificar la reserva.',
      actor_user_id: user?.id ?? null,
    });

    if (logError) {
      console.warn('[ACTIVITY] reservation QR log write error:', logError.message);
    } else {
      console.log('[ACTIVITY] reservation QR updated logged', { reservationId });
    }
  } catch (err: any) {
    console.error('[QR] regenerate failed', { reservationId, error: err?.message ?? String(err) });
  }
}

const sanitizeFileName = (name: string) => {
  const clean = name
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w.\-()]/g, ''); // quita caracteres raros
  return clean.length ? clean : 'archivo';
};

const buildStoragePath = (orgId: string, reservationId: string, category: string, fileName: string) => {
  const safeName = sanitizeFileName(fileName);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return `${orgId}/reservations/${reservationId}/${category}/${ts}_${safeName}`;
};

const getPublicUrl = (path: string) => {
  const { data } = supabase.storage.from(RESERVATION_FILES_BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? '';
};

/**
 * Si tu bucket NO es público, vas a necesitar signed urls para descargar/ver.
 * Esto te genera una URL temporal (ej. 60 min).
 */
const createSignedUrl = async (path: string, expiresInSeconds = 60 * 60) => {
  const { data, error } = await supabase.storage
    .from(RESERVATION_FILES_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error) throw error;
  return data?.signedUrl ?? '';
};

/**
 * Helper para intentar obtener "path" desde file_url.
 * - Si guardamos publicUrl, extrae lo que viene después de `/${bucket}/`
 * - Si guardamos path directo, lo retorna tal cual.
 */
const tryExtractPathFromFileUrl = (fileUrlOrPath: string) => {
  if (!fileUrlOrPath) return '';
  if (!fileUrlOrPath.startsWith('http')) return fileUrlOrPath;

  // patrón típico supabase storage public url:
  // https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
  const marker = `/object/public/${RESERVATION_FILES_BUCKET}/`;
  const idx = fileUrlOrPath.indexOf(marker);
  if (idx === -1) return '';
  return fileUrlOrPath.substring(idx + marker.length);
};

export const calendarService = {
  async getReservations(
    orgId: string,
    startDate: string,
    endDate: string,
    allowedWarehouseIds?: string[] | null,
    allowedDockIds?: string[] | null
  ): Promise<Reservation[]> {
    // ── RUTA RÁPIDA: dock_ids explícitos → consulta indexada por dock_id ──
    // Usamos select ligero sin join a reservation_statuses para evitar I/O pesado
    // y reducir la carga de evaluación RLS por fila. Los statuses se enriquecen en frontend.
    if (allowedDockIds && allowedDockIds.length > 0) {
      const { data, error } = await supabase
        .from('reservations')
        .select(
          `id, org_id, dock_id, start_datetime, end_datetime, status_id, is_cancelled,
           cancel_reason, cancelled_by, cancelled_at, dua, invoice, driver, truck_plate,
           purchase_order, order_request_number, shipper_provider, client_id,
           operation_type, is_imported, bl_number, quantity_value, notes,
           transport_type, cargo_type, created_by, created_at, updated_by, updated_at,
           is_consolidated, qr_image_url, qr_card_image_url, recurrence`
        )
        .eq('org_id', orgId)
        .eq('is_cancelled', false)
        .gte('start_datetime', startDate)
        .lte('start_datetime', endDate)
        .in('dock_id', allowedDockIds)
        .order('start_datetime', { ascending: true });

      if (error) {
        return [];
      }

      const result = (data || []) as Reservation[];

      if (result.length > 0) {
        const creatorIds = [...new Set(result.map((r) => r.created_by).filter(Boolean))];
        if (creatorIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, name, email')
            .in('id', creatorIds);
          const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
          const enriched = result.map((r) => ({
            ...r,
            creator: profileMap.get(r.created_by) ?? null,
          }));
          return enriched;
        }
      }

      return result;
    }

    // ── Legacy fallback: pre-calcular dock_ids desde warehouses ───────────
    let resolvedDockIds: string[] | undefined;
    if (allowedWarehouseIds && allowedWarehouseIds.length > 0) {
      const { data: docksData } = await supabase
        .from('docks')
        .select('id')
        .eq('org_id', orgId)
        .in('warehouse_id', allowedWarehouseIds);
      resolvedDockIds = (docksData ?? []).map((d: any) => d.id as string);
      if (resolvedDockIds.length === 0) return [];
    }

    let query = supabase
      .from('reservations')
      .select(`
        *,
        status:reservation_statuses(name, code, color)
      `)
      .eq('org_id', orgId)
      .eq('is_cancelled', false)
      .gte('start_datetime', startDate)
      .lte('start_datetime', endDate);

    if (resolvedDockIds && resolvedDockIds.length > 0) {
      query = query.in('dock_id', resolvedDockIds);
    }

    const { data, error } = await query.order('start_datetime', { ascending: true });

    if (error) {
      return [];
    }

    const result = data || [];

    if (result.length > 0) {
      const creatorIds = [...new Set(result.map((r) => r.created_by).filter(Boolean))];
      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name, email')
          .in('id', creatorIds);
        const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
        const enriched = result.map((r) => ({
          ...r,
          creator: profileMap.get(r.created_by) ?? null,
        }));
        return enriched;
      }
    }

    return result;
  },

  // Igual que getReservations pero SIN filtrar is_cancelled — para el módulo de Reservas
  async getAllReservations(
    orgId: string,
    startDate: string,
    endDate: string,
    allowedWarehouseIds?: string[] | null,
    allowedDockIds?: string[] | null
  ): Promise<Reservation[]> {
    // ── RUTA RÁPIDA: dock_ids explícitos ──────────────────────────────────
    if (allowedDockIds && allowedDockIds.length > 0) {
      const { data, error } = await supabase
        .from('reservations')
        .select(`
          *,
          status:reservation_statuses(name, code, color)
        `)
        .eq('org_id', orgId)
        .gte('start_datetime', startDate)
        .lte('start_datetime', endDate)
        .in('dock_id', allowedDockIds)
        .order('start_datetime', { ascending: false });

      if (error) {
        return [];
      }
      return data || [];
    }

    // ── Legacy fallback: pre-calcular desde warehouses ────────────────────
    let resolvedDockIds: string[] | undefined;
    if (allowedWarehouseIds && allowedWarehouseIds.length > 0) {
      const { data: docksData } = await supabase
        .from('docks')
        .select('id')
        .eq('org_id', orgId)
        .in('warehouse_id', allowedWarehouseIds);
      resolvedDockIds = (docksData ?? []).map((d: any) => d.id as string);
      if (resolvedDockIds.length === 0) return [];
    }

    let query = supabase
      .from('reservations')
      .select(`
        *,
        status:reservation_statuses(name, code, color)
      `)
      .eq('org_id', orgId)
      .gte('start_datetime', startDate)
      .lte('start_datetime', endDate);

    if (resolvedDockIds && resolvedDockIds.length > 0) {
      query = query.in('dock_id', resolvedDockIds);
    }

    const { data, error } = await query.order('start_datetime', { ascending: false });

    if (error) {
      return [];
    }
    return data || [];
  },

  async getDockTimeBlocks(orgId: string, startDate: string, endDate: string, allowedDockIds?: string[]): Promise<DockTimeBlock[]> {
    let query = supabase
      .from('dock_time_blocks')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_cancelled', false)
      .lt('start_datetime', endDate)
      .gt('end_datetime', startDate)
      .order('start_datetime', { ascending: true });

    if (allowedDockIds && allowedDockIds.length > 0) {
      query = query.in('dock_id', allowedDockIds);
    }

    const { data, error } = await query;

    if (error) {
      return [];
    }

    if (data && data.length > 0) {
      const creatorIds = [...new Set(data.map((b) => b.created_by))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', creatorIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

      const enriched = data.map((block) => ({
        ...block,
        creator: profileMap.get(block.created_by) || undefined,
      }));
      return enriched;
    }

    return data || [];
  },

  async getAllDockTimeBlocksForManagement(orgId: string): Promise<DockTimeBlock[]> {
    const { data, error } = await supabase
      .from('dock_time_blocks')
      .select('*')
      .eq('org_id', orgId)
      .order('start_datetime', { ascending: false });

    if (error) return [];

    if (data && data.length > 0) {
      const creatorIds = [...new Set(data.map((b) => b.created_by))];
      const dockIds = [...new Set(data.map((b) => b.dock_id))];

      const [profilesResult, docksResult] = await Promise.all([
        supabase.from('profiles').select('id, name, email').in('id', creatorIds),
        supabase
          .from('docks')
          .select('id, name, reference, warehouse_id, category:dock_categories(name, color)')
          .in('id', dockIds),
      ]);

      const profileMap = new Map((profilesResult.data || []).map((p) => [p.id, p]));
      const dockMap = new Map((docksResult.data || []).map((d) => [d.id, d]));

      // ✅ Traer warehouses para obtener timezone de cada dock
      const warehouseIds = [...new Set(
        (docksResult.data || [])
          .map((d) => (d as any).warehouse_id)
          .filter(Boolean)
      )];
      let warehouseMap = new Map<string, string>();
      if (warehouseIds.length > 0) {
        const { data: whData } = await supabase
          .from('warehouses')
          .select('id, timezone')
          .in('id', warehouseIds);
        (whData || []).forEach((w: any) => warehouseMap.set(w.id, w.timezone || 'America/Costa_Rica'));
      }

      return data.map((block) => {
        const dock = dockMap.get(block.dock_id);
        const warehouseId = (dock as any)?.warehouse_id;
        return {
          ...block,
          creator: profileMap.get(block.created_by) || undefined,
          dock: dock || undefined,
          warehouse_timezone: warehouseId ? warehouseMap.get(warehouseId) : 'America/Costa_Rica',
        };
      });
    }

    return data || [];
  },

  /**
   * RUTA ULTRA-RÁPIDA: devuelve SOLO los IDs de docks visibles.
   * NO trae joins, NO trae datos de UI. ~10-20ms vs 300-600ms de getDocks().
   * Cacheada por orgId + warehouseId + allowedWarehouseIds + allowedClientIds.
   */
  async getVisibleDockIds(
    orgId: string,
    warehouseId?: string | null,
    allowedWarehouseIds?: string[] | null,
    allowedClientIds?: string[] | null
  ): Promise<string[]> {
    const cacheKey = getDockIdsCacheKey(orgId, warehouseId || null, allowedWarehouseIds || null, allowedClientIds || null);
    const cached = dockIdsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < DOCK_IDS_CACHE_TTL) {
      return cached.dockIds;
    }

    // 1. Traer solo id, warehouse_id — SIN joins
    let query = supabase
      .from('docks')
      .select('id, warehouse_id')
      .eq('org_id', orgId)
      .eq('is_active', true);

    if (warehouseId) {
      query = query.eq('warehouse_id', warehouseId);
    } else if (allowedWarehouseIds && allowedWarehouseIds.length > 0) {
      query = query.in('warehouse_id', allowedWarehouseIds);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[DOCK-FAST] getVisibleDockIds query error', error);
      return [];
    }

    let filteredIds: string[] = (data || []).map((d) => (d as any).id);

    // 2. Segregación por clientes (si aplica)
    if (allowedClientIds && allowedClientIds.length > 0) {
      // Reutilizar cache de segregation si ya existe
      const segCacheKey = getSegregationCacheKey(orgId, warehouseId || null, allowedClientIds, filteredIds);
      const cachedSeg = segregationCache.get(segCacheKey);
      const now = Date.now();

      if (cachedSeg && (now - cachedSeg.timestamp) < SEGREGATION_CACHE_TTL) {
        filteredIds = filteredIds.filter((id) => cachedSeg.allowedDockIds.has(id));
      } else {
        const { data: clientDockRows } = await supabase
          .from('client_docks')
          .select('dock_id')
          .eq('org_id', orgId)
          .in('client_id', allowedClientIds)
          .in('dock_id', filteredIds);

        if (clientDockRows && clientDockRows.length > 0) {
          const allowedSet = new Set(clientDockRows.map((r: any) => r.dock_id as string));
          segregationCache.set(segCacheKey, {
            allowedDockIds: allowedSet,
            timestamp: Date.now(),
          });
          filteredIds = filteredIds.filter((id) => allowedSet.has(id));
        } else {
          filteredIds = [];
        }
      }
    }

    dockIdsCache.set(cacheKey, { dockIds: filteredIds, timestamp: Date.now() });
    return filteredIds;
  },

  invalidateDockIdsCache(orgId: string, warehouseId?: string | null) {
    const prefix = `dockIds:${orgId}:${warehouseId || 'all'}:`;
    for (const key of dockIdsCache.keys()) {
      if (key.startsWith(prefix)) {
        dockIdsCache.delete(key);
      }
    }
  },

  async getDocks(
    orgId: string,
    warehouseId?: string | null,
    allowedWarehouseIds?: string[] | null,
    allowedClientIds?: string[] | null,
    warehouseTimezoneMap?: Map<string, string>
  ): Promise<Dock[]> {
    let query = supabase
      .from('docks')
      .select(`
        *,
        reference,
        category:dock_categories(name, code, color),
        status:dock_statuses(name, code, color, is_blocking)
      `)
      .eq('org_id', orgId)
      .eq('is_active', true);

    if (warehouseId) {
      query = query.eq('warehouse_id', warehouseId);
    } else if (allowedWarehouseIds && allowedWarehouseIds.length > 0) {
      query = query.in('warehouse_id', allowedWarehouseIds);
    }

    const { data, error } = await query.order('name', { ascending: true });

    if (error) {
      return [];
    }

    if (!data || data.length === 0) return [];

    let filteredData = data as any[];

    // ── SEGREGACIÓN por clientes asignados al usuario ─────────────────────
    if (allowedClientIds && allowedClientIds.length > 0) {
      const allDockIds = filteredData.map((d: any) => d.id);

      // Verificar cache de segregation
      const segCacheKey = getSegregationCacheKey(orgId, warehouseId || null, allowedClientIds, allDockIds);
      const cachedSeg = segregationCache.get(segCacheKey);
      const now = Date.now();

      if (cachedSeg && (now - cachedSeg.timestamp) < SEGREGATION_CACHE_TTL) {
        filteredData = filteredData.filter((d: any) => cachedSeg.allowedDockIds.has(d.id));
      } else {
        const { data: clientDockRows } = await supabase
          .from('client_docks')
          .select('dock_id')
          .eq('org_id', orgId)
          .in('client_id', allowedClientIds)
          .in('dock_id', allDockIds);

        if (clientDockRows && clientDockRows.length > 0) {
          const allowedDockIds = new Set(clientDockRows.map((r: any) => r.dock_id as string));
          segregationCache.set(segCacheKey, {
            allowedDockIds,
            timestamp: Date.now(),
          });
          filteredData = filteredData.filter((d: any) => allowedDockIds.has(d.id));
        } else {
          filteredData = [];
        }
      }
    }

    if (filteredData.length === 0) {
      return [];
    }

    // Enriquecer cada dock con el timezone de su almacén
    // Si se pasó un mapa de timezones desde el contexto, usarlo directamente
    if (warehouseTimezoneMap && warehouseTimezoneMap.size > 0) {
      const result = filteredData.map((dock: any) => ({
        ...dock,
        warehouse_timezone: dock.warehouse_id
          ? (warehouseTimezoneMap.get(dock.warehouse_id) || null)
          : null,
      }));
      return result;
    }

    // Fallback: query a warehouses
    const warehouseIds = [...new Set(
      filteredData.map((d: any) => d.warehouse_id).filter(Boolean)
    )] as string[];

    let resolvedTimezoneMap = new Map<string, string>();
    if (warehouseIds.length > 0) {
      const { data: whData } = await supabase
        .from('warehouses')
        .select('id, timezone')
        .in('id', warehouseIds);
      (whData || []).forEach((w: any) => {
        resolvedTimezoneMap.set(w.id, w.timezone || 'America/Costa_Rica');
      });
    }

    const result = filteredData.map((dock: any) => ({
      ...dock,
      warehouse_timezone: dock.warehouse_id
        ? (resolvedTimezoneMap.get(dock.warehouse_id) || null)
        : null,
    }));
    return result;
  },

  async getWarehouses(orgId: string): Promise<Warehouse[]> {
    const { data, error } = await supabase
      .from('warehouses')
      .select('id, org_id, name, location, business_start_time, business_end_time, slot_interval_minutes, timezone')
      .eq('org_id', orgId)
      .order('name', { ascending: true });

    if (error) {
      // console.error('[Calendar] warehousesError', {
      //   code: error.code,
      //   message: error.message,
      //   details: error.details,
      //   hint: error.hint,
      // });
      return [];
    }

    //console.log('[Calendar] warehouses loaded', { count: data?.length || 0 });
    return (data || []) as Warehouse[];
  },

  async createReservation(reservation: Partial<Reservation>): Promise<Reservation> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuario no autenticado');

    // ✅ PASO 1: Insertar y pedir SOLO el id
    const { data, error } = await supabase
      .from('reservations')
      .insert({
        ...reservation,
        created_by: user.id,
        updated_by: user.id,
      })
      .select('id')
      .single();

    if (error) {
      // console.error('[Calendar] createReservationError', {
      //   code: error.code,
      //   message: error.message,
      //   details: error.details,
      //   hint: error.hint,
      //   payload: reservation,
      // });

      // ✅ Detectar error de constraint de solape
      const errorMsg = error.message?.toLowerCase() || '';
      const errorDetails = error.details?.toLowerCase() || '';
      const errorHint = error.hint?.toLowerCase() || '';
      
      if (
        errorMsg.includes('reservations_no_overlap') ||
        errorMsg.includes('exclusion constraint') ||
        errorDetails.includes('reservations_no_overlap') ||
        errorDetails.includes('exclusion constraint') ||
        errorHint.includes('reservations_no_overlap') ||
        errorHint.includes('exclusion constraint')
      ) {
        const customError = new Error('Ese andén ya está reservado en ese horario. Elegí otro espacio.');
        (customError as any).code = 'OVERLAP_CONFLICT';
        throw customError;
      }

      throw error;
    }

    // ✅ PASO 2: Intentar cargar el detalle completo (opcional)
    const { data: full, error: fetchErr } = await supabase
      .from('reservations')
      .select(`
        *,
        status:reservation_statuses(name, code, color)
      `)
      .eq('id', data.id)
      .single();

    // ✅ Disparar generación de QR en background (no bloqueante)
    if (reservation.org_id) {
      ensureReservationQR(reservation.org_id, data.id).catch(() => {
        // non-blocking: si falla, el QR simplemente no existe
      });
    }

    // ✅ Generar ficha de cita (bloqueante con catch, garantiza que exista antes del email)
    if (reservation.org_id) {
      await ensureReservationQRCard(reservation.org_id, data.id).catch(() => {
        // non-breaking: si falla, el correo sigue sin la ficha
      });
    }

    // Si hay error 403/RLS al leer, no fallar: devolver objeto mínimo
    if (fetchErr) {
      // console.warn('[Calendar] createReservation.fetchDetailWarning (403/RLS esperado)', {
      //   code: fetchErr.code,
      //   message: fetchErr.message,
      //   reservationId: data.id,
      // });

      // Devolver objeto mínimo con el id para que el modal pueda cerrar
      return {
        id: data.id,
        org_id: reservation.org_id || '',
        dock_id: reservation.dock_id || '',
        start_datetime: reservation.start_datetime || '',
        end_datetime: reservation.end_datetime || '',
        dua: reservation.dua || '',
        invoice: reservation.invoice?.trim() || null,
        driver: reservation.driver?.trim() || null,
        status_id: reservation.status_id || null,
        notes: reservation.notes || null,
        transport_type: reservation.transport_type || null,
        cargo_type: reservation.cargo_type || null,
        operation_type: reservation.operation_type || null,
        is_cancelled: false,
        cancel_reason: null,
        cancelled_by: null,
        cancelled_at: null,
        created_by: user.id,
        created_at: new Date().toISOString(),
        updated_by: user.id,
        updated_at: new Date().toISOString(),
        purchase_order: reservation.purchase_order || null,
        truck_plate: reservation.truck_plate || null,
        order_request_number: reservation.order_request_number || null,
        shipper_provider: reservation.shipper_provider || null,
        recurrence: reservation.recurrence || null,
        bl_number: reservation.bl_number || null,
      } as Reservation;
    }

    // ✅ Disparar evento de correspondencia
    if (full && reservation.org_id) {
      emailTriggerService.onReservationCreated(reservation.org_id, full).catch(err => {
        // console.error('[Calendar] Error al disparar correos de creación:', err);
      });
    }

    return full;
  },

  /**
   * Crea múltiples reservas recurrentes a partir de la reserva base ya creada.
   * Cada ocurrencia mantiene los datos del formulario original pero con sus propias fechas.
   *
   * @param baseReservation  Payload base (sin start/end — esos vienen de additionalDates)
   * @param additionalDates  Fechas de las ocurrencias ADICIONALES (no incluye la original)
   * @returns Resultado detallado por ocurrencia
   */
  async createRecurringReservations(
    baseReservation: Partial<Reservation>,
    additionalDates: Array<{ startDatetime: string; endDatetime: string }>
  ): Promise<{
    created_count: number;
    skipped_count: number;
    created_reservations: Reservation[];
    skipped_reservations: Array<{ startDatetime: string; reason: string }>;
  }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuario no autenticado');

    const created_reservations: Reservation[] = [];
    const skipped_reservations: Array<{ startDatetime: string; reason: string }> = [];

    for (const { startDatetime, endDatetime } of additionalDates) {
      const payload: Partial<Reservation> = {
        ...baseReservation,
        start_datetime: startDatetime,
        end_datetime: endDatetime,
        // recurrence no se copia en las ocurrencias hijas
        recurrence: null,
      };

      try {
        const created = await this.createReservation(payload);
        created_reservations.push(created);
      } catch (err: any) {
        const code = err?.code as string | undefined;
        const msg = (err?.message || '').toLowerCase();

        let reason = 'Error desconocido';
        if (
          code === 'OVERLAP_CONFLICT' ||
          msg.includes('overlap') ||
          msg.includes('ya está reservado') ||
          msg.includes('exclusion constraint')
        ) {
          reason = 'Conflicto: ese andén ya tiene una reserva en ese horario';
        } else if (msg.includes('horario') || msg.includes('business')) {
          reason = 'Fuera del horario hábil';
        } else if (err?.message) {
          reason = err.message;
        }

        skipped_reservations.push({ startDatetime, reason });
      }
    }

    return {
      created_count: created_reservations.length,
      skipped_count: skipped_reservations.length,
      created_reservations,
      skipped_reservations,
    };
  },

  async updateReservation(id: string, updates: Partial<Reservation>): Promise<Reservation> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuario no autenticado');

    // ✅ Obtener estado anterior si se está cambiando el status
    let oldStatusId: string | null = null;
    let oldOrgId: string | null = null;
    if (updates.status_id !== undefined) {
      const { data: oldReservation } = await supabase
        .from('reservations')
        .select('status_id, org_id')
        .eq('id', id)
        .maybeSingle();
      
      oldStatusId = oldReservation?.status_id || null;
      oldOrgId = oldReservation?.org_id || null;
    }

    const updatePayload = {
      ...updates,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    // ✅ PASO 1: Solo actualizar, sin pedir SELECT en el mismo query
    // Esto evita el error 406 cuando RLS no permite leer la fila después del UPDATE
    const { error } = await supabase
      .from('reservations')
      .update(updatePayload)
      .eq('id', id);

    if (error) {
      throw error;
    }

    // ✅ PASO 2: Leer el resultado en una query separada
    const { data: full, error: fetchErr } = await supabase
      .from('reservations')
      .select(`
        *,
        status:reservation_statuses(name, code, color)
      `)
      .eq('id', id)
      .maybeSingle();

    // ✅ CRÍTICO: Disparar emailTrigger SIEMPRE que el status haya cambiado,
    // independientemente de si pudimos leer el full row o no.
    // Si hay fetchErr/RLS, construimos un objeto mínimo con los datos disponibles.
    if (updates.status_id !== undefined && oldStatusId !== updates.status_id) {
      const reservationForTrigger = full ?? ({
        id,
        org_id: updates.org_id || oldOrgId || '',
        dock_id: updates.dock_id || '',
        start_datetime: updates.start_datetime || '',
        end_datetime: updates.end_datetime || '',
        dua: updates.dua || null,
        invoice: updates.invoice || null,
        driver: updates.driver || null,
        status_id: updates.status_id || null,
        notes: updates.notes || null,
        transport_type: updates.transport_type || null,
        cargo_type: updates.cargo_type || null,
        operation_type: updates.operation_type || null,
        is_cancelled: updates.is_cancelled ?? false,
        cancel_reason: updates.cancel_reason || null,
        cancelled_by: null,
        cancelled_at: null,
        created_by: '',
        created_at: '',
        updated_by: user.id,
        updated_at: new Date().toISOString(),
        purchase_order: updates.purchase_order || null,
        truck_plate: updates.truck_plate || null,
        order_request_number: updates.order_request_number || null,
        shipper_provider: updates.shipper_provider || null,
        recurrence: updates.recurrence || null,
        bl_number: updates.bl_number || null,
      } as Reservation);

      const triggerOrgId = reservationForTrigger.org_id || oldOrgId || updates.org_id || '';

      if (triggerOrgId) {
        // Usamos IIFE async para poder await y capturar el resultado real
        (async () => {
          try {
            await emailTriggerService.onReservationStatusChanged(
              triggerOrgId,
              reservationForTrigger,
              oldStatusId,
              updates.status_id || null
            );
          } catch (err: any) {
            // non-blocking
          }
        })();
      }
    }

    // Si RLS no permite leer (ej. usuario sin acceso directo), devolver objeto mínimo
    if (fetchErr || !full) {
      const fallback: Reservation = {
        id,
        org_id: updates.org_id || oldOrgId || '',
        dock_id: updates.dock_id || '',
        start_datetime: updates.start_datetime || '',
        end_datetime: updates.end_datetime || '',
        dua: updates.dua || null,
        invoice: updates.invoice || null,
        driver: updates.driver || null,
        status_id: updates.status_id || null,
        notes: updates.notes || null,
        transport_type: updates.transport_type || null,
        cargo_type: updates.cargo_type || null,
        operation_type: updates.operation_type || null,
        is_cancelled: updates.is_cancelled ?? false,
        cancel_reason: updates.cancel_reason || null,
        cancelled_by: null,
        cancelled_at: null,
        created_by: '',
        created_at: '',
        updated_by: user.id,
        updated_at: new Date().toISOString(),
        purchase_order: updates.purchase_order || null,
        truck_plate: updates.truck_plate || null,
        order_request_number: updates.order_request_number || null,
        shipper_provider: updates.shipper_provider || null,
        recurrence: updates.recurrence || null,
        bl_number: updates.bl_number || null,
      };

      return fallback;
    }

    return full;
  },

  async cancelReservation(id: string, reason: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuario no autenticado');

    const { error } = await supabase
      .from('reservations')
      .update({
        is_cancelled: true,
        cancel_reason: reason,
        cancelled_by: user.id,
        cancelled_at: new Date().toISOString(),
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      // console.error('[Calendar] cancelReservationError', {
      //   code: error.code,
      //   message: error.message,
      //   details: error.details,
      //   hint: error.hint,
      // });
      throw error;
    }
  },

  async deleteReservation(id: string): Promise<void> {
    const { error } = await supabase
      .from('reservations')
      .delete()
      .eq('id', id);

    if (error) {
      // console.error('[Calendar] deleteReservationError', {
      //   code: error.code,
      //   message: error.message,
      //   details: error.details,
      //   hint: error.hint,
      // });
      throw error;
    }
  },

  async createDockTimeBlock(block: Partial<DockTimeBlock>): Promise<DockTimeBlock> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuario no autenticado');

    const { data, error } = await supabase
      .from('dock_time_blocks')
      .insert({
        org_id: block.org_id,
        dock_id: block.dock_id,
        start_datetime: block.start_datetime,
        end_datetime: block.end_datetime,
        reason: block.reason,
        created_by: user.id,
      })
      .select('*')
      .single();

    if (error) {
      // console.error('[Calendar] createBlockError', {
      //   code: error.code,
      //   message: error.message,
      //   details: error.details,
      //   hint: error.hint,
      // });
      throw error;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('name, email')
      .eq('id', user.id)
      .single();

    return {
      ...data,
      creator: profile || undefined,
    };
  },

  /**
   * Crea bloques persistentes (recurrentes) para los días de semana seleccionados.
   * Si una ocurrencia colisiona con un bloque CLIENT_PICKUP (P0001), se omite silenciosamente.
   * Las reglas de cliente tienen prioridad absoluta.
   */
  async createPersistentDockTimeBlock(params: {
    orgId: string;
    dockId: string;
    baseStart: string;
    baseEnd: string;
    reason: string;
    weekdays: number[]; // 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb
    weeksAhead: number;
  }): Promise<{ created: number; skipped: number }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuario no autenticado');

    const { orgId, dockId, baseStart, baseEnd, reason, weekdays, weeksAhead } = params;

    const startDate = new Date(baseStart);
    const endDate = new Date(baseEnd);
    const durationMs = endDate.getTime() - startDate.getTime();

    // Construir lista de ocurrencias: desde la fecha base hasta weeksAhead semanas adelante
    const occurrences: { start: Date; end: Date }[] = [];
    const maxDate = new Date(startDate.getTime() + weeksAhead * 7 * 24 * 60 * 60 * 1000);
    const now = new Date();

    // Iterar día a día desde la fecha base
    const cursor = new Date(startDate);
    cursor.setHours(0, 0, 0, 0);

    while (cursor <= maxDate) {
      const dayOfWeek = cursor.getDay();
      if (weekdays.includes(dayOfWeek)) {
        const occStart = new Date(cursor);
        occStart.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);
        const occEnd = new Date(occStart.getTime() + durationMs);

        // Solo ocurrencias futuras (con 1 min de tolerancia)
        if (occStart >= new Date(now.getTime() - 60_000)) {
          occurrences.push({ start: occStart, end: occEnd });
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    let created = 0;
    let skipped = 0;

    for (const { start, end } of occurrences) {
      const { error } = await supabase
        .from('dock_time_blocks')
        .insert({
          org_id: orgId,
          dock_id: dockId,
          start_datetime: start.toISOString(),
          end_datetime: end.toISOString(),
          reason,
          created_by: user.id,
        });

      if (!error) {
        created++;
        continue;
      }

      // P0001 = trigger de overlap → bloque CLIENT_PICKUP tiene prioridad → omitir silenciosamente
      const errCode = (error as any).code as string | undefined;
      const errMsg = (error.message || '').toLowerCase();

      if (
        errCode === 'P0001' ||
        errMsg.includes('conflicto') ||
        errMsg.includes('ya existe') ||
        errMsg.includes('overlap') ||
        errMsg.includes('conflict')
      ) {
        skipped++;
        continue;
      }

      // Cualquier otro error es real → relanzar
      throw error;
    }

    return { created, skipped };
  },

  async deleteDockTimeBlock(id: string): Promise<void> {
    const { error } = await supabase
      .from('dock_time_blocks')
      .delete()
      .eq('id', id);

    if (error) {
      // console.error('[Calendar] deleteBlockError', {
      //   code: error.code,
      //   message: error.message,
      //   details: error.details,
      //   hint: error.hint,
      // });
      throw error;
    }
  },

  async updateDockTimeBlock(
    id: string,
    updates: { dock_id?: string; start_datetime?: string; end_datetime?: string; reason?: string }
  ): Promise<DockTimeBlock> {
    const { data, error } = await supabase
      .from('dock_time_blocks')
      .update({
        ...(updates.dock_id && { dock_id: updates.dock_id }),
        ...(updates.start_datetime && { start_datetime: updates.start_datetime }),
        ...(updates.end_datetime && { end_datetime: updates.end_datetime }),
        ...(updates.reason !== undefined && { reason: updates.reason }),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  async getReservationStatuses(orgId: string, forceRefresh = false) {
    const cacheKey = orgId;

    if (!forceRefresh) {
      const cached = statusesCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < STATIC_CACHE_TTL) {
        return cached.data;
      }
    }

    const { data, error } = await supabase
      .from('reservation_statuses')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('order_index', { ascending: true });

    if (error) {
      return [];
    }

    const result = data || [];
    statusesCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  },

  /**
   * Actualiza SOLO el estado de una reserva. NO toca fechas, duración ni ningún otro campo.
   * Usar exclusivamente cuando la acción es cambio de estado puro.
   */
  async updateReservationStatus(id: string, statusId: string): Promise<Reservation> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuario no autenticado');

    const now = new Date().toISOString();

    // Obtener estado anterior para el trigger de email
    const { data: oldReservation } = await supabase
      .from('reservations')
      .select('status_id, org_id')
      .eq('id', id)
      .maybeSingle();

    const oldStatusId = oldReservation?.status_id || null;
    const orgIdForTrigger = oldReservation?.org_id || '';

    // 1. Solo actualizar status_id, updated_by y updated_at
    const { error } = await supabase
      .from('reservations')
      .update({ status_id: statusId, updated_by: user.id, updated_at: now })
      .eq('id', id);

    if (error) throw error;

    // 2. Leer resultado
    const { data: full, error: fetchErr } = await supabase
      .from('reservations')
      .select(`
        *,
        status:reservation_statuses(name, code, color)
      `)
      .eq('id', id)
      .maybeSingle();

    // 3. Disparar email trigger si el status cambió
    if (orgIdForTrigger && oldStatusId !== statusId) {
      const reservationForTrigger = full ?? ({
        id,
        org_id: orgIdForTrigger,
        dock_id: '',
        start_datetime: '',
        end_datetime: '',
        dua: null,
        invoice: null,
        driver: null,
        status_id: statusId,
        notes: null,
        transport_type: null,
        cargo_type: null,
        operation_type: null,
        is_cancelled: false,
        cancel_reason: null,
        cancelled_by: null,
        cancelled_at: null,
        created_by: user.id,
        created_at: '',
        updated_by: user.id,
        updated_at: now,
        purchase_order: null,
        truck_plate: null,
        order_request_number: null,
        shipper_provider: null,
        recurrence: null,
        bl_number: null,
      } as Reservation);

      emailTriggerService.onReservationStatusChanged(
        orgIdForTrigger,
        reservationForTrigger,
        oldStatusId,
        statusId
      ).catch(() => {
        // non-blocking
      });
    }

    if (fetchErr || !full) {
      // Fallback mínimo si RLS bloquea lectura
      const fallback: Reservation = {
        id,
        org_id: orgIdForTrigger,
        dock_id: '',
        start_datetime: '',
        end_datetime: '',
        dua: null,
        invoice: null,
        driver: null,
        status_id: statusId,
        notes: null,
        transport_type: null,
        cargo_type: null,
        operation_type: null,
        is_cancelled: false,
        cancel_reason: null,
        cancelled_by: null,
        cancelled_at: null,
        created_by: user.id,
        created_at: '',
        updated_by: user.id,
        updated_at: now,
        purchase_order: null,
        truck_plate: null,
        order_request_number: null,
        shipper_provider: null,
        recurrence: null,
        bl_number: null,
      };
      return fallback;
    }

    return full;
  },

  async getDockCategories(orgId: string, forceRefresh = false) {
    const cacheKey = orgId;

    if (!forceRefresh) {
      const cached = categoriesCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < STATIC_CACHE_TTL) {
        return cached.data;
      }
    }

    const { data, error } = await supabase
      .from('dock_categories')
      .select('*')
      .eq('org_id', orgId)
      .order('name', { ascending: true });

    if (error) {
      return [];
    }

    const result = data || [];
    categoriesCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  },

  invalidateReservationStatusesCache(orgId: string) {
    statusesCache.delete(orgId);
  },

  invalidateDockCategoriesCache(orgId: string) {
    categoriesCache.delete(orgId);
  },

  // ============================================================
  // ✅ DOCUMENTOS (reservation_files + Supabase Storage)
  // ============================================================

  async getReservationFiles(orgId: string, reservationId: string): Promise<ReservationFile[]> {
    const { data, error } = await supabase
      .from('reservation_files')
      .select('*')
      .eq('org_id', orgId)
      .eq('reservation_id', reservationId)
      .order('uploaded_at', { ascending: false });

    if (error) {
      // console.error('[Calendar] reservationFilesError', {
      //   code: error.code,
      //   message: error.message,
      //   details: error.details,
      //   hint: error.hint,
      //   orgId,
      //   reservationId,
      // });
      return [];
    }

    return (data || []) as ReservationFile[];
  },

  /**
   * Sube el archivo a Storage y crea el registro en reservation_files.
   * category: por ejemplo 'CMR' | 'Facturas' | 'Otros' (lo que uses en UI)
   */
  async uploadReservationFile(params: {
    orgId: string;
    reservationId: string;
    category: string;
    file: File;
  }): Promise<ReservationFile> {
    const { orgId, reservationId, category, file } = params;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuario no autenticado');

    const storagePath = buildStoragePath(orgId, reservationId, category, file.name);

    // 1) Upload a Storage
    const { error: uploadError } = await supabase.storage
      .from(RESERVATION_FILES_BUCKET)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      });

    if (uploadError) {
      // console.error('[Calendar] uploadReservationFile.uploadError', {
      //   code: (uploadError as any).code,
      //   message: (uploadError as any).message,
      //   details: (uploadError as any).details,
      //   hint: (uploadError as any).hint,
      //   bucket: RESERVATION_FILES_BUCKET,
      //   storagePath,
      // });
      throw uploadError;
    }

    // 2) Guardar en DB
    const { data: row, error: insertError } = await supabase
      .from('reservation_files')
      .insert({
        org_id: orgId,
        reservation_id: reservationId,
        category,
        file_name: file.name,
        file_url: storagePath, // ✅ guardamos el path (NO publicUrl)
        file_size: (file as any).size ?? null,
        mime_type: file.type ?? null,
        uploaded_by: user.id,
      })
      .select('*')
      .single();


    if (insertError) {
      // rollback best-effort: borrar del storage si falló el insert
      try {
        await supabase.storage.from(RESERVATION_FILES_BUCKET).remove([storagePath]);
      } catch (rollbackError) {
        // console.warn('[Calendar] uploadReservationFile.rollbackWarning', {
        //   storagePath,
        //   error: rollbackError
        // });
      }

      // console.error('[Calendar] uploadReservationFile.insertError', {
      //   code: insertError.code,
      //   message: insertError.message,
      //   details: insertError.details,
      //   hint: insertError.hint,
      //   payload: { orgId, reservationId, category, fileName: file.name },
      // });
      throw insertError;
    }

    return row as ReservationFile;
  },

  /**
   * Si tu bucket NO es público, usás esto para obtener un link descargable temporal.
   * Si el bucket es público, podés usar directamente file_url.
   */
  async getReservationFileSignedUrl(fileUrlOrPath: string, expiresInSeconds = 60 * 60) {
    const path = tryExtractPathFromFileUrl(fileUrlOrPath);
    if (!path) return '';
    return await createSignedUrl(path, expiresInSeconds);
  },

  /**
   * Borra registro y también el archivo en Storage (best-effort).
   */
  async deleteReservationFile(orgId: string, fileId: string): Promise<void> {
    // 1) obtener row para saber dónde está el archivo
    const { data: fileRow, error: fetchError } = await supabase
      .from('reservation_files')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', fileId)
      .single();

    if (fetchError) {
      // console.error('[Calendar] deleteReservationFile.fetchError', {
      //   code: fetchError.code,
      //   message: fetchError.message,
      //   details: fetchError.details,
      //   hint: fetchError.hint,
      //   orgId,
      //   fileId,
      // });
      throw fetchError;
    }

    // 2) borrar en DB primero (si falla, no tocamos storage)
    const { error: deleteError } = await supabase
      .from('reservation_files')
      .delete()
      .eq('org_id', orgId)
      .eq('id', fileId);

    if (deleteError) {
      // console.error('[Calendar] deleteReservationFile.deleteError', {
      //   code: deleteError.code,
      //   message: deleteError.message,
      //   details: deleteError.details,
      //   hint: deleteError.hint,
      //   orgId,
      //   fileId,
      // });
      throw deleteError;
    }

    // 3) borrar en storage best-effort
    const path = tryExtractPathFromFileUrl((fileRow as any)?.file_url ?? '');
    if (path) {
      try {
        await supabase.storage.from(RESERVATION_FILES_BUCKET).remove([path]);
      } catch (e) {
        // console.warn('[Calendar] deleteReservationFile.storageRemoveWarning', { path, error: e });
      }
    }
  },

  // ============================================================
  // ✅ RESERVAS CONSOLIDADAS (múltiples proveedores)
  // ============================================================

  async getReservationConsolidatedProviders(
    orgId: string,
    reservationId: string
  ): Promise<ReservationConsolidatedProvider[]> {
    const { data, error } = await supabase
      .from('reservation_consolidated_providers')
      .select(`
        *,
        provider:providers(name)
      `)
      .eq('org_id', orgId)
      .eq('reservation_id', reservationId)
      .order('created_at', { ascending: true });

    if (error) {
      return [];
    }

    return (data || []).map((row: any) => ({
      ...row,
      provider_name: row.provider?.name ?? undefined,
    }));
  },

  async saveConsolidatedProviders(
    orgId: string,
    reservationId: string,
    providers: Array<{ provider_id: string; package_quantity: number }>
  ): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuario no autenticado');

    // 1. Leer lista existente ANTES de borrar (para el diff del log)
    const { data: existingRows } = await supabase
      .from('reservation_consolidated_providers')
      .select('provider_id, package_quantity, provider:providers(name)')
      .eq('org_id', orgId)
      .eq('reservation_id', reservationId);

    const existingMap = new Map<string, { package_quantity: number; name: string }>(
      (existingRows || []).map((row: any) => [
        row.provider_id,
        { package_quantity: row.package_quantity, name: row.provider?.name ?? row.provider_id },
      ])
    );

    // 2. Eliminar líneas existentes
    const { error: deleteError } = await supabase
      .from('reservation_consolidated_providers')
      .delete()
      .eq('org_id', orgId)
      .eq('reservation_id', reservationId);

    if (deleteError) throw deleteError;

    // 3. Insertar nuevas líneas
    if (providers.length > 0) {
      const rows = providers.map((p) => ({
        org_id: orgId,
        reservation_id: reservationId,
        provider_id: p.provider_id,
        package_quantity: p.package_quantity,
      }));

      const { error: insertError } = await supabase
        .from('reservation_consolidated_providers')
        .insert(rows);

      if (insertError) throw insertError;
    }

    // 4. Resolver nombres de proveedores nuevos (los que no estaban antes)
    const providerNameMap = new Map<string, string>();
    existingMap.forEach((val, key) => providerNameMap.set(key, val.name));

    const unknownIds = providers.map(p => p.provider_id).filter(id => !existingMap.has(id));
    if (unknownIds.length > 0) {
      const { data: providerData } = await supabase
        .from('providers')
        .select('id, name')
        .in('id', unknownIds);
      (providerData || []).forEach((p: any) => providerNameMap.set(p.id, p.name ?? p.id));
    }

    // 5. Calcular diff y construir entradas de activity_log
    const newMap = new Map(providers.map(p => [p.provider_id, p.package_quantity]));
    const logEntries: Array<{
      org_id: string;
      entity_type: string;
      entity_id: string;
      action: string;
      field: string;
      old_value: string | null;
      new_value: string | null;
      actor_user_id: string;
    }> = [];

    // Eliminados: estaban y ya no están
    for (const [providerId, { package_quantity, name }] of existingMap) {
      if (!newMap.has(providerId)) {
        logEntries.push({
          org_id: orgId,
          entity_type: 'reservation',
          entity_id: reservationId,
          action: 'updated',
          field: 'consolidated_provider_removed',
          old_value: `${name} — ${package_quantity} bultos`,
          new_value: null,
          actor_user_id: user.id,
        });
      }
    }

    // Agregados: son nuevos
    for (const p of providers) {
      if (!existingMap.has(p.provider_id)) {
        const name = providerNameMap.get(p.provider_id) ?? p.provider_id;
        logEntries.push({
          org_id: orgId,
          entity_type: 'reservation',
          entity_id: reservationId,
          action: 'updated',
          field: 'consolidated_provider_added',
          old_value: null,
          new_value: `${name} — ${p.package_quantity} bultos`,
          actor_user_id: user.id,
        });
      }
    }

    // Cantidad cambiada: estaban y siguen, pero con diferente cantidad
    for (const p of providers) {
      const existing = existingMap.get(p.provider_id);
      if (existing && existing.package_quantity !== p.package_quantity) {
        const name = providerNameMap.get(p.provider_id) ?? existing.name;
        logEntries.push({
          org_id: orgId,
          entity_type: 'reservation',
          entity_id: reservationId,
          action: 'updated',
          field: 'consolidated_provider_changed',
          old_value: `${name} — ${existing.package_quantity} bultos`,
          new_value: `${name} — ${p.package_quantity} bultos`,
          actor_user_id: user.id,
        });
      }
    }

    // 6. Escribir log (no bloqueante — no falla el guardado si el log falla)
    if (logEntries.length > 0) {
      supabase.from('activity_log').insert(logEntries).then(() => {}).catch(() => {});
    }
  },
};
