# REPORTE 1: FUNCIONALIDAD COMPLETA DEL SISTEMA
## Suite OLO / App Hub Manager — Auditoría Técnica

**Fecha**: 2026-06-30
**Versión de build**: 1197
**Tipo de proyecto**: React 19 + TypeScript + TailwindCSS 3 + Supabase
**Rol**: Sistema de Gestión de Reservas de Andenes para Operaciones Logísticas

---

## 1. QUÉ HACE EL SISTEMA

SRO (Schedule, Receive & Operate) es un sistema de gestión logística que permite:
- Calendarizar recepciones y despachos en andenes (docks) de almacenes (warehouses)
- Controlar acceso de usuarios por organización, país, almacén, cliente y proveedor
- Gestionar bloqueos de horario por andén (manuales y automáticos vía reglas "Cliente Retira")
- Registrar ingreso/salida de camiones en casetilla (Punto de Control IN/OUT) con soporte QR
- Configurar reglas de correspondencia automática por cambio de estado de reserva
- Enviar correos vía SMTP (Gmail o cualquier servidor SMTP)
- Chat con asistente de IA (SRObot) basado en documentos de conocimiento subidos al sistema
- Gestionar usuarios, roles, matriz de permisos granular
- Control de personal operativo (manpower)
- Reglas de negocio: cutoff de mismo día, bloqueo por estados, bypass por rol/usuario

---

## 2. MÓDULOS Y FUNCIONALIDAD

### Tabla de Módulos

