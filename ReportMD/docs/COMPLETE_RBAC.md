# COMPLETE RBAC — Suite OLO / App Hub Manager

> **Documentación Enterprise-Grade | Segunda Pasada**
> Basado exclusivamente en el código fuente (v1199)
> Documenta CADA validación, dónde ocurre, y qué capa la ejecuta.

---

## CADENA COMPLETA DE AUTORIZACIÓN

```
Usuario
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│ 1. AUTENTICACIÓN (Supabase Auth)                             │
│    ├── login(email, password) → JWT access_token            │
│    ├── loginWithGoogle() → OAuth → JWT                      │
│    └── onAuthStateChange → refresh automático               │
└──────────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. PERFIL (AuthContext.loadUserProfile)                      │
│    ├── user_org_roles → role_id, org_id                     │
│    ├── roles.name → UserRole (ADMIN|SUPERVISOR|OPERADOR|CASETILLA)│
│    ├── profiles → name, email                               │
│    └── Si NO existe user_org_roles → pendingAccess=true     │
└──────────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│ 3. PERMISOS (AuthContext.loadPermissions)                    │
│    ├── role_permissions JOIN permissions → Set<string>      │
│    ├── canLocal(permission) → permissionsSet.has(permission) │
│    └── usePermissions() → { orgId, userId, can, hasRole }   │
└──────────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│ 4. SCOPE DE DATOS (useUserScope)                             │
│    ├── user_warehouse_access → allowedWarehouseIds          │
│    ├── user_country_access → intersección por país          │
│    ├── warehouse_clients → allowedClientIds                 │
│    ├── user_clients → restricción adicional                 │
│    ├── user_providers → restricción por proveedor           │
│    ├── Regla: globalAccess si GLOBAL_ACCESS_ROLES + sin     │
│    │         restricted=true en user_warehouse_access       │
│    └── Cache: 5 min TTL, invalidable globalmente            │
└──────────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│ 5. ROUTER (ProtectedRoute + RequirePermission)              │
│    ├── ProtectedRoute: loading→spinner, pendingAccess→      │
│    │   /access-pending, !user→/login, CASETILLA→/casetilla │
│    ├── RequirePermission: canLocal(permission) → 403        │
│    └── Ambas son VALIDACIONES FRONTEND (bypasseables)       │
└──────────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│ 6. EDGE FUNCTIONS (validación backend)                      │
│    ├── JWT manual → supabase.auth.getUser(token)            │
│    ├── Service Role → poder total (solo en funciones admin) │
│    ├── Verificación org → user_org_roles check              │
│    └── Verificación permisos → role_permissions check       │
└──────────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│ 7. RLS (Row Level Security - PostgreSQL)                     │
│    ├── Políticas por tabla                                  │
│    ├── Basadas en auth.uid() y user_org_roles               │
│    └── Última línea de defensa (no bypasseable)             │
└──────────────────────────────────────────────────────────────┘
```

---

## CAPA 1: AUTENTICACIÓN

### Métodos de Login

| Método | Implementación | Refresh Token | Redirect |
|--------|---------------|---------------|----------|
| Email/Password | `supabase.auth.signInWithPassword()` | Automático | Interno (sin redirect) |
| Google OAuth | `supabase.auth.signInWithOAuth({ provider: 'google' })` | `access_type: 'offline', prompt: 'consent'` | `${origin}${basePath}` |

### Manejo de Sesión

```typescript
// AuthContext.init useEffect
supabase.auth.getSession().then(({ data: { session }, error }) => {
  if (error && refresh_token_not_found) → clearCorruptedSession()
  if (session?.user) → setSupabaseUser + loadUserProfile()
  else → setLoading(false)
})

// Listener continuo
supabase.auth.onAuthStateChange((event, session) => {
  TOKEN_REFRESHED && !session → clearCorruptedSession(wasAuthenticated)
  SIGNED_OUT && !session → limpiar estado
  session?.user → loadUserProfile()
})

// Unhandled rejection (catch-all para errores de refresh)
window.addEventListener('unhandledrejection', (event) => {
  if (refresh_token_not_found) → clearCorruptedSession(wasAuthenticated)
})
```

