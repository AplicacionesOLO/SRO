# REPORTE 5: EDGE FUNCTIONS Y JWT VERIFY OFF
## Suite OLO / App Hub Manager — Auditoría Técnica

**Fecha**: 2026-06-30

---

## 1. ¿QUÉ HACE JWT VERIFICATION AUTOMÁTICO DE SUPABASE?

Cuando desplegás una Edge Function en Supabase **con** `--verify-jwt` (default ON), el gateway de Supabase **automáticamente**:

1. Extrae el token JWT del header `Authorization: Bearer <token>`
2. Verifica la firma del token usando las claves públicas de Supabase
3. Verifica que el token no haya expirado
4. Inyecta el payload del JWT en el header `x-supabase-auth` (o similar) que llega a tu función
5. Si el token es inválido, **rechaza la request ANTES de que llegue a tu código** (retorna 401)

**Ventaja**: No tenés que escribir código de validación. Seguridad automática.

**Desventaja**: No podés usar otros métodos de auth (API keys, service role, etc.) para acceder a la función.

---

## 2. ¿POR QUÉ EN ESTE SISTEMA LAS EDGE FUNCTIONS SE DESPLIEGAN CON `--no-verify-jwt`?

Porque **todas** las Edge Functions de este sistema usan `SUPABASE_SERVICE_ROLE_KEY` para crear el cliente de Supabase **dentro** de la función, lo que les permite:

- **Bypassear RLS**: Leer/escribir tablas sin las restricciones de Row Level Security
- **Usar auth.admin**: Crear usuarios, listar todos los usuarios del proyecto (no solo los de una org)
- **Leer secrets**: Acceder a `Deno.env.get("OPENAI_API_KEY")`, `SMTP_PASS`, etc.
- **Operar cross-org**: Algunas funciones necesitan consultar datos de múltiples organizaciones

Si las funciones se desplegaran **con** `--verify-jwt`, el gateway de Supabase:
- Rechazaría requests que no tengan un JWT de usuario válido (como llamadas desde pg_cron o webhooks)
- Inyectaría el usuario autenticado, pero la función igual crea su propio cliente con service role → inconsistencia

---

## 3. POR QUÉ USAN `SUPABASE_SERVICE_ROLE_KEY`

| Propósito | Con anon key | Con service role key |
|-----------|-------------|---------------------|
| Respetar RLS | ✅ Sí | ❌ No (bypass) |
| `auth.admin.listUsers()` | ❌ No permitido | ✅ Sí |
| `auth.admin.createUser()` | ❌ No permitido | ✅ Sí |
| Leer todas las orgs | ❌ Limitado por RLS | ✅ Sí |
| Modificar cualquier tabla | ❌ Limitado por RLS | ✅ Sí |

Las funciones como `admin-users`, `admin-user-access`, `ask-sro-chat` **necesitan** el service role para:
- `admin-users`: crear usuarios en auth y asignarles roles (operaciones entre auth y public schema)
- `admin-user-access`: modificar `user_warehouse_access` y `user_country_access` de cualquier usuario
- `ask-sro-chat`: leer documentos de conocimiento de la org (que pueden requerir bypass de RLS)
- `auto-mark-no-show`: modo cron que se ejecuta sin usuario
- `generate-client-pickup-blocks`: insertar bloques de tiempo como SYSTEM_USER

---

## 4. POR QUÉ EL SERVICE ROLE NO DEBE ESTAR EN EL FRONTEND

**REGLA DE ORO**: `SUPABASE_SERVICE_ROLE_KEY` **NUNCA** debe estar en código frontend, `.env` público, o cualquier lugar accesible desde el navegador.

Razones:
1. El service role key tiene **acceso total** a la base de datos (bypass RLS, delete, truncate)
2. Si un atacante obtiene esta key, puede borrar/robar todos los datos
3. Las variables `VITE_*` en Vite se incluyen en el bundle de frontend y son visibles en el navegador

✅ **El sistema cumple**: No se encontró `SUPABASE_SERVICE_ROLE_KEY` en `.env` ni en código frontend. Solo se usa en Edge Functions vía `Deno.env.get(...)`.

---

## 5. RIESGO SI SE DESPLIEGAN CON `--verify-jwt` ON

