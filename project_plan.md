# Sistema SRO — Schedule, Receive & Operate

## 1. Descripción del Proyecto
Sistema de gestión de reservas de andenes para operaciones logísticas (bodegas, warehouses). Permite calendarizar recepciones y despachos, controlar acceso de usuarios por cliente/almacén, gestionar bloqueos de tiempo, casetilla de ingreso/salida de camiones, y reglas operativas.

## 2. Estructura de Páginas
- `/` — Home (marketing)
- `/login` — Login
- `/access-pending` — Espera de acceso
- `/dashboard` — Dashboard operativo
- `/calendario` — Calendario de reservas (CORE)
- `/andenes` — Gestión de andenes
- `/reservas` — Listado de reservas
- `/casetilla` — Control de ingreso/salida
- `/chat` — Chat interno
- `/conocimiento` — Base de conocimiento
- `/manpower` — Control de personal
- `/admin` — Panel de administración
- `/admin/almacenes` — Gestión de almacenes
- `/admin/catalogos` — Catálogos (clientes, proveedores, tipos de carga, perfiles horarios)
- `/admin/clientes` — Gestión de clientes
- `/admin/correspondencia` — Gestión de correspondencia
- `/admin/usuarios` — Gestión de usuarios
- `/admin/roles` — Gestión de roles
- `/admin/matriz-permisos` — Matriz de permisos
- `/perfil` — Perfil de usuario
- `/chat/auditoria` — Auditoría de chat

## 3. Características Principales
- [x] Autenticación y autorización con Supabase
- [x] Sistema de permisos granular (roles + matriz)
- [x] Calendario de reservas con drag & drop
- [x] Segregación de datos por cliente/almacén
- [x] Reglas de asignación de andenes (secuencial / intercalado)
- [x] Bloqueos de horario por andén
- [x] Casetilla de ingreso/salida con QR
- [x] Notificaciones por correo (Gmail/SMTP)
- [x] Chat con asistente IA
- [x] Base de conocimiento con documentos
- [x] Control de personal (manpower)
- [x] Cliente Retira — bloqueo automático de slots
- [x] Correspondencia automatizada
- [x] Estados operativos configurables
- [x] Zona de carga y preselección de reservas
- [x] Cutoff times para recepción

## 4. Modelo de Datos
### Tablas principales
- `profiles` — Perfiles de usuario
- `roles` / `role_permissions` / `permissions` — Sistema de permisos
- `user_org_roles` — Asignación de usuarios a orgs
- `user_warehouse_access` — Acceso a almacenes
- `user_country_access` — Acceso por país
- `user_clients` / `user_providers` — Acceso a clientes/proveedores
- `warehouses` — Almacenes
- `docks` — Andenes
- `dock_categories` / `dock_statuses` — Categorías y estados de andén
- `dock_time_blocks` — Bloqueos de horario
- `reservations` — Reservas
- `reservation_statuses` — Estados de reserva
- `clients` — Clientes
- `providers` — Proveedores
- `client_docks` — Asignación cliente-andén
- `client_rules` / `client_pickup_rules` — Reglas de cliente
- `client_same_day_bypass_users` — Bypass de cutoff
- `cargo_types` — Tipos de carga
- `provider_cargo_time_profiles` — Perfiles de tiempo
- `countries` — Países
- `casetilla_ingresos` / `casetilla_salidas` — Registro de casetilla
- `correspondence_rules` / `correspondence_outbox` / `correspondence_logs` — Correspondencia
- `gmail_accounts` — Cuentas Gmail conectadas
- `chat_sessions` / `chat_messages` — Chat
- `knowledge_documents` — Documentos de conocimiento
- `collaborators` / `collaborator_warehouses` — Colaboradores
- `manpower_control` — Control de personal
- `activity_log` / `reservation_activity_log` — Logs de actividad

## 5. Integraciones
- **Supabase**: Auth, Database, Storage, Edge Functions
- **Gmail API**: Envío de correos automáticos
- **SMTP**: Envío de correos de respaldo
- **OpenAI**: Asistente de chat

## 6. Fases de Desarrollo

### Fase 1: Fundamentos del Sistema
- [x] Setup del proyecto React + Tailwind
- [x] Autenticación con Supabase
- [x] Sistema de permisos básico
- [x] Layout principal (Navbar, Sidebar)

### Fase 2: Calendario y Reservas
- [x] Calendario de andenes
- [x] CRUD de reservas
- [x] Segregación por cliente/almacén
- [x] Drag & drop de reservas
- [x] Estados de reserva

### Fase 3: Administración
- [x] Gestión de usuarios y roles
- [x] Matriz de permisos
- [x] Gestión de almacenes y andenes
- [x] Catálogos (clientes, proveedores, tipos de carga)

### Fase 4: Operaciones Avanzadas
- [x] Casetilla de ingreso/salida
- [x] Correspondencia automatizada
- [x] Bloqueos de horario
- [x] Estados operativos

### Fase 5: Optimización de Rendimiento
- [x] Diagnóstico de tiempos de carga del calendario
- [x] Cache de useUserScope por userId+orgId (evita múltiples consultas)
- [x] Protección de in-flight requests en loadData (no duplica llamadas a Supabase)
- [x] Ready estable: una vez true, nunca vuelve a false (evita oscilaciones)
- [x] LastLoadKey: evita recargar cacheKey ya cargado recientemente
- [x] Realtime: respeta in-flight, no duplica recargas
- [x] Build limpio