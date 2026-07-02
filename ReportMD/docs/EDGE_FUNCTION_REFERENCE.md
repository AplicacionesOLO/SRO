# EDGE FUNCTION REFERENCE — Suite OLO / App Hub Manager

> **Documentación Enterprise-Grade | Segunda Pasada**
> Basado exclusivamente en el código fuente (v1199)
> Cada Edge Function está documentada con su código real.

---

## ÍNDICE

| # | Edge Function | Propósito | JWT | Severidad |
|---|--------------|-----------|-----|-----------|
| 1 | `create-reservation` | Crear reserva con validación server-side | ✅ | CRÍTICO |
| 2 | `admin-users` | CRUD de usuarios | ❌ | CRÍTICO |
| 3 | `admin-user-access` | Gestión de accesos (países, warehouses) | ✅ | ALTO |
| 4 | `ask-sro-chat` | Chat IA con OpenAI + vector store | ✅ | ALTO |
| 5 | `correspondence-process-event` | Procesar reglas de correspondencia y enviar correos | ❌ | ALTO |
| 6 | `correspondence-dispatch-event` | Despachar eventos de correspondencia | ✅ | MEDIO |
| 7 | `smtp-send` | Enviar correos vía SMTP directo | ❌ | ALTO |
| 8 | `auto-mark-no-show` | Marcar reservas como No Show | ✅/🔑 | ALTO |
| 9 | `generate-client-pickup-blocks` | Generar bloques de Cliente Retira | ⚠️ | MEDIO |
| 10 | `sync-providers` | Sincronizar proveedores desde API externa | ❌ | MEDIO |
| 11 | `gmail-callback` | Callback OAuth de Gmail | ❌ | BAJO |
| 12 | `process-knowledge-document` | Procesar documento en OpenAI | ✅ | MEDIO |
| 13 | `reindex-knowledge-document` | Reindexar documento | ✅ | BAJO |
| 14 | `api-v1-reservations-get` | API pública: listar reservas | ✅ | ALTO |
| 15 | `api-v1-reservations-get-by-id` | API pública: obtener reserva | ✅ | MEDIO |
| 16 | `api-v1-reservations-patch-status` | API pública: cambiar estado | ✅ | ALTO |
| 17 | `api-v1-casetilla-ingresos` | API pública: listar ingresos | ✅ | MEDIO |
| 18 | `api-v1-casetilla-salidas` | API pública: listar salidas | ✅ | MEDIO |
| 19 | `api-v1-clients` | API pública: listar clientes | ✅ | BAJO |
| 20 | `api-v1-providers` | API pública: listar proveedores | ✅ | BAJO |
| 21 | `api-v1-docks` | API pública: listar docks | ✅ | BAJO |
| 22 | `api-v1-warehouses` | API pública: listar warehouses | ✅ | BAJO |
| 23 | `api-v1-reservation-statuses` | API pública: listar estados | ✅ | BAJO |
| 24 | `correspondence-retry-email` | Reintentar email fallido | ✅ | BAJO |
| 25 | `setup-*` (varias) | Setup inicial de buckets/permisos/RLS | ❌ | SETUP |

---

## 1. `create-reservation`

### Propósito
Crear una reserva con validaciones server-side: pertenencia a org, same-day cutoff, overlap.

### Endpoint
`POST /functions/v1/create-reservation`

### Quién la llama
- `calendarService.createReservation()` → `supabase.functions.invoke('create-reservation', { body })`

### Autenticación
- ✅ **JWT manual**: `supabase.auth.getUser(token)` con service role
- Si falla → 401

### Parámetros (body)
```typescript
{
  org_id: string;        // UUID, requerido
  dock_id: string;       // UUID, requerido
  start_datetime: string; // ISO, requerido
  client_id?: string;    // UUID, opcional (se resuelve si no)
  // ... resto de campos de reservation
}
```

### Response
- 201: `{ data: Reservation }`
- 400: `{ error: '...' }` (validación)
- 401: `{ error: 'Invalid or expired token' }`
- 403: `{ error: 'SAME_DAY_CUTOFF_BLOCKED', message: '...', cutoff_time: '...' }`
- 409: `{ error: 'OVERLAP_CONFLICT', message: '...' }`
- 500: `{ error: 'INSERT_ERROR', message: '...' }`

### Validaciones
1. `org_id`, `dock_id` → UUID regex
2. `start_datetime` → requerido
3. Usuario pertenece a org → `user_org_roles`
4. Resuelve `client_id` desde `client_docks` si no viene
5. Same-day cutoff → `client_rules` + `warehouses.business_end_time` + `timezone`
6. Overlap → constraint `reservations_no_overlap`

