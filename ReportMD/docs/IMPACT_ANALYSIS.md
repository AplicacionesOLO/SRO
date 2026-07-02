# IMPACT ANALYSIS — Suite OLO / App Hub Manager

> **Documentación Enterprise-Grade | Segunda Pasada**
> Basado exclusivamente en el código fuente (v1199)
> Qué rompe si se elimina o modifica cada módulo.

---

## IMPACTO POR MÓDULO

### AuthContext (`src/contexts/AuthContext.tsx`)

**Qué rompe si se elimina:**
- ❌ Login email/password
- ❌ Login Google OAuth
- ❌ Logout
- ❌ Carga de perfil y permisos
- ❌ `useAuth()` → cascada: `usePermissions()` → `useUserScope()` → `useActiveWarehouse()`
- ❌ `ProtectedRoute` → sin control de acceso
- ❌ `RequirePermission` → sin validación de permisos
- ❌ `canLocal()` → todas las verificaciones de permisos
- ❌ `sessionExpired` → sin modal de sesión expirada

**Qué depende de él:**
- TODOS los hooks (`usePermissions`, `useUserScope`, `useActiveWarehouse`, `useBlockedStatuses`, `useChatSession`, `useKnowledgeDocuments`)
- TODAS las páginas protegidas
- Navbar, Sidebar, SessionExpiredModal
- `emailTriggerService` → `getValidSupabaseToken()`

**Qué Edge Functions lo usan:** Ninguna directamente (usan auth independiente)

**Qué tablas quedarían huérfanas:** Ninguna (los datos persisten)

**Qué permisos dejarían de funcionar:** TODOS (`canLocal` es el corazón del RBAC frontend)

---

### useUserScope (`src/hooks/useUserScope.ts`)

**Qué rompe si se elimina:**
- ❌ Segregación de warehouses → usuarios ven todo o nada
- ❌ Segregación de clientes
- ❌ `ActiveWarehouseContext` → sin lista de warehouses disponibles
- ❌ `effectiveWarehouseIds` → sin filtro en queries de calendario/casetilla

**Qué depende de él:**
- `ActiveWarehouseContext` (dependencia directa)
- `SchedulerView`, `CasetillaPage`, `DashboardPage`
- `calendarService.getVisibleDockIds` (recibe allowedWarehouseIds/allowedClientIds)

---

### calendarService (`src/services/calendarService.ts`)

**Qué rompe si se elimina:**
- ❌ TODO el calendario: reservas, docks, bloques, QR, archivos
- ❌ `SchedulerView` → grid vacío
- ❌ `ReservationModal` → no se pueden crear/editar reservas
- ❌ `BlockModal` → no se pueden crear bloques
- ❌ `ActivityTab` → sin actividad

**Qué depende de él:**
- `SchedulerView`, `ReservationModal`, `BlockModal`, `ActivityTab`, `BlocksManagementTab`, `BlockedStatusesConfig`, `ReservationQRModal`, `PreReservationMiniModal`
- `emailTriggerService` → recibe `Reservation` type

**Qué Edge Functions lo usan:** Ninguna (calendarService invoca Edge Functions)

---

### casetillaService (`src/services/casetillaService.ts`)

**Qué rompe si se elimina:**
- ❌ TODO Casetilla: IN, OUT, reportes, grillas
- ❌ `IngresoForm` → no se pueden registrar entradas
- ❌ `ExitForm` → no se pueden registrar salidas
- ❌ `PendingReservationsGrid`, `ExitReservationsGrid`, `NoShowReservationsGrid`, `DurationReportGrid`, `ProviderDistributionGrid`

**Qué depende de él:**
- Todos los componentes de Casetilla
- `emailTriggerService` (invocado después de IN/OUT)

---

### emailTriggerService (`src/services/emailTriggerService.ts`)

**Qué rompe si se elimina:**
- ❌ Sin correos automáticos al crear reserva
- ❌ Sin correos automáticos al cambiar estado
- ❌ Sin correos automáticos en IN/OUT de casetilla

**Qué depende de él:**
- `calendarService.createReservation`, `updateReservation`, `updateReservationStatus`
- `casetillaService.createIngreso`, `createSalida`

**Qué Edge Functions se quedan sin invocador:**
- `correspondence-process-event` → solo sería invocada por `correspondence-dispatch-event`

---

### adminService (`src/services/adminService.ts`)

