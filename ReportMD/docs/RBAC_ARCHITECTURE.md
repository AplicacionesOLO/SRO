# RBAC_ARCHITECTURE.md — Suite OLO / App Hub Manager

> **Versión**: Build 1198 | **Fecha**: 2026-06-30  
> **Fuente**: Código fuente real de AuthContext, usePermissions, useUserScope, ProtectedRoute, RequirePermission, Edge Functions, RLS  
> **Propósito**: Documentar TODO el sistema de seguridad: autenticación, autorización, permisos, RLS, Edge Functions, Service Role, JWT, OAuth.

---

## 1. Flujo completo de seguridad

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. AUTENTICACIÓN                                                      │
│                                                                       │
│  Usuario → Login Page → supabase.auth.signInWithPassword(email, pw)  │
│    │                                                                  │
│    └──→ Supabase Auth → JWT (access_token + refresh_token)           │
│           │                                                           │
│           └──→ AuthContext.loadUserProfile(userId)                    │
│                  │                                                    │
│                  ├── user_org_roles (RLS) → role_id, org_id           │
│                  │   │                                                │
│                  │   ├── Si no hay row → pendingAccess=true           │
│                  │   │   └── redirect "/access-pending"               │
│                  │   │                                                │
│                  │   └── Si hay row → role = roles.name               │
│                  │                                                    │
│                  └── loadPermissions(role_id)                         │
│                        │                                              │
│                        └── role_permissions (RLS) → Set<string>        │
│                                                                       │
│ 2. AUTORIZACIÓN (routing)                                             │
│                                                                       │
│  ProtectedRoute → ¿user !== null?                                     │
│    │                                                                  │
│    ├── No → redirect "/login"                                         │
│    └── Sí → RequirePermission                                         │
│              │                                                        │
│              ├── pendingAccess? → redirect "/access-pending"          │
│              ├── requireAnyAdmin? → ¿algún permiso "admin.*"?        │
│              └── permission? → can(permission)                        │
│                                                                       │
│ 3. AUTORIZACIÓN (UI)                                                  │
│                                                                       │
│  canLocal(permission) → permissionsSet.has(permission)                │
│  hasRole(role) → user.role === role                                   │
│                                                                       │
│ 4. SEGREGACIÓN DE DATOS                                               │
│                                                                       │
│  useUserScope(userId, orgId)                                         │
│    │                                                                  │
│    ├── user_warehouse_access → allowedWarehouseIds                    │
│    ├── user_country_access → filtered warehouses by country           │
│    ├── warehouse_clients → allowedClientIds                          │
│    └── user_clients → additional client restriction                   │
│                                                                       │
│  ActiveWarehouseContext → warehouse activo + effectiveWarehouseIds   │
│                                                                       │
│ 5. EDGE FUNCTIONS                                                     │
│                                                                       │
│  Frontend → supabase.functions.invoke('fn-name', { body })           │
│    │                                                                  │
│    └── Edge Function:                                                 │
│        1. Validar JWT manual (supabase.auth.getUser(token))           │
│        2. Verificar pertenencia a org (user_org_roles)                │
│        3. Verificar permisos específicos (role_permissions)           │
│        4. Service role client para operaciones DB                     │
│        5. Aplicar lógica de negocio                                   │
│                                                                       │
│ 6. RLS (PostgreSQL)                                                   │
│                                                                       │
│  Cada query → PostgreSQL evalúa políticas RLS por fila               │
│    - org_id = auth.jwt() -> 'org_id' (si existe)                     │
│    - Políticas por tabla: SELECT/INSERT/UPDATE/DELETE                │
│    - Service role = bypass RLS completo                               │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Dónde se valida cada cosa

| Qué se valida | Dónde | Quién | Cómo |
|--------------|-------|-------|------|
| Sesión válida (JWT) | Frontend - Router | `ProtectedRoute` | `user !== null` después de `loading=false` |
| Token expirado | Frontend - Global | `AuthContext` | `unhandledrejection` + `onAuthStateChange` + `getSession` |
| Permiso para ver página | Frontend - Router | `RequirePermission` | `can(permission)` o `requireAnyAdmin` |
| Permiso para ver botón | Frontend - UI | `canLocal(permission)` | `permissionsSet.has(permission)` |
| Pertenencia a org | Edge Functions | Cada EF manualmente | `user_org_roles` query con `user_id + org_id` |
| Permiso específico en EF | Edge Functions | Cada EF manualmente | `role_permissions` query + `permSet.has(...)` |
| Acceso a fila (CRUD) | PostgreSQL | RLS policies | `org_id` matching + políticas por tabla |
| Segregación por warehouse | Frontend | `useUserScope` | `user_warehouse_access` + `user_country_access` |
| Segregación por cliente | Frontend | `useUserScope` | `user_clients` + `warehouse_clients` |
| Segregación por proveedor | Frontend y EF | `useUserScope` / `api-v1-*` | `user_providers` + `provider_warehouses` |
| Same-day cutoff | Edge Function | `create-reservation` | `client_rules.same_day_cutoff_enabled` + hora local |
| Cliente Retira bypass | Frontend | `useBlockedStatuses` | `client_rules.bypass_user_ids` + `bypass_role_ids` |
| Documento accesible (chat) | Edge Function | `ask-sro-chat` | `access_level` + `visibility_mode` + `knowledge_document_roles/permissions` |

