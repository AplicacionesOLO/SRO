# SERVICES REFERENCE — Suite OLO / App Hub Manager

> **Documentación Enterprise-Grade | Segunda Pasada**
> Basado exclusivamente en el código fuente (v1199)

---

## calendarService (`src/services/calendarService.ts` — 1981 líneas)

### Funciones Públicas

| Función | Parámetros | Retorna | Tablas | EF |
|---------|-----------|---------|--------|-----|
| `getReservations` | orgId, startDate, endDate, allowedWarehouseIds?, allowedDockIds? | `Reservation[]` | reservations, profiles | — |
| `getAllReservations` | Igual que getReservations pero sin filtrar is_cancelled | `Reservation[]` | reservations | — |
| `getDockTimeBlocks` | orgId, startDate, endDate, allowedDockIds? | `DockTimeBlock[]` | dock_time_blocks, profiles | — |
| `getAllDockTimeBlocksForManagement` | orgId | `DockTimeBlock[]` | dock_time_blocks, profiles, docks, warehouses | — |
| `getVisibleDockIds` | orgId, warehouseId?, allowedWarehouseIds?, allowedClientIds? | `string[]` | docks, client_docks | — |
| `getDocks` | orgId, warehouseId?, allowedWarehouseIds?, allowedClientIds?, warehouseTimezoneMap? | `Dock[]` | docks, dock_categories, dock_statuses, client_docks, warehouses | — |
| `getWarehouses` | orgId | `Warehouse[]` | warehouses | — |
| `createReservation` | `Partial<Reservation>` | `Reservation` | — | `create-reservation` |
| `createRecurringReservations` | baseReservation, additionalDates | `{ created_count, skipped_count, created_reservations, skipped_reservations }` | — | `create-reservation` (×N) |
| `updateReservation` | id, `Partial<Reservation>` | `Reservation` | reservations | — |
| `cancelReservation` | id, reason | void | reservations | — |
| `deleteReservation` | id | void | reservations | — |
| `createDockTimeBlock` | `Partial<DockTimeBlock>` | `DockTimeBlock` | dock_time_blocks, profiles | — |
| `createPersistentDockTimeBlock` | params (recurrencia) | `{ created, skipped }` | dock_time_blocks | — |
| `deleteDockTimeBlock` | id | void | dock_time_blocks | — |
| `updateDockTimeBlock` | id, updates | `DockTimeBlock` | dock_time_blocks | — |
| `getReservationStatuses` | orgId, forceRefresh? | `any[]` | reservation_statuses | — |
| `updateReservationStatus` | id, statusId | `Reservation` | reservations | — |
| `getDockCategories` | orgId, forceRefresh? | `any[]` | dock_categories | — |
| `getReservationFiles` | orgId, reservationId | `ReservationFile[]` | reservation_files | — |
| `uploadReservationFile` | `{ orgId, reservationId, category, file }` | `ReservationFile` | reservation_files, storage(reservation-files) | — |
| `getReservationFileSignedUrl` | fileUrlOrPath, expiresInSeconds? | string | storage(reservation-files) | — |
| `deleteReservationFile` | orgId, fileId | void | reservation_files, storage | — |
| `getReservationConsolidatedProviders` | orgId, reservationId | `ReservationConsolidatedProvider[]` | reservation_consolidated_providers, providers | — |
| `saveConsolidatedProviders` | orgId, reservationId, providers | void | reservation_consolidated_providers, activity_log | — |

### Funciones Independientes (exportadas)
- `ensureReservationQR(orgId, reservationId, options?)` → `string | null`
- `ensureReservationQRCard(orgId, reservationId, options?)` → `string | null`
- `regenerateReservationQRAssets(orgId, reservationId)` → void

### Cachés
- `dockIdsCache`: TTL 2 min → `getVisibleDockIds()`
- `segregationCache`: TTL 2 min → `getDocks()` (client segregation)
- `statusesCache`: TTL 5 min → `getReservationStatuses()`
- `categoriesCache`: TTL 5 min → `getDockCategories()`

### Dependencias
- `supabase` (client)
- `emailTriggerService`
- `@/utils/reservationQr.utils` (dynamic import)
- Storage buckets: `reservation-qrs`, `reservation-files`

