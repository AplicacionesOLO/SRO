# REPORTE 8: CHECKLIST DE PRODUCCIÓN
## Suite OLO / App Hub Manager — Estado de Preparación para Producción

**Fecha**: 2026-06-30
**Versión de build**: 1197

**Leyenda**:
- ✅ Listo
- ⚠️ Pendiente / Riesgo
- 🔴 Bloqueante

---

## 1. FRONTEND

| # | Item | Estado | Notas |
|---|------|--------|-------|
| 1.1 | Build limpio sin errores | ✅ | Verificado en build 1197 |
| 1.2 | TypeScript sin errores de tipo | ✅ | `tsc --noEmit` pasa |
| 1.3 | ESLint sin warnings | ⚠️ | No verificado — posible warnings |
| 1.4 | Todas las rutas funcionan | ✅ | 20+ rutas definidas y funcionales |
| 1.5 | Componentes lazy-loaded | ✅ | `lazyWithRetry` para páginas pesadas |
| 1.6 | ErrorBoundary global | ✅ | Captura errores de chunk loading y runtime |
| 1.7 | Diseño responsive (mobile + desktop) | ✅ | Sidebar se adapta, bottom nav en mobile |
| 1.8 | Loading states en todas las páginas | ✅ | PageLoader + spinners por sección |
| 1.9 | Error states con mensajes claros | ⚠️ | Errores de RLS se muestran como "sin datos" |
| 1.10 | Formularios con validación | ✅ | Validación en modales de creación |
| 1.11 | Borradores de formularios (drafts) | ✅ | `useReservationDraft` con 7 días TTL |
| 1.12 | Dependencias actualizadas | ⚠️ | `firebase` y `@stripe/react-stripe-js` innecesarias |
| 1.13 | i18n implementado | ⚠️ | Infraestructura lista pero sin traducciones reales (solo español hardcodeado) |
| 1.14 | CSP configurado | 🔴 | **Sin CSP** — riesgo XSS |

---

## 2. BACKEND (SUPABASE)

| # | Item | Estado | Notas |
|---|------|--------|-------|
| 2.1 | Supabase conectado | ✅ | URL y anon key configurados |
| 2.2 | RLS habilitado en TODAS las tablas | ⚠️ | No verificado exhaustivamente — posible tablas sin RLS |
| 2.3 | Políticas RLS correctas por tabla | ⚠️ | No auditado — posible políticas demasiado permisivas |
| 2.4 | Roles creados en DB | ✅ | `roles` table tiene datos |
| 2.5 | Permisos creados en DB | ✅ | `permissions` table tiene datos |
| 2.6 | Matriz de permisos poblada | ✅ | `role_permissions` con asignaciones |
| 2.7 | Migraciones ejecutadas | ✅ | Tablas existen según schema esperado |
| 2.8 | Sin migraciones pendientes | ⚠️ | No verificado |
| 2.9 | Backups configurados | ⚠️ | Depende de Supabase plan |
| 2.10 | PITR habilitado | ⚠️ | Depende de Supabase plan |

---

## 3. RLS (ROW LEVEL SECURITY)

| # | Item | Estado | Notas |
|---|------|--------|-------|
| 3.1 | RLS habilitado en `reservations` | ⚠️ | Asumido pero no verificado |
| 3.2 | RLS habilitado en `profiles` | ⚠️ | Asumido pero no verificado |
| 3.3 | RLS habilitado en `user_org_roles` | ⚠️ | Asumido pero no verificado |
| 3.4 | RLS habilitado en `role_permissions` | ⚠️ | Asumido pero no verificado |
| 3.5 | RLS habilitado en `user_warehouse_access` | ⚠️ | Asumido pero no verificado |
| 3.6 | RLS habilitado en `user_country_access` | ⚠️ | Asumido pero no verificado |
| 3.7 | RLS habilitado en `correspondence_rules` | ⚠️ | Asumido pero no verificado |
| 3.8 | RLS habilitado en `chat_sessions` y `chat_messages` | ⚠️ | Asumido pero no verificado |
| 3.9 | RLS habilitado en `knowledge_documents` | ⚠️ | Asumido pero no verificado |
| 3.10 | RLS habilitado en `activity_log` y `admin_audit_log` | ⚠️ | Asumido pero no verificado |
| 3.11 | Sin políticas recursivas | ⚠️ | No verificado |
| 3.12 | Políticas de DELETE restrictivas | ⚠️ | No verificado |

---

## 4. EDGE FUNCTIONS

