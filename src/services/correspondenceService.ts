// ---------------------------------------------------------------
//  Correspondence service – Complete implementation (SAFE UUID PATCH)
//  - No pierde nada de lo que ya tenías
//  - Evita el 22P02 (uuid) normalizando ruleData antes de insert/update
// ---------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import type {
  CorrespondenceLog,
  CorrespondenceRule,
  CorrespondenceRuleFormData,
} from "@/types/correspondence";

/* ===============================================================
   Helpers: normalización de UUID / arrays / emails
   (evita mandar objetos donde DB espera uuid/uuid[])
================================================================ */

const asUuid = (v: any): string | null => {
  if (!v) return null;

  if (typeof v === "string") {
    const s = v.trim();
    return s ? s : null;
  }

  if (typeof v === "object") {
    // { id: "uuid" }
    if (typeof (v as any).id === "string") {
      const s = (v as any).id.trim();
      return s ? s : null;
    }

    // { user: { id: "uuid" } }
    if ((v as any).user && typeof (v as any).user.id === "string") {
      const s = (v as any).user.id.trim();
      return s ? s : null;
    }

    // { role: { id: "uuid" } }
    if ((v as any).role && typeof (v as any).role.id === "string") {
      const s = (v as any).role.id.trim();
      return s ? s : null;
    }
  }

  return null;
};

const asUuidArray = (arr: any): string[] => {
  if (!arr) return [];
  const a = Array.isArray(arr) ? arr : [arr];
  return a
    .map(asUuid)
    .filter((x): x is string => typeof x === "string" && x.length > 0);
};

const asTextArray = (arr: any): string[] => {
  if (!arr) return [];
  const a = Array.isArray(arr) ? arr : [arr];
  return a
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
};

const asEmailArray = (arr: any): string[] => {
  if (!arr) return [];
  const a = Array.isArray(arr) ? arr : [arr];

  // Soporta: ["a@b.com"], [{email:"a@b.com"}], mezcla
  const emails = a
    .map((x) => {
      if (!x) return "";
      if (typeof x === "string") return x.trim();
      if (typeof x === "object" && typeof (x as any).email === "string") return (x as any).email.trim();
      return "";
    })
    .filter(Boolean);

  // (sin validación estricta para no romper nada)
  return emails;
};

/**
 * recipients_roles en tu DDL nuevo es text[]
 * Soporta:
 * - ["Admin", "Operador"]
 * - [{role:{name:"Admin"}}]
 * - [{role:{id:"uuid"}}] (fallback)
 * - mezcla
 */
const asRecipientsRolesTextArray = (arr: any): string[] => {
  if (!arr) return [];
  const a = Array.isArray(arr) ? arr : [arr];

  return a
    .map((x) => {
      if (!x) return "";
      if (typeof x === "string") return x.trim();
      if (typeof x === "object") {
        if ((x as any).role) {
          if (typeof (x as any).role.name === "string") return (x as any).role.name.trim();
          if (typeof (x as any).role.id === "string") return (x as any).role.id.trim(); // fallback
        }
        if (typeof (x as any).name === "string") return (x as any).name.trim();
        if (typeof (x as any).id === "string") return (x as any).id.trim(); // fallback
      }
      return "";
    })
    .filter(Boolean);
};

/**
 * Construye el payload EXACTO para DB desde el form,
 * evitando mandar objetos en columnas uuid/uuid[]
 */
