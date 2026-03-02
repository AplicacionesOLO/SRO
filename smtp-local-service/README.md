# Servicio SMTP Local

Servicio Node.js para envío de correos electrónicos usando SMTP interno corporativo (`10.48.19.10:25`).

## 🎯 Características

- ✅ **Conexión directa a SMTP interno** (`10.48.19.10:25`)
- ✅ **Sin autenticación ni TLS/SSL**
- ✅ **Integración completa con `correspondence_outbox`**
- ✅ **Gestión de estados**: `queued` → `sent` / `failed`
- ✅ **Cola de procesamiento** para reintentos
- ✅ **Logs detallados** de todas las operaciones
- ✅ **Estadísticas** de envíos

---

## 📋 Requisitos

- Node.js 18+
- Acceso a red corporativa (10.48.19.10:25)
- Credenciales de Supabase (URL + Service Role Key)

---

## 🚀 Instalación

### 1. Instalar dependencias

```bash
cd smtp-local-service
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
nano .env
```

**Variables requeridas:**

```env
# SMTP Interno
SMTP_HOST=10.48.19.10
SMTP_PORT=25
SMTP_SECURE=false
SMTP_FROM=no-reply-sro@ologistics.com

# Servidor
PORT=3100
NODE_ENV=production

# Supabase
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
```

### 3. Iniciar servicio

```bash
# Desarrollo
npm run dev

# Producción
npm start
```

---

## 🐳 Despliegue con Docker

### Construir imagen

```bash
docker build -t smtp-local-service:latest .
```

### Ejecutar contenedor

```bash
docker run -d \
  --name smtp-service \
  -p 3100:3100 \
  --env-file .env \
  --restart unless-stopped \
  smtp-local-service:latest
```

### Ver logs

```bash
docker logs -f smtp-service
```

---

## 📡 Endpoints

### `GET /health`

Health check del servicio.

**Respuesta:**
```json
{
  "status": "ok",
  "service": "smtp-local-service",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "smtp": {
    "host": "10.48.19.10",
    "port": 25,
    "from": "no-reply-sro@ologistics.com"
  }
}
```

---

### `GET /verify`

Verifica la conexión al servidor SMTP.

**Respuesta exitosa:**
```json
{
  "success": true,
  "message": "Conexión SMTP OK",
  "smtp": "10.48.19.10:25"
}
```

---

### `POST /send-email`

Envía un correo electrónico.

**Flujo completo:**
1. Valida datos de entrada
2. Crea registro en `correspondence_outbox` con `status='queued'`
3. Intenta envío SMTP a `10.48.19.10:25`
4. Si éxito: actualiza a `status='sent'` con `sent_at` y `provider_message_id`
5. Si falla: actualiza a `status='failed'` con mensaje de error

**Body:**
```json
{
  "to": "destinatario@example.com",
  "cc": "copia@example.com",
  "bcc": "copia-oculta@example.com",
  "subject": "Asunto del correo",
  "body": "<h1>Contenido HTML</h1><p>Texto del correo</p>",
  "eventType": "reservation_confirmation",
  "reservationId": "uuid-reserva",
  "ruleId": "uuid-regla",
  "actorUserId": "uuid-usuario-actor",
  "senderUserId": "uuid-usuario-remitente"
}
```

**Campos requeridos:**
- `to` (string o array)
- `subject` (string)
- `body` (string, HTML o texto)

**Campos opcionales:**
- `cc` (string o array)
- `bcc` (string o array)
- `eventType` (string, default: `'manual_send'`)
- `reservationId` (string)
- `ruleId` (string)
- `actorUserId` (string)
- `senderUserId` (string)

**Respuesta exitosa:**
```json
{
  "success": true,
  "outboxId": "uuid-registro-outbox",
  "messageId": "<mensaje@smtp>",
  "duration": 234,
  "status": "sent",
  "requestId": "req_1234567890_abc123"
}
```

**Respuesta fallida:**
```json
{
  "success": false,
  "outboxId": "uuid-registro-outbox",
  "error": "Connection timeout",
  "duration": 5000,
  "status": "failed",
  "requestId": "req_1234567890_abc123"
}
```

