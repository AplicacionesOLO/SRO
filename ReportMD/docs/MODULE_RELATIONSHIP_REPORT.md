# REPORTE 2: RELACIONES ENTRE MÓDULOS
## Suite OLO / App Hub Manager — Auditoría Técnica

**Fecha**: 2026-06-30

---

## 1. DIAGRAMA DE DEPENDENCIAS

```
┌─────────────────────────────────────────────────────────────────┐
│                         App.tsx                                  │
│  ┌──────────┐  ┌─────────────────────┐  ┌───────────────────┐  │
│  │AuthProvider│  │ActiveWarehouseProvider│  │ClientPickupRules │  │
│  │(global)    │  │(global)               │  │Provider(global)  │  │
│  └─────┬──────┘  └──────────┬────────────┘  └────────┬──────────┘  │
│        │                    │                         │             │
│  ┌─────▼────────────────────▼─────────────────────────▼──────────┐ │
│  │                     AppContent                                │ │
│  │  ┌────────┐  ┌──────────┐  ┌─────────────────┐               │ │
│  │  │Sidebar │  │ Navbar   │  │ SROAssistant    │               │ │
│  │  └────────┘  └──────────┘  │ (Chat Widget)   │               │ │
│  │                            └─────────────────┘               │ │
│  │  ┌──────────────────────────────────────────────┐            │ │
│  │  │              AppRoutes (useRoutes)            │            │ │
│  │  │  ┌─────────────┐  ┌──────────────────┐       │            │ │
│  │  │  │ProtectedRoute│  │RequirePermission │       │            │ │
│  │  │  │(auth guard)  │  │(perm guard)      │       │            │ │
│  │  │  └──────┬───────┘  └────────┬─────────┘       │            │ │
│  │  │         │                   │                  │            │ │
│  │  │  ┌──────▼───────────────────▼──────────┐       │            │ │
│  │  │  │        Páginas (20+ rutas)           │       │            │ │
│  │  │  └──────────────────────────────────────┘       │            │ │
│  │  └──────────────────────────────────────────────┘            │ │
│  └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. DEPENDENCIAS DIRECTAS ENTRE MÓDULOS

### 2.1 Auth (AuthContext)
**Provee**: `user`, `supabaseUser`, `login`, `loginWithGoogle`, `logout`, `isAuthenticated`, `loading`, `permissionsSet`, `canLocal`, `pendingAccess`, `sessionExpired`
**Depende de**: `supabase.ts`, `Supabase Auth`
**Es usado por**: TODOS los módulos autenticados

**Qué módulos rompe si falla**: TODO el sistema. Sin AuthContext, ninguna página protegida carga.

### 2.2 ActiveWarehouseContext
**Provee**: `activeWarehouseId`, `allowedWarehouses`, `effectiveWarehouseIds`, `hasMultipleWarehouses`
**Depende de**: `useUserScope`, `usePermissions`, `localStorage`
**Es usado por**: Calendario, Casetilla, Reservas, Dashboard, Admin

**Qué módulos rompe si falla**: Calendario muestra 0 resultados o todos (según scope). Casetilla muestra lista vacía.

### 2.3 useUserScope (Hook de Segregación)
**Provee**: `allowedWarehouseIds`, `allowedClientIds`, `availableClients`, `availableWarehouses`, `isGlobalAccess`
**Depende de**: `usePermissions`, `useAuth`, Supabase queries a 6+ tablas
**Es usado por**: `ActiveWarehouseContext`, directamente por Calendario y Casetilla

**Qué módulos rompe si falla**: Segregación de datos se rompe. Usuarios ven warehouses/clientes que no deberían o no ven los que deberían.

### 2.4 ClientPickupRulesContext
**Provee**: `lastRuleChange`, `affectedDockIds`, `notifyRuleChanged`
**Depende de**: Nada externo (puro estado React)
**Es usado por**: Admin Clientes (escribe), Calendario (lee)

**Qué módulos rompe si falla**: Calendario no se refresca al cambiar reglas de "Cliente Retira".

### 2.5 ProtectedRoute + RequirePermission
**Provee**: Guards de autenticación y permisos
**Depende de**: `useAuth`, `usePermissions`
**Es usado por**: Todas las rutas protegidas

**Qué módulos rompe si falla**: Usuarios sin sesión acceden a rutas protegidas (crash), o usuarios sin permisos acceden a admin.

---

## 3. CADENA DE DEPENDENCIAS CRÍTICA (FLUJO DE CARGA)

```
1. App.tsx mounts
2. AuthProvider mounts → supabase.auth.getSession()
3. Si hay sesión → loadUserProfile(userId, email)
   3a. SELECT user_org_roles WHERE user_id = X
   3b. Si no tiene rol → pendingAccess=true, redirige a /access-pending
   3c. Si tiene rol → loadPermissions(roleId, orgId)
       3c1. SELECT role_permissions WHERE role_id = Y
       3c2. Construye Set<string> de permisos
4. ActiveWarehouseProvider mounts → useUserScope
   4a. SELECT user_country_access
   4b. SELECT user_warehouse_access
   4c. INTERSECCIÓN con warehouses (filtrar por país)
   4d. SELECT warehouses
   4e. SELECT warehouse_clients → clientes
   4f. SELECT user_clients (filtro adicional)
   4g. Caché de 5 minutos