| Módulo | Ruta | Funcionalidad | Tablas principales | Servicios | Hooks clave | Edge Functions | Riesgos |
|--------|------|---------------|-------------------|-----------|-------------|----------------|---------|
| **Login** | `/login` | Auth email/password + Google OAuth | `profiles`, `user_org_roles` | - | `useAuth` | - | OAuth redirect mal configurado |
| **Access Pending** | `/access-pending` | Pantalla de espera cuando usuario sin rol asignado | `profiles` | - | `useAuth` | - | Bajo |
| **Home Redirect** | `/` | Redirige según rol (calendario o casetilla) | - | - | `useAuth` | - | Bajo |
| **Dashboard** | `/dashboard` | KPIs operativos, métricas | `reservations`, `casetilla_ingresos`, `casetilla_salidas` | `dashboardService` | `usePermissions` | - | Bajo |
| **Calendario** | `/calendario` | Vista scheduler de reservas, drag & drop, CRUD de reservas y bloques | `reservations`, `docks`, `dock_time_blocks`, `reservation_statuses`, `clients`, `providers`, `warehouses`, `client_rules`, `client_pickup_rules` | `calendarService`, `emailTriggerService`, `clientBlockedStatusesService` | `useUserScope`, `useBlockedStatuses`, `useReservationDraft`, `useActiveWarehouse` | `create-reservation`, `generate-client-pickup-blocks` | **ALTO** - Core del sistema, drag & drop sensible |
| **Reservas** | `/reservas` | Listado tabular de todas las reservas, filtros, estados | `reservations`, `reservation_statuses` | `calendarService` | `useUserScope` | - | Medio |
| **Andenes** | `/andenes` | Gestión visual de andenes, estados, categorías | `docks`, `dock_categories`, `dock_statuses` | `calendarService` | `useUserScope` | - | Medio |
| **Manpower** | `/manpower` | Control de personal operativo, colaboradores | `collaborators`, `collaborator_warehouses` | `collaboratorsService`, `manpowerControlService` | `usePermissions` | - | Bajo |
| **Casetilla IN/OUT** | `/casetilla` | Registro de ingreso/salida de camiones, QR scanner, reportes de duración | `casetilla_ingresos`, `casetilla_salidas`, `reservations`, `warehouses` | `casetillaService`, `emailTriggerService` | `useUserScope` | `auto-mark-no-show` | **ALTO** - Crítico para operaciones, usa RPC |
| **Admin Panel** | `/admin` | Submenú a todos los módulos admin | - | - | `usePermissions` | - | Bajo |
| **Admin Usuarios** | `/admin/usuarios` | CRUD de usuarios, asignación de roles, países, almacenes, scope | `profiles`, `user_org_roles`, `user_warehouse_access`, `user_country_access`, `user_clients`, `user_providers` | `adminService`, `userAccessService` | `usePermissions` | `admin-users`, `admin-user-access` | **ALTO** - Modifica accesos críticos |
| **Admin Roles** | `/admin/roles` | CRUD de roles | `roles` | `adminService` | `usePermissions` | - | Medio |
| **Admin Matriz Permisos** | `/admin/matriz-permisos` | Asignar/desasignar permisos a roles (matriz visual) | `permissions`, `role_permissions`, `roles` | `adminService` | `usePermissions` | - | **ALTO** - Impacta todo el RBAC |
| **Admin Catálogos** | `/admin/catalogos` | Gestión de proveedores, tipos de carga, perfiles horarios, orígenes, asignaciones | `providers`, `cargo_types`, `provider_cargo_time_profiles`, `origen_proveedores`, `client_providers`, `provider_clusters`, `user_providers` | `providersService`, `cargoTypesService`, `timeProfilesService`, `origenProveedoresService`, `clusterService` | `usePermissions` | `sync-providers`, `sync-providers-excel` | **ALTO** - Muchas tablas, sincronización |
| **Admin Almacenes** | `/admin/almacenes` | CRUD de almacenes, países, asignación de clientes | `warehouses`, `countries`, `warehouse_clients` | `warehousesService`, `countriesService` | `usePermissions` | - | **ALTO** - Invalida scope de todos los usuarios |
| **Admin Clientes** | `/admin/clientes` | CRUD de clientes, reglas, docks, proveedores, reglas "cliente retira" | `clients`, `client_rules`, `client_docks`, `client_providers`, `client_pickup_rules`, `client_same_day_bypass_users` | `clientsService`, `clientPickupRulesService`, `clientBlockedStatusesService`, `sameDayCutoffService` | `usePermissions`, `useClientPickupRulesContext` | `generate-client-pickup-blocks` | **ALTO** - Reglas de negocio complejas |
| **Admin Correspondencia** | `/admin/correspondencia` | Gestión de reglas de envío de correos, logs, reintentos, SMTP/Gmail | `correspondence_rules`, `correspondence_outbox`, `correspondence_logs`, `gmail_accounts` | `correspondenceService` | `usePermissions` | `smtp-send`, `correspondence-dispatch-event`, `correspondence-process-event`, `gmail-callback` | **ALTO** - Envío de correos, secrets sensibles |
| **Conocimiento** | `/conocimiento` | Gestión de documentos para el asistente IA (upload, procesar, indexar) | `knowledge_documents`, `knowledge_document_roles`, `knowledge_document_tags`, `knowledge_document_permissions`, `knowledge_document_versions` | `knowledgeService`, `chatService` | `useKnowledgeDocuments` | `process-knowledge-document`, `reindex-knowledge-document`, `setup-knowledge-storage` | **ALTO** - OpenAI API key requerida |
| **Chat** | `/chat` | Chat con asistente IA (SRObot) usando documentos de conocimiento | `chat_sessions`, `chat_messages` | `chatService` | `useChatSession` | `ask-sro-chat` | **ALTO** - OpenAI API key, Latencia |
| **Chat Auditoría** | `/chat/auditoria` | Log de uso del chat, trazabilidad | `chat_audit_logs` | `chatService` | `useChatAudit` | - | Bajo |
| **Perfil** | `/perfil` | Datos del usuario logueado | `profiles` | - | `useAuth` | - | Bajo |

---

## 3. SERVICIOS DEL SISTEMA

