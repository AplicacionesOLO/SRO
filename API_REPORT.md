# API_REPORT.md — Auditoría Técnica de APIs e Integración Externa
**Sistema:** SRO (Sistema de Reservas Operativas)  
**Fecha de auditoría:** 2026-04-22  
**Versión del sistema auditada:** v963  
**Alcance:** Edge Functions, servicios frontend, tablas clave, flujos funcionales, autenticación y recomendaciones arquitectónicas.

---

## 1. Resumen Ejecutivo

### Mecanismos de integración existentes

El sistema SRO expone datos y acciones a través de tres capas:

1. **Supabase Edge Functions** — La capa más importante. Hay **25 Edge Functions** desplegadas. De ellas, **2 están explícitamente diseñadas como API pública** (`api-v1-reservations-get`, `api-v1-reservations-patch-status`). El resto son funciones internas de soporte.
2. **Supabase REST API directa** — El frontend consume directamente las tablas de Supabase mediante el cliente JS (`@supabase/supabase-js`). Esto significa que cualquier sistema externo con un JWT válido podría leer/escribir en las tablas que tengan RLS permisivo.
3. **Llamadas HTTP directas a Edge Functions** — El frontend llama a algunas Edge Functions directamente con `fetch()` (no solo con `supabase.functions.invoke()`), especialmente en el flujo de correspondencia y SMTP.

### Partes del sistema que ya exponen datos o acciones consumibles externamente

| Capa | Qué expone | Estado |
|------|-----------|--------|
| `api-v1-reservations-get` | Listado de reservas con filtros | ✅ Lista para consumo externo |
| `api-v1-reservations-patch-status` | Cambio de estado de reserva | ✅ Lista para consumo externo |
| `correspondence-dispatch-event` | Disparo de eventos de correspondencia | ⚠️ Interna, pero consumible con JWT |
| `correspondence-retry-email` | Reintento de emails fallidos | ⚠️ Interna, pero consumible con JWT |
| `admin-users` | CRUD de usuarios de la org | ⚠️ Interna, sin restricción de rol |
| `admin-user-access` | Gestión de acceso por país/almacén | ⚠️ Interna, sin restricción de rol |
| `ask-sro-chat` | Chat con IA sobre documentos | ⚠️ Interna, requiere permiso `chat.ask` |
| `generate-client-pickup-blocks` | Generación de bloques de tiempo | ⚠️ Interna, acepta JWT o anónimo |
| Tablas Supabase REST | Reservas, andenes, almacenes, etc. | ⚠️ Depende de RLS por tabla |

### Nivel de preparación para integración externa

**Nivel actual: 4/10 — Parcialmente preparado.**

- Hay 2 endpoints de API versionados (`/api-v1/`) bien diseñados.
- El resto del sistema no tiene una capa de API unificada.
- La autenticación es consistente (JWT de Supabase), pero no hay API keys para sistemas externos.
- No hay rate limiting, versionado de API formal, ni documentación OpenAPI.
- Muchas operaciones críticas solo están disponibles a través del cliente JS de Supabase (acceso directo a tablas), lo que es riesgoso para integración externa.

---

## 2. Inventario Completo de APIs Existentes

### 2.1 Edge Functions con propósito de API pública

---

#### `api-v1-reservations-get`
| Campo | Valor |
|-------|-------|
| **Archivo** | `supabase/functions/api-v1-reservations-get/index.ts` |
| **Propósito** | Listar reservas de una organización con filtros y paginación |
| **Método HTTP** | `GET` |
| **URL** | `{SUPABASE_URL}/functions/v1/api-v1-reservations-get` |
| **Autenticación** | Bearer JWT (Supabase Auth) |
| **Headers requeridos** | `Authorization: Bearer {jwt}` |
| **Parámetros de entrada** | Query params: `org_id` (UUID, opcional si se infiere), `limit` (1-500, default 50), `offset` (default 0), `from` (ISO datetime), `to` (ISO datetime), `dock_id` (UUID), `status_id` (UUID), `is_cancelled` (true/false) |
| **Respuesta esperada** | `{ data: Reservation[], meta: { limit, offset, count } }` |
| **Errores comunes** | 401 (JWT inválido), 400 (org_id inválido), 403 (usuario no pertenece a la org), 500 (error DB) |
| **Quién la consume hoy** | No hay consumidor frontend identificado — parece diseñada para uso externo |
| **Lista para consumo externo** | ✅ Sí |

**Ejemplo de request:**
```http
GET {SUPABASE_URL}/functions/v1/api-v1-reservations-get?limit=50&from=2026-04-01T00:00:00Z&to=2026-04-30T23:59:59Z
Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
```

**Ejemplo de respuesta:**
```json
{
  "data": [
    {
      "id": "uuid",
      "org_id": "uuid",
      "dock_id": "uuid",
      "start_datetime": "2026-04-22T08:00:00Z",
      "end_datetime": "2026-04-22T09:00:00Z",
      "status_id": "uuid",
      "is_cancelled": false
    }
  ],
  "meta": { "limit": 50, "offset": 0, "count": 120 }
}
```

---

#### `api-v1-reservations-patch-status`
| Campo | Valor |
|-------|-------|
| **Archivo** | `supabase/functions/api-v1-reservations-patch-status/index.ts` |
| **Propósito** | Cambiar el estado de una reserva específica |
| **Método HTTP** | `PATCH` |
| **URL** | `{SUPABASE_URL}/functions/v1/api-v1-reservations-patch-status/{reservation_id}/status` |
| **Autenticación** | Bearer JWT (Supabase Auth) |
| **Headers requeridos** | `Authorization: Bearer {jwt}`, `Content-Type: application/json` |
| **Parámetros de entrada** | Path: `reservation_id` (UUID). Body JSON: `{ status_id: UUID, org_id?: UUID }` |
| **Respuesta esperada** | `{ data: { id, org_id, status_id, updated_by, updated_at } }` |
| **Errores comunes** | 401 (JWT inválido), 400 (status_id inválido), 404 (reserva no encontrada), 409 (reserva cancelada), 500 (error DB) |
| **Side effects** | Escribe en `reservation_activity_log` |
| **Quién la consume hoy** | No hay consumidor frontend identificado — diseñada para uso externo |
| **Lista para consumo externo** | ✅ Sí |

**Ejemplo de request:**
```http
PATCH {SUPABASE_URL}/functions/v1/api-v1-reservations-patch-status/{uuid}/status
Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
Content-Type: application/json

{ "status_id": "uuid-del-nuevo-estado" }
```

