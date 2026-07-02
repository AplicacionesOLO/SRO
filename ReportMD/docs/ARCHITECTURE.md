# ARCHITECTURE.md — Suite OLO / App Hub Manager

> **Versión**: Build 1198 | **Fecha**: 2026-06-30  
> **Fuente**: Código fuente real (no supuestos)  
> **Propósito**: Documentación técnica oficial para mantenimiento, auditoría y migraciones.

---

## 1. Visión General

### 1.1 Qué hace el sistema

SRO (Schedule, Receive & Operate) es un sistema enterprise de gestión logística para operaciones de almacenes (warehouses). Permite:

- Calendarizar recepciones y despachos en andenes (docks)
- Control de acceso granular por warehouse, país, cliente, proveedor
- Registro de ingreso/salida de camiones (casetilla) con fotos
- Correspondencia automatizada por email (Gmail API / SMTP)
- Chat con asistente IA entrenado con documentos de conocimiento
- Gestión de personal operativo (manpower)
- Reglas operativas: Cliente Retira, same-day cutoff, No-Show automático
- API REST v1 para integraciones externas

### 1.2 Objetivo

Digitalizar y automatizar la operación logística de múltiples almacenes con segregación de datos multi-tenant, permitiendo que clientes, proveedores y operadores interactúen en una plataforma unificada con permisos granulares.

### 1.3 Usuarios

| Rol | Descripción |
|-----|-------------|
| `ADMIN` | Administrador global — acceso total a todos los warehouses sin restricción |
| `SUPERVISOR` | Acceso global a warehouses (igual que ADMIN en scope) |
| `Full Access` | Rol legacy con acceso global (string literal, no es un tipo UserRole pero se maneja en el scope) |
| `OPERADOR` | Usuario operativo — restringido por warehouse_access, country_access, etc. |
| `CASETILLA` | Rol de punto de control — acceso a módulo de casetilla con permisos específicos |

### 1.4 Modelo de operación

- **Multi-tenant por organización** (`org_id` en todas las tablas)
- **Segregación de datos**: cada usuario ve solo sus warehouses/clientes/proveedores asignados
- **Timezones**: cada warehouse tiene su propio timezone IANA (default `America/Costa_Rica`)
- **Offline-tolerant**: el frontend cachea datos con TTLs (2-5 min) y usa optimistic updates

---

## 2. Arquitectura General

### 2.1 Diagrama de alto nivel

```
┌─────────────────────────────────────────────────────────────┐
│                     BROWSER (React 19 SPA)                   │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌───────────┐  │
│  │  Auth    │  │ Calendar  │  │ Casetilla│  │  Admin    │  │
│  │  Context │  │  Scheduler│  │  IN/OUT  │  │  Panel    │  │
│  └────┬─────┘  └─────┬─────┘  └────┬─────┘  └─────┬─────┘  │
│       │              │              │              │         │
│  ┌────┴──────────────┴──────────────┴──────────────┴────┐   │
│  │              SERVICES LAYER (28 servicios)            │   │
│  └──────────────────────┬───────────────────────────────┘   │
│                         │ supabase-js (anon key)            │
└─────────────────────────┼───────────────────────────────────┘
                          │ HTTPS
┌─────────────────────────┼───────────────────────────────────┐
│                    SUPABASE PLATFORM                        │
│  ┌──────────────┐  ┌─────────────┐  ┌───────────────────┐  │
│  │  Auth (JWT)  │  │  Database   │  │  Storage (S3)     │  │
│  │  - Email/PW  │  │  PostgreSQL │  │  - reservation-qrs│  │
│  │  - Google OA │  │  + RLS      │  │  - reservation-   │  │
│  └──────────────┘  └──────┬──────┘  │    files          │  │
│                           │         │  - knowledge-      │  │
│  ┌───────────────────────┐│         │    documents       │  │
│  │  EDGE FUNCTIONS (22)  ││         └───────────────────┘  │
│  │  - create-reservation  ││                                │
│  │  - admin-users         ││   ┌──────────────────────┐    │
│  │  - ask-sro-chat        ││   │  EXTERNAL SERVICES   │    │
│  │  - smtp-send           ││   │  - OpenAI API        │    │
│  │  - correspondence-*    ││   │  - Gmail API / SMTP  │    │
│  │  - api-v1-*            ││   │  - Google OAuth      │    │
│  │  - auto-mark-no-show   ││   │  - pg_cron (cron)    │    │
│  └────────────────────────┘│   └──────────────────────┘    │
└─────────────────────────────┴───────────────────────────────┘
```