| Servicio | Funcionalidad | Usa Supabase directo | Usa Edge Function |
|----------|--------------|---------------------|-------------------|
| `calendarService` | CRUD reservas, docks, bloques, QR, archivos | Sí | `create-reservation` |
| `adminService` | CRUD roles, permisos, matriz, usuarios (vía EF) | Sí (roles/permisos) | `admin-users` |
| `userAccessService` | Gestión de accesos (países, warehouses) | No | `admin-user-access` |
| `casetillaService` | Ingreso/salida camiones, reportes | Sí (usa RPC `get_pending_reservations_v4`) | No |
| `chatService` | Sesiones, mensajes, auditoría, ask, process/reindex docs | Sí (sesiones/mensajes) | `ask-sro-chat`, `process-knowledge-document`, `reindex-knowledge-document` |
| `correspondenceService` | Reglas, logs, reintentos de correo | Sí | `smtp-send`, `correspondence-dispatch-event`, `correspondence-process-event` |
| `emailTriggerService` | Dispara eventos de correspondencia en creación/cambio de estado | No | `correspondence-process-event` |
| `clientsService` | CRUD clientes, reglas, docks, proveedores | Sí | - |
| `clientPickupRulesService` | Reglas "cliente retira" + generación de bloques | Sí | `generate-client-pickup-blocks` |
| `clientBlockedStatusesService` | Bloqueo por estados con bypass rol/usuario | Sí | - |
| `warehousesService` | CRUD almacenes, clientes por almacén | Sí | - |
| `providersService` | CRUD proveedores | Sí | `sync-providers`, `sync-providers-excel` |
| `collaboratorsService` | CRUD colaboradores | Sí | - |
| `manpowerControlService` | Control de personal | Sí | - |
| `knowledgeService` | Documentos de conocimiento, tags, roles, permisos | Sí | `process-knowledge-document`, `reindex-knowledge-document` |
| `sameDayCutoffService` | Reglas de cutoff mismo día | Sí | - |
| `operationalStatusService` | Estados operativos de docks | Sí | - |
| `activityLogService` | Logs de actividad | Sí | - |
| `countriesService` | CRUD países | Sí | - |
| `dockAllocationService` | Asignación de docks | Sí | - |
| `orgSettingsService` | Configuración de organización | Sí | - |
| `effectiveProvidersService` | Proveedores efectivos | Sí | - |
| `userClientsService` | Acceso de usuarios a clientes | Sí | - |
| `userProvidersService` | Acceso de usuarios a proveedores | Sí | - |
| `cargoTypesService` | CRUD tipos de carga | Sí | - |
| `timeProfilesService` | Perfiles de tiempo | Sí | - |
| `origenProveedoresService` | Orígenes de proveedores | Sí | - |
| `clusterService` | Clusters de proveedores | Sí | - |
| `providerBulkImportService` | Importación masiva | Sí | - |

---

## 4. HOOKS PRINCIPALES

| Hook | Fichero | Funcionalidad | Riesgos |
|------|---------|--------------|---------|
| `useAuth` | `src/contexts/AuthContext.tsx` | Gestión completa de sesión, perfil, permisos, Google OAuth | **ALTO** - Core auth |
| `usePermissions` | `src/hooks/usePermissions.ts` | Wrapper de canLocal, hasRole, carga de permisos | Bajo |
| `useUserScope` | `src/hooks/useUserScope.ts` | Segregación de datos: warehouses, clientes, países con caché de 5 min y pub/sub global | **ALTO** - Caché compleja |
| `useActiveWarehouse` | `src/contexts/ActiveWarehouseContext.tsx` | Selección de almacén activo, persistencia en localStorage, invalidación | **ALTO** - Afecta todas las queries |
| `useBlockedStatuses` | `src/hooks/useBlockedStatuses.ts` | Verificación de bloqueo por estado + bypass rol/usuario | Medio |
| `useReservationDraft` | `src/hooks/useReservationDraft.ts` | Borrador de formulario de reserva en localStorage (7 días TTL) | Bajo |
| `useChatSession` | `src/hooks/useChatSession.ts` | Gestión de sesiones de chat, mensajes, optimistic updates | Medio |
| `useChatAudit` | `src/hooks/useChatAudit.ts` | Logs de auditoría de chat con paginación | Bajo |
| `useKnowledgeDocuments` | `src/hooks/useKnowledgeDocuments.ts` | CRUD de documentos de conocimiento | Medio |
| `useDebouncedValue` | `src/hooks/useDebouncedValue.ts` | Debounce genérico | Bajo |
| `useSessionStorageState` | `src/hooks/useSessionStorageState.ts` | Estado React persistido en sessionStorage | Bajo |
| `useClientPickupRulesContext` | `src/contexts/ClientPickupRulesContext.tsx` | Propagación cross-route de cambios en reglas "cliente retira" | Bajo |
| `useReservationBlockedStatus` | `src/hooks/useBlockedStatuses.ts` | Hook especializado para ReservationModal | Medio |

---

## 5. EDGE FUNCTIONS

