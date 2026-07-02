# TRACEABILITY MATRIX — Suite OLO / App Hub Manager

> **Documentación Enterprise-Grade | Segunda Pasada**
> Matriz completa de trazabilidad: cada página → componentes → hooks → servicios → Edge Functions → tablas → storage → auditoría → correo → IA → permisos → RLS.

---

## MATRIZ PRINCIPAL

| Página | Componentes | Hooks | Servicios | Edge Functions | Tablas | Storage | Auditoría | Correo | IA | Permisos | RLS |
|--------|------------|-------|-----------|---------------|--------|---------|-----------|--------|----|---------|-----|
| **Login** | — | useAuth | AuthContext.login, loginWithGoogle | — | user_org_roles, roles, profiles, role_permissions | — | — | — | — | — | user_org_roles |
| **Calendario** | SchedulerView, ReservationModal, BlockModal, ActivityTab, BlocksManagementTab, BlockedStatusesConfig, RecurrenceForm, ReservationHoverCard, PreReservationMiniModal | useAuth, useActiveWarehouse, useUserScope, useBlockedStatuses, useReservationDraft, useReservationBlockedStatus, useClientPickupRulesContext | calendarService, emailTriggerService, providersService, clientsService, dockAllocationService, clientBlockedStatusesService, activityLogService | create-reservation, correspondence-process-event, generate-client-pickup-blocks | reservations, docks, dock_time_blocks, dock_categories, dock_statuses, warehouses, reservation_statuses, profiles, providers, clients, client_rules, client_docks, reservation_files, reservation_consolidated_providers | reservation-qrs, reservation-files | activity_log | ✅ (creación, cambio estado) | — | canLocal (blocked statuses), useUserScope (segregación) | reservations, docks, dock_time_blocks |
| **Casetilla** | IngresoForm, ExitForm, PendingReservationsGrid, ExitReservationsGrid, NoShowReservationsGrid, DurationReportGrid, ProviderDistributionGrid, QRScannerModal, PhotoUploader | useAuth, useActiveWarehouse, useUserScope | casetillaService, emailTriggerService | — (RPC: get_pending_reservations_v4) | reservations, casetilla_ingresos, casetilla_salidas, docks, warehouses, providers, clients | fotos (Storage directo) | activity_log | ✅ (IN/OUT) | — | useUserScope (segregación) | reservations, casetilla_ingresos, casetilla_salidas |
| **Dashboard** | — | useAuth, useActiveWarehouse, usePermissions, useUserScope | dashboardService | — | reservations, reservation_statuses, docks, warehouses, providers, collaborators, collaborator_warehouses | — | — | — | — | useUserScope (dock filter) | reservations |
| **Chat** | ChatSidebar, ChatWindow, MessageBubble, SROAssistantWidget, SROAssistantPanel, SROAssistantMessageList, SROAssistantInput | useChatSession, useChatAudit | chatService, knowledgeService | ask-sro-chat | chat_sessions, chat_messages, chat_audit_logs, chat_prompt_configs, knowledge_documents, knowledge_document_roles, knowledge_document_permissions, role_permissions | — | chat_audit_logs | — | ✅ (OpenAI) | chat.ask, chat.answers.* | chat_sessions, chat_messages |
| **Conocimiento** | DocumentCard, UploadDocumentModal, EditDocumentModal | useKnowledgeDocuments | knowledgeService, chatService | process-knowledge-document, reindex-knowledge-document | knowledge_documents, knowledge_document_tags, knowledge_document_roles, knowledge_document_permissions | knowledge-documents | — | — | ✅ (OpenAI) | — | knowledge_documents |
| **Admin Usuarios** | UsersTab, RolesTab, PermissionsTab, PermissionMatrixTab | useAuth, usePermissions | adminService, userAccessService | admin-users, admin-user-access | user_org_roles, roles, permissions, role_permissions, profiles, user_warehouse_access, user_country_access, admin_audit_log | — | admin_audit_log | — | — | admin.users.*, admin.matrix.* | roles, permissions, role_permissions |
| **Admin Clientes** | ClientModal, ClientDetailDrawer, ClientPickupRulesTab, RuleBlock, SameDayCutoffRuleBlock | useAuth, useClientPickupRulesContext | clientsService, clientBlockedStatusesService, clientPickupRulesService, sameDayCutoffService, providersService | generate-client-pickup-blocks | clients, client_rules, client_docks, client_providers, client_pickup_rules, client_same_day_bypass_users, warehouse_clients | — | — | — | — | — | clients, client_rules |
| **Admin Correspondencia** | RuleModal, LogsTab, GmailAccountTab, SmtpServiceTab, WarehouseAnalysisModal | useAuth | correspondenceService | correspondence-process-event, smtp-send, gmail-callback | correspondence_rules, correspondence_outbox, gmail_accounts | — | — | ✅ (envío/reintento) | — | — | correspondence_rules |
| **Admin Catálogos** | ProvidersTab, CargoTypesTab, OrigenProveedoresTab, TimeProfilesTab, AsignacionesTab, ProviderModal, ProviderSearchSelect, ProviderSyncModal, ProviderBulkImportModal, ProviderExcelSyncModal, CargoTypeModal, ClusterPanel, ClusterModal, UserAssignmentCard, UserDetailDrawer | useAuth, useActiveWarehouse | providersService, cargoTypesService, timeProfilesService, clusterService, origenProveedoresService, userAccessService | sync-providers, sync-providers-excel | providers, provider_warehouses, client_providers, cargo_types, cargo_type_warehouses, origen_proveedores, provider_cargo_time_profiles, provider_clusters, provider_cluster_items, user_providers, user_clients, warehouse_clients | — | — | — | — | — | providers |
| **Admin Almacenes** | WarehouseModal, CountriesModal | useAuth | warehousesService, countriesService | — | warehouses, countries, warehouse_clients | — | — | — | — | — | warehouses |
| **Manpower** | CollaboratorModal, ManpowerControlModal | useAuth | collaboratorsService, manpowerControlService | — | collaborators, collaborator_warehouses, work_types, countries | — | — | — | — | — | collaborators |
| **Perfil** | — | useAuth | — | — | profiles | — | — | — | — | — | profiles |
| **Acceso Pendiente** | — | useAuth | — | — | — | — | — | — | — | — | — |