### Secrets utilizados
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### Tablas
- `user_org_roles` (verificación)
- `client_docks` (resolución client_id)
- `client_same_day_bypass_users` (bypass cutoff)
- `docks` → `warehouse_id`
- `warehouses` → `timezone`, `business_end_time`
- `client_rules` → `same_day_cutoff_*`
- `reservations` (INSERT + SELECT)

### Riesgos
- Bajo: validación JWT manual + verificación de org

---

## 2. `admin-users`

### Propósito
CRUD completo de usuarios: listar, crear, actualizar rol, remover de org.

### Endpoint
`POST /functions/v1/admin-users`

### Quién la llama
- `adminService.getOrgUsers()`, `createOrgUser()`, `updateOrgUser()`, `removeOrgUser()`

### Autenticación
- ❌ **SIN validación JWT**
- Usa `SUPABASE_SERVICE_ROLE_KEY` para crear cliente admin
- ⚠️ **VULNERABILIDAD CRÍTICA**: cualquiera puede invocarla

### Acciones
| action | Parámetros | Qué hace |
|--------|-----------|----------|
| `list` | `orgId` | Lista todos los usuarios de la org (paginación completa) |
| `create` | `orgId, email, password, roleId, full_name?` | Crea usuario en auth + profiles + user_org_roles |
| `update_role` | `orgId, userId, roleId, full_name?, email?` | Actualiza rol y perfil |
| `remove_from_org` | `orgId, userId` | Elimina user_org_roles + user_warehouse_access + user_providers |

### Secrets
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### Riesgos
- 🔴 **CRÍTICO**: Sin validación JWT. Cualquiera puede listar/crear/modificar/eliminar usuarios.
- Corrección necesaria: agregar `getUser(token)` al inicio

---

## 3. `admin-user-access`

### Propósito
Gestionar accesos de usuario: países, warehouses, aprobar/rechazar.

### Endpoint
`POST /functions/v1/admin-user-access`

### Autenticación
- ✅ **JWT manual**: `createClient(supabaseUrl, anonKey).auth.getUser()`
- Si falla → 401
- Luego usa service role para queries

### Acciones
| action | Qué hace |
|--------|----------|
| `get` | Obtiene countryIds, warehouseIds, restricted del usuario |
| `set_countries` | Reemplaza user_country_access |
| `set_warehouses` | Reemplaza user_warehouse_access |
| `approve` | profiles.access_status = 'approved' |
| `reject` | profiles.access_status = 'rejected' |
| `update_status` | profiles.access_status = status |

