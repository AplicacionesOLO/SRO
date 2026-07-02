# DATA FLOW — Suite OLO / App Hub Manager

> **Documentación Enterprise-Grade | Segunda Pasada**
> Basado exclusivamente en el código fuente (v1199)
> Cada flujo de datos está trazado desde su origen hasta su consumo final.

---

## RESERVATION (Entidad Central)

```
ORIGEN
├── UI: ReservationModal.tsx (formulario)
│   └── Campos: dockId, startDate, startTime, endDate, endTime,
│       purchaseOrder, truckPlate, orderRequestNumber, shipperProvider,
│       driver, dua, invoice, statusId, notes, transportType, cargoType,
│       operationType, cargoOrigin, blNumber, quantityValue,
│       isConsolidated, consolidatedProviders, recurrence
│
├── TRANSFORMACIONES (ReservationModal → calendarService)
│   ├── start_datetime = startDate + startTime → ISO string
│   ├── end_datetime = endDate + endTime → ISO string
│   ├── shipper_provider → puede ser UUID o texto libre
│   ├── recurrence → objeto JSON { weekdays, weeksAhead } o null
│   └── is_consolidated → booleano
│
├── VALIDACIONES (create-reservation EF)
│   ├── org_id, dock_id → UUID regex
│   ├── start_datetime → requerido
│   ├── User pertenece a org → user_org_roles check
│   ├── Same-day cutoff → client_rules + warehouse timezone
│   ├── Overlap → exclusion constraint reservations_no_overlap
│   └── Business hours → validado implícitamente por el grid
│
├── PERSISTENCIA
│   ├── INSERT → public.reservations (RLS activa)
│   │   Columnas: id, org_id, dock_id, start_datetime, end_datetime,
│   │   status_id, is_cancelled, cancel_reason, cancelled_by, cancelled_at,
│   │   dua, invoice, driver, truck_plate, purchase_order,
│   │   order_request_number, shipper_provider, client_id, operation_type,
│   │   is_imported, bl_number, quantity_value, notes, transport_type,
│   │   cargo_type, created_by, created_at, updated_by, updated_at,
│   │   is_consolidated, qr_image_url, qr_card_image_url, recurrence
│   │
│   ├── INSERT (si consolidado) → public.reservation_consolidated_providers
│   │   Columnas: id, org_id, reservation_id, provider_id, package_quantity
│   │
│   └── INSERT → public.activity_log (vía calendarService.saveConsolidatedProviders)
│
├── CACHE
│   ├── getReservations: SIN cache (datos en tiempo real)
│   ├── getVisibleDockIds: cache 2 min (dockIdsCache)
│   ├── getReservationStatuses: cache 5 min (statusesCache)
│   ├── getDockCategories: cache 5 min (categoriesCache)
│   └── getDocks (client segregation): cache 2 min (segregationCache)
│
├── LECTURA
│   ├── calendarService.getReservations(orgId, startDate, endDate, allowedWarehouseIds, allowedDockIds)
│   │   ├── Ruta rápida: si hay allowedDockIds → select ligero sin join a statuses
│   │   ├── Ruta legacy: si hay allowedWarehouseIds → pre-calcula dock_ids desde docks
│   │   └── Enriquecimiento: profiles (creator name/email)
│   ├── calendarService.getAllReservations() → igual pero SIN filtrar is_cancelled
│   ├── casetillaService.getPendingReservations() → RPC get_pending_reservations_v4
│   ├── api-v1-reservations-get EF → API pública con paginación + scope
│   └── dashboardService.getStats() → 6 queries en paralelo
│
├── CONSUMO
│   ├── SchedulerView.tsx → grid del calendario
│   ├── ReservationHoverCard.tsx → tooltip
│   ├── ReservationModal.tsx → modo edición
│   ├── PendingReservationsGrid.tsx → grilla casetilla IN
│   ├── ExitReservationsGrid.tsx → grilla casetilla OUT
│   ├── NoShowReservationsGrid.tsx → grilla no-show
│   ├── ActivityTab.tsx → historial de actividad
│   └── Dashboard → estadísticas y tendencias
│
└── ELIMINACIÓN
    ├── cancelReservation → soft-delete (is_cancelled = true)
    ├── deleteReservation → DELETE físico (poco usado)
    └── auto-mark-no-show → UPDATE status_id = NO_SHOW
```