### 2.2 Componentes del stack

| Capa | Tecnología | Rol |
|------|-----------|-----|
| **Frontend** | React 19 + TypeScript 5.8 + TailwindCSS 3.4 + Vite 7 | SPA con lazy loading, code splitting |
| **State** | React Context (Auth, ActiveWarehouse, ClientPickupRules) | Estado global sin Redux |
| **Routing** | React Router DOM 7.6 | Client-side routing con guards |
| **Auth** | Supabase Auth (email/password + Google OAuth) | JWT + refresh tokens |
| **Database** | PostgreSQL 15 (via Supabase) | ~60 tablas con RLS |
| **Backend** | Supabase Edge Functions (Deno) | 22 funciones serverless |
| **Storage** | Supabase Storage (S3-compatible) | Archivos de reservas, QR, documentos |
| **AI** | OpenAI API (GPT-4o-mini, Vector Stores, Files) | Asistente documental |
| **Email** | Gmail API + SMTP (Deno raw sockets) | Correspondencia automatizada |
| **Scheduling** | pg_cron (PostgreSQL) | No-Show automático, generación de bloques |
| **Charts** | Recharts 3.2 | Reportes y métricas |

### 2.3 Arquitectura por capas

```
┌──────────────────────────────────────────────┐
│           PRESENTATION LAYER                  │
│  Pages (20+), Components (features + base)    │
│  Router (config, guards, lazy loading)        │
├──────────────────────────────────────────────┤
│           HOOKS LAYER (13 hooks)              │
│  useUserScope, usePermissions, useBlocked-    │
│  Statuses, useReservationDraft, useChat-      │
│  Session, useChatAudit, useKnowledgeDocuments │
├──────────────────────────────────────────────┤
│           CONTEXTS LAYER (4 contexts)          │
│  AuthContext, ActiveWarehouseContext,         │
│  ClientPickupRulesContext                      │
├──────────────────────────────────────────────┤
│           SERVICES LAYER (28 services)         │
│  calendarService, casetillaService,           │
│  adminService, chatService, emailTrigger,     │
│  clientBlockedStatuses, clientPickupRules,    │
│  correspondenceService, warehousesService...  │
├──────────────────────────────────────────────┤
│           EDGE FUNCTIONS (22 functions)        │
│  create-reservation, admin-users, ask-sro-    │
│  chat, smtp-send, correspondence-*, api-v1-*  │
├──────────────────────────────────────────────┤
│           DATABASE (PostgreSQL + RLS)          │
│  ~60 tablas, RLS policies, triggers, índices  │
├──────────────────────────────────────────────┤
│           STORAGE (3 buckets)                  │
│  reservation-qrs, reservation-files,          │
│  knowledge-documents                           │
├──────────────────────────────────────────────┤
│           EXTERNAL SERVICES                    │
│  OpenAI API, Gmail API, SMTP, Google OAuth    │
└──────────────────────────────────────────────┘
```

---

## 3. Flujos de Datos

### 3.1 Flujo general (lectura)

```
Usuario → Page Component → Hook (useUserScope / usePermissions)
  → Service → supabase.from('table').select() → PostgreSQL + RLS → Response
  → Hook state → Component render
```

### 3.2 Flujo general (escritura protegida)