| Función | Qué pasaría |
|---------|------------|
| `admin-users` | ❌ No podría usar `auth.admin.*` porque el cliente se crearía con el JWT del usuario |
| `admin-user-access` | ❌ No podría modificar `user_warehouse_access` de otros usuarios (RLS bloquearía) |
| `auto-mark-no-show` | ❌ Modo cron (sin JWT) fallaría con 401 |
| `gmail-callback` | ❌ Callback OAuth no tiene JWT de usuario → 401 |
| `generate-client-pickup-blocks` | ❌ Sin JWT → 401. Con JWT de usuario normal → permisos insuficientes |
| `smtp-send` | ⚠️ Funcionaría con JWT de usuario, pero necesitaría permisos RLS para `correspondence_outbox` |
| `ask-sro-chat` | ⚠️ Funcionaría pero no podría leer documentos de otras orgs |
| `create-reservation` | ⚠️ Funcionaría pero la validación same-day cutoff usa service role |

**Conclusión**: Desplegar con `--verify-jwt` ON **rompería** al menos 5 funciones críticas.

---

## 6. RIESGO SI SE DESPLIEGAN CON `--no-verify-jwt` PERO SIN VALIDACIÓN MANUAL

| Función | Validación manual JWT | Riesgo si falta |
|---------|----------------------|-----------------|
| `create-reservation` | ✅ `supabase.auth.getUser(token)` | Sin esto: cualquiera puede crear reservas |
| `admin-users` | ❌ **NO VALIDA JWT** | **CRÍTICO**: Cualquiera puede crear/listar/eliminar usuarios |
| `admin-user-access` | ✅ `supabase.auth.getUser()` con JWT del header | ✅ Seguro |
| `ask-sro-chat` | ✅ `supabase.auth.getUser(token)` | Sin esto: cualquiera puede usar OpenAI a costa del dueño |
| `smtp-send` | ❌ **NO VALIDA JWT** | **CRÍTICO**: Cualquiera puede enviar correos |
| `correspondence-dispatch-event` | ✅ `supabase.auth.getUser(jwt)` | ✅ Seguro |
| `auto-mark-no-show` | ✅ Modo usuario: JWT. Modo cron: secret interno | ✅ Seguro |
| `generate-client-pickup-blocks` | ⚠️ Si no hay JWT, usa SYSTEM_USER | Medio riesgo |
| `gmail-callback` | N/A (callback OAuth público) | ✅ Correcto |

**HALLAZGO CRÍTICO**: Dos funciones (`admin-users`, `smtp-send`) no validan el JWT del invocador a pesar de estar desplegadas con `--no-verify-jwt`. Esto significa que:

- **`admin-users`**: Cualquier persona que conozca la URL de la Edge Function puede crear usuarios, listar todos los usuarios del sistema, y modificar roles.
- **`smtp-send`**: Cualquier persona que conozca la URL puede enviar correos arbitrarios desde la cuenta SMTP configurada.

---

## 7. VALIDACIONES MÍNIMAS QUE DEBE TENER CADA EDGE FUNCTION

Toda Edge Function con `--no-verify-jwt` DEBE incluir **al menos**:

```typescript
// 1. Validar que el header Authorization existe
const authHeader = req.headers.get('Authorization');
if (!authHeader || !authHeader.startsWith('Bearer ')) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
}

// 2. Validar el token con Supabase
const token = authHeader.replace('Bearer ', '');
const supabaseAuth = createClient(supabaseUrl, anonKey); // NOT service role
const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
if (error || !user) {
  return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 });
}

// 3. Validar permisos del usuario (org, role, etc.)
const { data: uor } = await supabaseAdmin
  .from('user_org_roles')
  .select('org_id, role_id')
  .eq('user_id', user.id)
  .maybeSingle();
if (!uor) {
  return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
}

// 4. Validar permisos específicos para la acción
// Ej: para admin-users, verificar que user tiene admin.users.*
```

---

## 8. HEADERS QUE DEBEN RECIBIR

| Header | Requerido | Propósito |
|--------|-----------|-----------|
| `Authorization: Bearer <jwt>` | ✅ Sí | Token JWT del usuario autenticado |
| `apikey: <anon_key>` | ✅ Sí | Supabase requiere este header para Edge Functions |
| `Content-Type: application/json` | ✅ Sí | Para parsear el body |
| `X-Internal-Cron-Secret` | ⚠️ Solo cron | Para `auto-mark-no-show` en modo pg_cron |

