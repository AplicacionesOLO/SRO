import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const permissions = [
      { name: "view_dashboard", description: "Ver dashboard", category: "dashboard" },
      { name: "view_calendar", description: "Ver calendario", category: "calendar" },
      { name: "create_reservation", description: "Crear reservas", category: "reservations" },
      { name: "edit_reservation", description: "Editar reservas", category: "reservations" },
      { name: "delete_reservation", description: "Eliminar reservas", category: "reservations" },
      { name: "view_docks", description: "Ver andenes", category: "docks" },
      { name: "manage_docks", description: "Gestionar andenes", category: "docks" },
      { name: "view_admin", description: "Ver administracion", category: "admin" },
      { name: "manage_users", description: "Gestionar usuarios", category: "admin" },
      { name: "manage_roles", description: "Gestionar roles", category: "admin" },
      { name: "manage_permissions", description: "Gestionar permisos", category: "admin" },
      { name: "view_manpower", description: "Ver mano de obra", category: "manpower" },
      { name: "manage_manpower", description: "Gestionar mano de obra", category: "manpower" },
      { name: "view_casetilla", description: "Ver casetilla", category: "casetilla" },
      { name: "manage_casetilla", description: "Gestionar casetilla", category: "casetilla" },
    ];

    for (const perm of permissions) {
      await supabase.from("permissions").upsert(perm, { onConflict: "name" });
    }

    const roles = [
      { name: "Super Admin", description: "Acceso total al sistema" },
      { name: "Admin", description: "Administrador con permisos limitados" },
      { name: "Operador", description: "Usuario operativo" },
      { name: "Visualizador", description: "Solo lectura" },
    ];

    for (const role of roles) {
      await supabase.from("roles").upsert(role, { onConflict: "name" });
    }

    return new Response(
      JSON.stringify({ success: true, message: "Permissions and roles setup completed" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});