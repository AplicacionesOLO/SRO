import { supabase } from '../lib/supabase';
import type { CreateCasetillaIngresoInput, CasetillaIngreso } from '../types/casetilla';
import { emailTriggerService } from './emailTriggerService';

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
      console.log('[CasetillaService][createIngreso] START', { 
        orgId, 
        userId, 
        dua: data.dua, 
        matricula: data.matricula,
        explicitReservationId: data.reservation_id 
      });

      let reservationId: string | undefined = data.reservation_id; // ✅ Usar ID explícito si viene
      let reservationUpdated = false;
      let statusFromId: string | null = null;
      let statusToId: string | null = null;
      let updateError: any = null;

      // ✅ 1) Si viene reservation_id explícito, usarlo directamente
      if (reservationId) {
        console.log('[CasetillaService][createIngreso] Using explicit reservation_id', { reservationId });

        const { data: reservation, error: fetchError } = await supabase
          .from('reservations')
          .select('id, status_id')
          .eq('id', reservationId)
          .eq('org_id', orgId)
          .maybeSingle();

        if (fetchError) {
          console.error('[CasetillaService][createIngreso] Error fetching reservation by ID', fetchError);
          throw new Error('No se pudo verificar la reserva. Contactá a un administrador.');
        }

        if (!reservation) {
          console.warn('[CasetillaService][createIngreso] Reservation not found by explicit ID', { reservationId });
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

          console.log('[CasetillaService][createIngreso] Updating reservation status (explicit ID)', {
            reservationId,
            statusFromId,
            statusToId
          });

          const { error: updateErr } = await supabase
            .from('reservations')
            .update({
              status_id: arrivedPendingUnloadStatusId,
              updated_by: userId,
              updated_at: new Date().toISOString()
            })
            .eq('id', reservationId)
            .eq('org_id', orgId);

          if (!updateErr) {
            reservationUpdated = true;

            // ✅ TRIGGER: Disparar evento de cambio de status
            console.log('[CasetillaService][createIngreso] Triggering status change event', {
              reservationId,
              statusFromId,
              statusToId
            });

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
              } else {
                console.error('[CasetillaService][createIngreso] Failed to fetch reservation for trigger', resErr);
              }
            } catch (triggerError) {
              console.error('[CasetillaService][createIngreso] Email trigger failed', triggerError);
            }
          } else {
            updateError = updateErr;
            console.error('[CasetillaService][createIngreso] Failed to update reservation status', updateErr);
          }
        } else {
          console.warn('[CasetillaService][createIngreso] Arrived status not found');
        }
      } else {
        // ✅ Fallback: buscar por DUA + Matrícula (comportamiento anterior)
        console.log('[CasetillaService][createIngreso] No explicit reservation_id, searching by DUA + matricula');

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

          console.log('[CasetillaService][createIngreso] Reservation found by DUA+matricula', { 
            reservationId, 
            statusFromId 
          });

          // ✅ Actualizar status
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

            console.log('[CasetillaService][createIngreso] Updating reservation status (DUA+matricula match)', {
              reservationId,
              statusFromId,
              statusToId
            });

            const { error: updateErr } = await supabase
              .from('reservations')
              .update({
                status_id: arrivedPendingUnloadStatusId,
                updated_by: userId,
                updated_at: new Date().toISOString()
              })
              .eq('id', reservationId)
              .eq('org_id', orgId);

            if (!updateErr) {
              reservationUpdated = true;

              // ✅ TRIGGER: Disparar evento de cambio de status
              console.log('[CasetillaService][createIngreso] Triggering status change event', {
                reservationId,
                statusFromId,
                statusToId
              });

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
                } else {
                  console.error('[CasetillaService][createIngreso] Failed to fetch reservation for trigger', resErr);
                }
              } catch (triggerError) {
                console.error('[CasetillaService][createIngreso] Email trigger failed', triggerError);
              }
            } else {
              updateError = updateErr;
              console.error('[CasetillaService][createIngreso] Failed to update reservation status', updateErr);
            }
          } else {
            console.warn('[CasetillaService][createIngreso] Arrived status not found');
          }
        } else {
          console.warn('[CasetillaService][createIngreso] No matching reservation found', { 
            dua: data.dua, 
            matricula: data.matricula 
          });
        }
      }

      // ✅ 3) Si se encontró reserva pero falló el update, lanzar error claro
      if (reservationId && !reservationUpdated && updateError) {
        throw new Error('Se encontró la reserva pero no se pudo actualizar su estado. Verificá permisos o contactá a un administrador.');
      }

      // 4) Crear registro casetilla
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
          created_by: userId
        })
        .select()
        .single();

      if (ingresoError) throw ingresoError;

      console.log('[CasetillaService][createIngreso] SUCCESS', {
        ingresoId: ingreso.id,
        reservationFound: !!reservationId,
        reservationUpdated,
        statusChanged: statusFromId !== statusToId
      });

      return {
        ingreso,
        reservationFound: !!reservationId,
        reservationUpdated,
        reservationId,
        statusFromId,
        statusToId
      };
    } catch (error) {
      console.error('[CasetillaService][createIngreso] ERROR', error);
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
      console.error('Error fetching casetilla ingresos:', error);
      throw error;
    }
  }

  async getPendingReservations(orgId: string) {
    try {
      // ✅ Usar RPC que filtra PENDING + NOT EXISTS casetilla_ingresos en una sola query SQL
      const { data: reservations, error: rpcError } = await supabase
        .rpc('get_pending_reservations_v2', { p_org_id: orgId });

      if (rpcError) throw rpcError;
      if (!reservations || reservations.length === 0) return [];

      const rows = reservations as PendingReservationRow[];

      // 3) Docks (para derivar warehouse)
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

      // 4) Warehouses
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

      // 5) Providers
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

      // 6) Map final para UI
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
      console.error('Error fetching pending reservations:', error);
      throw error;
    }
  }

  async searchPendingReservations(orgId: string, searchTerm: string) {
    try {
      const allReservations = await this.getPendingReservations(orgId);

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
      console.error('Error searching pending reservations:', error);
      throw error;
    }
  }

