# DATABASE_RELATIONSHIP.md — Suite OLO / App Hub Manager

> **Versión**: Build 1198 | **Fecha**: 2026-06-30  
> **Fuente**: Schema real de Supabase (execute_sql confirmado) + código fuente  
> **Propósito**: Modelo de datos completo para mantenimiento, migraciones y auditoría.

---

## 1. Diagrama Entidad-Relación (textual)

```
organizations (1)
  │
  ├── countries (N)
  │     │
  │     └── warehouses (N) ─────────────────────────────────────────────────┐
  │           │                                                             │
  │           ├── docks (N) ───────────────────────────────────────────┐    │
  │           │     │                                                   │    │
  │           │     ├── reservations (N) ──────────────────┐            │    │
  │           │     │     │                                 │            │    │
  │           │     │     ├── reservation_files (N)         │            │    │
  │           │     │     ├── reservation_consolidated_     │            │    │
  │           │     │     │   providers (N)                 │            │    │
  │           │     │     ├── reservation_activity_log (N)  │            │    │
  │           │     │     ├── casetilla_ingresos (N)        │            │    │
  │           │     │     └── casetilla_salidas (N)         │            │    │
  │           │     │                                        │            │    │
  │           │     ├── dock_time_blocks (N)                 │            │    │
  │           │     ├── client_docks (N) ← clients          │            │    │
  │           │     └── dock_categories (N)                  │            │    │
  │           │                                              │            │    │
  │           ├── client_pickup_rules (N) ──────────────────┤            │    │
  │           ├── correspondence_rules (N)                   │            │    │
  │           ├── warehouse_clients (N) ← clients            │            │    │
  │           └── collaborator_warehouses (N)                │            │    │
  │                                                          │            │    │
  ├── clients (N) ──────────────────────────────────────────┘            │    │
  │     │                                                                 │    │
  │     ├── client_rules (1)                                              │    │
  │     ├── client_providers (N)                                          │    │
  │     ├── client_same_day_bypass_users (N)                              │    │
  │     └── client_pickup_rules (N)                                       │    │
  │                                                                       │    │
  ├── providers (N) ──────────────────────────────────────────────────────┘    │
  │     │                                                                      │
  │     ├── provider_cargo_time_profiles (N)                                   │
  │     ├── provider_clusters (N)                                              │
  │     ├── provider_cluster_items (N)                                         │
  │     └── provider_warehouses (N)                                            │
  │                                                                             │
  ├── cargo_types (N) ─────────────────────────────────────────────────────────┘
  │     │
  │     └── cargo_type_warehouses (N)
  │
  ├── reservation_statuses (N) ────────────────────────────────────────────────┐
  │                                                                             │
  ├── dock_statuses (N)                                                         │
  ├── dock_categories (N)                                                       │
  ├── profiles (N) ← auth.users                                                 │
  │     │                                                                       │
  │     ├── user_org_roles (N) ← roles                                         │
  │     ├── user_warehouse_access (N) ← warehouses                             │
  │     ├── user_country_access (N) ← countries                                │
  │     ├── user_clients (N)                                                   │
  │     ├── user_providers (N)                                                 │
  │     ├── user_provider_clusters (N)                                         │
  │     └── gmail_accounts (1)                                                 │
  │                                                                             │
  ├── roles (N) ────────────────────────────────────────────────────────────────┤
  │     │                                                                       │
  │     ├── role_permissions (N) ← permissions                                 │
  │     └── user_org_roles (N)                                                  │
  │                                                                             │
  ├── permissions (N)                                                           │
  │                                                                             │
  ├── correspondence_rules (N) ─────────────────────────────────────────────────┤
  ├── correspondence_outbox (N)                                                 │
  ├── correspondence_logs (N)                                                   │
  │                                                                             │
  ├── chat_sessions (N) ← profiles                                             │
  │     │                                                                       │
  │     └── chat_messages (N)                                                   │
  │                                                                             │
  ├── knowledge_documents (N) ──────────────────────────────────────────────────┤
  │     │                                                                       │
  │     ├── knowledge_document_roles (N) ← roles                               │
  │     ├── knowledge_document_permissions (N) ← permissions                   │
  │     ├── knowledge_document_tags (N)                                        │
  │     └── knowledge_document_versions (N)                                    │
  │                                                                             │
  ├── chat_prompt_configs (N)                                                   │
  ├── chat_audit_logs (N)                                                       │
  ├── activity_log (N)                                                          │
  ├── reservation_activity_log (N)                                              │
  ├── admin_audit_log (N)                                                       │
  │                                                                             │
  ├── collaborators (N)                                                         │
  │     └── collaborator_warehouses (N)                                         │
  │                                                                             │
  ├── work_types (N)                                                            │
  └── org_settings (1)                                                          │
```