---

## 9. ERRORES QUE DEBEN DEVOLVER

| Caso | Status | Body |
|------|--------|------|
| Sin Authorization header | 401 | `{ "error": "Missing Authorization header" }` |
| Token inválido o expirado | 401 | `{ "error": "Invalid or expired token" }` |
| Usuario no pertenece a la org | 403 | `{ "error": "User does not belong to this organization" }` |
| Permisos insuficientes | 403 | `{ "error": "Insufficient permissions" }` |
| Body mal formado | 400 | `{ "error": "Invalid request body" }` |

---

## 10. PRUEBAS CURL PARA VERIFICAR

### 10.1 Verificar que una función RECHAZA requests sin JWT

```bash
curl -X POST https://xypbohvarofufrdkfeaj.supabase.co/functions/v1/admin-users \
  -H "Content-Type: application/json" \
  -H "apikey: sb_publishable_FGi-YziQ6se1k5E8QeHJJw_e3_1jbBZ" \
  -d '{"action":"list","orgId":"<org-uuid>"}'
```

**Esperado**: 401 Unauthorized
**Realidad actual (admin-users)**: Probablemente 200 con datos — **VULNERABILIDAD**

### 10.2 Verificar que smtp-send RECHAZA requests sin JWT

```bash
curl -X POST https://xypbohvarofufrdkfeaj.supabase.co/functions/v1/smtp-send \
  -H "Content-Type: application/json" \
  -d '{"to_emails":["test@test.com"],"subject":"Test","body":"Test"}'
```

**Esperado**: 401 Unauthorized
**Realidad actual (smtp-send)**: Probablemente 200 e intenta enviar — **VULNERABILIDAD**

### 10.3 Verificar que create-reservation SÍ valida JWT

```bash
curl -X POST https://xypbohvarofufrdkfeaj.supabase.co/functions/v1/create-reservation \
  -H "Content-Type: application/json" \
  -H "apikey: sb_publishable_FGi-YziQ6se1k5E8QeHJJw_e3_1jbBZ" \
  -d '{"org_id":"<uuid>","dock_id":"<uuid>","start_datetime":"..."}'
```

**Esperado**: 401 (sin Bearer token)
**Realidad**: ✅ Debería retornar 401

---

## 11. RESUMEN: `--no-verify-jwt` NO SIGNIFICA "SIN SEGURIDAD"

| Significa | NO significa |
|-----------|-------------|
| "Yo valido el JWT manualmente dentro de mi código" | "Cualquiera puede llamar a esta función" |
| "Necesito service role para operaciones privilegiadas" | "No necesito autenticación" |
| "El gateway no rechaza requests sin JWT, pero mi código sí" | "La seguridad es opcional" |

**Las funciones que NO validan JWT manualmente son vulnerables**,
independientemente de si están desplegadas con `--verify-jwt` o `--no-verify-jwt`.

---

## 12. PLAN DE REMEDIACIÓN PARA `admin-users` Y `smtp-send`

### admin-users
```typescript
// AGREGAR al inicio de serve():
const authHeader = req.headers.get('Authorization');
if (!authHeader?.startsWith('Bearer ')) {
  return json({ error: 'Unauthorized - missing token' }, 401);
}

const token = authHeader.replace('Bearer ', '');
const supabaseAuth = createClient(supabaseUrl, anonKey);
const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
if (authError || !user) {
  return json({ error: 'Unauthorized - invalid token' }, 401);
}

// Verificar que el usuario tiene permisos admin
const { data: perms } = await supabaseAdmin
  .from('role_permissions')
  .select('permissions!inner(name)')
  .eq('role_id', '(select role_id from user_org_roles where user_id = ${user.id})');
// ... validar que tiene admin.users.*
```

### smtp-send
```typescript
// AGREGAR al inicio de serve():
const authHeader = req.headers.get('Authorization');
if (!authHeader?.startsWith('Bearer ')) {
  return json(401, { error: 'Unauthorized' });
}
const token = authHeader.replace('Bearer ', '');
const { data: { user }, error: authError } = await supabase.auth.getUser(token);
if (authError || !user) {
  return json(401, { error: 'Invalid token' });
}
```