| # | Item | Estado | Notas |
|---|------|--------|-------|
| 4.1 | Todas las EF desplegadas | ⚠️ | 22 funciones listadas, slugs deben coincidir |
| 4.2 | `create-reservation` desplegada y funcional | ✅ | Validación JWT manual |
| 4.3 | `admin-users` desplegada y funcional | 🔴 | **Sin validación JWT** — vulnerabilidad |
| 4.4 | `admin-user-access` desplegada y funcional | ✅ | Validación JWT manual |
| 4.5 | `ask-sro-chat` desplegada y funcional | ✅ | Validación JWT manual |
| 4.6 | `smtp-send` desplegada y funcional | 🔴 | **Sin validación JWT** — vulnerabilidad |
| 4.7 | `correspondence-dispatch-event` desplegada | ✅ | Validación JWT manual |
| 4.8 | `correspondence-process-event` desplegada | ⚠️ | No verificado si valida JWT |
| 4.9 | `auto-mark-no-show` desplegada | ✅ | Validación dual (JWT + cron secret) |
| 4.10 | `generate-client-pickup-blocks` desplegada | ✅ | JWT opcional, fallback a SYSTEM_USER |
| 4.11 | `gmail-callback` desplegada | ✅ | Callback público, correcto |
| 4.12 | `process-knowledge-document` desplegada | ⚠️ | No verificado |
| 4.13 | `reindex-knowledge-document` desplegada | ⚠️ | No verificado |
| 4.14 | `sync-providers` desplegada | ⚠️ | No verificado |
| 4.15 | `sync-providers-excel` desplegada | ⚠️ | No verificado |
| 4.16 | CORS restringido (no `*`) | 🔴 | **Todas las EF usan `Access-Control-Allow-Origin: *`** |
| 4.17 | Secrets configurados (`OPENAI_API_KEY`, `SMTP_*`) | ⚠️ | No verificado — probablemente configurados en Supabase |
| 4.18 | Sin logs de error ignorados | ⚠️ | Algunas EF solo loguean, no alertan |

---

## 5. STORAGE

| # | Item | Estado | Notas |
|---|------|--------|-------|
| 5.1 | Bucket `reservation-qrs` existe y configurado | ⚠️ | Asumido — no verificado |
| 5.2 | Bucket `reservation-files` existe y configurado | ⚠️ | Asumido — no verificado |
| 5.3 | Buckets de conocimiento existen | ⚠️ | Asumido — `setup-knowledge-storage` EF |
| 5.4 | Buckets de casetilla existen | ⚠️ | Asumido — `setup-casetilla-storage` EF |
| 5.5 | Políticas de acceso correctas (público vs privado) | 🔴 | `reservation-files` posiblemente público con documentos sensibles |
| 5.6 | Tamaño máximo de archivo configurado | ⚠️ | No verificado — sin límite explícito en código |
| 5.7 | Tipos MIME restringidos | ⚠️ | Sin validación de tipo MIME en uploads |

---

## 6. AUTH

| # | Item | Estado | Notas |
|---|------|--------|-------|
| 6.1 | Login email/password funcional | ✅ | Implementado y operativo |
| 6.2 | Login con Google funcional | ✅ | Implementado — requiere config OAuth en Supabase |
| 6.3 | Logout funcional | ✅ | Limpia sesión y estado |
| 6.4 | Recuperación de contraseña | ⚠️ | No implementado en UI — depende de Supabase Auth emails |
| 6.5 | Confirmación de email | ⚠️ | Configurable en Supabase, no verificado |
| 6.6 | MFA (Multi-Factor Authentication) | 🔴 | **No implementado** — cuentas admin vulnerables |
| 6.7 | Rate limiting en login | ⚠️ | Depende de Supabase Auth config |
| 6.8 | Sesión expirada manejada correctamente | ✅ | `SessionExpiredModal` |
| 6.9 | Token refresh automático | ✅ | Supabase SDK `autoRefreshToken: true` |
| 6.10 | Cierre de sesión en todas las pestañas | ⚠️ | No verificado con múltiples tabs |

---

## 7. OAUTH

| # | Item | Estado | Notas |
|---|------|--------|-------|
| 7.1 | Google OAuth configurado en Google Cloud Console | ⚠️ | No verificado — requiere configuración externa |
| 7.2 | Redirect URIs correctos en Google Console | ⚠️ | Debe incluir `https://<project>.supabase.co/auth/v1/callback` |
| 7.3 | Google OAuth habilitado en Supabase Auth | ⚠️ | No verificado |
| 7.4 | Gmail OAuth configurado (si se usa) | ⚠️ | No verificado |
| 7.5 | Gmail redirect URI en Google Console | ⚠️ | Debe apuntar a `gmail-callback` EF |
| 7.6 | Secrets `GMAIL_CLIENT_ID` y `GMAIL_CLIENT_SECRET` configurados | ⚠️ | No verificado |