---

## DOCK (Andén)

```
ORIGEN
├── UI: admin/almacenes (gestión de andenes)
├── UI: admin/docks (si existe módulo separado)
└── Seed/Migration SQL

TRANSFORMACIONES
├── name → normalizado
├── reference → string opcional
└── header_color → color CSS

PERSISTENCIA → public.docks
Columnas: id, org_id, name, reference, header_color, category_id,
         status_id, is_active, warehouse_id

CACHE
├── getVisibleDockIds: cache 2 min (dockIdsCache)
├── getDocks (segregation): cache 2 min (segregationCache)
└── Invalidate: calendarService.invalidateDockIdsCache(orgId, warehouseId)

LECTURA
├── calendarService.getDocks(orgId, warehouseId, allowedWarehouseIds, allowedClientIds, warehouseTimezoneMap)
│   └── JOIN: dock_categories, dock_statuses, warehouses (timezone)
├── calendarService.getVisibleDockIds() → solo IDs, ultra-rápido
├── clientsService.listDocks(orgId) → para asignación cliente-dock
└── dockAllocationService → docks filtrados por reglas de cliente

CONSUMO
├── SchedulerView.tsx → columnas del grid
├── WarehouseSelector.tsx → filtro por almacén
├── ClientDetailDrawer.tsx → asignación de docks a clientes
└── ReservationModal.tsx → selector de dock
```

---

## WAREHOUSE (Almacén)

```
ORIGEN → UI: admin/almacenes (WarehouseModal.tsx)
Campos: name, location, country_id, business_start_time, business_end_time,
        slot_interval_minutes, timezone, no_show_tolerance_minutes

TRANSFORMACIONES
├── business_start_time → normalizeTime('06:00:00')
├── business_end_time → normalizeTime('17:00:00')
└── timezone → 'America/Costa_Rica' default

PERSISTENCIA → public.warehouses
Columnas: id, org_id, name, location, country_id,
         business_start_time, business_end_time, slot_interval_minutes,
         timezone, no_show_tolerance_minutes, created_at

CACHE → SIN cache de warehouses (datos semi-estáticos, consulta ligera)

LECTURA
├── warehousesService.getWarehouses(orgId)
├── calendarService.getWarehouses(orgId) → para timezone y horarios
├── useUserScope → availableWarehouses (con timezone y location)
└── warehouse_clients → clientes asignados

CONSUMO
├── ActiveWarehouseContext → selección de almacén activo
├── SchedulerView → timezone para formateo de horas
├── create-reservation EF → validación same-day cutoff
├── generate-client-pickup-blocks EF → horarios hábiles
└── auto-mark-no-show EF → tolerancia no-show
```

---

## USER (Usuario)

```
ORIGEN
├── Supabase Auth (auth.users)
│   ├── id, email, created_at, last_sign_in_at
│   └── raw_user_meta_data, raw_app_meta_data
├── public.profiles
│   └── id (FK→auth.users), name, email, phone_e164, access_status
└── public.user_org_roles
    └── user_id, org_id, role_id, assigned_by, assigned_at

TRANSFORMACIONES (AuthContext.loadUserProfile)
├── user_org_roles + roles → UserRole = 'ADMIN'|'SUPERVISOR'|'OPERADOR'|'CASETILLA'
├── profiles.name || email.split('@')[0] || 'Usuario' → User.name
├── profiles.email || userEmail → User.email
├── user_org_roles.org_id → User.orgId
└── role_permissions + permissions → Set<string> → canLocal()

CACHE
├── PermissionsSet → en memoria (React state en AuthContext)
├── User → en memoria (React state)
└── NO expira — solo se recarga en login/refresh

LECTURA
├── useAuth() → user, supabaseUser, canLocal, pendingAccess
├── usePermissions() → orgId, userId, can, hasRole
├── adminService.getOrgUsers() → EF admin-users
└── userAccessService.get() → EF admin-user-access

CONSUMO
├── ProtectedRoute → control de acceso
├── RequirePermission → control granular de permisos
├── Navbar → nombre de usuario, logout
├── Sidebar → items según permisos
└── Todos los servicios → org_id, user_id en queries
```

