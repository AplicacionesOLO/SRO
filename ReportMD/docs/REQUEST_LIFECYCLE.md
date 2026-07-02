# REQUEST LIFECYCLE — Suite OLO / App Hub Manager

> **Documentación Enterprise-Grade | Segunda Pasada**
> Basado exclusivamente en el código fuente (v1199)
> NO contiene suposiciones, resúmenes ni invenciones.

---

## ÍNDICE DE FLUJOS DOCUMENTADOS

| # | Flujo | Página | Severidad |
|---|-------|--------|-----------|
| 1 | Login Email/Password | Login | CRÍTICO |
| 2 | Login Google OAuth | Login | CRÍTICO |
| 3 | Logout | Global (Navbar) | CRÍTICO |
| 4 | Crear Reserva | Calendario | CRÍTICO |
| 5 | Editar Reserva | Calendario | ALTO |
| 6 | Cancelar Reserva | Calendario | ALTO |
| 7 | Cambiar Estado (Drag & Drop) | Calendario | ALTO |
| 8 | Generación QR | Calendario (background) | MEDIO |
| 9 | Generación Ficha de Cita (Card) | Calendario (background) | MEDIO |
| 10 | Registro IN (Casetilla) | Casetilla | CRÍTICO |
| 11 | Registro OUT (Casetilla) | Casetilla | CRÍTICO |
| 12 | Chat IA (SRObot) | Chat Widget / Chat Page | ALTO |
| 13 | Procesamiento Documento | Conocimiento | MEDIO |
| 14 | Alta Usuario | Admin → Usuarios | ALTO |
| 15 | Cambio Permisos (Matriz) | Admin → Matriz Permisos | ALTO |
| 16 | Sincronización Proveedores | Admin → Catálogos | MEDIO |
| 17 | Importación Excel Proveedores | Admin → Catálogos | MEDIO |
| 18 | Cliente Retira (Pickup Blocks) | Admin → Clientes + Calendario | ALTO |
| 19 | No Show Automático | Cron (pg_cron) | ALTO |
| 20 | Correspondencia (Email Dispatch) | Background (trigger) | ALTO |
| 21 | Reportes Casetilla | Casetilla | BAJO |

---

## FLUJO 1: Login Email/Password

```
┌──────────┐    ┌──────────────┐    ┌───────────────┐    ┌──────────┐    ┌───────────────┐
│  Login   │───▶│ AuthContext   │───▶│ supabase.auth │───▶│ Supabase │───▶│ user_org_roles│
│  Page    │    │ .login()      │    │ .signInWith   │    │ Auth     │    │ (RLS probe)   │
│          │    │               │    │ Password()    │    │          │    │               │
└──────────┘    └──────────────┘    └───────────────┘    └──────────┘    └───────────────┘
                                                                                │
                                                                                ▼
                                                                        ┌───────────────┐
                                                                        │ user_org_roles │
                                                                        │ SELECT role_id │
                                                                        │ .maybeSingle() │
                                                                        └───────────────┘
                                                                                │
                                                          ┌─────────────────────┤
                                                          │                     │
                                                     fila existe           NO existe
                                                          │                     │
                                                          ▼                     ▼
                                                  ┌──────────────┐    ┌──────────────┐
                                                  │ loadPermissions│   │ profiles     │
                                                  │ role_permissions│  │ SELECT name  │
                                                  │ → Set<string>  │   │ → fallback   │
                                                  └──────────────┘    │ OPERADOR     │
                                                          │           │ pendingAccess │
                                                          ▼           │ = true        │
                                                  ┌──────────────┐    └──────────────┘
                                                  │ user = {      │
                                                  │  id, name,    │
                                                  │  email, role,  │
                                                  │  orgId        │
                                                  │ }             │
                                                  │ pendingAccess  │
                                                  │ = false        │
                                                  └──────────────┘
                                                          │
                                                          ▼
                                                  ┌──────────────┐
                                                  │ ProtectedRoute│
                                                  │ redirige a    │
                                                  │ /calendario   │
                                                  │ o /casetilla  │
                                                  └──────────────┘
```

### Paso a Paso (código fuente)

1. **UI: `src/pages/login/page.tsx`**
   - Formulario con email + password + botón submit
   - `onSubmit` → `handleLogin()`:
     ```typescript
     const user = await login(email, password);
     if (!user) setError('Credenciales inválidas');
     ```

