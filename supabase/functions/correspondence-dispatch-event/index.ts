import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "v931-restored";

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

type RequestBody = {
  orgId: string;
  eventType: string;
  payload: Record<string, any>;
};

serve(async (req) => {
  const reqId = crypto.randomUUID();

  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return json(500, { error: "Missing env vars", reqId });
    }

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!jwt) {
      return json(401, { error: "Unauthorized", reqId });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);

    if (userErr || !userData?.user) {
      return json(401, { error: "Unauthorized", details: userErr?.message, reqId });
    }

    let body: RequestBody | null = null;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return json(400, { error: "Invalid JSON", reqId });
    }

    const { orgId, eventType, payload } = body ?? ({} as any);

    if (!orgId || !eventType) {
      return json(400, { error: "Missing orgId or eventType", reqId });
    }

    const { data: rules, error: rulesErr } = await supabase
      .from("correspondence_rules")
      .select("*")
      .eq("org_id", orgId)
      .eq("event_type", eventType)
      .eq("is_active", true);

    if (rulesErr) {
      return json(500, { error: "Failed to fetch rules", details: rulesErr.message, reqId });
    }

    if (!rules || rules.length === 0) {
      return json(200, { success: true, message: "No active rules for this event", reqId });
    }

    const processPayload = {
      orgId,
      eventType,
      reservationId: payload?.reservationId ?? null,
      actorUserId: payload?.actorUserId ?? userData.user.id,
      statusFromId: payload?.statusFromId ?? null,
      statusToId: payload?.statusToId ?? null,
    };

    const results = [];
    const processRes = await fetch(`${supabaseUrl}/functions/v1/correspondence-process-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify(processPayload),
    });

    const processResult = await processRes.json();
    results.push({ result: processResult });

    return json(200, { success: true, results, reqId });
  } catch (e: any) {
    console.error("[correspondence-dispatch-event][FATAL]", { reqId, error: e?.message });
    return json(500, { error: "Internal error", details: e?.message, reqId });
  }
});