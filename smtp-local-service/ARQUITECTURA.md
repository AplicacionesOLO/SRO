# Arquitectura del Sistema de Envío SMTP Local

## 📐 Visión General

El sistema de envío de correos electrónicos ha sido rediseñado para funcionar completamente desde el backend local de la organización, eliminando cualquier dependencia de servicios externos o Edge Functions de Supabase.

---

## 🏗️ Arquitectura Actual

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend React                            │
│  - Crea registros en correspondence_outbox                   │
│  - Status inicial: 'queued'                                  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ INSERT INTO correspondence_outbox
                      │ (status = 'queued')
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Supabase Database                         │
│  - Tabla: correspondence_outbox                              │
│  - Almacena: emails pendientes, enviados, fallidos           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ SELECT WHERE status = 'queued'
                      │ (cada 30 segundos)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Servicio SMTP Local (Node.js)                   │
│  - Procesa cola de correos                                   │
│  - Conecta a SMTP interno                                    │
│  - Actualiza estados en Supabase                             │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ SMTP (puerto 25)
                      │ Sin autenticación
                      │ Sin TLS/SSL
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              SMTP Interno Corporativo                        │
│  - Host: 10.48.19.10                                         │
│  - Puerto: 25                                                │
│  - From: no-reply-sro@ologistics.com                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 Flujo de Envío de Correos

### 1. Creación de Correo (Frontend/Backend)

```typescript
// El sistema crea un registro en correspondence_outbox
await supabase.from('correspondence_outbox').insert({
  event_type: 'reservation_confirmation',
  sender_email: 'no-reply-sro@ologistics.com',
  recipient_email: 'cliente@example.com',
  to_emails: ['cliente@example.com'],
  cc_emails: [],
  bcc_emails: [],
  subject: 'Confirmación de Reserva',
  body: '<h1>Su reserva ha sido confirmada</h1>',
  status: 'queued',  // ← Estado inicial
  metadata: { reservationId: '12345' }
});
```

**Estado:** `queued` → El correo está en cola esperando ser procesado

---

### 2. Procesamiento de Cola (Servicio SMTP Local)

El servicio ejecuta cada 30 segundos:

```javascript
// 1. Buscar correos pendientes
const { data: pendingEmails } = await supabase
  .from('correspondence_outbox')
  .select('*')
  .eq('status', 'queued')
  .order('created_at', { ascending: true })
  .limit(10);

// 2. Procesar cada correo
for (const email of pendingEmails) {
  await processEmail(email);
}
```

---

### 3. Envío SMTP

```javascript
// 1. Actualizar estado a 'processing'
await supabase
  .from('correspondence_outbox')
  .update({ status: 'processing' })
  .eq('id', email.id);

// 2. Enviar por SMTP
const info = await transporter.sendMail({
  from: 'no-reply-sro@ologistics.com',
  to: email.to_emails,
  cc: email.cc_emails,
  bcc: email.bcc_emails,
  subject: email.subject,
  html: email.body
});

// 3. Actualizar estado a 'sent'
await supabase
  .from('correspondence_outbox')
  .update({
    status: 'sent',
    sent_at: new Date().toISOString(),
    provider_message_id: info.messageId
  })
  .eq('id', email.id);
```

**Estado:** `queued` → `processing` → `sent`

---

### 4. Manejo de Errores

Si el envío falla:

```javascript
try {
  await transporter.sendMail(mailOptions);
} catch (error) {
  // Actualizar estado a 'failed'
  await supabase
    .from('correspondence_outbox')
    .update({
      status: 'failed',
      error: error.message,
      retry_count: email.retry_count + 1
    })
    .eq('id', email.id);
  
  // Si no ha superado el máximo de reintentos, volver a 'queued'
  if (email.retry_count < MAX_RETRIES) {
    setTimeout(async () => {
      await supabase
        .from('correspondence_outbox')
        .update({ status: 'queued' })
        .eq('id', email.id);
    }, RETRY_DELAY_MS);
  }
}
```