---

### `POST /process-queue`

Procesa la cola de correos pendientes (registros con `status='queued'`).

**Body:**
```json
{
  "limit": 10
}
```

**Respuesta:**
```json
{
  "success": true,
  "processed": 5,
  "successCount": 4,
  "failedCount": 1,
  "results": [
    {
      "outboxId": "uuid-1",
      "success": true,
      "error": null
    },
    {
      "outboxId": "uuid-2",
      "success": false,
      "error": "Connection timeout"
    }
  ],
  "requestId": "queue_1234567890_abc123"
}
```

---

### `POST /retry/:outboxId`

Reintenta el envío de un correo fallido.

**Ejemplo:**
```bash
curl -X POST http://localhost:3100/retry/uuid-del-registro
```

**Respuesta:**
```json
{
  "success": true,
  "outboxId": "uuid-del-registro",
  "messageId": "<mensaje@smtp>",
  "duration": 234,
  "requestId": "retry_1234567890_abc123"
}
```

---

### `GET /stats`

Obtiene estadísticas de `correspondence_outbox`.

**Respuesta:**
```json
{
  "success": true,
  "stats": {
    "queued": 5,
    "sent": 120,
    "failed": 3,
    "total": 128
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## 🧪 Pruebas

### Prueba manual con curl

```bash
# Enviar correo de prueba
curl -X POST http://localhost:3100/send-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "test@example.com",
    "subject": "Prueba SMTP",
    "body": "<h1>Correo de prueba</h1><p>Este es un correo de prueba desde el servicio SMTP local.</p>",
    "eventType": "smtp_test"
  }'
```

### Script de prueba automatizado

```bash
npm test
```

---

## 📊 Estructura de `correspondence_outbox`

El servicio mantiene compatibilidad total con la estructura actual:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid | ID único del registro |
| `event_type` | string | Tipo de evento (ej: `'reservation_confirmation'`) |
| `sender_email` | string | Email del remitente (fijo: `no-reply-sro@ologistics.com`) |
| `recipient_email` | string | Destinatario principal |
| `to_emails` | array | Array de todos los destinatarios |
| `cc_emails` | array | Destinatarios en copia |
| `bcc_emails` | array | Destinatarios en copia oculta |
| `subject` | string | Asunto del correo |
| `body` | string | Cuerpo del correo (HTML) |
| `status` | string | Estado: `'queued'`, `'sent'`, `'failed'` |
| `sent_at` | timestamp | Fecha/hora de envío exitoso |
| `provider_message_id` | string | ID del mensaje del servidor SMTP |
| `error` | string | Mensaje de error (si falla) |
| `reservation_id` | uuid | ID de reserva relacionada |
| `rule_id` | uuid | ID de regla de correspondencia |
| `actor_user_id` | uuid | ID del usuario que ejecuta la acción |
| `sender_user_id` | uuid | ID del usuario remitente |
| `created_at` | timestamp | Fecha/hora de creación |

---

## 🔄 Flujo de Envío

```
┌─────────────────────────────────────────────────────────────┐
│ 1. POST /send-email                                         │
│    { to, subject, body, eventType, ... }                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Validar datos de entrada                                 │
│    - to, subject, body requeridos                           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Crear registro en correspondence_outbox                  │
│    status = 'queued'                                        │
│    sender_email = 'no-reply-sro@ologistics.com'            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Intentar envío SMTP                                      │
│    Host: 10.48.19.10:25                                     │
│    Secure: false                                            │
│    ignoreTLS: true                                          │
│    Sin autenticación                                        │
└────────────────────┬────────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
         ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│ 5a. ÉXITO        │    │ 5b. FALLO        │