2. **Context: `AuthContext.login(email, password)`**
   - `setLoading(true)`, `setPermissionsLoading(true)`, `setPendingAccess(false)`
   - `supabase.auth.signInWithPassword({ email, password })`
   - Si error → `return null` (se muestra error en UI)
   - Si éxito: `setSupabaseUser(data.user)`, `setWasAuthenticated(true)`, `setSessionExpired(false)`
   - `loadUserProfile(data.user.id, data.user.email || '')`

3. **Context: `AuthContext.loadUserProfile(userId, userEmail)`**
   - RLS probe: `supabase.from('user_org_roles').select('*').limit(5)` (diagnóstico)
   - Query real: `supabase.from('user_org_roles').select('org_id, role_id, roles(name)').eq('user_id', userId).maybeSingle()`
   - Si NO existe `user_org_roles`:
     - Carga `profiles` → `name, email`
     - Crea `fallbackUser: { id, name, email, role: 'OPERADOR', orgId: null }`
     - `setPermissionsSet(new Set())`, `setPendingAccess(true)`
   - Si SÍ existe:
     - `roleName = userOrgRole.roles.name || 'OPERADOR'`
     - Carga `profiles` → `name, email`
     - `loadedUser: { id, name, email, role: roleName, orgId: userOrgRole.org_id }`
     - `setPendingAccess(false)`
     - `loadPermissions(userOrgRole.role_id, userOrgRole.org_id)`

4. **Context: `AuthContext.loadPermissions(roleId, orgId)`**
   - Query: `supabase.from('role_permissions').select('permissions(name)').eq('role_id', roleId)`
   - Construye `Set<string>` con los nombres de los permisos
   - `setPermissionsSet(permSet)`

5. **Router: `ProtectedRoute` (`src/router/ProtectedRoute.tsx`)**
   - Si `loading` → spinner
   - Si `pendingAccess` → redirige a `/access-pending`
   - Si `!user` → redirige a `/login`
   - Si `user.role === 'CASETILLA'` → redirige a `/casetilla`
   - Si `user` (otro rol) → redirige a `/calendario`

### Dónde puede fallar
- `signInWithPassword` → error de red, credenciales inválidas, cuenta no confirmada
- `user_org_roles` query falla → `catch` setea `pendingAccess=false`, `permissionsSet=new Set()`
- `role_permissions` query falla → `catch` setea `permissionsSet=new Set()`
- Perfil no encontrado → fallback name desde email

### Qué logs genera
- `console.log` comentados (debug) en AuthContext
- NO se escribe en `activity_log` para login

### Auditoría
- Supabase Auth registra el sign-in en `auth.users.last_sign_in_at`

---

## FLUJO 2: Login Google OAuth

```
┌──────────┐    ┌──────────────┐    ┌──────────────────┐    ┌──────────┐
│  Login   │───▶│ AuthContext   │───▶│ supabase.auth    │───▶│ Google   │
│  Page    │    │ .loginWith    │    │ .signInWithOAuth │    │ OAuth    │
│          │    │ Google()      │    │ (provider:'google'│   │ Consent  │
└──────────┘    └──────────────┘    │ redirectTo,       │    └──────────┘
                                    │ access_type:offline│         │
                                    │ prompt:consent)    │         │
                                    └──────────────────┘         │
                                                                  ▼
                                    ┌──────────────────────────────────┐
                                    │ Google redirige al callback URL  │
                                    │ de Supabase (automático)         │
                                    └──────────────────────────────────┘
                                                                  │
                                                                  ▼
                                    ┌──────────────────────────────────┐
                                    │ Supabase procesa el token OAuth  │
                                    │ y redirige a la app (raíz /)    │
                                    └──────────────────────────────────┘
                                                                  │
                                                                  ▼
                                    ┌──────────────────────────────────┐
                                    │ AuthContext.onAuthStateChange    │
                                    │ detecta SIGNED_IN                │
                                    │ → loadUserProfile()              │
                                    │ → loadPermissions()              │
                                    │ → ProtectedRoute redirige        │
                                    └──────────────────────────────────┘
```

### Paso a Paso (código fuente)

1. **UI: Botón "Continuar con Google" en `login/page.tsx`**
   - `onClick` → `handleGoogleLogin()`
   - `setGoogleLoading(true)`
   - `await loginWithGoogle()`

2. **AuthContext.loginWithGoogle()**
   - `setLoading(true)`, `setPermissionsLoading(true)`, `setPendingAccess(false)`
   - Resuelve `basePath` desde `__BASE_PATH__`
   - `redirectUrl = ${window.location.origin}${basePath}`
   - `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl, queryParams: { access_type: 'offline', prompt: 'consent' } } })`
   - El navegador es redirigido a Google → NO retorna al código