---

### 2.2 Edge Functions internas (soporte operativo)

---

#### `correspondence-dispatch-event`
| Campo | Valor |
|-------|-------|
| **Archivo** | `supabase/functions/correspondence-dispatch-event/index.ts` |
| **Propósito** | Punto de entrada para disparar un evento de correspondencia (busca reglas activas y delega a `correspondence-process-event`) |
| **Método HTTP** | `POST` |
| **Autenticación** | Bearer JWT (Supabase Auth) — valida con `supabase.auth.getUser()` |
| **Body** | `{ orgId: UUID, eventType: string, payload: { reservationId?, actorUserId?, statusFromId?, statusToId? } }` |
| **Respuesta** | `{ success: true, results: [...], reqId: string }` |
| **Tablas que toca** | `correspondence_rules` (lectura) |
| **Llama a** | `correspondence-process-event` (fetch interno) |
| **Quién la consume hoy** | No se usa directamente desde el frontend. El frontend llama directamente a `correspondence-process-event` |
| **Lista para consumo externo** | ⚠️ Podría usarse, pero es redundante con `correspondence-process-event` |

---

#### `correspondence-process-event`
| Campo | Valor |
|-------|-------|
| **Archivo** | `supabase/functions/correspondence-process-event/index.ts` |
| **Propósito** | Procesa un evento de correspondencia: busca reglas, resuelve destinatarios, renderiza templates, inserta en outbox y llama a `smtp-send` |
| **Método HTTP** | `POST` |
| **Autenticación** | `verify_jwt: false` en el gateway — usa service role internamente. No valida JWT del caller |
| **Body** | `{ orgId, reservationId, actorUserId, eventType, statusFromId, statusToId }` |
| **Respuesta** | `{ success, queued, sent, failed, results, reqId }` |
| **Tablas que toca** | `correspondence_rules`, `reservations`, `docks`, `warehouses`, `reservation_statuses`, `providers`, `profiles`, `casetilla_ingresos`, `casetilla_salidas`, `correspondence_outbox` |
| **Llama a** | `smtp-send` (fetch interno) |
| **Quién la consume hoy** | `emailTriggerService.ts` (frontend) y `correspondence-dispatch-event` |
| **Lista para consumo externo** | ⚠️ No recomendado — no valida JWT, usa service role, es un proceso interno |

---

#### `correspondence-retry-email`
| Campo | Valor |
|-------|-------|
| **Archivo** | `supabase/functions/correspondence-retry-email/index.ts` |
| **Propósito** | Reintenta el envío de emails fallidos en `correspondence_outbox` |
| **Método HTTP** | `POST` |
| **Autenticación** | Bearer JWT (Supabase Auth) |
| **Body** | `{ outboxId: string, bulk?: boolean }` — si `bulk=true`, `outboxId` es un JSON array serializado |
| **Respuesta** | `{ success, attempted, succeeded, failed, results, reqId }` |
| **Tablas que toca** | `correspondence_outbox` |
| **Llama a** | `smtp-send` (fetch interno) |
| **Quién la consume hoy** | `src/pages/admin/correspondencia/components/LogsTab.tsx` |
| **Lista para consumo externo** | ⚠️ Podría exponerse, pero el diseño del `bulk` (JSON serializado en string) es frágil |

---

#### `smtp-send`
| Campo | Valor |
|-------|-------|
| **Archivo** | `supabase/functions/smtp-send/index.ts` |
| **Propósito** | Envía un email vía SMTP (Gmail con STARTTLS). Actualiza `correspondence_outbox` con el resultado |
| **Método HTTP** | `POST` |
| **Autenticación** | Bearer JWT (Supabase Auth) — pero en la práctica se llama con service role key desde otras funciones |
| **Body** | `{ outboxId?, to_emails, subject, body, sender_email?, cc_emails?, bcc_emails? }` |
| **Respuesta** | `{ success, version, message, to, from, reqId }` |
| **Env vars requeridas** | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |
| **Tablas que toca** | `correspondence_outbox` (update) |
| **Quién la consume hoy** | `correspondence-process-event`, `correspondence-retry-email`, `correspondenceService.ts` (frontend directo) |
| **Lista para consumo externo** | ❌ No — es infraestructura interna de envío de correos |

---

#### `admin-users`
| Campo | Valor |
|-------|-------|
| **Archivo** | `supabase/functions/admin-users/index.ts` |
| **Propósito** | CRUD de usuarios de una organización (list, create, update_role, remove_from_org) |
| **Método HTTP** | `POST` |
| **Autenticación** | No valida JWT del caller — usa service role directamente. **Riesgo de seguridad.** |
| **Body** | `{ action: "list"|"create"|"update_role"|"remove_from_org", orgId, userId?, email?, password?, roleId?, full_name?, phone_e164? }` |
| **Respuesta** | Varía por action. `list` → `{ users: AdminUserRow[] }`. `create` → `{ userId, alreadyExisted }` |
| **Tablas que toca** | `user_org_roles`, `profiles`, `user_warehouse_access`, `user_providers` (auth.users vía Admin API) |
| **Quién la consume hoy** | `adminService.ts` vía `supabase.functions.invoke()` |
| **Lista para consumo externo** | ❌ No — no valida JWT, usa Admin API de Supabase, riesgo alto |

---

#### `admin-user-access`
| Campo | Valor |
|-------|-------|
| **Archivo** | `supabase/functions/admin-user-access/index.ts` |
| **Propósito** | Gestión de acceso de usuarios por país y almacén (get, set_countries, set_warehouses, approve, reject, update_status) |
| **Método HTTP** | `POST` |
| **Autenticación** | Bearer JWT (Supabase Auth) — valida con `supabase.auth.getUser()` |
| **Body** | `{ action, userId?, targetUserId?, orgId?, status?, rejectionReason?, countryIds?, warehouseIds?, restricted? }` |
| **Tablas que toca** | `user_country_access`, `user_warehouse_access`, `profiles` |
| **Quién la consume hoy** | `src/pages/admin/usuarios/page.tsx` y `src/services/userAccessService.ts` |
| **Lista para consumo externo** | ⚠️ Podría exponerse con restricciones de rol adicionales |

---

