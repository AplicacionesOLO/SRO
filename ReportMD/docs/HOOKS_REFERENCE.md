# HOOKS REFERENCE — Suite OLO / App Hub Manager

> **Documentación Enterprise-Grade | Segunda Pasada**
> Basado exclusivamente en el código fuente (v1199)

---

## `useAuth()` → `src/contexts/AuthContext.tsx`

### Propósito
Hook central de autenticación. Provee acceso al usuario, sesión, permisos y funciones de login/logout.

### Estado
```typescript
{
  user: User | null;
  supabaseUser: SupabaseUser | null;
  loading: boolean;
  pendingAccess: boolean;
  permissionsSet: Set<string> | null;
  permissionsLoading: boolean;
  sessionExpired: boolean;
  wasAuthenticated: boolean; // interno
}
```

### Dependencias
- `supabase` (lib)
- `supabase.auth.getSession()`, `onAuthStateChange()`
- Tablas: `user_org_roles`, `roles`, `profiles`, `role_permissions`, `permissions`

### Eventos
- `onAuthStateChange`: `TOKEN_REFRESHED`, `SIGNED_OUT`, `SIGNED_IN`
- `unhandledrejection`: captura errores de refresh token

### Re-render
- Cada cambio en `user`, `loading`, `pendingAccess`, `permissionsSet`, `sessionExpired`
- Al ser el contexto raíz, cualquier cambio re-renderiza todo el árbol

### Problemas Conocidos
- `loadUserProfile` hace RLS probe innecesario (`.select('*').limit(5)`)
- `loadPermissions` se llama incluso si `pendingAccess = true`
- No hay invalidación de permisos en caliente

---

## `usePermissions()` → `src/hooks/usePermissions.ts`

### Propósito
Wrapper sobre `useAuth()` que expone `orgId`, `userId`, `can()`, `hasRole()`.

### Retorna
```typescript
{ orgId: string | null; userId: string | null; can: (p: string) => boolean;
  hasRole: (r: string) => boolean; loading: boolean; permissionsSet: Set<string> | null }
```

### Dependencias
- `useAuth()` (única dependencia)

---

## `useUserScope()` → `src/hooks/useUserScope.ts`

### Propósito
Hook central de segregación de datos. Determina qué warehouses, clientes y países puede ver el usuario.

### Estado
```typescript
{
  allowedWarehouseIds: string[] | null;  // null = global
  allowedClientIds: string[] | null;     // null = sin restricción
  availableClients: UserScopeClient[];
  availableWarehouses: { id, name, timezone, location }[];
  isGlobalAccess: boolean;
  loading: boolean;
  reload: () => void;
}
```

### Algoritmo (6 queries secuenciales)
1. `user_country_access` → `allowedCountryIds`
2. `user_warehouse_access` → `rawWarehouseIds` (con lógica restricted)
3. Intersección: `warehouses WHERE country_id IN allowedCountryIds` ∩ `rawWarehouseIds`
4. `warehouses` → nombres, timezones
5. `warehouse_clients` → `warehouseClientIds`
6. `user_clients` → restricción adicional (intersección)
7. `clients` → nombres

### Caché
- Global `scopeCache`: Map<string, ScopeCacheEntry>
- TTL: 5 minutos
- Pub/Sub: `invalidateScopeAndReload()` limpia cache + notifica listeners
- Llamado desde `warehousesService` en create/update/delete

### Dependencias
- `usePermissions()` → `orgId`, `userId`
- `useAuth()` → `user.role`
- `supabase` (lib)

### Problemas Conocidos
- `'Full Access'` en `GLOBAL_ACCESS_ROLES` es código muerto
- 6 queries secuenciales pueden ser lentas con muchos datos
- `pendingPromise` pattern añade complejidad para evitar race conditions

---

## `useActiveWarehouse()` → `src/contexts/ActiveWarehouseContext.tsx`

### Propósito
Gestiona la selección de almacén activo del usuario. Persiste en localStorage.

### Estado
```typescript
{
  allowedWarehouses: ActiveWarehouseInfo[];
  activeWarehouseId: string | null;
  activeWarehouse: ActiveWarehouseInfo | null;
  setActiveWarehouseId: (id) => void;
  hasMultipleWarehouses: boolean;
  loading: boolean;
  effectiveWarehouseIds: string[] | null;
  selectionInvalidated: boolean;
  acknowledgeInvalidation: () => void;
}
```

### Persistencia
- `localStorage.setItem('sro_active_warehouse_{orgId}', id ?? 'null')`

### Lógica de Inicialización
1. Esperar a que `scopeLoading = false` y `availableWarehouses.length > 0`
2. Si 1 solo warehouse → preseleccionarlo (prioridad sobre localStorage)
3. Si múltiples → restaurar de localStorage
4. Si sigue null y hay warehouses → forzar el primero
5. Validación continua: si el warehouse activo ya no está en el scope → invalidar