### Riesgos
- Archivo de 1981 líneas → difícil de mantener
- Múltiples cachés con TTLs diferentes → posible inconsistencia
- Rutas rápida/legacy duplican lógica de filtrado

---

## casetillaService (`src/services/casetillaService.ts` — 2320 líneas)

### Funciones Públicas

| Función | Retorna | Tablas |
|---------|---------|--------|
| `getUserAllowedWarehouseIds(orgId, userId)` | `string[] \| null` | user_warehouse_access |
| `getClientsForWarehouses(orgId, warehouseIds)` | `CasetillaClientOption[]` | warehouse_clients, clients |
| `createIngreso(orgId, userId, data)` | `{ ingreso, reservationFound, reservationUpdated, ... }` | reservations, casetilla_ingresos |
| `getIngresos(orgId)` | `CasetillaIngreso[]` | casetilla_ingresos |
| `getPendingReservations(orgId, ...)` | `PendingRow[]` | RPC get_pending_reservations_v4, docks, warehouses, providers |
| `searchPendingReservations(orgId, searchTerm, ...)` | `PendingRow[]` | (filtra en memoria) |
| `getExitEligibleReservations(orgId, ...)` | `ExitRow[]` | casetilla_ingresos, casetilla_salidas, reservations, docks, warehouses |
| `getReservationCasetillaState(reservationId, orgId)` | `{ state, reservation }` | reservations, casetilla_ingresos, casetilla_salidas |
| `createSalida(orgId, userId, reservationId, fotos?, reservationData?)` | `{ salida, reservationId, ... }` | reservations, casetilla_salidas |
| `getDurationReport(orgId, filters?, ...)` | `DurationRow[]` | casetilla_ingresos, casetilla_salidas, reservations |
| `getProviderDistributionReport(orgId, startDate, endDate, timezone, ...)` | `ProviderDistRow[]` | reservations, casetilla_ingresos, casetilla_salidas, providers |
| `getMonthlyGlobalTimeDistributionReport(orgId, startDate, endDate, timezone, ...)` | `MonthlyRow[]` | reservations, casetilla_ingresos, casetilla_salidas |
| `getEarliestDataDate(orgId, timezone, ...)` | `string \| null` | reservations, casetilla_ingresos |
| `getNoShowReservations(orgId, ...)` | `NoShowRow[]` | reservations, docks, warehouses, providers |
| `checkNoShowExpired(reservationId, orgId)` | `{ expired, message }` | reservations, docks, warehouses |

### Dependencias
- `emailTriggerService` → dispara correos tras IN/OUT
- RPC: `get_pending_reservations_v4`
- `@/utils/timezoneUtils`

### Riesgos
- 2320 líneas → CRÍTICO: necesita ser dividido
- Métodos privados con prefijo `_` pero no realmente privados
- Lógica de segregación duplicada en cada método
- Loteo manual (BATCH_SIZE = 50) para evitar URLs largas

---

## adminService (`src/services/adminService.ts`)

### Funciones

| Grupo | Funciones | EF | Tablas |
|-------|----------|-----|--------|
| Roles | `getRoles`, `createRole`, `updateRole`, `deleteRole` | — | roles |
| Permisos | `getPermissions`, `createPermission`, `updatePermission`, `deletePermission` | — | permissions |
| Matriz | `getRolePermissions`, `addPermissionToRole`, `removePermissionFromRole`, `bulkUpdateRolePermissions` | — | role_permissions, admin_audit_log |
| Usuarios | `getOrgUsers`, `createOrgUser`, `updateOrgUser`, `removeOrgUser` | `admin-users` | — |

### Auditoría
- `addPermissionToRole` → INSERT `admin_audit_log` (event_type: 'permission_added')
- `removePermissionFromRole` → INSERT `admin_audit_log` (event_type: 'permission_removed')
- `bulkUpdateRolePermissions` → INSERT `admin_audit_log` (event_type: 'bulk_permissions_update')

---

## chatService (`src/services/chatService.ts`)

### Funciones