#### `ask-sro-chat`
| Campo | Valor |
|-------|-------|
| **Archivo** | `supabase/functions/ask-sro-chat/index.ts` |
| **Propósito** | Chat con IA (OpenAI GPT-4o-mini) sobre documentos de conocimiento de la organización |
| **Método HTTP** | `POST` |
| **Autenticación** | Bearer JWT (Supabase Auth) + permiso `chat.ask` en `role_permissions` |
| **Body** | `{ question: string, session_id?: UUID }` |
| **Respuesta** | `{ answer, session_id, message_id, citations, used_document_ids, suggested_questions, status }` |
| **Env vars requeridas** | `OPENAI_API_KEY` |
| **Tablas que toca** | `user_org_roles`, `profiles`, `role_permissions`, `knowledge_documents`, `knowledge_document_roles`, `knowledge_document_permissions`, `chat_sessions`, `chat_messages` |
| **Quién la consume hoy** | `src/services/chatService.ts` |
| **Lista para consumo externo** | ⚠️ Podría exponerse como API de chat, pero requiere gestión de sesiones |

---

#### `gmail-callback`
| Campo | Valor |
|-------|-------|
| **Archivo** | `supabase/functions/gmail-callback/index.ts` |
| **Propósito** | Callback OAuth2 de Google para conectar cuentas Gmail |
| **Método HTTP** | `GET` (redirect de Google) |
| **Autenticación** | State param con `orgId`, `userId`, `redirectUrl` (base64 encoded) |
| **Env vars requeridas** | `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` |
| **Tablas que toca** | `gmail_accounts` |
| **Lista para consumo externo** | ❌ No — es un callback OAuth, no una API |

---

#### `gmail-connection-status`
| Campo | Valor |
|-------|-------|
| **Archivo** | `supabase/functions/gmail-connection-status/index.ts` |
| **Propósito** | Verifica si una cuenta Gmail está conectada y refresca el token si expiró |
| **Método HTTP** | `POST` |
| **Autenticación** | No valida JWT — acepta cualquier request con `orgId` y `userId` en el body |
| **Body** | `{ orgId: UUID, userId: UUID }` |
| **Respuesta** | `{ connected: boolean, account: GmailAccount | null, debug: {...} }` |
| **Tablas que toca** | `gmail_accounts` |
| **Lista para consumo externo** | ❌ No — no tiene autenticación real |

---

#### `generate-client-pickup-blocks`
| Campo | Valor |
|-------|-------|
| **Archivo** | `supabase/functions/generate-client-pickup-blocks/index.ts` |
| **Propósito** | Genera bloques de tiempo en `dock_time_blocks` para reglas de retiro de clientes |
| **Método HTTP** | `POST` |
| **Autenticación** | Bearer JWT opcional — si no hay JWT, usa `SYSTEM_USER_ID` como creador |
| **Body** | `{ org_id: UUID, days_ahead?: number, force_regenerate?: boolean, rule_id?: UUID, dock_id?: UUID }` |
| **Respuesta** | `{ success, rules_processed, blocks_created, blocks_skipped, blocks_deleted, days_ahead, today_cr }` |
| **Tablas que toca** | `client_pickup_rules`, `docks`, `warehouses`, `dock_time_blocks` |
| **Quién la consume hoy** | `src/services/clientPickupRulesService.ts` |
| **Lista para consumo externo** | ⚠️ Podría usarse para automatización, pero requiere JWT o service role |

---

#### `process-knowledge-document`
| Campo | Valor |
|-------|-------|
| **Archivo** | `supabase/functions/process-knowledge-document/index.ts` |
| **Propósito** | Sube un documento a OpenAI Files y lo indexa en un Vector Store para el chat |
| **Método HTTP** | `POST` |
| **Autenticación** | Bearer JWT (Supabase Auth) |
| **Body** | `{ document_id: UUID }` |
| **Env vars requeridas** | `OPENAI_API_KEY` |
| **Tablas que toca** | `knowledge_documents`, `user_org_roles` |
| **Quién la consume hoy** | `src/pages/conocimiento/components/UploadDocumentModal.tsx` |
| **Lista para consumo externo** | ❌ No — es un proceso interno de indexación |

---

#### `setup-admin-permissions`
| Campo | Valor |
|-------|-------|
| **Archivo** | `supabase/functions/setup-admin-permissions/index.ts` |
| **Propósito** | Inicializa permisos y roles base del sistema (upsert) |
| **Método HTTP** | `POST` |
| **Autenticación** | Ninguna — usa service role directamente |
| **Tablas que toca** | `permissions`, `roles` |
| **Lista para consumo externo** | ❌ No — es un script de setup, no una API |

---

#### Funciones de setup/utilidad (no APIs)

| Función | Archivo | Propósito |
|---------|---------|-----------|
| `setup-casetilla-storage` | `supabase/functions/setup-casetilla-storage/index.ts` | Crea bucket de Storage para fotos de casetilla |
| `fix-casetilla-storage-rls` | `supabase/functions/fix-casetilla-storage-rls/index.ts` | Corrige políticas RLS del bucket de casetilla |
| `setup-knowledge-storage` | `supabase/functions/setup-knowledge-storage/index.ts` | Crea bucket de Storage para documentos de conocimiento |
| `fix-invoice-nullable` | `supabase/functions/fix-invoice-nullable/index.ts` | Migración: hace nullable la columna invoice |
| `reindex-knowledge-document` | `supabase/functions/reindex-knowledge-document/index.ts` | Re-indexa un documento en OpenAI |
| `client-pickup-blocker` | (no auditado directamente) | Bloquea andenes según reglas de cliente |

---

### 2.3 Servicios frontend que llaman a endpoints externos

El frontend llama directamente a Edge Functions con `fetch()` en los siguientes casos:

| Servicio | Archivo | Endpoint llamado | Método |
|---------|---------|-----------------|--------|
| `emailTriggerService` | `src/services/emailTriggerService.ts` | `/functions/v1/correspondence-process-event` | POST (fetch directo) |
| `correspondenceService` | `src/services/correspondenceService.ts` | `/functions/v1/smtp-send` | POST (fetch directo) |
| `correspondenceService` | `src/services/correspondenceService.ts` | `/functions/v1/smtp-send` | POST (fetch directo, retry) |
| `adminService` | `src/services/adminService.ts` | `admin-users` | POST (supabase.functions.invoke) |
| `adminService` | `src/services/adminService.ts` | `admin-user-access` | POST (supabase.functions.invoke) |

---

### 2.4 Funciones RPC / SQL consumibles

Se identificó una función RPC usada en el sistema:

| Función | Llamada desde | Propósito |
|---------|--------------|-----------|
| `get_pending_reservations_v2(p_org_id)` | `casetillaService.ts` | Retorna reservas pendientes de ingreso en casetilla (PENDING + sin ingreso registrado) |