```
Usuario → Page Component → Service
  → supabase.functions.invoke('function-name', { body })
  → Edge Function (validación JWT manual + service role)
  → PostgreSQL + RLS + Triggers
  → Response → Service → Component
```

### 3.3 Flujo: Login

```
Login Page → AuthContext.login(email, password)
  → supabase.auth.signInWithPassword()
  → Supabase Auth → JWT (access_token + refresh_token)
  → loadUserProfile(userId)
    → user_org_roles (RLS) → role_id, org_id
    → Si no hay user_org_roles → pendingAccess=true
    → loadPermissions(roleId)
      → role_permissions (RLS) → Set<string>
  → canLocal(permission) listo
  → ProtectedRoute verifica user !== null
  → RequirePermission verifica can(permission)
  → Página destino renderiza
```

### 3.4 Flujo: Crear Reserva

```
Calendar Page → ReservationModal → calendarService.createReservation()
  → supabase.functions.invoke('create-reservation', { body })
  → Edge Function:
    1. Validar JWT (supabase.auth.getUser(token))
    2. Validar user pertenece a org
    3. Resolver client_id desde client_docks si no viene
    4. Validar same-day cutoff (hora local del warehouse)
    5. Validar bypass users
    6. INSERT en reservations (RLS + exclusion constraint)
    7. SELECT resultado completo
  → Frontend:
    8. Generar QR en background (ensureReservationQR)
    9. Generar ficha de cita (ensureReservationQRCard)
    10. Disparar emailTrigger (correspondence-process-event)
    11. Invalidar cachés de docks
    12. Actualizar UI (optimistic remove del modal)
```

### 3.5 Flujo: Chat IA

```
Chat Page → ChatWindow → useChatSession.sendMessage()
  → chatService.askChat({ question, session_id })
  → fetch(POST /functions/v1/ask-sro-chat, { Authorization: Bearer token })
  → Edge Function:
    1. Validar JWT
    2. Cargar user_org_roles → orgId, roleId
    3. Cargar role_permissions → verificar chat.ask
    4. Determinar access_level (basic/extended/internal) por permisos
    5. Filtrar knowledge_documents por access_level y visibility_mode
    6. Si hay vector_store_id → OpenAI Responses API con file_search tool
    7. Si no hay vector_store → respuesta genérica sin documentos
    8. Guardar chat_messages (user + assistant)
    9. Actualizar chat_sessions.last_message_at
  → Frontend: actualizar UI con respuesta + suggested_questions
```

---

## 4. Dependencias

### 4.1 Mapa de dependencias críticas

```
AuthContext ← supabase client (lib/supabase.ts)
  ↓
usePermissions ← AuthContext
  ↓
useUserScope ← usePermissions + AuthContext + supabase
  ↓
ActiveWarehouseContext ← useUserScope + usePermissions
  ↓
calendarService.getDocks() ← ActiveWarehouseContext.effectiveWarehouseIds
calendarService.getReservations() ← ActiveWarehouseContext + useUserScope
casetillaService ← allowedWarehouseIds (vía scope)
  ↓
emailTriggerService ← calendarService (on create/update/status change)
  ↓
correspondence-process-event ← emailTriggerService
  ↓
smtp-send ← correspondence-process-event
```

### 4.2 Qué módulo rompe a otro

| Si falla... | Se rompe... |
|------------|-------------|
| `AuthContext` (no carga perfil) | Toda la app — acceso denegado |
| `useUserScope` (no carga warehouses) | Calendario vacío, casetilla vacía, admin sin warehouses |
| `ActiveWarehouseContext` (warehouse no inicializado) | Calendario no carga docks, UI muestra "Sin almacén seleccionado" |
| `calendarService.getDocks()` | Calendario sin andenes visibles |
| `create-reservation` EF no desplegada | No se pueden crear reservas |
| `admin-users` EF no desplegada | No se pueden gestionar usuarios |
| `smtp-send` EF no desplegada | Correos se encolan en outbox pero nunca se envían |
| `correspondence-process-event` no desplegada | Eventos de email no se procesan |
| Supabase offline | App entera no funciona (sin offline mode) |
| OpenAI API offline | Chat responde con error, no tumbar la app |