3. **Google OAuth Consent Screen**
   - Usuario elige cuenta en Google
   - Google redirige al callback de Supabase
   - Supabase intercambia code por tokens
   - Supabase redirige a la URL original (raíz de la app)

4. **AuthContext.onAuthStateChange (listener registrado en useEffect de init)**
   - Evento `SIGNED_IN` → `session.user` existe
   - `setSupabaseUser(session.user)`, `setWasAuthenticated(true)`
   - `loadUserProfile(session.user.id, session.user.email || '')`

5. **Mismo flujo que login email desde loadUserProfile** (ver Flujo 1, pasos 3-5)

### Parámetros de OAuth
- `access_type: 'offline'` → solicita refresh token a Google
- `prompt: 'consent'` → fuerza pantalla de consentimiento siempre (asegura refresh token en reconexiones)

### Requisitos Supabase
- Google provider debe estar habilitado en Supabase Dashboard → Authentication → Providers → Google
- Authorized Redirect URIs configuradas en Google Cloud Console
- Client ID y Client Secret en Supabase

---

## FLUJO 3: Logout

```
┌──────────┐    ┌──────────────┐    ┌───────────────┐
│  Navbar  │───▶│ AuthContext   │───▶│ supabase.auth │
│  (botón) │    │ .logout()     │    │ .signOut()    │
└──────────┘    └──────────────┘    └───────────────┘
                                             │
                      ┌──────────────────────┘
                      ▼
              ┌──────────────┐
              │ setUser(null)│
              │ setSupabase  │
              │ User(null)   │
              │ setPerms(null)│
              │ setPending   │
              │ Access(false) │
              └──────────────┘
                      │
                      ▼
              ┌──────────────┐
              │ ProtectedRoute│
              │ redirige a    │
              │ /login        │
              └──────────────┘
```

### Paso a Paso

1. **UI: Navbar** → botón de logout
   - `onClick` → `logout()`
2. **AuthContext.logout()**
   - `await supabase.auth.signOut()`
   - `setUser(null)`, `setSupabaseUser(null)`, `setPermissionsSet(null)`, `setPendingAccess(false)`
3. **onAuthStateChange**: detecta `SIGNED_OUT` → también limpia estado (redundante, seguro)
4. **ProtectedRoute**: `!user` → redirige a `/login`

### Limpieza de sesión corrupta
- `clearCorruptedSession(expired)`: limpia localStorage de keys `sb-*` o que contengan `supabase`
- `supabase.auth.signOut({ scope: 'local' })` (no intenta contactar servidor)
- Si `expired=true` → `setSessionExpired(true)` → muestra modal "Sesión Expirada"

---

## FLUJO 4: Crear Reserva

```
┌────────────┐   ┌─────────────┐   ┌───────────────┐   ┌──────────────────┐
│ Calendario │──▶│Reservation  │──▶│ calendarService│──▶│ supabase.func    │
│ (modal)    │   │Modal.tsx    │   │ .createReserv  │   │ .invoke('create- │
│            │   │             │   │ ation()        │   │ reservation')    │
└────────────┘   └─────────────┘   └───────────────┘   └──────────────────┘
                                                                │
                                                                ▼
                                                        ┌──────────────────┐
                                                        │ Edge Function:   │
                                                        │ create-reservation│
                                                        │ (validación JWT, │
                                                        │  same-day cutoff,│
                                                        │  overlap check)  │
                                                        └──────────────────┘
                                                                │
                                                                ▼
                                                        ┌──────────────────┐
                                                        │ Supabase INSERT  │
                                                        │ → reservations   │
                                                        │ (RLS + exclusion │
                                                        │  constraint)     │
                                                        └──────────────────┘
                                                                │
                          ┌─────────────────────────────────────┤
                          ▼                                     ▼
                  ┌──────────────┐                      ┌──────────────┐
                  │ ensureReserv  │                     │ emailTrigger  │
                  │ ationQR()     │                     │ Service.onRes │
                  │ (background)  │                     │ ervationCreat │
                  └──────────────┘                     │ ed()          │
                          │                            └──────────────┘
                          ▼                                    │
                  ┌──────────────┐                             ▼
                  │ ensureReserv  │                    ┌──────────────┐
                  │ ationQRCard() │                    │ correspondence│
                  │ (background)  │                    │ -process-event│
                  └──────────────┘                    │ EF            │
                                                      └──────────────┘
```