Esta función no está documentada en los archivos de migración auditados, pero se consume directamente con `supabase.rpc()`.

---

## 3. Mapa de Edge Functions

| Función | Archivo | Propósito | Autenticación | verify_jwt | Tablas principales | Consumo externo |
|---------|---------|-----------|--------------|-----------|-------------------|----------------|
| `api-v1-reservations-get` | `api-v1-reservations-get/index.ts` | Listar reservas | JWT + validación manual | No especificado | `reservations`, `user_org_roles` | ✅ Sí |
| `api-v1-reservations-patch-status` | `api-v1-reservations-patch-status/index.ts` | Cambiar estado de reserva | JWT + validación manual | No especificado | `reservations`, `reservation_activity_log` | ✅ Sí |
| `correspondence-dispatch-event` | `correspondence-dispatch-event/index.ts` | Disparar evento de correspondencia | JWT + `auth.getUser()` | No especificado | `correspondence_rules` | ⚠️ Posible |
| `correspondence-process-event` | `correspondence-process-event/index.ts` | Procesar evento y enviar emails | `verify_jwt: false` — sin validación | **false** | `correspondence_rules`, `reservations`, `correspondence_outbox`, etc. | ❌ No |
| `correspondence-retry-email` | `correspondence-retry-email/index.ts` | Reintentar emails fallidos | JWT + `auth.getUser()` | No especificado | `correspondence_outbox` | ⚠️ Posible |
| `smtp-send` | `smtp-send/index.ts` | Enviar email vía SMTP | JWT (no validado estrictamente) | No especificado | `correspondence_outbox` | ❌ No |
| `admin-users` | `admin-users/index.ts` | CRUD usuarios de org | **Sin validación JWT** | No especificado | `user_org_roles`, `profiles`, auth.users | ❌ No |
| `admin-user-access` | `admin-user-access/index.ts` | Acceso por país/almacén | JWT + `auth.getUser()` | No especificado | `user_country_access`, `user_warehouse_access`, `profiles` | ⚠️ Posible |
| `ask-sro-chat` | `ask-sro-chat/index.ts` | Chat IA con documentos | JWT + permiso `chat.ask` | No especificado | `chat_sessions`, `chat_messages`, `knowledge_documents` | ⚠️ Posible |
| `gmail-callback` | `gmail-callback/index.ts` | OAuth callback Gmail | State param (no JWT) | No especificado | `gmail_accounts` | ❌ No |
| `gmail-connection-status` | `gmail-connection-status/index.ts` | Estado conexión Gmail | **Sin validación JWT** | No especificado | `gmail_accounts` | ❌ No |
| `generate-client-pickup-blocks` | `generate-client-pickup-blocks/index.ts` | Generar bloques de tiempo | JWT opcional | No especificado | `client_pickup_rules`, `dock_time_blocks` | ⚠️ Posible |
| `process-knowledge-document` | `process-knowledge-document/index.ts` | Indexar documento en OpenAI | JWT + `auth.getUser()` | No especificado | `knowledge_documents` | ❌ No |
| `reindex-knowledge-document` | `reindex-knowledge-document/index.ts` | Re-indexar documento | JWT | No especificado | `knowledge_documents` | ❌ No |
| `setup-admin-permissions` | `setup-admin-permissions/index.ts` | Setup inicial de permisos | **Sin validación** | No especificado | `permissions`, `roles` | ❌ No |
| `setup-casetilla-storage` | `setup-casetilla-storage/index.ts` | Setup bucket Storage | Sin validación | No especificado | Storage | ❌ No |
| `fix-casetilla-storage-rls` | `fix-casetilla-storage-rls/index.ts` | Fix RLS Storage | Sin validación | No especificado | Storage | ❌ No |
| `setup-knowledge-storage` | `setup-knowledge-storage/index.ts` | Setup bucket conocimiento | Sin validación | No especificado | Storage | ❌ No |
| `fix-invoice-nullable` | `fix-invoice-nullable/index.ts` | Migración DB | Sin validación | No especificado | `reservations` | ❌ No |
| `gmail-callback` | `gmail-callback/index.ts` | OAuth callback | State param | No especificado | `gmail_accounts` | ❌ No |
| `client-pickup-blocker` | (no auditado) | Bloquear andenes | No auditado | No auditado | `dock_time_blocks` | ❌ No |

### Riesgos identificados en Edge Functions

1. **`admin-users` no valida JWT**: Cualquier request POST puede ejecutar acciones de administración de usuarios. Esto es un riesgo de seguridad crítico si la función es accesible públicamente.
2. **`gmail-connection-status` no valida JWT**: Cualquiera que conozca un `orgId` y `userId` puede consultar el estado de conexión Gmail.
3. **`correspondence-process-event` tiene `verify_jwt: false`**: Está diseñado para ser llamado internamente, pero si alguien conoce la URL puede disparar envíos de email sin autenticación.
4. **`setup-admin-permissions` sin autenticación**: Podría ser llamada por cualquiera para resetear permisos del sistema.

---

## 4. Mapa de Tablas Clave para Integración

### Tablas de alta relevancia para integración externa

---

#### `reservations`
| Campo | Detalle |
|-------|---------|
| **Propósito** | Tabla central del sistema. Almacena todas las reservas de andenes |
| **Campos clave** | `id`, `org_id`, `dock_id`, `start_datetime`, `end_datetime`, `status_id`, `is_cancelled`, `dua`, `invoice`, `driver`, `truck_plate`, `shipper_provider`, `client_id`, `is_imported`, `operation_type`, `created_by`, `updated_by` |
| **Relaciones** | `docks` (dock_id), `reservation_statuses` (status_id), `profiles` (created_by, updated_by), `providers` (shipper_provider), `clients` (client_id) |
| **RLS** | Sí (basado en org_id) |
| **Riesgo de acceso directo** | Medio — RLS protege por org, pero no por rol de usuario |
| **Recomendación** | Consumir vía `api-v1-reservations-get` para lectura. Para escritura, usar Edge Function dedicada |

---

#### `reservation_statuses`
| Campo | Detalle |
|-------|---------|
| **Propósito** | Catálogo de estados de reserva por organización |
| **Campos clave** | `id`, `org_id`, `name`, `code`, `color`, `is_active`, `order_index` |
| **Relaciones** | `reservations` (status_id) |
| **RLS** | Sí |
| **Recomendación** | Segura para lectura directa. Necesaria para mapear `status_id` a nombres legibles |

---