---

## PROVIDER (Proveedor)

```
ORIGEN
├── UI: admin/catalogos (ProviderModal.tsx, ProviderSyncModal.tsx)
├── API externa → EF sync-providers
└── Import Excel → EF sync-providers-excel

TRANSFORMACIONES
├── name → .trim().toUpperCase()
├── provider_code → .trim().toUpperCase()
├── source, source_code → .trim().toUpperCase()
├── provider_type → 'almacenaje' | 'pesado'
├── client_id → resuelto por source_code vía origen_proveedores
└── active → boolean

PERSISTENCIA → public.providers
Columnas: id, org_id, name, active, provider_type, provider_code,
         source, source_code, client_id, created_at

Unique constraint: (org_id, name_normalized, source_normalized) — upsert

CACHE
├── origenCache → Map<string, {clientId, name}> (TTL 60s)
├── provider_warehouses → sin cache
└── getProviderAssignments → paginado, sin cache

LECTURA
├── providersService.searchProviders(orgId, warehouseId, searchTerm, limit=25)
├── providersService.getByWarehouse(orgId, warehouseId) → paginado bloques de 1000
├── providersService.getAll() / getActive() → paginado completo
├── providersService.getProviderAssignmentsOptimized() → 2 queries quirúrgicas
└── providersService.getReservationCount() → 2 count queries

CONSUMO
├── ReservationModal → searchSelect de proveedor
├── ProviderSearchSelect.tsx → componente reutilizable
├── ProvidersTab.tsx → tabla de proveedores
├── ProviderSyncModal.tsx → sincronización
├── Casetilla → display de proveedor en grillas
└── Dashboard → topProviders
```

---

## CLIENT (Cliente)

```
ORIGEN
├── UI: admin/clientes (ClientModal.tsx)
└── Campos: name, legal_id, email, phone, address, notes, is_active

PERSISTENCIA → public.clients
Columnas: id, org_id, name, legal_id, email, phone, address,
         notes, is_active, created_at, updated_at

RELACIONES
├── warehouse_clients → asignación a almacenes
├── client_docks → andenes asignados
├── client_providers → proveedores vinculados
├── client_rules → reglas (cutoff, dock allocation, blocked statuses)
├── client_pickup_rules → reglas Cliente Retira
├── client_same_day_bypass_users → bypass same-day cutoff
└── origen_proveedores → mapeo source_code → cliente

LECTURA
├── clientsService.listClients(orgId, search)
├── clientsService.listClientsByWarehouse(orgId, warehouseId, search)
├── clientsService.getClient(orgId, clientId)
└── useUserScope → availableClients (con name)

CONSUMO
├── ClientDetailDrawer → gestión completa del cliente
├── WarehouseModal → asignación cliente-almacén
├── AsignacionesTab → clusters y asignaciones
├── Casetilla → filtro por cliente
└── ReservationModal → cliente implícito por dock/provider
```

---

## CHAT MESSAGE