### Paso a Paso Detallado

1. **Componente: `ReservationModal.tsx` (`src/pages/calendario/components/ReservationModal.tsx`)**
   - Formulario con: dock_id (preseleccionado), fecha/hora, proveedor, tipo carga, placa, chofer, DUA, factura, OC, notas, etc.
   - Soporta recurrencia (config semanal)
   - Soporta consolidado (múltiples proveedores)
   - Al submit → `calendarService.createReservation(payload)`

2. **Servicio: `calendarService.createReservation(reservation)` (`src/services/calendarService.ts`)**
   - `supabase.auth.getUser()` → `user.id`
   - `supabase.functions.invoke('create-reservation', { body: { ...reservation, created_by: user.id, updated_by: user.id } })`

3. **Edge Function: `create-reservation` (`supabase/functions/create-reservation/index.ts`)**
   - **Validación JWT**: `authHeader.replace('Bearer ', '')` → `supabase.auth.getUser(token)` — si falla, 401
   - **Validación org**: `user_org_roles` → `eq('user_id', userId).eq('org_id', org_id)`
   - **Resolución client_id**: Si no viene en el payload, busca en `client_docks` por `dock_id`
   - **Same-Day Cutoff**: Si `client_id` existe y `start_datetime` es hoy en el timezone del warehouse:
     - Carga `client_rules.same_day_cutoff_enabled` y `same_day_cutoff_hours`
     - Carga `warehouses.business_end_time` y `timezone`
     - Calcula cutoff = `business_end_time - cutoff_hours`
     - Si `nowMinutes >= cutoffMinutes` y el usuario no está en `client_same_day_bypass_users` → 403 `SAME_DAY_CUTOFF_BLOCKED`
   - **INSERT**: `supabase.from('reservations').insert(insertPayload).select('id').single()`
     - Si error overlap → 409 `OVERLAP_CONFLICT`
   - **SELECT final**: `supabase.from('reservations').select('*, status:reservation_statuses(name, code, color)').eq('id', inserted.id).single()`
   - **Response**: `{ data: full }` con status 201

4. **Servicio: Post-creación (background) (`calendarService.createReservation`)**
   - `ensureReservationQR(orgId, created.id)` — genera QR PNG, sube a `reservation-qrs` bucket, guarda `qr_image_url`
   - `ensureReservationQRCard(orgId, created.id)` — genera ficha completa, sube a `reservation-qrs` bucket, guarda `qr_card_image_url`
   - `emailTriggerService.onReservationCreated(orgId, created)` — dispara evento de correspondencia

5. **Email Trigger: `emailTriggerService.onReservationCreated()`**
   - `getValidSupabaseToken()` → access_token desde `supabase.auth.getSession()`
   - `invokeCorrespondenceProcessEvent()` → `fetch(${SUPABASE_URL}/functions/v1/correspondence-process-event, { method: 'POST', Authorization: Bearer ${token}, body: { orgId, eventType: 'reservation_created', reservationId, actorUserId, statusFromId: null, statusToId } })`

6. **Edge Function: `correspondence-process-event`**
   - Busca `correspondence_rules` activas para `event_type = 'reservation_created'`
   - Filtra por `warehouse_id` del dock (reglas específicas + globales con `warehouse_id IS NULL`)
   - Para cada regla: resuelve destinatarios, procesa template, inserta en `correspondence_outbox`, invoca `smtp-send`

7. **Edge Function: `smtp-send`**
   - Conexión SMTP directa (Gmail SMTP por defecto en puerto 587)
   - STARTTLS → AUTH LOGIN → MAIL FROM → RCPT TO → DATA
   - Construye email MIME multipart/alternative (text/plain + text/html)
   - Actualiza `correspondence_outbox.status = 'sent' | 'failed'`

### Recurrencia
- `calendarService.createRecurringReservations(baseReservation, additionalDates)`
- Itera sobre `additionalDates`, llama a `createReservation` para cada una
- Cada ocurrencia obtiene su propio QR y ficha (en paralelo, no bloqueante)

### Consolidado (Múltiples Proveedores)
- `calendarService.saveConsolidatedProviders(orgId, reservationId, providers)`
- Borra líneas existentes en `reservation_consolidated_providers`, inserta nuevas
- Calcula diff (added/removed/changed) y registra en `activity_log`