| Función | Slug | Propósito | Verifica JWT | Usa Service Role |
|---------|------|-----------|-------------|-----------------|
| `create-reservation` | `create-reservation` | Crear reserva con validación backend (overlap, same-day cutoff) | **Sí (manual)** | Sí |
| `admin-users` | `admin-users` | CRUD de usuarios (listar todos, crear, actualizar rol, remover de org) | **No** - Usa service role directo | Sí |
| `admin-user-access` | `admin-user-access` | Gestionar accesos (países, warehouses, aprobar/rechazar usuarios) | **Sí (manual vía supabase.auth.getUser)** | Sí |
| `ask-sro-chat` | `ask-sro-chat` | Chat con OpenAI usando vector store de documentos | **Sí (manual)** | Sí |
| `process-knowledge-document` | `process-knowledge-document` | Procesar documento (subir a OpenAI, vectorizar) | ? (no verificado) | Sí |
| `reindex-knowledge-document` | `reindex-knowledge-document` | Re-indexar documento en vector store | ? (no verificado) | Sí |
| `gmail-callback` | `gmail-callback` | Callback OAuth de Google para conectar Gmail | **No** - Es callback público | Sí |
| `gmail-connection-status` | `gmail-connection-status` | Verificar estado de conexión Gmail | ? | Sí |
| `smtp-send` | `smtp-send` | Enviar correo vía SMTP directo | **No verificado** - Recibe JWT en header pero no se ve validación explícita | Sí (implícito) |
| `correspondence-dispatch-event` | `correspondence-dispatch-event` | Despachar evento de correspondencia (buscar reglas activas) | **Sí (manual)** | Sí |
| `correspondence-process-event` | `correspondence-process-event` | Procesar evento: evaluar reglas, construir correos, encolar | ? | Sí |
| `correspondence-retry-email` | `correspondence-retry-email` | Reintentar envío de correo fallido | ? | Sí |
| `auto-mark-no-show` | `auto-mark-no-show` | Marcar reservas como No Show automáticamente (manual o cron) | **Sí (manual, y modo cron con secret interno)** | Sí |
| `generate-client-pickup-blocks` | `generate-client-pickup-blocks` | Generar bloques de horario para reglas "Cliente Retira" | **Opcional** - Si no hay JWT usa SYSTEM_USER | Sí |
| `generate-missing-qrs` | `generate-missing-qrs` | Generar QR faltantes | ? | Sí |
| `fix-casetilla-storage-rls` | `fix-casetilla-storage-rls` | Fix de migración RLS | ? | Sí |
| `fix-invoice-nullable` | `fix-invoice-nullable` | Fix de migración | ? | Sí |
| `fix-provider-unique-index` | `fix-provider-unique-index` | Fix de migración | ? | Sí |
| `setup-admin-permissions` | `setup-admin-permissions` | Setup inicial de permisos | ? | Sí |
| `setup-casetilla-storage` | `setup-casetilla-storage` | Setup de storage buckets | ? | Sí |
| `setup-knowledge-storage` | `setup-knowledge-storage` | Setup de storage buckets conocimiento | ? | Sí |
| `sync-providers` | `sync-providers` | Sincronizar proveedores desde API externa | ? | Sí |
| `sync-providers-excel` | `sync-providers-excel` | Sincronizar desde Excel | ? | Sí |

---

## 6. DATOS QUE CONSUME CADA PANTALLA (PRINCIPALES)

### Login (`/login`)
- **Lee**: `profiles`, `user_org_roles`, `roles`, `permissions`, `role_permissions`
- **Escribe**: Nada (solo auth.signIn)
- **Cache**: sessionStorage (token Supabase)

### Calendario (`/calendario`)
- **Lee**: `reservations`, `docks`, `dock_categories`, `dock_statuses`, `dock_time_blocks`, `reservation_statuses`, `warehouses`, `warehouse_clients`, `clients`, `client_rules`, `client_docks`, `client_pickup_rules`, `user_warehouse_access`, `user_country_access`, `user_clients`, `providers`, `profiles`
- **Escribe**: `reservations` (create, update, cancel, delete), `dock_time_blocks` (create, delete), `reservation_consolidated_providers`, `activity_log`
- **Edge Functions**: `create-reservation`, `generate-client-pickup-blocks`
- **Storage**: `reservation-qrs` (lectura/escritura QR), `reservation-files` (archivos adjuntos)

### Casetilla (`/casetilla`)
- **Lee**: `casetilla_ingresos`, `casetilla_salidas`, `reservations` (vía RPC `get_pending_reservations_v4`), `docks`, `warehouses`, `clients`, `providers`, `warehouse_clients`, `client_docks`, `reservation_statuses`
- **Escribe**: `casetilla_ingresos`, `casetilla_salidas`, `reservations` (update status), `activity_log`
- **Edge Functions**: `auto-mark-no-show`

