import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "v767-warehouse-timezone-fix";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asNull(value: string | null | undefined): string {
  return value === null || value === undefined ? "null" : value;
}

type Body = {
  orgId: string;
  reservationId: string;
  actorUserId: string;
  eventType: string;
  statusFromId: string | null;
  statusToId: string | null;
};

function processTemplate(template: string, ctx: Record<string, any>): string {
  if (!template) return "";
  let result = template;
  for (const [k, v] of Object.entries(ctx)) {
    const re = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g");
    result = result.replace(re, String(v ?? ""));
  }
  return result;
}

/**
 * Formatea una fecha en la zona horaria del almacén.
 * NUNCA usa la TZ del servidor (UTC en Deno/Supabase Edge).
 *
 * @param value    Timestamp ISO string desde BD (siempre en UTC)
 * @param timezone IANA timezone del almacén (e.g. "America/Caracas", "America/Costa_Rica")
 */
function formatDateInWarehouseTimezone(value: any, timezone: string): string {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);

    // Usar Intl con el timezone del almacén — esto es lo que el usuario ve en el sistema
    return new Intl.DateTimeFormat("es-ES", {
      timeZone: timezone,
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    // Fallback sin timezone si el IANA es inválido (nunca debería pasar)
    try {
      const d = new Date(value);
      return new Intl.DateTimeFormat("es-ES", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(d);
    } catch {
      return String(value);
    }
  }
}

/**
 * Formatea solo la hora HH:MM en la zona horaria del almacén.
 * Útil para mostrar "13:30" en lugar de "13:30:00 UTC".
 */
function formatTimeInWarehouseTimezone(value: any, timezone: string): string {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);

    return new Intl.DateTimeFormat("es-ES", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return String(value);
  }
}

function normalizeEmailBody(input: string): string {
  const raw = String(input ?? "");
  let s = raw.replace(/<\/br\s*>/gi, "<br/>");
  s = s.replace(/\r\n/g, "\n");
  const looksHtml = /<\/?[a-z][\s\S]*>/i.test(s) || /<br\s*\/?>/i.test(s);
  if (looksHtml) {
    s = s.replace(/\n/g, "<br/>");
    return s;
  }
  const escaped = s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const withBreaks = escaped.replace(/\n/g, "<br/>");
  return `
  <div style="font-family: Arial, sans-serif; font-size: 14px; color: #111827; line-height: 1.45; white-space: normal;">
    ${withBreaks}
  </div>
  `.trim();
}

