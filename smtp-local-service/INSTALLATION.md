# Guía de Instalación - Servicio SMTP Local

## 📋 Descripción

Servicio Node.js que gestiona el envío de correos electrónicos desde el backend local de la organización, conectándose directamente al servidor SMTP interno (10.48.19.10:25).

**Características:**
- ✅ Envío directo a SMTP interno sin dependencias externas
- ✅ Gestión completa de `correspondence_outbox` en Supabase
- ✅ Procesamiento de cola con reintentos automáticos
- ✅ Endpoint de prueba manual
- ✅ Logs detallados y estadísticas

---

## 🔧 Requisitos Previos

### Sistema
- **Node.js**: v18 o superior
- **npm**: v9 o superior
- **Red**: Acceso a 10.48.19.10:25 (SMTP interno)
- **Base de datos**: Supabase configurado

### Acceso de Red
El servidor donde se despliega este servicio **DEBE** tener:
- ✅ Conectividad a `10.48.19.10` puerto `25`
- ✅ Acceso a Internet para conectar con Supabase
- ✅ Puerto `3100` disponible (o configurar otro)

---

## 📦 Instalación

### Opción 1: Instalación Manual

#### 1. Clonar/Copiar el proyecto
```bash
cd /ruta/del/proyecto
cd smtp-local-service
```

#### 2. Instalar dependencias
```bash
npm install
```

#### 3. Configurar variables de entorno
```bash
cp .env.example .env
nano .env
```

**Configuración mínima requerida:**
```env
# Puerto del servicio
PORT=3100

# Supabase (obtener de .env principal del proyecto)
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key-aqui

# SMTP Interno (NO MODIFICAR)
SMTP_HOST=10.48.19.10
SMTP_PORT=25
SMTP_SECURE=false
SMTP_FROM=no-reply-sro@ologistics.com

# Procesamiento de cola
QUEUE_INTERVAL_MS=30000
MAX_RETRIES=3
RETRY_DELAY_MS=60000

# Logs
LOG_LEVEL=info
```

#### 4. Probar conexión SMTP
```bash
npm run test
```

**Salida esperada:**
```
[INFO] Iniciando prueba de envío SMTP...
[INFO] Configuración SMTP: {"host":"10.48.19.10","port":25,"secure":false}
[INFO] Correo de prueba enviado exitosamente
[INFO] Message ID: <mensaje-id@smtp>
✅ Prueba exitosa
```

#### 5. Iniciar el servicio
```bash
# Modo desarrollo (con auto-reload)
npm run dev

# Modo producción
npm start
```

---

### Opción 2: Instalación con Docker

#### 1. Construir imagen
```bash
cd smtp-local-service
docker build -t smtp-local-service:latest .
```

#### 2. Crear archivo .env
```bash
cp .env.example .env
# Editar .env con tus credenciales
```

#### 3. Ejecutar contenedor
```bash
docker run -d \
  --name smtp-service \
  --restart unless-stopped \
  -p 3100:3100 \
  --env-file .env \
  smtp-local-service:latest
```

#### 4. Verificar logs
```bash
docker logs -f smtp-service
```

---

### Opción 3: Docker Compose (Recomendado para Producción)

#### 1. Crear docker-compose.yml
```yaml
version: '3.8'

services:
  smtp-service:
    build: ./smtp-local-service
    container_name: smtp-local-service
    restart: unless-stopped
    ports:
      - "3100:3100"
    env_file:
      - ./smtp-local-service/.env
    volumes:
      - ./smtp-local-service/logs:/app/logs
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3100/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

#### 2. Iniciar servicio
```bash
docker-compose up -d smtp-service
```

#### 3. Ver logs
```bash
docker-compose logs -f smtp-service
```

---

## 🧪 Pruebas de Funcionamiento

### 1. Health Check
```bash
curl http://localhost:3100/health
```

**Respuesta esperada:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "smtp": {
    "host": "10.48.19.10",
    "port": 25,
    "configured": true
  }
}
```

### 2. Estadísticas
```bash
curl http://localhost:3100/stats
```

**Respuesta esperada:**
```json
{
  "queue": {
    "pending": 5,
    "processing": 1,
    "sent": 150,
    "failed": 3
  },
  "uptime": 3600,
  "lastProcessed": "2024-01-15T10:29:00.000Z"
}
```

### 3. Envío de Prueba Manual
```bash
curl -X POST http://localhost:3100/api/email/send-test \
  -H "Content-Type: application/json" \
  -d '{
    "to": "tu-email@example.com",
    "subject": "Prueba de Envío SMTP Local",
    "body": "<h1>Correo de Prueba</h1><p>Si recibes este correo, el servicio funciona correctamente.</p>"
  }'
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "Correo de prueba enviado exitosamente",
  "data": {
    "outboxId": "uuid-del-registro",
    "messageId": "<mensaje-id@smtp>",
    "sentAt": "2024-01-15T10:30:00.000Z",
    "to": ["tu-email@example.com"],
    "subject": "Prueba de Envío SMTP Local"
  }
}
```

