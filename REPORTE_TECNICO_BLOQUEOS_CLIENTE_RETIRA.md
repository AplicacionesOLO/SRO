# REPORTE TÉCNICO: BLOQUEO DE TIEMPO Y REGLA CLIENTE RETIRA — SRO
**Fecha de análisis:** 2026-03-27  
**Propósito:** Diagnóstico exhaustivo end-to-end del comportamiento técnico de ambos sistemas, desde la base de datos hasta el frontend, para identificar fallos y tomar decisiones informadas.

---

## ÍNDICE
1. [Arquitectura general — los dos sistemas](#1-arquitectura-general)
2. [Base de datos — tablas involucradas](#2-base-de-datos)
3. [Sistema A: Bloqueo Manual](#3-sistema-a-bloqueo-manual)
4. [Sistema B: Cliente Retira (bloques automáticos)](#4-sistema-b-cliente-retira)
5. [Edge Function: generate-client-pickup-blocks](#5-edge-function)
6. [Frontend — Calendario](#6-frontend--calendario)
7. [Frontend — Gestión de Bloqueos (pestaña Bloqueos)](#7-frontend--gestión-de-bloqueos)
8. [Contexto de propagación de cambios](#8-contexto-de-propagación)
9. [Permisos involucrados](#9-permisos)
10. [Hallazgos y posibles causas de fallos](#10-hallazgos-y-posibles-causas-de-fallos)
11. [Diagrama de flujo resumido](#11-diagrama-de-flujo-resumido)

---

## 1. ARQUITECTURA GENERAL

El sistema tiene **DOS mecanismos de bloqueo** que convergen en la misma tabla `dock_time_blocks`. Se diferencian únicamente por el campo `reason`:

| Tipo | Campo `reason` | Creado por |
|------|---------------|------------|
| **Bloqueo Manual** | Texto libre (ej: "Mantenimiento") | Usuario desde el calendario |
| **Cliente Retira** | `CLIENT_PICKUP:{rule_uuid}` | Edge Function automática |

Ambos tipos son tratados como "bloqueos" en el calendario. El frontend los distingue mediante `reason.startsWith('CLIENT_PICKUP:')`.

---

## 2. BASE DE DATOS

### 2.1 Tabla principal: `public.dock_time_blocks`

| Columna | Tipo | Nullable | Default | Notas |
|---------|------|----------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `org_id` | uuid | NO | — | FK a organizations |
| `dock_id` | uuid | NO | — | FK a docks |
| `start_datetime` | timestamptz | NO | — | Inicio del bloqueo |
| `end_datetime` | timestamptz | NO | — | Fin del bloqueo |
| `reason` | text | NO | — | Texto libre O `CLIENT_PICKUP:{id}` |
| `created_by` | uuid | NO | `'00000000-0000-0000-0000-000000000000'` | FK a profiles (puede ser SYSTEM_USER_ID) |
| `created_at` | timestamptz | YES | now() | — |
| `is_cancelled` | boolean | YES | false | ⚠️ CAMPO EXISTENTE PERO NO USADO en el frontend |

> **HALLAZGO CRÍTICO #1:** La columna `is_cancelled` existe en la tabla pero **nunca se usa en el frontend**. Las queries de calendario y de gestión de bloqueos no filtran por este campo. Si hay bloques con `is_cancelled = true`, aún aparecerán en el calendario.

### 2.2 Tabla de reglas: `public.client_pickup_rules`

| Columna | Tipo | Nullable | Default | Notas |
|---------|------|----------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `org_id` | uuid | NO | — | — |
| `client_id` | uuid | NO | — | FK a clients |
| `dock_id` | uuid | NO | — | FK a docks |
| `block_minutes` | integer | NO | — | Duración del bloqueo en minutos |
| `reblock_before_minutes` | integer | NO | 10 | Minutos antes del vencimiento para renovar |
| `is_active` | boolean | NO | true | Soft disable |
| `created_at` | timestamptz | NO | now() | — |
| `updated_at` | timestamptz | NO | now() | — |

### 2.3 Tabla de reglas de cliente (LEGACY + ACTIVA): `public.client_rules`

| Columna | Tipo | Default | Notas |
|---------|------|---------|-------|
| `dock_allocation_mode` | text | 'NONE' | SEQUENTIAL / ODD_FIRST / NONE |
| `allow_all_docks` | boolean | false | — |
| `edit_cutoff_hours` | integer | 0 | — |
| `client_pickup_enabled` | boolean | false | ⚠️ CAMPO LEGACY — no se usa |
| `client_pickup_dock_id` | uuid | null | ⚠️ CAMPO LEGACY — no se usa |
| `client_pickup_block_minutes` | integer | 0 | ⚠️ CAMPO LEGACY — no se usa |
| `client_pickup_reblock_before_minutes` | integer | 10 | ⚠️ CAMPO LEGACY — no se usa |

> **HALLAZGO CRÍTICO #2:** La tabla `client_rules` contiene campos legados (`client_pickup_enabled`, `client_pickup_dock_id`, etc.) que fueron el diseño original del sistema. Hoy el sistema usa `client_pickup_rules` (tabla separada, multi-andén). Sin embargo, esos campos siguen existiendo en la BD y **podrían causar confusión** si algún código viejo los lee.

### 2.4 Tabla de andenes de cliente: `public.client_docks`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | uuid | PK |
| `org_id` | uuid | — |
| `client_id` | uuid | FK |
| `dock_id` | uuid | FK |
| `created_at` | timestamptz | — |
| `dock_order` | integer | **Nullable** — define orden de asignación |

> **HALLAZGO #3:** `dock_order` es nullable. Si un andén no tiene `dock_order`, su orden de asignación cae a `999` (hardcoded en el servicio). Esto puede producir comportamientos inesperados en el modo `ODD_FIRST`.

---

## 3. SISTEMA A: BLOQUEO MANUAL

### Flujo de creación

```
Usuario hace clic en "Bloquear Tiempo" (calendario)
  → BlockModal se abre (selectedBlock = null)
  → Usuario completa: dock, start, end, reason
  → Opcional: activa "Bloqueo persistente" (toggle)
  
[Caso NO persistente]
  → calendarService.createDockTimeBlock()
  → INSERT INTO dock_time_blocks (org_id, dock_id, start_datetime, end_datetime, reason, created_by)
  → El calendar recarga: loadData() + cache.clear()

[Caso PERSISTENTE]
  → calendarService.createPersistentDockTimeBlock()
  → Calcula ocurrencias (día por día, filtrando por weekdays seleccionados)
  → Por cada ocurrencia: INSERT individual
  → Si INSERT falla con código P0001 (trigger de overlap con CLIENT_PICKUP) → skip silencioso
  → Retorna { created: N, skipped: M }
```

### Flujo de edición

```
Usuario hace clic en un bloque en el calendario
  → handleSelectSlot({ eventType: 'block', data: block })
  → BlockModal se abre con block = selectedBlock (modo solo lectura si sin permisos)
  → Si canBlockUpdate O canBlockDelete → permite editar/eliminar
  → calendarService.updateDockTimeBlock(id, { dock_id, start, end, reason })
  → UPDATE dock_time_blocks WHERE id = ?
```

### Flujo de eliminación

```
BlockModal → botón "Eliminar" (requiere dock_blocks.delete)
  → ConfirmModal
  → calendarService.deleteDockTimeBlock(id)
  → DELETE FROM dock_time_blocks WHERE id = ?
```

### Validaciones del modal

- `start_datetime` < `end_datetime` (validación frontend)
- Todos los campos requeridos (dock, start, end, reason)
- Para persistente: al menos un día seleccionado
- **No hay validación de overlap manual** → depende del trigger de BD (P0001)

### Cómo se renderiza en el calendario

```typescript
// En page.tsx — capa de bloques
blocks
  .filter(b => b.dock_id === dock.id && sameDay(b.start_datetime, day))
  .map(block => {
    const clamped = clampEventToBusinessHours(day, start, end);
    // Render: bg-gray-400, texto "Bloqueado", reason truncado
  })
```

Todos los bloques (manuales y de cliente) se renderizan con el mismo estilo gris.

---

## 4. SISTEMA B: CLIENTE RETIRA (BLOQUES AUTOMÁTICOS)

### Configuración (Admin → Clientes → Reglas → Cliente Retira)

Ubicación en UI: `Admin > Clientes > [cliente] > Reglas (tab) > sección "Cliente Retira"`  
Componente: `ClientPickupRulesTab`  
Servicio: `clientPickupRulesService.ts`

**Campos configurables por regla:**
- `dock_id` — andén a bloquear (no modificable tras crear)
- `block_minutes` — duración del bloqueo (desde inicio del horario del almacén)
- `reblock_before_minutes` — minutos antes del vencimiento para renovar automáticamente
- `is_active` — activa/inactiva

**Restricción de unicidad:** Solo puede haber una regla activa por `(client_id, dock_id)`. El código 23505 de Postgres captura esto.

### Flujo de creación de regla

```
Admin configura regla → clientPickupRulesService.create()
  → INSERT INTO client_pickup_rules (...)
  → triggerBlockGeneration(orgId, ruleId)      ← llama a la Edge Function
  → clientPickupRulesService.regenerateBlocks() ← segunda llamada (redundante pero segura)
  → notifyRuleChanged([dock_id])               ← propaga al calendario vía contexto
```

### Flujo cuando se desactiva una regla

```
handleToggleActive(rule) → rule.is_active = true
  → clientPickupRulesService.deactivate(orgId, ruleId)
      UPDATE client_pickup_rules SET is_active = false
  → clientPickupRulesService.deleteBlocksForRule(orgId, ruleId)
      DELETE FROM dock_time_blocks WHERE reason = 'CLIENT_PICKUP:{ruleId}'
  → notifyRuleChanged([dock_id])
```

### Flujo cuando se elimina una regla

```
handleDelete(rule)
  → clientPickupRulesService.deleteBlocksForRule(orgId, ruleId)
      DELETE FROM dock_time_blocks WHERE reason = 'CLIENT_PICKUP:{ruleId}'
  → clientPickupRulesService.deleteRule(orgId, ruleId)
      DELETE FROM client_pickup_rules WHERE id = ruleId
  → notifyRuleChanged([dock_id])
```

> **HALLAZGO #4:** El orden en `handleDelete` es correcto: primero se borran los bloques, luego la regla. Pero existe una **condición de carrera**: si la Edge Function se está ejecutando justo en ese instante, puede reinsertar bloques después de que el DELETE ya corrió.

---

## 5. EDGE FUNCTION: `generate-client-pickup-blocks`

### Parámetros de entrada

```json
{
  "org_id": "uuid",           // requerido
  "days_ahead": 30,           // opcional, default 30
  "force_regenerate": false,  // si true: borra TODOS los futuros y regenera
  "rule_id": "uuid",          // opcional: procesar solo esta regla
  "dock_id": "uuid"           // opcional: procesar solo reglas de este andén
}
```

### Algoritmo de generación (paso a paso)

```
1. FETCH reglas activas de client_pickup_rules (filtradas por rule_id/dock_id si aplica)

2. FETCH docks (solo id + warehouse_id) de los andenes involucrados

3. FETCH warehouses (id + business_start_time + business_end_time) de esos almacenes

4. Si force_regenerate = true:
   → DELETE todos los bloques futuros con reason IN ['CLIENT_PICKUP:{id1}', ...]
   → Continúa con generación completa

5. Para HOY (fecha actual CR):
   → DELETE bloques del día de hoy para las reglas procesadas
   → Recalcula posición actual: getDynamicStartMinutesForToday()
     - Si ahora < business_start → bloque empieza en business_start
     - Si ahora >= business_end → no se crea bloque
     - Si ahora está dentro del horario → calcula qué "ciclo" de renovación corresponde:
         offset = floor((ahora - start + reblock_before_minutes) / block_minutes)
         start = business_start + offset * block_minutes

6. Para fechas FUTURAS (días 1 a days_ahead):
   → Verifica si ya existe un bloque para esa regla+fecha (set de claves "ruleId:dateStr")
   → Si ya existe Y no es force_regenerate → skip (idempotente)
   → Si no existe → genera el bloque:
       start_datetime = {fecha}T{business_start_time}{CR_OFFSET}
       end_datetime   = start + min(block_minutes, business_end - business_start) minutos

7. INSERT en batches de 200:
   → Intento batch completo primero
   → Si falla P0001 (conflicto trigger) → fallback row-by-row saltando conflictos
   → Cualquier otro error → re-throw
```

### Zona horaria

La Edge Function trabaja **exclusivamente en América/Costa Rica (UTC-6)**. Usa el offset hardcoded `-06:00` para construir los datetimes. Esto significa:

```typescript
const iso = `${dateStr}T${HH}:${MM}:00-06:00`;
```

> **HALLAZGO CRÍTICO #5 — POSIBLE CAUSA DE FALLO:** Si el almacén cambia de horario, o si hay ajuste de horario de verano (aunque CR no lo tiene), los bloques generados podrían quedar desalineados con el horario real del almacén en el calendario.

### Autenticación en la Edge Function

```typescript
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
```

Los bloques generados automáticamente se crean con `created_by = SYSTEM_USER_ID`. Este UUID **NO existe en la tabla `profiles`**. El frontend maneja esto con:

```typescript
block.creator?.name || 'Sistema'
```

Pero el JOIN para obtener el creador en `getDockTimeBlocks` usa:
```typescript
const { data: profiles } = await supabase
  .from('profiles')
  .select('id, name, email')
  .in('id', creatorIds);
```
→ No encuentra el UUID del sistema → `profileMap.get(SYSTEM_USER_ID)` = undefined → se muestra "Sistema". Esto es correcto y esperado.

### Idempotencia

La función es **idempotente para días futuros**: si ya existe un bloque para `ruleId:dateStr`, no lo vuelve a crear. Para el día actual, **siempre borra y recrea** (para ajustar al momento del día).

---

## 6. FRONTEND — CALENDARIO

### Carga de datos (`calendarService.getDockTimeBlocks`)

```typescript
// Query actual:
supabase
  .from('dock_time_blocks')
  .select('*')
  .eq('org_id', orgId)
  .gte('start_datetime', startDate)
  .lte('start_datetime', endDate)
  .order('start_datetime', { ascending: true })
```

> **HALLAZGO CRÍTICO #6:** La query usa `lte('start_datetime', endDate)`. Esto significa que **solo trae bloques cuyo START está dentro del rango visible**. Si un bloque empezó ayer y termina hoy (multi-día), **NO aparece en el calendario** para el día de hoy.

> **HALLAZGO #7:** No filtra por `is_cancelled`. Si existieran bloques cancelados, aparecerían en el calendario.

### Renderizado de bloques en el calendario

Los bloques aparecen como rectángulos grises sobre la grilla. La función `clampEventToBusinessHours` asegura que los bloques que caen fuera del horario hábil se recorten visualmente (o se oculten si no hay solapamiento).

```typescript
// Render de bloques — página calendario
{blocks
  .filter(b => b.dock_id === dock.id && b.start_datetime matchea el día)
  .map(block => {
    const clamped = clampEventToBusinessHours(day, start, end);
    if (!clamped) return null; // Se oculta si está fuera de horario
    // Renderiza: fondo gris, texto "Bloqueado", reason truncada
  })}
```

### Sistema de caché

El calendario usa un `Map` (cacheRef) para evitar refetch. La clave del caché incluye:
```
`${orgId}:${bufferStart}:${bufferEnd}:${warehouseId}:${filterCategory}`
```

El caché se limpia (`cacheRef.current.clear()`) cuando:
- Se guarda/edita/elimina un bloqueo manual
- Se detecta cambio en `lastRuleChange` (contexto de Cliente Retira)
- Se cambia de almacén
- Se crea/mueve una reserva

> **HALLAZGO #8:** El caché almacena hasta 10 entradas. Si navega por muchas combinaciones de fechas/almacenes, las entradas más viejas se descartan. Esto es correcto.

### Sincronización en tiempo real con reglas de Cliente Retira

```typescript
// En calendario/page.tsx
useEffect(() => {
  if (lastRuleChange === 0 || !ready) return;
  if (!ruleChangeInitialMountRef.current) {
    ruleChangeInitialMountRef.current = true;
    return; // evita doble carga en mount inicial
  }
  cacheRef.current.clear();
  loadData();
}, [lastRuleChange, ready, loadData]);
```

El flag `ruleChangeInitialMountRef` evita que el efecto recargue datos en el primer render (cuando `lastRuleChange` ya tenía un valor del contexto). Solo recarga si el valor **cambió mientras el componente estaba montado**.

### Modo selección (pre-reserva)

Al crear una reserva, el calendario entra en "modo selección":
1. Se muestra un banner verde
2. Las celdas se marcan en verde/gris según elegibilidad
3. `isSlotEligible()` verifica:
   - No es pasado
   - Dentro del horario hábil del almacén
   - Sin conflicto con reservas existentes
   - Sin conflicto con bloques (incluyendo CLIENT_PICKUP)
   - Andenes habilitados según reglas del cliente (`dockAllocationService`)

---

## 7. FRONTEND — GESTIÓN DE BLOQUEOS (PESTAÑA "BLOQUEOS")

### Acceso

La pestaña "Bloqueos" solo es visible si el usuario tiene el permiso `dock_blocks.view`. Esto se verifica en `calendario/page.tsx`:

```typescript
const canViewBlocks = useMemo(() => can('dock_blocks.view'), [can]);
// ...
{canViewBlocks && (
  <button onClick={() => setTabMode('blocks')}>Bloqueos</button>
)}
```

### Carga de datos (`getAllDockTimeBlocksForManagement`)

```typescript
supabase
  .from('dock_time_blocks')
  .select('*')
  .eq('org_id', orgId)
  .order('start_datetime', { ascending: false })
// SIN filtro de fechas — trae TODOS los bloqueos históricos
```

Luego enriquece con JOINs manuales:
- `profiles` → para mostrar `creator.name`
- `docks` (con `reference` y `category`) → para mostrar el nombre del andén

### Identificación de tipo de bloqueo

```typescript
const isClientPickupBlock = (reason: string) =>
  reason?.startsWith('CLIENT_PICKUP:');
```

Los bloques de tipo "Cliente Retira" se muestran como **"Solo lectura"** en la columna de acciones. No pueden editarse ni eliminarse desde esta interfaz. Para gestionarlos, hay que ir a Admin → Clientes → Reglas.

### Filtros disponibles

| Filtro | Opciones | Default |
|--------|----------|---------|
| Búsqueda | texto libre | — |
| Andén | dropdown con todos los andenes | "Todos" |
| Tipo | Todos / Manuales / Cliente Retira | **Manuales** |
| Estado | Todos / Activos / Vencidos | **Activos** |

> **HALLAZGO #9:** El filtro por defecto muestra solo **bloqueos manuales activos**. Un usuario que acaba de entrar a la pestaña puede pensar que no hay bloqueos de Cliente Retira si no cambia el filtro.

---

## 8. CONTEXTO DE PROPAGACIÓN

```
ClientPickupRulesProvider (en App.tsx)
  ├── ClientPickupRulesTab (Admin → Clientes)
  │   └── notifyRuleChanged([dock_id])  ← cuando crea/edita/elimina/activa/desactiva regla
  │
  └── CalendarioPage
      └── useEffect([lastRuleChange])  ← recibe la señal y recarga bloques
```

El contexto expone:
- `lastRuleChange`: timestamp Unix del último cambio
- `affectedDockIds`: andenes afectados (actualmente NO se usa para filtrar la recarga, se recarga todo)
- `notifyRuleChanged(dockIds)`: función para disparar la notificación

> **HALLAZGO #10:** `affectedDockIds` se guarda en el contexto pero el calendario **siempre recarga todo** (`loadData()` sin filtrar por esos dock IDs). Es correcto en términos de consistencia, pero subóptimo en rendimiento.

---

## 9. PERMISOS

| Permiso | Qué controla |
|---------|-------------|
| `dock_blocks.view` | Ver la pestaña "Bloqueos" en el calendario |
| `dock_blocks.create` | Botón "Bloquear Tiempo" en el calendario + botón "Nuevo Bloqueo" en la pestaña |
| `dock_blocks.update` | Botón editar en la tabla de gestión + guardar cambios en BlockModal |
| `dock_blocks.delete` | Botón eliminar en tabla + botón "Eliminar" dentro del BlockModal |
| `admin.matrix.update` | Habilita el botón "Renovar" (solo admins con acceso full) |
| `calendar.view` | Ver el calendario completo (guard principal) |

Los bloques de "Cliente Retira" siempre son **Solo lectura** en la interfaz de bloqueos, independientemente de los permisos.

---

## 10. HALLAZGOS Y POSIBLES CAUSAS DE FALLOS

### CRÍTICOS (pueden causar comportamiento incorrecto visible)

#### 🔴 HALLAZGO #1 — `is_cancelled` ignorado en bloques
La tabla `dock_time_blocks` tiene `is_cancelled boolean DEFAULT false`, pero ninguna query del frontend lo filtra. Si en algún momento se cancelaron bloques (o se importaron datos con ese campo en true), siguen apareciendo en el calendario.

**Impacto:** Bloques "fantasma" en el calendario que no deberían mostrarse.

#### 🔴 HALLAZGO #5 — Zona horaria hardcoded en Edge Function
La Edge Function usa `'-06:00'` hardcoded para construir los datetimes. Si el almacén tiene `business_start_time = '07:00:00'`, el bloque se crea a las `07:00:00-06:00` (13:00 UTC). El calendario también interpreta en CR time. En principio debería coincidir, pero si hay algún almacén configurado con otra zona horaria implícita, los bloques aparecerán desplazados.

**Impacto:** Bloques de Cliente Retira que aparecen en el horario incorrecto en el calendario.

#### 🔴 HALLAZGO #6 — Query de bloques por `start_datetime` solamente
La query `getDockTimeBlocks` filtra por `gte('start_datetime', startDate)`. Un bloque que empezó hace 2 días y dura 3 días (termina mañana) **no aparece** en los días que están dentro del rango visible pero cuyo `start` está fuera.

**Impacto:** Bloques largos (multi-día) no se muestran correctamente en el calendario.

### MODERADOS (comportamiento confuso o subóptimo)

#### 🟡 HALLAZGO #2 — Campos legacy en `client_rules`
Existen `client_pickup_enabled`, `client_pickup_dock_id`, `client_pickup_block_minutes`, `client_pickup_reblock_before_minutes` en `client_rules`. Son del diseño original. El sistema actual ignora estos campos y usa `client_pickup_rules`. No causan errores activos, pero podrían confundir si alguien lee directamente la BD.

#### 🟡 HALLAZGO #3 — `dock_order` nullable
Si un andén en `client_docks` no tiene `dock_order`, el servicio le asigna `999`. En modo ODD_FIRST, los andenes sin orden se van al final de los "pares" (999 % 2 = 1, sería odd... curiosamente). Podría causar asignación incorrecta.

#### 🟡 HALLAZGO #4 — Condición de carrera al eliminar regla
Al eliminar una regla de Cliente Retira: se borran bloques → se elimina la regla. Si la Edge Function se dispara en ese instante (por otra acción simultánea), podría recrear los bloques después de que el DELETE corrió, con una regla que ya no existe.

#### 🟡 HALLAZGO #9 — Filtros default en pestaña Bloqueos
El filtro default es "Manuales / Activos". Los bloques de Cliente Retira no son visibles sin cambiar manualmente el filtro a "Todos" o "Cliente Retira".

### INFORMATIVOS

#### 🔵 HALLAZGO #7 — Sin filtro de `is_cancelled` en bloques
Duplicado del #1 pero para la pestaña de gestión: `getAllDockTimeBlocksForManagement` tampoco filtra por `is_cancelled`.

#### 🔵 HALLAZGO #8 — Caché de 10 entradas
El caché puede quedar "sucio" si en una misma sesión se navega mucho sin refrescar. Aunque se limpia en operaciones de escritura, podría mostrar datos desactualizados en escenarios de múltiples usuarios simultáneos.

#### 🔵 HALLAZGO #10 — Recarga total ante cambio de regla
Al cambiar una regla de Cliente Retira, el calendario recarga TODOS los datos (docks, reservas, bloques, statuses, categories), no solo los bloques del andén afectado.

---

## 11. DIAGRAMA DE FLUJO RESUMIDO

```
┌─────────────────────────────────────────────────────────┐
│                   CREACIÓN DE BLOQUEO MANUAL             │
│                                                          │
│  [Calendario] → Botón "Bloquear Tiempo"                  │
│       ↓                                                  │
│  BlockModal (dock, start, end, reason, ¿persistente?)    │
│       ↓                                                  │
│  calendarService.createDockTimeBlock()                   │
│       ↓                                                  │
│  INSERT dock_time_blocks (reason = texto libre)          │
│       ↓                                                  │
│  cache.clear() + loadData() → bloque aparece en UI       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              CREACIÓN DE REGLA CLIENTE RETIRA            │
│                                                          │
│  [Admin → Clientes → Reglas] → Agregar regla             │
│       ↓                                                  │
│  ClientPickupRulesTab → clientPickupRulesService.create() │
│       ↓                                                  │
│  INSERT client_pickup_rules                              │
│       ↓                                                  │
│  triggerBlockGeneration() → supabase.functions.invoke()  │
│       ↓                                                  │
│  Edge Function: generate-client-pickup-blocks            │
│    1. Lee reglas activas                                 │
│    2. Lee docks → obtiene warehouse                      │
│    3. Lee warehouses → horario hábil                     │
│    4. Borra bloques de HOY para esta regla               │
│    5. Genera bloques: hoy (dinámico) + N días futuros    │
│    6. INSERT en batches de 200 (con fallback row-by-row) │
│       ↓                                                  │
│  reason = 'CLIENT_PICKUP:{rule.id}' para c/bloque        │
│       ↓                                                  │
│  notifyRuleChanged([dock_id]) → ClientPickupRulesContext │
│       ↓                                                  │
│  Calendario recibe cambio → cache.clear() + loadData()  │
│       ↓                                                  │
│  Bloques de cliente aparecen en calendario (gris)        │
│  Marcados como "Solo lectura" en pestaña Bloqueos        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│           CÓMO EL CALENDARIO CARGA LOS BLOQUES           │
│                                                          │
│  getDockTimeBlocks(orgId, startDate, endDate)            │
│    SELECT * FROM dock_time_blocks                        │
│    WHERE org_id = ?                                      │
│      AND start_datetime >= startDate   ← SOLO START      │
│      AND start_datetime <= endDate     ← (no por end)    │
│    ORDER BY start_datetime ASC                           │
│       ↓                                                  │
│  JOIN manual a profiles (para creator name)              │
│       ↓                                                  │
│  Renderizado: gris, z-index 20, pointer-events-auto      │
│  Click en bloque: abre BlockModal (solo lectura por def) │
└─────────────────────────────────────────────────────────┘
```

---

## RESUMEN EJECUTIVO

El sistema funciona correctamente en el **flujo feliz**: crear una regla → Edge Function genera bloques → calendario los muestra. Los problemas potenciales son:

1. **Bloques multi-día no visibles** (query por start_datetime solamente) — puede ser la causa de que "falten" bloques de Cliente Retira que deberían verse.

2. **`is_cancelled` nunca usado** — si existe algún proceso que cancela bloques en la BD directamente, no se refleja en la UI.

3. **Campos legacy en `client_rules`** — no causan bugs activos pero indican que hubo un rediseño del modelo de datos que no se limpió.

4. **Zona horaria hardcoded** — riesgo bajo para CR pero frágil si el sistema se expande a otras zonas.

5. **Condición de carrera entre Edge Function y eliminación de reglas** — riesgo bajo pero existe.

---

*Reporte generado automáticamente mediante análisis de código fuente y esquema de base de datos.*