### clearCorruptedSession
- Limpia localStorage de keys `sb-*` o que contengan `supabase`
- `supabase.auth.signOut({ scope: 'local' })` — no contacta servidor
- Si `expired=true` → `setSessionExpired(true)` → modal "Sesión Expirada"

---

## CAPA 2: PERFIL Y ROL

### UserRole (hardcoded en AuthContext.tsx:6)
```typescript
export type UserRole = 'ADMIN' | 'SUPERVISOR' | 'OPERADOR' | 'CASETILLA';
```

### Resolución del Rol

1. Query: `user_org_roles` JOIN `roles` → `roles.name`
2. Si no existe fila → `fallbackUser.role = 'OPERADOR'`, `pendingAccess = true`
3. Si existe → `loadedUser.role = roleName` (cast a `UserRole`)

### PendingAccess
- `true` cuando el usuario existe en auth pero NO tiene `user_org_roles`
- ProtectedRoute redirige a `/access-pending`
- El usuario ve una pantalla de "Acceso Pendiente"

---

## CAPA 3: PERMISOS (canLocal)

### Carga de Permisos
```typescript
// AuthContext.loadPermissions(roleId, orgId)
const { data: rolePermissions } = await supabase
  .from('role_permissions')
  .select('permissions!role_permissions_permission_id_fkey(name)')
  .eq('role_id', roleId);

const permSet = new Set<string>();
rolePermissions.forEach(rp => {
  if (rp.permissions?.name) permSet.add(rp.permissions.name);
});
```

### canLocal(permission)
```typescript
canLocal(permission: string): boolean {
  if (permissionsSet === null) return false;
  return permissionsSet.has(permission);
}
```

### usePermissions Hook
```typescript
// src/hooks/usePermissions.ts
export function usePermissions() {
  const { user, permissionsSet, permissionsLoading, canLocal, loading: authLoading } = useAuth();
  return {
    orgId: user?.orgId ?? null,
    userId: user?.id || null,
    can: canLocal,
    hasRole: (role: string) => user?.role === role,
    loading: authLoading || permissionsLoading,
    permissionsSet
  };
}
```

### Permisos Conocidos (del código fuente)

| Permiso | Dónde se verifica | Efecto |
|---------|-------------------|--------|
| `admin.users.create` | useBlockedStatuses (isPrivileged) | Bypass de bloqueos |
| `admin.users.update` | useBlockedStatuses (isPrivileged) | Bypass de bloqueos |
| `admin.matrix.view` | useBlockedStatuses (isPrivileged) | Bypass de bloqueos |
| `admin.matrix.update` | useBlockedStatuses (isPrivileged) | Bypass de bloqueos |
| `chat.ask` | ask-sro-chat EF | Permite usar el chat |
| `chat.answers.basic` | ask-sro-chat EF | Nivel 1 de respuestas |
| `chat.answers.extended` | ask-sro-chat EF | Nivel 2 de respuestas |
| `chat.answers.internal` | ask-sro-chat EF | Nivel 3 de respuestas |
| (menú dinámico) | Navbar/Sidebar | Visibilidad de items |

**NOTA**: Los permisos usados en `RequirePermission` y `ProtectedRoute` son Strings definidos en `src/router/config.tsx`, pero la mayor parte del RBAC se basa en validaciones de rol + scope de datos, no en permisos granulares.

---

## CAPA 4: SCOPE DE DATOS (useUserScope)

### GLOBAL_ACCESS_ROLES (hardcoded en useUserScope.ts:17)
```typescript
const GLOBAL_ACCESS_ROLES = ['ADMIN', 'SUPERVISOR', 'Full Access'] as const;
```

**NOTA**: `'Full Access'` NO es un valor de `UserRole`. Es un string literal que nunca matchea con los roles reales del sistema (ADMIN, SUPERVISOR, OPERADOR, CASETILLA). Es código muerto.

### Algoritmo de Scope