### Puntos de falla
- Overlap → mensaje "Ese andén ya está reservado"
- Same-day cutoff → mensaje con la hora de corte
- Error de red → fallback silencioso para QR y email
- Falla en QR/ficha → email se envía sin QR/ficha (non-blocking)
- Falla en email trigger → non-blocking (catch silencioso)

---

## FLUJO 5: Editar Reserva

```
┌────────────┐   ┌─────────────┐   ┌───────────────┐   ┌──────────────┐
│ Calendario │──▶│Reservation  │──▶│ calendarService│──▶│ reservations │
│ (modal)    │   │Modal.tsx    │   │ .updateReserv  │   │ UPDATE       │
│            │   │(modo edición)│  │ ation(id, upd) │   │ (RLS)        │
└────────────┘   └─────────────┘   └───────────────┘   └──────────────┘
                                                                │
                                                                ▼
                                                        ┌──────────────┐
                                                        │ SELECT full   │
                                                        │ row (separado)│
                                                        │ para evitar   │
                                                        │ error 406     │
                                                        └──────────────┘
                                                                │
                          ┌─────────────────────────────────────┤
                          ▼                                     ▼
                  ┌──────────────┐                      ┌──────────────┐
                  │ emailTrigger  │                     │ regenerateRes │
                  │ (si status     │                    │ ervationQR    │
                  │  cambió)       │                    │ Assets()      │
                  └──────────────┘                      │ (non-blocking)│
                                                        └──────────────┘
```

### Paso a Paso

1. **`calendarService.updateReservation(id, updates)`**
   - `supabase.auth.getUser()` → `user.id`
   - Si `updates.status_id` cambió: query previa para obtener `oldStatusId` y `oldOrgId`
   - UPDATE: `supabase.from('reservations').update({ ...updates, updated_by: user.id, updated_at: now }).eq('id', id)`
   - SELECT separado: `supabase.from('reservations').select('*, status:reservation_statuses(name, code, color)').eq('id', id).maybeSingle()`
   - Si status cambió → `emailTriggerService.onReservationStatusChanged(orgId, reservation, oldStatusId, newStatusId)`
   - Si SELECT falla (RLS) → construye fallback mínimo con los datos del update

2. **Regeneración QR (background, no bloqueante)**
   - `regenerateReservationQRAssets(orgId, reservationId)` → `ensureReservationQR(forceRefresh: true)` + `ensureReservationQRCard(forceRefresh: true)`
   - Registra en `activity_log`

### Por qué UPDATE y SELECT están separados
- Supabase retorna error 406 cuando RLS no permite leer la fila después del UPDATE
- Separar UPDATE de SELECT evita este problema y permite fallback

---

## FLUJO 6: Cancelar Reserva

1. **`calendarService.cancelReservation(id, reason)`**
   - `supabase.from('reservations').update({ is_cancelled: true, cancel_reason: reason, cancelled_by: user.id, cancelled_at: now, updated_by: user.id, updated_at: now }).eq('id', id)`
   - NO dispara email trigger automáticamente
   - La cancelación es un soft-delete (flag `is_cancelled = true`)

---

## FLUJO 7: Drag & Drop (Cambio de Estado/Dock/Fecha)

El drag & drop en el calendario modifica una reserva existente. El componente `SchedulerView.tsx` maneja el evento de drop y determina si cambió el dock, la fecha, o el estado.

### Validación de Bloqueo (useBlockedStatuses)

Antes de permitir el drag, se evalúa:
- `useBlockedStatuses.isReservationBlockedSync(clientId, statusId)` → versión síncrona (requiere caché precargado)
- `clientBlockedStatusesService.isBlockedForUserSync(config, statusId, userId, userRoleId, isPrivileged)`
- Prioridades: 1) Privilegiado → permitir, 2) user en bypass_user_ids → permitir, 3) user role en bypass_role_ids → permitir, 4) bloqueado

---

## FLUJO 8: Generación QR

1. `ensureReservationQR(orgId, reservationId)`
   - Import dinámico: `generateQRBlob` desde `@/utils/reservationQr.utils`
   - Genera blob PNG → `supabase.storage.from('reservation-qrs').upload(path, blob, { cacheControl: '3600', upsert: true, contentType: 'image/png' })`
   - `supabase.storage.from('reservation-qrs').getPublicUrl(path)` → `publicUrl`
   - `supabase.from('reservations').update({ qr_image_url: publicUrl }).eq('id', reservationId)`

---

## FLUJO 9: Generación Ficha de Cita