**Estado:** `queued` → `processing` → `failed` → (reintento) → `queued`

---

## 📊 Estados de Correos

| Estado | Descripción | Siguiente Estado |
|--------|-------------|------------------|
| `queued` | Correo en cola esperando ser procesado | `processing` |
| `processing` | Correo siendo enviado actualmente | `sent` o `failed` |
| `sent` | Correo enviado exitosamente | (final) |
| `failed` | Error en el envío | `queued` (reintento) o (final) |

---

## 🗂️ Estructura de Tablas

### correspondence_outbox

```sql
CREATE TABLE correspondence_outbox (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,           -- Tipo de evento (ej: 'reservation_confirmation')
  sender_email TEXT NOT NULL,         -- Siempre: 'no-reply-sro@ologistics.com'
  recipient_email TEXT NOT NULL,      -- Email principal del destinatario
  to_emails TEXT[] NOT NULL,          -- Array de destinatarios
  cc_emails TEXT[] DEFAULT '{}',      -- Array de copias
  bcc_emails TEXT[] DEFAULT '{}',     -- Array de copias ocultas
  subject TEXT NOT NULL,              -- Asunto del correo
  body TEXT NOT NULL,                 -- Cuerpo HTML del correo
  status TEXT NOT NULL DEFAULT 'queued', -- Estado actual
  sent_at TIMESTAMPTZ,                -- Fecha/hora de envío exitoso
  error TEXT,                         -- Mensaje de error (si falla)
  retry_count INTEGER DEFAULT 0,      -- Número de reintentos
  provider_message_id TEXT,           -- ID del mensaje SMTP
  metadata JSONB DEFAULT '{}',        -- Datos adicionales
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para optimizar consultas
CREATE INDEX idx_outbox_status ON correspondence_outbox(status);
CREATE INDEX idx_outbox_created_at ON correspondence_outbox(created_at);
CREATE INDEX idx_outbox_event_type ON correspondence_outbox(event_type);
```

---

## 🔧 Componentes del Sistema

### 1. Email Service (`src/email-service.js`)

**Responsabilidades:**
- Configurar transporter de Nodemailer
- Enviar correos por SMTP
- Manejar errores de envío
- Generar logs detallados

**Configuración SMTP:**
```javascript
const transporter = nodemailer.createTransport({
  host: '10.48.19.10',
  port: 25,
  secure: false,           // No usar TLS/SSL
  ignoreTLS: true,         // Ignorar comandos STARTTLS
  requireTLS: false,       // No requerir TLS
  tls: {
    rejectUnauthorized: false
  }
  // Sin auth (no user/pass)
});
```

---

### 2. Supabase Client (`src/supabase-client.js`)

**Responsabilidades:**
- Conectar con Supabase usando Service Role Key
- Realizar operaciones CRUD en `correspondence_outbox`
- Manejar errores de base de datos

---

### 3. Server (`src/server.js`)

**Responsabilidades:**
- Iniciar servidor HTTP en puerto 3100
- Exponer endpoints:
  - `GET /health` - Health check
  - `GET /stats` - Estadísticas de la cola
  - `POST /api/email/send-test` - Envío de prueba manual
- Iniciar procesador de cola
- Manejar señales de cierre (SIGTERM, SIGINT)

---

### 4. Queue Processor (dentro de `server.js`)

**Responsabilidades:**
- Ejecutar cada 30 segundos (configurable)
- Buscar correos con status `queued`
- Procesar hasta 10 correos por ciclo
- Actualizar estados en base de datos
- Implementar reintentos con backoff

**Algoritmo:**
```javascript
async function processQueue() {
  // 1. Obtener correos pendientes
  const pending = await getPendingEmails();
  
  // 2. Procesar cada uno
  for (const email of pending) {
    try {
      // 2.1. Marcar como 'processing'
      await updateStatus(email.id, 'processing');
      
      // 2.2. Enviar por SMTP
      const result = await sendEmail(email);
      
      // 2.3. Marcar como 'sent'
      await updateStatus(email.id, 'sent', {
        sent_at: new Date(),
        provider_message_id: result.messageId
      });
      
    } catch (error) {
      // 2.4. Marcar como 'failed'
      await updateStatus(email.id, 'failed', {
        error: error.message,
        retry_count: email.retry_count + 1
      });
      
      // 2.5. Programar reintento si no superó el máximo
      if (email.retry_count < MAX_RETRIES) {
        scheduleRetry(email.id);
      }
    }
  }
}

// Ejecutar cada 30 segundos
setInterval(processQueue, 30000);
```

