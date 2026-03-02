import { sendEmail, verifyConnection } from './email-service.js';
import { config, validateConfig } from './config.js';
import { logger } from './logger.js';

async function runTests() {
  console.log('='.repeat(60));
  console.log('SMTP LOCAL SERVICE - TEST DE ENVÍO');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Validar configuración
    console.log('1. Validando configuración...');
    validateConfig();
    console.log('   ✓ Configuración válida');
    console.log('');

    // Verificar conexión SMTP
    console.log('2. Verificando conexión SMTP...');
    console.log(`   Host: ${config.smtp.host}:${config.smtp.port}`);
    console.log(`   From: ${config.smtp.from}`);
    const verifyResult = await verifyConnection();
    if (verifyResult.success) {
      console.log('   ✓ Conexión SMTP exitosa');
    } else {
      console.log(`   ✗ Error de conexión: ${verifyResult.error}`);
      console.log('');
      console.log('ADVERTENCIA: No se pudo conectar al servidor SMTP.');
      console.log('Verifica que el servidor SMTP esté accesible desde esta red.');
      return;
    }
    console.log('');

    // Enviar correo de prueba
    console.log('3. Enviando correo de prueba...');
    const testEmail = {
      to: 'test@example.com', // Cambiar por un correo real para pruebas
      subject: 'Test SMTP Local Service',
      body: `
        <h1>Correo de Prueba</h1>
        <p>Este es un correo de prueba enviado desde el servicio SMTP local.</p>
        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        <p><strong>Host SMTP:</strong> ${config.smtp.host}:${config.smtp.port}</p>
        <p><strong>From:</strong> ${config.smtp.from}</p>
      `,
      eventType: 'test_email',
    };

    console.log(`   Destinatario: ${testEmail.to}`);
    console.log(`   Asunto: ${testEmail.subject}`);
    console.log('');

    const result = await sendEmail(testEmail);

    if (result.success) {
      console.log('   ✓ Correo enviado exitosamente');
      console.log(`   Outbox ID: ${result.outboxId}`);
      console.log(`   Message ID: ${result.messageId}`);
      console.log(`   Duración: ${result.duration}ms`);
    } else {
      console.log(`   ✗ Error al enviar: ${result.error}`);
      console.log(`   Outbox ID: ${result.outboxId}`);
      console.log(`   Duración: ${result.duration}ms`);
    }
    console.log('');

    console.log('='.repeat(60));
    console.log('TEST COMPLETADO');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('');
    console.error('ERROR CRÍTICO:');
    console.error(error.message);
    console.error('');
    console.error('Stack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Ejecutar tests
runTests();