```
ORIGEN
├── UI: SROAssistantInput.tsx (widget) o ChatWindow.tsx (página chat)
└── Campo: question (string)

TRANSFORMACIONES (useChatSession.sendMessage)
├── Optimistic: tempMsg con id temporal, role='user'
├── chatService.askChat({ question, session_id })
└── Respuesta → reemplaza optimistic, añade assistant message

PERSISTENCIA → EF ask-sro-chat
├── INSERT chat_messages (user) → session_id, org_id, user_id,
│   role='user', content=question, citations=[], used_document_ids=[]
├── INSERT chat_messages (assistant) → role='assistant',
│   content=answer, citations, used_document_ids, model, tokens
└── UPDATE chat_sessions.last_message_at

LECTURA
├── chatService.fetchMessages(sessionId) → order by created_at ASC
└── Solo se cargan al seleccionar una sesión

CACHE → SIN cache (chat es tiempo real)

CONSUMO
├── SROAssistantMessageList.tsx → widget flotante
├── MessageBubble.tsx → página de chat
└── ChatSidebar.tsx → lista de sesiones
```

---

## QR / FICHA DE CITA

```
ORIGEN
├── reservation.id → payload JSON { type: "sro_reservation", reservation_id }
└── Datos de la reserva → providerName, startDatetime, endDatetime, operationType

TRANSFORMACIONES
├── generateQRBlob(reservationId) → canvas → PNG blob
├── generateQRCardBlob({ id, providerName, ... }) → canvas completo → PNG blob
└── Cache-buster: ?t=${Date.now()} en URL

PERSISTENCIA → bucket: reservation-qrs
├── Path: {orgId}/reservations/{reservationId}/qr.png
├── Path: {orgId}/reservations/{reservationId}/card.png
├── upload con cacheControl: '3600', upsert: true, contentType: 'image/png'
└── UPDATE reservations.qr_image_url / qr_card_image_url

LECTURA
├── getPublicUrl(path) → URL pública (bucket público)
└── Desde correspondence-process-event → asegura QR inline si no existe

CONSUMO
├── ReservationQRModal.tsx → modal con QR + ficha
├── ReservationHoverCard.tsx → preview
├── Correspondence email → <img src="qr_image_url">
└── Casetilla → QR scanner (QRScannerModal.tsx)
```

---

## EMAIL / CORRESPONDENCIA

```
ORIGEN
├── emailTriggerService.onReservationCreated() → eventType: 'reservation_created'
├── emailTriggerService.onReservationStatusChanged() → eventType: 'reservation_status_changed'
└── UI: correspondenceService.retryFailedEmail() / retryAll()

TRANSFORMACIONES
├── processTemplate(template, ctx) → reemplaza {{variable}}
├── normalizeEmailBody(raw) → HTML seguro con inline styles
├── resolveRecipients(rule) → toEmails, ccEmails, bccEmails
├── resolveCasetillaPhotos() → HTML con <img> de fotos
├── generateQRDataUrl() → QR inline en base64
└── buildRawEmail() → MIME multipart/alternative

PERSISTENCIA
├── correspondence_outbox → registro de cada email
│   Columnas: id, org_id, warehouse_id, rule_id, reservation_id,
│   event_type, actor_user_id, sender_user_id, sender_email,
│   to_emails, cc_emails, bcc_emails, subject, body,
│   status (queued/sent/failed), provider_message_id, error,
│   created_at, sent_at
│
└── correspondence_rules → reglas de disparo
    Columnas: id, org_id, name, event_type, warehouse_id,
    status_from_id, status_to_id, sender_mode, sender_user_id,
    recipients_mode, recipients_emails, recipients_user_ids,
    recipients_roles, recipient_users, recipient_roles,
    recipient_external_emails, cc_emails, bcc_emails,
    subject, body_template, is_active, include_casetilla_photos,
    require_dua, include_creator_recipient, created_by, updated_by, updated_at

LECTURA
├── correspondenceService.getLogs(orgId, warehouseId)
├── correspondenceService.getRules(orgId, warehouseId)
└── correspondence-process-event → carga rules + reservation

CONSUMO
├── LogsTab.tsx → tabla de logs
├── RuleModal.tsx → CRUD de reglas
└── Retry buttons → reintento manual
```