function normalizeRulePayloadForDb(
  orgId: string,
  ruleData: CorrespondenceRuleFormData,
  userId: string,
  mode: "create" | "update"
) {
  // Normalizaciones clave
  const statusFromId = asUuid((ruleData as any).status_from_id);
  const statusToId = asUuid((ruleData as any).status_to_id);

  const senderMode = (ruleData as any).sender_mode ?? "actor";
  const senderUserId =
    senderMode === "fixed_user" ? asUuid((ruleData as any).sender_user_id) : null;

  // Mantengo ambos sets: legacy y "nuevo"
  const recipientsMode = (ruleData as any).recipients_mode ?? "manual";

  // "Nuevo"
  const recipients_emails = asEmailArray((ruleData as any).recipients_emails);
  const recipients_user_ids = asUuidArray((ruleData as any).recipients_user_ids);
  const recipients_roles_text = asRecipientsRolesTextArray((ruleData as any).recipients_roles); // text[]

  // "Legacy"
  const recipient_users = asUuidArray((ruleData as any).recipient_users);
  const recipient_roles_uuid = asUuidArray((ruleData as any).recipient_roles); // uuid[]
  const recipient_external_emails = asEmailArray((ruleData as any).recipient_external_emails);

  // CC/BCC
  const cc_emails = asEmailArray((ruleData as any).cc_emails);
  const bcc_emails = asEmailArray((ruleData as any).bcc_emails);

  // is_active: si viene undefined, NO lo convierto a false
  const isActive =
    typeof (ruleData as any).is_active === "boolean"
      ? (ruleData as any).is_active
      : true;

  // Base payload
  const base = {
    org_id: orgId,
    name: (ruleData as any).name,
    event_type: (ruleData as any).event_type,

    status_from_id: statusFromId,
    status_to_id: statusToId,

    sender_mode: senderMode,
    sender_user_id: senderUserId,

    recipients_mode: recipientsMode,

    // nuevo
    recipients_emails,
    recipients_user_ids,
    recipients_roles: recipients_roles_text,

    // legacy
    recipient_users,
    recipient_roles: recipient_roles_uuid,
    recipient_external_emails,

    cc_emails,
    bcc_emails,

    subject: (ruleData as any).subject,
    body_template: (ruleData as any).body_template,

    is_active: isActive,
  };

  if (mode === "create") {
    return {
      ...base,
      created_by: userId,
      updated_by: userId,
    };
  }

  return {
    ...base,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
}

export const correspondenceService = {
  /**
   * Get all correspondence rules for an organization
   */
  async getRules(orgId: string): Promise<CorrespondenceRule[]> {
    try {
      console.log("[correspondenceService] getRules start", { orgId });

      // Query 1: reglas base
      const { data: rulesData, error: rulesError } = await supabase
        .from("correspondence_rules")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      if (rulesError) {
        console.error("[correspondenceService] getRules error", rulesError);
        throw rulesError;
      }

      if (!rulesData || rulesData.length === 0) {
        console.log("[correspondenceService] getRules success - no rules found", { orgId });
        return [];
      }

      // IDs para lookup
      const allUserIds = new Set<string>();
      const allRoleIds = new Set<string>();
      const statusFromIds = new Set<string>();
      const statusToIds = new Set<string>();
      const creatorIds = new Set<string>();
      const senderUserIds = new Set<string>();

      rulesData.forEach((rule: any) => {
        const userIds =
          rule.recipients_user_ids && rule.recipients_user_ids.length > 0
            ? rule.recipients_user_ids
            : rule.recipient_users || [];

        const roleIds =
          rule.recipients_roles && rule.recipients_roles.length > 0
            ? rule.recipients_roles
            : rule.recipient_roles || [];

        // Nota: recipients_roles (nuevo) es text[] (nombres/códigos),
        // pero aquí tu UI los trata como IDs a veces.
        // Para no perder nada: solo agrego a allRoleIds si “parecen IDs”
        userIds.forEach((id: string) => allUserIds.add(id));

        roleIds.forEach((id: string) => {
          if (typeof id === "string" && id.includes("-") && id.length >= 32) allRoleIds.add(id);
        });

        if (rule.status_from_id) statusFromIds.add(rule.status_from_id);
        if (rule.status_to_id) statusToIds.add(rule.status_to_id);
        if (rule.created_by) creatorIds.add(rule.created_by);
        if (rule.sender_user_id) senderUserIds.add(rule.sender_user_id);
      });

      const idsForProfiles = [...new Set([...allUserIds, ...creatorIds, ...senderUserIds])];

      const [profilesData, rolesData, statusesData] = await Promise.all([
        idsForProfiles.length > 0
          ? supabase
              .from("profiles")
              .select("id, name, email")
              .in("id", idsForProfiles)
              .then((res) => res.data || [])
          : Promise.resolve([]),
        allRoleIds.size > 0
          ? supabase
              .from("roles")
              .select("id, name")
              .in("id", [...allRoleIds])
              .then((res) => res.data || [])
          : Promise.resolve([]),
        statusFromIds.size > 0 || statusToIds.size > 0
          ? supabase
              .from("reservation_statuses")
              .select("id, name, code, color")
              .in("id", [...statusFromIds, ...statusToIds])
              .then((res) => res.data || [])
          : Promise.resolve([]),
      ]);

      const profilesMap = new Map(profilesData.map((p: any) => [p.id, p]));
      const rolesMap = new Map(rolesData.map((r: any) => [r.id, r]));
      const statusesMap = new Map(statusesData.map((s: any) => [s.id, s]));

      const rules: CorrespondenceRule[] = rulesData.map((rule: any) => {
        const userIds =
          rule.recipients_user_ids && rule.recipients_user_ids.length > 0
            ? rule.recipients_user_ids
            : rule.recipient_users || [];

        const roleIds =
          rule.recipients_roles && rule.recipients_roles.length > 0
            ? rule.recipients_roles
            : rule.recipient_roles || [];

        const externalEmails =
          rule.recipients_emails && rule.recipients_emails.length > 0
            ? rule.recipients_emails
            : rule.recipient_external_emails || [];

        const recipientUsers = (userIds || [])
          .map((userId: string) => {
            const profile = profilesMap.get(userId);
            return profile
              ? {
                  user: {
                    id: profile.id,
                    name: profile.name,
                    email: profile.email,
                  },
                }
              : null;
          })
          .filter(Boolean);

        const recipientRoles = (roleIds || [])
          .map((roleId: string) => {
            const role = rolesMap.get(roleId);
            return role
              ? {
                  role: {
                    id: role.id,
                    name: role.name,
                  },
                }
              : null;
          })
          .filter(Boolean);

        const recipientExternalEmails = (externalEmails || []).map((email: string) => ({ email }));

        return {
          ...rule,
          status_from: rule.status_from_id ? statusesMap.get(rule.status_from_id) : undefined,
          status_to: rule.status_to_id ? statusesMap.get(rule.status_to_id) : undefined,
          creator: rule.created_by ? profilesMap.get(rule.created_by) : undefined,
          sender_user: rule.sender_user_id ? profilesMap.get(rule.sender_user_id) : undefined,
          recipient_users: recipientUsers as any,
          recipient_roles: recipientRoles as any,
          recipient_external_emails: recipientExternalEmails as any,
        };
      });

      console.log("[correspondenceService] getRules success", { orgId, count: rules.length });
      return rules;
    } catch (error) {
      console.error("[correspondenceService] getRules exception", error);
      throw error;
    }
  },

  /**
   * Create a new correspondence rule
   */
  async createRule(orgId: string, ruleData: CorrespondenceRuleFormData): Promise<CorrespondenceRule> {
    try {
      console.log("[correspondenceService] createRule start", { orgId, ruleData });

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Usuario no autenticado");

      const payload = normalizeRulePayloadForDb(orgId, ruleData, userData.user.id, "create");

      const { data, error } = await supabase
        .from("correspondence_rules")
        .insert(payload as any)
        .select()
        .single();

      if (error) {
        console.error("[correspondenceService] createRule error", error, { payload });
        throw error;
      }

      console.log("[correspondenceService] createRule success", { id: data.id });
      return data as any;
    } catch (error) {
      console.error("[correspondenceService] createRule exception", error);
      throw error;
    }
  },

  /**
   * Update an existing correspondence rule
   */
  async updateRule(ruleId: string, ruleData: CorrespondenceRuleFormData): Promise<CorrespondenceRule> {
    try {
      console.log("[correspondenceService] updateRule start", { ruleId, ruleData });

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Usuario no autenticado");

      // IMPORTANTE: orgId debe venir en ruleData o lo obtenemos desde DB.
      let orgId = asUuid((ruleData as any).org_id) || null;

      if (!orgId) {
        const { data: current, error: curErr } = await supabase
          .from("correspondence_rules")
          .select("org_id")
          .eq("id", ruleId)
          .single();

        if (curErr) {
          console.error("[correspondenceService] updateRule org lookup error", curErr);
          throw curErr;
        }

        orgId = current?.org_id || null;
      }

      if (!orgId) throw new Error("No se pudo resolver orgId para actualizar la regla.");

      const payload = normalizeRulePayloadForDb(orgId, ruleData, userData.user.id, "update");

      const { data, error } = await supabase
        .from("correspondence_rules")
        .update(payload as any)
        .eq("id", ruleId)
        .select()
        .single();

      if (error) {
        console.error("[correspondenceService] updateRule error", error, { payload });
        throw error;
      }

      console.log("[correspondenceService] updateRule success", { id: data.id });
      return data as any;
    } catch (error) {
      console.error("[correspondenceService] updateRule exception", error);
      throw error;
    }
  },

  /**
   * Delete a correspondence rule
   */
  async deleteRule(ruleId: string): Promise<void> {
    try {
      console.log("[correspondenceService] deleteRule start", { ruleId });

      const { error } = await supabase.from("correspondence_rules").delete().eq("id", ruleId);

      if (error) {
        console.error("[correspondenceService] deleteRule error", error);
        throw error;
      }

      console.log("[correspondenceService] deleteRule success", { ruleId });
    } catch (error) {
      console.error("[correspondenceService] deleteRule exception", error);
      throw error;
    }
  },

  /**
   * Retrieves the correspondence logs for a given organisation.
   */
  async getLogs(orgId: string): Promise<CorrespondenceLog[]> {
    try {
      console.log("[correspondenceService] getLogs start", { orgId });

      const { data, error } = await supabase
        .from("correspondence_outbox")
        .select(
          `
          id,
          org_id,
          rule_id,
          reservation_id,
          event_type,
          actor_user_id,
          sender_user_id,
          sender_email,
          to_emails,
          cc_emails,
          bcc_emails,
          subject,
          body,
          status,
          provider_message_id,
          error,
          created_at,
          sent_at,
          actor_user:profiles!correspondence_outbox_actor_user_id_fkey(name, email),
          sender_user:profiles!correspondence_outbox_sender_user_id_fkey(name, email)
        `
        )
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      console.log("[correspondenceService] getLogs result", {
        orgId,
        hasData: !!data,
        count: data?.length ?? 0,
        error: error
          ? {
              code: (error as any).code,
              message: (error as any).message,
              details: (error as any).details,
              hint: (error as any).hint,
            }
          : null,
      });

      if (error) {
        console.error("[Correspondence] getLogsError", {
          code: (error as any).code,
          message: (error as any).message,
          details: (error as any).details,
          hint: (error as any).hint,
        });
        return [];
      }

      // Resolve rule names
      const ruleIds = [
        ...new Set(
          (data ?? [])
            .map((row: any) => row.rule_id)
            .filter((id: any): id is string => Boolean(id))
        ),
      ];

      let rulesMap: Record<string, string> = {};

      if (ruleIds.length > 0) {
        const { data: rulesData, error: rulesError } = await supabase
          .from("correspondence_rules")
          .select("id, name")
          .in("id", ruleIds);

        if (rulesError) {
          console.warn("[Correspondence] getLogs – rule lookup failed", { error: rulesError });
        } else if (rulesData) {
          rulesMap = Object.fromEntries((rulesData as any[]).map((rule) => [rule.id, rule.name]));
        }
      }

      const logs: CorrespondenceLog[] = (data ?? []).map((row: any) => ({
        id: row.id,
        org_id: row.org_id,
        rule_id: row.rule_id,
        reservation_id: row.reservation_id,
        event_type: row.event_type,
        actor_user_id: row.actor_user_id,
        sender_user_id: row.sender_user_id,
        sender_email: row.sender_email,
        to_emails: row.to_emails ?? [],
        cc_emails: row.cc_emails ?? [],
        bcc_emails: row.bcc_emails ?? [],
        subject: row.subject,
        body: row.body,
        status: row.status,
        provider_message_id: row.provider_message_id,
        error: row.error,
        created_at: row.created_at,
        sent_at: row.sent_at,
        rule: row.rule_id && rulesMap[row.rule_id] ? { name: rulesMap[row.rule_id] } : undefined,
        actor_user: row.actor_user
          ? {
              full_name: row.actor_user.name,
              email: row.actor_user.email,
            }
          : undefined,
        sender_user: row.sender_user
          ? {
              full_name: row.sender_user.name,
              email: row.sender_user.email,
            }
          : undefined,
      }));

      return logs;
    } catch (ex) {
      console.error("[Correspondence] getLogs exception", ex);
      return [];
    }
  },
};