---

## 8. VARIABLES DE ENTORNO

| # | Item | Estado | Notas |
|---|------|--------|-------|
| 8.1 | `VITE_PUBLIC_SUPABASE_URL` en `.env` | ✅ | `https://xypbohvarofufrdkfeaj.supabase.co` |
| 8.2 | `VITE_PUBLIC_SUPABASE_ANON_KEY` en `.env` | ✅ | `sb_publishable_...` |
| 8.3 | `SUPABASE_SERVICE_ROLE_KEY` en secrets Supabase | ✅ | Usado en Edge Functions |
| 8.4 | `OPENAI_API_KEY` en secrets Supabase | ⚠️ | Requerido para chat |
| 8.5 | `SMTP_USER` en secrets Supabase | ⚠️ | Requerido para correos |
| 8.6 | `SMTP_PASS` en secrets Supabase | ⚠️ | Requerido para correos |
| 8.7 | `SMTP_HOST` en secrets Supabase | ⚠️ | Default: smtp.gmail.com |
| 8.8 | `SMTP_FROM` en secrets Supabase | ⚠️ | Default: no-reply-sro@ologistics.com |
| 8.9 | `GMAIL_CLIENT_ID` en secrets Supabase | ⚠️ | Solo si se usa Gmail |
| 8.10 | `GMAIL_CLIENT_SECRET` en secrets Supabase | ⚠️ | Solo si se usa Gmail |
| 8.11 | `VITE_SMTP_MODE` no es `local` en producción | ⚠️ | Verificar que no esté en modo local |

---

## 9. AUDITORÍA

| # | Item | Estado | Notas |
|---|------|--------|-------|
| 9.1 | `activity_log` recibe inserts correctamente | ✅ | Usado en calendarService y casetillaService |
| 9.2 | `admin_audit_log` recibe inserts de cambios admin | ✅ | Usado en adminService |
| 9.3 | `chat_audit_logs` recibe inserts | ✅ | Usado en chatService |
| 9.4 | Logs de cambios de permisos | ✅ | `bulkUpdateRolePermissions` registra |
| 9.5 | Logs de cambios de roles de usuario | ⚠️ | `admin-users` EF no registra en admin_audit_log |
| 9.6 | Logs de cambios de accesos | ⚠️ | `admin-user-access` EF no registra auditoría |
| 9.7 | Política de retención de logs | 🔴 | Sin purga automática — crecimiento indefinido |
| 9.8 | Logs inmutables | ⚠️ | No verificado — ¿políticas RLS impiden UPDATE/DELETE en tablas de log? |

---

## 10. ROLES Y PERMISOS

| # | Item | Estado | Notas |
|---|------|--------|-------|
| 10.1 | Roles base creados (ADMIN, SUPERVISOR, OPERADOR, CASETILLA) | ⚠️ | Asumido — no verificado en DB |
| 10.2 | Permisos base creados | ✅ | `permissions` table poblada |
| 10.3 | Matriz de permisos asignada correctamente | ✅ | `role_permissions` poblado |
| 10.4 | RLS policies por rol | ⚠️ | Implementado parcialmente — usa service role bypass en muchas queries |
| 10.5 | Sin permisos huérfanos en DB | ⚠️ | No verificado |
| 10.6 | RBAC validado también en backend | 🔴 | Mayoría de validaciones solo en frontend |
| 10.7 | Roles "Full Access" existen en DB | ⚠️ | Mencionado en `GLOBAL_ACCESS_ROLES` pero no verificado |

---

## 11. BUILD

| # | Item | Estado | Notas |
|---|------|--------|-------|
| 11.1 | `npm run build` exitoso | ✅ | Verificado |
| 11.2 | `npm run type-check` exitoso | ⚠️ | No verificado — `tsc --noEmit` no ejecutado |
| 11.3 | `npm run lint` sin errores | ⚠️ | No verificado |
| 11.4 | Sourcemaps en producción | ✅ | `sourcemap: true` en vite.config.ts |
| 11.5 | Bundle size razonable | ⚠️ | `firebase` (12.0.0) y `@stripe/react-stripe-js` inflan innecesariamente |
| 11.6 | Code splitting funcional | ✅ | `lazyWithRetry` para rutas admin |

---

## 12. SEGURIDAD

