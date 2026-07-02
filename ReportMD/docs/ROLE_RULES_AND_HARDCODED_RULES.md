# REPORTE 3: REGLAS POR ROL + REGLAS QUEMADAS + REGLAS NO CONFIGURABLES
## Suite OLO / App Hub Manager — Auditoría Técnica

**Fecha**: 2026-06-30

---

# PARTE A: REGLAS POR ROL

## 1. ROLES DEFINIDOS EN EL SISTEMA

Según el código en `AuthContext.tsx`:
```typescript
export type UserRole = 'ADMIN' | 'SUPERVISOR' | 'OPERADOR' | 'CASETILLA';
```

**NOTA**: Estos 4 roles son los únicos definidos en TypeScript. Sin embargo, en la tabla `roles` de Supabase pueden existir más roles (ej. "Full Access"). Las reglas de negocio en el código solo reconocen estos 4 tipos + cualquier rol que empiece con "admin." en permisos.

### Roles usados en lógica de negocio hardcodeada:

| Rol | Dónde se usa | Propósito |
|-----|-------------|-----------|
| `ADMIN` | `useUserScope.ts` (GLOBAL_ACCESS_ROLES) | Acceso global sin restricción de warehouse |
| `SUPERVISOR` | `useUserScope.ts` (GLOBAL_ACCESS_ROLES) | Acceso global sin restricción de warehouse |
| `Full Access` | `useUserScope.ts` (GLOBAL_ACCESS_ROLES) | Acceso global sin restricción de warehouse |
| `CASETILLA` | `ProtectedRoute.tsx` (implícito vía home redirect) | Redirige a `/casetilla` en vez de `/calendario` |

---

## 2. MATRIZ DE PERMISOS POR ROL

### ADMIN
| Permiso | Frontend | Backend (EF) | RLS |
|---------|----------|-------------|-----|
| Ver apps | ✅ `admin.*` (todos los que empiezan con admin.) | Validación manual en EF | Políticas RLS por org_id |
| Ver usuarios | ✅ `admin.users.view` | `admin-users` lista todos | RLS en `profiles` |
| Crear usuarios | ✅ `admin.users.create` | `admin-users` action=create | Service role bypass |
| Editar usuarios | ✅ `admin.users.update` | `admin-users` action=update_role | Service role bypass |
| Cambiar roles | ✅ `admin.users.assign_roles` | `admin-users` action=update_role | Service role bypass |
| Asignar permisos | ✅ `admin.matrix.update` | `adminService.bulkUpdateRolePermissions` | RLS en `role_permissions` |
| Ver auditoría | ✅ `admin.matrix.view` | - | RLS en `activity_log`, `admin_audit_log` |
| Ver warehouses | ✅ `warehouses.view` | - | RLS por org_id |
| Gestionar warehouses | ✅ `warehouses.manage` (inferido) | - | RLS + service role |
| Gestionar clientes | ✅ `admin.clients.view` + `.create/.update` | - | RLS por org_id |
| Gestionar correspondencia | ✅ `correspondence.view` + `.manage` | - | RLS por org_id |
| Chat | ✅ `chat.ask` + `chat.answers.*` | `ask-sro-chat` valida permisos | RLS en `chat_sessions`, `chat_messages` |
| Gestionar conocimiento | ✅ `chat.documents.manage` | - | RLS en `knowledge_documents` |

### SUPERVISOR
| Permiso | Frontend | Backend (EF) | RLS |
|---------|----------|-------------|-----|
| Ver calendario | ✅ `menu.calendario.view` | - | RLS por user_warehouse_access |
| Ver reservas | ✅ `menu.reservas.view` | - | RLS por user_warehouse_access |
| Ver andenes | ✅ `menu.andenes.view` | - | RLS por user_warehouse_access |
| Crear/editar reservas | ✅ (implícito si ve calendario) | `create-reservation` valida user_org_roles | RLS en reservations |
| Ver casetilla | ✅ `menu.casetilla.view` | - | RLS por user_warehouse_access |
| Ver dashboard | ✅ `menu.dashboard.view` | - | RLS por user_warehouse_access |
| Ver manpower | ✅ `manpower.view` | - | RLS |
| Acceso global sin restricción | ✅ (por GLOBAL_ACCESS_ROLES) | - | Si tiene `user_warehouse_access.restricted=false` |
| Panel admin | ❌ (solo si tiene permisos admin.*) | - | - |