---

## 3. Permisos existentes

Los permisos se almacenan en la tabla `permissions` y se asignan a roles vía `role_permissions`.

### 3.1 Permisos de menú / navegación

| Permiso | Controla |
|---------|---------|
| `menu.dashboard.view` | Acceso al Dashboard |
| `manpower.view` | Acceso al módulo Manpower |
| `casetilla.view` | Acceso al módulo Casetilla |
| `warehouses.view` | Acceso a Almacenes |
| `chat.ask` | Acceso al Chat IA |
| `chat.documents.manage` | Acceso a Base de Conocimiento |
| `chat.audit.view` | Acceso a Auditoría de Chat |

### 3.2 Permisos de administración

| Permiso | Controla |
|---------|---------|
| `admin.users.view` | Ver usuarios |
| `admin.users.create` | Crear usuarios |
| `admin.users.update` | Editar usuarios |
| `admin.users.delete` | Eliminar usuarios |
| `admin.users.assign_roles` | Asignar roles |
| `admin.roles.view` | Ver roles |
| `admin.matrix.view` | Ver matriz de permisos |
| `admin.matrix.update` | Modificar matriz de permisos |
| `admin.clients.view` | Ver/editar clientes |
| `correspondence.view` | Ver/editar correspondencia |

### 3.3 Permisos de chat (niveles de acceso)

| Permiso | Controla |
|---------|---------|
| `chat.answers.basic` | Acceso a documentos basic |
| `chat.answers.extended` | Acceso a documentos extended |
| `chat.answers.internal` | Acceso a documentos internal |

### 3.4 Quién puede asignar/quitar permisos

- Solo usuarios con `admin.matrix.update` pueden modificar `role_permissions`
- La operación se hace vía `adminService.bulkUpdateRolePermissions()`
- Cada cambio genera entry en `admin_audit_log`

---

## 4. Funcionamiento de los Guards

### 4.1 ProtectedRoute

```typescript
// src/router/ProtectedRoute.tsx
// 1. loading=true → spinner "Verificando sesión..."
// 2. loading=false, user=null, sessionExpired=false → redirect /login con returnUrl
// 3. sessionExpired=true → SessionExpiredModal overlay
// 4. user=null después de cargar → null (el useEffect redirige)
// 5. user!=null → render children
```

### 4.2 RequirePermission

```typescript
// src/router/RequirePermission.tsx
// 1. pendingAccess=true → redirect /access-pending
// 2. loading=true → spinner "Verificando permisos..."
// 3. requireAnyAdmin=true → verificar si algún permiso empieza con "admin."
// 4. permission='x' → can('x')
// 5. Sin permiso → Navigate a fallbackPath
```

### 4.3 canLocal

```typescript
// src/contexts/AuthContext.tsx
canLocal(permission: string): boolean {
  if (permissionsSet === null) return false; // no cargado aún
  return permissionsSet.has(permission);
}
```

---

## 5. Funcionamiento de useUserScope

### 5.1 Algoritmo de segregación

```
1. Cargar user_country_access → allowedCountryIds (null = sin restricción)
2. Cargar user_warehouse_access:
   - Si tiene row con restricted=false → rawWarehouseIds = null (sin restricción)
   - Si tiene rows con restricted=true → rawWarehouseIds = [warehouse_ids]
   - Si no tiene rows + rol global (ADMIN/SUPERVISOR/Full Access) → rawWarehouseIds = null
   - Si no tiene rows + rol operativo → rawWarehouseIds = []
3. INTERSECCIÓN por país:
   - Si allowedCountryIds != null → filtrar warehouses por country_id ∈ allowedCountryIds
4. Cargar warehouses (con timezone, location)
5. Cargar warehouse_clients → clientes disponibles
6. Cargar user_clients → si hay restricción, intersectar con warehouse_clients
```

### 5.2 Cache