---

## 🔍 Verificación en Base de Datos

Después de enviar un correo, verifica en Supabase:

```sql
SELECT 
  id,
  event_type,
  sender_email,
  recipient_email,
  subject,
  status,
  sent_at,
  provider_message_id,
  error,
  created_at
FROM correspondence_outbox
ORDER BY created_at DESC
LIMIT 10;
```

---

## 🚀 Configuración en Producción

### 1. Configurar como Servicio Systemd (Linux)

Crear archivo `/etc/systemd/system/smtp-local.service`:

```ini
[Unit]
Description=SMTP Local Service
After=network.target

[Service]
Type=simple
User=nodejs
WorkingDirectory=/opt/smtp-local-service
ExecStart=/usr/bin/node /opt/smtp-local-service/src/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=smtp-local
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

**Comandos:**
```bash
# Recargar systemd
sudo systemctl daemon-reload

# Habilitar inicio automático
sudo systemctl enable smtp-local

# Iniciar servicio
sudo systemctl start smtp-local

# Ver estado
sudo systemctl status smtp-local

# Ver logs
sudo journalctl -u smtp-local -f
```

### 2. Configurar Nginx como Reverse Proxy (Opcional)

Si necesitas exponer el servicio con HTTPS:

```nginx
server {
    listen 443 ssl http2;
    server_name smtp-api.ologistics.com;

    ssl_certificate /etc/ssl/certs/smtp-api.crt;
    ssl_certificate_key /etc/ssl/private/smtp-api.key;

    location / {
        proxy_pass http://localhost:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 📊 Monitoreo y Logs

### Ver Logs en Tiempo Real
```bash
# Instalación manual
tail -f logs/smtp-service.log

# Docker
docker logs -f smtp-service

# Systemd
sudo journalctl -u smtp-local -f
```

### Logs Importantes

**Inicio del servicio:**
```
[INFO] Servicio SMTP Local iniciado en puerto 3100
[INFO] Configuración SMTP: {"host":"10.48.19.10","port":25}
[INFO] Procesador de cola iniciado (intervalo: 30000ms)
```

**Envío exitoso:**
```
[INFO] Solicitud de envío recibida {"to":["dest@example.com"],"eventType":"reservation_confirmation"}
[INFO] Registro creado en outbox {"id":"uuid-123"}
[INFO] Correo enviado exitosamente por SMTP {"messageId":"<msg@smtp>","duration":"245ms"}
[INFO] Estado: sent {"outboxId":"uuid-123"}
```

**Error de envío:**
```
[ERROR] Error al enviar correo {"outboxId":"uuid-456","error":"Connection timeout"}
[INFO] Estado: failed {"outboxId":"uuid-456","retryCount":1}
```

---

## 🔧 Solución de Problemas

### Problema: "Connection refused" a 10.48.19.10:25

**Causa:** El servidor no tiene acceso de red al SMTP interno.

**Solución:**
1. Verificar conectividad:
   ```bash
   telnet 10.48.19.10 25
   ```
2. Verificar firewall:
   ```bash
   sudo iptables -L -n | grep 25
   ```
3. Contactar al administrador de red si no hay conectividad.

---

### Problema: "SUPABASE_URL is not defined"

**Causa:** Variables de entorno no configuradas.

**Solución:**
1. Verificar que existe el archivo `.env`:
   ```bash
   ls -la .env
   ```
2. Verificar contenido:
   ```bash
   cat .env | grep SUPABASE
   ```
3. Reiniciar el servicio después de editar `.env`.

---

### Problema: Correos quedan en estado "queued"

**Causa:** El procesador de cola no está funcionando.

**Solución:**
1. Verificar logs del servicio:
   ```bash
   docker logs smtp-service | grep "Procesador de cola"
   ```
2. Verificar que `QUEUE_INTERVAL_MS` está configurado (default: 30000).
3. Reiniciar el servicio:
   ```bash
   docker restart smtp-service
   ```

---

### Problema: "Error: Invalid login"

**Causa:** El SMTP interno NO requiere autenticación, pero nodemailer está intentando autenticar.

**Solución:**
Verificar en `.env`:
```env
SMTP_SECURE=false
# NO debe haber SMTP_USER ni SMTP_PASS
```

---

## 📚 Uso desde el Sistema

### Desde el Frontend (React)

El frontend **NO** debe llamar directamente al servicio SMTP. En su lugar, debe:

1. Crear registro en `correspondence_outbox` con status `queued`
2. El servicio SMTP local procesará automáticamente la cola

**Ejemplo:**
```typescript
// src/services/emailService.ts
import { supabase } from '@/lib/supabase';

export async function queueEmail(data: {
  eventType: string;
  recipientEmail: string;
  toEmails: string[];
  ccEmails?: string[];
  bccEmails?: string[];
  subject: string;
  body: string;
  metadata?: any;
}) {
  const { data: outbox, error } = await supabase
    .from('correspondence_outbox')
    .insert({
      event_type: data.eventType,
      sender_email: 'no-reply-sro@ologistics.com',
      recipient_email: data.recipientEmail,
      to_emails: data.toEmails,
      cc_emails: data.ccEmails || [],
      bcc_emails: data.bccEmails || [],
      subject: data.subject,
      body: data.body,
      status: 'queued',
      metadata: data.metadata || {}
    })
    .select()
    .single();

  if (error) throw error;
  return outbox;
}
```

**Uso:**
```typescript
// Al confirmar una reserva
await queueEmail({
  eventType: 'reservation_confirmation',
  recipientEmail: 'cliente@example.com',
  toEmails: ['cliente@example.com'],
  subject: 'Confirmación de Reserva #12345',
  body: '<h1>Su reserva ha sido confirmada</h1>...',
  metadata: { reservationId: '12345' }
});
```

---

### Desde Edge Functions (Si es necesario)

Si necesitas enviar correos desde Edge Functions:

```typescript
// supabase/functions/alguna-funcion/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Crear registro en outbox
const { data, error } = await supabase
  .from('correspondence_outbox')
  .insert({
    event_type: 'notification',
    sender_email: 'no-reply-sro@ologistics.com',
    recipient_email: 'user@example.com',
    to_emails: ['user@example.com'],
    subject: 'Notificación',
    body: '<p>Contenido del correo</p>',
    status: 'queued'
  });

// El servicio SMTP local procesará automáticamente
```

---

## ✅ Checklist de Instalación Completa

- [ ] Node.js v18+ instalado
- [ ] Dependencias instaladas (`npm install`)
- [ ] Archivo `.env` configurado con credenciales correctas
- [ ] Conectividad a 10.48.19.10:25 verificada (`telnet`)
- [ ] Prueba de envío exitosa (`npm run test`)
- [ ] Servicio iniciado (`npm start` o `docker-compose up -d`)
- [ ] Health check respondiendo (`curl http://localhost:3100/health`)
- [ ] Envío de prueba manual exitoso (`POST /api/email/send-test`)
- [ ] Verificación en Supabase (registro en `correspondence_outbox`)
- [ ] Logs funcionando correctamente
- [ ] Servicio configurado para inicio automático (systemd/docker)

---

## 🎯 Confirmación de Eliminación de Dependencias

### ❌ Eliminado de Supabase

- ✅ Edge Function `smtp-send` eliminada completamente
- ✅ Secret `SMTP_RELAY_URL` ya no es necesario
- ✅ Secret `SMTP_RELAY_SECRET` ya no es necesario
- ✅ Secret `SMTP_FROM` ya no es necesario (ahora en .env local)

### ✅ Configuración Actual

**Supabase:**
- Solo almacena datos en `correspondence_outbox`
- No realiza envíos de correo
- No requiere secrets SMTP

**Backend Local:**
- Gestiona todo el envío SMTP
- Conecta directamente a 10.48.19.10:25
- Variables en `.env` local (no en Supabase)

---

## 📞 Soporte

Si encuentras problemas durante la instalación:

1. Verifica los logs del servicio
2. Revisa la sección "Solución de Problemas"
3. Verifica conectividad de red a 10.48.19.10:25
4. Confirma que las credenciales de Supabase son correctas

---

## 📄 Archivos de Configuración

### .env (Ejemplo completo)
```env
# Puerto del servicio
PORT=3100

# Supabase
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key-aqui

# SMTP Interno (NO MODIFICAR)
SMTP_HOST=10.48.19.10
SMTP_PORT=25
SMTP_SECURE=false
SMTP_FROM=no-reply-sro@ologistics.com

# Procesamiento de cola
QUEUE_INTERVAL_MS=30000
MAX_RETRIES=3
RETRY_DELAY_MS=60000

# Logs
LOG_LEVEL=info
```

### package.json (Scripts disponibles)
```json
{
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "test": "node src/test-email.js"
  }
}
```

---

**Versión:** 1.0.0  
**Última actualización:** 2024-01-15  
**Arquitectura:** SMTP Local (sin dependencias externas)