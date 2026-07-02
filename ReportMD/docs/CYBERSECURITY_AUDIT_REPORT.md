# REPORTE 4: CIBERSEGURIDAD
## Suite OLO / App Hub Manager — Auditoría Técnica

**Fecha**: 2026-06-30

---

## 1. AUTENTICACIÓN (AUTH)

| Riesgo | Severidad | Archivo/Zona | Descripción | Impacto | Corrección |
|--------|-----------|-------------|-------------|---------|------------|
| Token expirado no manejado en todas las Edge Functions | **ALTO** | `supabase/functions/smtp-send/index.ts` | smtp-send NO valida JWT — recibe Authorization header pero no se ve llamada a `supabase.auth.getUser(token)`. Cualquier request con cualquier bearer token es aceptado. | Un atacante podría enviar correos falsos si conoce la URL de la EF | Validar JWT explícitamente con `supabase.auth.getUser(token)` |
| Anon key expuesta en .env | **MEDIO** | `.env` | `VITE_PUBLIC_SUPABASE_ANON_KEY` es pública por diseño (cliente-side), pero confirma que el acceso anónimo está habilitado | Acceso a datos públicos si RLS no está bien configurado | ✅ Diseño correcto de Supabase — la anon key DEBE ser pública |
| Publishable key expuesta | **BAJO** | `.env` | `VITE_SUPABASE_PUBLISHABLE_KEY` también es pública | Igual que anon key | ✅ Por diseño |
| Service role key NO expuesta | **OK** | `.env` revisado | No se encontró `SUPABASE_SERVICE_ROLE_KEY` en .env | N/A | ✅ Buenas prácticas |
| Google OAuth redirect sin state validation | **MEDIO** | `src/contexts/AuthContext.tsx` | `redirectTo: window.location.origin + basePath` — no incluye state parameter anti-CSRF | CSRF en OAuth flow | Agregar state parameter generado aleatoriamente |
| Session storage en localStorage | **BAJO** | `src/lib/supabase.ts` | Tokens JWT se persisten en localStorage | Robo de token si hay XSS | Supabase SDK maneja esto. Para mayor seguridad, usar cookies httpOnly |
| Sin MFA | **ALTO** | No implementado | No hay segundo factor de autenticación | Cuentas admin vulnerables a phishing/credenciales robadas | Habilitar MFA en Supabase Auth |

---

## 2. SESSION HANDLING

| Riesgo | Severidad | Archivo/Zona | Descripción | Impacto | Corrección |
|--------|-----------|-------------|-------------|---------|------------|
| clearCorruptedSession borra TODO localStorage | **MEDIO** | `src/contexts/AuthContext.tsx:64-75` | Borra todas las keys que empiezan con `sb-` o contienen `supabase` del localStorage | Podría borrar datos de otras apps en el mismo dominio | Usar keys más específicas |
| SessionExpiredModal usa window.location.replace | **BAJO** | `src/components/feature/SessionExpiredModal.tsx:12` | Redirige con replace en vez de navigate | Funciona pero rompe SPA navigation | Usar `useNavigate` consistente |
| onAuthStateChange callback síncrono | **OK** | `src/contexts/AuthContext.tsx` | El callback NO es async — ✅ buena práctica | N/A | ✅ Correcto |
| Token refresh en emailTrigger | **MEDIO** | `src/services/emailTriggerService.ts` | `getValidSupabaseToken()` intenta refresh, pero si falla silenciosamente los correos nunca se envían | Correos perdidos sin alerta | Agregar log de error + mecanismo de reintento |

---

## 3. RLS (ROW LEVEL SECURITY)