- Cache global (`scopeCache`) compartida entre todas las instancias de `useUserScope`
- Key: `{userId}:{orgId}`
- TTL: 5 minutos (`CACHE_TTL_MS = 5 * 60 * 1000`)
- Invalidación: `invalidateScopeAndReload()` limpia todo el cache
- Pub/Sub: listeners globales para reload automático

### 5.3 Roles globales (hardcodeados)

```typescript
// src/hooks/useUserScope.ts:17
const GLOBAL_ACCESS_ROLES = ['ADMIN', 'SUPERVISOR', 'Full Access'];
```

Estos roles, cuando NO tienen filas en `user_warehouse_access`, ven todos los warehouses. Si TIENEN filas con `restricted=true`, quedan restringidos a esos warehouses específicos.

---

## 6. Funcionamiento de usePermissions

```typescript
// src/hooks/usePermissions.ts
// Wrapper sobre AuthContext que expone:
- orgId: user.orgId (de user_org_roles)
- userId: user.id
- can(permission): alias de canLocal
- hasRole(role): user.role === role
- loading: authLoading || permissionsLoading
- permissionsSet: Set<string> de permisos
```

---

## 7. Funcionamiento de AuthContext

### 7.1 Inicialización

```
1. getSession() → si hay sesión → loadUserProfile(userId, email)
2. onAuthStateChange listener:
   - TOKEN_REFRESHED sin session → clearCorruptedSession(wasAuthenticated)
   - SIGNED_OUT sin session → limpiar todo
   - Nueva sesión → loadUserProfile
3. unhandledrejection global → detecta refresh token errors
```

### 7.2 loadUserProfile

```
1. Probar RLS con query a user_org_roles (limit 5)
2. Query principal: user_org_roles JOIN roles WHERE user_id = userId
3. Si no hay row:
   - Cargar profiles.name
   - Crear fallbackUser con role='OPERADOR', orgId=null
   - pendingAccess = true
4. Si hay row:
   - role = roles.name
   - orgId = user_org_roles.org_id
   - Llamar loadPermissions(role_id, org_id)
```

### 7.3 loadPermissions

```
1. Probar RLS con query a role_permissions (limit 5)
2. Query principal: role_permissions JOIN permissions WHERE role_id = roleId
3. Construir Set<string> con los permission names
```

---

## 8. Edge Functions y validación JWT

### 8.1 Tipos de Edge Functions por seguridad

| Tipo | Verificación JWT | Service Role | Ejemplos |
|------|-----------------|--------------|----------|
| **Validación manual JWT** | Manual (`supabase.auth.getUser(token)`) | Sí | `create-reservation`, `ask-sro-chat`, `admin-user-access`, `process-knowledge-document`, `correspondence-dispatch-event`, `api-v1-*` |
| **Sin validación JWT** | Ninguna | Sí | `smtp-send`, `admin-users`, `correspondence-process-event`, `auto-mark-no-show` (tiene modo cron), `generate-client-pickup-blocks`, `gmail-callback` |
| **Cron / Interno** | Header `X-Internal-Cron-Secret` | Sí | `auto-mark-no-show` (modo cron) |

### 8.2 Riesgo: Edge Functions sin validación JWT

| Función | Riesgo | Mitigación actual |
|---------|--------|-------------------|
| `smtp-send` | **CRÍTICO**: cualquiera que conozca la URL puede enviar correos | Ninguna — sin JWT validation |
| `admin-users` | **CRÍTICO**: cualquiera puede crear/listar usuarios | Ninguna — sin JWT validation |
| `generate-client-pickup-blocks` | **BAJO**: solo crea bloques de horario, operación idempotente | Sin JWT, pero requiere `org_id` válido |

### 8.3 Validación manual de JWT (patrón estándar)

```typescript
// Patrón usado en create-reservation, ask-sro-chat, admin-user-access, etc.
const authHeader = req.headers.get('Authorization');
const token = authHeader.replace('Bearer ', '');

const supabase = createClient(url, SERVICE_ROLE_KEY);
const { data: { user }, error: authError } = await supabase.auth.getUser(token);

if (authError || !user) {
  return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 });
}
```

---

## 9. Reglas hardcodeadas