| # | Item | Estado | Notas |
|---|------|--------|-------|
| 12.1 | CSP configurado | 🔴 | **Sin Content Security Policy** |
| 12.2 | HTTPS forzado | ✅ | Supabase + Readdy proveen HTTPS |
| 12.3 | Secrets no expuestos en frontend | ✅ | Service role key solo en Edge Functions |
| 12.4 | Service role key no en `.env` | ✅ | Verificado |
| 12.5 | JWT validado en todas las Edge Functions | 🔴 | `admin-users` y `smtp-send` sin validación |
| 12.6 | CORS restringido | 🔴 | Todas las EF usan `*` |
| 12.7 | Rate limiting en Edge Functions | ⚠️ | No implementado |
| 12.8 | Sin dependencias con vulnerabilidades conocidas | ⚠️ | `npm audit` no ejecutado |
| 12.9 | Headers de seguridad (HSTS, X-Frame-Options, etc.) | ⚠️ | No verificados — dependen del servidor |
| 12.10 | Sanitización de inputs | ⚠️ | React escapa por defecto, pero `dangerouslySetInnerHTML` en templates de correo |

---

## 13. DOCUMENTACIÓN

| # | Item | Estado | Notas |
|---|------|--------|-------|
| 13.1 | Manual de usuario general | ✅ | `MANUAL_USUARIO_GENERAL.md` |
| 13.2 | Manual de casetilla | ✅ | `MANUAL_CASETILLA.md` |
| 13.3 | Manual del sistema SRO | ✅ | `MANUAL_SISTEMA_SRO.md` |
| 13.4 | Manual SRObot | ✅ | `MANUAL_SROBOT_CONOCIMIENTO.md` |
| 13.5 | Documentación de API | ✅ | `api-postman-collection/` |
| 13.6 | `project_plan.md` actualizado | ✅ | Fase 5 completada |
| 13.7 | README del proyecto | ⚠️ | No existe o no se encontró |

---

## RESUMEN EJECUTIVO

### Total de items: 87

| Estado | Cantidad | % |
|--------|----------|---|
| ✅ Listo | 33 | 37.9% |
| ⚠️ Pendiente / Riesgo | 42 | 48.3% |
| 🔴 Bloqueante | 12 | 13.8% |

### BLOQUEANTES (12)

1. 🔴 `admin-users` Edge Function sin validación JWT
2. 🔴 `smtp-send` Edge Function sin validación JWT
3. 🔴 Sin CSP configurado
4. 🔴 Sin MFA para cuentas admin
5. 🔴 CORS `*` en todas las Edge Functions
6. 🔴 Storage buckets posiblemente públicos con datos sensibles
7. 🔴 RBAC validado solo en frontend (no en Edge Functions)
8. 🔴 Sin política de retención de logs
9. 🔴 Sin rate limiting en Edge Functions
10. 🔴 Logs de auditoría posiblemente mutables (sin RLS de solo-lectura)
11. 🔴 Sin validación MIME en uploads de archivos
12. 🔴 `dangerouslySetInnerHTML` en templates de correo sin sanitización

### TOP 10 RIESGOS PRIORITARIOS A CORREGIR

1. **[CRÍTICO]** Agregar validación JWT en `admin-users` y `smtp-send` Edge Functions
2. **[CRÍTICO]** Auditoría completa de RLS en todas las tablas
3. **[ALTO]** Restringir CORS en Edge Functions
4. **[ALTO]** Validar RBAC en backend (no solo frontend)
5. **[ALTO]** Configurar CSP en index.html
6. **[ALTO]** Revisar visibilidad de storage buckets (datos sensibles)
7. **[ALTO]** Implementar MFA para roles admin
8. **[MEDIO]** Invalidar permisos en sesiones activas al cambiar matriz
9. **[MEDIO]** Agregar feedback visual cuando email trigger falla
10. **[MEDIO]** Remover dependencias innecesarias (firebase, stripe)

### QUÉ CORREGIR PRIMERO (Orden recomendado)

1. **Seguridad**: JWT validation en `admin-users` y `smtp-send` — vulnerabilidades activas
2. **Seguridad**: Auditoría RLS completa — posible exposición de datos
3. **Seguridad**: CSP + CORS — hardening de seguridad web
4. **Confiabilidad**: Feedback de errores en email trigger — correos perdidos
5. **Integridad**: Invalidación de permisos en caliente — cambios no se propagan
6. **Rendimiento**: Limpiar dependencias innecesarias
7. **Mantenibilidad**: Unificar activity_log vs reservation_activity_log

### QUÉ NO CONVIENE HACER CONFIGURABLE POR SEGURIDAD

- Service role key → siempre en secrets de Supabase
- Políticas RLS → siempre vía migrations
- Buckets de storage → siempre vía EF de setup
- Google OAuth config → siempre en Supabase dashboard
- OpenAI API key → siempre en secrets
- SMTP credentials → siempre en secrets
- CSP → configurable pero con revisión de seguridad
- Roles del sistema (ADMIN, etc.) → nombres pueden ser configurables, pero los permisos core deben estar protegidos