| Función | EF/Tabla | JWT |
|---------|----------|-----|
| `fetchSessions(orgId, userId)` | chat_sessions | — (RLS) |
| `createSession(orgId, userId, title?)` | chat_sessions | — (RLS) |
| `updateSessionTitle(sessionId, title)` | chat_sessions | — (RLS) |
| `archiveSession(sessionId)` | chat_sessions | — (RLS) |
| `fetchMessages(sessionId)` | chat_messages | — (RLS) |
| `askChat(payload)` | EF `ask-sro-chat` | ✅ Bearer token |
| `processDocument(documentId)` | EF `process-knowledge-document` | ✅ Bearer token |
| `reindexDocument(documentId)` | EF `reindex-knowledge-document` | ✅ Bearer token |
| `fetchAuditLogs(orgId, options?)` | chat_audit_logs | — (RLS) |

### Nota importante
- `askChat`, `processDocument`, `reindexDocument` usan `fetch()` directo (no `supabase.functions.invoke()`) para enviar el JWT manualmente en el header `Authorization: Bearer ${token}`

---

## providersService (`src/services/providersService.ts`)

### Funciones Principales

| Función | Paginación | Notas |
|---------|-----------|-------|
| `searchProviders(orgId, warehouseId, searchTerm, limit=25)` | — | Server-side ilike |
| `getAll(orgId)` | Bloques de 1000 | Barrido completo |
| `getActive(orgId)` | Bloques de 1000 | Solo activos |
| `getAllPaginated(orgId, page, pageSize, searchTerm?, clientId?)` | Server-side | Con count total |
| `getActivePaginated(orgId, page, pageSize, searchTerm?, clientId?)` | Server-side | Con count total |
| `getByWarehouse(orgId, warehouseId, activeOnly?)` | Bloques de 1000 | JOIN provider_warehouses |
| `getByWarehousePaginated(orgId, warehouseId, page, pageSize, ...)` | Server-side | Con count total |
| `createProvider(orgId, name, ...)` | — | upsert con onConflict |
| `updateProvider(id, updates)` | — | — |
| `deleteProvider(id)` | — | Soft delete (active=false) |
| `getProviderWarehouses(orgId, providerId)` | — | — |
| `setProviderWarehouses(orgId, providerId, warehouseIds)` | — | Reemplaza |
| `getProviderAssignments(orgId, providerIds)` | Paginado | Sin .in() para evitar 414 |
| `getProviderAssignmentsOptimized(orgId, providers)` | Quirúrgico | Solo providers visibles |
| `getByWarehouseWithClientContext(orgId, warehouseId)` | — | Enriquecido |
| `resolveClientBySource(source, orgMap)` | — | Exportado |
| `syncProviders(orgId, source, clientId, providers)` | EF `sync-providers` | — |

### Caché
- `origenCache`: Map<string, {clientId, name}>, TTL 60s

---

## clientsService (`src/services/clientsService.ts`)

### Funciones
- `listClients(orgId, search?)` → `Client[]`
- `listClientsByWarehouse(orgId, warehouseId, search?)` → `Client[]`
- `getClient(orgId, clientId)` → `Client`
- `createClient(orgId, payload, warehouseId?)` → `Client`
- `updateClient(orgId, clientId, payload)` → `Client`
- `disableClient(orgId, clientId)` → void
- `getClientRules(orgId, clientId)` → `ClientRules` (crea defaults si no existe)
- `updateClientRules(orgId, clientId, patch)` → `ClientRules`
- `listDocks(orgId)` → `Dock[]`
- `getClientDocks(orgId, clientId)` → `string[]`
- `setClientDocks(orgId, clientId, dockIds)` → void (diff: add/remove)
- `getClientProviders(orgId, clientId)` → `{ provider_id, is_default }[]` (paginado 1000)
- `setClientProviders(orgId, clientId, providers)` → void (diff: add/remove/update, invalida cache)

---

## clientBlockedStatusesService (`src/services/clientBlockedStatusesService.ts`)