| Regla | Archivo | Valor | Impacto |
|-------|---------|-------|---------|
| Roles globales | `useUserScope.ts:17` | `['ADMIN', 'SUPERVISOR', 'Full Access']` | Determina quién ve todos los warehouses |
| UserRole type | `AuthContext.tsx:6` | `'ADMIN' \| 'SUPERVISOR' \| 'OPERADOR' \| 'CASETILLA'` | Si se agrega un rol nuevo, hay que modificar código |
| TTL cache scope | `useUserScope.ts:67` | `5 * 60 * 1000` (5 min) | Cambios de acceso tardan hasta 5 min en verse |
| TTL cache segregación | `calendarService.ts` | `2 * 60 * 1000` (2 min) | Docks no actualizan inmediatamente |
| TTL cache estático | `calendarService.ts` | `5 * 60 * 1000` (5 min) | Statuses y categorías |
| SYSTEM_USER_ID | `generate-client-pickup-blocks/index.ts` | `'00000000-0000-0000-0000-000000000000'` | Bloques creados por sistema tienen este UUID |
| Días de bloques | `clientPickupRulesService.ts` | `30` días | No configurable por regla |
| Timezone default | Varios archivos | `'America/Costa_Rica'` | Si se agrega warehouse en otro país, hay que configurar |
| Modelo OpenAI | `ask-sro-chat/index.ts` | `'gpt-4o-mini'` | No configurable por org |
| CORS headers | Todas las EF | `'Access-Control-Allow-Origin': '*'` | Abierto a cualquier origen |
| DRAFT_MAX_AGE | `useReservationDraft.ts` | `7 * 24 * 60 * 60 * 1000` (7 días) | Borradores expiran en 7 días |

---

## 10. Reglas que vienen de BD (configurables)

| Regla | Tabla | Columna |
|-------|-------|---------|
| Permisos del rol | `role_permissions` | `role_id → permission_id` |
| Acceso a warehouses | `user_warehouse_access` | `warehouse_id, restricted` |
| Acceso a países | `user_country_access` | `country_id` |
| Acceso a clientes | `user_clients` | `client_id` |
| Acceso a proveedores | `user_providers` | `provider_id` |
| Cutoff del mismo día | `client_rules` | `same_day_cutoff_enabled, same_day_cutoff_hours` |
| Bypass users cutoff | `client_same_day_bypass_users` | `user_id` |
| Estados bloqueados | `client_rules` | `blocked_status_ids` |
| Bypass roles/usuarios | `client_rules` | `bypass_role_ids, bypass_user_ids` |
| Reglas Cliente Retira | `client_pickup_rules` | `block_minutes, reblock_before_minutes, is_active` |
| Reglas de correspondencia | `correspondence_rules` | `event_type, status_from_id, status_to_id, recipients_*` |
| System prompt del chat | `chat_prompt_configs` | `system_prompt` |
| Tolerancia No-Show | `warehouses` | `no_show_tolerance_minutes` |

---

## 11. Posibles escalaciones y bypass

### 11.1 Bypass de permisos vía DevTools

Un usuario puede llamar `supabase.from('reservations').delete()` desde la consola del navegador si RLS no está correctamente configurado. **Todo depende de RLS**.

### 11.2 Bypass de Edge Function

Si una Edge Function no valida JWT, cualquier persona que conozca la URL puede invocarla directamente con curl/Postman.

### 11.3 Privilege escalation por role assignment

Si un admin asigna el rol `ADMIN` a un usuario, ese usuario obtiene acceso global (por `GLOBAL_ACCESS_ROLES`). No hay protección adicional (como MFA para admins).

### 11.4 Escalación vía service role

Si el `SUPABASE_SERVICE_ROLE_KEY` se filtra (ej. incluido en el bundle de frontend), el atacante tiene acceso total a la DB (bypass RLS) y puede crear/eliminar cualquier dato.

**Estado actual**: El service role key NO está en el frontend. Solo se usa en Edge Functions vía `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`.

---

## 12. Validaciones duplicadas

| Validación | Dónde se duplica |
|-----------|-----------------|
| Pertenencia a org | `AuthContext` + `ProtectedRoute` + `RequirePermission` + cada Edge Function |
| Permiso `chat.ask` | `RequirePermission` (ruta) + `ask-sro-chat` EF (re-verifica) |
| Permisos admin | `RequirePermission(requireAnyAdmin)` + `canLocal` en botones + `admin-users` EF |
| Segregación warehouse | `useUserScope` (frontend) + `api-v1-*` EF (recalcula) |

---

## 13. Validaciones faltantes

| Qué falta | Dónde | Riesgo |
|----------|-------|--------|
| JWT validation en `smtp-send` | `supabase/functions/smtp-send/index.ts` | CRÍTICO |
| JWT validation en `admin-users` | `supabase/functions/admin-users/index.ts` | CRÍTICO |
| Rate limiting en Edge Functions | Todas las EF | Medio |
| MFA para roles admin | Supabase Auth | Alto |
| Audit log de accesos denegados | No existe | Bajo |
| CSRF protection | No existe (SPA con JWT en memoria) | Bajo |
| Content Security Policy | No configurado | Alto |