1. `ensureReservationQRCard(orgId, reservationId)`
   - Verifica si ya existe (`qr_card_image_url`)
   - Carga datos de reserva, proveedor, timezone
   - `generateQRCardBlob({ id, providerName, startDatetime, endDatetime, operationType, warehouseTimezone })`
   - Sube a `reservation-qrs` bucket como `card.png`
   - Guarda URL en `reservations.qr_card_image_url`

---

## FLUJO 10: Registro IN (Casetilla)

```
┌────────────┐   ┌─────────────┐   ┌───────────────┐   ┌──────────────┐
│ Casetilla  │──▶│IngresoForm  │──▶│ casetillaServ  │──▶│ reservations │
│ Page       │   │.tsx         │   │ ice.create     │   │ UPDATE       │
│            │   │             │   │ Ingreso()      │   │ status_id    │
└────────────┘   └─────────────┘   └───────────────┘   └──────────────┘
                                                                │
                                                                ▼
                                                        ┌──────────────┐
                                                        │ casetilla_    │
                                                        │ ingresos      │
                                                        │ INSERT        │
                                                        └──────────────┘
                                                                │
                                                                ▼
                                                        ┌──────────────┐
                                                        │ emailTrigger  │
                                                        │ Service (si   │
                                                        │ status cambió)│
                                                        └──────────────┘
```

### Paso a Paso

1. **`casetillaService.createIngreso(orgId, userId, data)`**
   - Si `data.reservation_id` explícito → lo usa directamente
   - Si no → busca por DUA + Matrícula en `reservations`
   - Actualiza status a `ARRIVED_PENDING_UNLOAD` (busca por code o name, con fallback)
   - Sincroniza campos: `truck_plate`, `driver`, `dua`, `purchase_order`, `order_request_number`, `notes` → copia del ingreso a la reserva
   - INSERT en `casetilla_ingresos` con fotos (si existen)
   - Dispara `emailTriggerService.onReservationStatusChanged()`

2. **Fotos**: las URLs de las fotos vienen del frontend (upload previo a Storage)

---

## FLUJO 11: Registro OUT (Casetilla)

1. **`casetillaService.createSalida(orgId, userId, reservationId, fotos, reservationData)`**
   - Verifica que no exista salida previa (unique constraint implícito)
   - Busca status `DISPATCHED` por code
   - UPDATE `reservations.status_id = DISPATCHED`
   - INSERT en `casetilla_salidas` con `exit_at = now()`
   - Dispara `emailTriggerService.onReservationStatusChanged()`

---

## FLUJO 12: Chat IA (SRObot)

```
┌────────────┐   ┌─────────────┐   ┌───────────────┐   ┌──────────────────┐
│ ChatWidget │──▶│ useChat      │──▶│ chatService    │──▶│ fetch(SUPABASE_URL│
│ o ChatPage │   │ Session()    │   │ .askChat()     │   │ /functions/v1/   │
│            │   │             │   │                │   │ ask-sro-chat)    │
└────────────┘   └─────────────┘   └───────────────┘   └──────────────────┘
                                                                │
                                                                ▼
                                                        ┌──────────────────┐
                                                        │ ask-sro-chat EF  │
                                                        │ 1. Validar JWT   │
                                                        │ 2. Cargar user   │
                                                        │    org/role/perms│
                                                        │ 3. Verificar     │
                                                        │    chat.ask perm │
                                                        │ 4. Filtrar docs  │
                                                        │    por access_   │
                                                        │    level + visib │
                                                        │ 5. Crear/obtener │
                                                        │    session       │
                                                        │ 6. OpenAI API    │
                                                        │    con vector    │
                                                        │    store search  │
                                                        │ 7. Guardar msg   │
                                                        │    en chat_      │
                                                        │    messages      │
                                                        └──────────────────┘
```

### Paso a Paso Detallado

1. **`chatService.askChat(payload)`**
   - `supabase.auth.getSession()` → `access_token`
   - `fetch(${SUPABASE_URL}/functions/v1/ask-sro-chat, { method: 'POST', Authorization: Bearer ${token}, body: JSON.stringify({ question, session_id }) })`