### OPERADOR
| Permiso | Frontend | Backend (EF) | RLS |
|---------|----------|-------------|-----|
| Ver calendario | ✅ `menu.calendario.view` | - | RLS restringido por user_warehouse_access |
| Ver reservas | ✅ `menu.reservas.view` | - | RLS restringido |
| Crear/editar reservas | ✅ (si tiene acceso al dock) | `create-reservation` | RLS |
| Ver casetilla | ✅ `menu.casetilla.view` | - | RLS restringido |
| Ver andenes | ✅ `menu.andenes.view` | - | RLS restringido |
| Acceso global | ❌ | - | Siempre restringido por user_warehouse_access |

### CASETILLA
| Permiso | Frontend | Backend (EF) | RLS |
|---------|----------|-------------|-----|
| Solo casetilla | ✅ `menu.casetilla.view` | - | RLS restringido |
| Otros módulos | ❌ | - | Redirigido a /casetilla desde HomeRedirect |
| Registrar ingreso/salida | ✅ | `casetillaService` | RLS en casetilla_ingresos, casetilla_salidas |

---

## 3. VALIDACIONES POR CAPA

| Validación | Frontend | Backend (Edge Function) | RLS (Supabase) |
|------------|----------|------------------------|----------------|
| Usuario pertenece a la org | `usePermissions.orgId` | `admin-users`: verifica user_org_roles | Políticas `org_id = auth.jwt()...` |
| Permiso para ver página | `RequirePermission` (canLocal) | Algunas EF validan permisos (ask-sro-chat) | ❌ No valida permisos, solo org_id |
| Permiso para crear reserva | `useBlockedStatuses` (bypass) | `create-reservation`: valida same-day cutoff | RLS: usuario debe tener acceso al dock |
| Permiso para editar reserva | `useBlockedStatuses` (bloqueo por estado) | ❌ No validado en backend | RLS: usuario dueño o admin |
| Permiso para cambiar estado | `useBlockedStatuses` | ❌ No validado en backend | RLS: política de update en reservations |
| Acceso a warehouse | `useUserScope` (intersección) | ❌ Validación parcial en algunas EF | RLS: user_warehouse_access |
| Acceso a cliente | `useUserScope.allowedClientIds` | ❌ No validado | RLS: warehouse_clients |
| Cutoff mismo día | ❌ Solo validado en EF | `create-reservation`: validación completa | ❌ No validado a nivel DB |

**CONCLUSIÓN**: Hay validaciones que SOLO existen en frontend (bypass de bloqueo por estado, acceso a cliente). Si un usuario malicioso llama directo a la API de Supabase, podría saltarse algunas de estas validaciones si RLS no las cubre.

---

# PARTE B: REGLAS QUEMADAS (HARDCODED)

## 1. Roles y permisos

| Regla | Archivo | Valor quemado | Impacto | Debería ser configurable | Cómo |
|-------|---------|---------------|---------|-------------------------|------|
| Roles con acceso global | `src/hooks/useUserScope.ts:17` | `['ADMIN', 'SUPERVISOR', 'Full Access']` | Solo estos roles pueden ver todo | ✅ Sí | Flag `is_global_access` en tabla `roles` |
| Roles definidos en TypeScript | `src/contexts/AuthContext.tsx:6` | `'ADMIN' \| 'SUPERVISOR' \| 'OPERADOR' \| 'CASETILLA'` | Si se crea un rol nuevo en DB, no es reconocido | ✅ Sí | Leer roles de DB, no de union type |
| Prioridad de bypass de bloqueo | `src/hooks/useBlockedStatuses.ts:26-27` | `admin.users.create \|\| admin.matrix.update` | Hardcodea qué permisos dan bypass | ✅ Sí | Campo `is_privileged` en tabla `roles` |
| RequireAnyAdmin | `src/router/RequirePermission.tsx:27` | `p.startsWith('admin.')` | Cualquier permiso admin.* da acceso | ⚠️ Parcial | Ya usa prefijo, pero el prefijo es fijo |