---

## LEYENDA DE LA MATRIZ

| Símbolo | Significado |
|---------|-------------|
| ✅ | Sí, implementado en código |
| — | No aplica / no usado |
| canLocal(X) | Validación por permiso específico |
| useUserScope | Segregación por warehouse/cliente |

---

## TRAZABILIDAD INVERSA: Si modifico X, ¿qué debo probar?

| Entidad | Páginas afectadas | Edge Functions | Riesgo |
|---------|-------------------|---------------|--------|
| `reservations` (tabla) | Calendario, Casetilla, Dashboard, Reservas, API v1 | create-reservation, correspondence-process-event, auto-mark-no-show, api-v1-* | CRÍTICO |
| `user_org_roles` (tabla) | Todas (auth) | admin-users, ask-sro-chat | CRÍTICO |
| `AuthContext` | Todas | — | CRÍTICO |
| `calendarService` | Calendario | create-reservation | ALTO |
| `casetillaService` | Casetilla | — | ALTO |
| `emailTriggerService` | Calendario, Casetilla | correspondence-process-event | ALTO |
| `useUserScope` | Calendario, Casetilla, Dashboard, Admin | — | ALTO |
| `correspondence_rules` (tabla) | Admin Correspondencia | correspondence-process-event | MEDIO |
| `client_rules` (tabla) | Admin Clientes, Calendario | create-reservation | MEDIO |
| `smtp-send` EF | Admin Correspondencia (reintentos) | smtp-send | ALTO |
| `SUPABASE_SERVICE_ROLE_KEY` (secret) | TODAS las EFs | Todas | CRÍTICO |
| `OPENAI_API_KEY` (secret) | Chat, Conocimiento | ask-sro-chat, process-knowledge-document | ALTO |
| `SMTP_*` (secrets) | Correspondencia | smtp-send | ALTO |