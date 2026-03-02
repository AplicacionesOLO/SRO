// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

/**
 * ENV
 * - VITE_SUPABASE_URL: URL del proyecto
 * - VITE_SUPABASE_PUBLISHABLE_KEY: sb_publishable_* (frontend DB/Auth + apikey para Edge Functions)
 */

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

const isProd = import.meta.env.PROD;

function assertEnv(name: string, value: string) {
  if (!value) throw new Error(`❌ Missing env var: ${name}`);
}

assertEnv("VITE_SUPABASE_URL", SUPABASE_URL);
assertEnv("VITE_SUPABASE_PUBLISHABLE_KEY", SUPABASE_PUBLISHABLE_KEY);

// publishable debe ser sb_publishable_
if (!SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_")) {
  throw new Error("🚨 INVALID KEY: VITE_SUPABASE_PUBLISHABLE_KEY debe empezar con sb_publishable_");
}

// No loguear datos sensibles en prod
if (!isProd) {
  console.log("[Supabase Config] ✅", {
    url: SUPABASE_URL,
    publishableType: SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_") ? "sb_publishable" : "unknown",
  });
}

/* ===================== TYPES ===================== */
export type Database = {
  public: {
    Tables: {
      organizations: { Row: { id: string; name: string; created_at: string; updated_at: string } };
      docks: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          category_id: string | null;
          status_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
      };
      reservations: {
        Row: {
          id: string;
          org_id: string;
          dock_id: string;
          start_datetime: string;
          end_datetime: string;
          dua: string;
          invoice: string;
          driver: string;
          status_id: string | null;
          notes: string | null;
          transport_type: string | null;
          cargo_type: string | null;
          is_cancelled: boolean;
          cancel_reason: string | null;
          cancelled_by: string | null;
          cancelled_at: string | null;
          created_by: string;
          created_at: string;
          updated_by: string | null;
          updated_at: string;
        };
      };
      dock_time_blocks: {
        Row: {
          id: string;
          org_id: string;
          dock_id: string;
          start_datetime: string;
          end_datetime: string;
          reason: string;
          created_by: string;
          created_at: string;
        };
      };
      reservation_statuses: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          code: string;
          color: string;
          order_index: number | null;
          created_at: string;
        };
      };
      dock_categories: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          code: string;
          color: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      user_org_roles: {
        Row: {
          id: string;
          user_id: string;
          org_id: string;
          role_id: string;
          assigned_by: string | null;
          assigned_at: string;
        };
      };
      roles: { Row: { id: string; name: string; description: string | null; created_at: string } };
      permissions: {
        Row: { id: string; name: string; description: string | null; category: string | null; created_at: string };
      };
      role_permissions: { Row: { id: string; role_id: string; permission_id: string; created_at: string } };
    };
  };
};

/* ===================== CLIENT ===================== */

// Si no usas SSR, esto es suficiente. Si algún día SSR, esto evita crash.
const storage = typeof window !== "undefined" ? window.localStorage : undefined;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage,
  },
});