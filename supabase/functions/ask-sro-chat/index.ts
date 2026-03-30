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

// ── Extract suggested questions from AI response ──────────────
function parseSuggestions(text: string): { clean: string; suggestions: string[] } {
  const match = text.match(/===SUGERENCIAS===([\s\S]*?)===FIN===/);
  if (!match) return { clean: text.trim(), suggestions: [] };

  const suggestions = match[1]
    .split("\n")
    .map((l) => l.replace(/^[•\-\*\d\.]\s*/, "").trim())
    .filter((l) => l.length > 5)
    .slice(0, 3);

  const clean = text.replace(/===SUGERENCIAS===[\s\S]*?===FIN===/g, "").trim();
  return { clean, suggestions };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── Early check: API key configured ─────────────────────────
    if (!OPENAI_API_KEY) {
      console.error("[ask-sro-chat] OPENAI_API_KEY no está configurado en los secrets");
      return new Response(
        JSON.stringify({ error: "SRObot no está configurado. Contactá al administrador.", status: "config_error" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Auth ────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    // ── Payload ─────────────────────────────────────────────────
    const { question, session_id: rawSessionId } = await req.json();
    if (!question?.trim()) return new Response("Pregunta requerida", { status: 400, headers: corsHeaders });

    // ── Resolve user context (server-side, never trust frontend) ─
    const [uorResult, profileResult] = await Promise.all([
      supabase
        .from("user_org_roles")
        .select("org_id, role_id")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    if (!uorResult.data) {
      console.warn(`[ask-sro-chat] user ${user.id} has no org_id`);
      return new Response("Sin acceso al sistema", { status: 403, headers: corsHeaders });
    }

    const orgId: string = uorResult.data.org_id;
    const roleId: string = uorResult.data.role_id;
    const userName: string = profileResult.data?.name?.split(" ")[0] || "";

    // ── Resolve permissions ──────────────────────────────────────
    const { data: permsData } = await supabase
      .from("role_permissions")
      .select("permissions!role_permissions_permission_id_fkey(name)")
      .eq("role_id", roleId);

    const permSet = new Set(
      (permsData ?? []).map((p: any) => p.permissions?.name).filter(Boolean)
    );

    if (!permSet.has("chat.ask")) {
      console.warn(`[ask-sro-chat] user ${user.id} denied: missing chat.ask`);
      return new Response(
        JSON.stringify({ error: "No tenés permiso para usar el asistente. Consultá con tu administrador si creés que es un error.", status: "denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Determine max access level ───────────────────────────────
    const accessLevels: string[] = [];
    if (permSet.has("chat.answers.basic")) accessLevels.push("basic");
    if (permSet.has("chat.answers.extended")) accessLevels.push("extended");
    if (permSet.has("chat.answers.internal")) accessLevels.push("internal");

    const accessLevelMap: Record<string, number> = { basic: 1, extended: 2, internal: 3 };
    const maxLevel = accessLevels.reduce((max, lvl) => Math.max(max, accessLevelMap[lvl] ?? 0), 0);

    // ── SECURITY: Validate session ownership before using it ─────
    let sessionId: string | null = null;
    if (rawSessionId) {
      const { data: sessionCheck } = await supabase
        .from("chat_sessions")
        .select("id, user_id, org_id, status")
        .eq("id", rawSessionId)
        .eq("user_id", user.id)        // ← MUST belong to this user
        .eq("org_id", orgId)           // ← MUST belong to this org
        .maybeSingle();

      if (!sessionCheck) {
        console.warn(`[ask-sro-chat] SECURITY: session_id ${rawSessionId} rejected — not owned by user ${user.id} in org ${orgId}`);
        // Silently create a new session instead of erroring, so UX is seamless
        sessionId = null;
      } else if (sessionCheck.status === "closed") {
        sessionId = null;
      } else {
        sessionId = sessionCheck.id;
      }
    }

    // ── Get all active documents for org ─────────────────────────
    const { data: allDocs } = await supabase
      .from("knowledge_documents")
      .select(`
        id, title, file_name, access_level, visibility_mode, openai_file_id,
        knowledge_document_roles(role_id),
        knowledge_document_permissions(permission_key)
      `)
      .eq("org_id", orgId)
      .eq("status", "active")
      .eq("is_active", true);

    // ── Filter allowed documents ──────────────────────────────────
    const allowedDocs: Array<{ id: string; title: string; file_name: string; openai_file_id: string }> = [];
    const deniedDocIds: string[] = [];

    for (const doc of (allDocs ?? [])) {
      const docLevel = accessLevelMap[doc.access_level] ?? 1;
      if (docLevel > maxLevel) { deniedDocIds.push(doc.id); continue; }

      if (doc.visibility_mode === "public") {
        if (doc.openai_file_id) allowedDocs.push({ id: doc.id, title: doc.title, file_name: doc.file_name, openai_file_id: doc.openai_file_id });
        continue;
      }

      const docRoleIds = (doc.knowledge_document_roles ?? []).map((r: any) => r.role_id);
      const hasRole = docRoleIds.includes(roleId);
      const docPermKeys = (doc.knowledge_document_permissions ?? []).map((p: any) => p.permission_key);
      const hasPerm = docPermKeys.some((key: string) => permSet.has(key));

      if (doc.visibility_mode === "role_based" && hasRole) {
        if (doc.openai_file_id) allowedDocs.push({ id: doc.id, title: doc.title, file_name: doc.file_name, openai_file_id: doc.openai_file_id });
      } else if (doc.visibility_mode === "permission_based" && hasPerm) {
        if (doc.openai_file_id) allowedDocs.push({ id: doc.id, title: doc.title, file_name: doc.file_name, openai_file_id: doc.openai_file_id });
      } else if (doc.visibility_mode === "mixed" && (hasRole || hasPerm)) {
        if (doc.openai_file_id) allowedDocs.push({ id: doc.id, title: doc.title, file_name: doc.file_name, openai_file_id: doc.openai_file_id });
      } else {
        deniedDocIds.push(doc.id);
      }
    }

    console.log(`[ask-sro-chat] user=${user.id} name="${userName}" org=${orgId} role=${roleId} allowed=${allowedDocs.length} denied=${deniedDocIds.length}`);

    // ── Get or create chat session ───────────────────────────────
    if (!sessionId) {
      const { data: newSession } = await supabase
        .from("chat_sessions")
        .insert({ org_id: orgId, user_id: user.id, status: "active" })
        .select()
        .single();
      sessionId = newSession?.id ?? null;
    }

    // ── Get vector store (scoped to org) ─────────────────────────
    const { data: vsDoc } = await supabase
      .from("knowledge_documents")
      .select("openai_vector_store_id")
      .eq("org_id", orgId)
      .not("openai_vector_store_id", "is", null)
      .limit(1)
      .maybeSingle();

    const vectorStoreId = vsDoc?.openai_vector_store_id ?? null;

    // ── Get custom prompt config ─────────────────────────────────
    const { data: promptConfig } = await supabase
      .from("chat_prompt_configs")
      .select("system_prompt")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .maybeSingle();

    const userGreeting = userName ? `, ${userName}` : "";

    // ── Build humanized system prompt ────────────────────────────
    const defaultPrompt = `Sos SRObot, el asistente documental oficial del Sistema de Reservas SRO. Tenés un tono profesional, cálido y directo.

${userName ? `El nombre del usuario es: ${userName}.` : ""}

Pautas de comunicación:
- ${userName ? `Cuando sea apropiado, llamá al usuario por su nombre (${userName}) para personalizar la respuesta.` : "Dirigite al usuario de forma cordial."}
- Usá el voseo (sos, tenés, podés) de manera natural y consistente.
- Si es la primera interacción o el usuario saluda, presentate brevemente: "Soy SRObot, el asistente documental del sistema."
- Respondé de forma clara y estructurada. Si la respuesta tiene varios pasos o puntos, usá listas numeradas o viñetas.
- Usá transiciones naturales: "Claro, te explico...", "Según los documentos disponibles...", "Encontré esta información...", "Buena pregunta..."
- Nunca respondas con frases secas o robóticas. Siempre demostrá que entendiste la pregunta antes de responder.
- Si la información solicitada NO está en los documentos autorizados, decilo con claridad pero con amabilidad: "No encontré información sobre eso en tus documentos disponibles. Si necesitás más detalle, te recomiendo consultar con el administrador."
- Nunca inventes información que no esté en los documentos. Si no estás seguro, decilo.
- Si el usuario parece frustrado o tiene un problema, reconocé su situación antes de dar la respuesta.

FORMATO OBLIGATORIO AL FINAL DE CADA RESPUESTA:
Luego de resolver la consulta, siempre agregá exactamente este bloque con 2 preguntas de seguimiento útiles y relevantes al contexto de la conversación (no lo omitas nunca):

===SUGERENCIAS===
• [pregunta de seguimiento corta y específica relacionada a lo que se acaba de responder]
• [otra pregunta útil que el usuario podría querer hacer a continuación]
===FIN===`;

    const basePrompt = promptConfig?.system_prompt || defaultPrompt;

    const allowedDocList = allowedDocs.map((d) => `- [${d.id}] ${d.title}`).join("\n");
    const systemPrompt = allowedDocs.length > 0
      ? `${basePrompt}\n\nDOCUMENTOS AUTORIZADOS PARA ESTE USUARIO:\n${allowedDocList}\n\nINSTRUCCIÓN CRÍTICA: Solo podés citar y referenciar documentos de la lista anterior. Si el usuario pregunta sobre información que no está en sus documentos autorizados, indicale amablemente que no tenés esa información disponible para su perfil.`
      : basePrompt;

    // ── Build previous messages ──────────────────────────────────
    let previousMessages: Array<{ role: string; content: string }> = [];
    if (sessionId) {
      const { data: prevMsgs } = await supabase
        .from("chat_messages")
        .select("role, content")
        .eq("session_id", sessionId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(20);
      previousMessages = (prevMsgs ?? []).map((m: any) => ({ role: m.role, content: m.content }));
    }

    // ── Call OpenAI ──────────────────────────────────────────────
    let answer = `No encontré información disponible para responder esa pregunta${userGreeting ? `, ${userName}` : ""}.`;
    const citations: Citation[] = [];
    let usedDocumentIds: string[] = [];
    let suggestedQuestions: string[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    const openaiModel = "gpt-4o-mini";

    if (allowedDocs.length === 0) {
      answer = `Hola${userGreeting}. Soy SRObot, el asistente documental de SRO.\n\nEn este momento no tenés documentos asignados a tu perfil de acceso, por lo que no puedo responder consultas documentales.\n\nPara empezar a usarme, un administrador necesita asignarte acceso a la base de conocimiento. Si creés que esto es un error, no dudes en consultarlo con tu equipo.`;
    } else if (!vectorStoreId) {
      answer = `Hola${userGreeting}. Soy SRObot, el asistente documental de SRO.\n\nTus documentos todavía están siendo procesados para la búsqueda inteligente. En cuanto estén listos, podrás hacerme cualquier consulta.\n\nPor favor, esperá unos minutos y volvé a intentarlo. Si el proceso demora más de lo esperado, consultá con el administrador.`;
    } else {
      // ── Use OpenAI Responses API (supports file_search with vector stores) ──
      const inputMessages = [
        ...previousMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: question },
      ];

      const responsesPayload: Record<string, unknown> = {
        model: openaiModel,
        instructions: systemPrompt,
        input: inputMessages,
        tools: [
          {
            type: "file_search",
            vector_store_ids: [vectorStoreId],
            max_num_results: 5,
          },
        ],
        temperature: 0.3,
        max_output_tokens: 1800,
      };

      console.log(`[ask-sro-chat] calling OpenAI Responses API with vectorStoreId=${vectorStoreId}`);

      const openaiRes = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(responsesPayload),
      });

      if (openaiRes.ok) {
        const openaiData = await openaiRes.json();
        console.log(`[ask-sro-chat] OpenAI response ok, output items: ${openaiData.output?.length ?? 0}`);

        const outputItems: any[] = openaiData.output ?? [];
        for (const item of outputItems) {
          if (item.type === "message") {
            const contentItems: any[] = item.content ?? [];
            for (const c of contentItems) {
              if (c.type === "output_text" && c.text) {
                const parsed = parseSuggestions(c.text);
                answer = parsed.clean;
                suggestedQuestions = parsed.suggestions;

                const annotations: any[] = c.annotations ?? [];
                for (const ann of annotations) {
                  if (ann.type === "file_citation" && ann.file_id) {
                    const matchedDoc = allowedDocs.find((d) => d.openai_file_id === ann.file_id);
                    if (matchedDoc && !usedDocumentIds.includes(matchedDoc.id)) {
                      usedDocumentIds.push(matchedDoc.id);
                      citations.push({
                        document_id: matchedDoc.id,
                        document_title: matchedDoc.title,
                        file_name: matchedDoc.file_name,
                      });
                    }
                  }
                }
                break;
              }
            }
          }
        }

        inputTokens = openaiData.usage?.input_tokens ?? 0;
        outputTokens = openaiData.usage?.output_tokens ?? 0;

      } else {
        const errText = await openaiRes.text();
        console.error(`[ask-sro-chat] OpenAI Responses API error (${openaiRes.status}):`, errText);

        console.log("[ask-sro-chat] Falling back to chat/completions...");
        const fallbackRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: openaiModel,
            messages: [
              { role: "system", content: systemPrompt + "\n\nNOTA: La búsqueda en documentos no está disponible en este momento. Respondé con la información del contexto disponible." },
              ...inputMessages,
            ],
            temperature: 0.3,
            max_tokens: 1800,
          }),
        });

        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          const rawAnswer = fallbackData.choices?.[0]?.message?.content || answer;
          const parsed = parseSuggestions(rawAnswer);
          answer = parsed.clean;
          suggestedQuestions = parsed.suggestions;
          inputTokens = fallbackData.usage?.prompt_tokens ?? 0;
          outputTokens = fallbackData.usage?.completion_tokens ?? 0;
          console.log("[ask-sro-chat] Fallback chat/completions succeeded");
        } else {
          const fallbackErr = await fallbackRes.text();
          console.error("[ask-sro-chat] Fallback also failed:", fallbackErr);
          answer = `Ocurrió un error al consultar a SRObot${userGreeting ? `, ${userName}` : ""}. Verificá que la configuración del asistente esté completa e intentá de nuevo en unos momentos.`;
        }
      }
    }

    // ── Persist messages ─────────────────────────────────────────
    if (sessionId) {
      await supabase.from("chat_messages").insert({
        session_id: sessionId,
        org_id: orgId,
        user_id: user.id,
        role: "user",
        content: question,
        citations: [],
        used_document_ids: [],
      });

      const { data: assistantMsg } = await supabase.from("chat_messages").insert({
        session_id: sessionId,
        org_id: orgId,
        user_id: user.id,
        role: "assistant",
        content: answer,
        citations,
        used_document_ids: usedDocumentIds,
        model: openaiModel,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      }).select().single();

      const sessionUpdate: Record<string, unknown> = {
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { count: msgCount } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId);
      if ((msgCount ?? 0) <= 2) {
        sessionUpdate.title = question.slice(0, 60);
      }
      await supabase.from("chat_sessions").update(sessionUpdate).eq("id", sessionId);

      await supabase.from("chat_audit_logs").insert({
        org_id: orgId,
        user_id: user.id,
        session_id: sessionId,
        question,
        answer,
        allowed_document_ids: allowedDocs.map((d) => d.id),
        used_document_ids: usedDocumentIds,
        denied_documents: deniedDocIds,
        access_snapshot: {
          role_id: roleId,
          user_name: userName,
          access_levels: accessLevels,
          permissions_count: permSet.size,
        },
        status: "success",
      });

      return new Response(
        JSON.stringify({
          answer,
          session_id: sessionId,
          message_id: assistantMsg?.id,
          citations,
          used_document_ids: usedDocumentIds,
          suggested_questions: suggestedQuestions,
          access_level_used: accessLevels[accessLevels.length - 1] || "basic",
          status: "success",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ answer, session_id: sessionId, citations, used_document_ids: usedDocumentIds, suggested_questions: suggestedQuestions, status: "success" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[ask-sro-chat] unhandled error:", err);
    return new Response(String(err), { status: 500, headers: corsHeaders });
  }
});
