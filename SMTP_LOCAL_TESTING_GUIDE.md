# 🧪 Guía de Pruebas - Sistema SMTP Local

## 📋 Índice
1. [Arquitectura del Flujo](#arquitectura-del-flujo)
2. [Configuración Inicial](#configuración-inicial)
3. [Pruebas Paso a Paso](#pruebas-paso-a-paso)
4. [Validación de Endpoints](#validación-de-endpoints)
5. [Troubleshooting](#troubleshooting)

---

## 🏗️ Arquitectura del Flujo

### Flujo Completo de Envío de Correos

```
┌─────────────────────────────────────────────────────────────────────┐
│                         EVENTO DEL SISTEMA                          │
│                    (ej: reservation_created)                        │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│              SUPABASE EDGE FUNCTION                                 │
│         correspondence-process-event                                │
│                                                                     │
│  1. Recibe evento                                                   │
│  2. Evalúa reglas de correspondencia                                │
│  3. Genera contenido del correo                                     │
│  4. Inserta en correspondence_outbox                                │
│     - status: 'queued'                                              │
│     - to_emails, subject, body_html                                 │
│  5. Retorna { success: true, queued: true }                         │
│                                                                     │
│  ⚠️  NO ENVÍA CORREOS - SOLO ENCOLA                                │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   SUPABASE DATABASE                                 │
│              public.correspondence_outbox                           │
│                                                                     │
│  Registro creado:                                                   │
│  - id: uuid                                                         │
│  - org_id: uuid                                                     │
│  - status: 'queued'                                                 │
│  - to_emails: ['user@example.com']                                  │
│  - subject: 'Nueva Reserva Creada'                                  │
│  - body_html: '<html>...</html>'                                    │
│  - created_at: timestamp                                            │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 │ (Polling cada 10s)
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│              MICROSERVICIO LOCAL                                    │
│            smtp-local-service                                       │
│                                                                     │
│  QUEUE WORKER (src/queue-worker.js):                                │
│  1. Consulta correspondence_outbox cada 10s                         │
│     WHERE status = 'queued' AND org_id = SUPABASE_ORG_ID            │
│  2. Por cada registro:                                              │
│     a) Conecta a SMTP: 10.48.19.10:25                               │
│        - secure: false                                              │
│        - ignoreTLS: true                                            │
│        - sin autenticación                                          │
│     b) Envía correo con nodemailer                                  │
│     c) Actualiza registro:                                          │
│        - status: 'sent'                                             │
│        - sent_at: timestamp                                         │
│        - provider_message_id: messageId                             │
│  3. Si falla:                                                       │
│     - status: 'failed'                                              │
│     - error: mensaje de error                                       │
│                                                                     │
│  ENDPOINTS DISPONIBLES:                                             │
│  - GET  /health                                                     │
│  - GET  /stats                                                      │
│  - POST /api/email/send-test                                        │
│  - POST /process-queue                                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## ⚙️ Configuración Inicial

### 1. Variables de Entorno - Backend Local

**Archivo:** `smtp-local-service/.env`

```env
# Supabase Configuration
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
SUPABASE_ORG_ID=tu-org-id-uuid

# SMTP Configuration (Red Corporativa)
SMTP_HOST=10.48.19.10
SMTP_PORT=25
SMTP_SECURE=false
SMTP_IGNORE_TLS=true
SMTP_REQUIRE_TLS=false
SMTP_FROM=no-reply-sro@ologistics.com

# Queue Worker Configuration
QUEUE_POLL_INTERVAL_MS=10000
QUEUE_BATCH_SIZE=10

# Server Configuration
PORT=3100
NODE_ENV=development
```

### 2. Variables de Entorno - Frontend

**Archivo:** `.env` (raíz del proyecto)

```env
# Modo SMTP (local | supabase)
VITE_SMTP_MODE=local

# URL del microservicio local
VITE_SMTP_LOCAL_URL=http://localhost:3100

# Supabase (ya configuradas)
VITE_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
```

### 3. Iniciar Servicios

#### Terminal 1: Backend SMTP Local

```bash
cd smtp-local-service

# Instalar dependencias (solo primera vez)
npm install

# Iniciar servidor con worker de cola
npm run dev
```

**Salida esperada:**
```
[INFO] ============================================================
[INFO] SERVIDOR SMTP LOCAL - CONFIGURACIÓN
[INFO] ============================================================
[INFO] SMTP_HOST: 10.48.19.10
[INFO] SMTP_PORT: 25
[INFO] SMTP_SECURE: false
[INFO] SMTP_IGNORE_TLS: true
[INFO] FROM_EMAIL: no-reply-sro@ologistics.com
[INFO] ORG_ID: 123e4567-e89b-12d3-a456-426614174000
[INFO] ============================================================
[INFO] Servicio SMTP local iniciado en puerto 3100
[INFO] Health check: http://localhost:3100/health
[INFO] Stats: http://localhost:3100/stats
[QueueWorker] Worker de cola iniciado
[QueueWorker] Intervalo de polling: 10000ms
[QueueWorker] Tamaño de lote: 10
```

#### Terminal 2: Frontend

```bash
# En la raíz del proyecto
npm run dev
```

**Salida esperada:**
```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
```

---

## 🧪 Pruebas Paso a Paso

### Prueba 1: Validar Health Check

**Comando:**
```bash
curl http://localhost:3100/health
```

**Respuesta esperada:**
```json
{
  "status": "ok",
  "service": "smtp-local-service",
  "timestamp": "2025-01-10T15:30:00.000Z",
  "smtp": {
    "host": "10.48.19.10",
    "port": 25,
    "from": "no-reply-sro@ologistics.com"
  },
  "supabase": {
    "connected": true,
    "orgId": "123e4567-e89b-12d3-a456-426614174000"
  },
  "worker": {
    "running": true,
    "interval": 10000
  }
}
```

---

### Prueba 2: Envío Manual de Prueba

**Comando:**
```bash
curl -X POST http://localhost:3100/api/email/send-test \
  -H "Content-Type: application/json" \
  -d '{
    "to": "tu-correo@ejemplo.com",
    "subject": "Prueba SMTP Local",
    "body": "<h1>Test</h1><p>Correo de prueba desde smtp-local-service</p>"
  }'
```

**Respuesta esperada (éxito):**
```json
{
  "success": true,
  "message": "Correo de prueba enviado exitosamente",
  "data": {
    "outboxId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "messageId": "<1234567890.123456@localhost>",
    "sentAt": "2025-01-10T15:35:00.000Z",
    "to": ["tu-correo@ejemplo.com"],
    "subject": "Prueba SMTP Local",
    "smtp": {
      "host": "10.48.19.10",
      "port": 25
    }
  }
}
```

**Logs del backend:**
```
[INFO] Prueba manual de envío iniciada { to: 'tu-correo@ejemplo.com' }
[INFO] Iniciando envío de correo { to: 'tu-correo@ejemplo.com', eventType: 'manual_test' }
[INFO] Estado: queued { outboxId: 'a1b2c3d4-...' }
[INFO] Correo enviado exitosamente por SMTP { outboxId: 'a1b2c3d4-...', messageId: '<...>', smtp: '10.48.19.10:25' }
[INFO] Estado: sent { outboxId: 'a1b2c3d4-...', messageId: '<...>' }
[INFO] Prueba manual exitosa
```

**Validar en Supabase:**
```sql
SELECT id, status, to_emails, subject, sent_at, provider_message_id
FROM correspondence_outbox
WHERE event_type = 'manual_test'
ORDER BY created_at DESC
LIMIT 1;
```

**Resultado esperado:**
- `status = 'sent'`
- `sent_at` tiene timestamp
- `provider_message_id` tiene valor

---

### Prueba 3: Disparar Evento `reservation_created`

#### a) Crear una Reserva en el Sistema

1. Abrir http://localhost:5173
2. Ir a **Calendario**
3. Crear una nueva reserva:
   - Cliente: Seleccionar cliente existente
   - Fecha/Hora: Cualquier slot disponible
   - Andén: Seleccionar andén
   - Tipo de Carga: Seleccionar tipo
   - Guardar

#### b) Verificar Logs de Supabase Edge Function

**En Supabase Dashboard:**
1. Ir a **Edge Functions** → **correspondence-process-event**
2. Ver logs recientes

**Log esperado:**
```json
{
  "level": "info",
  "message": "[correspondence-process-event][QUEUED_ONLY]",
  "data": {
    "ruleId": "rule-uuid-...",
    "outboxId": "outbox-uuid-...",
    "toCount": 2,
    "subject": "Nueva Reserva Creada - #12345",
    "message": "Correo encolado. Será procesado por smtp-local-service worker."
  }
}
```

**⚠️ NO debe aparecer:**
- ❌ Errores de conexión SMTP
- ❌ "failed to lookup address information"
- ❌ Intentos de envío desde Edge Function

#### c) Verificar Registro `queued` en `correspondence_outbox`

**Query SQL:**
```sql
SELECT 
  id,
  org_id,
  status,
  event_type,
  to_emails,
  subject,
  created_at,
  sent_at,
  error
FROM correspondence_outbox
WHERE org_id = 'tu-org-id-uuid'
  AND event_type = 'reservation_created'
ORDER BY created_at DESC
LIMIT 5;
```

**Resultado esperado:**
```
id                                   | status  | to_emails                          | subject                        | created_at           | sent_at | error
-------------------------------------|---------|------------------------------------|---------------------------------|----------------------|---------|------
a1b2c3d4-e5f6-7890-abcd-ef1234567890 | queued  | ["user1@example.com","user2@..."]  | Nueva Reserva Creada - #12345   | 2025-01-10 15:40:00  | NULL    | NULL
```

**Campos importantes:**
- ✅ `status = 'queued'` (NO 'sent' ni 'failed')
- ✅ `to_emails` tiene array de destinatarios
- ✅ `subject` tiene contenido generado
- ✅ `sent_at` es NULL (aún no enviado)
- ✅ `error` es NULL

#### d) Esperar Procesamiento del Worker (máx 10 segundos)

**Logs del backend (smtp-local-service):**
```
[QueueWorker] Iniciando ciclo de procesamiento...
[QueueWorker] Registros pendientes encontrados { count: 1 }
[INFO] Procesando registro existente de outbox { outboxId: 'a1b2c3d4-...', to: 'user1@example.com' }
[INFO] Correo enviado exitosamente por SMTP { outboxId: 'a1b2c3d4-...', messageId: '<...@...>', smtp: '10.48.19.10:25' }
[INFO] Estado: sent { outboxId: 'a1b2c3d4-...', messageId: '<...>' }
[QueueWorker] Registros procesados exitosamente { count: 1 }
```

#### e) Verificar Registro Actualizado a `sent`

**Query SQL:**
```sql
SELECT 
  id,
  status,
  to_emails,
  subject,
  sent_at,
  provider_message_id,
  error
FROM correspondence_outbox
WHERE id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
```

**Resultado esperado:**
```
id                                   | status | to_emails                          | subject                        | sent_at              | provider_message_id        | error
-------------------------------------|--------|------------------------------------|---------------------------------|----------------------|----------------------------|------
a1b2c3d4-e5f6-7890-abcd-ef1234567890 | sent   | ["user1@example.com","user2@..."]  | Nueva Reserva Creada - #12345   | 2025-01-10 15:40:08  | <1234567890.123@localhost> | NULL
```

**Campos actualizados:**
- ✅ `status = 'sent'` (cambió de 'queued')
- ✅ `sent_at` tiene timestamp (8 segundos después de created_at)
- ✅ `provider_message_id` tiene ID del mensaje SMTP
- ✅ `error` sigue siendo NULL

---

### Prueba 4: Forzar Procesamiento Manual de Cola

**Comando:**
```bash
curl -X POST http://localhost:3100/process-queue \
  -H "Content-Type: application/json" \
  -d '{"limit": 5}'
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "Cola procesada exitosamente",
  "data": {
    "processed": 2,
    "sent": 2,
    "failed": 0,
    "records": [
      {
        "outboxId": "uuid-1",
        "status": "sent",
        "messageId": "<...@...>",
        "to": ["user1@example.com"]
      },
      {
        "outboxId": "uuid-2",
        "status": "sent",
        "messageId": "<...@...>",
        "to": ["user2@example.com"]
      }
    ]
  }
}
```

**Uso:**
- Útil para procesar inmediatamente sin esperar el polling de 10s
- Parámetro `limit` opcional (default: 10)

---

### Prueba 5: Obtener Estadísticas del Worker

**Comando:**
```bash
curl http://localhost:3100/stats
```

**Respuesta esperada:**
```json
{
  "success": true,
  "data": {
    "worker": {
      "running": true,
      "interval": 10000,
      "lastRun": "2025-01-10T15:45:00.000Z"
    },
    "queue": {
      "pending": 0,
      "processing": 0
    },
    "smtp": {
      "host": "10.48.19.10",
      "port": 25,
      "from": "no-reply-sro@ologistics.com"
    },
    "supabase": {
      "connected": true,
      "orgId": "123e4567-e89b-12d3-a456-426614174000"
    }
  }
}
```

---

## 🔍 Validación de Endpoints

### Resumen de Endpoints Disponibles

| Método | Endpoint | Descripción | Autenticación |
|--------|----------|-------------|---------------|
| GET | `/health` | Health check del servicio | No |
| GET | `/stats` | Estadísticas del worker y cola | No |
| POST | `/api/email/send-test` | Envío manual de prueba | No |
| POST | `/process-queue` | Forzar procesamiento de cola | No |

### Ejemplos de Uso

#### 1. Health Check
```bash
curl http://localhost:3100/health
```

#### 2. Estadísticas
```bash
curl http://localhost:3100/stats
```

#### 3. Envío de Prueba
```bash
curl -X POST http://localhost:3100/api/email/send-test \
  -H "Content-Type: application/json" \
  -d '{
    "to": "test@example.com",
    "subject": "Test",
    "body": "<p>Test email</p>"
  }'
```

#### 4. Procesar Cola Manualmente
```bash
# Procesar hasta 10 registros (default)
curl -X POST http://localhost:3100/process-queue

# Procesar hasta 5 registros
curl -X POST http://localhost:3100/process-queue \
  -H "Content-Type: application/json" \
  -d '{"limit": 5}'
```

---

## 🐛 Troubleshooting

### Problema 1: Worker no procesa la cola

**Síntomas:**
- Registros quedan en `status = 'queued'` indefinidamente
- No aparecen logs de procesamiento

**Verificar:**
```bash
# 1. Verificar que el worker está corriendo
curl http://localhost:3100/health | jq '.worker'

# Esperado: { "running": true, "interval": 10000 }
```

**Soluciones:**
1. Reiniciar el servicio: `npm run dev`
2. Verificar logs del servidor para errores
3. Verificar conectividad a Supabase:
   ```bash
   curl http://localhost:3100/health | jq '.supabase'
   # Esperado: { "connected": true, "orgId": "..." }
   ```

---

### Problema 2: Error "failed to lookup address information"

**Síntomas:**
- Registros en `status = 'failed'`
- Error: "failed to lookup address information: Name or service not known"

**Causa:**
- Supabase Edge Function está intentando enviar correos (no debería)

**Verificar:**
```sql
SELECT id, status, error, event_type
FROM correspondence_outbox
WHERE error LIKE '%failed to lookup%'
ORDER BY created_at DESC
LIMIT 5;
```

**Solución:**
1. Verificar que `correspondence-process-event` NO llama a `smtp-send`
2. Verificar logs de Edge Functions en Supabase Dashboard
3. Confirmar que el log dice `[QUEUED_ONLY]` y no intenta enviar

---

### Problema 3: Correos no llegan a destinatarios

**Síntomas:**
- `status = 'sent'` en outbox
- `provider_message_id` tiene valor
- Pero correos no llegan

**Verificar:**
1. **Logs del backend:**
   ```
   [INFO] Correo enviado exitosamente por SMTP { smtp: '10.48.19.10:25' }
   ```

2. **Conectividad SMTP:**
   ```bash
   telnet 10.48.19.10 25
   # Esperado: Conexión exitosa
   ```

3. **Logs del servidor SMTP (10.48.19.10):**
   - Verificar si el correo fue recibido
   - Verificar si hay errores de relay/entrega

4. **Carpeta de spam:**
   - Verificar bandeja de spam del destinatario

---

### Problema 4: Error de conexión a Supabase

**Síntomas:**
- Worker no puede leer `correspondence_outbox`
- Error: "Failed to fetch from Supabase"

**Verificar:**
```bash
# 1. Variables de entorno
cat smtp-local-service/.env | grep SUPABASE

# 2. Conectividad
curl http://localhost:3100/health | jq '.supabase'
```

**Solución:**
1. Verificar `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `.env`
2. Verificar que el service role key tiene permisos de lectura/escritura en `correspondence_outbox`
3. Verificar RLS policies:
   ```sql
   SELECT * FROM pg_policies 
   WHERE tablename = 'correspondence_outbox';
   ```

---

### Problema 5: Frontend no usa backend local

**Síntomas:**
- Botón "Enviar Prueba" no funciona
- No aparece banner amarillo de modo local

**Verificar:**
```bash
# 1. Variable de entorno
cat .env | grep VITE_SMTP_MODE

# Esperado: VITE_SMTP_MODE=local
```

**Solución:**
1. Editar `.env` en la raíz del proyecto:
   ```env
   VITE_SMTP_MODE=local
   VITE_SMTP_LOCAL_URL=http://localhost:3100
   ```

2. Reiniciar Vite: `npm run dev`

3. Verificar en consola del navegador:
   ```javascript
   [smtpLocalService] Configuración: { SMTP_MODE: 'local', ... }
   ```

---

## ✅ Checklist de Validación Completa

### Configuración
- [ ] Variables de entorno configuradas en `smtp-local-service/.env`
- [ ] Variables de entorno configuradas en `.env` (raíz)
- [ ] `VITE_SMTP_MODE=local` en `.env`
- [ ] Backend corriendo en puerto 3100
- [ ] Frontend corriendo en puerto 5173

### Endpoints
- [ ] `/health` responde con `status: "ok"`
- [ ] `/stats` muestra worker corriendo
- [ ] `/api/email/send-test` envía correo exitosamente
- [ ] `/process-queue` procesa cola manualmente

### Flujo Completo
- [ ] Crear reserva dispara evento
- [ ] Edge Function crea registro `queued` (NO envía)
- [ ] Worker local procesa registro en <10s
- [ ] Registro actualizado a `sent` con `messageId`
- [ ] Correo llega a destinatario

### Logs
- [ ] Edge Function muestra `[QUEUED_ONLY]`
- [ ] Backend muestra `[QueueWorker] Registros procesados`
- [ ] Frontend muestra `[SmtpServiceTab] using SMTP_LOCAL_URL`
- [ ] NO aparecen errores de DNS/SMTP en Edge Functions

### Supabase
- [ ] `correspondence_outbox` tiene registros `queued`
- [ ] Registros se actualizan a `sent` automáticamente
- [ ] NO hay registros con error "failed to lookup"
- [ ] `sent_at` y `provider_message_id` se llenan correctamente

---

## 📊 Queries SQL Útiles

### Ver últimos correos encolados
```sql
SELECT 
  id,
  status,
  event_type,
  to_emails,
  subject,
  created_at,
  sent_at,
  error
FROM correspondence_outbox
WHERE org_id = 'tu-org-id-uuid'
  AND status = 'queued'
ORDER BY created_at DESC
LIMIT 10;
```

### Ver últimos correos enviados
```sql
SELECT 
  id,
  status,
  event_type,
  to_emails,
  subject,
  sent_at,
  provider_message_id
FROM correspondence_outbox
WHERE org_id = 'tu-org-id-uuid'
  AND status = 'sent'
ORDER BY sent_at DESC
LIMIT 10;
```

### Ver correos fallidos
```sql
SELECT 
  id,
  status,
  event_type,
  to_emails,
  subject,
  error,
  created_at
FROM correspondence_outbox
WHERE org_id = 'tu-org-id-uuid'
  AND status = 'failed'
ORDER BY created_at DESC
LIMIT 10;
```

### Estadísticas por estado
```sql
SELECT 
  status,
  COUNT(*) as count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM correspondence_outbox
WHERE org_id = 'tu-org-id-uuid'
GROUP BY status
ORDER BY count DESC;
```

### Tiempo promedio de procesamiento
```sql
SELECT 
  AVG(EXTRACT(EPOCH FROM (sent_at - created_at))) as avg_seconds,
  MIN(EXTRACT(EPOCH FROM (sent_at - created_at))) as min_seconds,
  MAX(EXTRACT(EPOCH FROM (sent_at - created_at))) as max_seconds
FROM correspondence_outbox
WHERE org_id = 'tu-org-id-uuid'
  AND status = 'sent'
  AND sent_at IS NOT NULL;
```

---

## 🎯 Confirmación Final

### ✅ Supabase NUNCA intenta conectar SMTP

**Evidencia:**
1. Edge Function `correspondence-process-event` solo encola
2. Logs muestran `[QUEUED_ONLY]`
3. NO hay errores de DNS/SMTP en Edge Functions
4. Registros quedan en `status = 'queued'` hasta que el worker los procesa

### ✅ Worker Local procesa cola correctamente

**Evidencia:**
1. Logs muestran `[QueueWorker] Registros procesados`
2. Registros se actualizan de `queued` a `sent`
3. `sent_at` y `provider_message_id` se llenan
4. Correos llegan a destinatarios

### ✅ Frontend usa backend local exclusivamente

**Evidencia:**
1. Banner amarillo visible en modo local
2. Logs muestran `using SMTP_LOCAL_URL = http://localhost:3100`
3. DevTools/Network muestra request a `localhost:3100`
4. NO aparece request a `supabase.co/functions/v1/smtp-send`

---

## 📞 Soporte

Si encuentras problemas no cubiertos en esta guía:

1. Verificar logs del backend: `smtp-local-service/logs/`
2. Verificar logs de Supabase Edge Functions
3. Ejecutar queries SQL de diagnóstico
4. Revisar configuración de red corporativa (firewall, DNS)

---

**Última actualización:** 2025-01-10
**Versión:** 1.0.0