## 2. Límites y timeouts

| Regla | Archivo | Valor | Impacto |
|-------|---------|-------|---------|
| TTL caché de scope | `src/hooks/useUserScope.ts:67` | `5 * 60 * 1000` (5 min) | Cambios en accesos tardan 5 min en reflejarse |
| TTL caché de segregación docks | `src/services/calendarService.ts` | `2 * 60 * 1000` (2 min) | Cambios en client_docks tardan 2 min |
| TTL caché de statuses/categorías | `src/services/calendarService.ts` | `5 * 60 * 1000` (5 min) | Cambios en estados/categorías tardan 5 min |
| TTL borrador de reserva | `src/hooks/useReservationDraft.ts:71` | `7 * 24 * 60 * 60 * 1000` (7 días) | Borradores persisten 7 días |
| Debounce save draft | `src/hooks/useReservationDraft.ts` | `500` ms | Guardado de borrador cada 500ms |
| Página de auditoría chat | `src/hooks/useChatAudit.ts:6` | `PAGE_SIZE = 50` | 50 logs por página |
| Límite de reservas no-show | `supabase/functions/auto-mark-no-show/index.ts` | `limit(500)` | Máximo 500 reservas procesadas por ejecución |
| Batch insert bloques | `supabase/functions/generate-client-pickup-blocks/index.ts` | `batchSize = 200` | 200 bloques por batch |
| Max auth users listados | `supabase/functions/admin-users/index.ts` | `page > 20` (1000 users max) | Si hay más de 1000 usuarios, algunos no se listan |
| Días de bloques "Cliente Retira" | `src/services/clientPickupRulesService.ts:14` | `days_ahead: 30` | Bloques se generan 30 días hacia adelante |

## 3. Nombres de buckets y paths

| Regla | Archivo | Valor | Impacto |
|-------|---------|-------|---------|
| Bucket QR | `src/services/calendarService.ts` | `'reservation-qrs'` | Si el bucket no existe, no hay QR |
| Bucket archivos | `src/services/calendarService.ts` | `'reservation-files'` | Si no existe, no se pueden subir archivos |
| Path QR | `src/services/calendarService.ts` | `${orgId}/reservations/${reservationId}/qr.png` | Estructura fija |

## 4. URLS y endpoints

| Regla | Archivo | Valor | Impacto |
|-------|---------|-------|---------|
| Supabase URL en fetch directo | `src/services/chatService.ts:69` | `${SUPABASE_URL}/functions/v1/ask-sro-chat` | Hardcodea el path de la EF |
| Supabase URL en email trigger | `src/services/emailTriggerService.ts` | `${SUPABASE_URL}/functions/v1/correspondence-process-event` | Hardcodea path |
| Redirect OAuth Google | `src/contexts/AuthContext.tsx` | `redirectTo: window.location.origin + basePath` | URL de callback fija |
| Default de timezone | Varios archivos | `'America/Costa_Rica'` | Timezone por defecto |

## 5. Estados y códigos

| Regla | Archivo | Valor | Impacto |
|-------|---------|-------|---------|
| Códigos de estado buscados | `src/services/casetillaService.ts` | `'ARRIVED_PENDING_UNLOAD'`, `'LLEGO_AL_ALMACEN'`, `'DISPATCHED'`, `'NO_SHOW'` | Si se crean estados con otros códigos, la lógica falla |
| Estados operativos | `src/services/calendarService.ts` | `eq('is_active', true)` en varias queries | Solo estados activos |
| SYSTEM_USER_ID | `supabase/functions/generate-client-pickup-blocks/index.ts` | `'00000000-0000-0000-0000-000000000000'` | Usuario sistema para bloques automáticos |
| Default timezone CR | `supabase/functions/generate-client-pickup-blocks/index.ts` | `'America/Costa_Rica'` con offset `'-06:00'` | Solo funciona para CR |
| Timezone por defecto en warehouses | `src/services/warehousesService.ts` | `'America/Costa_Rica'` | Nuevos warehouses usan CR por defecto |
| Horario hábil por defecto | `src/services/warehousesService.ts:8-9` | `'06:00:00'` / `'17:00:00'` | Start/end time por defecto |
| Slot interval por defecto | `src/services/warehousesService.ts` | `60` minutos | Intervalo de slots por defecto |