5. ProtectedRoute verifica user != null
6. RequirePermission verifica can(permission)
7. Página renderiza
```

**Tiempo típico de carga**: 1-3 segundos (depende de latencia de Supabase y cantidad de datos)
**Punto de fallo más común**: Paso 3b - usuario sin `user_org_roles` → pendingAccess infinito si no hay admin que lo asigne.

---

## 4. RELACIONES ENTRE MÓDULOS ESPECÍFICOS

### 4.1 Calendario ↔ Admin Clientes
- Admin Clientes modifica `client_rules`, `client_pickup_rules`, `client_docks`
- Calendario lee estas tablas para filtrar docks, validar cutoff, mostrar bloques
- `ClientPickupRulesContext.notifyRuleChanged()` propaga cambios en tiempo real
- **Riesgo**: Si admin cambia reglas mientras el calendario tiene datos cacheados (5 min TTL), inconsistencia temporal

### 4.2 Calendario ↔ Casetilla
- Calendario crea/edita reservas
- Casetilla lee reservas (pendientes, con ingreso) y actualiza estados
- Ambos usan `emailTriggerService` para disparar correos
- **Riesgo**: Si casetilla cambia status y calendario no refresca, inconsistencia visual

### 4.3 Admin Usuarios ↔ ActiveWarehouseContext
- Admin Usuarios modifica `user_warehouse_access`, `user_country_access`
- `ActiveWarehouseContext` lee estas tablas vía `useUserScope`
- `invalidateScopeAndReload()` fuerza recarga global al modificar warehouses
- **Riesgo**: Si admin asigna un warehouse a un usuario pero no hay `invalidateScopeAndReload`, el usuario no ve el cambio hasta que expire la caché (5 min) o recargue manualmente.

### 4.4 Admin Matriz Permisos ↔ Todos los módulos
- Matriz modifica `role_permissions`
- AuthContext carga permisos al iniciar sesión
- **Riesgo**: Cambios en matriz de permisos NO se propagan a usuarios ya logueados. Necesitan cerrar sesión y volver a entrar.

### 4.5 Correspondencia ↔ Calendario + Casetilla
- `emailTriggerService` se llama desde `calendarService` (create/update reservation) y `casetillaService` (ingreso/salida)
- Dispara Edge Function `correspondence-process-event`
- **Riesgo**: Si `getValidSupabaseToken()` falla, los correos no se disparan y no hay reintento automático.

### 4.6 Chat ↔ Conocimiento
- Conocimiento gestiona documentos que se indexan en OpenAI Vector Store
- Chat consulta el Vector Store para responder
- **Riesgo**: Si OpenAI API key no está configurada, chat responde "No encontré información" sin indicar que es error de configuración.

---

## 5. QUÉ MÓDULO PUEDE ROMPER A OTRO SI SE CONFIGURA MAL

| Módulo modificado | Configuración incorrecta | Módulos afectados | Síntoma |
|-------------------|--------------------------|-------------------|---------|
| **Matriz de Permisos** | Quitar `menu.calendario.view` a un rol | Calendario, Reservas, Andenes | Usuarios no pueden acceder al core del sistema |
| **Matriz de Permisos** | Quitar `admin.*` a un admin existente | Todo el panel admin | Admin pierde acceso a administración |
| **Admin Usuarios** | Asignar `user_warehouse_access` con `restricted=true` pero sin warehouses | Calendario, Casetilla, Dashboard | Usuario ve 0 resultados en todas partes |
| **Admin Usuarios** | Asignar `user_country_access` sin los países de sus warehouses | Calendario | Warehouses del usuario quedan excluidos por intersección país |
| **Admin Almacenes** | Eliminar un warehouse con docks activos | Calendario (docks huérfanos) | Reservas existentes quedan asociadas a docks sin warehouse |
| **Admin Clientes** | Configurar `same_day_cutoff` con horas inválidas | Calendario (crear reserva) | Error 403 en Edge Function, usuario no entiende por qué |
| **Correspondencia** | Regla con `status_from_id` o `status_to_id` inexistente | Email Trigger | La regla nunca dispara, silenciosamente |
| **Correspondencia** | SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS mal configurados | Todos los correos | Correos nunca se envían, encolados como "failed" |
| **Conocimiento** | Subir documento sin `openai_file_id` | Chat | Documento existe pero no es consultable |
| **Supabase RLS** | Política demasiado restrictiva | Todos los módulos | Errores 401/403 silenciosos, datos vacíos |

---

## 6. DEPENDENCIAS DE INFRAESTRUCTURA

| Componente | Depende de | Si falla |
|------------|-----------|----------|
| **Frontend (Vite)** | Supabase URL + Anon Key | No carga |
| **Auth** | Supabase Auth | No hay login |
| **DB queries** | Supabase PostgreSQL + RLS | Datos vacíos o errores |
| **Edge Functions** | Supabase Edge Functions infra | Fallan invites, emails, chat |
| **Storage** | Supabase Storage + buckets | Sin QR, sin archivos, sin fotos |
| **Google OAuth** | Google Cloud Console + Supabase Auth config | Login con Google no funciona |
| **Gmail OAuth** | Google Cloud Console + Gmail API | Conexión Gmail no funciona |
| **SMTP** | Servidor SMTP externo (configurado en secrets) | Correos no se envían |
| **OpenAI** | OpenAI API key en secrets | Chat IA no funciona |