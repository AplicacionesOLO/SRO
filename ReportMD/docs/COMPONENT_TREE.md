# COMPONENT TREE — Suite OLO / App Hub Manager

> **Documentación Enterprise-Grade | Segunda Pasada**
> Basado exclusivamente en el código fuente (v1199)

---

## ÁRBOL COMPLETO

```
App.tsx
├── ErrorBoundary
├── AuthProvider
│   └── ActiveWarehouseProvider
│       └── ClientPickupRulesProvider
│           └── BrowserRouter (basename=__BASE_PATH__)
│               ├── Navbar (feature)
│               │   ├── Logo / Brand
│               │   ├── WarehouseSelector (feature)
│               │   ├── Nav Links (según permisos)
│               │   └── User Menu (nombre, logout)
│               ├── Sidebar (feature)
│               │   ├── Nav Items (según permisos)
│               │   └── SROAssistantWidget (feature/chat-widget)
│               ├── SessionExpiredModal (feature)
│               ├── GmailConnectionGuard (guards)
│               └── AppRoutes
│                   ├── / → Navigate /calendario
│                   ├── /login → LoginPage
│                   │   ├── Form: email, password
│                   │   ├── Submit Button
│                   │   └── Google Login Button
│                   ├── /access-pending → AccessPendingPage
│                   ├── /home → HomePage
│                   ├── /calendario → ProtectedRoute → CalendarioPage
│                   │   ├── WarehousePageHeader (feature)
│                   │   ├── SchedulerView
│                   │   │   ├── Grid (docks × time slots)
│                   │   │   ├── Reservation Blocks
│                   │   │   ├── Dock Time Blocks
│                   │   │   └── Hover: ReservationHoverCard
│                   │   ├── ReservationModal
│                   │   │   ├── Dock Selector
│                   │   │   ├── DateTime Pickers
│                   │   │   ├── Provider SearchSelect
│                   │   │   ├── Cargo Type Selector
│                   │   │   ├── Fields: placa, chofer, DUA, factura, OC, notas
│                   │   │   ├── RecurrenceForm
│                   │   │   └── Consolidated Providers Section
│                   │   ├── BlockModal
│                   │   ├── PreReservationMiniModal
│                   │   ├── ActivityTab
│                   │   ├── BlocksManagementTab
│                   │   ├── OperationalStatusesTab
│                   │   └── BlockedStatusesConfig
│                   ├── /casetilla → ProtectedRoute → CasetillaPage
│                   │   ├── IngresoForm
│                   │   │   ├── QRScannerModal (feature)
│                   │   │   └── PhotoUploader (base)
│                   │   ├── ExitForm
│                   │   │   └── PhotoUploader (base)
│                   │   ├── PendingReservationsGrid
│                   │   ├── ExitReservationsGrid
│                   │   ├── NoShowReservationsGrid
│                   │   ├── DurationReportGrid
│                   │   └── ProviderDistributionGrid
│                   ├── /dashboard → ProtectedRoute → DashboardPage
│                   ├── /reservas → ProtectedRoute → ReservasPage
│                   ├── /andenes → ProtectedRoute → AndenesPage
│                   │   └── DockModal
│                   ├── /manpower → ProtectedRoute → ManpowerPage
│                   │   ├── CollaboratorModal
│                   │   └── ManpowerControlModal
│                   ├── /perfil → ProtectedRoute → PerfilPage
│                   ├── /chat → ProtectedRoute → ChatPage
│                   │   ├── ChatSidebar
│                   │   │   ├── Session List
│                   │   │   └── New Session Button
│                   │   └── ChatWindow
│                   │       ├── Message List
│                   │       │   └── MessageBubble (×N)
│                   │       └── Input Area
│                   ├── /chat/auditoria → ProtectedRoute → ChatAuditoriaPage
│                   ├── /conocimiento → ProtectedRoute → ConocimientoPage
│                   │   ├── UploadDocumentModal
│                   │   ├── EditDocumentModal
│                   │   └── DocumentCard (×N)
│                   ├── /admin → ProtectedRoute → AdminPage
│                   │   ├── /admin/usuarios → UsersTab
│                   │   ├── /admin/roles → RolesTab
│                   │   ├── /admin/matriz-permisos → PermissionMatrixTab
│                   │   ├── /admin/almacenes → AlmacenesPage
│                   │   │   ├── WarehouseModal
│                   │   │   └── CountriesModal
│                   │   ├── /admin/catalogos → CatalogosPage
│                   │   │   ├── ProvidersTab
│                   │   │   │   ├── ProviderModal
│                   │   │   │   ├── ProviderSearchSelect
│                   │   │   │   ├── ProviderSyncModal
│                   │   │   │   ├── ProviderBulkImportModal
│                   │   │   │   └── ProviderExcelSyncModal
│                   │   │   ├── CargoTypesTab
│                   │   │   │   └── CargoTypeModal
│                   │   │   ├── OrigenProveedoresTab
│                   │   │   │   └── OrigenProveedorModal
│                   │   │   ├── TimeProfilesTab
│                   │   │   │   ├── TimeProfileModal
│                   │   │   │   └── TimeProfileBulkImportModal
│                   │   │   └── AsignacionesTab
│                   │   │       ├── ClusterPanel
│                   │   │       │   ├── ClusterModal
│                   │   │       │   └── ClusterBulkImportModal
│                   │   │       ├── UserAssignmentCard
│                   │   │       ├── UserDetailDrawer
│                   │   │       ├── ClientSelector
│                   │   │       └── CopyAssignmentsModal
│                   │   ├── /admin/clientes → ClientesPage
│                   │   │   ├── ClientModal
│                   │   │   └── ClientDetailDrawer
│                   │   │       ├── ClientPickupRulesTab
│                   │   │       │   └── RuleBlock (×N)
│                   │   │       └── SameDayCutoffRuleBlock
│                   │   └── /admin/correspondencia → CorrespondenciaPage
│                   │       ├── RuleModal
│                   │       ├── LogsTab
│                   │       ├── GmailAccountTab
│                   │       ├── SmtpServiceTab
│                   │       └── WarehouseAnalysisModal
│                   └── * → NotFound
```

