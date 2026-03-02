import nodemailer from 'nodemailer';
import { config } from './config.js';
import { logger } from './logger.js';
import {
  createOutboxRecord,
  updateOutboxSuccess,
  updateOutboxFailure,
} from './supabase-client.js';

let transporter = null;

/**
 * Inicializa el transporter de nodemailer con configuración SMTP interna
 */
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure, // false para puerto 25
      ignoreTLS: true, // Ignorar TLS completamente
      requireTLS: false, // No requerir TLS
      connectionTimeout: config.smtp.connectionTimeout,
      socketTimeout: config.smtp.socketTimeout,
      greetingTimeout: config.smtp.greetingTimeout,
      logger: config.log.level === 'debug',
      debug: config.log.level === 'debug',
    });

    logger.info('Transporter SMTP inicializado', {
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
    });
  }
  return transporter;
}

/**
 * Valida los datos del correo
 */
function validateEmailData(emailData) {
  const errors = [];

  if (!emailData.to || (Array.isArray(emailData.to) && emailData.to.length === 0) || emailData.to === '') {
    errors.push('El campo "to" es requerido y debe contener al menos un destinatario');
  }

  if (!emailData.subject || emailData.subject.trim() === '') {
    errors.push('El campo "subject" es requerido');
  }

  if (!emailData.body || emailData.body.trim() === '') {
    errors.push('El campo "body" es requerido');
  }

  if (errors.length > 0) {
    throw new Error(`Validación fallida: ${errors.join(', ')}`);
  }
}

/**
 * Normaliza los destinatarios a array
 */
function normalizeRecipients(recipients) {
  if (!recipients) return undefined;
  if (Array.isArray(recipients)) return recipients.join(', ');
  return recipients;
}

/**
 * Envía un correo electrónico usando SMTP interno
 * 
 * Flujo completo:
 * 1. Validar datos de entrada
 * 2. Crear registro en correspondence_outbox con status='queued'
 * 3. Intentar envío SMTP a 10.48.19.10:25
 * 4. Si éxito: actualizar a status='sent' con sent_at y provider_message_id
 * 5. Si falla: actualizar a status='failed' con mensaje de error
 * 
 * @param {Object} emailData - Datos del correo
 * @param {string|string[]} emailData.to - Destinatario(s) principal(es)
 * @param {string|string[]} [emailData.cc] - Destinatarios en copia
 * @param {string|string[]} [emailData.bcc] - Destinatarios en copia oculta
 * @param {string} emailData.subject - Asunto del correo
 * @param {string} emailData.body - Cuerpo del correo (HTML o texto)
 * @param {string} [emailData.eventType] - Tipo de evento (default: 'manual_send')
 * @param {string} [emailData.reservationId] - ID de reserva relacionada
 * @param {string} [emailData.ruleId] - ID de regla de correspondencia
 * @param {string} [emailData.actorUserId] - ID del usuario que ejecuta la acción
 * @param {string} [emailData.senderUserId] - ID del usuario remitente
 * @returns {Promise<Object>} - Resultado del envío
 */
