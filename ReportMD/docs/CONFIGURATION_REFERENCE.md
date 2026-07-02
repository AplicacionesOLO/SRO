# CONFIGURATION REFERENCE — Suite OLO / App Hub Manager

> **Documentación Enterprise-Grade | Segunda Pasada**
> Basado exclusivamente en el código fuente (v1199)

---

## VARIABLES DE ENTORNO (Frontend - Vite)

| Variable | Archivo | Default | Uso |
|----------|---------|---------|-----|
| `VITE_PUBLIC_SUPABASE_URL` | `.env` | — | URL de Supabase |
| `VITE_PUBLIC_SUPABASE_ANON_KEY` | `.env` | — | Anon key pública |
| `__BASE_PATH__` | `vite.config.ts` (define) | `'/'` | Base path para rutas y OAuth redirect |

### Acceso en Código
```typescript
// src/lib/supabaseEnv.ts
VITE_PUBLIC_SUPABASE_URL → import.meta.env.VITE_PUBLIC_SUPABASE_URL
VITE_PUBLIC_SUPABASE_ANON_KEY → import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY

// src/App.tsx
__BASE_PATH__ → constante global inyectada por Vite define
```

---

## SECRETS (Supabase Edge Functions)

| Secret | Usado por | Propósito | Default |
|--------|----------|-----------|---------|
| `SUPABASE_URL` | TODAS las EFs | URL de Supabase | — |
| `SUPABASE_SERVICE_ROLE_KEY` | TODAS las EFs | Service role (bypass RLS) | — |
| `SUPABASE_ANON_KEY` | `admin-user-access` | Cliente auth para validar JWT | — |
| `SUPABASE_PUBLISHABLE_KEY` | `admin-user-access` | Fallback anon key | — |
| `OPENAI_API_KEY` | `ask-sro-chat`, `process-knowledge-document` | API de OpenAI | — |
| `SMTP_HOST` | `smtp-send` | Servidor SMTP | `smtp.gmail.com` |
| `SMTP_PORT` | `smtp-send` | Puerto SMTP | `587` |
| `SMTP_USER` | `smtp-send` | Usuario SMTP | — |
| `SMTP_PASS` | `smtp-send` | Contraseña SMTP | — |
| `SMTP_FROM` | `smtp-send` | Remitente visible | `no-reply-sro@ologistics.com` |
| `GMAIL_CLIENT_ID` | `gmail-callback` | OAuth Google | — |
| `GMAIL_CLIENT_SECRET` | `gmail-callback` | OAuth Google | — |

---

## STORAGE BUCKETS

| Bucket | Propósito | Visibilidad | Creado por |
|--------|----------|-------------|-----------|
| `reservation-qrs` | QR y fichas de cita | Público | Manual / Setup EF |
| `reservation-files` | Archivos adjuntos de reservas | Configurable | `setup-casetilla-storage` EF |
| `knowledge-documents` | Documentos de conocimiento | Privado (signed URLs) | `setup-knowledge-storage` EF |
| `casetilla-photos` (posible) | Fotos de punto de control | — | — |

### Paths
```
reservation-qrs:  {orgId}/reservations/{reservationId}/qr.png
reservation-qrs:  {orgId}/reservations/{reservationId}/card.png
reservation-files: {orgId}/reservations/{reservationId}/{category}/{timestamp}_{filename}
knowledge-documents: {orgId}/{timestamp}_{filename}
```

---

## CRON JOBS (pg_cron en Supabase)

| Job | Schedule | EF |
|-----|----------|-----|
| `auto-mark-no-show` | `*/5 * * * *` | `auto-mark-no-show` |
| `generate-client-pickup-blocks` | Diario (recomendado) | `generate-client-pickup-blocks` |

---

## VALORES QUEMADOS (Hardcoded)

