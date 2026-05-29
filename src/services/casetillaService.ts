import { supabase } from '../lib/supabase';
import type { CreateCasetillaIngresoInput, CasetillaIngreso } from '../types/casetilla';
import { getStartOfDayInTimezone, getEndOfDayInTimezone, DEFAULT_TIMEZONE } from '../utils/timezoneUtils';
import { emailTriggerService } from './emailTriggerService';

// ─── Tipos de segregación ────────────────────────────────────────────────────
export interface CasetillaClientOption {
  id: string;
  name: string;
}

type PendingReservationRow = {
  id: string;
  dua: string;
  driver: string;
  truck_plate: string | null;
  purchase_order: string | null;
  order_request_number: string | null;
  shipper_provider: string | null;
  dock_id: string;
  created_at: string;
  status_id: string | null;
  is_cancelled: boolean | null;
  notes: string | null;
  cargo_type: string | null;
  start_datetime: string | null;
  end_datetime: string | null;
  // ✅ Fuente de verdad real para Nacional/Importado
  is_imported: boolean | null;
};

// ✅ Nuevo tipo para reservas elegibles para salida
type ExitEligibleReservationRow = {
  id: string;
  dua: string;
  driver: string;
  truck_plate: string | null;
  purchase_order: string | null;
  order_request_number: string | null;
  shipper_provider: string | null;
  dock_id: string;
  created_at: string;
  status_id: string | null;
  is_cancelled: boolean | null;
};

// ✅ Tipo para filtros del reporte de duración
type DurationReportFilters = {
  searchTerm?: string;
  fechaDesde?: string; // ISO string
  fechaHasta?: string; // ISO string
};

class CasetillaService {
  // ─── Helper: construir rango UTC desde fecha local del almacén ────────────
  /**
   * Convierte un Date de UI al rango UTC [start, end] del día en el timezone del almacén.
   * Si no hay timezone, usa fallback seguro sin romper.
   */
  private _buildDateFilterParams(selectedDate: Date, timezone?: string | null): { fromIso: string; toIso: string } | null {
    const tz = timezone || DEFAULT_TIMEZONE;
    try {
      const fromIso = getStartOfDayInTimezone(selectedDate, tz).toISOString();
      const toIso = getEndOfDayInTimezone(selectedDate, tz).toISOString();
      return { fromIso, toIso };
    } catch {
      // Fallback seguro: si el timezone no existe, devolvemos null para no filtrar
      return null;
    }
  }

  // ─── SEGREGACIÓN: obtener warehouses permitidos para el usuario ──────────
  // FUENTE REAL: user_warehouse_access (user_warehouses está vacía y no se usa)
  async getUserAllowedWarehouseIds(orgId: string, userId: string): Promise<string[] | null> {
    // null = sin restricción (ve todos los warehouses de la org)
    const { data, error } = await supabase
      .from('user_warehouse_access')
      .select('warehouse_id, restricted')
      .eq('org_id', orgId)
      .eq('user_id', userId);

    if (error) return null;
    if (!data || data.length === 0) return null; // sin filas → sin restricción (fallback)

    // Si tiene alguna fila con restricted=false → acceso global
    const hasUnrestricted = data.some((r: any) => r.restricted === false);
    if (hasUnrestricted) return null;

    // Solo filas restricted=true → restringido a esos warehouses
    const restricted = data.filter((r: any) => r.restricted === true);
    if (restricted.length === 0) return null;
    return restricted.map((r: any) => r.warehouse_id as string);
  }

