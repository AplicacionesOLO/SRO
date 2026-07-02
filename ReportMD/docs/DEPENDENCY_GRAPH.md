# DEPENDENCY GRAPH — Suite OLO / App Hub Manager

> **Documentación Enterprise-Grade | Segunda Pasada**
> Basado exclusivamente en el código fuente (v1199)
> Cada dependencia está verificada contra imports y llamadas reales en el código.

---

## MAPA GLOBAL DE DEPENDENCIAS

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                               App.tsx                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Providers: AuthProvider → ActiveWarehouseProvider →                   │  │
│  │            ClientPickupRulesProvider → BrowserRouter                  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                    ┌───────────────┼───────────────┐                       │
│                    ▼               ▼               ▼                       │
│            ┌──────────┐   ┌──────────────┐  ┌─────────────┐               │
│            │ Navbar   │   │ AppRoutes    │  │ Sidebar     │               │
│            └──────────┘   └──────────────┘  └─────────────┘               │
│                                    │                                        │
│                    ┌───────────────┼───────────────┬──────────────┐        │
│                    ▼               ▼               ▼              ▼        │
│            ┌──────────┐   ┌──────────────┐  ┌──────────┐  ┌──────────┐   │
│            │Protected │   │ Require      │  │ Session  │  │ Error    │   │
│            │Route     │   │ Permission   │  │ Expired  │  │ Boundary │   │
│            └──────────┘   └──────────────┘  │ Modal    │  └──────────┘   │
│                                              └──────────┘                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## PÁGINA: Login (`/login`)

```
src/pages/login/page.tsx
├── HOOK: useAuth()                         → AuthContext
│   ├── login(email, password)             → supabase.auth.signInWithPassword()
│   ├── loginWithGoogle()                  → supabase.auth.signInWithOAuth()
│   ├── isAuthenticated                    → boolean
│   └── loading                            → boolean
├── HOOK: useEffect (redirect post-OAuth)  → window.REACT_APP_NAVIGATE
├── COMPONENTES: ninguno externo
└── ROUTER: ProtectedRoute redirige aquí si !user
```

**Qué rompe si se modifica:**
- `AuthContext.login()` → rompe login email
- `AuthContext.loginWithGoogle()` → rompe login Google
- `__BASE_PATH__` incorrecto → Google OAuth redirect falla
- `ProtectedRoute` lógica de redirect → loop infinito o página en blanco

---

## PÁGINA: Calendario (`/calendario`)

```
src/pages/calendario/page.tsx
├── COMPONENTE: SchedulerView.tsx
│   ├── HOOK: useActiveWarehouse()          → ActiveWarehouseContext
│   │   ├── effectiveWarehouseIds
│   │   ├── activeWarehouse.timezone
│   │   └── allowedWarehouses
│   ├── HOOK: useUserScope()                → usePermissions → AuthContext
│   │   ├── allowedWarehouseIds
│   │   ├── allowedClientIds
│   │   └── isGlobalAccess
│   ├── HOOK: useBlockedStatuses(orgId)     → clientBlockedStatusesService
│   │   ├── isReservationBlockedSync()      → drag validation
│   │   └── preloadClient()                → cache warming
│   ├── HOOK: useClientPickupRulesContext() → ClientPickupRulesContext
│   │   ├── lastRuleChange                  → refresh trigger
│   │   └── affectedDockIds                → targeted reload
│   ├── SERVICE: calendarService
│   │   ├── getReservations()              → supabase reservations + profiles
│   │   ├── getVisibleDockIds()            → cache de 2 min
│   │   ├── getDocks()                     → supabase docks + categories + statuses
│   │   ├── getDockTimeBlocks()            → supabase dock_time_blocks
│   │   ├── createReservation()            → EF create-reservation
│   │   ├── updateReservation()            → supabase reservations UPDATE
│   │   ├── cancelReservation()            → supabase reservations UPDATE
│   │   ├── updateReservationStatus()      → supabase reservations UPDATE
│   │   └── getReservationStatuses()       → cache 5 min
│   └── SERVICE: emailTriggerService        → EF correspondence-process-event
├── COMPONENTE: ReservationModal.tsx
│   ├── HOOK: useReservationDraft()         → localStorage draft
│   ├── HOOK: useReservationBlockedStatus() → clientBlockedStatusesService
│   ├── SERVICE: calendarService.*
│   ├── SERVICE: providersService.searchProviders()
│   ├── SERVICE: clientsService.listClientsByWarehouse()
│   └── SERVICE: dockAllocationService.*
├── COMPONENTE: BlockModal.tsx
│   └── SERVICE: calendarService.createDockTimeBlock()
├── COMPONENTE: BlocksManagementTab.tsx
│   └── SERVICE: calendarService.getAllDockTimeBlocksForManagement()
├── COMPONENTE: BlockedStatusesConfig.tsx
│   └── SERVICE: clientBlockedStatusesService.*
├── COMPONENTE: ActivityTab.tsx
│   └── SERVICE: activityLogService.getActivityLogs()
└── COMPONENTE: RecurrenceForm.tsx
    └── UTIL: recurrenceUtils
```