### 4.3 Módulos que pueden desacoplarse

- **Chat IA**: módulo independiente, no afecta operaciones core
- **Manpower**: módulo independiente con sus propias tablas
- **Conocimiento**: puede funcionar sin chat activo
- **Reportes de casetilla**: lectura pura, no afectan escrituras
- **API v1**: funciones independientes para integraciones externas

---

## 5. Arquitectura de Permisos

### 5.1 Dónde se valida cada permiso

| Capa | Qué valida | Cómo |
|------|-----------|------|
| **Frontend - Router** | Acceso a páginas | `ProtectedRoute` (auth) + `RequirePermission` (permisos) |
| **Frontend - UI** | Visibilidad de botones/menús | `canLocal(permission)` desde AuthContext |
| **Frontend - Services** | Ninguna validación adicional | Confía en permisos ya cargados del contexto |
| **Edge Functions** | Auth JWT + pertenencia a org + permisos específicos | Validación manual de token + queries a user_org_roles y role_permissions |
| **RLS (PostgreSQL)** | Acceso a filas por org_id y por políticas por rol | Definido en migraciones SQL |
| **Storage** | Acceso a buckets | Políticas RLS de Storage |

### 5.2 Stack de validación

```
1. ProtectedRoute → ¿Hay sesión? → No → redirect /login
2. RequirePermission → ¿Tiene el permiso? → No → redirect fallbackPath
3. canLocal() → ¿Puede ver este botón? → No → ocultar
4. Edge Function → ¿JWT válido? + ¿pertenece a org? + ¿tiene permiso? → No → 401/403
5. RLS → ¿Puede leer/escribir esta fila? → No → fila invisible/error
```

### 5.3 Roles hardcodeados (UserRole type)

```typescript
// src/contexts/AuthContext.tsx:6
type UserRole = 'ADMIN' | 'SUPERVISOR' | 'OPERADOR' | 'CASETILLA';
```

### 5.4 Roles con acceso global

```typescript
// src/hooks/useUserScope.ts:17
const GLOBAL_ACCESS_ROLES = ['ADMIN', 'SUPERVISOR', 'Full Access'];
```

---

## 6. Arquitectura de Autenticación

### 6.1 Flujo completo

```
┌──────────┐   ┌─────────────┐   ┌───────────┐   ┌──────────────┐
│  LOGIN   │   │ SUPABASE    │   │ PROFILES  │   │ PERMISSIONS  │
│  PAGE    │   │ AUTH        │   │ TABLE     │   │ (role_perm)  │
└────┬─────┘   └──────┬──────┘   └─────┬─────┘   └──────┬───────┘
     │                │                │                │
     │ email+password │                │                │
     │───────────────>│                │                │
     │                │                │                │
     │  JWT tokens    │                │                │
     │<───────────────│                │                │
     │                │                │                │
     │  loadUserProfile(userId)        │                │
     │────────────────────────────────>│                │
     │                │                │                │
     │  user_org_roles JOIN roles      │                │
     │<────────────────────────────────│                │
     │                │                │                │
     │  loadPermissions(roleId)        │                │
     │─────────────────────────────────────────────────>│
     │                │                │                │
     │  Set<string> permissions        │                │
     │<─────────────────────────────────────────────────│
     │                │                │                │
     │  canLocal() ready               │                │
```

### 6.2 Estados de sesión