| Riesgo | Severidad | Archivo/Zona | Descripción | Impacto | Corrección |
|--------|-----------|-------------|-------------|---------|------------|
| RLS no verificado en todas las tablas | **CRÍTICO** | Supabase DB | No se auditó la configuración RLS de las ~60 tablas. Si alguna tabla no tiene RLS habilitado (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`), los datos son públicos | Exposición de datos sensibles | Auditoría completa de RLS por tabla |
| Políticas RLS posiblemente demasiado permisivas | **ALTO** | Supabase DB - `reservations`, `user_warehouse_access` | Código usa service role en Edge Functions para bypassear RLS, pero si hay políticas `USING (true)` en tablas sensibles | Cualquier usuario autenticado podría leer datos de otras orgs | Revisar políticas RLS una por una |
| `user_warehouse_access` usado como fuente de verdad en frontend | **ALTO** | `src/hooks/useUserScope.ts`, `src/contexts/ActiveWarehouseContext.tsx` | La segregación de datos depende de queries a `user_warehouse_access` que son filtradas por RLS. Si RLS falla, la segregación falla | Usuarios podrían ver datos de warehouses no autorizados | Agregar validación server-side en cada Edge Function |
| RPC `get_pending_reservations_v4` | **MEDIO** | `src/services/casetillaService.ts` | Usa RPC que ejecuta con permisos del invocador. Si la función SQL no tiene `SECURITY DEFINER`, usa los permisos RLS del usuario | Podría devolver más o menos datos de los esperados | Verificar definición SQL de la función |

---

## 4. RBAC (CONTROL DE ACCESO BASADO EN ROLES)

| Riesgo | Severidad | Archivo/Zona | Descripción | Impacto | Corrección |
|--------|-----------|-------------|-------------|---------|------------|
| Permisos solo validados en frontend | **ALTO** | `src/router/RequirePermission.tsx` | `canLocal()` solo verifica el Set en memoria. Si un usuario modificara el state de React (DevTools), podría saltarse RequirePermission | Acceso a páginas no autorizadas (aunque las queries RLS igual bloquearían datos) | Validación server-side de permisos en cada Edge Function |
| Permisos cacheados en memoria | **MEDIO** | `src/contexts/AuthContext.tsx` | Los permisos se cargan una vez al iniciar sesión. Cambios en matriz de permisos requieren re-login | Admin quita permiso pero usuario lo mantiene hasta que cierra sesión | Invalidación de caché de permisos vía realtime o polling |
| `requireAnyAdmin` demasiado amplio | **MEDIO** | `src/router/RequirePermission.tsx:55` | Cualquier permiso que empiece con `admin.` da acceso | Un rol con solo `admin.audit.view` podría acceder a `/admin` | Lista explícita de permisos mínimos para panel admin |
| Roles GLOBAL_ACCESS quemados | **MEDIO** | `src/hooks/useUserScope.ts:17` | ADMIN, SUPERVISOR, Full Access hardcodeados | Si se crea un rol nuevo que debería ser global, no funciona | Campo `is_global_access` en tabla roles |

---

## 5. EDGE FUNCTIONS

| Riesgo | Severidad | Archivo/Zona | Descripción | Impacto | Corrección |
|--------|-----------|-------------|-------------|---------|------------|
| `smtp-send` sin validación JWT | **CRÍTICO** | `supabase/functions/smtp-send/index.ts` | No se ve `supabase.auth.getUser(token)`. La función acepta cualquier POST con body JSON y envía correos | Spam masivo, uso no autorizado del servidor SMTP | Agregar validación JWT explícita |
| `admin-users` usa service role para todo | **ALTO** | `supabase/functions/admin-users/index.ts` | No valida JWT del usuario que invoca — confía en que el frontend ya validó permisos. Cualquier usuario autenticado con el endpoint podría potencialmente crear/listar usuarios | Escalación de privilegios | Validar permisos del usuario invocador (mínimo `admin.users.*`) |
| `generate-client-pickup-blocks` acepta requests sin JWT | **MEDIO** | `supabase/functions/generate-client-pickup-blocks/index.ts` | Si no hay JWT, usa SYSTEM_USER_ID. Esto permite que cualquier persona que conozca la URL genere bloques | Denegación de servicio (muchos bloques) | Rate limiting o requerir JWT siempre |
| `gmail-callback` público sin rate limiting | **MEDIO** | `supabase/functions/gmail-callback/index.ts` | Callback OAuth público. Sin rate limiting, podría recibir muchas requests | Denegación de servicio | Rate limit por IP |
| CORS headers: `*` | **MEDIO** | Todas las Edge Functions | `Access-Control-Allow-Origin: *` permite requests de cualquier origen | CSRF desde cualquier dominio | Restringir a orígenes conocidos |
| `auto-mark-no-show` modo cron usa service key como secret | **BAJO** | `supabase/functions/auto-mark-no-show/index.ts` | `X-Internal-Cron-Secret === supabaseServiceKey` — seguro siempre que la key no se filtre | Si un atacante obtiene la service key, puede ejecutar la función | Rotación periódica de service key |

---

## 6. STORAGE

| Riesgo | Severidad | Archivo/Zona | Descripción | Impacto | Corrección |
|--------|-----------|-------------|-------------|---------|------------|
| Bucket reservation-files posiblemente público | **ALTO** | `src/services/calendarService.ts` | `getPublicUrl(path)` se usa para archivos de reserva. Si el bucket es público, cualquier URL predecible expone documentos | Documentos de clientes expuestos | Usar signed URLs con tiempo limitado |
| Bucket reservation-qrs público | **BAJO** | `src/services/calendarService.ts` | QR y fichas de cita son públicos. Contienen datos de reserva (proveedor, horario, andén) | Información operativa expuesta si se adivina el ID | OK para el caso de uso (casetilla escanea QR), pero considerar signed URLs |
| Fotos de casetilla en bucket no especificado | **ALTO** | `src/services/casetillaService.ts` | `fotos` se guardan como array de strings (¿URLs?) en `casetilla_ingresos` y `casetilla_salidas` | Si son URLs públicas, fotos de documentos/choferes expuestas | Verificar bucket y políticas de acceso |
| Sin validación de tipo MIME en uploads | **MEDIO** | `src/services/calendarService.ts` | `uploadReservationFile` sube cualquier archivo | Posible upload de malware | Validar MIME types permitidos |

---

## 7. XSS / INYECCIÓN

| Riesgo | Severidad | Archivo/Zona | Descripción | Impacto | Corrección |
|--------|-----------|-------------|-------------|---------|------------|
| React escapa por defecto | **OK** | JSX en general | React escapa automáticamente el output en JSX | N/A | ✅ |
| `dangerouslySetInnerHTML` | **BAJO** | Posible en correspondencia (body_template HTML) | Templates de correo con HTML | XSS en emails (menos crítico que en web) | Sanitizar HTML antes de enviar |
| OpenAI response sin sanitización | **MEDIO** | `supabase/functions/ask-sro-chat/index.ts` | `answer` se devuelve como string plano y React lo escapa | OK si se renderiza con JSX | ✅ |
| `descriptionHtml` de Shopify | N/A | No se usa | N/A | N/A | N/A |

---

## 8. CSRF / OPEN REDIRECT

| Riesgo | Severidad | Archivo/Zona | Descripción | Impacto | Corrección |
|--------|-----------|-------------|-------------|---------|------------|
| OAuth redirect sin state CSRF | **MEDIO** | `src/contexts/AuthContext.tsx:loginWithGoogle` | `redirectTo` no incluye state parameter | Ataque CSRF en OAuth | Agregar state + cookie |
| `returnUrl` en ProtectedRoute | **MEDIO** | `src/router/ProtectedRoute.tsx:26` | `location.pathname + location.search` se pasa como state a /login | Open redirect si un atacante manipula la URL | Validar que returnUrl sea una ruta interna |
| Gmail callback redirect | **BAJO** | `supabase/functions/gmail-callback/index.ts` | `state.redirectUrl` se usa directamente en Response.redirect | Open redirect si state es manipulado | Validar que redirectUrl sea del mismo origen |

---

## 9. EXPOSICIÓN DE SECRETOS

| Riesgo | Severidad | Archivo/Zona | Descripción | Impacto | Corrección |
|--------|-----------|-------------|-------------|---------|------------|
| `.env` contiene todas las keys | **BAJO** | `.env` | `VITE_PUBLIC_*` son públicas por diseño. No se ve service key | N/A | ✅ |
| Supabase anon JWT en .env | **BAJO** | `.env` línea `VITE_SUPABASE_FUNCTIONS_ANON_JWT` | JWT anon embebido — es público por diseño | Bajo | ✅ |
| Sin secrets en código frontend | **OK** | Verificado | No se encontraron API keys hardcodeadas en el código | N/A | ✅ |
| `OPENAI_API_KEY` en secrets de Supabase | **OK** | `supabase/functions/ask-sro-chat/index.ts` | `Deno.env.get("OPENAI_API_KEY")` — ✅ | N/A | ✅ |
| `SMTP_USER`, `SMTP_PASS` en secrets | **OK** | `supabase/functions/smtp-send/index.ts` | `Deno.env.get(...)` — ✅ | N/A | ✅ |

---

## 10. CSP (Content Security Policy)

| Riesgo | Severidad | Archivo/Zona | Descripción | Impacto | Corrección |
|--------|-----------|-------------|-------------|---------|------------|
| **Sin CSP configurado** | **ALTO** | `index.html` | No hay header CSP ni meta tag CSP. El sitio es vulnerable a XSS sin mitigación de CSP | XSS podría ejecutar scripts maliciosos | Agregar CSP en index.html o en headers del servidor |
| Google Fonts CDN | **BAJO** | `index.html` | Carga de fuentes desde CDN externo sin SRI (Subresource Integrity) | Si CDN es comprometido, podría inyectar CSS malicioso | Agregar SRI hash a los links |

---

## 11. DEPENDENCIAS NPM

| Riesgo | Severidad | Dependencia | Descripción | Corrección |
|--------|-----------|-------------|-------------|------------|
| `firebase` no usado | **BAJO** | `package.json` | Firebase 12.0.0 está instalado pero no se ve uso en el código | Eliminar dependencia innecesaria |
| `@stripe/react-stripe-js` no usado | **BAJO** | `package.json` | Stripe está instalado pero no se ve uso | Eliminar dependencia innecesaria |
| `@supabase/supabase-js` 2.57.4 | **OK** | `package.json` | Versión relativamente reciente | Mantener actualizado |

---

## 12. AUDITORÍA Y LOGS

| Riesgo | Severidad | Descripción | Corrección |
|--------|-----------|-------------|------------|
| Logs de actividad sin retención definida | **MEDIO** | `activity_log`, `admin_audit_log` no tienen política de purga automática | Agregar job de limpieza |
| Logs de chat sin retención | **BAJO** | `chat_audit_logs` acumula indefinidamente | Definir TTL |
| No hay alertas de seguridad | **ALTO** | No hay monitoreo de intentos fallidos de login, cambios de rol, etc. | Implementar alertas |

---

## 13. MANEJO DE ERRORES

| Riesgo | Severidad | Descripción | Corrección |
|--------|-----------|-------------|------------|
| Errores silenciosos en emailTrigger | **ALTO** | `emailTriggerService` tiene bloques catch que solo loguean y retornan. Los correos fallan sin alerta | Notificar al usuario o admin |
| Errores de RLS mostrados como "sin datos" | **MEDIO** | Cuando RLS bloquea una query, el frontend interpreta array vacío como "sin datos" en vez de "sin permisos" | Diferenciar error de permiso vs sin datos |
| Error 406 en update sin manejo | **OK** | `calendarService.updateReservation` ya separa UPDATE y SELECT para evitar 406 | ✅ |

---

## RESUMEN: TOP RIESGOS DE CIBERSEGURIDAD

1. **CRÍTICO**: `smtp-send` Edge Function sin validación JWT — cualquiera puede enviar correos
2. **CRÍTICO**: RLS no auditado en todas las tablas — posible exposición de datos
3. **ALTO**: Permisos validados solo en frontend — bypass posible vía DevTools
4. **ALTO**: `admin-users` Edge Function sin validación de permisos del invocador
5. **ALTO**: Sin CSP configurado — vulnerable a XSS
6. **ALTO**: Sin MFA — cuentas admin vulnerables
7. **ALTO**: Storage buckets posiblemente públicos con documentos sensibles
8. **ALTO**: Sin alertas de seguridad ni monitoreo
9. **MEDIO**: Errores de email silenciosos — correos perdidos sin notificación
10. **MEDIO**: CORS `*` en todas las Edge Functions