---

## 2. Tablas por dominio

### 2.1 ORGANIZACIÓN

| Tabla | Propósito | PK | FK | RLS | Usada por |
|-------|-----------|----|----|-----|-----------|
| `organizations` | Multi-tenant root | `id` UUID | — | Sí (org_id) | AuthContext, todos los servicios |
| `org_settings` | Configuración por org | `id` UUID | `org_id` → organizations | Sí | orgSettingsService |
| `countries` | Países | `id` UUID | `org_id` → organizations | Sí | countriesService, userAccessService |
| `warehouses` | Almacenes | `id` UUID | `org_id` → organizations, `country_id` → countries | Sí | calendarService, casetillaService, warehousesService |
| `warehouse_clients` | Relación warehouse-cliente | composite | `org_id`, `warehouse_id`, `client_id` | Sí | useUserScope, casetillaService |

### 2.2 ANDENES (DOCKS)

| Tabla | Propósito | PK | FK | RLS | Usada por |
|-------|-----------|----|----|-----|-----------|
| `docks` | Andenes físicos | `id` UUID | `org_id`, `warehouse_id`, `category_id`, `status_id` | Sí | calendarService, casetillaService, andenes |
| `dock_categories` | Categorías de andén | `id` UUID | `org_id` | Sí | calendarService |
| `dock_statuses` | Estados de andén | `id` UUID | `org_id` | Sí | calendarService |
| `dock_time_blocks` | Bloqueos de horario | `id` UUID | `org_id`, `dock_id` | Sí | calendarService, generate-client-pickup-blocks |

### 2.3 RESERVAS