| Estado | Descripción | UI |
|--------|-------------|-----|
| `loading=true` | Verificando sesión inicial | Loader spinner |
| `user=null, loading=false` | Sin sesión | Redirect /login |
| `user!=null, pendingAccess=true` | Sin user_org_roles | Redirect /access-pending |
| `user!=null, pendingAccess=false` | Sesión completa | App normal |
| `sessionExpired=true` | Token refresh falló | SessionExpiredModal overlay |
| `TOKEN_REFRESHED` con session=null | Refresh falló | clearCorruptedSession(true) |

### 6.3 Google OAuth

- `loginWithGoogle()` usa `supabase.auth.signInWithOAuth` con `access_type: 'offline'` y `prompt: 'consent'`
- Redirect URL: `window.location.origin + __BASE_PATH__`
- El callback de Google redirige a la raíz `/`
- `onAuthStateChange` detecta la nueva sesión y ejecuta `loadUserProfile`
- Si `user_org_roles` no existe para el usuario → `pendingAccess=true` → redirect `/access-pending`

### 6.4 Refresh y expiración

```typescript
// src/contexts/AuthContext.tsx
// Manejo de refresh tokens:
// 1. onAuthStateChange: TOKEN_REFRESHED sin session → clearCorruptedSession
// 2. getSession: Refresh Token Not Found → clearCorruptedSession  
// 3. unhandledrejection global → clearCorruptedSession
// 4. SIGNED_OUT → limpiar todo
```

### 6.5 Session Expired Modal

Aparece como overlay z-index 9999 cuando el token expira mientras el usuario navega. No redirige silenciosamente — muestra mensaje claro y botón "Volver a iniciar sesión".

---

## 7. Arquitectura de Storage

### 7.1 Buckets

| Bucket | Propósito | Visibilidad | Políticas |
|--------|-----------|-------------|-----------|
| `reservation-qrs` | QR codes y fichas de cita (PNG) | Público (getPublicUrl) | RLS: lectura pública, escritura autenticada |
| `reservation-files` | Documentos de reserva (CMR, facturas, etc.) | Configurable (signed URLs disponibles) | RLS: por org_id |
| `knowledge-documents` | PDFs para el asistente IA | Privado | RLS: por org_id + download para procesamiento |

### 7.2 Estructura de paths

```
reservation-qrs/
  {orgId}/reservations/{reservationId}/qr.png
  {orgId}/reservations/{reservationId}/card.png

reservation-files/
  {orgId}/reservations/{reservationId}/{category}/{timestamp}_{filename}

knowledge-documents/
  {orgId}/{documentId}/{filename}
```

### 7.3 Generación de QR

- `ensureReservationQR()`: genera QR PNG con `qrcode` library, sube a `reservation-qrs`, guarda `qr_image_url` en `reservations`
- `ensureReservationQRCard()`: genera ficha de cita completa (proveedor, hora, QR), sube a `reservation-qrs`, guarda `qr_card_image_url`
- `regenerateReservationQRAssets()`: regenera ambos assets con cache-buster `?t={timestamp}`

---

## 8. Arquitectura de IA

### 8.1 Componentes

| Componente | Tecnología | Ubicación |
|-----------|-----------|-----------|
| Documentos | PDFs en Supabase Storage | `knowledge-documents` bucket |
| Vector Store | OpenAI Vector Store | Un store por org |
| Embeddings | OpenAI (automático al subir a vector store) | API de OpenAI |
| Chat | GPT-4o-mini + file_search tool | Edge Function `ask-sro-chat` |
| Prompt | Configurable por org | `chat_prompt_configs` table |
| Auditoría | Logs de mensajes | `chat_messages` + `chat_audit_logs` |

### 8.2 Flujo de procesamiento de documentos

```
Usuario → Upload PDF → knowledgeService.uploadDocumentFile()
  → Supabase Storage (knowledge-documents bucket)
  → knowledgeService.createDocumentRecord() → status='pending'
  → knowledgeService.processDocument()
  → Edge Function process-knowledge-document:
    1. Validar JWT
    2. Verificar user_org_roles
    3. status → 'processing'
    4. Descargar PDF de Storage
    5. Subir a OpenAI Files API → openai_file_id
    6. Obtener/crear Vector Store para la org
    7. Agregar file al Vector Store → openai_vector_store_file_id
    8. status → 'active'
```

