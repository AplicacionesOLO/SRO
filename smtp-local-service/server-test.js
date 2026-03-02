/**
 * Servidor SMTP de prueba 100% local
 * Sin dependencias de Supabase, .env, secrets ni configuración externa
 * 
 * Ejecutar: node server-test.js
 */

const express = require('express');
const nodemailer = require('nodemailer');

const app = express();

// ============================================
// CORS – permitir requests desde Vite dev server
// ============================================
app.use((req, res, next) => {
  const allowedOrigins = [
    'http://localhost:5175',
    'http://localhost:5174',
    'http://127.0.0.1:5175',
    'http://127.0.0.1:5174',
  ];
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());

// ============================================
// CONFIGURACIÓN SMTP HARDCODEADA
// ============================================
const SMTP_CONFIG = {
  host: '10.48.19.10',
  port: 25,
  secure: false,
  ignoreTLS: true,
  requireTLS: false,
  tls: {
    rejectUnauthorized: false
  }
  // Sin auth
};

const FROM_EMAIL = 'no-reply-sro@ologistics.com';

console.log('='.repeat(60));
console.log('SERVIDOR SMTP LOCAL - CONFIGURACIÓN HARDCODEADA');
console.log('='.repeat(60));
console.log('SMTP_HOST:', SMTP_CONFIG.host);
console.log('SMTP_PORT:', SMTP_CONFIG.port);
console.log('SMTP_SECURE:', SMTP_CONFIG.secure);
console.log('SMTP_IGNORE_TLS:', SMTP_CONFIG.ignoreTLS);
console.log('SMTP_REQUIRE_TLS:', SMTP_CONFIG.requireTLS);
console.log('FROM_EMAIL:', FROM_EMAIL);
console.log('='.repeat(60));

// ============================================
// CREAR TRANSPORTER DE NODEMAILER
// ============================================
const transporter = nodemailer.createTransport(SMTP_CONFIG);

// ============================================
// ENDPOINT DE PRUEBA MÍNIMO
// ============================================
app.post('/test-smtp', async (req, res) => {
  const { to } = req.body;

  if (!to) {
    return res.status(400).json({
      success: false,
      error: 'Campo "to" es requerido'
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('INICIANDO ENVÍO DE CORREO DE PRUEBA');
  console.log('='.repeat(60));
  console.log('FROM:', FROM_EMAIL);
  console.log('TO:', to);
  console.log('SUBJECT: Test SMTP Local');
  console.log('BODY: Prueba directa local');
  console.log('='.repeat(60));

  try {
    // Configuración del correo
    const mailOptions = {
      from: FROM_EMAIL,
      to: to,
      subject: 'Test SMTP Local',
      text: 'Prueba directa local desde servidor interno',
      html: '<p>Prueba directa local desde servidor interno</p><p>Configuración:</p><ul><li>Host: 10.48.19.10</li><li>Puerto: 25</li><li>Sin TLS</li><li>Sin autenticación</li></ul>'
    };

    console.log('\n📤 Enviando correo...');
    
    // Enviar correo
    const info = await transporter.sendMail(mailOptions);

    console.log('\n✅ CORREO ENVIADO EXITOSAMENTE');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);
    console.log('='.repeat(60) + '\n');

    res.json({
      success: true,
      messageId: info.messageId,
      response: info.response,
      config: {
        host: SMTP_CONFIG.host,
        port: SMTP_CONFIG.port,
        from: FROM_EMAIL,
        to: to
      }
    });

  } catch (error) {
    console.error('\n❌ ERROR AL ENVIAR CORREO');
    console.error('Error completo:', error);
    console.error('Stack:', error.stack);
    console.error('='.repeat(60) + '\n');

    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      config: {
        host: SMTP_CONFIG.host,
        port: SMTP_CONFIG.port
      }
    });
  }
});

// ============================================
// ENDPOINT /api/email/send-test (compatible con frontend)
// ============================================
app.post('/api/email/send-test', async (req, res) => {
  const { to, subject, body } = req.body;

  if (!to) {
    return res.status(400).json({ success: false, error: 'Campo "to" es requerido' });
  }
  if (!subject) {
    return res.status(400).json({ success: false, error: 'Campo "subject" es requerido' });
  }
  if (!body) {
    return res.status(400).json({ success: false, error: 'Campo "body" es requerido' });
  }

  console.log('\n' + '='.repeat(60));
  console.log('ENVÍO VÍA /api/email/send-test');
  console.log('='.repeat(60));
  console.log('FROM:', FROM_EMAIL);
  console.log('TO:', to);
  console.log('SUBJECT:', subject);
  console.log('='.repeat(60));

  try {
    const mailOptions = {
      from: FROM_EMAIL,
      to,
      subject,
      html: body,
      text: body.replace(/<[^>]*>/g, ''),
    };

    const info = await transporter.sendMail(mailOptions);

    console.log('✅ CORREO ENVIADO EXITOSAMENTE');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);

    res.json({
      success: true,
      message: 'Correo enviado exitosamente',
      messageId: info.messageId,
    });
  } catch (error) {
    console.error('❌ ERROR AL ENVIAR CORREO');
    console.error('Error completo:', error);
    console.error('Stack:', error.stack);

    res.status(500).json({
      success: false,
      error: error.message,
      details: error.stack,
    });
  }
});

// ============================================
// ENDPOINT DE HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'smtp-local-test',
    smtp: {
      host: SMTP_CONFIG.host,
      port: SMTP_CONFIG.port,
      from: FROM_EMAIL
    }
  });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
const PORT = 3100;

app.listen(PORT, () => {
  console.log('\n🚀 Servidor SMTP de prueba iniciado');
  console.log(`📍 Puerto: ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📧 Test endpoint: POST http://localhost:${PORT}/test-smtp`);
  console.log('\nEjemplo de uso:');
  console.log(`curl -X POST http://localhost:${PORT}/test-smtp \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"to":"tu-correo@ejemplo.com"}'`);
  console.log('\n' + '='.repeat(60) + '\n');
});
