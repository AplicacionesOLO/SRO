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
}

export interface Dock {
  id: string;
  org_id: string;
  name: string;
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
      console.error('[Calendar] reservationsError', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return [];
    }

    return data || [];
  },

  async getDockTimeBlocks(orgId: string, startDate: string, endDate: string): Promise<DockTimeBlock[]> {
    const { data, error } = await supabase
      .from('dock_time_blocks')
      .select('*')
      .eq('org_id', orgId)
      .gte('start_datetime', startDate)
      .lte('start_datetime', endDate)
      .order('start_datetime', { ascending: true });

    if (error) {
      console.error('[Calendar] blocksError', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
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

  async getDocks(orgId: string, warehouseId?: string | null): Promise<Dock[]> {
    let query = supabase
      .from('docks')
      .select(`
        *,
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
      console.error('[Calendar] docksError', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
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
      console.error('[Calendar] warehousesError', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return [];
    }

    console.log('[Calendar] warehouses loaded', { count: data?.length || 0 });
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
      console.error('[Calendar] createReservationError', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        payload: reservation,
      });

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
      console.warn('[Calendar] createReservation.fetchDetailWarning (403/RLS esperado)', {
        code: fetchErr.code,
        message: fetchErr.message,
        reservationId: data.id,
      });

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
        console.error('[Calendar] Error al disparar correos de creación:', err);
      });
    }

    return full;
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
      console.error('[Calendar] updateReservationError', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        payload: updates,
      });
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
        console.error('[Calendar] Error al disparar correos de cambio de estado:', err);
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
      console.error('[Calendar] cancelReservationError', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }
  },

  async deleteReservation(id: string): Promise<void> {
    const { error } = await supabase
      .from('reservations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Calendar] deleteReservationError', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
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
      console.error('[Calendar] createBlockError', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
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

  async deleteDockTimeBlock(id: string): Promise<void> {
    const { error } = await supabase
      .from('dock_time_blocks')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Calendar] deleteBlockError', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }
  },

  async getReservationStatuses(orgId: string) {
    const { data, error } = await supabase
      .from('reservation_statuses')
      .select('*')
      .eq('org_id', orgId)
      .order('order_index', { ascending: true });

    if (error) {
      console.error('[Calendar] statusesError', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
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
      console.error('[Calendar] categoriesError', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
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
      console.error('[Calendar] reservationFilesError', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        orgId,
        reservationId,
      });
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
      console.error('[Calendar] uploadReservationFile.uploadError', {
        code: (uploadError as any).code,
        message: (uploadError as any).message,
        details: (uploadError as any).details,
        hint: (uploadError as any).hint,
        bucket: RESERVATION_FILES_BUCKET,
        storagePath,
      });
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
        console.warn('[Calendar] uploadReservationFile.rollbackWarning', {
          storagePath,
          error: rollbackError
        });
      }

      console.error('[Calendar] uploadReservationFile.insertError', {
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        payload: { orgId, reservationId, category, fileName: file.name },
      });
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
      console.error('[Calendar] deleteReservationFile.fetchError', {
        code: fetchError.code,
        message: fetchError.message,
        details: fetchError.details,
        hint: fetchError.hint,
        orgId,
        fileId,
      });
      throw fetchError;
    }

    // 2) borrar en DB primero (si falla, no tocamos storage)
    const { error: deleteError } = await supabase
      .from('reservation_files')
      .delete()
      .eq('org_id', orgId)
      .eq('id', fileId);

    if (deleteError) {
      console.error('[Calendar] deleteReservationFile.deleteError', {
        code: deleteError.code,
        message: deleteError.message,
        details: deleteError.details,
        hint: deleteError.hint,
        orgId,
        fileId,
      });
      throw deleteError;
    }

    // 3) borrar en storage best-effort
    const path = tryExtractPathFromFileUrl((fileRow as any)?.file_url ?? '');
    if (path) {
      try {
        await supabase.storage.from(RESERVATION_FILES_BUCKET).remove([path]);
      } catch (e) {
        console.warn('[Calendar] deleteReservationFile.storageRemoveWarning', { path, error: e });
      }
    }
  },
};
