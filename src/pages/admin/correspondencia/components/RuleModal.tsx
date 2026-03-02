import { useState, useEffect } from "react";
import type {
  CorrespondenceRule,
  CorrespondenceRuleFormData,
  CorrespondenceEventType,
  SenderMode,
  RecipientsMode,
} from "../../../../types/correspondence";
import {
  CORRESPONDENCE_EVENT_LABELS,
  TEMPLATE_VARIABLES,
  SENDER_MODE_LABELS,
  RECIPIENTS_MODE_LABELS,
} from "../../../../types/correspondence";
import { supabase } from "../../../../lib/supabase";
import { ConfirmModal } from "../../../../components/base/ConfirmModal";

interface RuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CorrespondenceRuleFormData) => Promise<void>;
  rule?: CorrespondenceRule | null;
  orgId: string;
}

type UserRow = { id: string; name: string; email: string; has_gmail: boolean };
type RoleRow = { id: string; name: string };
type StatusRow = { id: string; name: string; color: string };

export default function RuleModal({ isOpen, onClose, onSave, rule, orgId }: RuleModalProps) {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [statuses, setStatuses] = useState<StatusRow[]>([]);

  // ✅ Estado para popup de errores/validación
  const [popup, setPopup] = useState<{
    isOpen: boolean;
    type: 'success' | 'warning' | 'error' | 'info';
    title: string;
    message: string;
  }>({
    isOpen: false,
    type: 'error',
    title: '',
    message: ''
  });

  const [formData, setFormData] = useState<CorrespondenceRuleFormData>({
    name: "",
    event_type: "reservation_created",
    status_from_id: null,
    status_to_id: null,
    sender_mode: "actor",
    sender_user_id: null,
    recipients_mode: "manual",
    recipients_emails: [],
    recipients_user_ids: [],
    recipients_roles: [],
    recipient_users: [],
    recipient_roles: [],
    recipient_external_emails: [],
    cc_emails: [],
    bcc_emails: [],
    subject: "",
    body_template: "",
    is_active: true,
  });

  const [recipientEmailInput, setRecipientEmailInput] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    (async () => {
      await loadData(() => cancelled);

      if (cancelled) return;

      if (rule) {
        setFormData({
          name: rule.name,
          event_type: rule.event_type,
          status_from_id: rule.status_from_id,
          status_to_id: rule.status_to_id,
          sender_mode: rule.sender_mode || "actor",
          sender_user_id: rule.sender_user_id || null,
          recipients_mode: rule.recipients_mode || "manual",
          recipients_emails: rule.recipients_emails || [],
          recipients_user_ids: rule.recipients_user_ids || [],
          recipients_roles: rule.recipients_roles || [],
          recipient_users: rule.recipient_users || [],
          recipient_roles: rule.recipient_roles || [],
          recipient_external_emails: rule.recipient_external_emails || [],
          cc_emails: rule.cc_emails || [],
          bcc_emails: rule.bcc_emails || [],
          subject: rule.subject,
          body_template: rule.body_template,
          is_active: rule.is_active,
        });
        setRecipientEmailInput("");
      } else {
        resetForm();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, rule, orgId]);

  const loadData = async (isCancelled: () => boolean) => {
    // FIX: Validar que orgId existe antes de cargar
    if (!orgId) {
      console.warn('[RuleModal] loadData: orgId is empty, skipping load');
      setUsers([]);
      setRoles([]);
      setStatuses([]);
      return;
    }

    try {
      // ============================
      // FIX: Usuarios (2 queries separadas para evitar PGRST200)
      // ============================
      console.log('[RuleModal] Loading users for orgId:', orgId);

      // Query 1: Obtener user_ids de la organización
      const { data: userOrgData, error: userOrgErr } = await supabase
        .from("user_org_roles")
        .select("user_id")
        .eq("org_id", orgId);

      if (userOrgErr) {
        console.error("[RuleModal] load user_org_roles error:", {
          code: userOrgErr.code,
          message: userOrgErr.message,
          details: userOrgErr.details,
          hint: userOrgErr.hint,
        });
      }

      const userIds = userOrgData?.map((item: any) => item.user_id) || [];
      console.log('[RuleModal] Found user_ids:', userIds.length);

      let usersData: any[] = [];

      // Query 2: Obtener profiles de esos usuarios
      if (userIds.length > 0) {
        const { data: profilesData, error: profilesErr } = await supabase
          .from("profiles")
          .select("id, name, email")
          .in("id", userIds);

        if (profilesErr) {
          console.error("[RuleModal] load profiles error:", {
            code: profilesErr.code,
            message: profilesErr.message,
            details: profilesErr.details,
            hint: profilesErr.hint,
          });
        } else {
          usersData = profilesData || [];
        }
      }

      // ============================
      // Gmail accounts conectadas (connected/active)
      // ============================
      const { data: gmailAccounts, error: gmailErr } = await supabase
        .from("gmail_accounts")
        .select("user_id")
        .eq("org_id", orgId)
        .in("status", ["connected", "active"]);

      if (gmailErr) {
        console.error("[RuleModal] load gmail_accounts error:", {
          code: gmailErr.code,
          message: gmailErr.message,
          details: gmailErr.details,
          hint: gmailErr.hint,
        });
      }

      const gmailUserIds = new Set((gmailAccounts || []).map((g: any) => g.user_id));

      if (!isCancelled()) {
        setUsers(
          usersData.map((profile: any) => ({
            id: String(profile.id),
            name: String(profile.name ?? ""),
            email: String(profile.email ?? ""),
            has_gmail: gmailUserIds.has(profile.id),
          }))
        );
      }

      // ============================
      // Roles (globales, no filtrar por org)
      // ============================
      const { data: rolesData, error: rolesErr } = await supabase
        .from("roles")
        .select("id, name")
        .order("name");

      if (rolesErr) {
        console.error("[RuleModal] load roles error:", {
          code: rolesErr.code,
          message: rolesErr.message,
          details: rolesErr.details,
          hint: rolesErr.hint,
        });
      }

      if (!isCancelled() && rolesData) {
        setRoles(rolesData.map((r: any) => ({ id: String(r.id), name: String(r.name ?? "") })));
      }

      // ============================
      // Estados de reserva (filtrados por org)
      // ============================
      const { data: statusesData, error: statusesErr } = await supabase
        .from("reservation_statuses")
        .select("id, name, color")
        .eq("org_id", orgId)
        .order("order_index");

      if (statusesErr) {
        console.error("[RuleModal] load reservation_statuses error:", {
          code: statusesErr.code,
          message: statusesErr.message,
          details: statusesErr.details,
          hint: statusesErr.hint,
        });
      }

      if (!isCancelled() && statusesData) {
        setStatuses(
          statusesData.map((s: any) => ({
            id: String(s.id),
            name: String(s.name ?? ""),
            color: String(s.color ?? ""),
          }))
        );
      }

      console.log('[RuleModal] loadData complete:', {
        users: usersData.length,
        roles: rolesData?.length || 0,
        statuses: statusesData?.length || 0,
      });
    } catch (error) {
      console.error('[RuleModal] loadData exception:', error);
      // FIX: No romper el render, solo loggear el error
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      event_type: "reservation_created",
      status_from_id: null,
      status_to_id: null,
      sender_mode: "actor",
      sender_user_id: null,
      recipients_mode: "manual",
      recipients_emails: [],
      recipients_user_ids: [],
      recipients_roles: [],
      recipient_users: [],
      recipient_roles: [],
      recipient_external_emails: [],
      cc_emails: [],
      bcc_emails: [],
      subject: "",
      body_template: "",
      is_active: true,
    });
    setRecipientEmailInput("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.sender_mode === "fixed" && !formData.sender_user_id) {
      setPopup({
        isOpen: true,
        type: 'warning',
        title: 'Remitente requerido',
        message: 'Debes seleccionar un usuario remitente cuando el modo es "Usuario fijo"'
      });
      return;
    }

    if (formData.sender_mode === "fixed") {
      const sender = users.find((u) => u.id === formData.sender_user_id);
      if (sender && !sender.has_gmail) {
        setPopup({
          isOpen: true,
          type: 'warning',
          title: 'Gmail no conectado',
          message: 'El usuario seleccionado como remitente no tiene una cuenta Gmail conectada. Por favor, pídele que conecte su cuenta Gmail primero.'
        });
        return;
      }
    }

    if (formData.recipients_mode === "manual" && formData.recipients_emails.length === 0) {
      setPopup({
        isOpen: true,
        type: 'warning',
        title: 'Destinatarios requeridos',
        message: 'Debes agregar al menos un correo destinatario'
      });
      return;
    }

    if (formData.recipients_mode === "users" && formData.recipients_user_ids.length === 0) {
      setPopup({
        isOpen: true,
        type: 'warning',
        title: 'Usuarios requeridos',
        message: 'Debes seleccionar al menos un usuario destinatario'
      });
      return;
    }

    if (formData.recipients_mode === "roles" && formData.recipients_roles.length === 0) {
      setPopup({
        isOpen: true,
        type: 'warning',
        title: 'Roles requeridos',
        message: 'Debes seleccionar al menos un rol destinatario'
      });
      return;
    }

    setLoading(true);

    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error("Error al guardar regla:", error);
      setPopup({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: 'Error al guardar la regla'
      });
    } finally {
      setLoading(false);
    }
  };

  const addRecipientEmail = () => {
    const trimmed = recipientEmailInput.trim();

    if (!trimmed) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setPopup({
        isOpen: true,
        type: 'warning',
        title: 'Email inválido',
        message: 'Por favor ingresa un correo electrónico válido'
      });
      return;
    }

    if (!formData.recipients_emails.includes(trimmed)) {
      setFormData((prev) => ({
        ...prev,
        recipients_emails: [...prev.recipients_emails, trimmed],
      }));
    }
    setRecipientEmailInput("");
  };

  const removeRecipientEmail = (email: string) => {
    setFormData((prev) => ({
      ...prev,
      recipients_emails: prev.recipients_emails.filter((e) => e !== email),
    }));
  };

  const insertVariable = (variable: string) => {
    const textarea = document.getElementById("body_template") as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = formData.body_template;
    const before = text.substring(0, start);
    const after = text.substring(end);

    setFormData((prev) => ({
      ...prev,
      body_template: before + variable + after,
    }));

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  };

  const usersWithGmail = users.filter((u) => u.has_gmail);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      {/* ✅ Popup de errores/validación */}
      <ConfirmModal
        isOpen={popup.isOpen}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onConfirm={() => setPopup(prev => ({ ...prev, isOpen: false }))}
        confirmText="Entendido"
      />

      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {rule ? "Editar Regla" : "Nueva Regla de Correspondencia"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <i className="ri-close-line text-2xl w-6 h-6 flex items-center justify-center"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Nombre y Estado */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nombre de la Regla *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Estado</label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                    className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
                  />
                  <span className="text-sm text-gray-700">Activa</span>
                </label>
              </div>
            </div>
          </div>

          {/* Evento Disparador */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Evento Disparador *</label>
            <select
              value={formData.event_type}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  event_type: e.target.value as CorrespondenceEventType,
                  status_from_id: null,
                  status_to_id: null,
                }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              required
            >
              {Object.entries(CORRESPONDENCE_EVENT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Condiciones de Estado */}
          {formData.event_type === "reservation_status_changed" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Estado Origen (opcional)</label>
                <select
                  value={formData.status_from_id || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, status_from_id: e.target.value || null }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                >
                  <option value="">Cualquier estado</option>
                  {statuses.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Estado Destino (opcional)</label>
                <select
                  value={formData.status_to_id || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, status_to_id: e.target.value || null }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                >
                  <option value="">Cualquier estado</option>
                  {statuses.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Remitente */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-4">
            <h3 className="font-medium text-gray-900">Remitente</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">¿Quién envía el correo? *</label>
              <select
                value={formData.sender_mode}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    sender_mode: e.target.value as SenderMode,
                    sender_user_id: null,
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
              >
                {Object.entries(SENDER_MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {formData.sender_mode === "actor"
                  ? "El correo se enviará desde la cuenta Gmail del usuario que ejecute la acción (crear reserva, cambiar estado, etc.)"
                  : "El correo siempre se enviará desde la cuenta Gmail del usuario que selecciones abajo"}
              </p>
            </div>

            {formData.sender_mode === "fixed" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Usuario Remitente *</label>
                <select
                  value={formData.sender_user_id || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, sender_user_id: e.target.value || null }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  required
                >
                  <option value="">Seleccionar usuario...</option>
                  {usersWithGmail.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>

                {usersWithGmail.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠️ No hay usuarios con Gmail conectado. Los usuarios deben conectar su cuenta Gmail primero.
                  </p>
                )}

                {usersWithGmail.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">Solo se muestran usuarios que tienen Gmail conectado</p>
                )}
              </div>
            )}
          </div>

          {/* Destinatarios */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-4">
            <h3 className="font-medium text-gray-900">Destinatarios</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Modo de Destinatarios *</label>
              <select
                value={formData.recipients_mode}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    recipients_mode: e.target.value as RecipientsMode,
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
              >
                {Object.entries(RECIPIENTS_MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Correos Manuales */}
            {formData.recipients_mode === "manual" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Correos Electrónicos *</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="email"
                    value={recipientEmailInput}
                    onChange={(e) => setRecipientEmailInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addRecipientEmail();
                      }
                    }}
                    placeholder="correo@ejemplo.com"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={addRecipientEmail}
                    className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium whitespace-nowrap"
                  >
                    Agregar
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {formData.recipients_emails.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-teal-50 text-teal-700 rounded-full text-sm"
                    >
                      {email}
                      <button
                        type="button"
                        onClick={() => removeRecipientEmail(email)}
                        className="text-teal-600 hover:text-red-600"
                      >
                        <i className="ri-close-line text-sm w-4 h-4 flex items-center justify-center"></i>
                      </button>
                    </span>
                  ))}
                </div>

                {formData.recipients_emails.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">Agrega al menos un correo destinatario</p>
                )}
              </div>
            )}

            {/* Usuarios Específicos */}
            {formData.recipients_mode === "users" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Usuarios del Sistema *</label>
                <select
                  multiple
                  value={formData.recipients_user_ids}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, (option) => option.value);
                    setFormData((prev) => ({ ...prev, recipients_user_ids: selected }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent min-h-[150px]"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Mantén presionado Ctrl/Cmd para seleccionar múltiples usuarios</p>
              </div>
            )}

            {/* Roles Completos */}
            {formData.recipients_mode === "roles" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Roles *</label>
                <select
                  multiple
                  value={formData.recipients_roles}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, (option) => option.value);
                    setFormData((prev) => ({ ...prev, recipients_roles: selected }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent min-h-[150px]"
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Se enviará a todos los usuarios que tengan estos roles. Mantén presionado Ctrl/Cmd para seleccionar múltiples.
                </p>
              </div>
            )}
          </div>

          {/* Asunto */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Asunto del Correo *</label>
            <input
              type="text"
              value={formData.subject}
              onChange={(e) => setFormData((prev) => ({ ...prev, subject: e.target.value }))}
              placeholder="Ej: Nueva reserva creada - {{dua}}"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              required
            />
          </div>

          {/* Plantilla del Cuerpo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Cuerpo del Correo *</label>

            <div className="mb-2 flex flex-wrap gap-2">
              <span className="text-xs text-gray-600">Variables disponibles:</span>
              {TEMPLATE_VARIABLES.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertVariable(v.key)}
                  className="px-2 py-1 bg-teal-50 text-teal-700 rounded text-xs hover:bg-teal-100 transition-colors whitespace-nowrap"
                  title={v.label}
                >
                  {v.key}
                </button>
              ))}
            </div>

            <textarea
              id="body_template"
              value={formData.body_template}
              onChange={(e) => setFormData((prev) => ({ ...prev, body_template: e.target.value }))}
              placeholder="Escribe el contenido del correo aquí. Usa las variables para insertar datos dinámicos."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent min-h-[200px] font-mono"
              required
            />

            <p className="text-xs text-gray-500 mt-1">
              Puedes usar HTML básico para formato. Las variables serán reemplazadas automáticamente.
            </p>
          </div>

          {/* Botones */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium whitespace-nowrap"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {loading ? "Guardando..." : rule ? "Actualizar" : "Crear Regla"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
