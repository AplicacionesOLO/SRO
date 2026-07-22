import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FINALIZADA_ID = "ada7796a-b0a2-4b8a-950d-1f9e58a24fe7";
const DESPACHADO_ID = "03e74cb0-ed21-4474-8cc2-bfa3c4d7bee6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MigrationReport {
  grupo: string;
  total: number;
  procesados: number;
  errores: string[];
  detalles: string[];
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown> | null = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const safetyToken = (body && body.safety_token) || "";

  if (safetyToken !== "MIGRAR-FINALIZADA-2026") {
    return new Response(
      JSON.stringify({
        error: "Token de seguridad requerido. Envia safety_token: 'MIGRAR-FINALIZADA-2026'",
      }),
      {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const reportA: MigrationReport = {
    grupo: "A (Finalizada con IN + OUT)",
    total: 0,
    procesados: 0,
    errores: [],
    detalles: [],
  };

  const reportB: MigrationReport = {
    grupo: "B (Finalizada con IN, sin OUT)",
    total: 0,
    procesados: 0,
    errores: [],
    detalles: [],
  };

  try {
    // =========================================================
    // FASE 1: Obtener todas las reservas Finalizada
    // =========================================================
    const { data: allFinalizada, error: errAll } = await supabase
      .from("reservations")
      .select("id, dua, invoice, driver, truck_plate, org_id, updated_at, created_by")
      .eq("status_id", FINALIZADA_ID);

    if (errAll) throw new Error(`Error consultando Finalizada: ${errAll.message}`);

    const allIds = (allFinalizada || []).map((r: Record<string, unknown>) => r.id as string);

    if (allIds.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No hay reservas en estado Finalizada.",
          reportes: [reportA, reportB],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    reportA.detalles.push(`Total reservas Finalizada encontradas: ${allIds.length}`);

    // Consultar IN en lotes
    const inIds = new Set<string>();
    for (let i = 0; i < allIds.length; i += 1000) {
      const batch = allIds.slice(i, i + 1000);
      const { data: inBatch } = await supabase
        .from("casetilla_ingresos")
        .select("reservation_id")
        .in("reservation_id", batch);
      (inBatch || []).forEach((r: Record<string, unknown>) => {
        if (r.reservation_id) inIds.add(r.reservation_id as string);
      });
    }

    // Consultar OUT en lotes
    const outIds = new Set<string>();
    for (let i = 0; i < allIds.length; i += 1000) {
      const batch = allIds.slice(i, i + 1000);
      const { data: outBatch } = await supabase
        .from("casetilla_salidas")
        .select("reservation_id")
        .in("reservation_id", batch);
      (outBatch || []).forEach((r: Record<string, unknown>) => {
        if (r.reservation_id) outIds.add(r.reservation_id as string);
      });
    }

    // Clasificar
    const groupAIds: string[] = [];
    const groupBIds: string[] = [];
    const groupCIds: string[] = [];

    for (const id of allIds) {
      const hasIn = inIds.has(id);
      const hasOut = outIds.has(id);
      if (hasIn && hasOut) groupAIds.push(id);
      else if (hasIn && !hasOut) groupBIds.push(id);
      else groupCIds.push(id);
    }

    reportA.total = groupAIds.length;
    reportB.total = groupBIds.length;

    reportA.detalles.push(
      `Clasificacion: Grupo A=${groupAIds.length}, Grupo B=${groupBIds.length}, Grupo C=${groupCIds.length}`
    );

    const allReservationsMap = new Map<string, Record<string, unknown>>();
    (allFinalizada || []).forEach((r: Record<string, unknown>) => {
      allReservationsMap.set(r.id as string, r);
    });

    // =========================================================
    // FASE 2: Procesar Grupo A (solo cambiar status)
    // =========================================================
    reportA.detalles.push(`Iniciando Grupo A: ${groupAIds.length} reservas (solo cambio de status)...`);

    for (let i = 0; i < groupAIds.length; i += 500) {
      const batch = groupAIds.slice(i, i + 500);
      const { error: errUpdateA } = await supabase
        .from("reservations")
        .update({
          status_id: DESPACHADO_ID,
          updated_at: new Date().toISOString(),
        })
        .in("id", batch)
        .eq("status_id", FINALIZADA_ID);

      if (errUpdateA) {
        reportA.errores.push(`Error lote ${i}-${i + batch.length}: ${errUpdateA.message}`);
      } else {
        reportA.procesados += batch.length;
      }
    }

    reportA.detalles.push(`Grupo A completado: ${reportA.procesados}/${reportA.total} OK`);

    // =========================================================
    // FASE 3: Procesar Grupo B (crear OUT + cambiar status)
    // =========================================================
    reportB.detalles.push(
      `Iniciando Grupo B: ${groupBIds.length} reservas (crear OUT con fecha updated_at + cambiar status)...`
    );

    for (let i = 0; i < groupBIds.length; i++) {
      const reservationId = groupBIds[i];
      const reservation = allReservationsMap.get(reservationId);

      if (!reservation) {
        reportB.errores.push(`Reservacion ${reservationId}: no encontrada`);
        continue;
      }

      try {
        // Obtener el IN mas reciente
        const { data: ingresos, error: errIngresos } = await supabase
          .from("casetilla_ingresos")
          .select("chofer, matricula, dua, factura, org_id, created_at")
          .eq("reservation_id", reservationId)
          .order("created_at", { ascending: false })
          .limit(1);

        if (errIngresos || !ingresos || ingresos.length === 0) {
          const label = (reservation.dua as string) || reservationId.slice(0, 8);
          reportB.errores.push(`Res ${label}: sin IN - ${errIngresos?.message || "vacio"}`);
          continue;
        }

        const ingreso = ingresos[0];

        const chofer = (ingreso.chofer as string) || (reservation.driver as string) || "SIN DATOS";
        const matricula =
          (ingreso.matricula as string) || (reservation.truck_plate as string) || "SIN DATOS";
        const dua = (ingreso.dua as string) || (reservation.dua as string) || "";
        const factura = (ingreso.factura as string) || (reservation.invoice as string) || "";
        const orgId = (ingreso.org_id as string) || (reservation.org_id as string);
        const exitAt = (reservation.updated_at as string) || new Date().toISOString();

        // Crear OUT
        const { error: errInsertOut } = await supabase.from("casetilla_salidas").insert({
          org_id: orgId,
          reservation_id: reservationId,
          chofer: chofer,
          matricula: matricula,
          dua: dua,
          factura: factura,
          exit_at: exitAt,
          created_by: (reservation.created_by as string) || null,
          fotos: [],
        });

        if (errInsertOut) {
          const label = dua || reservationId.slice(0, 8);
          reportB.errores.push(`Res ${label}: error OUT - ${errInsertOut.message}`);
          continue;
        }

        // Cambiar status
        const { error: errUpdateB } = await supabase
          .from("reservations")
          .update({
            status_id: DESPACHADO_ID,
            updated_at: new Date().toISOString(),
          })
          .eq("id", reservationId)
          .eq("status_id", FINALIZADA_ID);

        if (errUpdateB) {
          const label = dua || reservationId.slice(0, 8);
          reportB.errores.push(`Res ${label}: OUT ok pero error status - ${errUpdateB.message}`);
          continue;
        }

        reportB.procesados++;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        reportB.errores.push(`Res ${reservationId.slice(0, 8)}: excepcion - ${msg}`);
      }
    }

    reportB.detalles.push(`Grupo B completado: ${reportB.procesados}/${reportB.total} OK`);
    if (reportB.errores.length > 0) {
      reportB.detalles.push(`ATENCION: ${reportB.errores.length} errores`);
    }

    // =========================================================
    // FASE 4: Verificacion final
    // =========================================================
    const { count: remainingFinalizada } = await supabase
      .from("reservations")
      .select("*", { count: "exact", head: true })
      .eq("status_id", FINALIZADA_ID);

    const { count: newDespachado } = await supabase
      .from("reservations")
      .select("*", { count: "exact", head: true })
      .eq("status_id", DESPACHADO_ID);

    return new Response(
      JSON.stringify({
        success: reportA.errores.length === 0 && reportB.errores.length === 0,
        message: "Migracion completada",
        resumen: {
          total_procesadas: reportA.procesados + reportB.procesados,
          grupo_a_ok: `${reportA.procesados}/${reportA.total}`,
          grupo_b_ok: `${reportB.procesados}/${reportB.total}`,
          grupo_c_pendientes: remainingFinalizada || 0,
          total_errores: reportA.errores.length + reportB.errores.length,
          despachado_actual: newDespachado || 0,
        },
        grupo_a: {
          total: reportA.total,
          procesados: reportA.procesados,
          errores_count: reportA.errores.length,
          ultimos_detalles: reportA.detalles.slice(-5),
          primeros_errores: reportA.errores.slice(0, 10),
        },
        grupo_b: {
          total: reportB.total,
          procesados: reportB.procesados,
          errores_count: reportB.errores.length,
          ultimos_detalles: reportB.detalles.slice(-5),
          primeros_errores: reportB.errores.slice(0, 10),
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({
        success: false,
        error: `Error critico: ${msg}`,
        grupo_a_parcial: reportA,
        grupo_b_parcial: reportB,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