---

## 🔐 Seguridad

### Variables de Entorno

**Almacenamiento:**
- ✅ Archivo `.env` en el servidor local
- ✅ Variables de entorno del sistema operativo
- ✅ Secrets de Docker/Kubernetes

**NO almacenar en:**
- ❌ Código fuente
- ❌ Repositorio Git
- ❌ Supabase Secrets (ya no se usan)

### Credenciales Requeridas

```env
# Supabase (para acceso a base de datos)
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...  # ← Mantener secreto

# SMTP (configuración fija)
SMTP_HOST=10.48.19.10
SMTP_PORT=25
SMTP_FROM=no-reply-sro@ologistics.com
```

---

## 📈 Escalabilidad

### Configuración Actual

- **Intervalo de procesamiento:** 30 segundos
- **Correos por ciclo:** 10
- **Reintentos máximos:** 3
- **Delay entre reintentos:** 60 segundos

### Ajustes para Mayor Volumen

```env
# Procesar cada 10 segundos
QUEUE_INTERVAL_MS=10000

# Procesar 50 correos por ciclo
BATCH_SIZE=50

# Aumentar reintentos
MAX_RETRIES=5
```

### Múltiples Instancias

Para escalar horizontalmente:

1. **Usar lock de base de datos:**
```sql
-- Agregar columna locked_at
ALTER TABLE correspondence_outbox 
ADD COLUMN locked_at TIMESTAMPTZ;

-- Al procesar, hacer lock optimista
UPDATE correspondence_outbox
SET status = 'processing', locked_at = NOW()
WHERE id = $1 
  AND status = 'queued' 
  AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '5 minutes');
```

2. **Desplegar múltiples instancias:**
```bash
docker-compose up -d --scale smtp-service=3
```

---

## 🔍 Monitoreo

### Métricas Clave

1. **Correos en cola:** `SELECT COUNT(*) FROM correspondence_outbox WHERE status = 'queued'`
2. **Correos enviados hoy:** `SELECT COUNT(*) FROM correspondence_outbox WHERE status = 'sent' AND sent_at > CURRENT_DATE`
3. **Tasa de error:** `SELECT COUNT(*) FROM correspondence_outbox WHERE status = 'failed' AND created_at > NOW() - INTERVAL '1 hour'`
4. **Tiempo promedio de envío:** `SELECT AVG(sent_at - created_at) FROM correspondence_outbox WHERE status = 'sent'`

### Endpoint de Estadísticas

```bash
curl http://localhost:3100/stats
```

**Respuesta:**
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

---

## 🚨 Manejo de Errores

### Tipos de Errores

1. **Error de conexión SMTP:**
   - Causa: SMTP server no disponible
   - Acción: Reintentar después de 60 segundos
   - Log: `[ERROR] Error al enviar correo {"error":"Connection timeout"}`

2. **Error de formato:**
   - Causa: Email inválido, subject vacío, etc.
   - Acción: Marcar como `failed` sin reintentar
   - Log: `[ERROR] Validación fallida {"error":"Invalid email format"}`

3. **Error de base de datos:**
   - Causa: Supabase no disponible
   - Acción: Reintentar operación
   - Log: `[ERROR] Error de base de datos {"error":"Connection refused"}`

### Estrategia de Reintentos

```javascript
const RETRY_DELAYS = [
  60000,    // 1 minuto
  300000,   // 5 minutos
  900000    // 15 minutos
];

async function scheduleRetry(emailId, retryCount) {
  const delay = RETRY_DELAYS[retryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
  
  setTimeout(async () => {
    await supabase
      .from('correspondence_outbox')
      .update({ status: 'queued' })
      .eq('id', emailId);
  }, delay);
}
```