| Valor | Archivo | Línea | Debería ser configurable |
|-------|---------|-------|------------------------|
| `'America/Costa_Rica'` | `useUserScope.ts`, `casetillaService.ts`, `calendarService.ts`, etc. | Varias | ✅ Sí (org setting) |
| `5 * 60 * 1000` (5 min cache scope) | `useUserScope.ts` | 67 | ✅ Sí (org setting) |
| `2 * 60 * 1000` (2 min cache docks) | `calendarService.ts` | ~150 | ✅ Sí |
| `7 * 24 * 60 * 60 * 1000` (7 días draft) | `useReservationDraft.ts` | ~30 | ✅ Sí |
| `30` (días ahead bloques) | `clientPickupRulesService.ts` | ~20 | ✅ Sí (ya es parámetro) |
| `'06:00:00'` / `'17:00:00'` (horario default) | `warehousesService.ts` | ~8 | ✅ Sí (por warehouse) |
| `'gpt-4o-mini'` (modelo OpenAI) | `ask-sro-chat/index.ts` | ~150 | ✅ Sí (org setting) |
| `0.3` (temperature) | `ask-sro-chat/index.ts` | ~150 | ✅ Sí |
| `1800` (max_output_tokens) | `ask-sro-chat/index.ts` | ~150 | ✅ Sí |
| `5` (max_num_results file_search) | `ask-sro-chat/index.ts` | ~150 | ✅ Sí |
| `'00000000-0000-0000-0000-000000000000'` (SYSTEM_USER_ID) | `generate-client-pickup-blocks` | 8 | ❌ No (identificador del sistema) |
| `['ADMIN', 'SUPERVISOR', 'Full Access']` (GLOBAL_ACCESS_ROLES) | `useUserScope.ts` | 17 | ✅ Sí (tabla roles + flag) |
| `'ADMIN' \| 'SUPERVISOR' \| 'OPERADOR' \| 'CASETILLA'` (UserRole) | `AuthContext.tsx` | 6 | ✅ Sí (dinámico desde roles) |
| `50` (paginación batch no-show) | `auto-mark-no-show/index.ts` | ~130 | ✅ Sí |
| `200` (batch inserción bloques) | `generate-client-pickup-blocks` | ~120 | ✅ Sí |
| `20` (max páginas auth users) | `admin-users/index.ts` | ~30 | ✅ Sí |
| `aplicacionesolo@ologistics.com` (sender email) | `correspondence-process-event` | ~300 | ⚠️ Sí (SMTP_FROM secret ya existe) |
| `'reservation-qrs'`, `'reservation-files'` (bucket names) | `calendarService.ts` | — | ❌ No (infraestructura) |
| `'knowledge-documents'` (bucket name) | `knowledgeService.ts` | — | ❌ No (infraestructura) |

---

## TIMEOUTS Y RETRIES

| Operación | Timeout/Retry | Archivo |
|-----------|--------------|---------|
| `smtp-send` | Sin timeout explícito | `smtp-send/index.ts` |
| `ask-sro-chat` (OpenAI) | Sin timeout explícito | `ask-sro-chat/index.ts` |
| Draft save debounce | 500ms | `useReservationDraft.ts` |
| Debounce genérico | 300ms (default) | `useDebouncedValue.ts` |
| Refresh token | Automático (Supabase SDK) | — |
| Session lock timeout | 10 segundos (supabase.ts lock) | `src/lib/supabase.ts` |

---

## CSP (Content Security Policy)

- ❌ **No configurado** en `index.html`
- Riesgo: XSS

---

## CORS

- **Todas las Edge Functions**: `Access-Control-Allow-Origin: *` (wildcard)
- Sin restricción de orígenes

---

## REALTIME

- Supabase Realtime **no está siendo usado** en el código frontend actual
- Las actualizaciones entre pestañas/usuarios dependen de refrescos manuales o caché TTL

---

## JWT

| Configuración | Valor |
|--------------|-------|
| Algoritmo | RS256 (Supabase) |
| Expiración | 3600s (1 hora, default Supabase) |
| Refresh token | Automático (SDK) |
| Validación manual | `supabase.auth.getUser(token)` en Edge Functions |

---

## RLS (Row Level Security)

- Habilitado en la mayoría de tablas
- Políticas basadas en `org_id` y `auth.uid()`
- Service role (`SUPABASE_SERVICE_ROLE_KEY`) bypassea RLS
- Las migraciones están en `supabase/migrations/`

---

## TRIGGERS (PostgreSQL)

| Trigger | Tabla | Propósito |
|---------|-------|-----------|
| `reservations_no_overlap` | reservations | Exclusion constraint (overlap prevention) |
| `update_reservations_updated_at` | reservations | Auto `updated_at` |
| Trigger de bloqueo `P0001` | dock_time_blocks | Overlap con reglas cliente |

---

## DEPENDENCIAS NPM (package.json)

### Producción
```
react, react-dom (^19)
react-router-dom
@supabase/supabase-js
date-fns
@tanstack/react-query
@tanstack/react-table
@dnd-kit/core, @dnd-kit/sortable
lexical (rich text)
```

### Desarrollo
```
vite, typescript, tailwindcss, postcss, autoprefixer
eslint, prettier
@types/react, @types/react-dom
```