### Dependencias
- `useUserScope()`
- `usePermissions()` → `orgId`

---

## `useBlockedStatuses(orgId)` → `src/hooks/useBlockedStatuses.ts`

### Propósito
Verifica si una reserva está bloqueada para edición según reglas del cliente (blocked_status_ids + bypass).

### Retorna
```typescript
{
  isReservationBlockedAsync: (reservationId, statusId, clientId?) => Promise<boolean>;
  isReservationBlockedSync: (clientId, statusId) => boolean;
  preloadClient: (clientId) => Promise<void>;
  invalidateClient: (clientId) => void;
  isPrivileged: boolean;
  getBlockedIdsForClient: (clientId) => Promise<string[]>;
}
```

### isPrivileged
```typescript
canLocal('admin.users.create') || canLocal('admin.matrix.update')
```

### Caché
- `configCacheRef`: Map<string, ClientBlockedStatusConfig> (en memoria, sin TTL)
- `userRoleIdRef`: cargado una vez desde `user_org_roles`

---

## `useReservationDraft({ orgId, isOpen, isNewReservation })` → `src/hooks/useReservationDraft.ts`

### Propósito
Guarda/recupera borradores de formularios de reserva en localStorage con debounce de 500ms.

### Retorna
```typescript
{ saveDraft, clearDraft, readDraft }
```

### Funciones Exportadas (puras, usables sin el hook)
- `getDraftKey(orgId)` → string
- `readDraftFromStorage(orgId)` → `ReservationDraftData | null`
- `clearDraftFromStorage(orgId)` → void
- `checkDraftContext(draft, currentDockIds, currentDefaults?)` → `DraftContextCheck`
- `hasMeaningfulDraftData(formData, defaults?)` → boolean
- `getDraftAge(savedAt)` → string ("hace 5 min", "hace 2 h")
- `readGenericDraft<T>(key)` → `GenericDraftData<T> | null`
- `saveGenericDraft<T>(key, formData)` → void
- `clearGenericDraft(key)` → void

### Expiración
- `DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000` (7 días)

---

## `useChatSession()` → `src/hooks/useChatSession.ts`

### Propósito
Hook central del chat: sesiones, mensajes, envío de preguntas.

### Retorna
```typescript
{
  sessions, activeSession, messages,
  loadingSessions, loadingMessages, sending, error,
  selectSession, startNewSession, sendMessage,
  renameSession, removeSession, clearError
}
```

### Optimistic Updates
- `sendMessage`: inserta mensaje temporal con id `temp_${Date.now()}` antes de la respuesta
- Si error → elimina el mensaje temporal

### Dependencias
- `usePermissions()` → `orgId`, `userId`
- `chatService` (todas las funciones)

---

## `useChatAudit(filterUserId?)` → `src/hooks/useChatAudit.ts`

### Propósito
Carga paginada de logs de auditoría del chat.

### Retorna
```typescript
{ logs, loading, error, hasMore, loadMore, reload }
```

### Paginación
- `PAGE_SIZE = 50`
- `loadMore()` → carga siguiente página y concatena

---

## `useKnowledgeDocuments()` → `src/hooks/useKnowledgeDocuments.ts`

### Propósito
CRUD completo de documentos de conocimiento con upload a Storage y procesamiento OpenAI.

### Retorna
```typescript
{
  documents, loading, error, reload,
  uploadAndCreate, updateDoc, updateRelations,
  archive, process, reindex
}
```

---

## `useDebouncedValue<T>(value, delay=300)` → `src/hooks/useDebouncedValue.ts`

### Propósito
Debounce genérico de cualquier valor. Útil para inputs de búsqueda.

---

## `useSessionStorageState<T>(key, initialValue)` → `src/hooks/useSessionStorageState.ts`

### Propósito
Estado de React persistido en sessionStorage. Recupera al montar, guarda al cambiar.

---

## `useFormDraft<T>({ storageKey, isNewRecord })` → `src/hooks/useReservationDraft.ts`

### Propósito
Versión genérica de `useReservationDraft` para cualquier formulario modal.

---

## `useReservationBlockedStatus(orgId, reservationId, statusId, clientId?)` → `src/hooks/useBlockedStatuses.ts`

### Propósito
Hook especializado para `ReservationModal` que evalúa bloqueo de forma reactiva.

---

## `useClientPickupRulesContext()` → `src/contexts/ClientPickupRulesContext.tsx`

### Propósito
Consumir el contexto cross-route de reglas Cliente Retira (notifica cambios al calendario).

### Retorna
```typescript
{ lastRuleChange: number; affectedDockIds: string[]; notifyRuleChanged: (dockIds) => void }
```