  // ─── SEGREGACIÓN: obtener clientes disponibles para un set de warehouses ─
  async getClientsForWarehouses(orgId: string, warehouseIds: string[]): Promise<CasetillaClientOption[]> {
    if (warehouseIds.length === 0) return [];

    const { data, error } = await supabase
      .from('warehouse_clients')
      .select('client_id, clients!warehouse_clients_client_id_fkey(id, name)')
      .eq('org_id', orgId)
      .in('warehouse_id', warehouseIds);

    if (error || !data) return [];

    const seen = new Set<string>();
    const result: CasetillaClientOption[] = [];

    for (const row of data as any[]) {
      const client = row.clients;
      if (client && !seen.has(client.id)) {
        seen.add(client.id);
        result.push({ id: client.id, name: client.name });
      }
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  // ─── SEGREGACIÓN: obtener dock_ids de un cliente ─────────────────────────
  private async getDockIdsForClient(orgId: string, clientId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('client_docks')
      .select('dock_id')
      .eq('org_id', orgId)
      .eq('client_id', clientId);

    if (error || !data) return [];
    return data.map((r: any) => r.dock_id as string);
  }

  // ─── NO-SHOW: filtrar reservas que ya vencieron por tolerancia ───────────
  private async filterNoShowExpired(rows: PendingReservationRow[], orgId: string): Promise<PendingReservationRow[]> {
    if (rows.length === 0) return rows;

    // Traer warehouses con tolerancia configurada
    const warehouseIds = [...new Set(rows.map((r) => r.dock_id).filter(Boolean))];
    if (warehouseIds.length === 0) return rows;

    // Necesitamos dock_id -> warehouse_id
    const { data: docksData } = await supabase
      .from('docks')
      .select('id, warehouse_id')
      .in('id', warehouseIds)
      .eq('org_id', orgId);

    const dockToWh = new Map<string, string>();
    (docksData ?? []).forEach((d: any) => {
      dockToWh.set(d.id as string, d.warehouse_id as string);
    });

    const whIds = [...new Set([...dockToWh.values()])];
    if (whIds.length === 0) return rows;

    const { data: whData } = await supabase
      .from('warehouses')
      .select('id, timezone, no_show_tolerance_minutes')
      .in('id', whIds)
      .eq('org_id', orgId);

    const whMap = new Map<string, { timezone: string; tolerance: number | null }>();
    (whData ?? []).forEach((w: any) => {
      whMap.set(w.id as string, {
        timezone: (w.timezone as string) || 'America/Costa_Rica',
        tolerance: w.no_show_tolerance_minutes != null ? Number(w.no_show_tolerance_minutes) : null,
      });
    });

    const now = new Date();

    return rows.filter((r) => {
      const whId = dockToWh.get(r.dock_id);
      if (!whId) return true; // sin warehouse info → dejar pasar

      const wh = whMap.get(whId);
      if (!wh || wh.tolerance == null || wh.tolerance <= 0) return true; // sin tolerancia → dejar pasar

      if (!r.start_datetime) return true; // sin hora de cita → no evaluar

      // Convertir start_datetime a zona horaria del almacén y agregar tolerancia
      const start = new Date(r.start_datetime);
      // start_datetime ya es UTC en DB, usamos la fecha directa
      const cutoff = new Date(start.getTime() + wh.tolerance * 60_000);

      return now <= cutoff; // solo dejar si ahora <= cutoff
    });
  }

  // ─── NO-SHOW: verificar si una reserva está vencida por tolerancia ──────
  async checkNoShowExpired(reservationId: string, orgId: string): Promise<{ expired: boolean; message: string }> {
    const { data: res, error } = await supabase
      .from('reservations')
      .select('id, dock_id, start_datetime, status_id')
      .eq('id', reservationId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (error || !res) return { expired: false, message: '' };
    if (!res.start_datetime || !res.dock_id) return { expired: false, message: '' };

    const { data: dock } = await supabase
      .from('docks')
      .select('warehouse_id')
      .eq('id', res.dock_id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (!dock?.warehouse_id) return { expired: false, message: '' };

    const { data: wh } = await supabase
      .from('warehouses')
      .select('timezone, no_show_tolerance_minutes')
      .eq('id', dock.warehouse_id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (!wh || wh.no_show_tolerance_minutes == null || wh.no_show_tolerance_minutes <= 0) {
      return { expired: false, message: '' };
    }

    const start = new Date(res.start_datetime);
    const cutoff = new Date(start.getTime() + Number(wh.no_show_tolerance_minutes) * 60_000);

    if (new Date() > cutoff) {
      return {
        expired: true,
        message: 'Esta cita superó el tiempo permitido de ingreso y ya no puede procesarse desde Punto de Control.',
      };
    }

    return { expired: false, message: '' };
  }

  // helper: obtener status_id por code o name, intentando con org_id si existe
  private async getStatusIdFlexible(params: {
    orgId: string;
    codes?: string[];
    names?: string[];
  }): Promise<string | null> {
    const { orgId, codes = [], names = [] } = params;

    // 1) intentamos por code con org_id (si aplica)
    for (const code of codes) {
      // try with org_id
      {
        const q = supabase
          .from('reservation_statuses')
          .select('id')
          .eq('code', code)
          .eq('org_id', orgId)
          .limit(1);

        const { data, error } = await q;
        if (!error && data && data.length > 0) return data[0].id;
      }

      // try without org_id (fallback) — solo estados activos
      {
        const q = supabase.from('reservation_statuses').select('id').eq('code', code).eq('is_active', true).limit(1);
        const { data, error } = await q;
        if (!error && data && data.length > 0) return data[0].id;
      }
    }

    // 2) intentamos por name con org_id (si aplica) y luego sin org_id
    for (const name of names) {
      {
        const q = supabase
          .from('reservation_statuses')
          .select('id')
          .eq('name', name)
          .eq('org_id', orgId)
          .limit(1);

        const { data, error } = await q;
        if (!error && data && data.length > 0) return data[0].id;
      }

      {
        const q = supabase.from('reservation_statuses').select('id').eq('name', name).eq('is_active', true).limit(1);
        const { data, error } = await q;
        if (!error && data && data.length > 0) return data[0].id;
      }
    }

    return null;
  }

  async createIngreso(orgId: string, userId: string, data: CreateCasetillaIngresoInput) {
    try {
      let reservationId: string | undefined = data.reservation_id;
      let reservationUpdated = false;
      let statusFromId: string | null = null;
      let statusToId: string | null = null;
      let updateError: any = null;

      // ✅ 1) Si viene reservation_id explícito, usarlo directamente
      if (reservationId) {
        const { data: reservation, error: fetchError } = await supabase
          .from('reservations')
          .select('id, status_id')
          .eq('id', reservationId)
          .eq('org_id', orgId)
          .maybeSingle();

        if (fetchError) {
          throw new Error('No se pudo verificar la reserva. Contactá a un administrador.');
        }

        if (!reservation) {
          throw new Error('La reserva especificada no existe o no pertenece a tu organización.');
        }

        statusFromId = reservation.status_id;

        // ✅ 2) Actualizar status a "Arribó (pendiente descarga)"
        const arrivedPendingUnloadStatusId =
          (await this.getStatusIdFlexible({
            orgId,
            codes: ['ARRIVED_PENDING_UNLOAD'],
            names: ['Arribó (pendiente descarga)', 'Arribo (pendiente descarga)', 'Arribó pendiente descarga']
          })) ??
          (await this.getStatusIdFlexible({
            orgId,
            codes: ['LLEGO_AL_ALMACEN'],
            names: ['LLegó al almacén', 'Llegó al almacén', 'LLEGO_AL_ALMACEN']
          }));

        if (arrivedPendingUnloadStatusId) {
          statusToId = arrivedPendingUnloadStatusId;

          const { data: updatedRowsFb, error: updateErrFb } = await supabase
            .from('reservations')
            .update({
              status_id: arrivedPendingUnloadStatusId,
              updated_by: userId,
              updated_at: new Date().toISOString()
            })
            .eq('id', reservationId)
            .eq('org_id', orgId)
            .select('id');

          if (!updateErrFb && updatedRowsFb && updatedRowsFb.length > 0) {
            reservationUpdated = true;
          } else if (!updateErrFb) {
            updateError = new Error('El sistema actualizó 0 reservas. Verificá permisos o contactá a un administrador.');
          } else {
            updateError = updateErrFb;
          }
        }
      } else {
        // ✅ Fallback: buscar por DUA + Matrícula (comportamiento anterior)
        const { data: matchingReservations, error: searchError } = await supabase
          .from('reservations')
          .select('id,status_id')
          .eq('org_id', orgId)
          .eq('dua', data.dua)
          .eq('truck_plate', data.matricula)
          .eq('is_cancelled', false)
          .limit(1);

        if (searchError) throw searchError;

        if (matchingReservations && matchingReservations.length > 0) {
          reservationId = matchingReservations[0].id;
          statusFromId = matchingReservations[0].status_id;

          const arrivedPendingUnloadStatusId =
            (await this.getStatusIdFlexible({
              orgId,
              codes: ['ARRIVED_PENDING_UNLOAD'],
              names: ['Arribó (pendiente descarga)', 'Arribo (pendiente descarga)', 'Arribó pendiente descarga']
            })) ??
            (await this.getStatusIdFlexible({
              orgId,
              codes: ['LLEGO_AL_ALMACEN'],
              names: ['LLegó al almacén', 'Llegó al almacén', 'LLEGO_AL_ALMACEN']
            }));

          if (arrivedPendingUnloadStatusId) {
            statusToId = arrivedPendingUnloadStatusId;

            const { data: updatedRows, error: updateErr } = await supabase
              .from('reservations')
              .update({
                status_id: arrivedPendingUnloadStatusId,
                updated_by: userId,
                updated_at: new Date().toISOString()
              })
              .eq('id', reservationId)
              .eq('org_id', orgId)
              .select('id');

            if (!updateErr && updatedRows && updatedRows.length > 0) {
              reservationUpdated = true;
            } else if (!updateErr) {
              updateError = new Error('El sistema actualizó 0 reservas. Verificá permisos o contactá a un administrador.');
            } else {
              updateError = updateErr;
            }
          }
        }
      }

      // ✅ 3) Si se encontró reserva pero falló el update, lanzar error claro
      if (reservationId && !reservationUpdated && updateError) {
        throw new Error('Se encontró la reserva pero no se pudo actualizar su estado. Verificá permisos o contactá a un administrador.');
      }

      // ✅ 3b) SINCRONIZACIÓN: actualizar campos de la reserva con los datos del ingreso
      if (reservationId) {
        const syncPayload: Record<string, string | null | boolean> = {};

        if (data.matricula?.trim()) syncPayload['truck_plate'] = data.matricula.trim();
        if (data.chofer?.trim()) syncPayload['driver'] = data.chofer.trim();
        if (data.dua?.trim()) {
          syncPayload['dua'] = data.dua.trim();
          // Si el ingreso trae DUA, marcar la reserva como importada
          syncPayload['is_imported'] = true;
        }
        if (data.orden_compra?.trim()) syncPayload['purchase_order'] = data.orden_compra.trim();
        if (data.numero_pedido?.trim()) syncPayload['order_request_number'] = data.numero_pedido.trim();
        if (data.observaciones?.trim()) syncPayload['notes'] = data.observaciones.trim();

        if (Object.keys(syncPayload).length > 0) {
          syncPayload['updated_by'] = userId;
          syncPayload['updated_at'] = new Date().toISOString();

          // Sincronización AWAIT con error explícito — no falla silenciosamente
          const { error: syncErr } = await supabase
            .from('reservations')
            .update(syncPayload)
            .eq('id', reservationId)
            .eq('org_id', orgId)
            .select('id');

          if (syncErr) {
            throw new Error(
              `El ingreso fue creado, pero no se pudieron sincronizar los datos en la reserva vinculada. ` +
              `Detalle: ${syncErr.message}. Por favor actualizá manualmente la reserva.`
            );
          }
        }
      }

      // ✅ 4) Crear registro casetilla PRIMERO (antes del trigger de email)
      //       Así cuando el email busque fotos en casetilla_ingresos, ya existen.
      const { data: ingreso, error: ingresoError } = await supabase
        .from('casetilla_ingresos')
        .insert({
          org_id: orgId,
          chofer: data.chofer,
          matricula: data.matricula,
          dua: data.dua,
          factura: data.factura,
          cedula: data.cedula?.trim() || null,
          orden_compra: data.orden_compra,
          numero_pedido: data.numero_pedido,
          observaciones: data.observaciones?.trim() || null,
          reservation_id: reservationId,
          created_by: userId,
          fotos: data.fotos && data.fotos.length > 0 ? data.fotos : null,
        })
        .select()
        .single();

      if (ingresoError) throw ingresoError;

      // ✅ 5) TRIGGER: Disparar evento DESPUÉS de insertar el registro
      //       Así la edge function de fotos encuentra el registro en casetilla_ingresos
      if (reservationUpdated && reservationId) {

        try {
          const { data: fullReservation, error: resErr } = await supabase
            .from('reservations')
            .select('*')
            .eq('id', reservationId)
            .single();

          if (!resErr && fullReservation) {
            await emailTriggerService.onReservationStatusChanged(
              orgId,
              fullReservation as any,
              statusFromId,
              statusToId
            );
          }
        } catch (triggerError: any) {
          // El trigger de email nunca debe bloquear el flujo principal
        }
      }

      return {
        ingreso,
        reservationFound: !!reservationId,
        reservationUpdated,
        reservationId,
        statusFromId,
        statusToId
      };
    } catch (error) {
      throw error;
    }
  }

  async getIngresos(orgId: string) {
    try {
      const { data, error } = await supabase
        .from('casetilla_ingresos')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as CasetillaIngreso[];
    } catch (error) {
      // console.error('Error fetching casetilla ingresos:', error);
      throw error;
    }
  }

  async getPendingReservations(
    orgId: string,
    allowedWarehouseIds?: string[] | null,
    clientId?: string | null,
    selectedDate?: Date | null,
    timezone?: string | null
  ) {
    try {
      // ✅ Usar RPC que filtra PENDING + NOT EXISTS casetilla_ingresos en una sola query SQL
      const { data: reservations, error: rpcError } = await supabase
        .rpc('get_pending_reservations_v4', { p_org_id: orgId });

      if (rpcError) throw rpcError;
      if (!reservations || reservations.length === 0) return [];

      let rows = reservations as PendingReservationRow[];

      // ─── FILTRO POR FECHA: aplicar desde base de datos si se puede ────────
      if (selectedDate) {
        const dateRange = this._buildDateFilterParams(selectedDate, timezone);
        if (dateRange) {
          // Filtrar por start_datetime dentro del rango UTC del día seleccionado
          const { fromIso, toIso } = dateRange;
          rows = rows.filter((r) => {
            if (!r.start_datetime) return false; // sin fecha → no coincide con el día
            const start = new Date(r.start_datetime);
            return start >= new Date(fromIso) && start <= new Date(toIso);
          });
        }
      }
      // ─────────────────────────────────────────────────────────────────────

      // ─── NO-SHOW: excluir reservas vencidas por tolerancia ──────────────
      rows = await this.filterNoShowExpired(rows, orgId);

      // ─── SEGREGACIÓN: filtrar por docks permitidos ────────────────────────
      // Construir set de dock_ids permitidos según warehouse y/o cliente
      let allowedDockIds: Set<string> | null = null;

      if (allowedWarehouseIds && allowedWarehouseIds.length > 0) {
        // Traer docks de los warehouses permitidos
        const { data: allowedDocks } = await supabase
          .from('docks')
          .select('id')
          .eq('org_id', orgId)
          .in('warehouse_id', allowedWarehouseIds);

        allowedDockIds = new Set((allowedDocks ?? []).map((d: any) => d.id as string));
      }

      if (clientId) {
        // Traer docks del cliente
        const clientDockIds = await this.getDockIdsForClient(orgId, clientId);
        const clientDockSet = new Set(clientDockIds);

        if (allowedDockIds !== null) {
          // Intersección: docks que están en warehouses permitidos Y en el cliente
          allowedDockIds = new Set([...allowedDockIds].filter((id) => clientDockSet.has(id)));
        } else {
          allowedDockIds = clientDockSet;
        }
      }

      // Aplicar filtro de docks si hay restricción
      if (allowedDockIds !== null) {
        rows = rows.filter((r) => allowedDockIds!.has(r.dock_id));
      }

      if (rows.length === 0) return [];
      // ─────────────────────────────────────────────────────────────────────

      // Docks (para derivar warehouse)
      const dockIds = [...new Set(rows.map((r) => r.dock_id).filter(Boolean))];

      let docksMap = new Map<string, { name?: string; warehouse_id?: string | null }>();

      if (dockIds.length > 0) {
        const { data: docksData } = await supabase
          .from('docks')
          .select('id,name,warehouse_id')
          .in('id', dockIds);

        (docksData ?? []).forEach((d: any) => {
          docksMap.set(d.id, { name: d.name, warehouse_id: d.warehouse_id ?? null });
        });
      }

      // Warehouses
      const warehouseIds = [
        ...new Set(
          [...docksMap.values()]
            .map((d) => d.warehouse_id)
            .filter(Boolean) as string[]
        )
      ];

      let warehousesMap = new Map<string, string>();

      if (warehouseIds.length > 0) {
        const { data: warehousesData, error: warehousesError } = await supabase
          .from('warehouses')
          .select('id,name')
          .in('id', warehouseIds);

        if (!warehousesError) {
          (warehousesData ?? []).forEach((w: any) => {
            warehousesMap.set(w.id, w.name);
          });
        }
      }

      // Providers
      const providerIds = [
        ...new Set(
          rows
            .map((r) => r.shipper_provider)
            .filter((id) => id && id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i))
        )
      ];

      let providersMap = new Map<string, string>();

      if (providerIds.length > 0) {
        const { data: providersData, error: providersError } = await supabase
          .from('providers')
          .select('id,name')
          .in('id', providerIds);

        if (!providersError) {
          (providersData ?? []).forEach((p: any) => {
            providersMap.set(p.id, p.name);
          });
        }
      }

      // ─── Cargo types: solo para display (ya no se usa para is_imported) ──
      const cargoTypeIds = [
        ...new Set(
          rows
            .map((r) => r.cargo_type)
            .filter((id) => id && id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i))
        )
      ] as string[];

      const cargoTypesMap = new Map<string, string>(); // id -> name

      if (cargoTypeIds.length > 0) {
        const { data: ctData } = await supabase
          .from('cargo_types')
          .select('id, name')
          .in('id', cargoTypeIds);

        (ctData ?? []).forEach((ct: any) => {
          cargoTypesMap.set(ct.id, ct.name ?? '');
        });
      }
      // ─────────────────────────────────────────────────────────────────────

      // Map final para UI
      return rows.map((r) => {
        const dock = docksMap.get(r.dock_id);
        const whName = dock?.warehouse_id ? warehousesMap.get(dock.warehouse_id) : null;
        
        const isUUID = r.shipper_provider && r.shipper_provider.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        const providerName = isUUID 
          ? (providersMap.get(r.shipper_provider!) ?? 'N/A')
          : (r.shipper_provider ?? 'N/A');

        // ── is_imported: FUENTE DE VERDAD = columna is_imported de reservations ──
        // Regla definitiva:
        //   1. Si is_imported = true  → DUA obligatorio (reserva marcada como Importado)
        //   2. Si is_imported = false/null → DUA opcional (reserva Nacional)
        //   3. Fallback: si la reserva ya tiene DUA pero is_imported es null, se trata como importada
        const cargoTypeName = r.cargo_type ? (cargoTypesMap.get(r.cargo_type) ?? '') : '';
        const is_imported =
          r.is_imported === true ||
          // Fallback seguro: si is_imported no está seteado pero ya tiene DUA → importada
          (r.is_imported == null && !!(r.dua && r.dua.trim().length > 0));

        return {
          id: r.id,
          dua: r.dua ?? '',
          placa: r.truck_plate ?? '',
          chofer: r.driver ?? '',
          orden_compra: r.purchase_order ?? '',
          numero_pedido: r.order_request_number ?? '',
          notes: (r as any).notes ?? null,
          provider_name: providerName,
          warehouse_name: whName ?? 'N/A',
          created_at: r.created_at,
          is_imported,
          cargo_type_name: cargoTypeName || null,
        };
      });
    } catch (error) {
      throw error;
    }
  }

  async searchPendingReservations(
    orgId: string,
    searchTerm: string,
    allowedWarehouseIds?: string[] | null,
    clientId?: string | null,
    selectedDate?: Date | null,
    timezone?: string | null
  ) {
    try {
      const allReservations = await this.getPendingReservations(orgId, allowedWarehouseIds, clientId, selectedDate, timezone);

      if (!searchTerm.trim()) return allReservations;

      const term = searchTerm.toLowerCase();

      return allReservations.filter((r: any) =>
        (r.dua ?? '').toLowerCase().includes(term) ||
        (r.chofer ?? '').toLowerCase().includes(term) ||
        (r.provider_name ?? '').toLowerCase().includes(term) ||
        (r.placa ?? '').toLowerCase().includes(term) ||
        (r.orden_compra ?? '').toLowerCase().includes(term)
      );
    } catch (error) {
      // console.error('Error searching pending reservations:', error);
      throw error;
    }
  }

// Regla de negocio: listar reservas que tengan ingreso en casetilla_ingresos
// y no tengan salida en casetilla_salidas, independientemente del status_id.
// El status_id se muestra como información pero NO excluye la reserva.
async getExitEligibleReservations(
  orgId: string,
  allowedWarehouseIds?: string[] | null,
  clientId?: string | null,
  selectedDate?: Date | null,
  timezone?: string | null
) {
  try {
    // 1) Cargar catálogo completo de estados (para resolver nombre en UI)
    const { data: allStatuses } = await supabase
      .from('reservation_statuses')
      .select('id, name, code')
      .eq('org_id', orgId)
      .eq('is_active', true);

    const statusCatalog = new Map<string, { name: string; code: string }>();
    (allStatuses ?? []).forEach((s: any) => {
      statusCatalog.set(s.id, { name: s.name, code: s.code });
    });

    // 2) Traer ingresos ordenados (último ingreso primero)
    let ingresosQuery = supabase
      .from("casetilla_ingresos")
      .select("reservation_id, created_at")
      .eq("org_id", orgId)
      .not("reservation_id", "is", null);

    // NOTE: Se eliminó el filtro por fecha sobre casetilla_ingresos.created_at.
    // Regla operativa: toda reserva con IN y sin OUT debe aparecer como pendiente
    // de salida, sin importar la fecha del ingreso ni el status_id.

    ingresosQuery = ingresosQuery.order("created_at", { ascending: false });

    const { data: ingresos, error: ingresosError } = await ingresosQuery;

    if (ingresosError) throw ingresosError;
    if (!ingresos || ingresos.length === 0) return [];

    // Map: reservation_id -> fecha_ingreso (última)
    const ingresosMap = new Map<string, string>();
    for (const ing of ingresos as any[]) {
      const rid = ing.reservation_id as string;
      if (!ingresosMap.has(rid)) ingresosMap.set(rid, ing.created_at);
    }

    const reservationIds = [...ingresosMap.keys()];
    if (reservationIds.length === 0) return [];

    // 3) Excluir reservas con salida ya registrada
    const { data: salidas, error: salidasError } = await supabase
      .from("casetilla_salidas")
      .select("reservation_id")
      .eq("org_id", orgId)
      .in("reservation_id", reservationIds);

    if (salidasError) throw salidasError;

    const salidasSet = new Set((salidas ?? []).map((s: any) => s.reservation_id));
    const eligibleReservationIds = reservationIds.filter((id) => !salidasSet.has(id));

    if (eligibleReservationIds.length === 0) return [];

    // ─── SEGREGACIÓN: filtrar por docks permitidos ────────────────────────
    let allowedDockIds: Set<string> | null = null;

    if (allowedWarehouseIds && allowedWarehouseIds.length > 0) {
      const { data: allowedDocks } = await supabase
        .from('docks')
        .select('id')
        .eq('org_id', orgId)
        .in('warehouse_id', allowedWarehouseIds);

      allowedDockIds = new Set((allowedDocks ?? []).map((d: any) => d.id as string));
    }

    if (clientId) {
      const clientDockIds = await this.getDockIdsForClient(orgId, clientId);
      const clientDockSet = new Set(clientDockIds);

      if (allowedDockIds !== null) {
        allowedDockIds = new Set([...allowedDockIds].filter((id) => clientDockSet.has(id)));
      } else {
        allowedDockIds = clientDockSet;
      }
    }
    // ─────────────────────────────────────────────────────────────────────

    // 4) Traer reservas elegibles (con ingreso, sin salida, no canceladas)
    // IMPORTANTE: NO se filtra por status_id — si hay IN sin OUT, siempre aparece
    // independientemente del estado de la reserva.
    const { data: reservations, error: reservationsError } = await supabase
      .from('reservations')
      .select(`
        id,
        org_id,
        dua,
        driver,
        truck_plate,
        purchase_order,
        order_request_number,
        shipper_provider,
        dock_id,
        created_at,
        status_id,
        is_cancelled
      `)
      .eq('org_id', orgId)
      .eq('is_cancelled', false)
      .in('id', eligibleReservationIds)
      .order('created_at', { ascending: false });
    if (reservationsError) throw reservationsError;
    if (!reservations || reservations.length === 0) return [];

    // Aplicar filtro de docks si hay restricción
    let rows = reservations as any[];
    if (allowedDockIds !== null) {
      rows = rows.filter((r: any) => allowedDockIds!.has(r.dock_id));
    }
    if (rows.length === 0) return [];

    // 5) Docks -> Warehouses
    const dockIds = [...new Set(rows.map((r) => r.dock_id).filter(Boolean))];
    const docksMap = new Map<string, { name?: string; warehouse_id?: string | null }>();

    if (dockIds.length > 0) {
      const { data: docksData, error: docksErr } = await supabase
        .from("docks")
        .select("id,name,warehouse_id")
        .in("id", dockIds);

      if (docksErr) throw docksErr;

      (docksData ?? []).forEach((d: any) => {
        docksMap.set(d.id, { name: d.name, warehouse_id: d.warehouse_id ?? null });
      });
    }

    const warehouseIds = [
      ...new Set(
        [...docksMap.values()].map((d) => d.warehouse_id).filter(Boolean) as string[]
      ),
    ];

    const warehousesMap = new Map<string, { name: string; timezone: string }>();
    if (warehouseIds.length > 0) {
      const { data: whData, error: whErr } = await supabase
        .from("warehouses")
        .select("id,name,timezone")
        .in("id", warehouseIds);

      if (whErr) throw whErr;

      (whData ?? []).forEach((w: any) =>
        warehousesMap.set(w.id, { name: w.name, timezone: w.timezone || 'America/Costa_Rica' })
      );
    }

    // 6) Providers (si shipper_provider trae UUID)
    const providerIds = [
      ...new Set(
        rows
          .map((r) => r.shipper_provider)
          .filter(
            (id) =>
              id &&
              String(id).match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
          )
      ),
    ] as string[];

    const providersMap = new Map<string, string>();
    if (providerIds.length > 0) {
      const { data: provData, error: provErr } = await supabase
        .from("providers")
        .select("id,name")
        .in("id", providerIds);

      // si providers no existe en tu schema, esto puede fallar:
      if (!provErr) {
        (provData ?? []).forEach((p: any) => providersMap.set(p.id, p.name));
      }
    }

    // 7) Salida final para UI
    return rows.map((r: any) => {
      const dock = docksMap.get(r.dock_id);
      const whName = dock?.warehouse_id ? warehousesMap.get(dock.warehouse_id) : null;

      const shipper = r.shipper_provider ?? null;
      const isUUID =
        shipper &&
        String(shipper).match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      const providerName = isUUID ? providersMap.get(shipper) ?? 'N/A' : shipper ?? 'N/A';

      const whData = dock?.warehouse_id ? warehousesMap.get(dock.warehouse_id) : null;

      // Resolver nombre y código del estado actual (solo para display, no filtra)
      const statusInfo = r.status_id ? statusCatalog.get(r.status_id) : null;

      return {
        id: r.id,
        dua: r.dua ?? null,
        matricula: r.truck_plate ?? '',
        chofer: r.driver ?? '',
        proveedor: providerName,
        almacen: whData?.name ?? 'N/A',
        provider_name: providerName,
        warehouse_name: whData?.name ?? 'N/A',
        warehouse_id: dock?.warehouse_id ?? null,
        warehouse_timezone: whData?.timezone ?? 'America/Costa_Rica',
        provider_id: shipper ?? null,
        orden_compra: r.purchase_order ?? '',
        numero_pedido: r.order_request_number ?? '',
        fecha_ingreso: ingresosMap.get(r.id) ?? null,
        created_at: r.created_at,
        // Estado actual de la reserva — solo informativo, NO determina elegibilidad
        status_name: statusInfo?.name ?? null,
        status_code: statusInfo?.code ?? null,
      };
    });
  } catch (error) {
    // console.error("Error fetching exit eligible reservations:", error);
    throw error;
  }
}


  // ✅ NUEVA FUNCIÓN: Detectar estado de una reserva para QR inteligente
  // Retorna: 'pending' | 'has_ingreso' | 'has_salida' | 'cancelled' | 'no_show' | 'expired_no_show' | 'not_found'
  async getReservationCasetillaState(reservationId: string, orgId: string): Promise<{
    state: 'pending' | 'has_ingreso' | 'has_salida' | 'cancelled' | 'no_show' | 'expired_no_show' | 'not_found';
    reservation: PendingReservationRow | null;
  }> {
    try {
      // 1) Traer la reserva
      const { data: res, error } = await supabase
        .from('reservations')
        .select('id, status_id, is_cancelled, driver, truck_plate, dua, dock_id, org_id, shipper_provider, purchase_order, order_request_number, created_at, cargo_type, is_imported, notes, start_datetime, end_datetime')
        .eq('id', reservationId)
        .eq('org_id', orgId)
        .maybeSingle();

      if (error || !res) {
        return { state: 'not_found', reservation: null };
      }

      // 2) Si está cancelada
      if (res.is_cancelled) {
        return { state: 'cancelled', reservation: null };
      }

      // 3) Obtener status NO_SHOW para verificar
      const { data: noShowRow } = await supabase
        .from('reservation_statuses')
        .select('id')
        .eq('org_id', orgId)
        .eq('code', 'NO_SHOW')
        .eq('is_active', true)
        .maybeSingle();

      if (noShowRow && res.status_id === noShowRow.id) {
        return { state: 'no_show', reservation: null };
      }

      // 4) Verificar si ya tiene ingreso
      const { data: ingreso } = await supabase
        .from('casetilla_ingresos')
        .select('id')
        .eq('reservation_id', reservationId)
        .eq('org_id', orgId)
        .maybeSingle();

      if (!ingreso) {
        // No tiene ingreso → verificar si venció por tolerancia de No Arribó
        // antes de marcarla como 'pending' para IN
        if (res.start_datetime && res.dock_id) {
          const { data: dock } = await supabase
            .from('docks')
            .select('warehouse_id')
            .eq('id', res.dock_id)
            .eq('org_id', orgId)
            .maybeSingle();

          if (dock?.warehouse_id) {
            const { data: wh } = await supabase
              .from('warehouses')
              .select('timezone, no_show_tolerance_minutes')
              .eq('id', dock.warehouse_id)
              .eq('org_id', orgId)
              .maybeSingle();

            if (wh && wh.no_show_tolerance_minutes != null && wh.no_show_tolerance_minutes > 0) {
              const start = new Date(res.start_datetime);
              const cutoff = new Date(start.getTime() + Number(wh.no_show_tolerance_minutes) * 60_000);

              if (new Date() > cutoff) {
                return { state: 'expired_no_show', reservation: null };
              }
            }
          }
        }

        // No venció → está pendiente para IN
        const row: PendingReservationRow = {
          id: res.id,
          dua: res.dua,
          driver: res.driver || '',
          truck_plate: res.truck_plate,
          purchase_order: res.purchase_order,
          order_request_number: res.order_request_number,
          shipper_provider: res.shipper_provider,
          dock_id: res.dock_id,
          created_at: res.created_at,
          status_id: res.status_id,
          is_cancelled: res.is_cancelled,
          notes: res.notes,
          cargo_type: res.cargo_type,
          start_datetime: res.start_datetime,
          end_datetime: res.end_datetime,
          is_imported: res.is_imported,
        };
        return { state: 'pending', reservation: row };
      }

      // 5) Tiene ingreso → verificar si ya tiene salida
      const { data: salida } = await supabase
        .from('casetilla_salidas')
        .select('id')
        .eq('reservation_id', reservationId)
        .eq('org_id', orgId)
        .maybeSingle();

      if (salida) {
        return { state: 'has_salida', reservation: null };
      }

      // Tiene ingreso pero no salida → elegible para OUT
      const row: PendingReservationRow = {
        id: res.id,
        dua: res.dua,
        driver: res.driver || '',
        truck_plate: res.truck_plate,
        purchase_order: res.purchase_order,
        order_request_number: res.order_request_number,
        shipper_provider: res.shipper_provider,
        dock_id: res.dock_id,
        created_at: res.created_at,
        status_id: res.status_id,
        is_cancelled: res.is_cancelled,
        notes: res.notes,
        cargo_type: res.cargo_type,
        start_datetime: res.start_datetime,
        end_datetime: res.end_datetime,
        is_imported: res.is_imported,
      };
      return { state: 'has_ingreso', reservation: row };
    } catch {
      return { state: 'not_found', reservation: null };
    }
  }


  async createSalida(orgId: string, userId: string, reservationId: string, fotos?: string[]) {
    try {
      //console.log('[CasetillaService][createSalida] START', { orgId, userId, reservationId });

      // 1) Verificar que la reserva existe y obtener datos
      const { data: reservation, error: reservationError } = await supabase
        .from('reservations')
        .select('id, driver, truck_plate, dua, status_id')
        .eq('id', reservationId)
        .eq('org_id', orgId)
        .single();

      if (reservationError || !reservation) {
        throw new Error('Reserva no encontrada');
      }

      const statusFromId = reservation.status_id;

      /**console.log('[CasetillaService][createSalida] Reservation found', {
        reservationId,
        statusFromId
      });*/

      // 2) Verificar que no exista ya una salida para esta reserva (unique constraint)
      const { data: existingSalida, error: checkError } = await supabase
        .from('casetilla_salidas')
        .select('id')
        .eq('org_id', orgId)
        .eq('reservation_id', reservationId)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existingSalida) {
        throw new Error('Ya existe una salida registrada para esta reserva');
      }

      // 3) Buscar status DISPATCHED — solo activo
      const { data: dispatchedRow, error: dispatchedErr } = await supabase
        .from("reservation_statuses")
        .select("id")
        .eq("org_id", orgId)
        .eq("code", "DISPATCHED")
        .eq('is_active', true)
        .maybeSingle();

      if (dispatchedErr || !dispatchedRow?.id) {
        throw new Error("No se encontró el status DISPATCHED en reservation_statuses");
      }

      const statusToId = dispatchedRow.id;

      // 4) Actualizar status de la reserva a DISPATCHED
      /**console.log('[CasetillaService][createSalida] Updating reservation to DISPATCHED', {
        reservationId,
        statusFromId,
        statusToId
      });*/

      const { data: updatedSalidaRows, error: updateStatusError } = await supabase
        .from('reservations')
        .update({
          status_id: statusToId,
          updated_by: userId,
          updated_at: new Date().toISOString()
        })
        .eq('id', reservationId)
        .eq('org_id', orgId)
        .select('id');

      if (updateStatusError) {
        throw new Error('No se pudo actualizar el estado de la reserva');
      }

      if (!updatedSalidaRows || updatedSalidaRows.length === 0) {
        throw new Error('No se pudo actualizar el estado: el sistema no encontró la reserva o no tenés permisos suficientes. Contactá a un administrador.');
      }

      // 5) Insertar en casetilla_salidas
      const { data: salida, error: salidaError } = await supabase
        .from('casetilla_salidas')
        .insert({
          org_id: orgId,
          reservation_id: reservationId,
          chofer: reservation.driver ?? '',
          matricula: reservation.truck_plate ?? '',
          dua: reservation.dua ?? '',
          created_by: userId,
          exit_at: new Date().toISOString(),
          fotos: fotos && fotos.length > 0 ? fotos : null,
        })
        .select()
        .single();

      if (salidaError) throw salidaError;

      // ✅ 6) TRIGGER: Disparar evento de cambio de status a DISPATCHED


      try {
        // Obtener la reserva completa actualizada para el trigger
        const { data: fullReservation, error: resErr } = await supabase
          .from('reservations')
          .select('*')
          .eq('id', reservationId)
          .single();

        if (!resErr && fullReservation) {
          await emailTriggerService.onReservationStatusChanged(
            orgId,
            fullReservation as any,
            statusFromId,
            statusToId
          );
        }
      } catch (triggerError: any) {
        // non-blocking
      }

      /**console.log('[CasetillaService][createSalida] SUCCESS', {
        salidaId: salida.id,
        reservationId,
        statusChanged: statusFromId !== statusToId
      });*/

      return {
        salida,
        reservationId,
        statusFromId,
        statusToId
      };
    } catch (error) {
      // console.error('[CasetillaService][createSalida] ERROR', error);
      throw error;
    }
  }

  // ✅ NUEVA FUNCIÓN: Obtener reporte de duración
  async getDurationReport(
    orgId: string,
    filters?: DurationReportFilters,
    allowedWarehouseIds?: string[] | null,
    clientId?: string | null
  ) {
    try {
      // ─── SEGREGACIÓN: pre-calcular dock_ids permitidos ────────────────────
      let allowedDockIds: Set<string> | null = null;

      if (allowedWarehouseIds && allowedWarehouseIds.length > 0) {
        const { data: allowedDocks } = await supabase
          .from('docks')
          .select('id')
          .eq('org_id', orgId)
          .in('warehouse_id', allowedWarehouseIds);

        allowedDockIds = new Set((allowedDocks ?? []).map((d: any) => d.id as string));
      }

      if (clientId) {
        const clientDockIds = await this.getDockIdsForClient(orgId, clientId);
        const clientDockSet = new Set(clientDockIds);

        if (allowedDockIds !== null) {
          allowedDockIds = new Set([...allowedDockIds].filter((id) => clientDockSet.has(id)));
        } else {
          allowedDockIds = clientDockSet;
        }
      }
      // ─────────────────────────────────────────────────────────────────────

      // 1) Join entre casetilla_ingresos y casetilla_salidas
      const { data: ingresos, error: ingresosError } = await supabase
        .from('casetilla_ingresos')
        .select('reservation_id, chofer, matricula, dua, created_at, fotos, reservations(dock_id, docks(warehouse_id, warehouses(timezone)))')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });

      if (ingresosError) throw ingresosError;
      if (!ingresos || ingresos.length === 0) return [];

      // ─── SEGREGACIÓN: filtrar ingresos por dock permitido ─────────────────
      let filteredIngresos = ingresos as any[];
      if (allowedDockIds !== null) {
        filteredIngresos = filteredIngresos.filter((ing: any) => {
          const dockId = ing?.reservations?.dock_id;
          return dockId && allowedDockIds!.has(dockId);
        });
      }
      if (filteredIngresos.length === 0) return [];
      // ─────────────────────────────────────────────────────────────────────

      const reservationIds = filteredIngresos.map((ing: any) => ing.reservation_id).filter(Boolean);

      if (reservationIds.length === 0) return [];

      const { data: salidas, error: salidasError } = await supabase
        .from('casetilla_salidas')
        .select('reservation_id, exit_at, fotos')
        .eq('org_id', orgId)
        .in('reservation_id', reservationIds);

      if (salidasError) throw salidasError;
      if (!salidas || salidas.length === 0) return [];

      // 2) Crear maps de salidas (exit_at y fotos)
      const salidasMap = new Map<string, { exit_at: string; fotos?: string[] | null }>();
      salidas.forEach((sal: any) => {
        salidasMap.set(sal.reservation_id, {
          exit_at: sal.exit_at,
          fotos: sal.fotos ?? null,
        });
      });

      // 3) Traer datos de las reservas para enriquecer el reporte
      const reservationIdsWithSalida = filteredIngresos
        .filter((ing: any) => ing.reservation_id && salidasMap.has(ing.reservation_id))
        .map((ing: any) => ing.reservation_id as string);

      let reservationsMap = new Map<string, { start_datetime: string | null; end_datetime: string | null; shipper_provider: string | null }>();
      let providersMap = new Map<string, string>();

      if (reservationIdsWithSalida.length > 0) {
        const { data: reservationsData } = await supabase
          .from('reservations')
          .select('id, start_datetime, end_datetime, shipper_provider')
          .in('id', reservationIdsWithSalida)
          .eq('org_id', orgId);

        (reservationsData ?? []).forEach((r: any) => {
          reservationsMap.set(r.id, {
            start_datetime: r.start_datetime ?? null,
            end_datetime: r.end_datetime ?? null,
            shipper_provider: r.shipper_provider ?? null,
          });
        });

        const providerIds = [
          ...new Set(
            (reservationsData ?? [])
              .map((r: any) => r.shipper_provider)
              .filter((id: any) => id && String(id).match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i))
          ),
        ] as string[];

        if (providerIds.length > 0) {
          const { data: providersData } = await supabase
            .from('providers')
            .select('id, name')
            .in('id', providerIds);

          (providersData ?? []).forEach((p: any) => providersMap.set(p.id, p.name));
        }
      }

      // 4) Combinar ingresos con salidas y calcular duración
      let reportRows = filteredIngresos
        .filter((ing: any) => ing.reservation_id && salidasMap.has(ing.reservation_id))
        .map((ing: any) => {
          const salidaData = salidasMap.get(ing.reservation_id)!;
          const ingresoAt = new Date(ing.created_at);
          const salidaAt = new Date(salidaData.exit_at);
          const duracionMinutos = Math.round((salidaAt.getTime() - ingresoAt.getTime()) / 60000);

          const horas = Math.floor(duracionMinutos / 60);
          const minutos = duracionMinutos % 60;
          const duracionFormato = `${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}`;

          // Extraer warehouse_timezone del join anidado
          const warehouseTimezone: string =
            (ing as any)?.reservations?.docks?.warehouses?.timezone || 'America/Costa_Rica';

          // Enriquecer con datos de la reserva
          const resInfo = reservationsMap.get(ing.reservation_id);
          const shipper = resInfo?.shipper_provider ?? null;
          const isUUID = shipper && String(shipper).match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
          const providerName = isUUID ? (providersMap.get(shipper) ?? 'N/A') : (shipper ?? 'Sin proveedor');

          const startStr = resInfo?.start_datetime ?? null;
          const endStr = resInfo?.end_datetime ?? null;

          let expectedMins: number | null = null;
          let expectedFmt: string | null = null;
          if (startStr && endStr) {
            const start = new Date(startStr);
            const end = new Date(endStr);
            expectedMins = Math.round((end.getTime() - start.getTime()) / 60000);
            const eh = Math.floor(expectedMins / 60);
            const em = expectedMins % 60;
            expectedFmt = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
          }

          const diffMins = expectedMins != null ? duracionMinutos - expectedMins : null;
          let diffStr: string | null = null;
          if (diffMins !== null) {
            if (diffMins > 0) diffStr = `+${diffMins} min`;
            else if (diffMins < 0) diffStr = `${diffMins} min`;
            else diffStr = '0 min';
          }

          return {
            reservation_id: ing.reservation_id,
            chofer: ing.chofer ?? '',
            matricula: ing.matricula ?? '',
            dua: ing.dua ?? '',
            provider_name: providerName,
            start_datetime: startStr,
            end_datetime: endStr,
            ingreso_at: ing.created_at,
            salida_at: salidaData.exit_at,
            duracion_minutos: duracionMinutos,
            duracion_formato: duracionFormato,
            expected_duration_minutes: expectedMins,
            expected_duration_formato: expectedFmt,
            duration_difference_minutes: diffMins,
            duration_difference_formato: diffStr,
            fotos_ingreso: (ing.fotos as string[] | null) ?? null,
            fotos_salida: salidaData.fotos ?? null,
            warehouse_timezone: warehouseTimezone,
          };
        });

      // 5) Aplicar filtros
      if (filters) {
        if (filters.searchTerm && filters.searchTerm.trim()) {
          const term = filters.searchTerm.toLowerCase();
          reportRows = reportRows.filter(
            (row: any) =>
              (row.chofer ?? '').toLowerCase().includes(term) ||
              (row.matricula ?? '').toLowerCase().includes(term) ||
              (row.dua ?? '').toLowerCase().includes(term)
          );
        }

        if (filters.fechaDesde) {
          // Si es solo una fecha (YYYY-MM-DD) parsear como hora local
          const raw = filters.fechaDesde;
          const fechaDesde = raw.includes('T') ? new Date(raw) : new Date(`${raw}T00:00:00`);
          reportRows = reportRows.filter((row: any) => new Date(row.ingreso_at) >= fechaDesde);
        }

        if (filters.fechaHasta) {
          const raw = filters.fechaHasta;
          // Si es solo fecha (YYYY-MM-DD) usar fin del día local; si ya es ISO usar como viene
          const fechaHasta = raw.includes('T') ? new Date(raw) : new Date(`${raw}T23:59:59.999`);
          reportRows = reportRows.filter((row: any) => new Date(row.ingreso_at) <= fechaHasta);
        }
      }

      // 6) Ordenar por duración descendente (mayor a menor)
      reportRows.sort((a: any, b: any) => b.duracion_minutos - a.duracion_minutos);

      return reportRows;
    } catch (error) {
      // console.error('Error fetching duration report:', error);
      throw error;
    }
  }

  // ─── REPORTE: Distribución de tiempos por proveedor ─────────────────────
  async getProviderDistributionReport(
    orgId: string,
    startDate: Date,
    endDate: Date,
    timezone: string,
    allowedWarehouseIds?: string[] | null,
    clientId?: string | null
  ) {
    try {
      // 1) Rango UTC desde inicio del día startDate hasta fin del día endDate
      const tz = timezone || DEFAULT_TIMEZONE;
      let fromIso: string;
      let toIso: string;
      try {
        fromIso = getStartOfDayInTimezone(startDate, tz).toISOString();
        toIso = getEndOfDayInTimezone(endDate, tz).toISOString();
      } catch {
        return [];
      }

      // 2) SEGREGACIÓN: pre-calcular dock_ids permitidos
      let allowedDockIds: Set<string> | null = null;

      if (allowedWarehouseIds && allowedWarehouseIds.length > 0) {
        const { data: allowedDocks } = await supabase
          .from('docks')
          .select('id')
          .eq('org_id', orgId)
          .in('warehouse_id', allowedWarehouseIds);
        allowedDockIds = new Set((allowedDocks ?? []).map((d: any) => d.id as string));
      }

      if (clientId) {
        const clientDockIds = await this.getDockIdsForClient(orgId, clientId);
        const clientDockSet = new Set(clientDockIds);
        if (allowedDockIds !== null) {
          allowedDockIds = new Set([...allowedDockIds].filter((id) => clientDockSet.has(id)));
        } else {
          allowedDockIds = clientDockSet;
        }
      }

      // 3) Cargar RESERVAS del rango (tiempo teórico)
      let reservationsQuery = supabase
        .from('reservations')
        .select('id, start_datetime, end_datetime, shipper_provider, dock_id, is_cancelled')
        .eq('org_id', orgId)
        .eq('is_cancelled', false)
        .gte('start_datetime', fromIso)
        .lte('start_datetime', toIso);

      const { data: reservations, error: resErr } = await reservationsQuery;
      if (resErr) throw resErr;
      if (!reservations || reservations.length === 0) return [];

      let rows = reservations as any[];
      if (allowedDockIds !== null) {
        rows = rows.filter((r) => allowedDockIds!.has(r.dock_id));
      }

      // 4) Cargar INGRESOS del rango (para citas_con_in y tiempo real)
      let ingresosQuery = supabase
        .from('casetilla_ingresos')
        .select('reservation_id, created_at')
        .eq('org_id', orgId)
        .not('reservation_id', 'is', null)
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .order('created_at', { ascending: false });

      const { data: ingresos, error: ingErr } = await ingresosQuery;
      if (ingErr) throw ingErr;

      // 5) Cargar SALIDAS para los ingresos encontrados
      const ingresoReservationIds = (ingresos ?? []).map((i: any) => i.reservation_id).filter(Boolean) as string[];
      let salidasMap = new Map<string, string>();
      if (ingresoReservationIds.length > 0) {
        const { data: salidas } = await supabase
          .from('casetilla_salidas')
          .select('reservation_id, exit_at')
          .eq('org_id', orgId)
          .in('reservation_id', ingresoReservationIds)
          .order('exit_at', { ascending: false });

        (salidas ?? []).forEach((s: any) => {
          const rid = s.reservation_id as string;
          const exitAt = s.exit_at as string;
          if (!salidasMap.has(rid)) {
            salidasMap.set(rid, exitAt);
          }
        });
      }

      // 6) Resolver proveedores
      const providerIds = [
        ...new Set(
          rows
            .map((r) => r.shipper_provider)
            .filter((id: any) =>
              id && String(id).match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
            )
        ),
      ] as string[];

      const providersMap = new Map<string, string>();
      const providersTypeMap = new Map<string, string>();
      if (providerIds.length > 0) {
        const { data: provData } = await supabase
          .from('providers')
          .select('id, name, provider_type')
          .in('id', providerIds);

        (provData ?? []).forEach((p: any) => {
          providersMap.set(p.id as string, p.name as string);
          providersTypeMap.set(p.id as string, (p.provider_type as string) || 'almacenaje');
        });
      }

      // Helper: resolver nombre de proveedor
      const resolveProviderName = (shipper: string | null): string => {
        if (!shipper) return 'Sin proveedor';
        const isUUID = String(shipper).match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        return isUUID ? (providersMap.get(shipper) ?? 'N/A') : shipper;
      };

      // Helper: resolver provider_type
      const resolveProviderType = (shipper: string | null): string => {
        if (!shipper) return 'almacenaje';
        const isUUID = String(shipper).match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        return isUUID ? (providersTypeMap.get(shipper) ?? 'almacenaje') : 'almacenaje';
      };

      // Helper: minutos a HH:mm
      const fmtHHMM = (mins: number): string => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      };

      // 7) Construir maps
      const ingresosMap = new Map<string, string>();
      (ingresos ?? []).forEach((i: any) => {
        // Tomar el primer ingreso (más reciente) por reserva
        if (!ingresosMap.has(i.reservation_id)) {
          ingresosMap.set(i.reservation_id, i.created_at);
        }
      });

      // 8) Agrupar por proveedor
      const groups = new Map<string, {
        provider_type: string;
        citas_programadas: number;
        citas_con_in: number;
        citas_con_out: number;
        tiempo_teorico_min: number;
        tiempo_real_min: number;
      }>();

      for (const r of rows) {
        const pname = resolveProviderName(r.shipper_provider ?? null);
        const ptype = resolveProviderType(r.shipper_provider ?? null);
        let g = groups.get(pname);
        if (!g) {
          g = { provider_type: ptype, citas_programadas: 0, citas_con_in: 0, citas_con_out: 0, tiempo_teorico_min: 0, tiempo_real_min: 0 };
          groups.set(pname, g);
        }

        // Citas programadas + tiempo teórico
        g.citas_programadas++;
        if (r.start_datetime && r.end_datetime) {
          const start = new Date(r.start_datetime);
          const end = new Date(r.end_datetime);
          const mins = Math.round((end.getTime() - start.getTime()) / 60000);
          g.tiempo_teorico_min += Math.max(0, mins);
        }

        // IN registrado?
        if (ingresosMap.has(r.id)) {
          g.citas_con_in++;

          // OUT registrado?
          if (salidasMap.has(r.id)) {
            g.citas_con_out++;
            const ingAt = new Date(ingresosMap.get(r.id)!);
            const salAt = new Date(salidasMap.get(r.id)!);
            const realMins = Math.round((salAt.getTime() - ingAt.getTime()) / 60000);
            g.tiempo_real_min += Math.max(0, realMins);
          }
        }
      }

      // 9) Calcular totales para porcentajes
      let totalTeorico = 0;
      let totalReal = 0;
      for (const g of groups.values()) {
        totalTeorico += g.tiempo_teorico_min;
        totalReal += g.tiempo_real_min;
      }

      // 10) Construir filas finales
      const result: {
        provider_name: string;
        provider_type: string;
        citas_programadas: number;
        citas_con_in: number;
        citas_con_out: number;
        pendientes_out: number;
        tiempo_teorico_minutos: number;
        tiempo_teorico_formato: string;
        tiempo_real_minutos: number;
        tiempo_real_formato: string;
        diferencia_minutos: number;
        diferencia_formato: string;
        pct_teorico_total: number;
        pct_real_total: number;
        promedio_teorico_minutos: number;
        promedio_teorico_formato: string;
        promedio_real_minutos: number;
        promedio_real_formato: string;
      }[] = [];

      for (const [provider_name, g] of groups) {
        const diferencia = g.tiempo_real_min - g.tiempo_teorico_min;
        let diferenciaFormato: string;
        if (diferencia > 0) diferenciaFormato = `+${diferencia} min`;
        else if (diferencia < 0) diferenciaFormato = `${diferencia} min`;
        else diferenciaFormato = '0 min';

        const pctTeorico = totalTeorico > 0 ? g.tiempo_teorico_min / totalTeorico : 0;
        const pctReal = totalReal > 0 ? g.tiempo_real_min / totalReal : 0;

        const promedioTeorico = g.citas_programadas > 0 ? Math.round(g.tiempo_teorico_min / g.citas_programadas) : 0;
        const promedioReal = g.citas_con_out > 0 ? Math.round(g.tiempo_real_min / g.citas_con_out) : 0;

        result.push({
          provider_name,
          provider_type: g.provider_type || 'almacenaje',
          citas_programadas: g.citas_programadas,
          citas_con_in: g.citas_con_in,
          citas_con_out: g.citas_con_out,
          pendientes_out: g.citas_con_in - g.citas_con_out,
          tiempo_teorico_minutos: g.tiempo_teorico_min,
          tiempo_teorico_formato: fmtHHMM(g.tiempo_teorico_min),
          tiempo_real_minutos: g.tiempo_real_min,
          tiempo_real_formato: fmtHHMM(g.tiempo_real_min),
          diferencia_minutos: diferencia,
          diferencia_formato: diferenciaFormato,
          pct_teorico_total: 0,
          pct_real_total: 0,
          promedio_teorico_minutos: promedioTeorico,
          promedio_teorico_formato: fmtHHMM(promedioTeorico),
          promedio_real_minutos: promedioReal,
          promedio_real_formato: fmtHHMM(promedioReal),
        });
      }

      // Ordenar por tiempo real descendente
      result.sort((a, b) => b.tiempo_real_minutos - a.tiempo_real_minutos);

      return result;
    } catch (error) {
      throw error;
    }
  }

  // ─── Helper: obtener fecha más antigua de datos (reservations o ingresos) ─
  async getEarliestDataDate(
    orgId: string,
    timezone: string,
    allowedWarehouseIds?: string[] | null,
    clientId?: string | null
  ): Promise<string | null> {
    try {
      // SEGREGACIÓN: pre-calcular dock_ids permitidos
      let allowedDockIds: Set<string> | null = null;

      if (allowedWarehouseIds && allowedWarehouseIds.length > 0) {
        const { data: allowedDocks } = await supabase
          .from('docks')
          .select('id')
          .eq('org_id', orgId)
          .in('warehouse_id', allowedWarehouseIds);
        allowedDockIds = new Set((allowedDocks ?? []).map((d: any) => d.id as string));
      }

      if (clientId) {
        const clientDockIds = await this.getDockIdsForClient(orgId, clientId);
        const clientDockSet = new Set(clientDockIds);
        if (allowedDockIds !== null) {
          allowedDockIds = new Set([...allowedDockIds].filter((id) => clientDockSet.has(id)));
        } else {
          allowedDockIds = clientDockSet;
        }
      }

      // Fecha mínima de reservations.start_datetime
      let reservationsQuery = supabase
        .from('reservations')
        .select('start_datetime')
        .eq('org_id', orgId)
        .eq('is_cancelled', false)
        .not('start_datetime', 'is', null)
        .order('start_datetime', { ascending: true })
        .limit(1);

      if (allowedDockIds !== null && allowedDockIds.size > 0) {
        reservationsQuery = reservationsQuery.in('dock_id', [...allowedDockIds]);
      }

      const { data: minRes } = await reservationsQuery;

      // Fecha mínima de casetilla_ingresos.created_at
      let ingresosQuery = supabase
        .from('casetilla_ingresos')
        .select('created_at')
        .eq('org_id', orgId)
        .not('reservation_id', 'is', null)
        .order('created_at', { ascending: true })
        .limit(1);

      const { data: minIng } = await ingresosQuery;

      let earliest: string | null = null;
      if (minRes && minRes.length > 0 && minRes[0].start_datetime) {
        earliest = minRes[0].start_datetime;
      }
      if (minIng && minIng.length > 0 && minIng[0].created_at) {
        if (!earliest || new Date(minIng[0].created_at) < new Date(earliest)) {
          earliest = minIng[0].created_at;
        }
      }

      if (!earliest) return null;

      // Convertir a YYYY-MM-DD en el timezone del almacén
      const tz = timezone || DEFAULT_TIMEZONE;
      try {
        const d = new Date(earliest);
        const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
        const parts = formatter.formatToParts(d);
        const year = parts.find((p) => p.type === 'year')?.value;
        const month = parts.find((p) => p.type === 'month')?.value;
        const day = parts.find((p) => p.type === 'day')?.value;
        return `${year}-${month}-${day}`;
      } catch {
        return earliest.split('T')[0];
      }
    } catch {
      return null;
    }
  }

  // ─── Helper: obtener clave YYYY-MM en un timezone ─────────────────────────
  private _getMonthKey(dateStr: string, tz: string): string {
    try {
      const d = new Date(dateStr);
      const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' });
      const parts = formatter.formatToParts(d);
      const year = parts.find((p) => p.type === 'year')?.value;
      const month = parts.find((p) => p.type === 'month')?.value;
      return `${year}-${month}`;
    } catch {
      // Fallback si timezone no es soportado por Intl
      const d = new Date(dateStr);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    }
  }

  // ─── REPORTE: Distribución global mensual de tiempos ─────────────────────
  async getMonthlyGlobalTimeDistributionReport(
    orgId: string,
    startDate: Date,
    endDate: Date,
    timezone: string,
    allowedWarehouseIds?: string[] | null,
    clientId?: string | null
  ) {
    try {
      const tz = timezone || DEFAULT_TIMEZONE;
      let fromIso: string;
      let toIso: string;
      try {
        fromIso = getStartOfDayInTimezone(startDate, tz).toISOString();
        toIso = getEndOfDayInTimezone(endDate, tz).toISOString();
      } catch {
        return [];
      }

      // 1) SEGREGACIÓN: pre-calcular dock_ids permitidos
      let allowedDockIds: Set<string> | null = null;

      if (allowedWarehouseIds && allowedWarehouseIds.length > 0) {
        const { data: allowedDocks } = await supabase
          .from('docks')
          .select('id')
          .eq('org_id', orgId)
          .in('warehouse_id', allowedWarehouseIds);
        allowedDockIds = new Set((allowedDocks ?? []).map((d: any) => d.id as string));
      }

      if (clientId) {
        const clientDockIds = await this.getDockIdsForClient(orgId, clientId);
        const clientDockSet = new Set(clientDockIds);
        if (allowedDockIds !== null) {
          allowedDockIds = new Set([...allowedDockIds].filter((id) => clientDockSet.has(id)));
        } else {
          allowedDockIds = clientDockSet;
        }
      }

      // 2) Cargar RESERVAS del rango
      const { data: reservations, error: resErr } = await supabase
        .from('reservations')
        .select('id, start_datetime, end_datetime, dock_id, is_cancelled')
        .eq('org_id', orgId)
        .eq('is_cancelled', false)
        .gte('start_datetime', fromIso)
        .lte('start_datetime', toIso);

      if (resErr) throw resErr;
      let resRows = (reservations ?? []) as any[];
      if (allowedDockIds !== null) {
        resRows = resRows.filter((r) => allowedDockIds!.has(r.dock_id));
      }

      // 3) Cargar INGRESOS del rango (solo con reservation_id)
      const { data: ingresos, error: ingErr } = await supabase
        .from('casetilla_ingresos')
        .select('reservation_id, created_at')
        .eq('org_id', orgId)
        .not('reservation_id', 'is', null)
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .order('created_at', { ascending: false });

      if (ingErr) throw ingErr;

      // 4) Cargar SALIDAS para esos ingresos
      const ingresoReservationIds = (ingresos ?? []).map((i: any) => i.reservation_id).filter(Boolean) as string[];
      let salidasMap = new Map<string, string>();
      if (ingresoReservationIds.length > 0) {
        const { data: salidas } = await supabase
          .from('casetilla_salidas')
          .select('reservation_id, exit_at')
          .eq('org_id', orgId)
          .in('reservation_id', ingresoReservationIds)
          .order('exit_at', { ascending: false });

        (salidas ?? []).forEach((s: any) => {
          const rid = s.reservation_id as string;
          const exitAt = s.exit_at as string;
          if (!salidasMap.has(rid)) {
            salidasMap.set(rid, exitAt);
          }
        });
      }

      // 5) Construir map de ingresos (primer ingreso por reserva)
      const ingresosMap = new Map<string, string>();
      (ingresos ?? []).forEach((i: any) => {
        if (!ingresosMap.has(i.reservation_id)) {
          ingresosMap.set(i.reservation_id, i.created_at);
        }
      });

      // Helper: minutos a HH:mm
      const fmtHHMM = (mins: number): string => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      };

      // Helper: label legible para mes
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const getMonthLabel = (key: string): string => {
        const [y, m] = key.split('-').map(Number);
        return `${monthNames[m - 1]} ${y}`;
      };

      // 6) Agrupar por mes
      const groups = new Map<string, {
        citas_programadas: number;
        citas_con_in: number;
        citas_con_out: number;
        tiempo_teorico_min: number;
        tiempo_real_min: number;
      }>();

      // Procesar reservas → agrupar por mes del start_datetime
      for (const r of resRows) {
        if (!r.start_datetime) continue;
        const monthKey = this._getMonthKey(r.start_datetime, tz);
        let g = groups.get(monthKey);
        if (!g) {
          g = { citas_programadas: 0, citas_con_in: 0, citas_con_out: 0, tiempo_teorico_min: 0, tiempo_real_min: 0 };
          groups.set(monthKey, g);
        }

        g.citas_programadas++;
        if (r.start_datetime && r.end_datetime) {
          const start = new Date(r.start_datetime);
          const end = new Date(r.end_datetime);
          const mins = Math.round((end.getTime() - start.getTime()) / 60000);
          g.tiempo_teorico_min += Math.max(0, mins);
        }

        if (ingresosMap.has(r.id)) {
          g.citas_con_in++;
          if (salidasMap.has(r.id)) {
            g.citas_con_out++;
            const ingAt = new Date(ingresosMap.get(r.id)!);
            const salAt = new Date(salidasMap.get(r.id)!);
            const realMins = Math.round((salAt.getTime() - ingAt.getTime()) / 60000);
            g.tiempo_real_min += Math.max(0, realMins);
          }
        }
      }

      // 7) Calcular totales históricos
      let totalTeorico = 0;
      let totalReal = 0;
      for (const g of groups.values()) {
        totalTeorico += g.tiempo_teorico_min;
        totalReal += g.tiempo_real_min;
      }

      // 8) Construir filas finales ordenadas ascendentemente por mes
      const result: {
        month_label: string;
        month_key: string;
        citas_programadas: number;
        citas_con_in: number;
        citas_con_out: number;
        pendientes_out: number;
        tiempo_teorico_minutos: number;
        tiempo_teorico_formato: string;
        tiempo_real_minutos: number;
        tiempo_real_formato: string;
        diferencia_minutos: number;
        diferencia_formato: string;
        pct_real_vs_teorico: number;
        promedio_teorico_minutos: number;
        promedio_teorico_formato: string;
        promedio_real_minutos: number;
        promedio_real_formato: string;
      }[] = [];

      const sortedKeys = [...groups.keys()].sort();

      for (const monthKey of sortedKeys) {
        const g = groups.get(monthKey)!;
        const diferencia = g.tiempo_real_min - g.tiempo_teorico_min;
        let diferenciaFormato: string;
        if (diferencia > 0) diferenciaFormato = `+${diferencia} min`;
        else if (diferencia < 0) diferenciaFormato = `${diferencia} min`;
        else diferenciaFormato = '0 min';

        const pctRealVsTeorico = g.tiempo_teorico_min > 0 ? g.tiempo_real_min / g.tiempo_teorico_min : 0;

        const promedioTeorico = g.citas_programadas > 0 ? Math.round(g.tiempo_teorico_min / g.citas_programadas) : 0;
        const promedioReal = g.citas_con_out > 0 ? Math.round(g.tiempo_real_min / g.citas_con_out) : 0;

        result.push({
          month_label: getMonthLabel(monthKey),
          month_key: monthKey,
          citas_programadas: g.citas_programadas,
          citas_con_in: g.citas_con_in,
          citas_con_out: g.citas_con_out,
          pendientes_out: g.citas_con_in - g.citas_con_out,
          tiempo_teorico_minutos: g.tiempo_teorico_min,
          tiempo_teorico_formato: fmtHHMM(g.tiempo_teorico_min),
          tiempo_real_minutos: g.tiempo_real_min,
          tiempo_real_formato: fmtHHMM(g.tiempo_real_min),
          diferencia_minutos: diferencia,
          diferencia_formato: diferenciaFormato,
          pct_real_vs_teorico: pctRealVsTeorico,
          promedio_teorico_minutos: promedioTeorico,
          promedio_teorico_formato: fmtHHMM(promedioTeorico),
          promedio_real_minutos: promedioReal,
          promedio_real_formato: fmtHHMM(promedioReal),
        });
      }

      return result;
    } catch (error) {
      throw error;
    }
  }

  // ─── NO-SHOW: listar reservas marcadas como No arribó ──────────────────
  async getNoShowReservations(
    orgId: string,
    allowedWarehouseIds?: string[] | null,
    clientId?: string | null,
    selectedDate?: Date | null,
    timezone?: string | null
  ) {
    try {
      // Obtener status NO_SHOW — solo activo
      const { data: noShowRow, error: noShowErr } = await supabase
        .from('reservation_statuses')
        .select('id')
        .eq('org_id', orgId)
        .eq('code', 'NO_SHOW')
        .eq('is_active', true)
        .maybeSingle();

      if (noShowErr) throw noShowErr;
      if (!noShowRow?.id) return [];

      const noShowStatusId = noShowRow.id;

      let q = supabase
        .from('reservations')
        .select(`
          id,
          org_id,
          dua,
          driver,
          truck_plate,
          purchase_order,
          order_request_number,
          shipper_provider,
          dock_id,
          created_at,
          start_datetime,
          end_datetime,
          status_id,
          is_cancelled
        `)
        .eq('org_id', orgId)
        .eq('status_id', noShowStatusId)
        .eq('is_cancelled', false)
        .order('start_datetime', { ascending: false });

      // ─── FILTRO POR FECHA: aplicar rango start_datetime en DB ───────────
      if (selectedDate) {
        const dateRange = this._buildDateFilterParams(selectedDate, timezone);
        if (dateRange) {
          q = q
            .gte('start_datetime', dateRange.fromIso)
            .lte('start_datetime', dateRange.toIso);
        }
      }
      // ─────────────────────────────────────────────────────────────────────


      const { data: reservations, error } = await q;
      if (error) throw error;
      if (!reservations || reservations.length === 0) return [];

      let rows = reservations as any[];

      // ─── SEGREGACIÓN: filtrar por docks permitidos ────────────────────────
      let allowedDockIds: Set<string> | null = null;

      if (allowedWarehouseIds && allowedWarehouseIds.length > 0) {
        const { data: allowedDocks } = await supabase
          .from('docks')
          .select('id')
          .eq('org_id', orgId)
          .in('warehouse_id', allowedWarehouseIds);

        allowedDockIds = new Set((allowedDocks ?? []).map((d: any) => d.id as string));
      }

      if (clientId) {
        const clientDockIds = await this.getDockIdsForClient(orgId, clientId);
        const clientDockSet = new Set(clientDockIds);

        if (allowedDockIds !== null) {
          allowedDockIds = new Set([...allowedDockIds].filter((id) => clientDockSet.has(id)));
        } else {
          allowedDockIds = clientDockSet;
        }
      }

      if (allowedDockIds !== null) {
        rows = rows.filter((r: any) => allowedDockIds!.has(r.dock_id));
      }
      if (rows.length === 0) return [];
      // ─────────────────────────────────────────────────────────────────────

      // Docks → Warehouses
      const dockIds = [...new Set(rows.map((r) => r.dock_id).filter(Boolean))];
      const docksMap = new Map<string, { name?: string; warehouse_id?: string | null }>();

      if (dockIds.length > 0) {
        const { data: docksData } = await supabase
          .from('docks')
          .select('id,name,warehouse_id')
          .in('id', dockIds);

        (docksData ?? []).forEach((d: any) => {
          docksMap.set(d.id, { name: d.name, warehouse_id: d.warehouse_id ?? null });
        });
      }

      const warehouseIds = [
        ...new Set(
          [...docksMap.values()].map((d) => d.warehouse_id).filter(Boolean) as string[]
        ),
      ];

      const warehousesMap = new Map<string, string>();
      if (warehouseIds.length > 0) {
        const { data: whData } = await supabase
          .from('warehouses')
          .select('id,name')
          .in('id', warehouseIds);

        (whData ?? []).forEach((w: any) => warehousesMap.set(w.id, w.name));
      }

      // Providers
      const providerIds = [
        ...new Set(
          rows
            .map((r) => r.shipper_provider)
            .filter((id: any) =>
              id && String(id).match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
            )
        ),
      ] as string[];

      const providersMap = new Map<string, string>();
      if (providerIds.length > 0) {
        const { data: provData } = await supabase
          .from('providers')
          .select('id,name')
          .in('id', providerIds);

        (provData ?? []).forEach((p: any) => providersMap.set(p.id, p.name));
      }

      return rows.map((r: any) => {
        const dock = docksMap.get(r.dock_id);
        const whName = dock?.warehouse_id ? warehousesMap.get(dock.warehouse_id) : null;

        const shipper = r.shipper_provider ?? null;
        const isUUID = shipper && String(shipper).match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        const providerName = isUUID ? providersMap.get(shipper) ?? 'N/A' : shipper ?? 'N/A';

        return {
          id: r.id,
          dua: r.dua ?? '',
          placa: r.truck_plate ?? '',
          chofer: r.driver ?? '',
          provider_name: providerName,
          warehouse_name: whName ?? 'N/A',
          start_datetime: r.start_datetime,
          end_datetime: r.end_datetime,
          created_at: r.created_at,
          motivo: 'No asistió dentro del tiempo permitido',
        };
      });
    } catch (error) {
      throw error;
    }
  }
}

export const casetillaService = new CasetillaService();