#### `docks`
| Campo | Detalle |
|-------|---------|
| **Propósito** | Andenes/muelles de carga de cada almacén |
| **Campos clave** | `id`, `org_id`, `name`, `reference`, `warehouse_id`, `category_id`, `status_id`, `is_active` |
| **Relaciones** | `warehouses` (warehouse_id), `dock_categories` (category_id), `dock_statuses` (status_id) |
| **RLS** | Sí |
| **Recomendación** | Segura para lectura directa |

---

#### `warehouses`
| Campo | Detalle |
|-------|---------|
| **Propósito** | Almacenes/bodegas de la organización |
| **Campos clave** | `id`, `org_id`, `name`, `location`, `country_id`, `business_start_time`, `business_end_time`, `slot_interval_minutes`, `timezone` |
| **Relaciones** | `docks` (warehouse_id), `countries` (country_id) |
| **RLS** | Sí |
| **Recomendación** | Segura para lectura directa |

---

#### `providers`
| Campo | Detalle |
|-------|---------|
| **Propósito** | Proveedores/transportistas que hacen reservas |
| **Campos clave** | `id`, `org_id`, `name`, `active` |
| **Relaciones** | `reservations` (shipper_provider), `provider_warehouses`, `client_providers` |
| **RLS** | Sí |
| **Recomendación** | Segura para lectura directa |

---

#### `clients`
| Campo | Detalle |
|-------|---------|
| **Propósito** | Clientes de la organización (dueños de la carga) |
| **Campos clave** | `id`, `org_id`, `name`, `legal_id`, `email`, `phone`, `is_active` |
| **Relaciones** | `client_docks`, `client_providers`, `warehouse_clients`, `client_rules`, `client_pickup_rules` |
| **RLS** | Sí |
| **Recomendación** | Segura para lectura directa. Escritura solo vía servicio |

---

#### `casetilla_ingresos`
| Campo | Detalle |
|-------|---------|
| **Propósito** | Registro de llegada de vehículos al almacén (punto de control de entrada) |
| **Campos clave** | `id`, `org_id`, `reservation_id`, `chofer`, `matricula`, `dua`, `factura`, `fotos`, `created_by`, `created_at` |
| **Relaciones** | `reservations` (reservation_id) |
| **RLS** | Sí |
| **Recomendación** | Lectura directa posible. Escritura solo vía `casetillaService` (tiene lógica de negocio compleja) |

---

#### `casetilla_salidas`
| Campo | Detalle |
|-------|---------|
| **Propósito** | Registro de salida de vehículos del almacén (punto de control de salida) |
| **Campos clave** | `id`, `org_id`, `reservation_id`, `chofer`, `matricula`, `dua`, `fotos`, `exit_at`, `created_by` |
| **Relaciones** | `reservations` (reservation_id) |
| **RLS** | Sí |
| **Recomendación** | Lectura directa posible. Escritura solo vía servicio |

---

#### `correspondence_outbox`
| Campo | Detalle |
|-------|---------|
| **Propósito** | Cola de emails pendientes/enviados/fallidos |
| **Campos clave** | `id`, `org_id`, `rule_id`, `reservation_id`, `to_emails`, `cc_emails`, `subject`, `body`, `status`, `sent_at`, `error` |
| **Relaciones** | `correspondence_rules` (rule_id), `reservations` (reservation_id) |
| **RLS** | Sí |
| **Recomendación** | Solo lectura para auditoría. No escribir directamente |

---

#### `dock_time_blocks`
| Campo | Valor |
|-------|-------|
| **Propósito** | Bloques de tiempo que bloquean un andén (mantenimiento, reglas de cliente, etc.) |
| **Campos clave** | `id`, `org_id`, `dock_id`, `start_datetime`, `end_datetime`, `reason`, `is_cancelled`, `created_by` |
| **Relaciones** | `docks` (dock_id) |
| **RLS** | Sí |
| **Recomendación** | Lectura directa posible. Escritura solo vía servicio (hay lógica de conflictos) |

---

#### `profiles`
| Campo | Detalle |
|-------|---------|
| **Propósito** | Perfiles de usuarios del sistema (extiende auth.users) |
| **Campos clave** | `id`, `name`, `email`, `phone_e164`, `access_status`, `access_approved_at` |
| **Relaciones** | `user_org_roles`, `reservations` (created_by) |
| **RLS** | Sí |
| **Recomendación** | Solo lectura para enriquecer datos. No escribir directamente desde sistemas externos |

---

#### `user_org_roles`
| Campo | Detalle |
|-------|---------|
| **Propósito** | Asignación de usuarios a organizaciones con un rol |
| **Campos clave** | `user_id`, `org_id`, `role_id`, `assigned_by`, `assigned_at` |
| **Relaciones** | `profiles`, `organizations`, `roles` |
| **RLS** | Sí |
| **Recomendación** | No escribir directamente. Usar `admin-users` Edge Function |

---

## 5. Flujos Funcionales Existentes

### 5.1 Creación de Reserva

```
Usuario → ReservationModal.tsx
  → calendarService.createReservation()
    → supabase.from('reservations').insert()
    → [si éxito] emailTriggerService.onReservationCreated()
      → fetch('/functions/v1/correspondence-process-event', { eventType: 'reservation_created' })
        → correspondence-process-event (Edge Function)
          → Lee correspondence_rules (event_type = 'reservation_created')
          → Resuelve destinatarios (profiles, roles)
          → Renderiza template con datos de la reserva
          → Inserta en correspondence_outbox
          → fetch('/functions/v1/smtp-send')
            → smtp-send (Edge Function)
              → Envía email vía SMTP (Gmail)
              → Actualiza correspondence_outbox.status = 'sent' | 'failed'
```

**Tablas involucradas:** `reservations`, `correspondence_rules`, `correspondence_outbox`, `profiles`, `reservation_statuses`, `docks`, `warehouses`, `providers`

**Side effects:** Email automático si hay reglas activas para `reservation_created`

---

### 5.2 Cambio de Estado de Reserva

```
Usuario → ReservationModal.tsx (o CalendarioPage.tsx)
  → calendarService.updateReservation({ status_id: newStatusId })
    → supabase.from('reservations').update()
    → [si status cambió] emailTriggerService.onReservationStatusChanged()
      → fetch('/functions/v1/correspondence-process-event', { eventType: 'reservation_status_changed', statusFromId, statusToId })
        → correspondence-process-event (Edge Function)
          → Filtra reglas por status_from_id y status_to_id
          → [si regla tiene include_casetilla_photos] busca fotos en casetilla_ingresos o casetilla_salidas
          → Renderiza template y envía email
```

