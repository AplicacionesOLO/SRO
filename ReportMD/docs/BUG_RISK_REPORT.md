# REPORTE 7: POSIBLES BUGS
## Suite OLO / App Hub Manager — Auditoría Técnica

**Fecha**: 2026-06-30

---

## BUGS DETECTADOS Y PROBABLES

| # | Bug | Severidad | Archivo/Zona | Causa | Cómo reproducirlo | Solución |
|---|-----|-----------|-------------|-------|-------------------|----------|
| 1 | **`admin-users` sin validación JWT** | CRÍTICO | `supabase/functions/admin-users/index.ts` | La función no valida el JWT del invocador. Cualquiera que conozca la URL puede crear/listar usuarios | `curl -X POST <url>/admin-users -d '{"action":"list","orgId":"..."}'` sin token | Agregar `supabase.auth.getUser(token)` al inicio |
| 2 | **`smtp-send` sin validación JWT** | CRÍTICO | `supabase/functions/smtp-send/index.ts` | No valida JWT ni permisos. Recibe el body y envía correos | POST a la URL de smtp-send con cualquier body | Validar JWT antes de enviar |
| 3 | **Permisos no se invalidan al cambiar en matriz** | ALTO | `src/contexts/AuthContext.tsx` + Admin Matriz | Los permisos se cargan una vez al login. Cambios en `role_permissions` no se propagan a sesiones activas | 1. Admin quita permiso a un rol. 2. Usuario con ese rol sigue teniendo acceso hasta que cierra sesión. | Mecanismo de invalidación (realtime, polling, o event) |
| 4 | **Scope cache de 5 min puede mostrar datos wrong** | ALTO | `src/hooks/useUserScope.ts:67` | Cache de 5 minutos con `scopeCache`. Si admin cambia accesos de un usuario, tarda 5 min en reflejarse en su UI | 1. Admin asigna nuevo warehouse a usuario. 2. Usuario no lo ve en el selector hasta 5 min después. | `invalidateScopeAndReload()` ya existe, pero solo se llama al modificar warehouses (no al modificar accesos de usuarios). Agregar llamada en `userAccessService` |
| 5 | **Error silencioso en emailTrigger** | ALTO | `src/services/emailTriggerService.ts` | `getValidSupabaseToken()` puede fallar y retornar null, `invokeCorrespondenceProcessEvent` puede fallar con 500. Ambos son catch-and-silence | 1. Crear reserva. 2. Si el token expiró JUSTO antes de la llamada, el correo nunca se envía y no hay alerta. | Agregar toast/notificación de fallo + cola de reintentos |
| 6 | **Race condition en `useUserScope` con múltiples consumidores** | MEDIO | `src/hooks/useUserScope.ts` | El hook usa `pendingPromise` para deduplicar, pero si dos componentes montan exactamente al mismo tiempo, ambos podrían iniciar la carga antes del pendingPromise | Múltiples componentes llamando `useUserScope()` en el primer render de la app | ✅ El pendingPromise mitiga esto en la mayoría de casos. Edge case: si el primer componente cancela (`cancelled=true`), el pendingPromise se resuelve igual pero con datos stale |
| 7 | **`user_warehouses` y `user_countries` no sincronizadas con `_access`** | MEDIO | Supabase DB | Las tablas espejo (`user_warehouses`, `user_countries`) pueden desincronizarse de sus contrapartes `_access` | Ya se detectó y corrigió parcialmente en sesión anterior (build 1197). Pero si un admin modifica `user_warehouse_access` directamente (sin usar la EF), el trigger no se dispara. | Ejecutar job periódico de sincronización |
| 8 | **`updateReservation` con posible pérdida de email trigger** | MEDIO | `src/services/calendarService.ts` | El email trigger se dispara con IIFE async. Si el componente se desmonta antes de que se complete, el trigger puede no ejecutarse | Cambiar estado de reserva y cerrar el modal inmediatamente | Mover el trigger a una Edge Function atómica |
| 9 | **Drag & drop de reservas sin validación server-side completa** | MEDIO | `src/pages/calendario/` | El drop actualiza la reserva vía `updateReservation`, pero no re-valida cutoff ni overlap en el backend (solo en create) | Arrastrar reserva a un slot que viola same-day cutoff después del horario de corte | Mover validación de cutoff al backend también en update |
| 10 | **`caseteraService.getPendingReservations` usa RPC sin caché** | MEDIO | `src/services/casetillaService.ts` | Cada vez que se abre la pestaña de pendientes, se ejecuta la RPC completa | Alternar entre pestañas en casetilla rápidamente → múltiples RPC calls | Agregar debounce o caché local de corta duración |
| 11 | **Batch de bloques `generate-client-pickup-blocks` sin transacción** | MEDIO | `supabase/functions/generate-client-pickup-blocks/index.ts` | Si falla a mitad del batch, algunos bloques quedan creados y otros no | Interrumpir la EF durante la generación | Envolver en transacción SQL o hacer idempotente |
| 12 | **`useEffect` duplicado en `useReservationBlockedStatus`** | BAJO | `src/hooks/useBlockedStatuses.ts:102-140` | El hook carga `userRoleIdRef` en un `useEffect` separado y luego evalúa el bloqueo en otro `useEffect`. Si el primer efecto no terminó, el segundo usa `userRoleIdRef.current = null` | Primera carga del ReservationModal con un usuario OPERADOR | Unificar en un solo efecto con dependencias correctas |
| 13 | **`auto-mark-no-show` procesa máx 500 reservas** | BAJO | `supabase/functions/auto-mark-no-show/index.ts` | `limit(500)` hardcodeado | Si hay más de 500 reservas vencidas, solo se procesan las primeras 500 | Aumentar límite o paginar |
| 14 | **Error 406 en UPDATE + SELECT si RLS no permite SELECT** | BAJO | `src/services/calendarService.ts` | `updateReservation` separa UPDATE y SELECT para evitar 406, pero si el SELECT falla por RLS, construye fallback mínimo. El fallback puede no tener datos precisos para el email trigger | Actualizar reserva de otro usuario siendo operador restringido | El fallback ya existe y funciona, pero los correos podrían tener datos incompletos |
| 15 | **`reservation_activity_log` escrito como `activity_log`** | BAJO | `supabase/functions/auto-mark-no-show/index.ts` + `calendarService.ts` | En algunos lugares se escribe en `activity_log` y en otros en `reservation_activity_log`. Puede haber inconsistencia | Revisar queries de auditoría | Unificar en una sola tabla |
| 16 | **`firebase` y `@stripe/react-stripe-js` en package.json sin uso** | BAJO | `package.json` | Dependencias innecesarias que inflan el bundle | `npm ls firebase` → instalado pero sin imports | Remover del package.json |
| 17 | **`window.location.replace` en SessionExpiredModal** | BAJO | `src/components/feature/SessionExpiredModal.tsx:12` | Usa `window.location.replace('/login')` fuera de React Router, causando recarga completa | Sesión expirada → página recarga completamente | Usar `useNavigate` |
| 18 | **Sin feedback visual cuando `emailTrigger` falla** | MEDIO | `src/services/emailTriggerService.ts` | Todos los catch son silenciosos o loguean a consola. El usuario no sabe si el correo se envió o no | Crear reserva con regla de correspondencia activa pero SMTP mal configurado → sin error visible | Agregar `sonner` toast de advertencia |
| 19 | **`useUserScope` retorna lista vacía en vez de null en error** | BAJO | `src/hooks/useUserScope.ts:146-161` | En el catch, `resultAllowedWarehouseIds = []`. Esto significa "0 warehouses" en vez de "error". Un error de red parece "sin datos" | Desconectar internet durante la carga del scope | Diferenciar "error" vs "sin warehouses" |
| 20 | **Posible memory leak en `scopeCache`** | BAJO | `src/hooks/useUserScope.ts:60` | El `Map` crece con cada combinación `userId:orgId`. Si hay muchos usuarios compartiendo navegador, podría acumularse | Múltiples usuarios loguean en el mismo navegador (sin recargar) | Limpiar caché en logout o usar WeakMap |

---

## BUGS POR CATEGORÍA DE SEVERIDAD

### CRÍTICOS (2)
- admin-users sin validación JWT → cualquiera puede gestionar usuarios
- smtp-send sin validación JWT → cualquiera puede enviar correos

### ALTOS (3)
- Permisos no se invalidan → puede haber escalation of privilege temporal
- Scope cache muestra datos stale → inconsistencia de datos
- Email trigger silencioso → correos perdidos sin alerta

### MEDIOS (8)
- Race condition en useUserScope
- Desincronización user_warehouses vs user_warehouse_access
- Email trigger en updateReservation con IIFE
- Drag & drop sin re-validación de cutoff
- RPC sin caché en casetilla
- Batch blocks sin transacción
- Sin feedback de error en email trigger
- useEffect duplicado en useReservationBlockedStatus

### BAJOS (7)
- auto-mark-no-show límite 500
- Error 406 fallback con datos incompletos
- Inconsistencia activity_log vs reservation_activity_log
- Dependencias innecesarias (firebase, stripe)
- window.location.replace fuera de React Router
- useUserScope: error vs sin datos
- Memory leak potencial en scopeCache