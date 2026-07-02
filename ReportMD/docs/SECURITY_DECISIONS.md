# SECURITY_DECISIONS.md — Suite OLO / App Hub Manager

> **Versión**: Build 1198 | **Fecha**: 2026-06-30  
> **Fuente**: Código fuente real, configuraciones reales, edge functions reales  
> **Propósito**: Justificar cada decisión de seguridad del sistema. No es un checklist — es el razonamiento detrás de la arquitectura de seguridad.

---

## 1. ¿Por qué existe RLS?

**Decisión**: Usar Row Level Security (RLS) en TODAS las tablas de Supabase.

**Justificación**:
- El frontend (React SPA) usa la `anon key` para conectarse directamente a PostgreSQL
- Sin RLS, cualquier usuario autenticado podría leer/escribir cualquier fila de cualquier tabla
- RLS garantiza que cada query solo retorne filas del `org_id` del usuario autenticado
- Es la ÚLTIMA línea de defensa — si el frontend o una Edge Function se saltea una validación, RLS aún bloquea

**Implementación real**:
```sql
-- Patrón típico de RLS en este sistema:
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own org reservations"
  ON reservations FOR SELECT
  USING (org_id = (SELECT org_id FROM user_org_roles WHERE user_id = auth.uid()));
```

**Riesgo si no existiera**: Un usuario operador podría leer/modificar reservas de cualquier organización.

---

## 2. ¿Por qué existe RBAC?

**Decisión**: Role-Based Access Control con matriz de permisos granular.

**Justificación**:
- Los 4 roles del sistema (ADMIN, SUPERVISOR, OPERADOR, CASETILLA) no son suficientes para controlar acceso fino
- Se necesita que un OPERADOR pueda ver el calendario pero no gestionar usuarios
- Se necesita que un CASETILLA solo vea el módulo de casetilla
- La matriz `role_permissions` permite asignar permisos individuales a cada rol

**Implementación real**:
- Tabla `roles`: define los roles disponibles
- Tabla `permissions`: define todos los permisos granulares (ej: `admin.users.create`, `chat.ask`)
- Tabla `role_permissions`: asigna permisos a roles
- `AuthContext.loadPermissions()` carga los permisos del rol del usuario en un `Set<string>`
- `canLocal(permission)` verifica membresía en el Set

**Riesgo si no existiera**: Solo habría 4 niveles de acceso, sin granularidad. Un OPERADOR que necesita ver clientes tendría que ser ADMIN.

---

## 3. ¿Por qué existen Edge Functions?

**Decisión**: Lógica de negocio crítica en Edge Functions serverless, NO en el frontend.

**Justificación**:
- El frontend es JavaScript ejecutándose en el navegador del usuario — totalmente manipulable
- Validaciones en frontend son UX, no seguridad
- Operaciones como crear usuarios, crear reservas con cutoff validation, o enviar correos DEBEN ejecutarse en server-side
- Edge Functions tienen acceso a `SUPABASE_SERVICE_ROLE_KEY` que el frontend NUNCA ve

**Qué NO podría hacerse sin Edge Functions**:
- Validar same-day cutoff (requiere hora local del warehouse, que el frontend podría manipular)
- Crear usuarios en Supabase Auth (requiere service role)
- Enviar correos SMTP (requiere credenciales que no pueden estar en frontend)
- Procesar documentos con OpenAI (requiere API key secreta)

---

## 4. ¿Por qué algunas Edge Functions usan `--no-verify-jwt`?

**Decisión**: Varias Edge Functions se despliegan con `verify_jwt: false` y validan el JWT manualmente.

**Justificación técnica**:

### 4.1 ¿Qué hace `--verify-jwt` de Supabase?

Cuando una Edge Function se despliega con `verify_jwt: true`, Supabase automáticamente:
1. Verifica que el request tenga header `Authorization: Bearer <token>`
2. Valida la firma JWT contra el secreto del proyecto
3. Extrae `auth.uid()` y los claims del JWT
4. Si el token es inválido → 401 automático

### 4.2 ¿Por qué este sistema lo desactiva?

| Razón | Explicación |
|-------|-------------|
| **Admin functions** | `admin-users`, `admin-user-access`, `smtp-send` necesitan service role para operar. Supabase admin API requiere service role, no JWT del usuario. |
| **Cron jobs** | `auto-mark-no-show` se invoca vía pg_cron, que no tiene JWT de usuario. Usa `X-Internal-Cron-Secret`. |
| **Gmail callback** | `gmail-callback` recibe redirect de Google, no tiene JWT del usuario. |
| **Internal chaining** | `correspondence-process-event` es llamado por `correspondence-dispatch-event` internamente. |
| **Flexibilidad** | Algunas funciones necesitan lógica de auth personalizada (ej: verificar pertenencia a org). |