**Tablas involucradas:** `reservations`, `reservation_activity_log`, `correspondence_rules`, `correspondence_outbox`, `casetilla_ingresos`, `casetilla_salidas`

**Side effects:** Email automático, log en `reservation_activity_log`

**También disponible vía API externa:** `api-v1-reservations-patch-status` (sin trigger de email)

---

### 5.3 Correspondencia / Envío de Correos

```
Admin → CorrespondenciaPage.tsx
  → correspondenceService.getRules() → supabase.from('correspondence_rules').select()
  → correspondenceService.createRule() → supabase.from('correspondence_rules').insert()
  → correspondenceService.getLogs() → supabase.from('correspondence_outbox').select()
  → correspondenceService.retryFailedEmail(logId)
    → supabase.from('correspondence_outbox').update({ status: 'queued' })
    → fetch('/functions/v1/smtp-send', { outboxId, to_emails, subject, body })
```

**Tablas involucradas:** `correspondence_rules`, `correspondence_outbox`, `reservation_statuses`, `profiles`, `roles`

---

### 5.4 Casetilla — Ingreso

```
Operador → IngresoForm.tsx
  → casetillaService.createIngreso(orgId, userId, data)
    → supabase.from('reservations').select() [busca por reservation_id o DUA+matrícula]
    → supabase.from('reservations').update({ status_id: ARRIVED_PENDING_UNLOAD })
    → supabase.from('reservations').update({ truck_plate, driver, dua, ... }) [sincronización]
    → supabase.from('casetilla_ingresos').insert()
    → emailTriggerService.onReservationStatusChanged() [trigger de email]
```

**Tablas involucradas:** `reservations`, `casetilla_ingresos`, `reservation_statuses`, `docks`, `warehouses`, `providers`

**Side effects:** Cambio de estado de reserva a `ARRIVED_PENDING_UNLOAD`, email automático

---

### 5.5 Casetilla — Salida

```
Operador → ExitForm.tsx
  → casetillaService.createSalida(orgId, userId, reservationId, fotos)
    → supabase.from('reservations').select() [verifica existencia]
    → supabase.from('casetilla_salidas').select() [verifica que no haya salida previa]
    → supabase.from('reservation_statuses').select({ code: 'DISPATCHED' })
    → supabase.from('reservations').update({ status_id: DISPATCHED })
    → supabase.from('casetilla_salidas').insert()
    → emailTriggerService.onReservationStatusChanged() [trigger de email]
```

**Tablas involucradas:** `reservations`, `casetilla_salidas`, `reservation_statuses`

**Side effects:** Cambio de estado a `DISPATCHED`, email automático

---

### 5.6 Clientes y Reglas

```
Admin → ClientesPage.tsx
  → clientsService.listClients() → supabase.from('clients').select()
  → clientsService.getClientRules() → supabase.from('client_rules').select()
  → clientsService.setClientDocks() → supabase.from('client_docks').delete/insert()
  → clientsService.setClientProviders() → supabase.from('client_providers').delete/insert/update()
  → ClientPickupRulesTab.tsx
    → clientPickupRulesService.getRules() → supabase.from('client_pickup_rules').select()
    → clientPickupRulesService.createRule() → supabase.from('client_pickup_rules').insert()
    → [al guardar regla] generate-client-pickup-blocks (Edge Function)
      → Genera bloques en dock_time_blocks para los próximos N días
```

**Tablas involucradas:** `clients`, `client_rules`, `client_docks`, `client_providers`, `client_pickup_rules`, `dock_time_blocks`

---

### 5.7 Proveedores y Perfiles de Tiempo

```
Admin → CatalogosPage.tsx → ProvidersTab.tsx
  → providersService.getAll() → supabase.from('providers').select()
  → providersService.setProviderWarehouses() → supabase.from('provider_warehouses').delete/insert()
  → TimeProfilesTab.tsx
    → timeProfilesService.getAll() → supabase.from('provider_cargo_time_profiles').select()
```

**Tablas involucradas:** `providers`, `provider_warehouses`, `provider_cargo_time_profiles`, `cargo_types`

---

### 5.8 Dashboard y Estadísticas

```
Usuario → DashboardPage.tsx
  → dashboardService.getStats(orgId, warehouseId, period)
    → 6 queries paralelas a supabase.from('reservations')
    → supabase.from('reservation_statuses')
    → supabase.from('docks')
    → supabase.from('warehouses')
    → supabase.from('providers')
    → supabase.from('collaborators')
    → supabase.from('collaborator_warehouses')
```

**Tablas involucradas:** `reservations`, `reservation_statuses`, `docks`, `warehouses`, `providers`, `collaborators`, `collaborator_warehouses`

**Nota:** El dashboard hace 7+ queries en paralelo. No hay endpoint de estadísticas agregadas para consumo externo.

---

## 6. Autenticación y Seguridad

### 6.1 Supabase Auth

El sistema usa **Supabase Auth** como proveedor de identidad. Los usuarios se autentican con email/password y reciben un JWT firmado con RS256.

- **Token de acceso:** JWT con expiración corta (1 hora por defecto)
- **Refresh token:** Almacenado en el cliente, usado para renovar el access token
- **Sesión:** Gestionada por `@supabase/supabase-js` en el frontend

### 6.2 JWT

El JWT contiene:
- `sub`: UUID del usuario (= `profiles.id`)
- `role`: `authenticated` (para usuarios normales) o `service_role` (para Edge Functions con service role key)
- `exp`: Timestamp de expiración

Las Edge Functions validan el JWT de dos formas:
1. **Automática** (cuando `verify_jwt: true` en el gateway de Supabase): Supabase valida el JWT antes de ejecutar la función
2. **Manual** (cuando `verify_jwt: false`): La función llama a `supabase.auth.getUser(token)` internamente

### 6.3 Roles y Permisos

El sistema tiene un modelo de permisos propio sobre Supabase Auth:

```
auth.users (Supabase)
  ↓
profiles (tabla pública)
  ↓
user_org_roles (usuario → organización → rol)
  ↓
role_permissions (rol → permiso)
  ↓
permissions (catálogo de permisos)
```

Los permisos se verifican en el frontend (`usePermissions` hook) y en algunas Edge Functions (`ask-sro-chat`). **No hay verificación de permisos en la mayoría de las Edge Functions.**

### 6.4 RLS (Row Level Security)

Las tablas tienen RLS habilitado, pero la política exacta no fue auditada en detalle. El patrón general es:
- Filtrar por `org_id` para aislar datos entre organizaciones
- Algunas tablas usan `user_org_roles` para verificar membresía

