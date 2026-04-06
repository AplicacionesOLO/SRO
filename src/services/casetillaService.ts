import { supabase } from '../lib/supabase';
import type { CreateCasetillaIngresoInput, CasetillaIngreso } from '../types/casetilla';
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

      // try without org_id (tu caso actual)
      {
        const q = supabase.from('reservation_statuses').select('id').eq('code', code).limit(1);
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
        const q = supabase.from('reservation_statuses').select('id').eq('name', name).limit(1);
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
          orden_compra: data.orden_compra,
          numero_pedido: data.numero_pedido,
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
        } catch (triggerError) {
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
    clientId?: string | null
  ) {
    try {
      // ✅ Usar RPC que filtra PENDING + NOT EXISTS casetilla_ingresos en una sola query SQL
      const { data: reservations, error: rpcError } = await supabase
        .rpc('get_pending_reservations_v2', { p_org_id: orgId });

      if (rpcError) throw rpcError;
      if (!reservations || reservations.length === 0) return [];

      let rows = reservations as PendingReservationRow[];

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

      // Map final para UI
      return rows.map((r) => {
        const dock = docksMap.get(r.dock_id);
        const whName = dock?.warehouse_id ? warehousesMap.get(dock.warehouse_id) : null;
        
        const isUUID = r.shipper_provider && r.shipper_provider.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        const providerName = isUUID 
          ? (providersMap.get(r.shipper_provider!) ?? 'N/A')
          : (r.shipper_provider ?? 'N/A');

        return {
          id: r.id,
          dua: r.dua,
          placa: r.truck_plate ?? '',
          chofer: r.driver ?? '',
          orden_compra: r.purchase_order ?? '',
          numero_pedido: r.order_request_number ?? '',
          provider_name: providerName,
          warehouse_name: whName ?? 'N/A',
          created_at: r.created_at
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
    clientId?: string | null
  ) {
    try {
      const allReservations = await this.getPendingReservations(orgId, allowedWarehouseIds, clientId);

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

// ✅ REEMPLAZA getExitEligibleReservations(orgId)
// Regla: listar reservas que tengan ingreso en casetilla_ingresos,
// excluir: canceladas, con salida ya registrada, y status DISPATCHED.
async getExitEligibleReservations(
  orgId: string,
  allowedWarehouseIds?: string[] | null,
  clientId?: string | null
) {
  try {
    // 1) Obtener status DISPATCHED desde tabla (NO quemado)
    const { data: dispatchedRow, error: dispatchedErr } = await supabase
      .from("reservation_statuses")
      .select("id")
      .eq("org_id", orgId)
      .eq("code", "DISPATCHED")
      .maybeSingle();

    if (dispatchedErr) throw dispatchedErr;
    const dispatchedStatusId = dispatchedRow?.id ?? null;

    // 2) Traer ingresos ordenados (último ingreso primero)
    const { data: ingresos, error: ingresosError } = await supabase
      .from("casetilla_ingresos")
      .select("reservation_id, created_at")
      .eq("org_id", orgId)
      .not("reservation_id", "is", null)
      .order("created_at", { ascending: false });

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

    // 4) Traer reservas (no canceladas, no despachadas)
    let q = supabase
      .from("reservations")
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
      .eq("org_id", orgId)
      .eq("is_cancelled", false)
      .in("id", eligibleReservationIds)
      .order("created_at", { ascending: false });

    if (dispatchedStatusId) {
      q = q.neq("status_id", dispatchedStatusId);
    }

    const { data: reservations, error: reservationsError } = await q;
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

      const providerName = isUUID ? providersMap.get(shipper) ?? "N/A" : shipper ?? "N/A";

      const whData = dock?.warehouse_id ? warehousesMap.get(dock.warehouse_id) : null;

      return {
        id: r.id,
        dua: r.dua ?? null,
        matricula: r.truck_plate ?? "",
        chofer: r.driver ?? "",
        proveedor: providerName,
        almacen: whData?.name ?? "N/A",
        provider_name: providerName,
        warehouse_name: whData?.name ?? "N/A",
        warehouse_id: dock?.warehouse_id ?? null,
        warehouse_timezone: whData?.timezone ?? 'America/Costa_Rica',
        provider_id: shipper ?? null,
        orden_compra: r.purchase_order ?? "",
        numero_pedido: r.order_request_number ?? "",
        fecha_ingreso: ingresosMap.get(r.id) ?? null,
        created_at: r.created_at,
      };
    });
  } catch (error) {
    // console.error("Error fetching exit eligible reservations:", error);
    throw error;
  }
}


  // ✅ NUEVA FUNCIÓN: Crear salida
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

      // 3) Buscar status DISPATCHED 
      const { data: dispatchedRow, error: dispatchedErr } = await supabase
        .from("reservation_statuses")
        .select("id")
        .eq("org_id", orgId)
        .eq("code", "DISPATCHED")
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
      /**console.log('[CasetillaService][createSalida] Triggering DISPATCHED event', {
        reservationId,
        statusFromId,
        statusToId
      });*/

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
        } else {
          // console.error('[CasetillaService][createSalida] Failed to fetch reservation for trigger', resErr);
        }
      } catch (triggerError) {
        // console.error('[CasetillaService][createSalida] Email trigger failed', triggerError);
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

      // 3) Combinar ingresos con salidas y calcular duración
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

          return {
            reservation_id: ing.reservation_id,
            chofer: ing.chofer ?? '',
            matricula: ing.matricula ?? '',
            dua: ing.dua ?? '',
            ingreso_at: ing.created_at,
            salida_at: salidaData.exit_at,
            duracion_minutos: duracionMinutos,
            duracion_formato: duracionFormato,
            fotos_ingreso: (ing.fotos as string[] | null) ?? null,
            fotos_salida: salidaData.fotos ?? null,
            warehouse_timezone: warehouseTimezone,
          };
        });

      // 4) Aplicar filtros
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
          const fechaDesde = new Date(filters.fechaDesde);
          reportRows = reportRows.filter((row: any) => new Date(row.ingreso_at) >= fechaDesde);
        }

        if (filters.fechaHasta) {
          const fechaHasta = new Date(filters.fechaHasta);
          fechaHasta.setHours(23, 59, 59, 999);
          reportRows = reportRows.filter((row: any) => new Date(row.ingreso_at) <= fechaHasta);
        }
      }

      // 5) Ordenar por duración descendente (mayor a menor)
      reportRows.sort((a: any, b: any) => b.duracion_minutos - a.duracion_minutos);

      return reportRows;
    } catch (error) {
      // console.error('Error fetching duration report:', error);
      throw error;
    }
  }
}

export const casetillaService = new CasetillaService();