**Qué rompe si se modifica:**
- `useActiveWarehouse` → sin warehouse seleccionado, calendario vacío
- `useUserScope` → segregación rota, usuario ve docks que no debería
- `calendarService.getReservations` → sin reservas visibles
- `calendarService.getDocks` → sin andenes, grid vacío
- `create-reservation` EF → no se pueden crear reservas
- `useBlockedStatuses` → drag & drop permite estados bloqueados

---

## PÁGINA: Casetilla (`/casetilla`)

```
src/pages/casetilla/page.tsx
├── COMPONENTE: IngresoForm.tsx
│   ├── HOOK: useActiveWarehouse()          → ActiveWarehouseContext
│   ├── SERVICE: casetillaService
│   │   ├── createIngreso()
│   │   ├── getPendingReservations()
│   │   ├── searchPendingReservations()
│   │   └── getReservationCasetillaState()
│   └── COMPONENTE: QRScannerModal.tsx (feature)
├── COMPONENTE: ExitForm.tsx
│   ├── SERVICE: casetillaService
│   │   ├── createSalida()
│   │   └── getExitEligibleReservations()
│   └── HOOK: useActiveWarehouse()
├── COMPONENTE: PendingReservationsGrid.tsx
│   └── SERVICE: casetillaService.getPendingReservations()
├── COMPONENTE: ExitReservationsGrid.tsx
│   └── SERVICE: casetillaService.getExitEligibleReservations()
├── COMPONENTE: NoShowReservationsGrid.tsx
│   └── SERVICE: casetillaService.getNoShowReservations()
├── COMPONENTE: DurationReportGrid.tsx
│   └── SERVICE: casetillaService.getDurationReport()
├── COMPONENTE: ProviderDistributionGrid.tsx
│   └── SERVICE: casetillaService.getProviderDistributionReport()
└── RPC: get_pending_reservations_v4         → PostgreSQL function
```

**Qué rompe si se modifica:**
- `createIngreso` → no se pueden registrar entradas
- `createSalida` → no se pueden registrar salidas
- RPC `get_pending_reservations_v4` → grilla de pendientes vacía
- `emailTriggerService` → correos no se envían tras IN/OUT

---

## PÁGINA: Admin → Usuarios (`/admin/usuarios`)

```
src/pages/admin/usuarios/page.tsx
├── COMPONENTE: UsersTab.tsx
│   ├── SERVICE: adminService
│   │   ├── getOrgUsers()                   → EF admin-users (list)
│   │   ├── createOrgUser()                 → EF admin-users (create)
│   │   ├── updateOrgUser()                 → EF admin-users (update_role)
│   │   └── removeOrgUser()                 → EF admin-users (remove_from_org)
│   └── SERVICE: userAccessService
│       ├── get()                           → EF admin-user-access (get)
│       ├── setCountries()                  → EF admin-user-access (set_countries)
│       └── setWarehouses()                 → EF admin-user-access (set_warehouses)
├── COMPONENTE: RolesTab.tsx
│   └── SERVICE: adminService
│       ├── getRoles()                      → supabase roles
│       ├── createRole()                    → supabase roles INSERT
│       ├── updateRole()                    → supabase roles UPDATE
│       └── deleteRole()                    → supabase roles DELETE
├── COMPONENTE: PermissionsTab.tsx
│   └── SERVICE: adminService
│       ├── getPermissions()                → supabase permissions
│       ├── createPermission()              → supabase permissions INSERT
│       ├── updatePermission()              → supabase permissions UPDATE
│       └── deletePermission()              → supabase permissions DELETE
└── COMPONENTE: PermissionMatrixTab.tsx
    └── SERVICE: adminService
        ├── getRolePermissions()            → supabase role_permissions
        ├── addPermissionToRole()           → supabase role_permissions INSERT + audit_log
        ├── removePermissionFromRole()      → supabase role_permissions DELETE + audit_log
        └── bulkUpdateRolePermissions()     → supabase role_permissions DELETE+INSERT + audit_log
```

**Qué rompe si se modifica:**
- EF `admin-users` → no se pueden gestionar usuarios (CRUD total)
- EF `admin-user-access` → no se pueden asignar países/almacenes
- `admin_audit_log` INSERT → pérdida de trazabilidad