| Tabla | Propósito | PK | FK | RLS | Usada por |
|-------|-----------|----|----|-----|-----------|
| `reservations` | Reservas de andén **(tabla crítica #1)** | `id` UUID | `org_id`, `dock_id`, `status_id`, `created_by`, `client_id` | Sí + exclusion constraint | calendarService, casetillaService, api-v1-*, create-reservation EF, correspondence-*, auto-mark-no-show |
| `reservation_statuses` | Estados de reserva configurables | `id` UUID | `org_id` | Sí | calendarService, casetillaService |
| `reservation_files` | Archivos adjuntos | `id` UUID | `org_id`, `reservation_id`, `uploaded_by` | Sí | calendarService |
| `reservation_consolidated_providers` | Proveedores en reserva consolidada | `id` UUID | `org_id`, `reservation_id`, `provider_id` | Sí | calendarService |
| `reservation_activity_log` | Auditoría de cambios en reservas | `id` UUID | `org_id`, `reservation_id`, `actor_user_id` | Sí | calendarService |

### 2.4 CASETILLA

| Tabla | Propósito | PK | FK | RLS | Usada por |
|-------|-----------|----|----|-----|-----------|
| `casetilla_ingresos` | Registro de entrada de camiones | `id` UUID | `org_id`, `reservation_id`, `created_by` | Sí | casetillaService, correspondence-process-event, api-v1-casetilla-ingresos |
| `casetilla_salidas` | Registro de salida de camiones | `id` UUID | `org_id`, `reservation_id`, `created_by` | Sí | casetillaService, correspondence-process-event, api-v1-casetilla-salidas |

### 2.5 USUARIOS Y PERMISOS

| Tabla | Propósito | PK | FK | RLS | Usada por |
|-------|-----------|----|----|-----|-----------|
| `profiles` | Perfiles de usuario (extiende auth.users) | `id` UUID (=auth.users.id) | — | Sí | AuthContext, adminService |
| `roles` | Roles del sistema | `id` UUID | — | Sí | adminService, AuthContext |
| `permissions` | Permisos granulares | `id` UUID | — | Sí | adminService, AuthContext |
| `role_permissions` | Matriz rol-permiso | `id` UUID | `role_id`, `permission_id` | Sí | adminService, AuthContext.loadPermissions |
| `user_org_roles` | Asignación usuario→org→rol **(tabla crítica #2)** | `id` UUID | `user_id`, `org_id`, `role_id` | Sí (PIVOTAL) | AuthContext, admin-users EF, ask-sro-chat EF |

### 2.6 ACCESOS Y SEGREGACIÓN

| Tabla | Propósito | PK | FK | RLS | Usada por |
|-------|-----------|----|----|-----|-----------|
| `user_warehouse_access` | Acceso a warehouses **(tabla crítica #3)** | composite | `user_id`, `org_id`, `warehouse_id` | Sí | useUserScope, admin-user-access EF, casetillaService |
| `user_country_access` | Acceso por país | composite | `user_id`, `org_id`, `country_id` | Sí | useUserScope, admin-user-access EF |
| `user_clients` | Acceso a clientes | composite | `user_id`, `org_id`, `client_id` | Sí | useUserScope, api-v1-reservations-get |
| `user_providers` | Acceso a proveedores | composite | `user_id`, `org_id`, `provider_id` | Sí | useUserScope, api-v1-reservations-get |
| `user_provider_clusters` | Acceso a clusters de proveedores | composite | `user_id`, `org_id`, `cluster_id` | Sí | useUserScope |

### 2.7 CLIENTES

| Tabla | Propósito | PK | FK | RLS | Usada por |
|-------|-----------|----|----|-----|-----------|
| `clients` | Clientes del sistema | `id` UUID | `org_id` | Sí | clientsService, useUserScope, casetillaService |
| `client_docks` | Asignación cliente→andén | composite | `org_id`, `client_id`, `dock_id` | Sí | calendarService (segregación), casetillaService |
| `client_providers` | Asignación cliente→proveedor | composite | `org_id`, `client_id`, `provider_id` | Sí | clientBlockedStatusesService |
| `client_rules` | Reglas por cliente (cutoff, bloqueo) | `id` UUID | `org_id`, `client_id` | Sí | calendarService (create-reservation EF), clientBlockedStatusesService |
| `client_pickup_rules` | Reglas Cliente Retira | `id` UUID | `org_id`, `client_id`, `dock_id` | Sí | clientPickupRulesService, generate-client-pickup-blocks EF |
| `client_same_day_bypass_users` | Usuarios que pueden saltarse cutoff | composite | `org_id`, `client_id`, `user_id` | Sí | create-reservation EF |

### 2.8 PROVEEDORES

| Tabla | Propósito | PK | FK | RLS | Usada por |
|-------|-----------|----|----|-----|-----------|
| `providers` | Proveedores | `id` UUID | `org_id` | Sí | providersService, calendarService, casetillaService |
| `provider_cargo_time_profiles` | Perfiles de tiempo por tipo de carga | `id` UUID | `org_id`, `provider_id`, `cargo_type_id` | Sí | timeProfilesService |
| `provider_clusters` | Agrupaciones de proveedores | `id` UUID | `org_id` | Sí | clusterService |
| `provider_cluster_items` | Items dentro de un cluster | composite | `org_id`, `cluster_id`, `provider_id` | Sí | clusterService |
| `provider_warehouses` | Proveedores por warehouse | composite | `org_id`, `provider_id`, `warehouse_id` | Sí | useUserScope (segregación) |
| `origen_proveedores` | Orígenes de proveedores | `id` UUID | `org_id` | Sí | origenProveedoresService |
| `effective_providers` | Proveedores efectivos | - | - | Sí | effectiveProvidersService |

### 2.9 CORRESPONDENCIA

| Tabla | Propósito | PK | FK | RLS | Usada por |
|-------|-----------|----|----|-----|-----------|
| `gmail_accounts` | Cuentas Gmail conectadas | `id` UUID | `org_id`, `user_id` | Sí | gmail-callback EF, correspondenceService |
| `correspondence_rules` | Reglas de envío de correo | `id` UUID | `org_id`, `warehouse_id`, `status_from_id`, `status_to_id` | Sí | correspondence-process-event EF |
| `correspondence_outbox` | Bandeja de salida | `id` UUID | `org_id`, `rule_id`, `reservation_id`, `warehouse_id` | Sí | correspondence-process-event, smtp-send |
| `correspondence_logs` | Logs de envío | `id` UUID | `org_id` | Sí | correspondenceService |

### 2.10 CHAT Y CONOCIMIENTO

| Tabla | Propósito | PK | FK | RLS | Usada por |
|-------|-----------|----|----|-----|-----------|
| `chat_sessions` | Sesiones de chat | `id` UUID | `org_id`, `user_id` | Sí | chatService, ask-sro-chat EF |
| `chat_messages` | Mensajes del chat | `id` UUID | `session_id`, `org_id`, `user_id` | Sí | chatService, ask-sro-chat EF |
| `chat_audit_logs` | Auditoría de chat | `id` UUID | `org_id`, `user_id` | Sí | chatService, useChatAudit |
| `chat_prompt_configs` | Configuración de system prompt por org | `id` UUID | `org_id` | Sí | ask-sro-chat EF |
| `knowledge_documents` | Documentos de conocimiento | `id` UUID | `org_id`, `uploaded_by` | Sí | knowledgeService, process-knowledge-document EF, ask-sro-chat EF |
| `knowledge_document_roles` | Roles con acceso al documento | composite | `document_id`, `role_id` | Sí | ask-sro-chat EF |
| `knowledge_document_permissions` | Permisos con acceso al documento | composite | `document_id`, `permission_key` | Sí | ask-sro-chat EF |
| `knowledge_document_tags` | Tags de documentos | composite | `document_id`, `tag` | Sí | knowledgeService |
| `knowledge_document_versions` | Versiones de documentos | `id` UUID | `document_id` | Sí | knowledgeService |

### 2.11 OTROS

| Tabla | Propósito | PK | FK | RLS | Usada por |
|-------|-----------|----|----|-----|-----------|
| `cargo_types` | Tipos de carga | `id` UUID | `org_id` | Sí | cargoTypesService |
| `cargo_type_warehouses` | Tipos de carga por warehouse | composite | `org_id`, `cargo_type_id`, `warehouse_id` | Sí | cargoTypesService |
| `collaborators` | Colaboradores / personal | `id` UUID | `org_id` | Sí | collaboratorsService, manpower |
| `collaborator_warehouses` | Colaboradores por warehouse | composite | `org_id`, `collaborator_id`, `warehouse_id` | Sí | collaboratorsService |
| `work_types` | Tipos de trabajo | `id` UUID | `org_id` | Sí | manpower |
| `activity_log` | Auditoría general | `id` UUID | `org_id`, `actor_user_id` | Sí | calendarService, varios servicios |
| `admin_audit_log` | Auditoría de admin | `id` UUID | `org_id`, `changed_by` | Sí | adminService |

---

## 3. Tablas más críticas del sistema

| # | Tabla | Por qué es crítica |
|---|-------|-------------------|
| 1 | `reservations` | Core del negocio. Si se corrompe, toda la operación logística falla. |
| 2 | `user_org_roles` | Determina acceso a TODO. Si un usuario pierde su fila, pierde acceso total. |
| 3 | `user_warehouse_access` | Segregación de datos. Si se configura mal, usuarios ven warehouses incorrectos. |
| 4 | `role_permissions` | Matriz de permisos. Si se borra, nadie tiene permisos. |
| 5 | `docks` | Sin docks no hay calendario, no hay reservas, no hay casetilla. |

---

## 4. Tablas de auditoría

| Tabla | Qué audita | Quién escribe |
|-------|-----------|---------------|
| `activity_log` | Cambios en reservas, QR, bloques | calendarService, auto-mark-no-show EF |
| `reservation_activity_log` | Cambios específicos de reservas | calendarService |
| `admin_audit_log` | Cambios en roles, permisos, usuarios | adminService |
| `chat_audit_logs` | Interacciones del chat | ask-sro-chat EF |
| `correspondence_logs` | Envíos de correo | correspondenceService |

---

## 5. Tablas transaccionales

| Tabla | Tipo de operación | Volatilidad |
|-------|------------------|-------------|
| `reservations` | CRUD frecuente | Alta (múltiples creates/updates por minuto en horas pico) |
| `casetilla_ingresos` | Insert-only (append) | Alta |
| `casetilla_salidas` | Insert-only (append) | Alta |
| `dock_time_blocks` | Insert/delete masivo diario | Alta (regeneración de bloques Cliente Retira) |
| `chat_messages` | Append-only | Media |
| `correspondence_outbox` | Insert + update status | Media |

---

## 6. Tablas maestras (lookup)

| Tabla | Frecuencia de cambio |
|-------|---------------------|
| `reservation_statuses` | Baja (configuración inicial) |
| `dock_statuses` | Baja |
| `dock_categories` | Baja |
| `cargo_types` | Baja |
| `work_types` | Baja |
| `countries` | Muy baja |
| `roles` | Baja (se crean al configurar org) |
| `permissions` | Baja (se crean al configurar org) |

---

## 7. Tablas de configuración

| Tabla | Qué configura |
|-------|--------------|
| `org_settings` | Timezone default, preferencias de org |
| `client_rules` | Cutoff times, dock allocation mode, reglas de bloqueo |
| `client_pickup_rules` | Reglas Cliente Retira (horarios, duración) |
| `correspondence_rules` | Reglas de email automation |
| `chat_prompt_configs` | System prompt del asistente IA |

---

## 8. Constraints y Triggers Notables

### 8.1 Exclusion Constraint en `reservations`

```sql
-- Evita overlap de reservas en el mismo dock
EXCLUDE USING gist (
  dock_id WITH =,
  tstzrange(start_datetime, end_datetime) WITH &&
) WHERE (is_cancelled = false)
```

### 8.2 Unique constraint en `client_pickup_rules`

```sql
-- Solo una regla activa por cliente y andén
UNIQUE (org_id, client_id, dock_id, is_active) WHERE is_active = true
```

### 8.3 Índices críticos

| Tabla | Índice | Propósito |
|-------|--------|-----------|
| `reservations` | `(org_id, dock_id, start_datetime)` | Queries del calendario |
| `reservations` | `(org_id, status_id)` | Filtrado por estado |
| `user_org_roles` | `(user_id, org_id)` UNIQUE | Auth lookup |
| `user_warehouse_access` | `(user_id, org_id)` | Scope resolution |
| `dock_time_blocks` | `(org_id, dock_id, start_datetime)` | Calendar blocks |

---

## 9. Campos que nunca deberían modificarse directamente

| Tabla | Campo | Razón |
|-------|-------|-------|
| `reservations` | `id` | PK, usado en QR, casetilla, emails |
| `reservations` | `created_by` | Auditoría, no debe cambiarse |
| `reservations` | `created_at` | Auditoría |
| `profiles` | `id` | FK de auth.users |
| `user_org_roles` | `user_id`, `org_id` | La combinación determina acceso |
| `activity_log` | cualquier campo | Solo inserts, nunca updates |
| `admin_audit_log` | cualquier campo | Solo inserts, nunca updates |