async function resolveCasetillaPhotos(
  supabase: any,
  reservationId: string,
  statusToName: string
): Promise<string> {
  const lower = statusToName.toLowerCase();
  let fotos: string[] = [];

  try {
    if (lower.includes("arrib")) {
      const { data } = await supabase
        .from("casetilla_ingresos")
        .select("fotos")
        .eq("reservation_id", reservationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      fotos = data?.fotos ?? [];
    } else if (lower.includes("despacha") || lower.includes("dispatch")) {
      const { data } = await supabase
        .from("casetilla_salidas")
        .select("fotos")
        .eq("reservation_id", reservationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      fotos = data?.fotos ?? [];
    }
  } catch (e) {
    console.warn("[resolveCasetillaPhotos] error fetching photos", e);
  }

  if (!fotos || fotos.length === 0) {
    return '<p style="color:#6b7280;font-style:italic;font-size:13px;">Sin fotos disponibles para este registro.</p>';
  }

  const imgs = fotos
    .map(
      (url) =>
        `<img src="${url}" alt="Foto punto de control" style="max-width:480px;width:100%;margin:6px 0;border-radius:8px;border:1px solid #e5e7eb;" loading="lazy" />`
    )
    .join("\n");

  return `
<div style="margin:12px 0;">
  <p style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;">
    Fotos del punto de control (${fotos.length} imagen${fotos.length !== 1 ? "es" : ""}):
  </p>
  ${imgs}
</div>`.trim();
}

serve(async (req) => {
  const reqId = crypto.randomUUID();

  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return json(405, { error: "Method Not Allowed", reqId });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return json(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", reqId });
    }

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!jwt) {
      return json(401, { error: "Unauthorized", details: "Missing Authorization Bearer token", reqId });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);

    if (userErr || !userData?.user) {
      return json(401, { error: "Unauthorized", details: userErr?.message ?? "Invalid JWT", reqId });
    }

    let body: Body | null = null;
    try {
      body = (await req.json()) as Body;
    } catch {
      return json(400, { error: "Bad Request", details: "Invalid JSON body", reqId });
    }

    const { orgId, reservationId, actorUserId, eventType, statusFromId, statusToId } = body ?? ({} as any);

    if (!orgId || !reservationId || !actorUserId || !eventType) {
      return json(400, {
        error: "Missing required fields",
        details: {
          orgId: !!orgId,
          reservationId: !!reservationId,
          actorUserId: !!actorUserId,
          eventType: !!eventType,
        },
        reqId,
      });
    }

    if (actorUserId !== userData.user.id) {
      return json(403, { error: "Forbidden", details: "actorUserId mismatch", reqId });
    }

    let rulesQuery = supabase
      .from("correspondence_rules")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .eq("event_type", eventType);

    if (eventType === "reservation_status_changed") {
      rulesQuery = rulesQuery.or(
        [
          "and(status_from_id.is.null,status_to_id.is.null)",
          `and(status_from_id.eq.${asNull(statusFromId)},status_to_id.is.null)`,
          `and(status_from_id.is.null,status_to_id.eq.${asNull(statusToId)})`,
          `and(status_from_id.eq.${asNull(statusFromId)},status_to_id.eq.${asNull(statusToId)})`,
        ].join(",")
      );
    }

    const { data: rules, error: rulesErr } = await rulesQuery;

    if (rulesErr) {
      console.error("[correspondence-process-event][RULES_ERROR]", { reqId, message: rulesErr.message });
      return json(500, { error: "Failed to fetch rules", details: rulesErr.message, reqId });
    }

    if (!rules || rules.length === 0) {
      return json(200, {
        success: true,
        message: "No active rules found",
        queued: 0,
        sent: 0,
        failed: 0,
        results: [],
        reqId,
      });
    }

    // ─── Fetch reservation + warehouse timezone ───────────────────────────────
    // Se hace un join explícito con warehouses para obtener el timezone del almacén.
    // Esto es la corrección principal: NUNCA usar la TZ del servidor para formatear fechas.
    const { data: reservation, error: resErr } = await supabase
      .from("reservations")
      .select(
        `
        *,
        docks(name, warehouse_id, warehouses(timezone)),
        reservation_statuses(name)
      `
      )
      .eq("id", reservationId)
      .maybeSingle();

    if (resErr || !reservation) {
      console.error("[correspondence-process-event][RESERVATION_ERROR]", {
        reqId,
        message: resErr?.message ?? "Reservation not found",
      });
      return json(500, {
        error: "Failed to fetch reservation",
        details: resErr?.message ?? "Reservation not found",
        reqId,
      });
    }

    // ─── Resolver la timezone del almacén ────────────────────────────────────
    // Fuentes en orden de prioridad:
    // 1. reservation.warehouse_id → warehouses.timezone (si la reserva tiene warehouse_id directo)
    // 2. reservation.docks.warehouses.timezone (via el join del dock)
    // 3. Fallback: "America/Costa_Rica" (default de la plataforma)
    const FALLBACK_TZ = "America/Costa_Rica";

    let warehouseTimezone: string = FALLBACK_TZ;

    // Intentar obtener timezone via el dock joinado
    const dockWarehouseTimezone = (reservation as any)?.docks?.warehouses?.timezone;
    if (dockWarehouseTimezone && typeof dockWarehouseTimezone === "string") {
      warehouseTimezone = dockWarehouseTimezone;
    }

    // Si la reserva tiene warehouse_id directo, consultamos el timezone directamente
    // (más confiable que ir por el dock)
    const directWarehouseId = (reservation as any)?.warehouse_id ?? null;
    if (directWarehouseId) {
      try {
        const { data: wh } = await supabase
          .from("warehouses")
          .select("timezone")
          .eq("id", directWarehouseId)
          .maybeSingle();
        if (wh?.timezone) {
          warehouseTimezone = wh.timezone;
        }
      } catch (e) {
        console.warn("[correspondence-process-event] Failed to fetch warehouse timezone directly, using dock fallback", e);
      }
    }

    console.log("[correspondence-process-event][TIMEZONE]", {
      reqId,
      reservationId,
      warehouseTimezone,
      directWarehouseId,
      dockWarehouseTimezone,
    });

    // ─── Resolvers auxiliares ─────────────────────────────────────────────────
    const createdById =
      (reservation as any).created_by ??
      (reservation as any).created_by_user_id ??
      (reservation as any).user_id ??
      (reservation as any).created_by_id ??
      null;

    let createdByName = "";
    if (createdById) {
      const { data: creator } = await supabase
        .from("profiles")
        .select("name, email")
        .eq("id", createdById)
        .maybeSingle();
      createdByName = creator?.name || creator?.email || "";
    }

    const { data: actorProfile } = await supabase
      .from("profiles")
      .select("name, email")
      .eq("id", actorUserId)
      .maybeSingle();

    const actorName = actorProfile?.name || actorProfile?.email || "Usuario";

    let statusToName = "";
    if (statusToId) {
      const { data: statusData } = await supabase
        .from("reservation_statuses")
        .select("name")
        .eq("id", statusToId)
        .maybeSingle();
      statusToName = statusData?.name ?? "";
    }

    // ─── Construir contexto de la plantilla con fechas en TZ del almacén ─────
    // ANTES: formatDateEs() sin timezone → mostraba hora UTC del servidor
    // AHORA: formatDateInWarehouseTimezone() con el timezone del almacén → hora correcta
    const startDatetime = (reservation as any)?.start_datetime;
    const endDatetime = (reservation as any)?.end_datetime;

    const templateCtx: Record<string, any> = {
      reservation_id: (reservation as any)?.id ?? "",
      dock: (reservation as any)?.docks?.name ?? "",

      // Fecha y hora completa formateada en el timezone del almacén
      start_datetime: formatDateInWarehouseTimezone(startDatetime, warehouseTimezone),
      end_datetime: formatDateInWarehouseTimezone(endDatetime, warehouseTimezone),

      // Alias de conveniencia: solo la hora (útil en plantillas tipo "{{hora_inicio}}")
      start_time: formatTimeInWarehouseTimezone(startDatetime, warehouseTimezone),
      end_time: formatTimeInWarehouseTimezone(endDatetime, warehouseTimezone),

      // Nombre del timezone para información (e.g. "America/Caracas")
      warehouse_timezone: warehouseTimezone,

      status: (reservation as any)?.reservation_statuses?.name ?? "",
      driver: (reservation as any)?.driver ?? "",
      truck_plate: (reservation as any)?.truck_plate ?? "",
      dua: (reservation as any)?.dua ?? "",
      invoice: (reservation as any)?.invoice ?? "",
      created_by: createdByName,
      actor: actorName,
      fotos: "",
    };

    const smtpFrom = Deno.env.get("SMTP_FROM") ?? "no-reply-sro@ologistics.com";

    let queued = 0;
    let sent = 0;
    let failed = 0;
    const results: any[] = [];

    for (const rule of rules as any[]) {
      let ruleCtx = { ...templateCtx };

      if (rule.include_casetilla_photos === true && statusToName) {
        const fotosHtml = await resolveCasetillaPhotos(supabase, reservationId, statusToName);
        ruleCtx = { ...ruleCtx, fotos: fotosHtml };
      }

      let senderUserId: string | null = null;
      if (rule.sender_mode === "actor") senderUserId = actorUserId;
      if (rule.sender_mode === "fixed" && rule.sender_user_id) senderUserId = rule.sender_user_id;

      let toEmails: string[] = [];
      let ccEmails: string[] = [];
      let bccEmails: string[] = [];

      if (rule.recipients_mode === "manual") {
        toEmails = Array.isArray(rule.recipients_emails) ? rule.recipients_emails.filter(Boolean) : [];
        ccEmails = Array.isArray(rule.cc_emails) ? rule.cc_emails.filter(Boolean) : [];
        bccEmails = Array.isArray(rule.bcc_emails) ? rule.bcc_emails.filter(Boolean) : [];
      } else if (
        rule.recipients_mode === "users" &&
        Array.isArray(rule.recipients_user_ids) &&
        rule.recipients_user_ids.length > 0
      ) {
        const { data: ps, error: pe } = await supabase
          .from("profiles")
          .select("email")
          .in("id", rule.recipients_user_ids);

        if (pe) {
          console.error("[correspondence-process-event][RECIP_USERS_ERROR]", {
            reqId,
            ruleId: rule.id,
            message: pe.message,
          });
        }

        toEmails = (ps ?? []).map((x: any) => x.email).filter(Boolean);
      } else if (
        rule.recipients_mode === "roles" &&
        Array.isArray(rule.recipients_roles) &&
        rule.recipients_roles.length > 0
      ) {
        const { data: rolesData, error: rolesErr } = await supabase
          .from("roles")
          .select("id,name")
          .in("name", rule.recipients_roles);

        if (rolesErr) {
          console.error("[correspondence-process-event][ROLES_LOOKUP_ERROR]", {
            reqId,
            ruleId: rule.id,
            message: rolesErr.message,
          });
        } else if ((rolesData ?? []).length > 0) {
          const roleIds = rolesData!.map((r: any) => r.id);

          const { data: uor, error: uorErr } = await supabase
            .from("user_org_roles")
            .select("user_id, profiles(email)")
            .eq("org_id", orgId)
            .in("role_id", roleIds);

          if (uorErr) {
            console.error("[correspondence-process-event][USER_ORG_ROLES_ERROR]", {
              reqId,
              ruleId: rule.id,
              message: uorErr.message,
            });
          }

          toEmails = (uor ?? []).map((u: any) => u.profiles?.email).filter(Boolean);
        }
      }

      toEmails = [...new Set(toEmails.filter(Boolean))];
      ccEmails = [...new Set(ccEmails.filter(Boolean))];
      bccEmails = [...new Set(bccEmails.filter(Boolean))];

      if (toEmails.length === 0) {
        failed++;
        console.warn("[correspondence-process-event][NO_RECIPIENTS]", { reqId, ruleId: rule.id });
        results.push({
          ruleId: rule.id,
          outboxId: null,
          status: "failed",
          error: "No recipients resolved",
        });
        continue;
      }

      const subject = processTemplate(rule.subject || "", ruleCtx);
      const bodyRaw = processTemplate(rule.body_template || "", ruleCtx);
      const bodyHtml = normalizeEmailBody(bodyRaw);

      const { data: outbox, error: outboxErr } = await supabase
        .from("correspondence_outbox")
        .insert({
          org_id: orgId,
          rule_id: rule.id,
          event_type: eventType,
          reservation_id: reservationId,
          actor_user_id: actorUserId,
          sender_user_id: senderUserId,
          sender_email: smtpFrom,
          to_emails: toEmails,
          cc_emails: ccEmails,
          bcc_emails: bccEmails,
          subject,
          body: bodyHtml,
          status: "queued",
          created_at: new Date().toISOString(),
        })
        .select("id")
        .maybeSingle();

      if (outboxErr || !outbox) {
        failed++;
        console.error("[correspondence-process-event][OUTBOX_INSERT_ERROR]", {
          reqId,
          ruleId: rule.id,
          message: outboxErr?.message,
        });
        results.push({
          ruleId: rule.id,
          outboxId: null,
          status: "failed",
          error: outboxErr?.message ?? "outbox insert failed",
        });
        continue;
      }

      queued++;

      try {
        const smtpResp = await fetch(`${supabaseUrl}/functions/v1/smtp-send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({
            to_emails: toEmails,
            cc_emails: ccEmails,
            bcc_emails: bccEmails,
            subject,
            body: bodyHtml,
            sender_email: smtpFrom,
          }),
        });

        let smtpData: any = null;
        try {
          smtpData = await smtpResp.json();
        } catch {
          smtpData = null;
        }

        if (smtpResp.ok && smtpData?.success) {
          await supabase
            .from("correspondence_outbox")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              error: null,
            })
            .eq("id", outbox.id);

          sent++;
          results.push({
            ruleId: rule.id,
            outboxId: outbox.id,
            status: "sent",
          });
        } else {
          const smtpError =
            smtpData?.error ??
            smtpData?.details ??
            `smtp-send returned HTTP ${smtpResp.status}`;

          await supabase
            .from("correspondence_outbox")
            .update({
              status: "failed",
              error: smtpError,
            })
            .eq("id", outbox.id);

          failed++;
          results.push({
            ruleId: rule.id,
            outboxId: outbox.id,
            status: "failed",
            error: smtpError,
          });
        }
      } catch (smtpInvokeErr: any) {
        const smtpError = smtpInvokeErr?.message ?? "smtp exception";

        await supabase
          .from("correspondence_outbox")
          .update({
            status: "failed",
            error: smtpError,
          })
          .eq("id", outbox.id);

        failed++;
        results.push({
          ruleId: rule.id,
          outboxId: outbox.id,
          status: "failed",
          error: smtpError,
        });
      }
    }

    return json(200, {
      success: true,
      queued,
      sent,
      failed,
      results,
      reqId,
    });
  } catch (e: any) {
    console.error("[correspondence-process-event][FATAL]", {
      reqId,
      error: e?.message ?? String(e),
    });
    return json(500, {
      error: "Internal error",
      details: e?.message ?? String(e),
      reqId,
    });
  }
});
