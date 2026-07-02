# REPORTE 6: RIESGOS DE MALA CONFIGURACIÓN
## Suite OLO / App Hub Manager — Riesgos que pueden tumbar el sistema

**Fecha**: 2026-06-30

---

## CONFIGURACIONES CRÍTICAS Y SUS CONSECUENCIAS

| # | Configuración | Qué pasa si está mal | Síntoma visible | Cómo detectarlo | Cómo corregirlo |
|---|--------------|---------------------|-----------------|-----------------|-----------------|
| 1 | **Supabase no conectado** | Nada funciona. Error "Missing env var" en consola | Pantalla en blanco o error en consola | `import.meta.env.VITE_PUBLIC_SUPABASE_URL` vacío | Configurar `.env` con URL y anon key |
| 2 | **RLS no ejecutado en todas las tablas** | Datos expuestos a cualquier usuario autenticado | Usuarios ven datos de otras organizaciones | `SELECT tablename FROM pg_tables WHERE rowsecurity = false` | `ALTER TABLE X ENABLE ROW LEVEL SECURITY` |
| 3 | **Bucket `reservation-qrs` no creado** | QR no se generan. `ensureReservationQR` falla silenciosamente | Reservas sin QR, error en consola | Ejecutar `setup-casetilla-storage` EF | Ejecutar EF de setup |
| 4 | **Bucket `reservation-files` no creado** | No se pueden subir archivos a reservas | Error al adjuntar documentos | Intentar subir archivo → error 404 en storage | Ejecutar EF de setup |
| 5 | **Secrets `OPENAI_API_KEY` no configurado** | Chat IA no funciona | SRObot responde "SRObot no está configurado. Contactá al administrador." | Preguntar algo al chat → error 503 | Configurar en Supabase Dashboard > Edge Functions > Secrets |
| 6 | **Secrets `SMTP_USER` / `SMTP_PASS` no configurados** | Correos no se envían | `correspondence_outbox` acumula registros en "failed" | Revisar outbox → todo failed con "Missing SMTP_USER" | Configurar secrets SMTP |
| 7 | **Edge Functions no desplegadas** | Funcionalidades que dependen de EF fallan | Errores 404 al invocar funciones | `supabase functions list` o intentar crear reserva | Desplegar con `supabase functions deploy` |
| 8 | **EF desplegada con nombre incorrecto** | Invocación falla con 404 | "Failed to fetch" o "Edge Function not found" | Coincidir slug en código vs slug desplegado | Corregir nombre y redesplegar |
| 9 | **EF `admin-users` desplegada con `--verify-jwt`** | No puede usar `auth.admin.*` | Error "Admin createUser failed" o 403 | Verificar configuración de despliegue | Redesplegar con `--no-verify-jwt` + validación manual |
| 10 | **Google OAuth redirect URI mal configurado** | Login con Google falla después de elegir cuenta | Google muestra error "redirect_uri_mismatch" | Intentar login con Google → error | Configurar en Google Cloud Console + Supabase Auth |
| 11 | **`.env` sin `VITE_PUBLIC_SUPABASE_URL`** | App no carga, error en consola | "❌ Missing env var: VITE_PUBLIC_SUPABASE_URL" | Abrir consola del navegador | Agregar la variable en `.env` |
| 12 | **`.env` sin `VITE_PUBLIC_SUPABASE_ANON_KEY`** | Auth no funciona | Error al iniciar sesión | Consola: error de autenticación | Agregar la variable |
| 13 | **Service role key mal configurada** | Edge Functions con service role fallan | Errores 500 en Edge Functions | Logs de EF: "Invalid API key" o error de auth | Rotar y configurar key correcta en Supabase Dashboard |
| 14 | **Migración ejecutada parcialmente** | Tablas faltantes o con schema incorrecto | Errores 404 en queries (relation does not exist) | `SELECT table_name FROM information_schema.tables WHERE table_schema='public'` | Ejecutar migrations faltantes |
| 15 | **Políticas RLS recursivas o conflictivas** | Queries cuelgan o retornan error | Timeout en queries, errores "infinite recursion" | `EXPLAIN ANALYZE` en queries lentas | Revisar y simplificar políticas RLS |
| 16 | **Rol inexistente en DB pero usado en código** | Usuarios no pueden loguearse correctamente | `user_org_roles` apunta a role_id que no existe en `roles` | `SELECT * FROM user_org_roles WHERE role_id NOT IN (SELECT id FROM roles)` | Crear rol faltante o corregir asignación |
| 17 | **Usuario sin `user_org_roles`** | `pendingAccess = true` permanentemente | Usuario ve "/access-pending" sin fin | `SELECT * FROM profiles WHERE id NOT IN (SELECT user_id FROM user_org_roles)` | Asignar rol al usuario |
| 18 | **Perfil sin registro en `profiles`** | `user.name` es el email recortado | Nombre raro en navbar (pedacito de email) | `SELECT id FROM auth.users WHERE id NOT IN (SELECT id FROM profiles)` | Crear registro en profiles |
| 19 | **Permisos huérfanos en `role_permissions`** | Roles tienen permisos a permission_id inexistente | `canLocal()` no detecta el permiso aunque está asignado | `SELECT * FROM role_permissions WHERE permission_id NOT IN (SELECT id FROM permissions)` | Limpiar o corregir |
| 20 | **Buckets con visibilidad incorrecta** | Datos sensibles expuestos o archivos inaccesibles | Error 403 al acceder a URLs de storage | Verificar políticas de storage en Supabase Dashboard | Ajustar políticas de bucket |
| 21 | **Timezone mal configurado en warehouses** | Horarios de reserva incorrectos | Reservas aparecen en horas equivocadas, cutoff no funciona | Verificar timezone en tabla `warehouses` | Corregir a IANA timezone válido |
| 22 | **`no_show_tolerance_minutes` mal configurado** | No-show automático no se ejecuta o marca incorrectamente | Reservas que deberían ser NO_SHOW no se marcan | `SELECT * FROM warehouses WHERE no_show_tolerance_minutes IS NULL OR no_show_tolerance_minutes <= 0` | Configurar tolerancia en minutos |
| 23 | **`slot_interval_minutes` <= 0 en warehouse** | Calendario no puede calcular slots | Error o slots no se generan | Revisar configuración de warehouse | Configurar >= 15 |
| 24 | **`business_start_time` > `business_end_time`** | Validación de horario hábil falla | No se pueden crear reservas, error de "fuera de horario" | Revisar configuración | Corregir horarios |
| 25 | **Múltiples reglas "Cliente Retira" activas mismo dock+cliente** | Conflictos de bloques | Bloques duplicados o error `23505` unique constraint | `SELECT dock_id, client_id, COUNT(*) FROM client_pickup_rules WHERE is_active=true GROUP BY dock_id, client_id HAVING COUNT(*) > 1` | Desactivar duplicados |
| 26 | **`user_country_access` sin `user_warehouse_access`** | Intersección vacía → usuario ve 0 warehouses | Calendario vacío, "sin almacenes disponibles" | Verificar consistencia entre ambas tablas | Sincronizar accesos |
| 27 | **Correspondencia con `status_from_id` o `status_to_id` inexistente** | Regla nunca dispara | Correos no se envían para ese evento | `SELECT * FROM correspondence_rules WHERE status_from_id NOT IN (SELECT id FROM reservation_statuses)` | Corregir o eliminar regla |
| 28 | **Gmail account con refresh_token expirado** | Envío por Gmail API falla | Logs de correspondencia con error de Gmail | Revisar `gmail_accounts.status = 'error'` | Reconectar Gmail |
| 29 | **Caché de scope con datos stale** | Cambios en accesos no se reflejan por 5 min | Usuario recién asignado no ve warehouses | Esperar 5 min o llamar a `invalidateScopeAndReload()` | Forzar invalidación |
| 30 | **`VITE_SMTP_MODE=local` en producción** | Correos van a localhost en vez de SMTP real | `correspondence_outbox` se queda en "queued" | Revisar `.env` → `VITE_SMTP_MODE` | Cambiar a modo producción y configurar SMTP secrets |

---

## QUÉ VERIFICAR ANTES DE CADA DEPLOY

### Checklist de Pre-Deploy

- [ ] `.env` contiene `VITE_PUBLIC_SUPABASE_URL` y `VITE_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Todas las Edge Functions están desplegadas con los slugs correctos
- [ ] Secrets de Supabase configurados: `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `SMTP_USER`, `SMTP_PASS`, `SMTP_HOST`, `SMTP_FROM`
- [ ] Buckets de Storage existen: `reservation-qrs`, `reservation-files`, buckets de conocimiento y casetilla
- [ ] RLS habilitado en todas las tablas con datos sensibles
- [ ] Google OAuth configurado (redirect URIs)
- [ ] Gmail OAuth configurado (si se usa)
- [ ] No hay usuarios sin `user_org_roles`
- [ ] No hay `role_permissions` huérfanos
- [ ] Warehouses tienen timezone, horarios y tolerancias válidos
- [ ] `no_show_tolerance_minutes` configurados donde corresponda
- [ ] `slot_interval_minutes` válidos en todos los warehouses