export type CorrespondenceEventType = 'reservation_created' | 'reservation_status_changed';

export type CorrespondenceLogStatus = 'pending' | 'sent' | 'failed';

export type SenderMode = 'actor' | 'fixed';
export type RecipientsMode = 'manual' | 'users' | 'roles';

export interface CorrespondenceRule {
  id: string;
  org_id: string;
  name: string;
  event_type: CorrespondenceEventType;
  status_from_id: string | null;
  status_to_id: string | null;
  
  // Nuevos campos para sender
  sender_mode: SenderMode;
  sender_user_id: string | null;
  
  // Nuevos campos para recipients
  recipients_mode: RecipientsMode;
  recipients_emails: string[];
  recipients_user_ids: string[];
  recipients_roles: string[];
  
  // Campos legacy (mantener por compatibilidad)
  recipient_users: string[];
  recipient_roles: string[];
  recipient_external_emails: string[];
  cc_emails: string[];
  bcc_emails: string[];
  
  subject: string;
  body_template: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  
  // Relaciones
  status_from?: {
    name: string;
    code: string;
    color: string;
  };
  status_to?: {
    name: string;
    code: string;
    color: string;
  };
  creator?: {
    name: string;
    email: string;
  };
  sender_user?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface CorrespondenceLog {
  id: string;
  org_id: string;
  rule_id: string | null;
  event_type: string;
  reservation_id: string | null;
  actor_user_id: string | null;
  sender_user_id: string;
  sender_email: string;
  to_emails: string[];
  cc_emails: string[] | null;
  bcc_emails: string[] | null;
  subject: string;
  body: string;
  status: 'queued' | 'sent' | 'failed';
  provider_message_id: string | null;
  error: string | null;
  created_at: string;
  sent_at: string | null;
  rule?: {
    name: string;
  };
  actor_user?: {
    full_name: string;
    email: string;
  };
  sender_user?: {
    full_name: string;
    email: string;
  };
}

export interface CorrespondenceRuleFormData {
  name: string;
  event_type: CorrespondenceEventType;
  status_from_id: string | null;
  status_to_id: string | null;
  
  // Nuevos campos
  sender_mode: SenderMode;
  sender_user_id: string | null;
  recipients_mode: RecipientsMode;
  recipients_emails: string[];
  recipients_user_ids: string[];
  recipients_roles: string[];
  
  // Campos legacy
  recipient_users: string[];
  recipient_roles: string[];
  recipient_external_emails: string[];
  cc_emails: string[];
  bcc_emails: string[];
  
  subject: string;
  body_template: string;
  is_active: boolean;
}

export const CORRESPONDENCE_EVENT_LABELS: Record<CorrespondenceEventType, string> = {
  reservation_created: 'Reserva creada',
  reservation_status_changed: 'Cambio de estado de reserva',
};

export const CORRESPONDENCE_LOG_STATUS_LABELS = {
  queued: 'En cola',
  sent: 'Enviado',
  failed: 'Fallido',
} as const;

export const SENDER_MODE_LABELS: Record<SenderMode, string> = {
  actor: 'Usuario que ejecuta la acción',
  fixed: 'Usuario fijo',
};

export const RECIPIENTS_MODE_LABELS: Record<RecipientsMode, string> = {
  manual: 'Correos manuales',
  users: 'Usuarios específicos',
  roles: 'Roles completos',
};

export const TEMPLATE_VARIABLES = [
  { key: '{{reservation_id}}', label: 'ID de Reserva' },
  { key: '{{dock}}', label: 'Andén' },
  { key: '{{start_datetime}}', label: 'Fecha/Hora Inicio' },
  { key: '{{end_datetime}}', label: 'Fecha/Hora Fin' },
  { key: '{{status}}', label: 'Estado' },
  { key: '{{driver}}', label: 'Conductor' },
  { key: '{{truck_plate}}', label: 'Placa del camión' },
  { key: '{{dua}}', label: 'DUA' },
  { key: '{{invoice}}', label: 'Factura' },
  { key: '{{created_by}}', label: 'Creado por' },
  { key: '{{actor}}', label: 'Usuario que ejecutó la acción' },
];