---

## 📝 Logs

### Niveles de Log

- `INFO`: Operaciones normales (envíos exitosos, inicio de servicio)
- `WARN`: Situaciones anormales pero recuperables (reintentos)
- `ERROR`: Errores que requieren atención (fallos de envío)

### Ejemplos de Logs

**Inicio del servicio:**
```
[INFO] Servicio SMTP Local iniciado en puerto 3100
[INFO] Configuración SMTP: {"host":"10.48.19.10","port":25,"secure":false}
[INFO] Procesador de cola iniciado (intervalo: 30000ms)
```

**Envío exitoso:**
```
[INFO] Solicitud de envío recibida {"to":["cliente@example.com"],"eventType":"reservation_confirmation"}
[INFO] Registro creado en outbox {"id":"abc-123"}
[INFO] Estado: queued {"outboxId":"abc-123"}
[INFO] Correo enviado exitosamente por SMTP {"messageId":"<msg@smtp>","duration":"245ms"}
[INFO] Estado: sent {"outboxId":"abc-123","messageId":"<msg@smtp>"}
```

**Error de envío:**
```
[ERROR] Error al enviar correo {"outboxId":"def-456","error":"Connection timeout"}
[INFO] Estado: failed {"outboxId":"def-456","retryCount":1}
[WARN] Programando reintento {"outboxId":"def-456","delay":"60000ms"}
```

---

## 🔄 Comparación: Antes vs Ahora

### ❌ Arquitectura Anterior (Eliminada)

```
Frontend → Supabase Edge Function (smtp-send) → HTTP Relay → SMTP Interno
```

**Problemas:**
- ❌ Dependencia de Edge Functions (serverless)
- ❌ Necesitaba HTTP Relay público con HTTPS
- ❌ Secrets en Supabase (SMTP_RELAY_URL, SMTP_RELAY_SECRET)
- ❌ Latencia adicional (múltiples saltos de red)
- ❌ Complejidad de configuración

---

### ✅ Arquitectura Actual (Implementada)

```
Frontend → Supabase DB (correspondence_outbox) → Servicio SMTP Local → SMTP Interno
```

**Ventajas:**
- ✅ Sin dependencias externas
- ✅ Conexión directa a SMTP interno (10.48.19.10:25)
- ✅ Configuración simple (.env local)
- ✅ Menor latencia
- ✅ Mayor control y visibilidad
- ✅ Sin costos adicionales

---

## 🎯 Decisiones de Diseño

### 1. ¿Por qué Node.js y no .NET?

**Razones:**
- ✅ Nodemailer es maduro y confiable
- ✅ Fácil despliegue con Docker
- ✅ Menor consumo de recursos
- ✅ Ecosistema amplio para SMTP

### 2. ¿Por qué procesamiento de cola y no eventos en tiempo real?

**Razones:**
- ✅ Más robusto ante fallos
- ✅ Control de tasa de envío
- ✅ Reintentos automáticos
- ✅ No depende de webhooks/triggers

### 3. ¿Por qué no usar Supabase Realtime?

**Razones:**
- ✅ Polling es más simple y predecible
- ✅ No requiere configuración adicional
- ✅ Menor acoplamiento con Supabase
- ✅ Más fácil de debuggear

---

## 📚 Referencias Técnicas

### Nodemailer
- Documentación: https://nodemailer.com/
- SMTP Transport: https://nodemailer.com/smtp/

### Supabase
- JavaScript Client: https://supabase.com/docs/reference/javascript
- Service Role Key: https://supabase.com/docs/guides/api#the-service_role-key

### Docker
- Dockerfile Best Practices: https://docs.docker.com/develop/dev-best-practices/
- Docker Compose: https://docs.docker.com/compose/

---

**Versión:** 1.0.0  
**Última actualización:** 2024-01-15  
**Arquitectura:** SMTP Local (sin dependencias externas)