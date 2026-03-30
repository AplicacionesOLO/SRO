
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const { document_id } = await req.json();
    if (!document_id) return new Response("document_id requerido", { status: 400, headers: corsHeaders });

    const { data: doc } = await supabase
      .from("knowledge_documents")
      .select("*")
      .eq("id", document_id)
      .maybeSingle();

    if (!doc) return new Response("Documento no encontrado", { status: 404, headers: corsHeaders });

    // ── Permission check ─────────────────────────────────────────
    const { data: uor } = await supabase
      .from("user_org_roles")
      .select("role_id")
      .eq("user_id", user.id)
      .eq("org_id", doc.org_id)
      .maybeSingle();

    if (!uor) return new Response("Sin acceso", { status: 403, headers: corsHeaders });

    const { data: perms } = await supabase
      .from("role_permissions")
      .select("permissions!role_permissions_permission_id_fkey(name)")
      .eq("role_id", uor.role_id);

    const permSet = new Set((perms ?? []).map((p: any) => p.permissions?.name).filter(Boolean));
    if (!permSet.has("chat.documents.manage")) {
      return new Response("Sin permiso", { status: 403, headers: corsHeaders });
    }

    // ── Remove old file from vector store ────────────────────────
    if (doc.openai_vector_store_id && doc.openai_file_id) {
      // Remove from vector store
      await fetch(
        `https://api.openai.com/v1/vector_stores/${doc.openai_vector_store_id}/files/${doc.openai_file_id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "OpenAI-Beta": "assistants=v2",
          },
        }
      );

      // Delete file from OpenAI
      await fetch(`https://api.openai.com/v1/files/${doc.openai_file_id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      });
    }

    // ── Mark as processing ───────────────────────────────────────
    await supabase.from("knowledge_documents").update({
      status: "processing",
      openai_file_id: null,
      openai_vector_store_file_id: null,
      updated_at: new Date().toISOString(),
    }).eq("id", document_id);

    // ── Re-download and re-upload ────────────────────────────────
    const { data: fileData, error: fileError } = await supabase.storage
      .from(KNOWLEDGE_BUCKET)
      .download(doc.file_path);

    if (fileError || !fileData) {
      await supabase.from("knowledge_documents")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", document_id);
      return new Response("Error al descargar archivo", { status: 500, headers: corsHeaders });
    }

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
      await supabase.from("knowledge_documents")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", document_id);
      return new Response("Error al re-subir a OpenAI", { status: 500, headers: corsHeaders });
    }

    const uploadedFile = await uploadRes.json();
    const newFileId = uploadedFile.id;

    // ── Re-add to vector store ───────────────────────────────────
    const vectorStoreId = doc.openai_vector_store_id;
    let vsFileId = null;

    if (vectorStoreId) {
      const vsFileRes = await fetch(`https://api.openai.com/v1/vector_stores/${vectorStoreId}/files`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
          "OpenAI-Beta": "assistants=v2",
        },
        body: JSON.stringify({ file_id: newFileId }),
      });

      if (vsFileRes.ok) {
        const vsFile = await vsFileRes.json();
        vsFileId = vsFile.id;
      }
    }

    await supabase.from("knowledge_documents").update({
      status: "active",
      openai_file_id: newFileId,
      openai_vector_store_file_id: vsFileId,
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", document_id);

    return new Response(
      JSON.stringify({ success: true, openai_file_id: newFileId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("reindex-knowledge-document error:", err);
    return new Response(String(err), { status: 500, headers: corsHeaders });
  }
});