### Secrets
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` o `SUPABASE_PUBLISHABLE_KEY`

### Tablas
- `user_country_access`
- `user_warehouse_access`
- `profiles`

---

## 4. `ask-sro-chat`

### Propósito
Asistente IA que responde preguntas basado en documentos de conocimiento usando OpenAI Responses API con file_search en vector stores.

### Endpoint
`POST /functions/v1/ask-sro-chat`

### Autenticación
- ✅ **JWT manual**: `supabase.auth.getUser(token)`
- Verifica `chat.ask` en `role_permissions`
- Verifica niveles de acceso (`chat.answers.basic/extended/internal`)

### Parámetros
```typescript
{ question: string; session_id?: string }
```

### Response
```typescript
{
  answer: string;
  session_id: string;
  message_id: string;
  citations: Array<{ document_id, document_title, file_name }>;
  used_document_ids: string[];
  suggested_questions: string[];
  status: "success" | "denied" | "config_error"
}
```

### Flujo interno
1. Validar JWT → user
2. Cargar `user_org_roles` → org_id, role_id
3. Cargar `role_permissions` → verificar `chat.ask`
4. Determinar maxLevel de `chat.answers.*`
5. Cargar `knowledge_documents` activos con roles/permisos
6. Filtrar docs por `access_level` + `visibility_mode`
7. Crear/reusar `chat_sessions`
8. Cargar `chat_prompt_configs.system_prompt`
9. OpenAI Responses API con `file_search` tool (vector_store_ids)
10. Parsear sugerencias del marcador `===SUGERENCIAS===`
11. Guardar mensajes en `chat_messages`
12. Actualizar `chat_sessions.last_message_at`

### Secrets
- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### Modelo
- `gpt-4o-mini` (hardcodeado)
- `temperature: 0.3`
- `max_output_tokens: 1800`
- `max_num_results: 5` (file_search)

---

## 5. `correspondence-process-event`

### Propósito
Procesar reglas de correspondencia para un evento de reserva (creación o cambio de estado) y enviar correos.

### Endpoint
`POST /functions/v1/correspondence-process-event`

### Quién la llama
- `emailTriggerService` → `fetch(url, { Authorization: Bearer ${token} })`
- `correspondence-dispatch-event` → `fetch(url, { Authorization: Bearer ${jwt} })`

### Autenticación
- ❌ **SIN validación JWT manual** (usa service role directamente)
- Es llamada internamente por otras EFs/servicios

### Parámetros
```typescript
{
  orgId: string;
  reservationId: string;
  actorUserId: string;
  eventType: 'reservation_created' | 'reservation_status_changed';
  statusFromId: string | null;
  statusToId: string | null;
}
```

### Flujo
1. Cargar reserva completa (JOIN dock, status)
2. Cargar `correspondence_rules` activas para `event_type`
3. Filtrar por `warehouse_id` (específico + NULL = global)
4. Si `eventType === 'reservation_status_changed'`, filtrar por `status_from_id` / `status_to_id`
5. Para cada regla:
   - `require_dua`: skip si reserva sin DUA
   - `include_casetilla_photos`: buscar fotos en ingresos/salidas
   - `resolveRecipients`: resolver destinatarios
   - `processTemplate`: reemplazar variables
   - `normalizeEmailBody`: HTML seguro
   - INSERT en `correspondence_outbox` (status: 'queued')
   - Invocar `smtp-send` → actualizar status
   - Si `include_creator_recipient`: añadir creador como destinatario

### Template Variables
```
{{reservation_id}}, {{dock}}, {{start_datetime}}, {{end_datetime}},
{{start_time}}, {{end_time}}, {{warehouse_timezone}}, {{status}},
{{driver}}, {{truck_plate}}, {{dua}}, {{invoice}}, {{provider}},
{{created_by}}, {{actor}}, {{fotos}}, {{qr_image_url}}, {{qr_image}},
{{qr_card_image_url}}, {{qr_card_image}}, {{is_consolidated}},
{{consolidated_total_packages}}, {{consolidated_providers_list}},
{{consolidated_providers_table}}
```

### Secrets
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

---

## 6. `smtp-send`

### Propósito
Enviar correos vía SMTP directo (Gmail SMTP por defecto).

### Endpoint
`POST /functions/v1/smtp-send`

### Autenticación
- ❌ **SIN validación JWT**
- ⚠️ **VULNERABILIDAD**: cualquiera puede enviar correos

### Parámetros
```typescript
{
  outboxId?: string;
  to_emails: string[];
  subject: string;
  body: string;           // HTML
  sender_email?: string;
  cc_emails?: string[];
  bcc_emails?: string[];
}
```

### Flujo SMTP
1. `Deno.connect({ hostname: smtpHost, port: smtpPort })` (default: smtp.gmail.com:587)
2. EHLO → STARTTLS → EHLO → AUTH LOGIN → MAIL FROM → RCPT TO (cada destinatario) → DATA
3. Construye MIME multipart/alternative (text/plain + text/html)
4. Envía `.` para terminar → QUIT
5. Actualiza `correspondence_outbox.status`

### Secrets
- `SMTP_HOST` (default: `smtp.gmail.com`)
- `SMTP_PORT` (default: `587`)
- `SMTP_USER` (requerido)
- `SMTP_PASS` (requerido)
- `SMTP_FROM` (default: `no-reply-sro@ologistics.com`)

### From Header
- `headerFrom` = `SMTP_FROM` (visible en cliente de correo)
- `envelopeFrom` = `SMTP_USER` (cuenta que autentica)

---

## 7. `auto-mark-no-show`

### Propósito
Marcar automáticamente reservas como No Show cuando exceden la tolerancia configurada.

### Endpoint
`POST /functions/v1/auto-mark-no-show`

### Autenticación (doble modo)
- **Modo Cron**: `X-Internal-Cron-Secret === SUPABASE_SERVICE_ROLE_KEY`
- **Modo Usuario**: JWT → `getUser(token)` → verificar pertenencia a org

### Flujo
1. Obtener status `NO_SHOW` de `reservation_statuses`
2. Cargar warehouses con `no_show_tolerance_minutes > 0`
3. Cargar docks de esos warehouses
4. Buscar reservas NO canceladas, status ≠ NO_SHOW, en esos docks
5. Excluir las que ya tienen `casetilla_ingresos`
6. Calcular cutoff = `start_datetime + tolerance_minutes`
7. Si `now > cutoff` → candidata
8. UPDATE batch de 50: `status_id = NO_SHOW`
9. INSERT en `activity_log` (no `reservation_activity_log`)

### Invocación por Cron
```sql
SELECT cron.schedule(
  'auto-mark-no-show',
  '*/5 * * * *',
  $$ SELECT net.http_post(
    url := 'https://xxx.supabase.co/functions/v1/auto-mark-no-show',
    headers := '{"Content-Type": "application/json", "X-Internal-Cron-Secret": "service_role_key"}'::jsonb,
    body := '{"org_id": "org-uuid"}'::jsonb
  ) $$
);
```

---

## 8. `generate-client-pickup-blocks`

### Propósito
Generar bloques de tiempo en andenes para reglas de Cliente Retira.

### Endpoint
`POST /functions/v1/generate-client-pickup-blocks`

### Autenticación
- ⚠️ **Opcional**: si hay Bearer token → `getUser(token)`, sino `SYSTEM_USER_ID`

### Parámetros
```typescript
{
  org_id: string;
  days_ahead?: number;      // default 30
  force_regenerate?: boolean;
  rule_id?: string;          // una regla específica
  dock_id?: string;          // un dock específico
}
```

### Flujo
1. Cargar `client_pickup_rules` activas
2. Cargar `docks` y `warehouses` (horarios hábiles)
3. Calcular fechas: hoy + `days_ahead` días
4. Hoy: inicio dinámico (bloque actual o siguiente)
5. Días futuros: bloque desde `business_start_time`
6. `force_regenerate`: borrar bloques existentes primero
7. Insertar en `dock_time_blocks` con `reason = 'CLIENT_PICKUP:{ruleId}'`
8. Conflict handling: P0001 → skip silencioso

### SYSTEM_USER_ID
```typescript
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
```

---

## 9. `sync-providers`

### Propósito
Sincronizar proveedores desde API externa (crear/actualizar/desactivar).

### Autenticación
- ❌ **SIN validación JWT**

### Parámetros
```typescript
{
  org_id: string;
  source: string;
  client_id?: string;
  providers: Array<{
    code: string;
    name: string;
    short_name?: string;
    provider_type?: 'almacenaje' | 'pesado';
  }>;
}
```

### Flujo
1. Cargar todos los proveedores de la org
2. Procesar cada proveedor de la API: matched / created / updated
3. Desactivar los que no están en la API (`active = false`)
4. Resolver cliente por `source_code` vía `origen_proveedores` o fallback legacy

---

## 10. `gmail-callback`

### Propósito
Callback OAuth 2.0 para conectar cuentas Gmail.

### Endpoint
`GET /functions/v1/gmail-callback?code=...&state=...`

### Flujo
1. Decodificar `state` (Base64 JSON: `{ orgId, userId, redirectUrl }`)
2. Intercambiar `code` por tokens (Google OAuth)
3. Obtener perfil Gmail (emailAddress)
4. Guardar/actualizar en `gmail_accounts`
5. Redirect 302 a `redirectUrl` con `?gmail_connected=true`

### Secrets
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`

