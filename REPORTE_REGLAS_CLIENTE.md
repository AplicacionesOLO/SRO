# Reporte Técnico: Reglas de Cliente
**Fecha del reporte:** 2026-03-17  
**Versión del sistema:** Build 726  
**Módulo:** Admin → Clientes → Pestaña "Reglas"

---

## Índice

1. [Estructura General](#1-estructura-general)
2. [Tablas de Base de Datos](#2-tablas-de-base-de-datos)
3. [Regla: Cutoff de Edición](#3-regla-cutoff-de-edición)
4. [Regla: Modo de Asignación de Andenes (Secuencial / Intercalado)](#4-regla-modo-de-asignación-de-andenes)
5. [Regla: Cliente Retira](#5-regla-cliente-retira)
6. [Edge Function: generate-client-pickup-blocks](#6-edge-function-generate-client-pickup-blocks)
7. [Flujo Completo de Guardado](#7-flujo-completo-de-guardado)
8. [Estado Actual y Observaciones](#8-estado-actual-y-observaciones)

---

## 1. Estructura General

La pestaña **"Reglas"** del drawer de un cliente se divide en **dos secciones independientes**:

```
┌─────────────────────────────────────────────────────┐
│  SECCIÓN 1: Reglas de Operación del Cliente         │
│  • Cutoff de Edición (horas)                        │
│  • Permitir todos los andenes (checkbox)            │
│  • Modo de asignación: Secuencial / Intercalado     │
│                                                     │
│  ─────────────── DIVISOR VISUAL ──────────────────  │
│                                                     │
│  SECCIÓN 2: Cliente Retira                          │
│  • Lista de reglas de bloqueo automático por andén  │
│  • Botón "Agregar otro andén"                       │
└─────────────────────────────────────────────────────┘
```

**Archivos involucrados:**
| Archivo | Responsabilidad |
|---|---|
| `src/pages/admin/clientes/components/ClientDetailDrawer.tsx` | UI del drawer completo + Sección 1 |
| `src/pages/admin/clientes/components/ClientPickupRulesTab.tsx` | UI de Sección 2 (Cliente Retira) |
| `src/services/clientsService.ts` | CRUD de `client_rules` (Sección 1) |
| `src/services/clientPickupRulesService.ts` | CRUD de `client_pickup_rules` (Sección 2) |
| `supabase/functions/generate-client-pickup-blocks/index.ts` | Edge Function que genera los bloques físicos |
| `src/types/client.ts` | Tipos TypeScript de todas las entidades |

---

## 2. Tablas de Base de Datos

### 2.1 Tabla `client_rules` (Sección 1)

Almacena las reglas de operación generales del cliente.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID | PK |
| `org_id` | UUID | Organización |
| `client_id` | UUID | FK → clients |
| `edit_cutoff_hours` | INTEGER | Horas de cutoff (0 = sin restricción) |
| `allow_all_docks` | BOOLEAN | Si true, ignora la lista de andenes asignados |
| `dock_allocation_mode` | TEXT | `'SEQUENTIAL'` o `'ODD_FIRST'` |
| `created_at` | TIMESTAMPTZ | Fecha de creación |
| `updated_at` | TIMESTAMPTZ | Última actualización |

> **Nota:** Si el cliente no tiene fila en esta tabla, el sistema la crea automáticamente con valores por defecto: `edit_cutoff_hours=0`, `allow_all_docks=false`, `dock_allocation_mode='NONE'`.

### 2.2 Tabla `client_pickup_rules` (Sección 2 — Cliente Retira)

Almacena las reglas de bloqueo automático de andenes.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID | PK |
| `org_id` | UUID | Organización |
| `client_id` | UUID | FK → clients (CASCADE DELETE) |
| `dock_id` | UUID | FK → docks (CASCADE DELETE) |
| `block_minutes` | INTEGER | Duración del bloqueo en minutos (> 0) |
| `reblock_before_minutes` | INTEGER | Minutos antes del fin para renovar el bloque (>= 0) |
| `is_active` | BOOLEAN | Estado de la regla |
| `created_at` | TIMESTAMPTZ | Fecha de creación |
| `updated_at` | TIMESTAMPTZ | Última actualización |

**Restricción de unicidad:** Solo puede existir **una regla activa** por combinación `(client_id, dock_id)`. Si se intenta crear una segunda regla activa para el mismo cliente y andén, el sistema lanza error `23505` (duplicate key).

---

## 3. Regla: Cutoff de Edición

### ¿Qué hace?

Restringe la capacidad de editar una reserva cuando faltan menos de N horas para su inicio.

### Configuración en la UI

- **Campo:** `Cutoff de edición (horas)` — input numérico, rango 0-720.
- **Valor 0:** Sin restricción — el cliente puede editar la reserva en cualquier momento.
- **Valor > 0:** No se puede editar la reserva si faltan menos de esas horas para el inicio.

### Ejemplo

```
edit_cutoff_hours = 24
Reserva el 20 de marzo a las 10:00 am

→ El corte es el 19 de marzo a las 10:00 am
→ Después de esa hora, la reserva no puede ser editada por el cliente
```

### ¿Está funcionando?

**Desde el punto de vista de la configuración: SÍ** — el valor se guarda correctamente en `client_rules.edit_cutoff_hours` vía `clientsService.updateClientRules()`.

**⚠️ Advertencia importante:** El campo `edit_cutoff_hours` se **guarda** correctamente, pero la validación real (bloquear la edición en el formulario de reservas) depende de cómo el módulo de reservas consulte y aplique esta regla al intentar editar. **Este reporte no cubre si el módulo de reservas actualmente aplica esa validación**, ya que eso está en código externo a los archivos revisados.

### Flujo de guardado

```
Usuario cambia el valor → handleSaveRules() →
  Validación: 0 ≤ edit_cutoff_hours ≤ 720 →
    clientsService.updateClientRules(orgId, clientId, rulesForm) →
      UPDATE client_rules SET edit_cutoff_hours = N WHERE client_id = X
```

---

## 4. Regla: Modo de Asignación de Andenes

### Opciones disponibles

| Valor en BD | Nombre en UI | Descripción |
|---|---|---|
| `SEQUENTIAL` | Secuencial | Asigna andenes en orden numérico: 1, 2, 3, 4, 5, 6… |
| `ODD_FIRST` | Intercalado | Primero impares luego pares: 1, 3, 5… luego 2, 4, 6… |
| `NONE` | (interno) | Valor heredado/legado; la UI lo trata como `SEQUENTIAL` |

### Comportamiento en la UI

```typescript
// Al cargar las reglas del cliente:
dock_allocation_mode = (!rules.dock_allocation_mode || rules.dock_allocation_mode === 'NONE')
  ? 'SEQUENTIAL'
  : rules.dock_allocation_mode
```

Esto significa que si la BD tiene `'NONE'` (valor por defecto al crear un cliente), la UI muestra **Secuencial** automáticamente.

### Secuencial

```
Andenes disponibles para el cliente: [A1, A2, A3, A4, A5, A6]

Reserva 1 → A1
Reserva 2 → A2
Reserva 3 → A3
Reserva 4 → A4
...continúa en orden
```

### Intercalado (ODD_FIRST)

```
Andenes disponibles para el cliente: [A1, A2, A3, A4, A5, A6]

Prioridad de asignación:
  1er grupo (impares): A1, A3, A5
  2do grupo (pares):   A2, A4, A6

Reserva 1 → A1
Reserva 2 → A3
Reserva 3 → A5
Reserva 4 → A2
Reserva 5 → A4
Reserva 6 → A6
```

> **Nota sobre "impar/par":** La lógica de ODD_FIRST se aplica sobre la **posición del andén en la lista asignada al cliente**, no sobre el nombre o número físico del andén. Si el cliente tiene andenes [A2, A3, A4], las posiciones son 1, 2, 3, por lo que ODD_FIRST asignaría: posición 1 (A2), posición 3 (A4), luego posición 2 (A3).

### ¿Dónde se aplica la lógica de asignación?

La configuración `dock_allocation_mode` se **almacena** en `client_rules`. La aplicación real de qué andén asignar a cada reserva depende del módulo de reservas en el calendario. **Este reporte documenta la configuración; la implementación del algoritmo de asignación está en el flujo de creación/edición de reservas.**

---

## 5. Regla: Cliente Retira

### ¿Qué es?

Es un sistema de **bloqueos automáticos de andenes** para clientes que retiran su propia mercancía. En lugar de abrir la disponibilidad del andén, el sistema bloquea ese andén para uso exclusivo del cliente desde el inicio del horario del almacén.

### Configuración por regla

Cada regla tiene:

| Campo | Descripción | Ejemplo |
|---|---|---|
| `dock_id` | El andén que se bloquea | Andén Norte #3 |
| `block_minutes` | Cuántos minutos dura el bloqueo desde la apertura del almacén | `120` = 2 horas |
| `reblock_before_minutes` | Cuántos minutos antes del vencimiento se renueva el bloque | `10` = renueva 10 min antes |
| `is_active` | Si la regla está activa o no | `true` / `false` |

### Ejemplo de comportamiento

```
Almacén: apertura 07:00, cierre 18:00
Regla: block_minutes=120, reblock_before_minutes=10

Bloque 1: 07:00 → 09:00
  → A las 08:50 (10 min antes del fin), se genera el Bloque 2

Bloque 2: 09:00 → 11:00
  → A las 10:50, se genera el Bloque 3

Bloque 3: 11:00 → 13:00
  → ...y así hasta que el almacén cierre
```

### Restricciones

- **Un andén, una regla activa:** No puede haber dos reglas activas para el mismo cliente y andén (`UNIQUE INDEX` en la BD).
- **El andén no puede cambiar:** Una vez creada la regla, el campo `dock_id` es de solo lectura (no se puede cambiar al editar).
- **Soft delete:** Desactivar una regla no la borra, solo la marca como `is_active = false`.
- **Hard delete:** El botón de eliminar borra la fila permanentemente de la BD.

### Estados de una regla

```
ACTIVA (is_active = true)
  → Se muestra en verde con badge "Activa"
  → La Edge Function la procesa para generar bloques futuros
  → El andén queda ocupado automáticamente

INACTIVA (is_active = false)
  → Se muestra en gris con badge "Inactiva"
  → La Edge Function NO la procesa
  → El andén puede recibir reservas normalmente
```

### ¿Cuándo se dispara la generación de bloques?

La función `triggerBlockGeneration()` en `clientPickupRulesService.ts` se llama automáticamente en los siguientes eventos:

| Evento | ¿Se llama? | Parámetros |
|---|---|---|
| Crear nueva regla | ✅ Sí | `org_id`, `rule_id` del nuevo registro |
| Editar regla existente | ✅ Sí | `org_id`, `rule_id` |
| Activar una regla (toggle ON) | ✅ Sí | `org_id`, `rule_id` |
| Desactivar una regla (toggle OFF) | ❌ No | — |
| Eliminar una regla | ❌ No | — |

> `triggerBlockGeneration()` nunca lanza error hacia el usuario — si falla silenciosamente, la operación principal (guardar la regla en BD) ya se completó. El error se registra en consola.

---

## 6. Edge Function: generate-client-pickup-blocks

### Ruta

```
supabase/functions/generate-client-pickup-blocks/index.ts
```

### Parámetros de entrada

```json
{
  "org_id": "UUID",          // Requerido
  "days_ahead": 30,          // Opcional, default 30
  "force_regenerate": false, // Opcional, si true borra y recrea todos
  "rule_id": "UUID"          // Opcional, si se envía solo procesa esa regla
}
```

### Zona horaria

Toda la lógica opera en **America/Costa_Rica (UTC-6)**. Las fechas se guardan en UTC en la BD.

### Algoritmo de generación (paso a paso)

```
1. Recibe la solicitud con org_id (y opcionalmente rule_id)

2. Consulta todas las reglas activas de client_pickup_rules
   (filtrando por rule_id si se proporcionó)

3. Para cada regla:
   a. Obtiene el dock → warehouse_id
   b. Obtiene el warehouse → business_start_time, business_end_time

4. Construye el rango de fechas: HOY hasta HOY + days_ahead

5. Para cada fecha en el rango:
   
   SI ES HOY:
     → Calcula el bloque DINÁMICO según la hora actual
     → BORRA todos los bloques existentes de ese andén para HOY con esa regla
     → Genera el bloque correcto para el momento actual
     
   SI ES FUTURO:
     → Verifica si ya existe un bloque para ese día y esa regla
     → Si ya existe: SKIP (no duplica)
     → Si no existe: genera el primer bloque desde business_start_time

6. Inserta todos los bloques nuevos en dock_time_blocks en lotes de 100

7. Retorna: { rules_processed, blocks_created, blocks_deleted }
```

### Lógica de bloque dinámico para HOY

```typescript
// Ejemplo: start=07:00 (420min), block=120min, reblock=10min, ahora=08:55 (535min)

offset = floor((535 - 420 + 10) / 120)
       = floor(125 / 120)
       = floor(1.04)
       = 1

blockStart = 420 + 1 * 120 = 540 minutos = 09:00

// Resultado: el bloque activo ahora mismo es 09:00 → 11:00
```

### Identificador del bloque en `dock_time_blocks`

Los bloques generados por esta regla se guardan con:
```
reason = "CLIENT_PICKUP:{rule_id}"
```

Esto permite distinguirlos de otros tipos de bloqueos (manuales, etc.) y borrarlos selectivamente.

### Datos que se insertan en `dock_time_blocks`

```json
{
  "org_id": "...",
  "dock_id": "...",
  "start_datetime": "2026-03-17T13:00:00.000Z",
  "end_datetime":   "2026-03-17T15:00:00.000Z",
  "reason": "CLIENT_PICKUP:uuid-de-la-regla",
  "created_by": "uuid-del-usuario (opcional)"
}
```

---

## 7. Flujo Completo de Guardado

### Sección 1 — Reglas de Operación

```
[Usuario en UI]
  ↓ Modifica cutoff / allow_all_docks / dock_allocation_mode
  ↓ Clic "Guardar Reglas"
  ↓ handleSaveRules() en ClientDetailDrawer.tsx
  ↓ Validación: 0 ≤ edit_cutoff_hours ≤ 720
  ↓ clientsService.updateClientRules(orgId, clientId, rulesForm)
  ↓ Verifica si ya existe fila en client_rules
    → Si NO existe: INSERT con los nuevos valores
    → Si SÍ existe: UPDATE con los nuevos valores + updated_at
  ↓ Retorna la fila actualizada
  ↓ UI cierra spinner
```

### Sección 2 — Cliente Retira (crear regla)

```
[Usuario en UI]
  ↓ Clic "Agregar otro andén"
  ↓ Modal se abre con defaults: block=120, reblock=10, is_active=true
  ↓ Usuario elige andén, configura minutos
  ↓ Clic "Guardar"
  ↓ handleSave() en ClientPickupRulesTab.tsx
  ↓ Validaciones: dock_id requerido, block_minutes > 0, reblock >= 0
  ↓ clientPickupRulesService.create(orgId, clientId, formData)
  ↓ INSERT en client_pickup_rules
  ↓ Si error 23505 → "Ya existe una regla activa para este cliente y andén"
  ↓ triggerBlockGeneration(orgId, rule.id) → llama Edge Function
  ↓ loadRules() → recarga la lista
  ↓ Modal se cierra
```

---

## 8. Estado Actual y Observaciones

### ✅ Qué está correctamente implementado

- **Cutoff:** El campo se guarda y recupera correctamente. La UI valida el rango 0-720. El valor `0` representa sin restricción.
- **Secuencial / Intercalado:** Los valores `SEQUENTIAL` y `ODD_FIRST` se guardan correctamente. La UI convierte `NONE` a `SEQUENTIAL` al cargar.
- **Cliente Retira — CRUD:** Crear, editar, activar, desactivar y eliminar reglas funciona correctamente.
- **Cliente Retira — Generación de bloques:** La Edge Function genera bloques para 30 días hacia adelante. Para hoy calcula dinámicamente cuál es el bloque vigente según la hora actual. Para días futuros, evita duplicados chequeando existencia antes de insertar.
- **Unicidad:** La BD garantiza que no puede haber dos reglas activas para el mismo par (cliente, andén).
- **Idempotencia de días futuros:** Si se llama la Edge Function múltiples veces, los bloques de días futuros no se duplican (se salta si ya existe).

### ⚠️ Puntos de atención

1. **Cutoff no verificado en reservas:** La configuración del cutoff se **guarda** pero este reporte no confirma si el módulo del calendario y/o el formulario de reservas **aplica** esa restricción al momento de editar. Habría que revisar `src/pages/calendario/components/ReservationModal.tsx` y el servicio de reservas.

2. **dock_allocation_mode no verificado en asignación:** El modo Secuencial/Intercalado se **guarda** pero la implementación del algoritmo que asigna andenes a nuevas reservas está fuera de los archivos revisados. Habría que verificar si el calendario o el servicio de reservas consume este campo al crear una reserva.

3. **Bloqueos de días pasados:** La Edge Function solo procesa desde hoy hacia adelante. Los bloques de días anteriores **no se limpian automáticamente** (queda a cargo de la BD o procesos externos).

4. **Sin cron job:** La Edge Function se dispara solo cuando se crea/edita/activa una regla. **No existe un cron job** que la ejecute periódicamente. Esto significa que si pasan días sin que nadie toque una regla, los bloques del día dinámico podrían quedar desactualizados. La próxima vez que alguien edite la regla se regenerarán.

5. **`force_regenerate`:** Existe el parámetro `force_regenerate=true` en la Edge Function, pero **la UI nunca lo envía**. Solo se usaría si se invocara la función manualmente o desde otro proceso.

6. **Diferencia entre migración SQL y código:** La migración SQL usa la columna `remove_when_minutes_before`, pero el código TypeScript (service + types) usa `reblock_before_minutes`. Esto sugiere que la migración puede estar desactualizada respecto a la implementación real en producción.

---

*Documento generado por inspección de código — sin modificaciones al sistema.*
