import dotenv from 'dotenv';

dotenv.config();

export const config = {
  smtp: {
    host: process.env.SMTP_HOST || '10.48.19.10',
    port: parseInt(process.env.SMTP_PORT || '25', 10),
    secure: process.env.SMTP_SECURE === 'true',
    from: process.env.SMTP_FROM || 'no-reply-sro@ologistics.com',
    connectionTimeout: parseInt(process.env.SMTP_CONNECTION_TIMEOUT || '10000', 10),
    socketTimeout: parseInt(process.env.SMTP_SOCKET_TIMEOUT || '10000', 10),
    greetingTimeout: parseInt(process.env.SMTP_GREETING_TIMEOUT || '5000', 10),
  },
  server: {
    port: parseInt(process.env.PORT || '3100', 10),
    env: process.env.NODE_ENV || 'development',
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
     orgId: process.env.SUPABASE_ORG_ID, 
  },
  log: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

// Validación de configuración crítica
export function validateConfig() {
  const errors = [];

  if (!config.smtp.host) {
    errors.push('SMTP_HOST es requerido');
  }

  if (!config.smtp.from) {
    errors.push('SMTP_FROM es requerido');
  }

  if (!config.supabase.url) {
    errors.push('SUPABASE_URL es requerido');
  }

  if (!config.supabase.serviceRoleKey) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY es requerido');
  }

  if (errors.length > 0) {
    throw new Error(`Configuración inválida:\n${errors.join('\n')}`);
  }

  return true;
}