2. **Edge Function `ask-sro-chat`**
   - JWT validation: `supabase.auth.getUser(token)` con `SUPABASE_SERVICE_ROLE_KEY`
   - Carga `user_org_roles` → `org_id`, `role_id`
   - Carga `role_permissions` → verifica `chat.ask`
   - Verifica niveles: `chat.answers.basic`, `chat.answers.extended`, `chat.answers.internal`
   - Carga `knowledge_documents` activos con sus roles/permisos
   - Filtra documentos según `access_level` y `visibility_mode`
   - Crea o reusa `chat_sessions`
   - Determina `vector_store_id` desde docs existentes
   - Carga `chat_prompt_configs.system_prompt`
   - Llama a OpenAI Responses API con file_search tool
   - Parsea sugerencias del marcador `===SUGERENCIAS===`
   - Guarda mensajes user + assistant en `chat_messages`
   - Actualiza `chat_sessions.last_message_at`
   - Retorna `{ answer, session_id, message_id, citations, suggested_questions }`

---

## FLUJO 13: Procesamiento Documento (Conocimiento)

1. **`knowledgeService.uploadDocumentFile(orgId, file)`**
   - `supabase.storage.from('knowledge-documents').upload(filePath, file)`
   - Retorna `{ filePath, publicUrl }`

2. **`knowledgeService.createDocumentRecord(orgId, userId, filePath, fileName, fileSize, payload)`**
   - INSERT en `knowledge_documents` con status `draft`
   - INSERT tags, roles, permissions en tablas pivote

3. **`chatService.processDocument(documentId)`**
   - `fetch(${SUPABASE_URL}/functions/v1/process-knowledge-document, { method: 'POST', Authorization: Bearer ${token}, body: { document_id } })`

4. **Edge Function `process-knowledge-document`**
   - JWT validation
   - Descarga archivo de Supabase Storage
   - Sube a OpenAI Files API (`purpose: assistants`)
   - Crea/reusa Vector Store en OpenAI
   - Agrega archivo al Vector Store
   - Actualiza `knowledge_documents` con `openai_file_id`, `openai_vector_store_id`, `status: active`

---

## FLUJO 14: Alta Usuario (Admin)

1. **UI: `UsersTab.tsx`** → formulario: email, password, nombre, rol
2. **`adminService.createOrgUser({ orgId, email, password, roleId, full_name })`**
   - `supabase.functions.invoke('admin-users', { body: { action: 'create', orgId, email, password, roleId, full_name } })`

3. **Edge Function `admin-users` (action: 'create')**
   - Usa `SUPABASE_SERVICE_ROLE_KEY` para crear cliente admin
   - `listAllAuthUsers()` → busca si el email ya existe (paginación completa)
   - Si existe: actualiza `profiles`
   - Si no: `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })` → upsert en `profiles`
   - Inserta `user_org_roles` con el `role_id`

### Seguridad
- Esta EF usa `SUPABASE_SERVICE_ROLE_KEY` — poder total
- **NO valida JWT del caller** — cualquiera que conozca la URL puede crear usuarios
- ⚠️ VULNERABILIDAD CONOCIDA: sin `--verify-jwt`, sin validación manual de token

---

## FLUJO 15: Cambio Permisos (Matriz)

1. **`adminService.bulkUpdateRolePermissions(roleId, permissionIds, orgId)`**
   - DELETE `role_permissions` WHERE `role_id = roleId`
   - INSERT nuevos `role_permissions`
   - INSERT en `admin_audit_log`

### Nota importante
- Los permisos NO se invalidan en caliente — el usuario debe re-login para ver cambios
- `AuthContext.loadPermissions()` solo se ejecuta en login/refresh

---

## FLUJO 16: Sincronización Proveedores

1. **`providersService.syncProviders(orgId, source, clientId, providers)`**
   - `supabase.functions.invoke('sync-providers', { body: { org_id, source, client_id, providers } })`

2. **Edge Function `sync-providers`**
   - Carga todos los proveedores existentes de la org
   - Itera los de la API: matched (ya existen) / created (nuevos) / updated (cambió nombre/tipo)
   - Desactiva los que no están en la API (`active = false`)
   - Resuelve cliente por `source_code` vía `origen_proveedores` o fallback legacy
   - NOTA: no valida JWT manualmente

---

## FLUJO 18: Cliente Retira (Pickup Blocks)

1. **Crear regla**: `clientPickupRulesService.create(orgId, clientId, payload)`
   - Valida: `dock_id` requerido, `block_minutes > 0`
   - INSERT en `client_pickup_rules`
   - `triggerBlockGeneration(orgId, ruleId)` → invoca EF `generate-client-pickup-blocks`

