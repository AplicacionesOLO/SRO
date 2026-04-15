import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "v911-fix-provider-name";

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
      return new Intl.DateTimeFormat("es-ES", {
        year: "numeric", month: "long", day: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(new Date(value));
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
      timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false,
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

async function resolveRecipients(
  rule: any,
  orgId: string,
  supabase: any
): Promise<{ toEmails: string[]; ccEmails: string[]; bccEmails: string[] }> {
  let toEmails: string[] = [];
  let ccEmails: string[] = [];
  let bccEmails: string[] = [];

  const asEmailArr = (v: any): string[] =>
    Array.isArray(v) ? v.filter((x: any) => typeof x === "string" && x.includes("@")) : [];

  if (rule.recipients_mode === "manual") {
    const newEmails = asEmailArr(rule.recipients_emails);
    const legacyEmails = asEmailArr(rule.recipient_external_emails);
    toEmails = [...new Set([...newEmails, ...legacyEmails])];

    const roleIds: string[] = Array.isArray(rule.recipient_roles)
      ? rule.recipient_roles.filter((x: any) => typeof x === "string" && x.includes("-"))
      : [];

    if (roleIds.length > 0) {
      const { data: rolesData } = await supabase
        .from("roles")
        .select("id")
        .in("id", roleIds);

      if ((rolesData ?? []).length > 0) {
        const resolvedRoleIds = rolesData!.map((r: any) => r.id);
        const { data: uor } = await supabase
          .from("user_org_roles")
          .select("user_id, profiles(email)")
          .eq("org_id", orgId)
          .in("role_id", resolvedRoleIds);

        const roleEmails = (uor ?? [])
          .map((u: any) => u.profiles?.email)
          .filter((e: any): e is string => typeof e === "string" && e.includes("@"));

        toEmails = [...new Set([...toEmails, ...roleEmails])];
      }
    }

    const userIds: string[] = Array.isArray(rule.recipient_users)
      ? rule.recipient_users.filter((x: any) => typeof x === "string" && x.includes("-"))
      : [];

    if (userIds.length > 0) {
      const { data: ps } = await supabase
        .from("profiles")
        .select("email")
        .in("id", userIds);
      const userEmails = (ps ?? [])
        .map((x: any) => x.email)
        .filter((e: any): e is string => typeof e === "string" && e.includes("@"));
      toEmails = [...new Set([...toEmails, ...userEmails])];
    }

    ccEmails = asEmailArr(rule.cc_emails);
    bccEmails = asEmailArr(rule.bcc_emails);

  } else if (rule.recipients_mode === "users") {
    const newUserIds: string[] = Array.isArray(rule.recipients_user_ids)
      ? rule.recipients_user_ids.filter((x: any) => typeof x === "string" && x.includes("-"))
      : [];
    const legacyUserIds: string[] = Array.isArray(rule.recipient_users)
      ? rule.recipient_users.filter((x: any) => typeof x === "string" && x.includes("-"))
      : [];
    const allUserIds = [...new Set([...newUserIds, ...legacyUserIds])];

    if (allUserIds.length > 0) {
      const { data: ps } = await supabase.from("profiles").select("email").in("id", allUserIds);
      toEmails = (ps ?? []).map((x: any) => x.email).filter(Boolean);
    }

  } else if (rule.recipients_mode === "roles") {
    const newRoleNames: string[] = Array.isArray(rule.recipients_roles)
      ? rule.recipients_roles.filter((x: any) => typeof x === "string" && x.length > 0)
      : [];
    const legacyRoleIds: string[] = Array.isArray(rule.recipient_roles)
      ? rule.recipient_roles.filter((x: any) => typeof x === "string" && x.includes("-"))
      : [];

    let resolvedRoleIds: string[] = [...legacyRoleIds];

    if (newRoleNames.length > 0) {
      const { data: rolesData } = await supabase
        .from("roles")
        .select("id,name")
        .in("name", newRoleNames);
      resolvedRoleIds = [...new Set([...resolvedRoleIds, ...((rolesData ?? []).map((r: any) => r.id))])];
    }

    if (resolvedRoleIds.length > 0) {
      const { data: uor } = await supabase
        .from("user_org_roles")
        .select("user_id, profiles(email)")
        .eq("org_id", orgId)
        .in("role_id", resolvedRoleIds);
      toEmails = (uor ?? []).map((u: any) => u.profiles?.email).filter(Boolean);
    }
  }

  return {
    toEmails: [...new Set(toEmails.filter(Boolean))],
    ccEmails: [...new Set(ccEmails.filter(Boolean))],
    bccEmails: [...new Set(bccEmails.filter(Boolean))],
  };
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

    // ── Step 1: Fetch reservation ────────────────────────────────────────────
    const { data: reservation, error: resErr } = await supabase
      .from("reservations")
      .select("id, dock_id, dua, invoice, driver, truck_plate, shipper_provider, start_datetime, end_datetime, created_by, status_id")
      .eq("id", reservationId)
      .maybeSingle();

    if (resErr || !reservation) {
      console.error("[correspondence-process-event][RESERVATION_FETCH_ERROR]", { reqId, reservationId, error: resErr?.message });
      return json(500, { error: "Failed to fetch reservation", details: resErr?.message ?? "not found", reqId });
    }

    // ── Step 2: Resolve dock → warehouse_id ─────────────────────────────────
    let dockWarehouseId: string | null = null;
    let dockName = "";

    if (reservation.dock_id) {
      const { data: dock, error: dockErr } = await supabase
        .from("docks")
        .select("id, name, warehouse_id")
        .eq("id", reservation.dock_id)
        .maybeSingle();

      if (!dockErr && dock) {
        dockWarehouseId = dock.warehouse_id ?? null;
        dockName = dock.name ?? "";
      }

      console.log("[correspondence-process-event][DOCK_RESOLVED]", {
        reqId, reservationId, dock_id: reservation.dock_id, dockWarehouseId, dockName,
        dockErr: dockErr?.message ?? null,
      });
    } else {
      console.warn("[correspondence-process-event][DOCK_ID_NULL]", { reqId, reservationId });
    }

    // ── Step 3: Resolve current status name ─────────────────────────────────
    let currentStatusName = "";
    if (reservation.status_id) {
      const { data: statusData } = await supabase
        .from("reservation_statuses").select("name").eq("id", reservation.status_id).maybeSingle();
      currentStatusName = statusData?.name ?? "";
    }

    // ── Step 4: Fetch candidate rules ────────────────────────────────────────
    let allCandidateRules: any[] = [];

    if (dockWarehouseId) {
      const { data: warehouseRules, error: wrErr } = await supabase
        .from("correspondence_rules").select("*")
        .eq("org_id", orgId).eq("is_active", true).eq("event_type", eventType)
        .eq("warehouse_id", dockWarehouseId);

      if (!wrErr) allCandidateRules = [...(warehouseRules ?? [])];

      const { data: globalRules, error: grErr } = await supabase
        .from("correspondence_rules").select("*")
        .eq("org_id", orgId).eq("is_active", true).eq("event_type", eventType)
        .is("warehouse_id", null);

      if (!grErr) allCandidateRules = [...allCandidateRules, ...(globalRules ?? [])];
    } else {
      console.warn("[correspondence-process-event][WAREHOUSE_FALLBACK]", { reqId, reservationId });
      const { data: orgRules, error: orgRulesErr } = await supabase
        .from("correspondence_rules").select("*")
        .eq("org_id", orgId).eq("is_active", true).eq("event_type", eventType);
      if (!orgRulesErr) allCandidateRules = orgRules ?? [];
    }

    // ── Step 5: For status_changed — apply status filter in JS ───────────────
    let rules: any[] = allCandidateRules;

    if (eventType === "reservation_status_changed") {
      rules = allCandidateRules.filter((rule: any) => {
        const fromMatch = !rule.status_from_id || rule.status_from_id === statusFromId;
        const toMatch = !rule.status_to_id || rule.status_to_id === statusToId;
        return fromMatch && toMatch;
      });
    }

    console.log("[correspondence-process-event][RULES_FOUND]", {
      reqId, reservationId, dockWarehouseId, eventType,
      candidatesBeforeFilter: allCandidateRules.length,
      rulesAfterFilter: rules.length,
      ruleIds: rules.map((r: any) => ({ id: r.id, name: r.name, warehouse_id: r.warehouse_id })),
    });

    if (!rules || rules.length === 0) {
      return json(200, { success: true, message: "No active rules found", queued: 0, sent: 0, failed: 0, results: [], reqId });
    }

    // ── Step 6: Resolve warehouse timezone ──────────────────────────────────
    const FALLBACK_TZ = "America/Costa_Rica";
    let warehouseTimezone = FALLBACK_TZ;

    if (dockWarehouseId) {
      try {
        const { data: wh } = await supabase.from("warehouses").select("timezone, name").eq("id", dockWarehouseId).maybeSingle();
        if (wh?.timezone) warehouseTimezone = wh.timezone;
      } catch (e: any) {
        console.warn("[correspondence-process-event][WAREHOUSE_TZ_EXCEPTION]", { reqId, error: e?.message });
      }
    }

    // ── Step 7: Resolve helper data ──────────────────────────────────────────
    const reservationDua: string = ((reservation as any)?.dua ?? "").trim();

    // Resolve creator name
    const createdById = (reservation as any).created_by ?? null;
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

    // ── Resolve provider name from shipper_provider UUID ────────────────────
    // shipper_provider stores the provider UUID — resolve to human-readable name
    const shipperProviderId: string = ((reservation as any)?.shipper_provider ?? "").trim();
    let providerName = "";
    if (shipperProviderId) {
      // Check if it looks like a UUID (has dashes) → resolve name from providers table
      const looksLikeUuid = /^[0-9a-f-]{36}$/i.test(shipperProviderId);
      if (looksLikeUuid) {
        const { data: providerData } = await supabase
          .from("providers")
          .select("name")
          .eq("id", shipperProviderId)
          .maybeSingle();
        providerName = providerData?.name ?? shipperProviderId;
      } else {
        // Already a plain text name (legacy data)
        providerName = shipperProviderId;
      }
    }

    console.log("[correspondence-process-event][PROVIDER_RESOLVED]", {
      reqId, reservationId, shipperProviderId, providerName,
    });

    const templateCtx: Record<string, any> = {
      reservation_id: reservation.id ?? "",
      dock: dockName,
      start_datetime: formatDateInWarehouseTimezone(startDatetime, warehouseTimezone),
      end_datetime: formatDateInWarehouseTimezone(endDatetime, warehouseTimezone),
      start_time: formatTimeInWarehouseTimezone(startDatetime, warehouseTimezone),
      end_time: formatTimeInWarehouseTimezone(endDatetime, warehouseTimezone),
      warehouse_timezone: warehouseTimezone,
      status: currentStatusName,
      driver: (reservation as any)?.driver ?? "",
      truck_plate: (reservation as any)?.truck_plate ?? "",
      dua: (reservation as any)?.dua ?? "",
      invoice: (reservation as any)?.invoice ?? "",
      provider: providerName,
      created_by: createdByName,
      actor: actorName,
      fotos: "",
    };

    const smtpFrom = Deno.env.get("SMTP_FROM") ?? "no-reply-sro@ologistics.com";
    const smtpServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    let queued = 0, sent = 0, failed = 0;
    const results: any[] = [];

    // ── Step 8: Process each rule ────────────────────────────────────────────
    for (const rule of rules as any[]) {

      if (rule.require_dua === true) {
        if (!reservationDua) {
          console.log("[correspondence-process-event][DUA_SKIP]", { reqId, ruleId: rule.id, ruleName: rule.name });
          results.push({ ruleId: rule.id, outboxId: null, status: "skipped", reason: "require_dua: reservation has no DUA" });
          continue;
        }
      }

      let ruleCtx = { ...templateCtx };
      if (rule.include_casetilla_photos === true && statusToName) {
        const fotosHtml = await resolveCasetillaPhotos(supabase, reservationId, statusToName);
        ruleCtx = { ...ruleCtx, fotos: fotosHtml };
      }

      let senderUserId: string | null = null;
      if (rule.sender_mode === "actor") senderUserId = actorUserId;
      if (rule.sender_mode === "fixed" && rule.sender_user_id) senderUserId = rule.sender_user_id;

      const { toEmails, ccEmails, bccEmails } = await resolveRecipients(rule, orgId, supabase);

      console.log("[correspondence-process-event][RECIPIENTS_RESOLVED]", {
        reqId,
        ruleId: rule.id,
        ruleName: rule.name,
        recipientsMode: rule.recipients_mode,
        toCount: toEmails.length,
        toEmails,
      });

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
        .insert({
          org_id: orgId,
          warehouse_id: dockWarehouseId ?? null,
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
          results.push({ ruleId: rule.id, outboxId: outbox.id, status: "sent", warehouseId: dockWarehouseId, toCount: toEmails.length });
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

    console.log("[correspondence-process-event][DONE]", { reqId, reservationId, dockWarehouseId, queued, sent, failed });
    return json(200, { success: true, queued, sent, failed, results, reqId });
  } catch (e: any) {
    console.error("[correspondence-process-event][FATAL]", { reqId, error: e?.message ?? String(e) });
    return json(500, { error: "Internal error", details: e?.message ?? String(e), reqId });
  }
});
