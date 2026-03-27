import { supabase } from '../lib/supabase';
import { emailTriggerService } from './emailTriggerService';

export interface Reservation {
  id: string;
  org_id: string;
  dock_id: string;
  start_datetime: string;
  end_datetime: string;
  dua: string;
  invoice: string;
  driver: string;
  status_id: string | null;
  notes: string | null;
  transport_type: string | null;
  cargo_type: string | null;
  is_cancelled: boolean;
  cancel_reason: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string;

  purchase_order?: string | null;
  truck_plate?: string | null;
  order_request_number?: string | null;
  shipper_provider?: string | null;
  recurrence?: any | null;

  status?: {
    name: string;
    code: string;
    color: string;
  };
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

/**
 * ⚙️ Config Storage
 * Cambiá este bucket name si el tuyo se llama diferente en Supabase Storage.
 */
const RESERVATION_FILES_BUCKET = 'reservation-files';

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
  async getReservations(orgId: string, startDate: string, endDate: string): Promise<Reservation[]> {
    const { data, error } = await supabase
      .from('reservations')
      .select(`
        *,
        status:reservation_statuses(name, code, color)
      `)
      .eq('org_id', orgId)
      .eq('is_cancelled', false)
      .gte('start_datetime', startDate)
      .lte('start_datetime', endDate)
      .order('start_datetime', { ascending: true });

    if (error) {
      return [];
    }

    return data || [];
  },

  // Igual que getReservations pero SIN filtrar is_cancelled — para el módulo de Reservas
  async getAllReservations(orgId: string, startDate: string, endDate: string): Promise<Reservation[]> {
    const { data, error } = await supabase
      .from('reservations')
      .select(`
        *,
        status:reservation_statuses(name, code, color)
      `)
      .eq('org_id', orgId)
      .gte('start_datetime', startDate)
      .lte('start_datetime', endDate)
      .order('start_datetime', { ascending: false });

    if (error) {
      return [];
    }

    return data || [];
  },

  async getDockTimeBlocks(orgId: string, startDate: string, endDate: string): Promise<DockTimeBlock[]> {
    // ✅ FIX: usa overlap real (no solo start_datetime) y excluye cancelados
    // Un bloque pertenece al rango si: start < rangoFin AND end > rangoInicio
    const { data, error } = await supabase
      .from('dock_time_blocks')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_cancelled', false)
      .lt('start_datetime', endDate)
      .gt('end_datetime', startDate)
      .order('start_datetime', { ascending: true });

    if (error) {
      // console.error('[Calendar] blocksError', {
      //   code: error.code,
      //   message: error.message,
      //   details: error.details,
      //   hint: error.hint,
      // });
      return [];
    }

    if (data && data.length > 0) {
      const creatorIds = [...new Set(data.map((b) => b.created_by))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', creatorIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

      return data.map((block) => ({
        ...block,
        creator: profileMap.get(block.created_by) || undefined,
      }));
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
          .select('id, name, reference, category:dock_categories(name, color)')
          .in('id', dockIds),
      ]);

      const profileMap = new Map((profilesResult.data || []).map((p) => [p.id, p]));
      const dockMap = new Map((docksResult.data || []).map((d) => [d.id, d]));

      return data.map((block) => ({
        ...block,
        creator: profileMap.get(block.created_by) || undefined,
        dock: dockMap.get(block.dock_id) || undefined,
      }));
    }

    return data || [];
  },

  async getDocks(orgId: string, warehouseId?: string | null): Promise<Dock[]> {
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
    }

    const { data, error } = await query.order('name', { ascending: true });

    if (error) {
      // console.error('[Calendar] docksError', {
      //   code: error.code,
      //   message: error.message,
      //   details: error.details,
      //   hint: error.hint,
      // });
      return [];
    }

    return data || [];
  },

  async getWarehouses(orgId: string): Promise<Warehouse[]> {
    const { data, error } = await supabase
      .from('warehouses')
      .select('id, org_id, name, location, business_start_time, business_end_time, slot_interval_minutes')
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
        invoice: reservation.invoice || '',
        driver: reservation.driver || '',
        status_id: reservation.status_id || null,
        notes: reservation.notes || null,
        transport_type: reservation.transport_type || null,
        cargo_type: reservation.cargo_type || null,
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
    if (updates.status_id !== undefined) {
      const { data: oldReservation } = await supabase
        .from('reservations')
        .select('status_id, org_id')
        .eq('id', id)
        .maybeSingle();
      
      oldStatusId = oldReservation?.status_id || null;
    }

    const { data, error } = await supabase
      .from('reservations')
      .update({
        ...updates,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`
        *,
        status:reservation_statuses(name, code, color)
      `)
      .single();

    if (error) {
      // console.error('[Calendar] updateReservationError', {
      //   code: error.code,
      //   message: error.message,
      //   details: error.details,
      //   hint: error.hint,
      //   payload: updates,
      // });
      throw error;
    }

    // ✅ Disparar evento de cambio de estado si cambió
    if (data && updates.status_id !== undefined && oldStatusId !== updates.status_id) {
      emailTriggerService.onReservationStatusChanged(
        data.org_id,
        data,
        oldStatusId,
        updates.status_id || null
      ).catch(err => {
        // console.error('[Calendar] Error al disparar correos de cambio de estado:', err);
      });
    }

    return data;
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

  async getReservationStatuses(orgId: string) {
    const { data, error } = await supabase
      .from('reservation_statuses')
      .select('*')
      .eq('org_id', orgId)
      .order('order_index', { ascending: true });

    if (error) {
      // console.error('[Calendar] statusesError', {
      //   code: error.code,
      //   message: error.message,
      //   details: error.details,
      //   hint: error.hint,
      // });
      return [];
    }

    return data || [];
  },

  async getDockCategories(orgId: string) {
    const { data, error } = await supabase
      .from('dock_categories')
      .select('*')
      .eq('org_id', orgId)
      .order('name', { ascending: true });

    if (error) {
      // console.error('[Calendar] categoriesError', {
      //   code: error.code,
      //   message: error.message,
      //   details: error.details,
      //   hint: error.hint,
      // });
      return [];
    }

    return data || [];
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
};