// ✅ REEMPLAZA getExitEligibleReservations(orgId)
// Regla: listar reservas que tengan ingreso en casetilla_ingresos,
// excluir: canceladas, con salida ya registrada, y status DISPATCHED.
async getExitEligibleReservations(orgId: string) {
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

    const rows = reservations as any[];

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

    const warehousesMap = new Map<string, string>();
    if (warehouseIds.length > 0) {
      const { data: whData, error: whErr } = await supabase
        .from("warehouses")
        .select("id,name")
        .in("id", warehouseIds);

      if (whErr) throw whErr;

      (whData ?? []).forEach((w: any) => warehousesMap.set(w.id, w.name));
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

      return {
        id: r.id,
        dua: r.dua ?? null,
        matricula: r.truck_plate ?? "",
        chofer: r.driver ?? "",
        proveedor: providerName,
        almacen: whName ?? "N/A",
        provider_name: providerName,
        warehouse_name: whName ?? "N/A",
        warehouse_id: dock?.warehouse_id ?? null,
        provider_id: shipper ?? null,
        orden_compra: r.purchase_order ?? "",
        numero_pedido: r.order_request_number ?? "",
        fecha_ingreso: ingresosMap.get(r.id) ?? null,
        created_at: r.created_at,
      };
    });
  } catch (error) {
    console.error("Error fetching exit eligible reservations:", error);
    throw error;
  }
}


  // ✅ NUEVA FUNCIÓN: Crear salida
  async createSalida(orgId: string, userId: string, reservationId: string) {
    try {
      console.log('[CasetillaService][createSalida] START', { orgId, userId, reservationId });

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

      console.log('[CasetillaService][createSalida] Reservation found', {
        reservationId,
        statusFromId
      });

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
      console.log('[CasetillaService][createSalida] Updating reservation to DISPATCHED', {
        reservationId,
        statusFromId,
        statusToId
      });

      const { error: updateStatusError } = await supabase
        .from('reservations')
        .update({
          status_id: statusToId,
          updated_by: userId,
          updated_at: new Date().toISOString()
        })
        .eq('id', reservationId)
        .eq('org_id', orgId);

      if (updateStatusError) {
        console.error('[CasetillaService][createSalida] Failed to update status', updateStatusError);
        throw new Error('No se pudo actualizar el estado de la reserva');
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
          exit_at: new Date().toISOString()
        })
        .select()
        .single();

      if (salidaError) throw salidaError;

      // ✅ 6) TRIGGER: Disparar evento de cambio de status a DISPATCHED
      console.log('[CasetillaService][createSalida] Triggering DISPATCHED event', {
        reservationId,
        statusFromId,
        statusToId
      });

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
          console.error('[CasetillaService][createSalida] Failed to fetch reservation for trigger', resErr);
        }
      } catch (triggerError) {
        console.error('[CasetillaService][createSalida] Email trigger failed', triggerError);
      }

      console.log('[CasetillaService][createSalida] SUCCESS', {
        salidaId: salida.id,
        reservationId,
        statusChanged: statusFromId !== statusToId
      });

      return {
        salida,
        reservationId,
        statusFromId,
        statusToId
      };
    } catch (error) {
      console.error('[CasetillaService][createSalida] ERROR', error);
      throw error;
    }
  }

  // ✅ NUEVA FUNCIÓN: Obtener reporte de duración
  async getDurationReport(orgId: string, filters?: DurationReportFilters) {
    try {
      // 1) Join entre casetilla_ingresos y casetilla_salidas
      const { data: ingresos, error: ingresosError } = await supabase
        .from('casetilla_ingresos')
        .select('reservation_id, chofer, matricula, dua, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });

      if (ingresosError) throw ingresosError;
      if (!ingresos || ingresos.length === 0) return [];

      const reservationIds = ingresos.map((ing: any) => ing.reservation_id).filter(Boolean);

      if (reservationIds.length === 0) return [];

      const { data: salidas, error: salidasError } = await supabase
        .from('casetilla_salidas')
        .select('reservation_id, exit_at')
        .eq('org_id', orgId)
        .in('reservation_id', reservationIds);

      if (salidasError) throw salidasError;
      if (!salidas || salidas.length === 0) return [];

      // 2) Crear map de salidas
      const salidasMap = new Map<string, string>();
      salidas.forEach((sal: any) => {
        salidasMap.set(sal.reservation_id, sal.exit_at);
      });

      // 3) Combinar ingresos con salidas y calcular duración
      let reportRows = ingresos
        .filter((ing: any) => ing.reservation_id && salidasMap.has(ing.reservation_id))
        .map((ing: any) => {
          const ingresoAt = new Date(ing.created_at);
          const salidaAt = new Date(salidasMap.get(ing.reservation_id)!);
          const duracionMinutos = Math.round((salidaAt.getTime() - ingresoAt.getTime()) / 60000);

          const horas = Math.floor(duracionMinutos / 60);
          const minutos = duracionMinutos % 60;
          const duracionFormato = `${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}`;

          return {
            reservation_id: ing.reservation_id,
            chofer: ing.chofer ?? '',
            matricula: ing.matricula ?? '',
            dua: ing.dua ?? '',
            ingreso_at: ing.created_at,
            salida_at: salidasMap.get(ing.reservation_id)!,
            duracion_minutos: duracionMinutos,
            duracion_formato: duracionFormato
          };
        });

      // 4) Aplicar filtros
      if (filters) {
        // Filtro de búsqueda
        if (filters.searchTerm && filters.searchTerm.trim()) {
          const term = filters.searchTerm.toLowerCase();
          reportRows = reportRows.filter(
            (row: any) =>
              (row.chofer ?? '').toLowerCase().includes(term) ||
              (row.matricula ?? '').toLowerCase().includes(term) ||
              (row.dua ?? '').toLowerCase().includes(term)
          );
        }

        // Filtro de fecha desde
        if (filters.fechaDesde) {
          const fechaDesde = new Date(filters.fechaDesde);
          reportRows = reportRows.filter((row: any) => new Date(row.ingreso_at) >= fechaDesde);
        }

        // Filtro de fecha hasta
        if (filters.fechaHasta) {
          const fechaHasta = new Date(filters.fechaHasta);
          fechaHasta.setHours(23, 59, 59, 999); // Incluir todo el día
          reportRows = reportRows.filter((row: any) => new Date(row.ingreso_at) <= fechaHasta);
        }
      }

      // 5) Ordenar por duración descendente (mayor a menor)
      reportRows.sort((a: any, b: any) => b.duracion_minutos - a.duracion_minutos);

      return reportRows;
    } catch (error) {
      console.error('Error fetching duration report:', error);
      throw error;
    }
  }
}

export const casetillaService = new CasetillaService();