### 8.3 Control de acceso a documentos

Cada documento tiene:
- `access_level`: `basic` | `extended` | `internal`
- `visibility_mode`: `public` | `role_based` | `permission_based` | `mixed`
- `knowledge_document_roles`: roles con acceso
- `knowledge_document_permissions`: permisos específicos con acceso

El usuario solo ve documentos donde:
1. Su `access_level` >= `access_level` del documento
2. Si `visibility_mode === 'public'` → ve siempre
3. Si `visibility_mode === 'role_based'` → su role_id debe estar en knowledge_document_roles
4. Si `visibility_mode === 'permission_based'` → algún permiso de sus permisos debe estar en knowledge_document_permissions
5. Si `visibility_mode === 'mixed'` → cumple role_based O permission_based

---

## 9. Riesgos Arquitectónicos

### 9.1 Acoplamientos fuertes

| Acoplamiento | Riesgo |
|-------------|--------|
| `AuthContext` → toda la app | Si no carga perfil, nada funciona |
| `useUserScope` cache global (5 min) | Cambios de acceso tardan en propagarse |
| `calendarService` → `emailTriggerService` (llamada síncrona) | Si email trigger es lento, bloquea la UI de creación de reserva |
| `supabase client` singleton (`src/lib/supabase.ts`) | Sin forma de cambiar de proyecto en runtime |
| `ActiveWarehouseContext` depende de `useUserScope` | Si el scope no carga, no hay warehouse activo |

### 9.2 Single Points of Failure

| Componente | Si falla... |
|-----------|------------|
| Supabase Platform | App entera caída (sin offline mode) |
| `create-reservation` EF | No se pueden crear reservas (sin fallback directo a DB) |
| `admin-users` EF | No se pueden gestionar usuarios |
| `smtp-send` EF | Correos nunca se envían |
| OpenAI API | Chat IA no funciona (app sigue operativa) |
| `reservation-qrs` bucket | QR codes no se generan (non-blocking) |

### 9.3 Dependencias críticas npm

| Dependencia | Uso | Riesgo |
|------------|-----|--------|
| `@supabase/supabase-js@2.57.4` | TODO el backend | Crítico |
| `react@19.1.0` | UI framework | Crítico |
| `react-router-dom@7.6.3` | Routing | Crítico |
| `qrcode@1.5.4` | QR generation | Medio |
| `date-fns@4.1.0` + `date-fns-tz@3.2.0` | Manejo de timezones | Medio |
| `recharts@3.2.0` | Gráficos de reportes | Bajo |
| `xlsx@0.18.5` | Import/export Excel | Bajo |
| `html2canvas@1.4.1` | Generación de fichas QR | Medio |
| `firebase@12.0.0` | **NO USADO** — dependencia innecesaria | Ninguno (pero infla bundle) |
| `@stripe/react-stripe-js@4.0.2` | **NO USADO** — dependencia innecesaria | Ninguno (pero infla bundle) |

### 9.4 Cuellos de botella

| Zona | Problema | Impacto |
|------|---------|---------|
| `getReservations()` con joins de status | Muchas filas + RLS evaluation | Calendar lento con >500 reservas |
| `useUserScope` carga 6 queries secuenciales | Cada instancia nueva hace todas las queries | Primera carga del calendario lenta (2-4s) |
| `casetillaService.getExitEligibleReservations()` | Múltiples queries + lotificación manual | Lento con >1000 ingresos |
| `admin-users` EF lista TODOS los usuarios de auth | Paginación manual iterando | Lento con >200 usuarios |
| `correspondence-process-event` envía emails secuencialmente | Un email por regla, en serie | Bloquea respuesta hasta que todos los emails se procesan |