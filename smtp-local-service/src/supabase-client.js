import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { logger } from './logger.js';

let supabaseClient = null;

export function getSupabaseClient() {
  if (!supabaseClient) {
    if (!config.supabase.url) throw new Error('SUPABASE_URL es requerido.');
    if (!config.supabase.serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY es requerido.');

    supabaseClient = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    logger.info('Cliente Supabase inicializado');
  }
  return supabaseClient;
}

/**
 * Crea un registro en correspondence_outbox con status='queued'
 * Tabla real (según tu DDL): NO existe recipient_email, SÍ existe to_emails (text[])
 * y org_id es NOT NULL.
 */
export async function createOutboxRecord(emailData) {
  const supabase = getSupabaseClient();

  const orgId = emailData.orgId || config.supabase.orgId;
  if (!orgId) {
    throw new Error(
      "orgId es requerido para crear el outbox (correspondence_outbox.org_id es NOT NULL). " +
      "Pásalo en emailData.orgId o define SUPABASE_ORG_ID en el .env del microservicio."
    );
  }

  const toEmails = Array.isArray(emailData.to) ? emailData.to : [emailData.to].filter(Boolean);
  const ccEmails = emailData.cc
    ? (Array.isArray(emailData.cc) ? emailData.cc : [emailData.cc]).filter(Boolean)
    : null;
  const bccEmails = emailData.bcc
    ? (Array.isArray(emailData.bcc) ? emailData.bcc : [emailData.bcc]).filter(Boolean)
    : null;

  if (!toEmails.length) throw new Error('El campo "to" es requerido (al menos 1 email).');
  if (!emailData.subject) throw new Error('El campo "subject" es requerido.');
  if (!emailData.body) throw new Error('El campo "body" es requerido.');

  const record = {
    org_id: orgId,
    event_type: emailData.eventType || 'manual_send',
    reservation_id: emailData.reservationId || null,
    rule_id: emailData.ruleId || null,
    actor_user_id: emailData.actorUserId || null,
    sender_user_id: emailData.senderUserId || null,

    sender_email: config.smtp.from,

    to_emails: toEmails,
    cc_emails: ccEmails,
    bcc_emails: bccEmails,

    subject: emailData.subject,
    body: emailData.body,

    status: 'queued',
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('correspondence_outbox')
    .insert(record)
    .select()
    .single();

  if (error) {
    logger.error('Error al crear registro en outbox', { error: error.message, record });
    throw new Error(`Error al crear registro en outbox: ${error.message}`);
  }

  logger.info('Registro creado en outbox', {
    id: data.id,
    orgId,
    to: toEmails.join(', '),
    eventType: record.event_type,
  });

  return data;
}

export async function updateOutboxSuccess(id, messageId) {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('correspondence_outbox')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      provider_message_id: messageId,
      error: null,
    })
    .eq('id', id);

  if (error) {
    logger.error('Error al actualizar outbox (success)', { id, error: error.message });
    throw new Error(`Error al actualizar outbox: ${error.message}`);
  }

  logger.info('Registro actualizado a sent', { id, messageId });
}

export async function updateOutboxFailure(id, errorMessage) {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('correspondence_outbox')
    .update({
      status: 'failed',
      error: errorMessage,
    })
    .eq('id', id);

  if (error) {
    logger.error('Error al actualizar outbox (failure)', { id, error: error.message });
    throw new Error(`Error al actualizar outbox: ${error.message}`);
  }

  logger.warn('Registro actualizado a failed', { id, error: errorMessage });
}

export async function getPendingOutboxRecords(limit = 10) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('correspondence_outbox')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    logger.error('Error al obtener registros pendientes', { error: error.message });
    throw new Error(`Error al obtener registros pendientes: ${error.message}`);
  }

  return data || [];
}

export async function retryOutboxRecord(id) {
  const supabase = getSupabaseClient();

  const { data: record, error: fetchError } = await supabase
    .from('correspondence_outbox')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError) {
    logger.error('Error al obtener registro para reintentar', { id, error: fetchError.message });
    throw new Error(`Error al obtener registro: ${fetchError.message}`);
  }

  const { error: updateError } = await supabase
    .from('correspondence_outbox')
    .update({
      status: 'queued',
      error: null,
    })
    .eq('id', id);

  if (updateError) {
    logger.error('Error al reintentar registro', { id, error: updateError.message });
    throw new Error(`Error al reintentar registro: ${updateError.message}`);
  }

  logger.info('Registro marcado para reintento', { id });
  return record;
}

export async function getOutboxStats() {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('correspondence_outbox')
    .select('status');

  if (error) {
    logger.error('Error al obtener estadísticas', { error: error.message });
    return { queued: 0, sent: 0, failed: 0, total: 0 };
  }

  return {
    queued: data.filter(r => r.status === 'queued').length,
    sent: data.filter(r => r.status === 'sent').length,
    failed: data.filter(r => r.status === 'failed').length,
    total: data.length,
  };
}