**Qué rompe si se elimina:**
- ❌ CRUD de roles, permisos, matriz
- ❌ CRUD de usuarios (depende de EF `admin-users`)

**Qué Edge Functions quedarían huérfanas:**
- `admin-users` → sin invocador desde frontend
- `admin-user-access` → sin invocador para get/set

---

### correspondenceService (`src/services/correspondenceService.ts`)

**Qué rompe si se elimina:**
- ❌ CRUD de reglas de correspondencia
- ❌ Visualización de logs
- ❌ Reintentos de correos

**Qué Edge Functions:** Ninguna (el servicio invoca EFs)

---

### chatService (`src/services/chatService.ts`)

**Qué rompe si se elimina:**
- ❌ Chat IA (SRObot)
- ❌ Procesamiento de documentos
- ❌ Auditoría de chat

**Qué Edge Functions quedarían huérfanas:**
- `ask-sro-chat` → sin invocador
- `process-knowledge-document` → sin invocador
- `reindex-knowledge-document` → sin invocador

---

### create-reservation (Edge Function)

**Qué rompe si se elimina:**
- ❌ No se pueden crear reservas (validación server-side requerida)
- ❌ Sin validación de same-day cutoff
- ❌ Sin validación de overlap server-side

**Qué depende de él:**
- `calendarService.createReservation`
- `calendarService.createRecurringReservations`

---

### correspondence-process-event (Edge Function)

**Qué rompe si se elimina:**
- ❌ Sin envío de correos automáticos
- ❌ Las reglas de correspondencia quedan inútiles

**Qué depende de él:**
- `emailTriggerService.onReservationCreated`
- `emailTriggerService.onReservationStatusChanged`
- `correspondence-dispatch-event` EF

---

### smtp-send (Edge Function)

**Qué rompe si se elimina:**
- ❌ Sin envío real de correos
- ❌ Sin reintentos de correos

**Qué depende de él:**
- `correspondence-process-event` EF
- `correspondenceService.retryFailedEmail`, `retryQueuedEmail`, `retryAllQueuedEmails`, `retryAllFailedEmails`

---

### admin-users (Edge Function)

**Qué rompe si se elimina:**
- ❌ Sin listado de usuarios de la org
- ❌ Sin creación de nuevos usuarios
- ❌ Sin cambio de rol
- ❌ Sin remoción de usuarios de la org

**Qué depende de él:**
- `adminService.getOrgUsers`, `createOrgUser`, `updateOrgUser`, `removeOrgUser`

---

### SUPABASE_SERVICE_ROLE_KEY (Secret)

**Qué rompe si se pierde/expone:**
- ❌ TODAS las Edge Functions dejan de funcionar
- 🔴 Si se expone → acceso total a la DB (bypass RLS)

**Qué depende de él:**
- TODAS las Edge Functions (22+)

---

### VITE_PUBLIC_SUPABASE_URL (Variable de entorno)

**Qué rompe si falta:**
- ❌ Sin conexión a Supabase
- ❌ El sitio no carga

**Qué depende de él:**
- `src/lib/supabase.ts` → inicialización del cliente
- `emailTriggerService` → URL para fetch a Edge Functions
- `chatService` → URL para fetch a Edge Functions
- `correspondenceService` → URL para reintentos

---

## RESUMEN: QUÉ CORREGIR PRIMERO

| Prioridad | Módulo | Acción | Impacto |
|-----------|--------|--------|---------|
| 🔴 P0 | `admin-users` EF | Agregar validación JWT | Seguridad crítica |
| 🔴 P0 | `smtp-send` EF | Agregar validación JWT | Seguridad crítica |
| 🟠 P1 | `casetillaService.ts` | Dividir archivo (2320 líneas) | Mantenibilidad |
| 🟠 P1 | `calendarService.ts` | Dividir archivo (1981 líneas) | Mantenibilidad |
| 🟡 P2 | `useUserScope.ts` | Remover `'Full Access'` (código muerto) | Claridad |
| 🟡 P2 | `AuthContext.tsx` | Invalidación de permisos en caliente | UX |
| 🟡 P2 | `index.html` | Agregar CSP headers | Seguridad |
| 🟢 P3 | `correspondence-process-event` EF | Agregar validación JWT | Seguridad (bajo riesgo, llamado interno) |
| 🟢 P3 | `sync-providers` EF | Agregar validación JWT | Seguridad (bajo riesgo) |