---

## PÁGINA: Admin → Clientes (`/admin/clientes`)

```
src/pages/admin/clientes/page.tsx
├── COMPONENTE: ClientModal.tsx
│   └── SERVICE: clientsService
│       ├── createClient()
│       └── updateClient()
├── COMPONENTE: ClientDetailDrawer.tsx
│   ├── SERVICE: clientsService
│   │   ├── getClient()
│   │   ├── getClientRules()
│   │   ├── updateClientRules()
│   │   ├── getClientDocks()
│   │   ├── setClientDocks()
│   │   ├── getClientProviders()
│   │   └── setClientProviders()
│   └── SERVICE: clientBlockedStatusesService
│       ├── getConfig()
│       └── setConfig()
├── COMPONENTE: ClientPickupRulesTab.tsx
│   └── SERVICE: clientPickupRulesService
│       ├── listByClient()
│       ├── create()
│       ├── update()
│       ├── deactivate()
│       ├── activate()
│       └── deleteRule()
│   └── CONTEXT: useClientPickupRulesContext().notifyRuleChanged()
└── COMPONENTE: RuleBlock.tsx / SameDayCutoffRuleBlock.tsx
    └── SERVICE: sameDayCutoffService
```

**Qué rompe si se modifica:**
- `client_rules` UPDATE → reglas de cutoff/allocación no se aplican
- `client_pickup_rules` → bloques no se generan
- `client_providers` → asignación proveedor-cliente rota

---

## PÁGINA: Admin → Correspondencia (`/admin/correspondencia`)

```
src/pages/admin/correspondencia/page.tsx
├── COMPONENTE: RuleModal.tsx
│   └── SERVICE: correspondenceService
│       ├── createRule()
│       └── updateRule()
├── COMPONENTE: LogsTab.tsx
│   └── SERVICE: correspondenceService
│       ├── getLogs()
│       ├── retryFailedEmail()
│       ├── retryAllFailedEmails()
│       └── retryAllQueuedEmails()
├── COMPONENTE: GmailAccountTab.tsx
│   └── EF: gmail-callback, gmail-connection-status
└── COMPONENTE: SmtpServiceTab.tsx
    └── Configuración visual de SMTP (no modifica secrets)
```

**Qué rompe si se modifica:**
- EF `correspondence-process-event` → no se envían correos automáticos
- EF `smtp-send` → no se pueden enviar/reintentar correos
- Secrets `SMTP_USER`, `SMTP_PASS` → falla autenticación SMTP

---

## PÁGINA: Chat (`/chat`)

```
src/pages/chat/page.tsx
├── COMPONENTE: ChatSidebar.tsx
│   └── HOOK: useChatSession()
│       ├── sessions, loadingSessions
│       ├── selectSession(), startNewSession()
│       ├── renameSession(), removeSession()
│       └── SERVICE: chatService.fetchSessions()
├── COMPONENTE: ChatWindow.tsx
│   ├── HOOK: useChatSession()
│   │   ├── messages, loadingMessages, sending
│   │   └── sendMessage()
│   └── COMPONENTE: MessageBubble.tsx
├── COMPONENTE: SROAssistantWidget.tsx (feature/chat-widget)
│   ├── HOOK: useChatSession()
│   ├── COMPONENTE: SROAssistantPanel.tsx
│   ├── COMPONENTE: SROAssistantMessageList.tsx
│   ├── COMPONENTE: SROAssistantInput.tsx
│   └── COMPONENTE: SROAssistantBubble.tsx
└── SERVICE: chatService
    ├── askChat()                           → EF ask-sro-chat
    ├── fetchMessages()                     → supabase chat_messages
    ├── createSession()                     → supabase chat_sessions
    └── archiveSession()                    → supabase chat_sessions
```

---

## PÁGINA: Conocimiento (`/conocimiento`)

```
src/pages/conocimiento/page.tsx
├── HOOK: useKnowledgeDocuments()
│   ├── documents, loading, error
│   ├── uploadAndCreate()
│   ├── updateDoc(), updateRelations()
│   ├── archive(), process(), reindex()
│   └── SERVICE: knowledgeService
│       ├── fetchDocuments()                → supabase knowledge_documents + pivotes
│       ├── uploadDocumentFile()            → supabase storage knowledge-documents
│       ├── createDocumentRecord()          → supabase knowledge_documents INSERT
│       ├── updateDocument()                → supabase knowledge_documents UPDATE
│       └── updateDocumentRelations()       → DELETE + INSERT pivotes
├── COMPONENTE: UploadDocumentModal.tsx
├── COMPONENTE: EditDocumentModal.tsx
├── COMPONENTE: DocumentCard.tsx
└── SERVICE: chatService
    ├── processDocument()                   → EF process-knowledge-document
    └── reindexDocument()                   → EF reindex-knowledge-document
```