**Riesgo:** Si un usuario tiene un JWT válido de la organización A, podría intentar acceder a datos de la organización B si las políticas RLS no están bien configuradas.

### 6.5 Service Role

Las Edge Functions usan `SUPABASE_SERVICE_ROLE_KEY` para operaciones que requieren bypass de RLS (crear usuarios, leer datos de otras orgs, etc.). Esta key **nunca debe exponerse al frontend**.

**Hallazgo:** El frontend en `emailTriggerService.ts` resuelve la URL de Supabase desde variables de entorno `VITE_PUBLIC_SUPABASE_URL`. La anon key también se expone en el frontend (esto es normal en Supabase). La service role key NO está expuesta en el frontend.

### 6.6 Riesgos para integración externa

| Riesgo | Severidad | Descripción |
|--------|-----------|-------------|
| `admin-users` sin JWT | 🔴 Alta | Cualquier request puede gestionar usuarios |
| `gmail-connection-status` sin JWT | 🟡 Media | Expone estado de conexión Gmail |
| `correspondence-process-event` sin JWT | 🟡 Media | Puede disparar emails sin autenticación |
| `setup-admin-permissions` sin JWT | 🟡 Media | Puede resetear permisos del sistema |
| No hay API keys para sistemas externos | 🟡 Media | Solo se puede autenticar con JWT de usuario |
| No hay rate limiting | 🟡 Media | Sin protección contra abuso |
| No hay versionado formal de API | 🟢 Baja | Solo 2 endpoints tienen prefijo `/api-v1/` |

---

## 7. Hallazgos y Deuda Técnica

### 7.1 Inconsistencias

1. **Dos patrones de llamada a Edge Functions:** El frontend usa `supabase.functions.invoke()` para algunas funciones y `fetch()` directo para otras (`smtp-send`, `correspondence-process-event`). Esto genera inconsistencia en el manejo de errores y headers.

2. **`correspondence-dispatch-event` es redundante:** El frontend llama directamente a `correspondence-process-event`, haciendo que `correspondence-dispatch-event` sea un intermediario sin uso real.

3. **`admin-users` no valida JWT:** A diferencia de `admin-user-access` que sí valida, `admin-users` usa service role sin verificar quién hace el request.

4. **`gmail-connection-status` no valida JWT:** Inconsistente con el resto de funciones que sí validan.

5. **Bulk retry de emails usa JSON serializado en string:** En `correspondence-retry-email`, cuando `bulk=true`, el campo `outboxId` es un JSON array serializado como string. Esto es un diseño frágil y confuso.

6. **`get_pending_reservations_v2` es una RPC no documentada:** Se usa en casetilla pero no hay migración visible que la defina en los archivos auditados.

### 7.2 Flujos frágiles

1. **Trigger de email en casetilla:** El email se dispara después de insertar en `casetilla_ingresos`, pero si el trigger falla, no hay mecanismo de reintento automático (solo manual desde el panel de correspondencia).

2. **Sincronización de datos reserva↔casetilla:** Al crear un ingreso, se sincronizan campos de la reserva (`truck_plate`, `driver`, etc.). Si esta sincronización falla, se lanza un error que puede confundir al usuario aunque el ingreso ya fue creado.

3. **Fallback de status en casetilla:** El servicio busca el status `ARRIVED_PENDING_UNLOAD` por código y luego por nombre. Si ninguno existe, el ingreso se crea sin cambiar el estado de la reserva (silenciosamente).

4. **Dashboard con 7+ queries paralelas:** No hay caché ni endpoint agregado. Con muchos datos, esto puede ser lento.

### 7.3 Dependencias peligrosas

1. **OpenAI API key en Edge Functions:** Si la key se rota, el chat y el procesamiento de documentos dejan de funcionar sin aviso.

2. **SMTP hardcodeado a Gmail:** El sistema usa Gmail SMTP con STARTTLS. Si las credenciales expiran o Google bloquea el acceso, todos los emails fallan.

3. **`correspondence-process-event` llama a `smtp-send` con service role key como Bearer token:** Esto es un patrón inusual — la service role key se usa como token de autorización para llamar a otra Edge Function.

4. **`emailTriggerService` resuelve la URL de Supabase desde múltiples variables de entorno con fallbacks:** Esto hace el código difícil de mantener y puede causar comportamientos inesperados si las variables no están bien configuradas.

### 7.4 Cosas que dificultarían integración externa

1. **No hay API keys para sistemas externos** — Solo se puede autenticar con JWT de usuario Supabase. Un sistema externo necesitaría crear un usuario de servicio.
2. **No hay documentación OpenAPI/Swagger** — No hay contrato formal de las APIs.
3. **No hay rate limiting** — Sin protección contra abuso desde sistemas externos.
4. **Los IDs de estado son UUIDs opacos** — Un sistema externo necesita primero consultar `reservation_statuses` para mapear nombres a IDs.
5. **El dashboard no tiene endpoint de estadísticas** — Un sistema externo no puede obtener métricas agregadas sin hacer múltiples queries.
6. **No hay webhooks salientes** — El sistema no notifica a sistemas externos cuando ocurren eventos (solo envía emails).

---

## 8. Recomendación para API Externa Futura

### 8.1 Qué convendría exponer primero

Los dos endpoints ya existentes son el punto de partida correcto:

```
GET  /functions/v1/api-v1-reservations-get          → Listar reservas
PATCH /functions/v1/api-v1-reservations-patch-status → Cambiar estado
```

**Próximos endpoints recomendados (en orden de prioridad):**

1. `GET /api-v1/reservation-statuses` — Catálogo de estados (necesario para interpretar status_id)
2. `GET /api-v1/docks` — Catálogo de andenes
3. `GET /api-v1/warehouses` — Catálogo de almacenes
4. `POST /api-v1/reservations` — Crear reserva (con validación de conflictos)
5. `GET /api-v1/casetilla/ingresos` — Registros de entrada
6. `GET /api-v1/casetilla/salidas` — Registros de salida
7. `GET /api-v1/dashboard/stats` — Estadísticas agregadas

### 8.2 Qué NO debería exponerse directamente

| Recurso | Razón |
|---------|-------|
| `admin-users` | Gestión de usuarios con Admin API — riesgo alto |
| `smtp-send` | Infraestructura interna de email |
| `correspondence-process-event` | Proceso interno con `verify_jwt: false` |
| `setup-*` y `fix-*` | Scripts de setup/migración |
| `gmail-callback` | Callback OAuth, no una API |
| Tablas `auth.*` | Datos de autenticación de Supabase |
| `profiles` (escritura) | Datos sensibles de usuarios |

