
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const KNOWLEDGE_BUCKET = "knowledge-documents";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── Auth ────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    // ── Payload ─────────────────────────────────────────────────
    const { document_id } = await req.json();
    if (!document_id) return new Response("document_id requerido", { status: 400, headers: corsHeaders });

    // ── Get document ────────────────────────────────────────────
    const { data: doc, error: docError } = await supabase
      .from("knowledge_documents")
      .select("*")
      .eq("id", document_id)
      .maybeSingle();

    if (docError || !doc) return new Response("Documento no encontrado", { status: 404, headers: corsHeaders });

    // ── Check permission ────────────────────────────────────────
    const { data: uor } = await supabase
      .from("user_org_roles")
      .select("role_id")
      .eq("user_id", user.id)
      .eq("org_id", doc.org_id)
      .maybeSingle();

    if (!uor) return new Response("Sin acceso a esta organización", { status: 403, headers: corsHeaders });

    const { data: perms } = await supabase
      .from("role_permissions")
      .select("permissions!role_permissions_permission_id_fkey(name)")
      .eq("role_id", uor.role_id);

    const permSet = new Set((perms ?? []).map((p: any) => p.permissions?.name).filter(Boolean));
    if (!permSet.has("chat.documents.manage")) {
      return new Response("Sin permiso para procesar documentos", { status: 403, headers: corsHeaders });
    }

    // ── Mark as processing ──────────────────────────────────────
    await supabase
      .from("knowledge_documents")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", document_id);

    // ── Download file from Storage ──────────────────────────────
    const { data: fileData, error: fileError } = await supabase.storage
      .from(KNOWLEDGE_BUCKET)
      .download(doc.file_path);

    if (fileError || !fileData) {
      await supabase.from("knowledge_documents")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", document_id);
      return new Response("Error al descargar el archivo", { status: 500, headers: corsHeaders });
    }

    // ── Upload to OpenAI Files ──────────────────────────────────
    const fileBlob = new Blob([await fileData.arrayBuffer()], { type: "application/pdf" });
    const formData = new FormData();
    formData.append("file", fileBlob, doc.file_name);
    formData.append("purpose", "assistants");

    const uploadRes = await fetch("https://api.openai.com/v1/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });

    if (!uploadRes.ok) {
      const uploadErr = await uploadRes.text();
      await supabase.from("knowledge_documents")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", document_id);
      console.error("OpenAI upload error:", uploadErr);
      return new Response("Error al subir el archivo a OpenAI", { status: 500, headers: corsHeaders });
    }

    const uploadedFile = await uploadRes.json();
    const openaiFileId: string = uploadedFile.id;

    // ── Get or create vector store for org ─────────────────────
    let vectorStoreId = doc.openai_vector_store_id;

    if (!vectorStoreId) {
      // Check if org has an existing vector store from another doc
      const { data: existingDoc } = await supabase
        .from("knowledge_documents")
        .select("openai_vector_store_id")
        .eq("org_id", doc.org_id)
        .not("openai_vector_store_id", "is", null)
        .limit(1)
        .maybeSingle();

      vectorStoreId = existingDoc?.openai_vector_store_id || null;
    }

    if (!vectorStoreId) {
      // Create new vector store for this org
      const vsRes = await fetch("https://api.openai.com/v1/vector_stores", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
          "OpenAI-Beta": "assistants=v2",
        },
        body: JSON.stringify({ name: `SRO-${doc.org_id}` }),
      });

      if (!vsRes.ok) {
        await supabase.from("knowledge_documents")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", document_id);
        return new Response("Error al crear vector store", { status: 500, headers: corsHeaders });
      }

      const vs = await vsRes.json();
      vectorStoreId = vs.id;
    }

    // ── Add file to vector store ────────────────────────────────
    const vsFileRes = await fetch(`https://api.openai.com/v1/vector_stores/${vectorStoreId}/files`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({ file_id: openaiFileId }),
    });

    if (!vsFileRes.ok) {
      await supabase.from("knowledge_documents")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", document_id);
      return new Response("Error al agregar archivo al vector store", { status: 500, headers: corsHeaders });
    }

    const vsFile = await vsFileRes.json();

    // ── Update document record ──────────────────────────────────
    await supabase.from("knowledge_documents").update({
      status: "active",
      openai_file_id: openaiFileId,
      openai_vector_store_id: vectorStoreId,
      openai_vector_store_file_id: vsFile.id,
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", document_id);

    return new Response(
      JSON.stringify({ success: true, openai_file_id: openaiFileId, vector_store_id: vectorStoreId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("process-knowledge-document error:", err);
    return new Response(String(err), { status: 500, headers: corsHeaders });
  }
});