---

## PÁGINA: Dashboard (`/dashboard`)

```
src/pages/dashboard/page.tsx
├── HOOK: useActiveWarehouse()              → ActiveWarehouseContext
├── HOOK: usePermissions()                  → AuthContext
├── SERVICE: dashboardService.getStats()
│   ├── supabase reservations (6 queries por período)
│   ├── supabase reservation_statuses
│   ├── supabase docks
│   ├── supabase warehouses
│   ├── supabase providers
│   └── supabase collaborators + collaborator_warehouses
└── HOOK: useUserScope().allowedDockIds (si disponible)
```

---

## DEPENDENCIAS TRANSVERSALES

### AuthContext → Todo el sistema
```
AuthContext (AuthProvider en App.tsx)
├── useAuth() → TODAS las páginas protegidas
│   ├── user, supabaseUser, isAuthenticated
│   ├── canLocal(permission) → usePermissions()
│   ├── loading, pendingAccess
│   └── sessionExpired, clearSessionExpired
├── usePermissions() → useAuth()
│   ├── orgId → user.orgId
│   ├── can(permission) → canLocal(permission)
│   └── hasRole(role) → user.role === role
└── ProtectedRoute → useAuth()
    └── Redirige según: loading → spinner, pendingAccess → /access-pending,
        !user → /login, role=CASETILLA → /casetilla, else → /calendario
```

### ActiveWarehouseContext → Calendario, Casetilla, Dashboard, Admin
```
ActiveWarehouseContext
├── useActiveWarehouse() → calendario, casetilla, dashboard, admin/*
│   ├── activeWarehouseId → filtro principal
│   ├── effectiveWarehouseIds → queries a DB
│   ├── activeWarehouse.timezone → formateo de fechas
│   └── selectionInvalidated → modal de selección
├── Depende de: useUserScope() → allowedWarehouseIds, availableWarehouses
├── Depende de: usePermissions() → orgId
└── Persiste en: localStorage (key: sro_active_warehouse_{orgId})
```

### ClientPickupRulesContext → Admin Clientes + Calendario
```
ClientPickupRulesContext (en App.tsx)
├── useClientPickupRulesContext() → admin/clientes + calendario
│   ├── notifyRuleChanged(dockIds) → admin/clientes/ClientPickupRulesTab
│   └── lastRuleChange, affectedDockIds → calendario/SchedulerView
└── Cross-route: provider en App.tsx, consumido en 2 páginas distintas
```

---

## QUÉ ROMPE QUÉ — MATRIZ DE IMPACTO

| Si se modifica... | Rompe... |
|-------------------|----------|
| `AuthContext.tsx` | Todo (login, permisos, sesión) |
| `useUserScope.ts` | Segregación de warehouses/clientes |
| `ActiveWarehouseContext.tsx` | Filtro de warehouse en calendario/casetilla/dashboard |
| `calendarService.ts` | Todo el calendario (reservas, docks, bloques, QR) |
| `casetillaService.ts` | Todo Casetilla (IN, OUT, reportes) |
| `adminService.ts` | Gestión de usuarios, roles, permisos |
| `emailTriggerService.ts` | Todos los correos automáticos |
| `correspondence-process-event` EF | Despacho de correos por reglas |
| `smtp-send` EF | Envío real de correos SMTP |
| `create-reservation` EF | Creación de reservas (validación server-side) |
| `admin-users` EF | CRUD de usuarios (sin esto no se crean/editan/eliminan) |
| `admin-user-access` EF | Asignación de países/almacenes a usuarios |
| `ask-sro-chat` EF | Chat IA (SRObot) |
| `generate-client-pickup-blocks` EF | Bloques de Cliente Retira |
| `auto-mark-no-show` EF | Marcado automático de No Show |
| `process-knowledge-document` EF | Procesamiento de documentos en OpenAI |
| `supabase.ts` (lib) | Toda conexión a Supabase |
| `reservation-qrs` bucket | QR y fichas de cita |
| `reservation-files` bucket | Archivos adjuntos de reservas |
| `knowledge-documents` bucket | Documentos de conocimiento |
| `ProtectedRoute.tsx` | Control de acceso a rutas |
| `RequirePermission.tsx` | Control de permisos por ruta |
| `__BASE_PATH__` | Todas las rutas y redirects OAuth |
| `VITE_PUBLIC_SUPABASE_URL` | Conexión a Supabase |
| `VITE_PUBLIC_SUPABASE_ANON_KEY` | Autenticación anónima |