```
1. user_warehouse_access (org_id, user_id)
   ├── Si existe fila con restricted=false → rawWarehouseIds = null (global)
   ├── Si solo hay filas restricted=true → rawWarehouseIds = [sus warehouse_ids]
   └── Si no hay filas:
       ├── role en GLOBAL_ACCESS_ROLES → rawWarehouseIds = null
       └── otro role → rawWarehouseIds = []

2. user_country_access (org_id, user_id)
   ├── Si existe → allowedCountryIds = [sus country_ids]
   └── Si no → allowedCountryIds = null

3. INTERSECCIÓN por país:
   ├── Si allowedCountryIds != null:
   │   └── warehouses WHERE country_id IN allowedCountryIds
   │       ∩ rawWarehouseIds (si no es null)
   └── Si allowedCountryIds == null:
       └── warehouseIds = rawWarehouseIds (sin filtrar)

4. Clientes:
   ├── warehouse_clients → clientes de los warehouses visibles
   ├── user_clients → restricción adicional (intersección)
   └── allowedClientIds = finalClientIds (o null si sin restricción)
```

### isGlobalAccess
- `true` cuando `warehouseIds === null`
- Significa que el usuario ve TODOS los warehouses sin filtro

### Cache y Pub/Sub
- Cache global compartida entre todas las instancias del hook
- TTL: 5 minutos
- `invalidateScopeAndReload()` → limpia cache + notifica a todas las instancias
- Llamado por `warehousesService` al crear/actualizar/eliminar warehouses

---

## CAPA 5: ROUTER

### ProtectedRoute (`src/router/ProtectedRoute.tsx`)
```
IF loading → Spinner
IF pendingAccess → Navigate to /access-pending
IF !user → Navigate to /login
IF user.role === 'CASETILLA' → Navigate to /casetilla
ELSE → Navigate to /calendario
```

**NOTA**: ProtectedRoute NO valida permisos, solo autenticación y rol. La redirección por defecto a `/calendario` o `/casetilla` es la ÚNICA lógica de ruteo basada en rol.

### RequirePermission (`src/router/RequirePermission.tsx`)
- Verifica `canLocal(permission)` antes de renderizar la ruta
- Si no tiene permiso → renderiza componente de "Acceso Denegado"
- **ES BYPASSEABLE** desde el frontend (DevTools)

---

## CAPA 6: EDGE FUNCTIONS (Validaciones Backend)

### Métodos de Autenticación en Edge Functions

| Edge Function | JWT Verificación | Service Role | Método |
|--------------|-----------------|--------------|--------|
| `create-reservation` | ✅ Manual (`getUser(token)`) | ✅ (para admin DB) | `authHeader → token → getUser()` |
| `ask-sro-chat` | ✅ Manual (`getUser(token)`) | ✅ | `authHeader → token → getUser()` |
| `process-knowledge-document` | ✅ Manual | ✅ | `authHeader → token → getUser()` |
| `admin-users` | ❌ SIN verificación | ✅ | Solo service role |
| `admin-user-access` | ✅ Manual (`getUser(token)`) | ✅ | `authHeader → token → getUser()` |
| `correspondence-dispatch-event` | ✅ Manual | ✅ | `authHeader → token → getUser()` |
| `correspondence-process-event` | ❌ SIN verificación | ✅ | Solo service role |
| `smtp-send` | ❌ SIN verificación | ❌ | Sin auth |
| `auto-mark-no-show` | ✅ Manual (o cron secret) | ✅ | `jwt → getUser()` o `X-Internal-Cron-Secret` |
| `generate-client-pickup-blocks` | ⚠️ Opcional | ✅ | Si hay Bearer token → getUser(), sino SYSTEM_USER_ID |
| `sync-providers` | ❌ SIN verificación | ✅ | Solo service role |
| `gmail-callback` | ❌ (callback OAuth) | ✅ | State parameter en URL |
| `api-v1-*` | ✅ Manual | ✅ | `authHeader → token → getUser()` |

### ⚠️ VULNERABILIDADES CONOCIDAS

1. **`admin-users`**: NO valida JWT. Cualquiera puede listar usuarios y crear nuevos.
2. **`smtp-send`**: NO valida JWT. Cualquiera puede enviar correos.
3. **`correspondence-process-event`**: NO valida JWT (es llamada internamente).
4. **`sync-providers`**: NO valida JWT.

---

## CAPA 7: RLS (Row Level Security)

### Tablas con RLS (verificado por uso en queries)