2. **Edge Function `generate-client-pickup-blocks`**
   - Carga reglas activas de `client_pickup_rules`
   - Para cada regla: calcula bloques diarios desde hoy hasta `days_ahead` (30)
   - Bloques = franjas horarias desde `business_start_time` hasta `business_end_time`
   - Hoy: calcula inicio dinámico (bloque actual o siguiente)
   - Días futuros: bloque completo desde inicio del día hábil
   - Inserta en `dock_time_blocks` con `reason = 'CLIENT_PICKUP:{ruleId}'`
   - `created_by = SYSTEM_USER_ID` ('00000000-0000-0000-0000-000000000000')
   - Conflict handling: P0001 → skip silencioso (regla cliente tiene prioridad)
   - `force_regenerate`: borra bloques existentes antes de regenerar

3. **Propagación**: `ClientPickupRulesContext.notifyRuleChanged(dockIds)`
   - El Calendario escucha `lastRuleChange` y `affectedDockIds`
   - Recarga bloques para los docks afectados

---

## FLUJO 19: No Show Automático (Cron)

1. **Edge Function `auto-mark-no-show`** (invocada por pg_cron)
   - Modo cron: valida `X-Internal-Cron-Secret === SUPABASE_SERVICE_ROLE_KEY`
   - Modo usuario: valida JWT normal
   - Carga `reservation_statuses` → id de `NO_SHOW`
   - Carga `warehouses` con `no_show_tolerance_minutes > 0`
   - Carga `docks` de esos warehouses
   - Busca reservas NO canceladas, con status ≠ NO_SHOW, en esos docks, con `start_datetime` no nulo
   - Excluye las que ya tienen ingreso en `casetilla_ingresos`
   - Para cada una: calcula cutoff = `start_datetime + tolerance_minutes`
   - Si `now > cutoff` → marca como candidata
   - UPDATE batch de 50: `status_id = NO_SHOW`
   - Registra en `activity_log` con metadata `{ reason: 'AUTO_NO_SHOW', source: 'pg_cron' }`

---

## FLUJO 20: Correspondencia (Email Dispatch)

1. **`emailTriggerService.onReservationCreated(orgId, reservation)`**
   - `getValidSupabaseToken()` → `access_token`
   - `invokeCorrespondenceProcessEvent()` → `fetch(${SUPABASE_URL}/functions/v1/correspondence-process-event, { body: { orgId, eventType: 'reservation_created', reservationId, actorUserId, statusFromId: null, statusToId } })`

2. **`emailTriggerService.onReservationStatusChanged(orgId, reservation, oldStatusId, newStatusId)`**
   - Similar, con `eventType: 'reservation_status_changed'`, `statusFromId`, `statusToId`

3. **Edge Function `correspondence-process-event`**
   - Carga reserva completa (con dock, warehouse, status, provider)
   - Carga `correspondence_rules` activas filtradas por:
     - `event_type`
     - `warehouse_id` (específico + NULL = global)
     - `status_from_id` / `status_to_id` (si es cambio de estado)
   - Para cada regla:
     - `require_dua`: si la reserva no tiene DUA → skip
     - `include_casetilla_photos`: busca fotos en `casetilla_ingresos` o `casetilla_salidas`
     - `resolveRecipients`: resuelve destinatarios según `recipients_mode` (manual/users/roles)
     - `processTemplate`: reemplaza `{{variable}}` en subject y body
     - `normalizeEmailBody`: convierte a HTML seguro
     - Inserta en `correspondence_outbox` con status `queued`
     - Invoca `smtp-send` → actualiza `status = sent | failed`

4. **Edge Function `smtp-send`** (ver Flujo 4, paso 7)

---

## RESUMEN DE CAPAS POR FLUJO

| Capa | Login | Crear Reserva | Chat IA | IN Casetilla |
|------|-------|---------------|---------|--------------|
| UI | login/page.tsx | ReservationModal | ChatWidget | IngresoForm |
| Hook | useAuth() | useReservationDraft | useChatSession | — |
| Context | AuthContext | ActiveWarehouse | — | — |
| Service | AuthContext.login | calendarService | chatService.askChat | casetillaService |
| Edge Function | — | create-reservation | ask-sro-chat | — (direct DB) |
| RPC | — | — | — | get_pending_reservations_v4 |
| Storage | — | reservation-qrs | — | fotos upload |
| RLS | user_org_roles | reservations | knowledge_docs | casetilla_ingresos |
| Trigger | — | exclusion constraint | — | — |
| Auditoría | Supabase Auth | activity_log | chat_audit_logs | activity_log |
| Correo | — | correspondence-process-event | — | emailTrigger |
| Respuesta | User + redirect | Reservation + QR | { answer, citations } | Ingreso + status |