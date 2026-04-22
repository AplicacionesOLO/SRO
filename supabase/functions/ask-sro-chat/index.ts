import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Citation {
  document_id: string;
  document_title: string;
  file_name: string;
  excerpt?: string;
}

function parseSuggestions(text: string): { clean: string; suggestions: string[] } {
  const match = text.match(/===SUGERENCIAS===([\s\S]*?)===FIN===/);
  if (!match) return { clean: text.trim(), suggestions: [] };
  const suggestions = match[1].split("\n").map((l) => l.replace(/^[•\-\*\d\.]\s*/, "").trim()).filter((l) => l.length > 5).slice(0, 3);
  const clean = text.replace(/===SUGERENCIAS===[\s\S]*?===FIN===/g, "").trim();
  return { clean, suggestions };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "SRObot no está configurado. Contactá al administrador.", status: "config_error" }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const { question, session_id: rawSessionId } = await req.json();
    if (!question?.trim()) return new Response("Pregunta requerida", { status: 400, headers: corsHeaders });

    const [uorResult, profileResult] = await Promise.all([
      supabase.from("user_org_roles").select("org_id, role_id").eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("name").eq("id", user.id).maybeSingle(),
    ]);

    if (!uorResult.data) return new Response("Sin acceso al sistema", { status: 403, headers: corsHeaders });

    const orgId: string = uorResult.data.org_id;
    const roleId: string = uorResult.data.role_id;
    const userName: string = profileResult.data?.name?.split(" ")[0] || "";

    const { data: permsData } = await supabase.from("role_permissions").select("permissions!role_permissions_permission_id_fkey(name)").eq("role_id", roleId);
    const permSet = new Set((permsData ?? []).map((p: any) => p.permissions?.name).filter(Boolean));

    if (!permSet.has("chat.ask")) {
      return new Response(JSON.stringify({ error: "No tenés permiso para usar el asistente.", status: "denied" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const accessLevels: string[] = [];
    if (permSet.has("chat.answers.basic")) accessLevels.push("basic");
    if (permSet.has("chat.answers.extended")) accessLevels.push("extended");
    if (permSet.has("chat.answers.internal")) accessLevels.push("internal");
    const accessLevelMap: Record<string, number> = { basic: 1, extended: 2, internal: 3 };
    const maxLevel = accessLevels.reduce((max, lvl) => Math.max(max, accessLevelMap[lvl] ?? 0), 0);

    let sessionId: string | null = null;
    if (rawSessionId) {
      const { data: sessionCheck } = await supabase.from("chat_sessions").select("id, user_id, org_id, status").eq("id", rawSessionId).eq("user_id", user.id).eq("org_id", orgId).maybeSingle();
      if (sessionCheck && sessionCheck.status !== "closed") sessionId = sessionCheck.id;
    }

    const { data: allDocs } = await supabase.from("knowledge_documents").select("id, title, file_name, access_level, visibility_mode, openai_file_id, knowledge_document_roles(role_id), knowledge_document_permissions(permission_key)").eq("org_id", orgId).eq("status", "active").eq("is_active", true);

    const allowedDocs: Array<{ id: string; title: string; file_name: string; openai_file_id: string }> = [];
    const deniedDocIds: string[] = [];

    for (const doc of (allDocs ?? [])) {
      const docLevel = accessLevelMap[doc.access_level] ?? 1;
      if (docLevel > maxLevel) { deniedDocIds.push(doc.id); continue; }
      if (doc.visibility_mode === "public") { if (doc.openai_file_id) allowedDocs.push({ id: doc.id, title: doc.title, file_name: doc.file_name, openai_file_id: doc.openai_file_id }); continue; }
      const docRoleIds = (doc.knowledge_document_roles ?? []).map((r: any) => r.role_id);
      const hasRole = docRoleIds.includes(roleId);
      const docPermKeys = (doc.knowledge_document_permissions ?? []).map((p: any) => p.permission_key);
      const hasPerm = docPermKeys.some((key: string) => permSet.has(key));
      if ((doc.visibility_mode === "role_based" && hasRole) || (doc.visibility_mode === "permission_based" && hasPerm) || (doc.visibility_mode === "mixed" && (hasRole || hasPerm))) {
        if (doc.openai_file_id) allowedDocs.push({ id: doc.id, title: doc.title, file_name: doc.file_name, openai_file_id: doc.openai_file_id });
      } else { deniedDocIds.push(doc.id); }
    }

    if (!sessionId) {
      const { data: newSession } = await supabase.from("chat_sessions").insert({ org_id: orgId, user_id: user.id, status: "active" }).select().single();
      sessionId = newSession?.id ?? null;
    }

    const { data: vsDoc } = await supabase.from("knowledge_documents").select("openai_vector_store_id").eq("org_id", orgId).not("openai_vector_store_id", "is", null).limit(1).maybeSingle();
    const vectorStoreId = vsDoc?.openai_vector_store_id ?? null;

    const { data: promptConfig } = await supabase.from("chat_prompt_configs").select("system_prompt").eq("org_id", orgId).eq("is_active", true).maybeSingle();
    const userGreeting = userName ? `, ${userName}` : "";

    const defaultPrompt = `Sos SRObot, el asistente documental oficial del Sistema de Reservas SRO. Tenés un tono profesional, cálido y directo.\n\n${userName ? `El nombre del usuario es: ${userName}.` : ""}\n\nUsá el voseo de manera natural. Respondé de forma clara y estructurada. Nunca inventes información que no esté en los documentos.\n\nFORMATO OBLIGATORIO AL FINAL DE CADA RESPUESTA:\n===SUGERENCIAS===\n• [pregunta de seguimiento]\n• [otra pregunta útil]\n===FIN===`;
    const basePrompt = promptConfig?.system_prompt || defaultPrompt;
    const allowedDocList = allowedDocs.map((d) => `- [${d.id}] ${d.title}`).join("\n");
    const systemPrompt = allowedDocs.length > 0 ? `${basePrompt}\n\nDOCUMENTOS AUTORIZADOS:\n${allowedDocList}` : basePrompt;

    let previousMessages: Array<{ role: string; content: string }> = [];
    if (sessionId) {
      const { data: prevMsgs } = await supabase.from("chat_messages").select("role, content").eq("session_id", sessionId).eq("user_id", user.id).order("created_at", { ascending: true }).limit(20);
      previousMessages = (prevMsgs ?? []).map((m: any) => ({ role: m.role, content: m.content }));
    }

    let answer = `No encontré información disponible para responder esa pregunta.`;
    const citations: Citation[] = [];
    let usedDocumentIds: string[] = [];
    let suggestedQuestions: string[] = [];
    let inputTokens = 0, outputTokens = 0;
    const openaiModel = "gpt-4o-mini";

    if (allowedDocs.length > 0 && vectorStoreId) {
      const inputMessages = [...previousMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })), { role: "user" as const, content: question }];
      const openaiRes = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: openaiModel, instructions: systemPrompt, input: inputMessages, tools: [{ type: "file_search", vector_store_ids: [vectorStoreId], max_num_results: 5 }], temperature: 0.3, max_output_tokens: 1800 }),
      });

      if (openaiRes.ok) {
        const openaiData = await openaiRes.json();
        for (const item of (openaiData.output ?? [])) {
          if (item.type === "message") {
            for (const c of (item.content ?? [])) {
              if (c.type === "output_text" && c.text) {
                const parsed = parseSuggestions(c.text);
                answer = parsed.clean; suggestedQuestions = parsed.suggestions;
                for (const ann of (c.annotations ?? [])) {
                  if (ann.type === "file_citation" && ann.file_id) {
                    const matchedDoc = allowedDocs.find((d) => d.openai_file_id === ann.file_id);
                    if (matchedDoc && !usedDocumentIds.includes(matchedDoc.id)) { usedDocumentIds.push(matchedDoc.id); citations.push({ document_id: matchedDoc.id, document_title: matchedDoc.title, file_name: matchedDoc.file_name }); }
                  }
                }
              }
            }
          }
        }
        inputTokens = openaiData.usage?.input_tokens ?? 0;
        outputTokens = openaiData.usage?.output_tokens ?? 0;
      }
    }

    if (sessionId) {
      await supabase.from("chat_messages").insert({ session_id: sessionId, org_id: orgId, user_id: user.id, role: "user", content: question, citations: [], used_document_ids: [] });
      const { data: assistantMsg } = await supabase.from("chat_messages").insert({ session_id: sessionId, org_id: orgId, user_id: user.id, role: "assistant", content: answer, citations, used_document_ids: usedDocumentIds, model: openaiModel, input_tokens: inputTokens, output_tokens: outputTokens }).select().single();
      await supabase.from("chat_sessions").update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", sessionId);
      return new Response(JSON.stringify({ answer, session_id: sessionId, message_id: assistantMsg?.id, citations, used_document_ids: usedDocumentIds, suggested_questions: suggestedQuestions, status: "success" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ answer, session_id: sessionId, citations, used_document_ids: usedDocumentIds, suggested_questions: suggestedQuestions, status: "success" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[ask-sro-chat] unhandled error:", err);
    return new Response(String(err), { status: 500, headers: corsHeaders });
  }
});