---

## FEATURE COMPONENTS (src/components/feature/)

| Componente | Props | Hooks | Servicios | Eventos |
|-----------|-------|-------|-----------|---------|
| **Navbar** | — | useAuth, usePermissions | — | logout() |
| **Sidebar** | — | useAuth, usePermissions | — | navegación |
| **WarehouseSelector** | — | useActiveWarehouse | — | setActiveWarehouseId |
| **WarehousePageHeader** | title, showSelector? | useActiveWarehouse | — | — |
| **SessionExpiredModal** | — | useAuth | — | clearSessionExpired, login |
| **QRScannerModal** | isOpen, onClose, onScan | — | casetillaService | escaneo QR |
| **ReservationQRModal** | reservation | — | calendarService | — |
| **SROAssistantWidget** | — | useChatSession | chatService | toggle panel |
| ├── SROAssistantBubble | onClick | — | — | toggle |
| ├── SROAssistantPanel | isOpen | useChatSession | — | — |
| ├── SROAssistantHeader | onClose | — | — | — |
| ├── SROAssistantMessageList | messages, sending | — | — | — |
| └── SROAssistantInput | onSend, disabled | — | — | — |

---

## BASE COMPONENTS (src/components/base/)

| Componente | Props | Uso |
|-----------|-------|-----|
| **Pagination** | page, totalPages, onPageChange | Tablas paginadas |
| **SearchSelect** | options, value, onChange, onSearch, loading | Búsqueda asíncrona (proveedores, clientes) |
| **ConfirmModal** | isOpen, title, message, onConfirm, onCancel | Confirmaciones de eliminación |
| **PhotoUploader** | photos, onPhotosChange, maxPhotos? | Subida de fotos (casetilla) |
| **PhotoViewer** | photos | Visualización de fotos |

---

## GUARDS (src/components/guards/)

| Componente | Props | Lógica |
|-----------|-------|--------|
| **GmailConnectionGuard** | children | Verifica si Gmail está conectado antes de mostrar contenido de correspondencia |

---

## DEPENDENCIAS CRUZADAS ENTRE COMPONENTES

```
SchedulerView
├── depende de: useActiveWarehouse.effectiveWarehouseIds
├── depende de: useUserScope.allowedClientIds
├── depende de: useBlockedStatuses (drag validation)
├── depende de: useClientPickupRulesContext (refresh triggers)
├── depende de: calendarService (reservations, docks, blocks)
└── es consumido por: CalendarioPage

ReservationModal
├── depende de: dockAllocationService (dock enablement)
├── depende de: providersService.searchProviders
├── depende de: useReservationDraft
├── depende de: useReservationBlockedStatus
└── es consumido por: SchedulerView

ClientDetailDrawer
├── depende de: clientsService (reglas, docks, providers)
├── depende de: clientBlockedStatusesService
├── depende de: clientPickupRulesService
└── es consumido por: ClientesPage

ProviderSearchSelect
├── depende de: providersService.searchProviders
├── depende de: useActiveWarehouse.activeWarehouseId
└── es consumido por: ReservationModal, ProviderModal, AsignacionesTab
```