### 4.3 Riesgo cuando `verify_jwt: false` sin validación manual

Si una Edge Function tiene `verify_jwt: false` y NO valida el JWT manualmente → **cualquiera puede llamarla**.

**Funciones en este estado (RIESGO)**:
- `smtp-send`: CUALQUIERA puede enviar correos. **CRÍTICO**.
- `admin-users`: CUALQUIERA puede crear/listar usuarios. **CRÍTICO**.

### 4.4 Funciones que validan JWT manualmente (CORRECTO)

| Función | Validación manual | Cómo |
|---------|-------------------|------|
| `create-reservation` | ✅ | `supabase.auth.getUser(token)` + verifica `user_org_roles` |
| `ask-sro-chat` | ✅ | `supabase.auth.getUser(token)` + verifica `role_permissions` |
| `admin-user-access` | ✅ | Crea cliente con `SUPABASE_ANON_KEY` + `auth.getUser()` |
| `process-knowledge-document` | ✅ | `supabase.auth.getUser(token)` + verifica `user_org_roles` |
| `correspondence-dispatch-event` | ✅ | `supabase.auth.getUser(jwt)` |
| `api-v1-*` | ✅ | `supabase.auth.getUser(token)` + resuelve scope |
| `generate-client-pickup-blocks` | Parcial | Intenta `getUser(token)` si hay auth header, fallback a SYSTEM_USER |
| `auto-mark-no-show` | Parcial | Modo usuario: valida JWT. Modo cron: valida `X-Internal-Cron-Secret` |
| `gmail-callback` | N/A | Es un OAuth callback, no recibe JWT |

### 4.5 Conclusión

`--no-verify-jwt` NO significa "sin seguridad". Significa "validación manual dentro de la función". Las funciones que NO hacen validación manual (`smtp-send`, `admin-users`) representan un riesgo de seguridad activo que debe corregirse.

---

## 5. Service Role Key

**Decisión**: `SUPABASE_SERVICE_ROLE_KEY` solo existe en Edge Functions (Deno.env), NUNCA en frontend.

**Justificación**:
- El service role key tiene acceso TOTAL a la base de datos (bypass RLS)
- Si se filtrara al frontend, cualquier usuario podría ejecutar queries sin restricción
- Todas las Edge Functions lo obtienen de `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`
- El frontend usa `VITE_PUBLIC_SUPABASE_ANON_KEY` (publishable key)

**Verificación**: El archivo `src/lib/supabase.ts` usa `VITE_SUPABASE_PUBLISHABLE_KEY` que valida que empiece con `sb_publishable_`. No hay referencias a `SUPABASE_SERVICE_ROLE_KEY` en ningún archivo del frontend.

---

## 6. JWT y Refresh Tokens

**Decisión**: Supabase Auth maneja JWT automáticamente. El frontend solo consume sesión.

**Implementación**:
- `supabase-js` con `persistSession: true` guarda tokens en localStorage
- `autoRefreshToken: true` renueva automáticamente 30 segundos antes de expirar
- `detectSessionInUrl: true` detecta tokens en URL (OAuth callback)

**Manejo de refresh failures**:
```typescript
// src/contexts/AuthContext.tsx
// 3 capas de detección:
// 1. getSession() → Refresh Token Not Found
// 2. onAuthStateChange → TOKEN_REFRESHED con session=null
// 3. unhandledrejection global → refresh_token_not_found
```

**Decisión de UI**: Mostrar `SessionExpiredModal` en lugar de redirect silencioso. El usuario ve exactamente qué pasó y puede volver a loguearse.

---

## 7. Storage: buckets públicos vs privados

**Decisión**: `reservation-qrs` es público, `reservation-files` y `knowledge-documents` son privados.

**Justificación**:

| Bucket | Visibilidad | Por qué |
|--------|-------------|---------|
| `reservation-qrs` | Público | Los QR codes se incrustan en emails y se escanean en casetilla. Deben ser accesibles sin auth. |
| `reservation-files` | Privado | Documentos de reserva (CMR, facturas) contienen datos sensibles. Signed URLs para acceso temporal. |
| `knowledge-documents` | Privado | PDFs internos para el asistente IA. Solo accesibles vía Edge Function o signed URL. |

---

