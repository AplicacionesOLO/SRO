# PERFORMANCE REFERENCE — Suite OLO / App Hub Manager

> **Documentación Enterprise-Grade | Segunda Pasada**
> Basado exclusivamente en el código fuente (v1199)

---

## QUERIES COSTOSAS IDENTIFICADAS

### 1. `useUserScope` — 6 queries secuenciales
- **Impacto**: ALTO — se ejecuta en cada carga de página
- **Queries**: user_country_access → user_warehouse_access → warehouses (intersección) → warehouses (datos) → warehouse_clients → user_clients → clients
- **Optimización**: Cache 5 min reduce impacto en navegación subsecuente

### 2. `getPendingReservations` (Casetilla) — RPC + 4 queries de enriquecimiento
- **Impacto**: ALTO en páginas de casetilla
- **Queries**: RPC get_pending_reservations_v4 → docks → warehouses → providers → cargo_types
- **Optimización**: RPC ya filtra en BD, pero el enriquecimiento hace N+1 implícito

### 3. `getProviderAssignments` — Barrido completo de tablas pivote
- **Impacto**: ALTO con >1000 proveedores
- **Queries**: provider_warehouses (paginado 1000) + client_providers (paginado 1000) + warehouse_clients
- **Optimización**: `getProviderAssignmentsOptimized` ya reduce a solo providers visibles

### 4. `getDocks` con segregación — 3 queries
- **Impacto**: MEDIO
- **Queries**: docks + dock_categories + dock_statuses → client_docks (segregación) → warehouses (timezones)
- **Optimización**: Cache 2 min (segregationCache)

### 5. `getExitEligibleReservations` — Joins anidados
- **Impacto**: ALTO en Casetilla
- **Queries**: reservation_statuses → casetilla_ingresos → casetilla_salidas (loteado) → reservations → docks → warehouses → providers
- **Loteo**: BATCH_SIZE=50 para evitar URLs largas

### 6. `dashboardService.getStats` — 6 queries en paralelo
- **Impacto**: ALTO en carga inicial del dashboard
- **Queries**: 6 queries de reservations para diferentes períodos + statuses + docks + warehouses + providers + collaborators

---

## CACHES Y TTL

| Cache | Ubicación | TTL | Tipo |
|-------|----------|-----|------|
| scopeCache | `useUserScope.ts` | 5 min | Memoria (Map) |
| dockIdsCache | `calendarService.ts` | 2 min | Memoria (Map) |
| segregationCache | `calendarService.ts` | 2 min | Memoria (Map) |
| statusesCache | `calendarService.ts` | 5 min | Memoria (Map) |
| categoriesCache | `calendarService.ts` | 5 min | Memoria (Map) |
| origenCache | `providersService.ts` | 1 min | Memoria (var) |
| PermissionsSet | `AuthContext.tsx` | Sesión | React State |
| activeWarehouse | `ActiveWarehouseContext.tsx` | ∞ | localStorage |
| reservationDraft | `useReservationDraft.ts` | 7 días | localStorage |
| configCacheRef (blocked) | `useBlockedStatuses.ts` | Sesión | useRef Map |

---

## N+1 QUERIES POTENCIALES

| Escenario | Query N+1 | Solución Actual |
|-----------|----------|----------------|
| Casetilla pending reservations | provider names | Resuelto: carga todos los providerIds en una query |
| Casetilla exit eligible | provider names | Resuelto: carga en batch |
| Calendario reservations | creator profiles | Resuelto: carga todos los creatorIds en una query |
| Dock time blocks | creator profiles | Resuelto: carga en batch |
| Correspondence logs | rule names | Parcial: carga ruleIds en una query |
| Provider assignments | client names | Puede causar query extra para client_id directo |

---

## PAGINACIÓN

| Entidad | Estrategia | Page Size |
|---------|-----------|-----------|
| Providers (todos) | Bloques de 1000 (while loop) | 1000 |
| Providers (búsqueda) | Server-side ilike + limit | 25 |
| Providers (warehouse) | Bloques de 1000 | 1000 |
| Client providers | Bloques de 1000 (while loop) | 1000 |
| Reservations (API) | Server-side range | max 200 |
| Casetilla ingresos (API) | Server-side range | max 200 |
| Chat audit logs | loadMore manual | 50 |
| Auth users (EF) | Paginación completa (max 20 páginas) | 50/page, 20 pages max |

---

## BATCH OPERATIONS

| Operación | Batch Size | Archivo |
|-----------|-----------|---------|
| Casetilla salidas (exclusion check) | 50 | `casetillaService.ts` |
| Auto no-show update | 50 | `auto-mark-no-show/index.ts` |
| Client pickup blocks insert | 200 (con fallback individual) | `generate-client-pickup-blocks/index.ts` |
| Provider assignments (URL length) | N/A (filtro en memoria) | `providersService.ts` |
| Client providers list | 1000 | `clientsService.ts` |

---

## RE-RENDER CONOCIDOS

| Componente | Causa | Impacto |
|-----------|-------|---------|
| App (árbol completo) | Cambio en AuthContext | ALTO (inevitable) |
| SchedulerView | Cambio en ActiveWarehouseContext | MEDIO |
| SchedulerView | Cambio en ClientPickupRulesContext | BAJO (solo lastRuleChange) |
| ChatWindow | Optimistic message en sendMessage | BAJO (controlado) |

---

## BOTTLENECKS

| Bottleneck | Causa | Severidad |
|-----------|-------|-----------|
| Carga inicial de calendario | getReservations + getDocks + getVisibleDockIds + getDockTimeBlocks | ALTO |
| Carga de casetilla | getPendingReservations (RPC + enriquecimiento) | ALTO |
| Sincronización proveedores | API externa + procesamiento secuencial | MEDIO |
| Generación bloques cliente retira | Cálculo de bloques × días × reglas | MEDIO |
| Correspondencia (email dispatch) | Procesamiento secuencial de reglas | BAJO |
| OpenAI chat | Latencia de API externa (1-3s típico) | MEDIO |

---

## OPTIMIZACIONES POSIBLES

1. **useUserScope**: Consolidar queries 1-3 en una sola RPC
2. **getDocks + getReservations**: Paralelizar con Promise.all (ya se hace parcialmente)
3. **Casetilla**: Mover enriquecimiento a RPC
4. **Provider assignments**: Usar vista materializada
5. **Dashboard**: Mover agregaciones a RPC
6. **Calendario**: Virtual scrolling para docks (si hay >30)
7. **Chat**: Stream tokens de OpenAI (en lugar de esperar respuesta completa)
8. **Imágenes**: Lazy loading para fotos de casetilla