| Tabla | RLS | Política Conocida |
|-------|-----|-------------------|
| `reservations` | ✅ | Basada en org_id + user_org_roles |
| `docks` | ✅ | Basada en org_id |
| `warehouses` | ✅ | Basada en org_id |
| `clients` | ✅ | Basada en org_id |
| `providers` | ✅ | Basada en org_id |
| `user_org_roles` | ✅ | Usuario ve su propia fila |
| `role_permissions` | ✅ | Basada en org_id |
| `profiles` | ✅ | Usuario ve su propio perfil |
| `casetilla_ingresos` | ✅ | Basada en org_id |
| `casetilla_salidas` | ✅ | Basada en org_id |
| `activity_log` | ✅ | Basada en org_id |
| `correspondence_rules` | ✅ | Basada en org_id |
| `correspondence_outbox` | ✅ | Basada en org_id |
| `knowledge_documents` | ✅ | Basada en org_id + visibility_mode |
| `chat_sessions` | ✅ | user_id + org_id |
| `chat_messages` | ✅ | session_id → org_id |

### Exclusión de RLS (Service Role)
- Las Edge Functions usan `SUPABASE_SERVICE_ROLE_KEY` → bypass de RLS
- Esto es INTENCIONAL para operaciones administrativas
- Pero requiere que la EF valide manualmente los permisos del caller

---

## REGLAS HARDCODEADAS EN RBAC

| Regla | Archivo | Línea | Valor |
|-------|---------|-------|-------|
| UserRole union type | `AuthContext.tsx` | 6 | `'ADMIN' \| 'SUPERVISOR' \| 'OPERADOR' \| 'CASETILLA'` |
| GLOBAL_ACCESS_ROLES | `useUserScope.ts` | 17 | `['ADMIN', 'SUPERVISOR', 'Full Access']` |
| Scope cache TTL | `useUserScope.ts` | 67 | `5 * 60 * 1000` (5 min) |
| 'Full Access' (código muerto) | `useUserScope.ts` | 17 | String que nunca matchea |
| SYSTEM_USER_ID | `generate-client-pickup-blocks` | 8 | `'00000000-0000-0000-0000-000000000000'` |
| Fallback role | `AuthContext.tsx` | ~190 | `'OPERADOR'` |
| Fallback timezone | Varios | — | `'America/Costa_Rica'` |
| DEFAULT_TIMEZONE | `timezoneUtils.ts` | — | `'America/Costa_Rica'` |

---

## POSIBLES ESCALACIONES / BYPASS

| Vector | Riesgo | Mitigación Actual |
|--------|--------|-------------------|
| DevTools → modificar canLocal() | ALTO | RLS en DB (última defensa) |
| DevTools → modificar user.role | ALTO | RLS en DB |
| Token JWT manipulado | BAJO | Firma RS256 de Supabase |
| Service Role expuesto | CRÍTICO | Solo en Edge Function secrets |
| EF sin validación JWT | CRÍTICO | ⚠️ admin-users, smtp-send sin validación |
| localStorage → modificar permisos | BAJO | Se recargan de DB en cada login |
| Cross-org access | MEDIO | RLS por org_id |
| Scope cache stale (5 min) | MEDIO | invalidateScopeAndReload() manual |

---

## VALIDACIONES DUPLICADAS

| Validación | Frontend | Edge Function | RLS |
|-----------|----------|---------------|-----|
| Usuario pertenece a org | ❌ (no se valida) | ✅ create-reservation | ✅ |
| Overlap de reservas | ❌ (solo UI) | ✅ create-reservation | ✅ (constraint) |
| Same-day cutoff | ❌ | ✅ create-reservation | ❌ |
| Permiso para crear reserva | ❌ (no hay permiso específico) | ❌ | ✅ (implícito) |
| Acceso a warehouse | ✅ useUserScope | ✅ api-v1-* | ✅ |

---

## VALIDACIONES FALTANTES

| Validación | Dónde debería estar | Estado |
|-----------|-------------------|--------|
| Rate limiting en Edge Functions | EF layer | ❌ No implementado |
| CSRF tokens | Frontend | ❌ No implementado |
| CSP headers | index.html | ❌ No implementado |
| MFA para admins | Supabase Auth | ❌ No configurado |
| Validación JWT en admin-users | EF | ❌ FALTANTE (crítico) |
| Validación JWT en smtp-send | EF | ❌ FALTANTE (crítico) |
| Invalidación de permisos en caliente | AuthContext | ❌ Solo en re-login |