│                  │    │                  │
│ Actualizar:      │    │ Actualizar:      │
│ status='sent'    │    │ status='failed'  │
│ sent_at=now()    │    │ error=mensaje    │
│ provider_msg_id  │    │                  │
└──────────────────┘    └──────────────────┘
```

---

## 📝 Logs

El servicio genera logs detallados de todas las operaciones:

```
[2024-01-15T10:30:00.000Z] [INFO] Servidor SMTP local iniciado {"port":3100,"smtp":"10.48.19.10:25"}
[2024-01-15T10:30:15.123Z] [INFO] Solicitud de envío recibida {"to":"test@example.com","eventType":"smtp_test"}
[2024-01-15T10:30:15.234Z] [INFO] Registro creado en outbox {"id":"uuid-123","eventType":"smtp_test"}
[2024-01-15T10:30:15.345Z] [INFO] Estado: queued {"outboxId":"uuid-123"}
[2024-01-15T10:30:15.456Z] [INFO] Correo enviado exitosamente por SMTP {"outboxId":"uuid-123","messageId":"<msg@smtp>","duration":"333ms"}
[2024-01-15T10:30:15.567Z] [INFO] Estado: sent {"outboxId":"uuid-123","messageId":"<msg@smtp>"}
```

---

## ⚙️ Configuración Avanzada

### Timeouts

Puedes ajustar los timeouts en `.env`:

```env
SMTP_CONNECTION_TIMEOUT=10000  # 10 segundos
SMTP_SOCKET_TIMEOUT=10000      # 10 segundos
SMTP_GREETING_TIMEOUT=5000     # 5 segundos
```

### Nivel de logs

```env
LOG_LEVEL=info  # debug, info, warn, error
```

---

## 🔧 Troubleshooting

### Error: "Connection timeout"

**Causa:** No se puede conectar a `10.48.19.10:25`

**Solución:**
1. Verificar que el servidor esté en la misma red que el SMTP
2. Verificar firewall: `telnet 10.48.19.10 25`
3. Revisar logs del servidor SMTP

### Error: "ECONNREFUSED"

**Causa:** El servidor SMTP rechaza la conexión

**Solución:**
1. Verificar que el puerto 25 esté abierto
2. Verificar que el servidor SMTP esté corriendo
3. Revisar configuración de firewall

### Error: "Invalid recipients"

**Causa:** Formato incorrecto de destinatarios

**Solución:**
- Usar string: `"user@example.com"`
- O array: `["user1@example.com", "user2@example.com"]`

---

## 📚 Integración con el Sistema

### Desde el frontend (React)

```typescript
// Enviar correo desde el sistema
async function sendNotificationEmail(reservationId: string) {
  const response = await fetch('http://localhost:3100/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: 'cliente@example.com',
      subject: 'Confirmación de Reserva',
      body: `<h1>Reserva Confirmada</h1><p>ID: ${reservationId}</p>`,
      eventType: 'reservation_confirmation',
      reservationId,
    }),
  });

  const result = await response.json();
  
  if (result.success) {
    console.log('Correo enviado:', result.messageId);
  } else {
    console.error('Error al enviar:', result.error);
  }
}
```

### Procesamiento automático de cola

Puedes configurar un cron job para procesar la cola periódicamente:

```bash
# Cada 5 minutos
*/5 * * * * curl -X POST http://localhost:3100/process-queue -H "Content-Type: application/json" -d '{"limit":50}'
```

---

## 🎯 Ventajas de esta Arquitectura

✅ **Sin dependencias externas**: No usa servicios cloud (SendGrid, SES, etc.)

✅ **Sin relay HTTP**: Conexión directa al SMTP interno

✅ **Trazabilidad completa**: Todos los envíos registrados en `correspondence_outbox`

✅ **Gestión de errores robusta**: Estados claros (`queued`, `sent`, `failed`)

✅ **Reintentos**: Posibilidad de reintentar envíos fallidos

✅ **Estadísticas**: Monitoreo de envíos en tiempo real

✅ **Logs detallados**: Auditoría completa de operaciones

---

## 📞 Soporte

Para problemas o dudas, revisar:
1. Logs del servicio: `docker logs smtp-service`
2. Estadísticas: `GET /stats`
3. Verificar conexión SMTP: `GET /verify`