## 6. Extensiones y archivos

| Regla | Archivo | Valor | Impacto |
|-------|---------|-------|---------|
| Sanitización de nombres | `src/services/calendarService.ts` | `replace(/[^\w.\-()]/g, '')` | Restringe caracteres en nombres de archivo |
| Cache-Control uploads | `src/services/calendarService.ts` | `cacheControl: '3600'` | 1 hora de caché en CDN |
| Signed URL expiry | `src/services/calendarService.ts` | `60 * 60` (1 hora) | URLs firmadas expiran en 1 hora |

## 7. OpenAI / Chat

| Regla | Archivo | Valor | Impacto |
|-------|---------|-------|---------|
| Modelo OpenAI | `supabase/functions/ask-sro-chat/index.ts` | `'gpt-4o-mini'` | Modelo fijo, no configurable |
| Temperatura | `supabase/functions/ask-sro-chat/index.ts` | `0.3` | Fija |
| Max output tokens | `supabase/functions/ask-sro-chat/index.ts` | `1800` | Fijo |
| Max resultados file_search | `supabase/functions/ask-sro-chat/index.ts` | `5` | Fijo |
| Límite mensajes previos | `supabase/functions/ask-sro-chat/index.ts` | `limit(20)` | 20 mensajes de contexto |
| Niveles de acceso chat | `supabase/functions/ask-sro-chat/index.ts` | `basic:1, extended:2, internal:3` | Mapeo fijo |

## 8. SMTP

| Regla | Archivo | Valor | Impacto |
|-------|---------|-------|---------|
| Host SMTP default | `supabase/functions/smtp-send/index.ts` | `'smtp.gmail.com'` | Si no hay SMTP_HOST secret, usa Gmail |
| Puerto SMTP default | `supabase/functions/smtp-send/index.ts` | `587` | Fijo |
| From address default | `supabase/functions/smtp-send/index.ts` | `'no-reply-sro@ologistics.com'` | Fijo si no hay SMTP_FROM |

---

# PARTE C: REGLAS NO CONFIGURABLES DESDE FRONTEND

| Regla | Categoría | Recomendación |
|-------|-----------|---------------|
| Roles disponibles | Debe seguir siendo backend | ✅ OK - Roles se crean en DB por admin |
| Permisos por rol | **Conviene hacer configurable** | Ya lo es vía Matriz de Permisos |
| Duración de sesión | Debe seguir siendo backend | ✅ OK - Controlado por Supabase Auth |
| MFA obligatorio | Debe seguir siendo backend | ⚠️ No implementado aún |
| Límites de storage | **Conviene hacer configurable** | Podría exponerse en panel admin |
| Tipos de archivo permitidos | **Conviene hacer configurable** | No hay validación de tipo MIME |
| Políticas RLS | No debe ser configurable por seguridad | ✅ OK - Solo vía migrations |
| Buckets | No debe ser configurable por seguridad | ✅ OK - Creados por EF de setup |
| Google OAuth | No debe ser configurable por seguridad | ✅ OK - Configurado en Supabase dashboard |
| OpenAI API key | No debe ser configurable por seguridad | ✅ OK - En secrets de Edge Function |
| SMTP credentials | No debe ser configurable por seguridad | ✅ OK - En secrets de Edge Function |
| CSP | **Conviene hacer configurable** | No hay CSP configurado actualmente |
| Auditoría / retención logs | **Conviene hacer configurable** | No hay política de retención definida |
| Caché TTLs | **Conviene hacer configurable** | 5 min scope, 2 min docks, etc. |
| Días de generación de bloques | **Conviene hacer configurable** | 30 días fijo |
| Modelo OpenAI | **Conviene hacer configurable** | gpt-4o-mini fijo |