## 8. CORS

**Decisión**: Todas las Edge Functions tienen `Access-Control-Allow-Origin: *`.

**Estado actual**: CORS abierto a cualquier origen.

**Riesgo**: Cualquier sitio web puede hacer requests a las Edge Functions desde el navegador de un usuario autenticado.

**Por qué se hizo así**: Las Edge Functions de Supabase requieren el header `apikey` (anon key) que solo el frontend legítimo conoce. Sin embargo, si un atacante obtiene la anon key (es pública), podría hacer requests cross-origin.

**Deuda técnica**: Restringir CORS a los dominios de producción conocidos.

---

## 9. CSP (Content Security Policy)

**Decisión**: NO configurado.

**Estado actual**: Sin CSP headers.

**Riesgo**: El sitio es vulnerable a XSS. Si un atacante logra inyectar un script (ej: via dependencia npm comprometida), no hay restricción.

**Deuda técnica**: Configurar CSP con:
- `script-src 'self'` + Supabase CDN
- `connect-src 'self'` + Supabase URL + OpenAI API
- `img-src 'self' data:` + Supabase Storage + readdy.ai (imágenes)

---

## 10. Secrets

**Decisión**: Todos los secrets viven en Supabase Secrets (Edge Functions), NO en el frontend.

| Secret | Ubicación | Accedido por |
|--------|-----------|-------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Secrets | Todas las Edge Functions |
| `OPENAI_API_KEY` | Supabase Secrets | `ask-sro-chat`, `process-knowledge-document` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Supabase Secrets | `smtp-send` |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` | Supabase Secrets | `gmail-callback` |
| `SUPABASE_ANON_KEY` | Supabase Secrets + Frontend .env | Edge Functions + Frontend |
| `VITE_PUBLIC_SUPABASE_URL` | Frontend .env | Frontend |
| `VITE_PUBLIC_SUPABASE_ANON_KEY` | Frontend .env | Frontend |

---

## 11. Variables de entorno

**Decisión**: Usar el prefijo `VITE_` para variables públicas del frontend.

**Implementación real** (`vite.config.ts`):
```typescript
define: {
  __BASE_PATH__: JSON.stringify(base),
  __IS_PREVIEW__: JSON.stringify(isPreview),
  __READDY_PROJECT_ID__: JSON.stringify(process.env.PROJECT_ID || ""),
  __READDY_VERSION_ID__: JSON.stringify(process.env.VERSION_ID || ""),
  __READDY_AI_DOMAIN__: JSON.stringify(process.env.READDY_AI_DOMAIN || ""),
}
```

**Variables de Supabase** (`.env`):
```
VITE_PUBLIC_SUPABASE_URL=<url>
VITE_PUBLIC_SUPABASE_ANON_KEY=<sb_publishable_...>
```

---

## 12. Auditoría

**Decisión**: Múltiples tablas de auditoría para diferentes dominios.

| Tabla | Dominio | Qué registra |
|-------|---------|-------------|
| `activity_log` | Reservas, bloques, QR | Cambios de estado, generación de QR, creación de bloques |
| `reservation_activity_log` | Reservas | Cambios específicos de reservas |
| `admin_audit_log` | Admin | Cambios en roles, permisos, usuarios |
| `chat_audit_logs` | Chat IA | Interacciones con el asistente |
| `correspondence_logs` | Email | Envíos de correo |

**Reglas de auditoría**:
- Solo INSERTS, nunca UPDATES ni DELETES (append-only)
- `actor_user_id`: quién hizo el cambio
- `entity_type` + `entity_id`: qué se modificó
- `old_value` + `new_value`: diff del cambio

**Lo que NO se audita** (deuda técnica):
- Intentos de acceso denegado (fallos de RLS, permisos insuficientes)
- Rate de requests por usuario
- Cambios en `user_warehouse_access` (la EF `admin-user-access` no genera logs)

---

## 13. Rate Limiting

**Decisión**: NO implementado.

**Estado actual**: Sin rate limiting en Edge Functions ni en Supabase.

**Riesgo**: Un atacante podría hacer fuerza bruta contra endpoints (ej: `/functions/v1/smtp-send` para enviar spam, o `/functions/v1/ask-sro-chat` para consumir créditos de OpenAI).

**Deuda técnica**: Implementar rate limiting por IP y por usuario en Edge Functions críticas.

---

## 14. OWASP Top 10 — Evaluación

| Riesgo OWASP | Estado | Notas |
|-------------|--------|-------|
| A01: Broken Access Control | ⚠️ RIESGO | `admin-users` y `smtp-send` sin validación JWT. RLS mitiga en DB. |
| A02: Cryptographic Failures | ✅ OK | JWT con RS256, secrets en Supabase Secrets, HTTPS |
| A03: Injection | ✅ OK | Supabase SDK parametriza queries. Sin SQL raw. |
| A04: Insecure Design | ⚠️ RIESGO | Sin rate limiting, sin MFA para admins |
| A05: Security Misconfiguration | ⚠️ RIESGO | CORS *, sin CSP, `smtp-send` sin auth |
| A06: Vulnerable Components | ✅ OK | Dependencias actualizadas (React 19, Supabase 2.57.4) |
| A07: Auth Failures | ⚠️ RIESGO | Sin MFA, sin lockout después de intentos fallidos |
| A08: Software Integrity | ✅ OK | Source maps solo en dev, sin eval() en prod |
| A09: Logging & Monitoring | ⚠️ PARCIAL | Auditoría existe pero no cubre accesos denegados |
| A10: SSRF | ✅ OK | Sin fetch a URLs controladas por usuario |

---

## 15. Decisiones correctas

| Decisión | Por qué fue correcta |
|----------|---------------------|
| Usar Supabase Auth en lugar de auth propia | Evita almacenar contraseñas, maneja refresh tokens, OAuth |
| Service role solo en Edge Functions | El frontend nunca tiene acceso total a DB |
| RLS en todas las tablas | Última línea de defensa, incluso si frontend/EF fallan |
| Edge Functions para lógica crítica | Validaciones de negocio en server-side, no confiar en frontend |
| Validación manual de JWT en EFs | Mayor control sobre qué usuarios pueden ejecutar qué |
| Múltiples tablas de auditoría | Separación de dominios, fácil de consultar |
| Scope cache con TTL | Evita consultas repetitivas a DB, mejora performance |
| SessionExpiredModal en lugar de redirect silencioso | UX clara, el usuario entiende qué pasó |

---

## 16. Decisiones que deben cambiar (deuda técnica)

| Decisión | Por qué debe cambiar | Prioridad |
|----------|---------------------|-----------|
| `smtp-send` sin validación JWT | Cualquiera puede enviar correos | 🔴 CRÍTICA |
| `admin-users` sin validación JWT | Cualquiera puede crear/listar usuarios | 🔴 CRÍTICA |
| Sin CSP | Vulnerable a XSS | 🔴 ALTA |
| CORS * en todas las EFs | Cross-origin requests desde cualquier dominio | ⚠️ ALTA |
| Sin MFA para admins | Cuentas admin vulnerables a phishing | ⚠️ ALTA |
| Sin rate limiting | Abuso de endpoints (spam, consumo de OpenAI) | ⚠️ MEDIA |
| Sin auditoría de accesos denegados | No se detectan intentos de intrusión | ⚠️ MEDIA |
| Roles hardcodeados en `UserRole` type | Agregar nuevo rol requiere cambio de código | ⚠️ BAJA |
| `GLOBAL_ACCESS_ROLES` hardcodeado | Misma lógica en dos lugares (type + array) | ⚠️ BAJA |
| Firebase y Stripe en package.json sin usar | Inflan bundle, posibles vulnerabilidades | ⚠️ BAJA |

---

## 17. Decisiones obligatorias (no negociables)

| Decisión | Por qué es obligatoria |
|----------|----------------------|
| Service role NUNCA en frontend | Si se filtra, la DB queda expuesta |
| RLS SIEMPRE habilitado | Sin RLS, cualquier usuario ve todo |
| Edge Functions para envío de emails | SMTP creds no pueden estar en frontend |
| OpenAI key solo en Edge Functions | Consumo de API no controlable desde frontend |
| JWT validation manual en EFs públicas | Sin validación = endpoint público sin auth |

---

## 18. Decisiones opcionales (mejoras)

| Decisión | Beneficio |
|----------|----------|
| Migrar roles a tabla `roles` (ya están, pero `UserRole` type es hardcodeado) | Roles dinámicos sin cambios de código |
| Mover `GLOBAL_ACCESS_ROLES` a BD (columna `is_global` en `roles`) | Configurable por org |
| Agregar columna `is_admin` en `roles` para `requireAnyAdmin` | No depender de prefijo "admin." |
| Implementar refresh de permisos sin re-login | Cambios de matriz se aplican inmediatamente |
| Unificar tablas de auditoría en una sola con `domain` | Simplifica consultas cross-domain |