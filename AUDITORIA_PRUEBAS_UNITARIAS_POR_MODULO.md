# Auditoría de Pruebas Unitarias por Módulo — SRO

- **Fecha:** 2026-10-08
- **Alcance:** Todo el sistema (frontend React/TypeScript, Edge Functions de Supabase, base de datos PostgreSQL/Supabase).
- **Tipo de trabajo:** Auditoría y documentación únicamente. **No se realizó ningún cambio de código.**
- **Objetivo:** Responder "¿hay pruebas unitarias de todo el sistema?" y dejar registrados, módulo por módulo, todos los hallazgos, la cobertura actual y los riesgos.

---

## Índice

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Metodología y leyenda](#2-metodología-y-leyenda)
3. [Infraestructura de pruebas actual](#3-infraestructura-de-pruebas-actual)
4. [Inventario de todas las pruebas existentes](#4-inventario-de-todas-las-pruebas-existentes)
5. [Cobertura por módulo](#5-cobertura-por-módulo)
   - 5.1 [Dominios de negocio (frontend)](#51-dominios-de-negocio-frontend)
   - 5.2 [Utilidades puras (src/utils)](#52-utilidades-puras-srcutils)
   - 5.3 [Infraestructura frontend (contextos, hooks, guards, router)](#53-infraestructura-frontend-contextos-hooks-guards-router)
   - 5.4 [Edge Functions (backend)](#54-edge-functions-backend)
   - 5.5 [Base de datos / RPC / Triggers / RLS](#55-base-de-datos--rpc--triggers--rls)
6. [Hallazgos transversales (riesgos)](#6-hallazgos-transversales-riesgos)
7. [Matriz de priorización](#7-matriz-de-priorización)
8. [Plan de pruebas propuesto por fases (documentado, no ejecutado)](#8-plan-de-pruebas-propuesto-por-fases-documentado-no-ejecutado)
9. [Anexo: cómo ejecutar las pruebas existentes](#9-anexo-cómo-ejecutar-las-pruebas-existentes)
10. [Conclusión](#10-conclusión)

---

## 1. Resumen ejecutivo

**Respuesta corta: No.** El sistema **no** tiene pruebas unitarias de todo el sistema. Tiene **una sola** prueba unitaria de frontend y dos suites específicas de base de datos, concentradas casi por completo en el módulo IN/OUT (Casetilla) de las Fases 6.1 y 6.2.

Datos duros:

| Métrica | Valor |
|---|---|
| Archivos de código (aprox.) | ~250 (frontend) + 43 Edge Functions + migraciones SQL |
| Archivos de prueba unitaria (frontend) | **1** (`src/utils/noShowRules.test.ts`) |
| Runner de pruebas configurado | **Ninguno** (no hay vitest/jest ni script `test` en `package.json`) |
| Servicios de negocio (`src/services`) con pruebas | **0 de ~41** |
| Edge Functions con pruebas automatizadas | **0 de 43** |
| Suites SQL existentes | 2 de Fase 6.2 + paquete aislado IN/OUT de Fase 6.1 |
| Cobertura global estimada | **< 1 %** del código |

**Lo que sí está bien hecho:** la regla *No Arribó* (`noShowRules`) tiene 27 casos unitarios muy completos, y el módulo IN/OUT tiene un paquete de pruebas de integración serio (estructura, permisos, RLS, idempotencia, rollback, concurrencia). El problema no es la calidad de lo poco que hay, es la **ausencia total de cobertura** en el resto del sistema y la **falta de un runner unificado**.

**Riesgo más alto detectado:** la regla *No Arribó* vive en **tres lugares** distintos (util de frontend, función SQL `auto_mark_no_show_v5()`, y una Edge Function desactivada), y solo **uno** tiene prueba. Esta es exactamente la causa del incidente de marcados erróneos reportado antes. Sin pruebas que aten las copias, la desincronización se repite.

---

## 2. Metodología y leyenda

Se recorrió el proyecto completo buscando:

- Archivos de prueba: `*.test.*`, `*.spec.*`, carpetas `__tests__/`.
- Suites SQL: `supabase/tests/`, `supabase/inout-test/`.
- Configuración de runner: `package.json` (scripts y devDependencies), configuración de Vite.
- Colecciones de API: `api-postman-collection/`.
- Lógica pura testeable: `src/utils/`, reglas de negocio en servicios y funciones SQL.

**Leyenda de cobertura:**

| Símbolo | Significado |
|---|---|
| 🟩 **Cubierto** | Existe prueba unitaria/funcional que valida la lógica principal del módulo. |
| 🟨 **Parcial** | Existe alguna prueba (a menudo estructural o de integración), pero no cubre la lógica de negocio completa. |
| 🟥 **Sin cobertura** | No existe ninguna prueba automatizada. |

**Leyenda de criticidad:** 🔴 Crítico · 🟠 Alto · 🟡 Medio · ⚪ Bajo

---

## 3. Infraestructura de pruebas actual

### 3.1 Runner de frontend: **no existe**

`package.json` **no** tiene un script `test` y **no** incluye vitest, jest ni mocha:

```json
"scripts": {
  "build": "vite build",
  "dev": "vite",
  "lint": "eslint src --ext ts,tsx ...",
  "preview": "vite preview",
  "type-check": "tsc --noEmit --project tsconfig.app.json"
}
```

La única prueba unitaria de frontend (`noShowRules.test.ts`) **no usa un framework**: implementa un mini-harness propio y se ejecuta con el **runner nativo de TypeScript de Node (Node ≥ 23/24)**:

```
node src/utils/noShowRules.test.ts
```

**Hallazgo:** esta prueba depende de una versión de Node muy reciente. En un entorno con Node LTS (18/20/22) **no correría**. No hay un comando unificado y no está integrada a ningún flujo (ni a `build`, ni a `lint`, ni a CI).

### 3.2 Runner de base de datos

- **SQL de Fase 6.2:** archivos `DO $$ ... $$` que imprimen `PASS`/`FAIL` por `RAISE NOTICE`/`RAISE EXCEPTION`. Se ejecutan **manualmente** en el SQL Editor de Supabase.
- **Paquete aislado IN/OUT (Fase 6.1):** orquestadores `run-tests.sh` (Linux/macOS) y `run-tests.ps1` (Windows) que levantan un PostgreSQL 15 en Docker y corren 11 scripts + prueba de concurrencia. Devuelve exit code 0/≠0.

### 3.3 Integración continua (CI): **no existe**

No hay workflows ni pipelines que ejecuten pruebas automáticamente (ni al hacer commit, ni al build). Todo es manual.

---

## 4. Inventario de todas las pruebas existentes

| # | Prueba | Ruta | Tipo | Qué cubre | Cómo se ejecuta |
|---|---|---|---|---|---|
| 1 | No-Show Rules | `src/utils/noShowRules.test.ts` | Unitaria (frontend) | 27 casos de la regla No Arribó: exclusión de importados, traslado interno, canceladas, tolerancia, frontera de tiempo, reducción a 15 min | `node src/utils/noShowRules.test.ts` |
| 2 | Fase 6.2 — Stages 1-2-3 | `supabase/tests/phase_6_2_stages_1_2_3_tests.sql` | SQL estructural (M1–M30) | Tablas, columnas, FKs, índices, RLS, helpers, permisos de la infraestructura 6.2 | Manual (SQL Editor) |
| 3 | Fase 6.2 — Transition Engine | `supabase/tests/phase_6_2_transition_engine_tests.sql` | SQL (30 estructurales + 46 funcionales documentados + 10 integración) | Objetos del motor de transiciones; funcionales e integración quedaron como `NOTICE` pendientes de datos | Manual (SQL Editor) |
| 4 | Paquete aislado IN/OUT | `supabase/inout-test/` (11 scripts + concurrencia) | Integración (PostgreSQL + Docker) | Estructura (7 tablas/29 índices/13 políticas), permisos RBAC, provisioning, RLS real (`SET ROLE authenticated`), idempotencia, no cambios operativos, rollback, concurrencia | `./run-tests.sh` o `.\run-tests.ps1` |
| 5 | Colección Postman | `api-postman-collection/Reservations_API.postman_collection.json` | Smoke test de API (manual) | 2 listeners `test` en endpoints de la API v1 de Reservations | Importar en Postman y ejecutar a mano |

> **Nota:** no existe ningún archivo `*.spec.*`, ni carpeta `__tests__/`, ni otras suites ocultas. La búsqueda de `vitest|jest|mocha|describe(|it(` no arrojó coincidencias en el código.

---

## 5. Cobertura por módulo

### 5.1 Dominios de negocio (frontend)

#### 5.1.1 Reservas & Calendario — 🟥 Sin cobertura · 🔴 Crítico

- **Archivos clave:** `src/pages/calendario/page.tsx` + 10 componentes; `src/pages/reservas/page.tsx`; `src/services/calendarService.ts`; `src/utils/recurrenceUtils.ts`; Edge Function `create-reservation`.
- **Pruebas existentes:** ninguna directa.
- **Hallazgos:**
  - `calendarService` es el corazón operativo (crear/editar reservas, detección de solapamientos, QR). **0 pruebas.**
  - `recurrenceUtils` (cálculo de recurrencias) es lógica pura y **fácilmente testeable**, pero no tiene prueba.
  - `create-reservation` es una Edge Function crítica sin prueba.

#### 5.1.2 Casetilla / IN-OUT / Compliance — 🟨 Parcial · 🔴 Crítico

- **Archivos clave:** `src/pages/casetilla/page.tsx` + 7 componentes + 11 de `compliance/`; `casetillaService.ts`, `casetillaReportService.ts`, `complianceService.ts`; `src/utils/noShowRules.ts`; Edge Functions `api-v1-casetilla-ingresos`, `api-v1-casetilla-salidas`, `create-reservation`, `auto-dispatch-internal-transfer`, `auto-mark-no-show` (desactivada).
- **Pruebas existentes:**
  - 🟩 `noShowRules.test.ts` — 27 casos (la mejor cubierta del sistema).
  - 🟨 Paquete IN/OUT de Fase 6.1 (integración, estructura/RLS/rollback).
  - 🟨 Suites SQL de Fase 6.2 (estructura del motor de transiciones).
- **Hallazgos:**
  - `casetillaService` (ingresos/salidas, reportes) **sin pruebas unitarias**.
  - La regla *No Arribó* está **triplicada** (util frontend, función SQL `auto_mark_no_show_v5()`, Edge Function desactivada). Solo el util tiene prueba → **riesgo de desincronización confirmado** (incidente previo).
  - `auto-dispatch-internal-transfer` (traslado interno → despachado a los 3 s) es lógica nueva y crítica, **sin pruebas**.
  - El RPC `transition_reservation_status` está cubierto estructuralmente, pero sus casos funcionales quedaron como `NOTICE` pendientes de datos.

#### 5.1.3 Catálogos (proveedores, cargos, perfiles de tiempo, tipos de vehículo, origen de proveedores, clusters/asignaciones) — 🟥 Sin cobertura · 🟠 Alto

- **Archivos clave:** `src/pages/admin/catalogos/` (~23 componentes + page); servicios `providersService`, `cargoTypesService`, `timeProfilesService`, `vehicleTypesService`, `providerBulkImportService`, `origenProveedoresService`, `clusterService`, `effectiveProvidersService`, `userProvidersService`, `userClientsService`; utilidades `excelParser.ts`, `timeProfileExcelParser.ts`; Edge Functions `sync-providers`, `sync-providers-excel`, `api-v1-providers`.
- **Pruebas existentes:** ninguna.
- **Hallazgos:**
  - El **parseo de Excel** (`excelParser`, `timeProfileExcelParser`) es lógica pura, de alto riesgo de errores y **trivial de testear** → quick win evidente.
  - La importación masiva (`ProviderBulkImportModal`, `TimeProfileBulkImportModal`) no tiene validación automatizada.

#### 5.1.4 Clientes & Reglas de negocio — 🟥 Sin cobertura · 🔴 Crítico

- **Archivos clave:** `src/pages/admin/clientes/` (8 componentes + page); servicios `clientsService`, `clientOverlapRulesService`, `clientPickupRulesService`, `clientStatusSequenceRulesService`, `clientInternalTransferRulesService`, `clientBlockedStatusesService`, `sameDayCutoffService`, `orgSettingsService`.
- **Pruebas existentes:** ninguna.
- **Hallazgos:**
  - Módulo **denso en reglas de negocio** (secuencia de estados, solapamiento, bloques de retiro, cutoff del mismo día). Este es el tipo de lógica donde las pruebas unitarias dan más retorno, y está **100 % sin cubrir**.

#### 5.1.5 Almacenes & Andenes — 🟥 Sin cobertura · 🟠 Alto

- **Archivos clave:** `src/pages/admin/almacenes/` (3 componentes + page); `src/pages/andenes/` (2 + page); servicios `warehousesService`, `countriesService`, `dockAllocationService`; util `sortDocks.ts`; Edge Functions `api-v1-warehouses`, `api-v1-docks`, `generate-client-pickup-blocks`.
- **Pruebas existentes:** ninguna. `sortDocks` (puro) sin prueba.

#### 5.1.6 Admin / Usuarios / Roles / Permisos (RBAC) — 🟥 Sin cobertura · 🔴 Crítico

- **Archivos clave:** `UsersTab`, `RolesTab`, `PermissionsTab`, `PermissionMatrixTab`; páginas `admin/roles`, `admin/usuarios`, `admin/matriz-permisos`; `adminService`, `userAccessService`; Edge Functions `admin-users`, `admin-user-access`, `setup-admin-permissions`.
- **Pruebas existentes:** ninguna directa. (Las suites de Fase 6.1 validan conteos de permisos **solo para IN/OUT**.)
- **Hallazgo:** módulo de **seguridad**. Un error de permisos es de alto impacto. 0 pruebas.

#### 5.1.7 Correspondencia / Email — 🟥 Sin cobertura · 🟠 Alto

- **Archivos clave:** `src/pages/admin/correspondencia/` (5 componentes + page); `correspondenceService`, `emailTriggerService`; Edge Functions `correspondence-dispatch-event`, `correspondence-process-event`, `correspondence-retry-email`, `gmail-callback`, `gmail-connection-status`, `smtp-send`.
- **Pruebas existentes:** ninguna.

#### 5.1.8 Mensajería — 🟥 Sin cobertura · 🟡 Medio

- **Archivos clave:** `src/components/feature/messaging/` (13 componentes); `useMessaging`; `messagingService`; Edge Functions `msg-*` (8).
- **Pruebas existentes:** ninguna.

#### 5.1.9 Conocimiento (Knowledge) — 🟥 Sin cobertura · 🟡 Medio

- **Archivos clave:** `src/pages/conocimiento/` (3 componentes + page); `knowledgeService`; `useKnowledgeDocuments`; Edge Functions `process-knowledge-document`, `reindex-knowledge-document`.
- **Pruebas existentes:** ninguna.

#### 5.1.10 Chat / Asistente SRO — 🟥 Sin cobertura · 🟡 Medio

- **Archivos clave:** `src/pages/chat/` (+ auditoría, 3 componentes); `src/components/feature/chat-widget/` (7); `chatService`; hooks `useChatAudit`, `useChatSession`; Edge Function `ask-sro-chat`.
- **Pruebas existentes:** ninguna.

#### 5.1.11 Manpower (recursos, reglas, forecast) — 🟥 Sin cobertura · 🟠 Alto

- **Archivos clave:** `src/pages/manpower/` (15 componentes + page); servicios `manpowerControlService`, `manpowerForecastService`, `manpowerResourcesService`, `manpowerRulesService`, `collaboratorsService`; util `manpowerForecastExcel.ts`.
- **Pruebas existentes:** ninguna.
- **Hallazgo:** cálculo de forecast y agregaciones diarias/semanales = lógica pura candidata a pruebas. `manpowerForecastExcel` también.

#### 5.1.12 Dashboard & Analítica — 🟥 Sin cobertura · 🟡 Medio

- **Archivos clave:** `src/pages/dashboard/` (12 componentes + page); `dashboardService`, `timeAnalyticsService`.
- **Pruebas existentes:** ninguna.

#### 5.1.13 Login / Auth / Sesión — 🟥 Sin cobertura · 🔴 Crítico

- **Archivos clave:** `src/pages/login/` (5 componentes + page); `AuthContext`, `ProtectedRoute`, `RequirePermission`, `usePermissions`, `SessionExpiredModal`, `access-pending`.
- **Pruebas existentes:** ninguna.
- **Hallazgo:** seguridad de acceso **sin pruebas**. Los guards de ruta y la resolución de permisos son críticos.

#### 5.1.14 Perfil / Home / Navegación — 🟥 Sin cobertura · ⚪ Bajo

- **Archivos clave:** `src/pages/perfil/`, `src/pages/home/`; `src/components/feature/sidebar/` (13), `src/components/feature/Navbar.tsx`.
- **Pruebas existentes:** ninguna.

---

### 5.2 Utilidades puras (src/utils)

Estas son las **más fáciles de probar** (sin I/O, sin red, deterministas) y, salvo una, **todas carecen de pruebas**.

| Utilidad | Propósito | Cobertura |
|---|---|---|
| `noShowRules.ts` | Regla No Arribó (decisión de marcado + reducción a 15 min) | 🟩 **27 casos** |
| `excelParser.ts` | Parseo de Excel (proveedores) | 🟥 |
| `timeProfileExcelParser.ts` | Parseo de perfiles de tiempo desde Excel | 🟥 |
| `manpowerForecastExcel.ts` | Parseo/export de forecast de manpower | 🟥 |
| `recurrenceUtils.ts` | Cálculo de recurrencias de reservas | 🟥 |
| `reservationQr.utils.ts` | Utilidades de QR de reservas | 🟥 |
| `sortDocks.ts` | Ordenamiento de andenes | 🟥 |
| `timezoneUtils.ts` | Conversión de zonas horarias | 🟥 |
| `providerFormat.ts` | Formateo/normalización de proveedores | 🟥 |
| `mediaCompression.ts` | Compresión de imágenes/media | 🟥 |
| `notificationSound.ts` | Sonidos de notificación | 🟥 |
| `lazyWithRetry.ts` | Lazy loading con reintento | 🟥 |

> **Hallazgo:** 1 de 13 utilidades puras tiene pruebas. Este es el **mayor "quick win"**: alto valor, bajo esfuerzo, sin dependencias externas.

---

### 5.3 Infraestructura frontend (contextos, hooks, guards, router)

- **Archivos clave:**
  - Contextos: `AuthContext`, `ActiveWarehouseContext`, `ClientPickupRulesContext`.
  - Hooks: `usePermissions`, `useUserScope`, `useBlockedStatuses`, `useDebouncedValue`, `useSessionStorageState`, `useSignedUrl`, `useReservationDraft`, `useMessaging`, `useChatSession`, `useChatAudit`, `useKnowledgeDocuments`.
  - Router: `router/config.tsx`, `router/index.ts`, `ProtectedRoute`, `RequirePermission`.
  - `ErrorBoundary`.
- **Pruebas existentes:** ninguna.
- **Hallazgo:** `usePermissions` y los guards del router son **críticos** de seguridad y no tienen pruebas. `useDebouncedValue` y `useSessionStorageState` son hooks puros y fáciles de testear.

---

### 5.4 Edge Functions (backend)

**43 Edge Functions, 0 con pruebas automatizadas.** Agrupadas por dominio:

| Grupo | Funciones | Cobertura | Criticidad |
|---|---|---|---|
| **API v1** | `api-v1-clients`, `api-v1-docks`, `api-v1-providers`, `api-v1-warehouses`, `api-v1-reservation-statuses`, `api-v1-reservations-get`, `api-v1-reservations-get-by-id`, `api-v1-reservations-patch-status`, `api-v1-casetilla-ingresos`, `api-v1-casetilla-salidas` | 🟥 (solo smoke test manual en Postman) | 🔴 Crítico (contrato público para la app móvil) |
| **Mensajería** | `msg-admin`, `msg-bootstrap`, `msg-cleanup`, `msg-conversation`, `msg-delete-message`, `msg-file-url`, `msg-messages`, `msg-send` (8) | 🟥 | 🟡 Medio |
| **Correspondencia / Email** | `correspondence-dispatch-event`, `correspondence-process-event`, `correspondence-retry-email`, `gmail-callback`, `gmail-connection-status`, `smtp-send` (6) | 🟥 | 🟠 Alto |
| **Administración** | `admin-users`, `admin-user-access`, `setup-admin-permissions` (3) | 🟥 | 🔴 Crítico (seguridad) |
| **Conocimiento** | `process-knowledge-document`, `reindex-knowledge-document` (2) | 🟥 | 🟡 Medio |
| **Casetilla / Reservas** | `create-reservation`, `auto-dispatch-internal-transfer`, `auto-mark-no-show` (**desactivada**) | 🟥 | 🔴 Crítico |
| **Infra / Migración / Fixes** | `fix-casetilla-storage-rls`, `fix-invoice-nullable`, `fix-provider-unique-index`, `generate-client-pickup-blocks`, `generate-missing-qrs`, `migrate-finalizada-to-despachado`, `setup-casetilla-storage`, `setup-knowledge-storage`, `sync-providers`, `sync-providers-excel` (10) | 🟥 | 🟠 Alto |

- **Hallazgos:**
  - Ninguna Edge Function tiene prueba. Las de API v1 son el **contrato con la app móvil** y solo están cubiertas por una colección Postman ejecutable a mano.
  - `api-v1-reservations-patch-status` (cambios de estado) es especialmente sensible: mueve el flujo IN/OUT y las reglas de secuencia.
  - `auto-mark-no-show` quedó **desactivada** (documentada); su lógica fue reemplazada por la función SQL como fuente única.

---

### 5.5 Base de datos / RPC / Triggers / RLS

| Objeto | Cobertura | Notas |
|---|---|---|
| Migraciones Fase 6.1 (IN/OUT) | 🟨 | Cubiertas por el paquete aislado (`supabase/inout-test/`): estructura, permisos, RLS, idempotencia, rollback, concurrencia. |
| Migraciones Fase 6.2 (motor de transiciones) | 🟨 | Cubiertas estructuralmente por `supabase/tests/`. Casos funcionales quedaron como `NOTICE` pendientes de datos. |
| RPC `transition_reservation_status` | 🟨 | Estructura verificada; comportamiento funcional no probado por falta de datos/roles en el script. |
| Función `auto_mark_no_show_v5()` | 🟥 | **Fuente de verdad única de No Arribó** (la corre el cron cada 5 min). No tiene prueba SQL automatizada propia. Es justo la que causó el incidente previo. |
| Helpers IN/OUT (`_inout_*`) | 🟨 | Verificados en Fase 6.2 (SECURITY DEFINER, search_path, sin EXECUTE público). |
| Triggers de `reservations` (`reservations_block_sensitive_updates`, `log_reservation_updated`, trigger de auto-dispatch) | 🟥 | Ningún trigger tiene prueba. Los de protección de campos sensibles y logging automático son importantes. |
| RLS general | 🟨 | Solo IN/OUT tiene prueba real de RLS. **El resto de las ~70 tablas no tiene prueba de políticas RLS.** |
| Migraciones sueltas (`add_menu_permissions`, `create_client_pickup_rules`, `seed_manpower_permissions`, `vehicle_types`, `actual_end_datetime`) | 🟥 | Sin pruebas de aplicación/rollback. |

---

## 6. Hallazgos transversales (riesgos)

1. **No hay runner de pruebas.** No existe script `test` ni framework (vitest/jest). La única prueba de frontend importa el runner nativo de TypeScript de Node y depende de **Node ≥ 23/24**. → No es reproducible en cualquier entorno ni integrable a CI tal como está.

2. **Cobertura global mínima.** 1 prueba unitaria sobre ~250 archivos de frontend + 43 Edge Functions + decenas de objetos SQL. Cobertura estimada **< 1 %**.

3. **Lógica de negocio duplicada y sin candado de pruebas.** La regla *No Arribó* existe en al menos 3 sitios y solo uno tiene prueba. Este es el **patrón de riesgo** que ya generó un incidente real. Cualquier regla replicada (No Arribó, transiciones de estado, secuencia por cliente) necesita una prueba que fije el comportamiento en un solo lugar.

4. **Ninguna Edge Function probada.** El contrato con la app móvil (API v1) depende solo de pruebas manuales de Postman. Un cambio de esquema de respuesta pasa desapercibido hasta que la app falla en producción.

5. **Ningún servicio de frontend probado.** Los ~41 servicios (casetilla, calendario, clientes, etc.) concentran la lógica de negocio y no tienen ni un test.

6. **Reglas de cliente sin cobertura.** Secuencia de estados, solapamiento, bloques de retiro y cutoff del mismo día son reglas de alto impacto operativo y 0 pruebas.

7. **Utilidades puras sin cubrir (12 de 13).** Alto retorno y bajo esfuerzo desaprovechado: parseo de Excel, zonas horarias, ordenamientos, recurrencias.

8. **Sin integración continua.** Nada ejecuta las pruebas automáticamente. Aun las que existen quedan "guardadas" y pueden quedar obsoletas sin que nadie lo note.

9. **La mejor prueba existente está "aislada".** `noShowRules.test.ts` y las suites SQL no comparten un comando común ni se reportan en un solo lugar.

10. **RLS mayormente sin verificar.** Solo el módulo IN/OUT tiene prueba de RLS real. El resto del esquema (datos de clientes, reservas, usuarios) no tiene prueba de políticas.

---

## 7. Matriz de priorización

Ordenado por **impacto × facilidad** (empezar arriba):

| Prioridad | Objetivo | Módulo | Esfuerzo |
|---|---|---|---|
| 1 | Montar el runner de pruebas (vitest) + script `npm test` + CI mínimo | Infraestructura | Bajo |
| 2 | Pruebas de utilidades puras: `timezoneUtils`, `sortDocks`, `providerFormat`, `recurrenceUtils`, `excelParser`, `timeProfileExcelParser` | src/utils | Bajo |
| 3 | Prueba SQL para `auto_mark_no_show_v5()` que fije exclusiones (importados, traslado interno) | Base de datos | Bajo–Medio |
| 4 | Pruebas de reglas de cliente: secuencia de estados, solapamiento, cutoff mismo día, traslado interno | Clientes/Reglas | Medio |
| 5 | Pruebas de `casetillaService` y `calendarService` (con superset de Supabase mockeado) | Casetilla / Calendario | Medio |
| 6 | Pruebas de contrato de la **API v1** (reservations patch-status, get, casetilla) | Edge Functions | Medio |
| 7 | Pruebas de Edge Function `auto-dispatch-internal-transfer` | Casetilla | Medio |
| 8 | Pruebas de RBAC (resolución de permisos, guards) | Admin / Auth | Medio–Alto |
| 9 | Pruebas de RLS para tablas críticas (reservations, clients) | Base de datos | Alto |
| 10 | Pruebas de triggers de `reservations` | Base de datos | Alto |

---

## 8. Plan de pruebas propuesto por fases (documentado, no ejecutado)

> Este plan es **propuesta**. No se implementó nada en esta tarea.

- **Fase 0 — Habilitar la infraestructura**
  - Agregar un runner (vitest) y un script `npm test` (respetando React 19).
  - Unificar cómo se corren las suites SQL y el paquete IN/OUT.
  - Definir un CI que ejecute `npm test` + `type-check` en cada push.

- **Fase 1 — Utilidades puras**
  - Cubrir las 12 utilidades sin prueba. Sin dependencias externas, alto retorno.

- **Fase 2 — Reglas de negocio (el corazón)**
  - Mantener `noShowRules` como está.
  - Agregar pruebas para las reglas de cliente (secuencia, solapamiento, pickup, cutoff, traslado interno).
  - Agregar prueba SQL para `auto_mark_no_show_v5()` que **ate** la regla a un solo lugar.

- **Fase 3 — Servicios frontend**
  - Probar `casetillaService`, `calendarService`, `providersService`, `clientsService` con cliente Supabase mockeado.

- **Fase 4 — Edge Functions**
  - Pruebas de contrato para la API v1 (forma de respuesta, códigos, validaciones).
  - Casos de `auto-dispatch-internal-transfer` y del flujo de transición de estados.

- **Fase 5 — Base de datos**
  - Automatizar los casos funcionales hoy pendientes en Fase 6.2 (requieren datos/roles).
  - Cubrir triggers de `reservations` y RLS de tablas críticas.

---

## 9. Anexo: cómo ejecutar las pruebas existentes

### 9.1 Prueba unitaria No-Show (frontend)

```bash
node src/utils/noShowRules.test.ts
```

Salida esperada: `27/27 pruebas OK`.

> Requiere Node ≥ 23/24 (runner nativo de TypeScript). En Node LTS podría no ejecutarse.

### 9.2 Suites SQL de Fase 6.2

Ejecutar el contenido de cada archivo en el **SQL Editor de Supabase**:

- `supabase/tests/phase_6_2_stages_1_2_3_tests.sql` → imprime `PASS`/`FAIL` por test (M1–M30).
- `supabase/tests/phase_6_2_transition_engine_tests.sql` → 30 tests estructurales; funcionales/integración quedaron como `NOTICE`.

### 9.3 Paquete aislado IN/OUT (Fase 6.1)

Requiere Docker, docker compose y `psql`.

```bash
# Linux / macOS
cd supabase/inout-test
chmod +x run-tests.sh test_concurrent_provisioning.sh
./run-tests.sh
```

```powershell
# Windows PowerShell (nativo)
cd supabase\inout-test
.\run-tests.ps1
```

Salida esperada: `RESULTADO: ALL TESTS PASSED` (o `N SCRIPT(S) FALLARON`).

### 9.4 Smoke test de API (manual)

Importar `api-postman-collection/Reservations_API.postman_collection.json` en Postman y ejecutar la colección.

---

## 10. Conclusión

El sistema **no** cuenta con pruebas unitarias del conjunto. Hoy existen, con buena calidad, **una** prueba unitaria de frontend (regla No Arribó) y suites de base de datos centradas en el **módulo IN/OUT (Fases 6.1 y 6.2)**. Todo lo demás —servicios de negocio, reglas de cliente, API v1, administración, dashboards, utilidades— está **sin cobertura**, sin runner unificado y sin integración continua.

El riesgo más importante es el **patrón de lógica duplicada**: reglas de negocio que existen en varios lugares y donde solo una copia tiene prueba (caso *No Arribó*, que ya provocó un incidente). Cerrar ese patrón con pruebas es la prioridad número uno después de habilitar la infraestructura.

**Siguiente paso recomendado:** habilitar el runner de pruebas (Fase 0) y atacar las utilidades puras y la prueba SQL de `auto_mark_no_show_v5()` (prioridades 1–3 de la matriz), que dan el mayor retorno con el menor esfuerzo.

---

*Documento generado como auditoría. No se modificó ningún archivo de código del sistema.*