### Admin Usuarios (`/admin/usuarios`)
- **Lee**: `profiles`, `user_org_roles`, `roles`, `user_warehouse_access`, `user_country_access`, `user_clients`, `user_providers`
- **Escribe**: `profiles`, `user_org_roles`, `user_warehouse_access`, `user_country_access`, `user_clients`, `user_providers`
- **Edge Functions**: `admin-users`, `admin-user-access`

### Correspondencia (`/admin/correspondencia`)
- **Lee**: `correspondence_rules`, `correspondence_outbox`, `correspondence_logs`, `reservation_statuses`, `profiles`, `roles`, `warehouses`
- **Escribe**: `correspondence_rules` (CRUD), `correspondence_outbox` (update status)
- **Edge Functions**: `smtp-send`, `correspondence-retry-email`

---

## 7. DEPENDENCIAS CRÍTICAS (package.json)

| Dependencia | Versión | Uso | Riesgo |
|-------------|---------|-----|--------|
| `react` | ^19.1.0 | Framework UI | Crítico |
| `@supabase/supabase-js` | 2.57.4 | Backend, Auth, DB | **CRÍTICO** |
| `react-router-dom` | ^7.6.3 | Ruteo SPA | Crítico |
| `@tanstack/react-query` | ^5.87.4 | Data fetching (si se usa) | Bajo |
| `date-fns` | ^4.1.0 | Manipulación de fechas | Medio |
| `date-fns-tz` | ^3.2.0 | Zonas horarias | **ALTO** |
| `html5-qrcode` | ^2.3.8 | Escaneo QR en casetilla | Medio |
| `qrcode` | 1.5.4 | Generación QR | Medio |
| `html2canvas` | ^1.4.1 | Captura canvas para ficha QR | Medio |
| `jspdf` | ^2.5.2 | PDF (ficha de cita) | Bajo |
| `i18next` + `react-i18next` | 25.4.1 / ^15.6.0 | Internacionalización | Bajo |
| `recharts` | 3.2.0 | Gráficos dashboard | Bajo |
| `sonner` | ^1.7.1 | Toasts | Bajo |
| `xlsx` | ^0.18.5 | Importación Excel | Medio |
| `firebase` | 12.0.0 | **¿En uso? No se ve en código** | **ALTO - Dependencia innecesaria** |
| `@stripe/react-stripe-js` | 4.0.2 | **¿En uso? No se ve en código** | **ALTO - Dependencia innecesaria** |

---

## 8. CONTEXTOS GLOBALES

| Contexto | Provider | Consumidores | Impacto |
|----------|----------|-------------|---------|
| `AuthContext` | `AuthProvider` en `App.tsx` | Toda la app | **CRÍTICO** |
| `ActiveWarehouseContext` | `ActiveWarehouseProvider` en `App.tsx` | Calendario, Casetilla, Reservas, Dashboard | **ALTO** |
| `ClientPickupRulesContext` | `ClientPickupRulesProvider` en `App.tsx` | Admin Clientes, Calendario | Medio |

---

## 9. BUCKETS DE STORAGE

| Bucket | Propósito | Visibilidad | Riesgo |
|--------|-----------|-------------|--------|
| `reservation-qrs` | QR de reservas y fichas de cita | Público (getPublicUrl) | Bajo - datos no sensibles |
| `reservation-files` | Archivos adjuntos a reservas | Público (getPublicUrl) o Signed URL | **ALTO** - Puede contener documentos sensibles |
| Knowledge (implícito) | Documentos de conocimiento | ? | **ALTO** - Documentos internos |
| Casetilla (implícito) | Fotos de ingreso/salida | ? | **ALTO** - Datos sensibles |

---

## 10. ESTADO GENERAL DEL SISTEMA

- **Páginas implementadas**: 20+ rutas
- **Servicios**: 28 servicios
- **Hooks personalizados**: 13
- **Edge Functions desplegadas**: 22
- **Tablas en Supabase**: ~60 tablas
- **Archivos de código**: ~200+ archivos en src/
- **Líneas de código totales**: ~50,000+ estimadas
- **Build**: Limpio (verificado en build 1197)