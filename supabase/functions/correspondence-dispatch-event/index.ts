import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "2026-02-06 DISPATCH-B + LOGGING + SMTP";

console.log(`[correspondence-dispatch-event] VERSION ${VERSION}`);

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

    console.log("[correspondence-dispatch-event][INIT]", {
      reqId,
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceRoleKey: !!serviceRoleKey,
    });

    if (!supabaseUrl || !serviceRoleKey) {
      return json(500, { error: "Missing env vars", reqId });
    }

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!jwt) {
      console.error("[correspondence-dispatch-event][AUTH_ERROR]", { reqId, error: "Missing JWT" });
      return json(401, { error: "Unauthorized", reqId });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);

    if (userErr || !userData?.user) {
      console.error("[correspondence-dispatch-event][AUTH_ERROR]", { 
        reqId, 
        error: userErr?.message || "Invalid user" 
      });
      return json(401, { error: "Unauthorized", details: userErr?.message, reqId });
    }

    console.log("[correspondence-dispatch-event][AUTH_SUCCESS]", {
      reqId,
      userId: userData.user.id,
    });

    let body: RequestBody | null = null;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      console.error("[correspondence-dispatch-event][PARSE_ERROR]", { reqId });
      return json(400, { error: "Invalid JSON", reqId });
    }

    const { orgId, eventType, payload } = body ?? ({} as any);

    console.log("[correspondence-dispatch-event][REQ]", {
      reqId,
      orgId,
      eventType,
      payloadKeys: payload ? Object.keys(payload) : [],
      payload,
    });

    if (!orgId || !eventType) {
      console.error("[correspondence-dispatch-event][VALIDATION_ERROR]", {
        reqId,
        hasOrgId: !!orgId,
        hasEventType: !!eventType,
      });
      return json(400, { error: "Missing orgId or eventType", reqId });
    }

    // Get active rules for this event type
    const { data: rules, error: rulesErr } = await supabase
      .from("correspondence_rules")
      .select("*")
      .eq("org_id", orgId)
      .eq("event_type", eventType)
      .eq("is_active", true);

    if (rulesErr) {
      console.error("[correspondence-dispatch-event][RULES_ERROR]", { 
        reqId, 
        error: rulesErr.message 
      });
      return json(500, { error: "Failed to fetch rules", details: rulesErr.message, reqId });
    }

    console.log("[correspondence-dispatch-event][RULES]", {
      reqId,
      rulesCount: rules?.length ?? 0,
      ruleIds: rules?.map((r: any) => r.id) ?? [],
      ruleNames: rules?.map((r: any) => r.name) ?? [],
    });

    if (!rules || rules.length === 0) {
      console.log("[correspondence-dispatch-event][NO_RULES]", { reqId, orgId, eventType });
      return json(200, { success: true, message: "No active rules for this event", reqId });
    }

    // Process each rule
    const results = [];
    for (const rule of rules) {
      console.log("[correspondence-dispatch-event][PROCESS_RULE]", {
        reqId,
        ruleId: rule.id,
        ruleName: rule.name,
      });

      try {
        // Call the process-event function (que ahora usa smtp-send internamente)
        const processRes = await fetch(`${supabaseUrl}/functions/v1/correspondence-process-event`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({
            ruleId: rule.id,
            orgId,
            eventType,
            payload,
          }),
        });

        const processResult = await processRes.json();
        
        console.log("[correspondence-dispatch-event][RULE_RESULT]", {
          reqId,
          ruleId: rule.id,
          ruleName: rule.name,
          status: processRes.status,
          result: processResult,
        });

        results.push({ ruleId: rule.id, ruleName: rule.name, result: processResult });
      } catch (e: any) {
        console.error("[correspondence-dispatch-event][RULE_ERROR]", {
          reqId,
          ruleId: rule.id,
          ruleName: rule.name,
          error: e?.message,
        });
        results.push({ ruleId: rule.id, ruleName: rule.name, error: e?.message });
      }
    }

    console.log("[correspondence-dispatch-event][DONE]", {
      reqId,
      processedRules: results.length,
      results,
    });

    return json(200, { success: true, results, reqId });
  } catch (e: any) {
    console.error("[correspondence-dispatch-event][FATAL]", { reqId, error: e?.message, stack: e?.stack });
    return json(500, { error: "Internal error", details: e?.message, reqId });
  }
});