### 8.3 Qué convendría mover a APIs más limpias

1. **Dashboard stats** → Crear una Edge Function `api-v1-dashboard-stats` que devuelva métricas agregadas en una sola llamada, en lugar de las 7+ queries actuales del frontend.

2. **Casetilla ingreso/salida** → Crear `api-v1-casetilla-ingreso` y `api-v1-casetilla-salida` que encapsulen toda la lógica de negocio (cambio de estado, sincronización, trigger de email).

3. **Catálogos** → Crear `api-v1-catalogs` que devuelva en una sola llamada: statuses, docks, warehouses, providers.

### 8.4 Qué convendría resolver con funciones de BD / RPC / triggers

**Tu intuición sobre triggers de base de datos es correcta y tiene sentido para este sistema.**

Análisis de viabilidad:

**✅ Casos donde triggers de BD tienen sentido:**

1. **Log de actividad automático** — Actualmente `reservation_activity_log` se escribe manualmente desde la Edge Function `api-v1-reservations-patch-status`. Un trigger `AFTER UPDATE ON reservations` podría escribir el log automáticamente, garantizando que nunca se pierda un cambio de estado.

2. **Generación de bloques de tiempo** — La función `generate-client-pickup-blocks` podría reemplazarse parcialmente con un trigger `AFTER INSERT OR UPDATE ON client_pickup_rules` que llame a una función PL/pgSQL para generar los bloques del día actual.

3. **Validación de conflictos de reserva** — Ya existe un constraint de exclusión (`reservations_no_overlap`) que funciona como trigger implícito. Este patrón es correcto y debería mantenerse.

4. **Sincronización casetilla↔reserva** — La sincronización de campos (`truck_plate`, `driver`, etc.) al crear un ingreso podría hacerse con un trigger `AFTER INSERT ON casetilla_ingresos` que actualice `reservations`. Esto eliminaría la lógica frágil actual en el servicio.

**⚠️ Casos donde triggers de BD NO son recomendables:**

1. **Envío de emails** — Los triggers de BD no pueden hacer llamadas HTTP. El flujo de correspondencia debe seguir siendo una Edge Function.

2. **Integración con OpenAI** — Igual que emails, requiere HTTP.

3. **Lógica de negocio compleja** — Reglas de correspondencia con templates, resolución de destinatarios por rol, etc. Son demasiado complejas para PL/pgSQL.

**Recomendación concreta:**

```sql
-- Ejemplo: trigger para log automático de cambios de estado
CREATE OR REPLACE FUNCTION log_reservation_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status_id IS DISTINCT FROM NEW.status_id THEN
    INSERT INTO reservation_activity_log (
      org_id, reservation_id, event_type,
      field_name, old_value, new_value,
      changed_by, changed_at
    ) VALUES (
      NEW.org_id, NEW.id, 'reservation_status_changed',
      'status_id', OLD.status_id::text, NEW.status_id::text,
      NEW.updated_by, NOW()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reservation_status_log
AFTER UPDATE ON reservations
FOR EACH ROW EXECUTE FUNCTION log_reservation_status_change();
```

Este patrón garantiza que el log se escriba siempre, incluso cuando el cambio viene de la API externa, sin depender de que la Edge Function lo haga manualmente.

### 8.5 Qué debería quedarse solo interno

| Componente | Razón |
|-----------|-------|
| Sistema de correspondencia (reglas, templates) | Lógica de negocio interna, no relevante para integración |
| Chat con IA (SRObot) | Funcionalidad interna de soporte |
| Gestión de usuarios y roles | Administración interna |
| Configuración de Gmail/SMTP | Infraestructura interna |
| Generación de bloques de tiempo | Automatización interna |
| Documentos de conocimiento | Base de conocimiento interna |

### 8.6 Arquitectura recomendada para API externa

```
App Externa
    │
    ▼
[API Gateway Layer]  ← Nuevas Edge Functions con prefijo /api-v1/
    │                   - Autenticación con JWT de usuario de servicio
    │                   - Rate limiting (Supabase tiene límites nativos)
    │                   - Versionado explícito
    │
    ▼
[Business Logic Layer]  ← Edge Functions existentes (internas)
    │                      - correspondence-process-event
    │                      - generate-client-pickup-blocks
    │                      - smtp-send
    │
    ▼
[Data Layer]  ← Supabase DB con RLS + Triggers
    │            - reservations
    │            - casetilla_ingresos / casetilla_salidas
    │            - dock_time_blocks
    │            - correspondence_outbox
    │
    ▼
[External Services]  ← OpenAI, Gmail SMTP
```

**Para autenticación de sistemas externos**, la recomendación es:
1. Crear un usuario de servicio en Supabase Auth con email/password dedicado
2. El sistema externo hace login con ese usuario para obtener un JWT
3. Usar ese JWT en todas las llamadas a la API
4. Alternativamente, explorar Supabase Service Role con restricciones de IP (si el plan lo permite)

---

## 9. Archivos Auditados

### Edge Functions
- `supabase/functions/api-v1-reservations-get/index.ts`
- `supabase/functions/api-v1-reservations-patch-status/index.ts`
- `supabase/functions/correspondence-dispatch-event/index.ts`
- `supabase/functions/correspondence-process-event/index.ts`
- `supabase/functions/correspondence-retry-email/index.ts`
- `supabase/functions/admin-users/index.ts`
- `supabase/functions/admin-user-access/index.ts`
- `supabase/functions/ask-sro-chat/index.ts`
- `supabase/functions/gmail-callback/index.ts`
- `supabase/functions/gmail-connection-status/index.ts`
- `supabase/functions/smtp-send/index.ts`
- `supabase/functions/generate-client-pickup-blocks/index.ts`
- `supabase/functions/setup-admin-permissions/index.ts`
- `supabase/functions/process-knowledge-document/index.ts`

### Servicios Frontend
- `src/services/dashboardService.ts`
- `src/services/calendarService.ts`
- `src/services/emailTriggerService.ts`
- `src/services/correspondenceService.ts`
- `src/services/casetillaService.ts`
- `src/services/clientsService.ts`
- `src/services/providersService.ts`
- `src/services/warehousesService.ts`
- `src/services/adminService.ts`
- `src/services/activityLogService.ts`

---

*Fin del reporte — API_REPORT.md generado el 2026-04-22*
