
/**
 * HTTP SMTP Relay Server v2.0
 *
 * Puente: Supabase Edge Functions (nube) → HTTPS → Este Relay (DMZ) → SMTP Plain → 10.48.19.10:25
 *
 * Seguridad: Header X-Relay-Secret obligatorio.
 * SMTP interno: sin auth, sin TLS/SSL, puerto 25.
 */

const express = require('express');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

// ─── SMTP Config ────────────────────────────────────────────────
const SMTP_HOST = process.env.SMTP_HOST || '10.48.19.10';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '25', 10);
const SMTP_SECURE = (process.env.SMTP_SECURE || 'false') === 'true';

const transportConfig = {
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  ignoreTLS: true,
  requireTLS: false,
  tls: { rejectUnauthorized: false },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 30000,
};

// Solo agregar auth si hay credenciales
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transportConfig.auth = {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  };
}

console.log('[RELAY] v2.0 starting...');
console.log('[RELAY] SMTP target:', {
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  hasAuth: !!transportConfig.auth,
  ignoreTLS: true,
});

const transporter = nodemailer.createTransport(transportConfig);

// Verificar conexión al iniciar
transporter.verify((err) => {
  if (err) {
    console.error('[RELAY] SMTP verify FAILED:', err.message);
    console.error(
      '[RELAY] El relay arrancó pero puede fallar al enviar. Verificar conectividad a',
      `${SMTP_HOST}:${SMTP_PORT}`
    );
  } else {
    console.log('[RELAY] SMTP verify OK -', `${SMTP_HOST}:${SMTP_PORT}`, 'accesible');
  }
});

// ─── Auth middleware ────────────────────────────────────────────
function authenticateRelay(req, res, next) {
  const secret = req.headers['x-relay-secret'];
  const expected = process.env.RELAY_SECRET;

  if (!expected) {
    console.error('[RELAY] FATAL: RELAY_SECRET env no configurado');
    return res
      .status(500)
      .json({ success: false, error: 'Relay misconfigured (no RELAY_SECRET)' });
  }

  if (!secret || secret !== expected) {
    console.warn('[RELAY][AUTH_FAIL]', { ip: req.ip, hasSecret: !!secret });
    return res
      .status(401)
      .json({ success: false, error: 'Unauthorized - Invalid or missing X-Relay-Secret' });
  }

  next();
}

// ─── Health ─────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'smtp-relay',
    version: '2.0',
    timestamp: new Date().toISOString(),
    smtp: { host: SMTP_HOST, port: SMTP_PORT },
  });
});

// ─── Send Email ─────────────────────────────────────────────────
app.post('/send-email', authenticateRelay, async (req, res) => {
  const reqId = `relay-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  try {
    const { from, to, cc, bcc, subject, body, eventType } = req.body;

    // Validar required
    const missing = [];
    if (!from) missing.push('from');
    if (!to || !Array.isArray(to) || to.length === 0) missing.push('to (array, min 1)');
    if (!subject) missing.push('subject');
    if (!body) missing.push('body');

    if (missing.length > 0) {
      console.warn('[RELAY][VALIDATION]', { reqId, missing });
      return res
        .status(400)
        .json({ success: false, error: `Missing required fields: ${missing.join(', ')}` });
    }

    // Validar emails
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const allEmails = [from, ...to, ...(cc || []), ...(bcc || [])];
    const invalid = allEmails.filter((e) => !emailRx.test(e));
    if (invalid.length > 0) {
      return res
        .status(400)
        .json({ success: false, error: `Invalid email(s): ${invalid.join(', ')}` });
    }

    console.log('[RELAY][SEND]', {
      reqId,
      from,
      to,
      cc: (cc || []).length,
      bcc: (bcc || []).length,
      subject: subject.substring(0, 80),
      eventType: eventType || 'N/A',
    });

    // Texto plano desde HTML
    const textBody = body
      .replace(/<style[^>]*>.*?<\/style>/gis, '')
      .replace(/<script[^>]*>.*?<\/script>/gis, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const mailOptions = {
      from,
      to: to.join(', '),
      cc: cc && cc.length > 0 ? cc.join(', ') : undefined,
      bcc: bcc && bcc.length > 0 ? bcc.join(', ') : undefined,
      subject,
      html: body,
      text: textBody,
    };

    const info = await transporter.sendMail(mailOptions);

    console.log('[RELAY][OK]', {
      reqId,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      response: (info.response || '').substring(0, 120),
    });

    res.json({
      success: true,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
    });
  } catch (err) {
    console.error('[RELAY][ERROR]', {
      reqId,
      error: err.message,
      code: err.code,
      command: err.command,
    });

    let errorMsg = err.message;
    if (err.code === 'ECONNREFUSED')
      errorMsg = `Connection refused: ${SMTP_HOST}:${SMTP_PORT} - Verificar servidor SMTP y firewall`;
    else if (err.code === 'ETIMEDOUT')
      errorMsg = `Timeout: ${SMTP_HOST}:${SMTP_PORT} - Verificar red y firewall`;
    else if (err.code === 'ENOTFOUND')
      errorMsg = `DNS not found: ${SMTP_HOST} - Verificar hostname`;
    else if (err.responseCode === 550)
      errorMsg = `SMTP 550 relay denied: ${err.response} - Agregar IP a allowlist`;

    res.status(500).json({ success: false, error: errorMsg, code: err.code });
  }
});

// ─── 404 ────────────────────────────────────────────────────────
app.use((_req, res) => {
  res
    .status(404)
    .json({ success: false, error: 'Not found', endpoints: ['GET /health', 'POST /send-email'] });
});

// ─── Start ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[RELAY] Listening on :${PORT}`);
  console.log(`[RELAY] POST http://localhost:${PORT}/send-email`);
  console.log(`[RELAY] GET  http://localhost:${PORT}/health`);
});

process.on('uncaughtException', (e) => console.error('[RELAY] uncaughtException:', e));
process.on('unhandledRejection', (r) => console.error('[RELAY] unhandledRejection:', r));