---

## APIs v1 (Resumen)

Todas las APIs v1 siguen el mismo patrón:

### Autenticación
- ✅ JWT manual: `getUser(token)`
- Verificación de pertenencia a org: `user_org_roles`

### Scope
- `resolveVisibleDockIds(userId, orgId)` → warehouses → docks → clients/providers
- Paginación: `page`, `page_size` (max 200)

### Response
```typescript
{ data: T[], meta: { page, page_size, total, total_pages, org_id } }
```

### Endpoints
| Endpoint | Entidad | Filtros |
|----------|---------|---------|
| `api-v1-reservations-get` | Reservations | from, to, warehouse_id, dock_id, status_id, is_cancelled, client_id |
| `api-v1-reservations-get-by-id` | Reservation | id |
| `api-v1-reservations-patch-status` | Reservation | id, status_id |
| `api-v1-casetilla-ingresos` | Ingresos | from, to, warehouse_id, reservation_id, matricula, dua |
| `api-v1-casetilla-salidas` | Salidas | from, to, warehouse_id |
| `api-v1-clients` | Clients | search |
| `api-v1-providers` | Providers | search |
| `api-v1-docks` | Docks | warehouse_id |
| `api-v1-warehouses` | Warehouses | — |
| `api-v1-reservation-statuses` | Statuses | — |