---

## KNOWLEDGE DOCUMENT

```
ORIGEN
├── UI: UploadDocumentModal.tsx (file picker)
└── Campos: title, description, access_level, visibility_mode, tags, role_ids, permission_keys

TRANSFORMACIONES
├── uploadDocumentFile → supabase storage upload
├── createDocumentRecord → INSERT con status='draft'
├── processDocument → EF descarga, sube a OpenAI, agrega a vector store
└── status: draft → processing → active | failed

PERSISTENCIA
├── knowledge_documents
│   Columnas: id, org_id, uploaded_by, title, description, file_name,
│   file_path, file_size, access_level, visibility_mode, status,
│   is_active, openai_file_id, openai_vector_store_id,
│   openai_vector_store_file_id, processed_at, created_at, updated_at
│
├── knowledge_document_tags → document_id, tag
├── knowledge_document_roles → document_id, role_id
├── knowledge_document_permissions → document_id, permission_key
└── knowledge_document_versions → versionado

LECTURA
├── fetchDocuments(orgId) → JOIN tags, roles, permissions
├── fetchDocumentById(id)
└── ask-sro-chat EF → filtrado por access_level + visibility_mode

CONSUMO
├── DocumentCard.tsx → lista de documentos
├── EditDocumentModal.tsx → edición
├── ask-sro-chat EF → file_search en OpenAI
└── useKnowledgeDocuments → hook central
```

---

## AUDIT LOG

```
ORIGEN
├── calendarService.saveConsolidatedProviders → diff de proveedores
├── auto-mark-no-show EF → AUTO_NO_SHOW
├── regenerateReservationQRAssets → regeneración QR
├── adminService.addPermissionToRole / removePermissionFromRole / bulkUpdate
└── calendarService.updateReservation (status changes)

PERSISTENCIA
├── activity_log
│   Columnas: id, org_id, entity_type, entity_id, action,
│   field, old_value, new_value, metadata, actor_user_id, created_at
├── admin_audit_log
│   Columnas: id, org_id, event_type, entity_type, entity_id,
│   details, changed_by, created_at
└── reservation_activity_log (tabla existente pero NO usada en el código actual)

LECTURA
├── activityLogService.getActivityLogs(orgId, entityType, entityId)
└── ActivityTab.tsx → tabla de actividad

ELIMINACIÓN → NO se eliminan logs (append-only)
```

---

## CACHE STRATEGY (Resumen)

| Dato | Cache | TTL | Storage | Invalidación |
|------|-------|-----|---------|-------------|
| User scope (warehouses) | scopeCache | 5 min | Memoria (Map) | invalidateScopeAndReload() |
| User scope (clients) | scopeCache | 5 min | Memoria (Map) | invalidateScopeAndReload() |
| Visible dock IDs | dockIdsCache | 2 min | Memoria (Map) | invalidateDockIdsCache() |
| Dock segregation | segregationCache | 2 min | Memoria (Map) | Inline key check |
| Reservation statuses | statusesCache | 5 min | Memoria (Map) | invalidateReservationStatusesCache() |
| Dock categories | categoriesCache | 5 min | Memoria (Map) | invalidateDockCategoriesCache() |
| Origen proveedores | origenCache | 1 min | Memoria (var) | Por timestamp |
| Active warehouse | localStorage | ∞ | localStorage | setActiveWarehouseId() |
| Reservation draft | localStorage | 7 días | localStorage | clearDraftFromStorage() |
| User | React state | Sesión | Memoria | login / refresh |
| PermissionsSet | React state | Sesión | Memoria | loadPermissions() |
| SMTP secrets | Supabase Secrets | ∞ | Deno.env | Dashboard |
| OpenAI key | Supabase Secrets | ∞ | Deno.env | Dashboard |