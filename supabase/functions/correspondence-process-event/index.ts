import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "v879-dua-condition";

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

function formatDateInWarehouseTimezone(value: any, timezone: string): string {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
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
  const escaped = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const withBreaks = escaped.replace(/\n/g, "<br/>");
  return `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #111827; line-height: 1.45; white-space: normal;">${withBreaks}</div>`.trim();
}

async function resolveCasetillaPhotos(supabase: any, reservationId: string, statusToName: string): Promise<string> {
  const lower = statusToName.toLowerCase();
  let fotos: string[] = [];
  try {
    if (lower.includes("arrib")) {
      const { data } = await supabase.from("casetilla_ingresos").select("fotos").eq("reservation_id", reservationId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      fotos = data?.fotos ?? [];
    } else if (lower.includes("despacha") || lower.includes("dispatch")) {
      const { data } = await supabase.from("casetilla_salidas").select("fotos").eq("reservation_id", reservationId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      fotos = data?.fotos ?? [];
    }
  } catch (e) {
    console.warn("[resolveCasetillaPhotos] error", e);
  }
  if (!fotos || fotos.length === 0) return '<p style="color:#6b7280;font-style:italic;font-size:13px;">Sin fotos disponibles.</p>';
  const imgs = fotos.map((url) => `<img src="${url}" alt="Foto punto de control" style="max-width:480px;width:100%;margin:6px 0;border-radius:8px;border:1px solid #e5e7eb;" loading="lazy" />`).join("\n");
  return `<div style="margin:12px 0;"><p style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;">Fotos del punto de control (${fotos.length} imagen${fotos.length !== 1 ? "es" : ""}):</p>${imgs}</div>`.trim();
}

serve(async (req) => {
  const reqId = crypto.randomUUID();
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "Method Not Allowed", reqId });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "Missing env vars", reqId });

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json(401, { error: "Unauthorized", reqId });

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) return json(401, { error: "Unauthorized", details: userErr?.message ?? "Invalid JWT", reqId });

    let body: Body | null = null;
    try { body = (await req.json()) as Body; } catch { return json(400, { error: "Invalid JSON", reqId }); }

    const { orgId, reservationId, actorUserId, eventType, statusFromId, statusToId } = body ?? ({} as any);

    console.log("[correspondence-process-event][REQUEST]", { reqId, version: VERSION, orgId: !!orgId, reservationId, eventType });

    if (!orgId || !reservationId || !actorUserId || !eventType) {
      return json(400, { error: "Missing required fields", reqId });
    }
    if (actorUserId !== userData.user.id) return json(403, { error: "Forbidden", reqId });

    // ── Fetch rules ──────────────────────────────────────────────────────────
    let rulesQuery = supabase.from("correspondence_rules").select("*").eq("org_id", orgId).eq("is_active", true).eq("event_type", eventType);

    if (eventType === "reservation_status_changed") {
      rulesQuery = rulesQuery.or([
        "and(status_from_id.is.null,status_to_id.is.null)",
        `and(status_from_id.eq.${asNull(statusFromId)},status_to_id.is.null)`,
        `and(status_from_id.is.null,status_to_id.eq.${asNull(statusToId)})`,
        `and(status_from_id.eq.${asNull(statusFromId)},status_to_id.eq.${asNull(statusToId)})`,
      ].join(","));
    }

    const { data: rules, error: rulesErr } = await rulesQuery;
    if (rulesErr) return json(500, { error: "Failed to fetch rules", details: rulesErr.message, reqId });
    if (!rules || rules.length === 0) return json(200, { success: true, message: "No active rules found", queued: 0, sent: 0, failed: 0, results: [], reqId });

    // ── Fetch reservation ────────────────────────────────────────────────────
    const { data: reservation, error: resErr } = await supabase
      .from("reservations")
      .select("*, docks(id, name, warehouse_id), reservation_statuses(name)")
      .eq("id", reservationId)
      .maybeSingle();

    console.log("[correspondence-process-event][RESERVATION_FETCH]", {
      reqId, reservationId, found: !!reservation,
      dua: (reservation as any)?.dua ?? null,
      dockWarehouseId: (reservation as any)?.docks?.warehouse_id ?? null,
      resErr: resErr?.message ?? null,
    });

    if (resErr || !reservation) return json(500, { error: "Failed to fetch reservation", details: resErr?.message ?? "not found", reqId });

    // ── Resolve warehouse timezone ───────────────────────────────────────────
    const FALLBACK_TZ = "America/Costa_Rica";
    let warehouseTimezone = FALLBACK_TZ;
    const dockWarehouseId = (reservation as any)?.docks?.warehouse_id ?? null;

    if (dockWarehouseId) {
      try {
        const { data: wh, error: whErr } = await supabase.from("warehouses").select("timezone, name").eq("id", dockWarehouseId).maybeSingle();
        if (!whErr && wh?.timezone) {
          warehouseTimezone = wh.timezone;
          console.log("[correspondence-process-event][TIMEZONE_RESOLVED]", { reqId, timezone: warehouseTimezone });
        }
      } catch (e: any) {
        console.warn("[correspondence-process-event][WAREHOUSE_TZ_EXCEPTION]", { reqId, error: e?.message });
      }
    }

    // ── Helper data ──────────────────────────────────────────────────────────
    const reservationDua: string = ((reservation as any)?.dua ?? "").trim();

    const createdById = (reservation as any).created_by ?? (reservation as any).user_id ?? null;
    let createdByName = "";
    if (createdById) {
      const { data: creator } = await supabase.from("profiles").select("name, email").eq("id", createdById).maybeSingle();
      createdByName = creator?.name || creator?.email || "";
    }

    const { data: actorProfile } = await supabase.from("profiles").select("name, email").eq("id", actorUserId).maybeSingle();
    const actorName = actorProfile?.name || actorProfile?.email || "Usuario";

    let statusToName = "";
    if (statusToId) {
      const { data: statusData } = await supabase.from("reservation_statuses").select("name").eq("id", statusToId).maybeSingle();
      statusToName = statusData?.name ?? "";
    }

    const startDatetime = (reservation as any)?.start_datetime;
    const endDatetime = (reservation as any)?.end_datetime;

    const templateCtx: Record<string, any> = {
      reservation_id: (reservation as any)?.id ?? "",
      dock: (reservation as any)?.docks?.name ?? "",
      start_datetime: formatDateInWarehouseTimezone(startDatetime, warehouseTimezone),
      end_datetime: formatDateInWarehouseTimezone(endDatetime, warehouseTimezone),
      start_time: formatTimeInWarehouseTimezone(startDatetime, warehouseTimezone),
      end_time: formatTimeInWarehouseTimezone(endDatetime, warehouseTimezone),
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
    const smtpServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    let queued = 0, sent = 0, failed = 0;
    const results: any[] = [];

    for (const rule of rules as any[]) {
      // ── CONDICIÓN DUA ────────────────────────────────────────────────────
      // Si la regla tiene require_dua = true, solo aplica si la reserva tiene DUA no vacío
      if (rule.require_dua === true) {
        if (!reservationDua) {
          console.log("[correspondence-process-event][DUA_SKIP]", {
            reqId, ruleId: rule.id, ruleName: rule.name,
            reason: "require_dua=true but reservation has no DUA",
            reservationDua,
          });
          results.push({ ruleId: rule.id, outboxId: null, status: "skipped", reason: "require_dua: reservation has no DUA" });
          continue;
        }
        console.log("[correspondence-process-event][DUA_MATCH]", { reqId, ruleId: rule.id, dua: reservationDua });
      }

      let ruleCtx = { ...templateCtx };
      if (rule.include_casetilla_photos === true && statusToName) {
        const fotosHtml = await resolveCasetillaPhotos(supabase, reservationId, statusToName);
        ruleCtx = { ...ruleCtx, fotos: fotosHtml };
      }

      let senderUserId: string | null = null;
      if (rule.sender_mode === "actor") senderUserId = actorUserId;
      if (rule.sender_mode === "fixed" && rule.sender_user_id) senderUserId = rule.sender_user_id;

      let toEmails: string[] = [], ccEmails: string[] = [], bccEmails: string[] = [];

      if (rule.recipients_mode === "manual") {
        toEmails = Array.isArray(rule.recipients_emails) ? rule.recipients_emails.filter(Boolean) : [];
        ccEmails = Array.isArray(rule.cc_emails) ? rule.cc_emails.filter(Boolean) : [];
        bccEmails = Array.isArray(rule.bcc_emails) ? rule.bcc_emails.filter(Boolean) : [];
      } else if (rule.recipients_mode === "users" && Array.isArray(rule.recipients_user_ids) && rule.recipients_user_ids.length > 0) {
        const { data: ps } = await supabase.from("profiles").select("email").in("id", rule.recipients_user_ids);
        toEmails = (ps ?? []).map((x: any) => x.email).filter(Boolean);
      } else if (rule.recipients_mode === "roles" && Array.isArray(rule.recipients_roles) && rule.recipients_roles.length > 0) {
        const { data: rolesData } = await supabase.from("roles").select("id,name").in("name", rule.recipients_roles);
        if ((rolesData ?? []).length > 0) {
          const roleIds = rolesData!.map((r: any) => r.id);
          const { data: uor } = await supabase.from("user_org_roles").select("user_id, profiles(email)").eq("org_id", orgId).in("role_id", roleIds);
          toEmails = (uor ?? []).map((u: any) => u.profiles?.email).filter(Boolean);
        }
      }

      toEmails = [...new Set(toEmails.filter(Boolean))];
      ccEmails = [...new Set(ccEmails.filter(Boolean))];
      bccEmails = [...new Set(bccEmails.filter(Boolean))];

      if (toEmails.length === 0) {
        failed++;
        results.push({ ruleId: rule.id, outboxId: null, status: "failed", error: "No recipients resolved" });
        continue;
      }

      const subject = processTemplate(rule.subject || "", ruleCtx);
      const bodyRaw = processTemplate(rule.body_template || "", ruleCtx);
      const bodyHtml = normalizeEmailBody(bodyRaw);

      const { data: outbox, error: outboxErr } = await supabase
        .from("correspondence_outbox")
        .insert({ org_id: orgId, rule_id: rule.id, event_type: eventType, reservation_id: reservationId, actor_user_id: actorUserId, sender_user_id: senderUserId, sender_email: smtpFrom, to_emails: toEmails, cc_emails: ccEmails, bcc_emails: bccEmails, subject, body: bodyHtml, status: "queued", created_at: new Date().toISOString() })
        .select("id")
        .maybeSingle();

      if (outboxErr || !outbox) {
        failed++;
        results.push({ ruleId: rule.id, outboxId: null, status: "failed", error: outboxErr?.message ?? "outbox insert failed" });
        continue;
      }

      queued++;

      try {
        const smtpResp = await fetch(`${supabaseUrl}/functions/v1/smtp-send`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${smtpServiceKey}` },
          body: JSON.stringify({ outboxId: outbox.id, to_emails: toEmails, cc_emails: ccEmails, bcc_emails: bccEmails, subject, body: bodyHtml, sender_email: smtpFrom }),
        });

        let smtpData: any = null;
        try { smtpData = await smtpResp.json(); } catch { smtpData = null; }

        if (smtpResp.ok && smtpData?.success) {
          await supabase.from("correspondence_outbox").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", outbox.id);
          sent++;
          results.push({ ruleId: rule.id, outboxId: outbox.id, status: "sent" });
        } else {
          const smtpError = smtpData?.error ?? smtpData?.details ?? `smtp-send HTTP ${smtpResp.status}`;
          await supabase.from("correspondence_outbox").update({ status: "failed", error: smtpError }).eq("id", outbox.id);
          failed++;
          results.push({ ruleId: rule.id, outboxId: outbox.id, status: "failed", error: smtpError });
        }
      } catch (smtpInvokeErr: any) {
        const smtpError = smtpInvokeErr?.message ?? "smtp exception";
        await supabase.from("correspondence_outbox").update({ status: "failed", error: smtpError }).eq("id", outbox.id);
        failed++;
        results.push({ ruleId: rule.id, outboxId: outbox.id, status: "failed", error: smtpError });
      }
    }

    console.log("[correspondence-process-event][DONE]", { reqId, reservationId, queued, sent, failed });
    return json(200, { success: true, queued, sent, failed, results, reqId });
  } catch (e: any) {
    console.error("[correspondence-process-event][FATAL]", { reqId, error: e?.message ?? String(e) });
    return json(500, { error: "Internal error", details: e?.message ?? String(e), reqId });
  }
});