export async function sendEmail(emailData) {
  const startTime = Date.now();
  let outboxId = null;

  try {
    // 1. Validar datos
    validateEmailData(emailData);
    const toDisplay = Array.isArray(emailData.to) ? emailData.to.join(', ') : emailData.to;
    logger.info('Iniciando envío de correo', { 
      to: toDisplay, 
      subject: emailData.subject,
      eventType: emailData.eventType || 'manual_send'
    });

    // 2. Crear registro en correspondence_outbox con status='queued'
    const outboxRecord = await createOutboxRecord(emailData);
    outboxId = outboxRecord.id;
    logger.info('Estado: queued', { outboxId });

    // 3. Preparar mensaje para SMTP
    const mailOptions = {
      from: config.smtp.from,
      to: normalizeRecipients(emailData.to),
      cc: normalizeRecipients(emailData.cc),
      bcc: normalizeRecipients(emailData.bcc),
      subject: emailData.subject,
      html: emailData.body,
      text: emailData.body.replace(/<[^>]*>/g, ''), // Fallback texto plano
    };

    // 4. Enviar correo por SMTP (10.48.19.10:25)
    const transport = getTransporter();
    const info = await transport.sendMail(mailOptions);

    const duration = Date.now() - startTime;
    logger.info('Correo enviado exitosamente por SMTP', {
      outboxId,
      messageId: info.messageId,
      duration: `${duration}ms`,
      to: toDisplay,
      smtp: `${config.smtp.host}:${config.smtp.port}`,
    });

    // 5. Actualizar registro a status='sent'
    await updateOutboxSuccess(outboxId, info.messageId);
    logger.info('Estado: sent', { outboxId, messageId: info.messageId });

    return {
      success: true,
      outboxId,
      messageId: info.messageId,
      duration,
      status: 'sent',
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const toDisplay = Array.isArray(emailData.to) ? emailData.to.join(', ') : emailData.to;
    
    logger.error('Error al enviar correo', {
      outboxId,
      error: error.message,
      duration: `${duration}ms`,
      to: toDisplay,
      smtp: `${config.smtp.host}:${config.smtp.port}`,
    });

    // 6. Actualizar registro a status='failed'
    if (outboxId) {
      try {
        await updateOutboxFailure(outboxId, error.message);
        logger.info('Estado: failed', { outboxId, error: error.message });
      } catch (updateError) {
        logger.error('Error al actualizar outbox después de fallo', {
          outboxId,
          updateError: updateError.message,
        });
      }
    }

    return {
      success: false,
      outboxId,
      error: error.message,
      duration,
      status: 'failed',
    };
  }
}

/**
 * Verifica la conexión SMTP
 */
export async function verifyConnection() {
  try {
    const transport = getTransporter();
    await transport.verify();
    logger.info('Conexión SMTP verificada exitosamente', {
      host: config.smtp.host,
      port: config.smtp.port,
    });
    return { 
      success: true, 
      message: 'Conexión SMTP OK',
      smtp: `${config.smtp.host}:${config.smtp.port}`,
    };
  } catch (error) {
    logger.error('Error al verificar conexión SMTP', { 
      error: error.message,
      host: config.smtp.host,
      port: config.smtp.port,
    });
    return { 
      success: false, 
      error: error.message,
      smtp: `${config.smtp.host}:${config.smtp.port}`,
    };
  }
}

/**
 * Procesa un registro existente de correspondence_outbox
 * Útil para reintentar envíos fallidos o procesar cola
 */
export async function processOutboxRecord(record) {
  const emailData = {
    to: record.to_emails || [record.recipient_email],
    cc: record.cc_emails,
    bcc: record.bcc_emails,
    subject: record.subject,
    body: record.body,
    eventType: record.event_type,
    reservationId: record.reservation_id,
    ruleId: record.rule_id,
    actorUserId: record.actor_user_id,
    senderUserId: record.sender_user_id,
  };

  // Usar el ID existente del registro
  const startTime = Date.now();
  
  try {
    logger.info('Procesando registro existente de outbox', { 
      outboxId: record.id,
      to: emailData.to.join(', '),
    });

    // Preparar mensaje para SMTP
    const mailOptions = {
      from: config.smtp.from,
      to: normalizeRecipients(emailData.to),
      cc: normalizeRecipients(emailData.cc),
      bcc: normalizeRecipients(emailData.bcc),
      subject: emailData.subject,
      html: emailData.body,
      text: emailData.body.replace(/<[^>]*>/g, ''),
    };

    // Enviar correo por SMTP
    const transport = getTransporter();
    const info = await transport.sendMail(mailOptions);

    const duration = Date.now() - startTime;
    logger.info('Registro procesado exitosamente', {
      outboxId: record.id,
      messageId: info.messageId,
      duration: `${duration}ms`,
    });

    // Actualizar a status='sent'
    await updateOutboxSuccess(record.id, info.messageId);

    return {
      success: true,
      outboxId: record.id,
      messageId: info.messageId,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Error al procesar registro', {
      outboxId: record.id,
      error: error.message,
      duration: `${duration}ms`,
    });

    // Actualizar a status='failed'
    await updateOutboxFailure(record.id, error.message);

    return {
      success: false,
      outboxId: record.id,
      error: error.message,
      duration,
    };
  }
}