### Funciones
- `getConfig(orgId, clientId)` → `ClientBlockedStatusConfig`
- `getBlockedStatusIds(orgId, clientId)` → `string[]` (compatibilidad)
- `setConfig(orgId, clientId, config)` → void (upsert)
- `setBlockedStatusIds(orgId, clientId, statusIds)` → void (compatibilidad)
- `isBlockedForUser(orgId, clientId, statusId, userId, userRoleId, isPrivileged)` → `boolean` (async)
- `isBlockedForUserSync(config, statusId, userId, userRoleId, isPrivileged)` → `boolean` (sync, para drag)
- `getClientIdForReservation(orgId, reservationId)` → `string | null`
- `isReservationBlocked(orgId, reservationId, statusId)` → `boolean` (legacy)
- `isBlockedByClientId(orgId, clientId, statusId)` → `boolean` (legacy)

---

## correspondenceService (`src/services/correspondenceService.ts`)

### Funciones
- `getRules(orgId, warehouseId?)` → `CorrespondenceRule[]` (enriquecido)
- `createRule(orgId, ruleData)` → `CorrespondenceRule`
- `updateRule(ruleId, ruleData)` → `CorrespondenceRule`
- `deleteRule(ruleId)` → void
- `toggleRuleStatus(ruleId, isActive)` → void
- `getLogs(orgId, warehouseId?)` → `CorrespondenceLog[]` (enriquecido)
- `retryFailedEmail(logId)` → void (fetch directo a smtp-send)
- `retryQueuedEmail(logId)` → void (fetch directo)
- `retryAllQueuedEmails(orgId, warehouseId?)` → `{ attempted, succeeded, failed }` (bulk)
- `retryAllFailedEmails(orgId, warehouseId?)` → `{ attempted, succeeded, failed }` (bulk)

### Helpers internos
- `normalizeRulePayloadForDb()` → sanitiza UUIDs, emails, arrays
- `asUuid()`, `asUuidArray()`, `asTextArray()`, `asEmailArray()`, `asRecipientsRolesTextArray()`

---

## Otros Servicios (Resumen)

| Servicio | Archivo | Funciones Clave |
|----------|---------|----------------|
| `emailTriggerService` | `emailTriggerService.ts` | `onReservationCreated()`, `onReservationStatusChanged()` |
| `warehousesService` | `warehousesService.ts` | CRUD warehouses, `getWarehouseClients()`, `setWarehouseClients()`, invalida scope |
| `knowledgeService` | `knowledgeService.ts` | CRUD documentos, upload, download, roles disponibles |
| `userAccessService` | `userAccessService.ts` | `get()`, `setCountries()`, `setWarehouses()` → EF `admin-user-access` |
| `dashboardService` | `dashboardService.ts` | `getStats(orgId, warehouseId, period, allowedDockIds?, customRange?)` |
| `activityLogService` | `activityLogService.ts` | `getActivityLogs()`, `writeLog()` |
| `dockAllocationService` | `dockAllocationService.ts` | `getDockAllocationRule()`, `getEnabledDockIds()`, `getEnabledDockIdsForSlot()` |
| `operationalStatusService` | `operationalStatusService.ts` | CRUD estados, `isStatusInUse()` |
| `cargoTypesService` | `cargoTypesService.ts` | CRUD tipos de carga, asignación a warehouses |
| `collaboratorsService` | `collaboratorsService.ts` | CRUD colaboradores, `getWorkTypes()` |
| `manpowerControlService` | `manpowerControlService.ts` | `getControlData()`, `getWorkTypesByWarehouse()` |
| `clientPickupRulesService` | `clientPickupRulesService.ts` | CRUD reglas Cliente Retira, `triggerBlockGeneration()` |
| `sameDayCutoffService` | `sameDayCutoffService.ts` | Gestión de cutoff del mismo día |
| `clusterService` | `clusterService.ts` | Clusters de proveedores |
| `timeProfilesService` | `timeProfilesService.ts` | Perfiles de tiempo por proveedor |
| `countriesService` | `countriesService.ts` | CRUD países |
| `orgSettingsService` | `orgSettingsService.ts` | Configuración de organización |
| `origenProveedoresService` | `origenProveedoresService.ts` | Mapeo source_code → cliente |
| `effectiveProvidersService` | `effectiveProvidersService.ts` | Proveedores efectivos |
| `userClientsService` | `userClientsService.ts` | Asignación usuario-cliente |
| `userProvidersService` | `userProvidersService.ts` | Asignación usuario-proveedor |
| `providerBulkImportService` | `providerBulkImportService.ts` | Importación masiva |