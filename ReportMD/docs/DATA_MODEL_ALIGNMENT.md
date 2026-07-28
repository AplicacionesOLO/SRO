# DATA_MODEL_ALIGNMENT.md — Alineación del Modelo de Datos

> **Versión**: 1.0 | **Fecha**: 2026-07-24  
> **Estado**: DIAGNÓSTICO — Esperando aprobación antes de corregir documentos  
> **Propósito**: Documentar el modelo REAL de la base de datos y su impacto en toda la arquitectura del módulo IN/OUT Flow  
> **Regla de oro**: Este documento es la fuente canónica. Todo documento posterior debe alinearse con este modelo.

---

## 1. Modelo Real (Canónico)

### 1.1 Diagrama completo de la cadena de entidades

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ORGANIZATION                                     │
│  organizations.id (UUID, PK)                                            │
│  organizations.name (TEXT)                                              │
└────────┬──────────────────────────────┬─────────────────────────────────┘
         │                              │
         │ organizations.id             │ organizations.id
         ▼                              ▼
┌─────────────────────┐      ┌──────────────────────────┐
│     WAREHOUSE        │      │          DOCK             │
│ warehouses.id (PK)   │◄─────│ docks.warehouse_id (FK)   │ ← NULLABLE
│ warehouses.org_id    │      │ docks.id (PK)             │
│ warehouses.name      │      │ docks.org_id (FK)         │
└─────────────────────┘      │ docks.name                │
                             │ docks.category_id (FK)    │
                             │ docks.status_id (FK)      │
                             └────────────┬─────────────┘
                                          │
                                          │ docks.id (ON DELETE CASCADE)
                                          ▼
                             ┌──────────────────────────┐
                             │      RESERVATION          │
                             │ reservations.id (PK)      │
                             │ reservations.org_id (FK)  │ → organizations.id
                             │ reservations.dock_id (FK) │ → docks.id ⚠️ CASCADE
                             │ reservations.client_id(FK)│ → clients.id (NULLABLE, SET NULL)
                             │ reservations.status_id(FK)│ → reservation_statuses.id
                             │ reservations.is_cancelled │ (BOOLEAN, DEFAULT false)
                             │ reservations.created_by   │ → auth.users(id)
                             └──────────────────────────┘
```

### 1.2 La ruta canónica para obtener el warehouse de una reserva

```
NO EXISTE: reservations.warehouse_id  ❌

SÍ EXISTE:
  reservations.dock_id → docks.id → docks.warehouse_id → warehouses.id
```

Esta es la **única** forma de obtener el almacén de una reserva. Cualquier código, RPC, regla, query o reporte que asuma `reservations.warehouse_id` como columna directa **fallará en runtime**.

### 1.3 Implicaciones de `docks.warehouse_id IS NULLABLE`

`docks.warehouse_id` permite NULL. Esto significa que existe la posibilidad (aunque remota) de que un dock no esté asignado a ningún warehouse. El Rule Loader debe manejar este caso:

- Si `docks.warehouse_id IS NULL` → la regla con `warehouse_id` específico no aplica (no hay warehouse que comparar)
- Las reglas con `warehouse_id IS NULL` (reglas de organización) sí aplican

### 1.4 Implicaciones de `ON DELETE CASCADE` en `reservations.dock_id`

```sql
CONSTRAINT reservations_dock_id_fkey 
  FOREIGN KEY (dock_id) REFERENCES docks(id) 
  ON DELETE CASCADE
```

Si se elimina un dock, **todas las reservas asociadas se eliminan en cascada**. Esto es un riesgo para la integridad histórica del módulo de cumplimiento: las incidencias vinculadas a una reserva eliminada quedarían huérfanas (aunque `inout_flow_incidents.reservation_id` no tiene CASCADE, por lo que sobrevivirían pero con FK rota si no se usa SET NULL).

---

## 2. Documentos Afectados

| Documento | Sección | Qué cambia | Severidad |
|---|---|---|---|
| `RULE_ENGINE_ARCHITECTURE.md` | §2.1 Rule Loader | `v_reservation.warehouse_id` → JOIN con docks | **Crítico** |
| `RULE_ENGINE_ARCHITECTURE.md` | §12.1 SELECT FOR UPDATE | `warehouse_id` no existe en reservations | **Crítico** |
| `RULE_ENGINE_ARCHITECTURE.md` | §13.2 `inout_flow_incidents` | Columna `warehouse_id` existe en la tabla pero debe resolverse vía docks | **Alto** |
| `INOUT_FLOW_MIGRATION_SQL_SPECS.md` | 007 RPC stub | `SELECT warehouse_id FROM reservations` — columna inexistente | **Crítico** |
| `INOUT_FLOW_MIGRATION_SQL_SPECS.md` | 005 Seeds | Reglas con `warehouse_id` — la lógica de seeds está bien (columna en inout_flow_rules), pero el Rule Loader debe hacer JOIN | **Medio** |
| `INOUT_FLOW_MIGRATION_SQL_SPECS.md` | 001 Tablas | `inout_flow_incidents.warehouse_id` — columna correcta, pero el INSERT debe resolver vía JOIN | **Medio** |
| `STATE_MACHINE_SPEC.md` | §7.2 Validaciones | `reservations.warehouse_id` → `docks.warehouse_id` vía JOIN | **Alto** |
| `STATE_MACHINE_SPEC.md` | §1.1, §2, §3 | Faltan 3 estados: CHECKING_IN, CHECKEDIN_PENDING_CLOSE, UNLOADED_PENDING_CHECKIN | **Alto** |
| `STATE_MACHINE_SPEC.md` | §1.1 #8 | `DISCHARGED` tiene espacio inicial real: `' DISCHARGED'` | **Alto** |
| `FLOW_RULE_CATALOG.md` | R14 WAREHOUSE_MISMATCH | La comparación de warehouse debe usar JOIN, no columna directa | **Medio** |
| `INOUT_FLOW_MIGRATION_PLAN.md` | Varias | Actualizar referencias a `warehouse_id` directo | **Medio** |

---

## 3. SQL Afectado

### 3.1 Archivos que requieren cambios

| Archivo | Tipo de cambio |
|---|---|
| `001_create_inout_tables.sql` | Sin cambios estructurales. Las columnas `warehouse_id` en `inout_flow_rules` e `inout_flow_incidents` son correctas (son el warehouse RESUELTO, no el de la reserva). |
| `005_seed_inout_rules.sql` | Sin cambios en estructura de INSERT. Pero los valores de `conditions_json` que referencian `warehouse_id` deben documentar que la comparación se hace vía JOIN en el Rule Loader. |
| `007_create_transition_rpc.sql` | **ELIMINAR de Fase 6.1.** El stub actual hace `SELECT warehouse_id FROM reservations` (columna inexistente). Además, es una RPC stub peligrosa. |
| `009_enable_status_guard.sql` | Sin cambios por modelo de datos. |

### 3.2 Queries que deben modificarse (referencia para Fase 6.2)

**Rule Loader — carga de reglas (afectada):**

```sql
-- ACTUAL (INCORRECTO):
SELECT * FROM public.inout_flow_rules
WHERE org_id = v_reservation.org_id
  AND (warehouse_id IS NULL OR warehouse_id = v_reservation.warehouse_id)  -- ❌ no existe

-- CORRECTO:
-- La resolución del warehouse debe hacerse ANTES, durante el SELECT FOR UPDATE:
SELECT r.*, d.warehouse_id as resolved_warehouse_id
INTO v_reservation
FROM public.reservations r
JOIN public.docks d ON d.id = r.dock_id
WHERE r.id = p_reservation_id
FOR UPDATE;

-- Luego en la carga de reglas:
SELECT * FROM public.inout_flow_rules
WHERE org_id = v_reservation.org_id
  AND (warehouse_id IS NULL OR warehouse_id = v_reservation.resolved_warehouse_id)
```

**Incident Generator — INSERT de incidencia (afectada):**

```sql
-- ACTUAL (INCORRECTO si se intenta leer warehouse_id de reservations):
INSERT INTO inout_flow_incidents (..., warehouse_id, ...)
VALUES (..., v_reservation.warehouse_id, ...)  -- ❌ no existe

-- CORRECTO:
INSERT INTO inout_flow_incidents (..., warehouse_id, ...)
VALUES (..., v_reservation.resolved_warehouse_id, ...)  -- ✅ del JOIN
```

---

## 4. Reglas que Cambian

### 4.1 R14 — WAREHOUSE_MISMATCH (la más afectada)

```
ANTES (modelo incorrecto):
  Comparación directa:
  casetilla_ingresos.warehouse_id ≠ reservations.warehouse_id
  
DESPUÉS (modelo canónico):
  casetilla_ingresos.warehouse_id ≠ (
    SELECT d.warehouse_id 
    FROM docks d 
    WHERE d.id = reservations.dock_id
  )
```

### 4.2 Reglas con `warehouse_id` en `conditions_json`

Las reglas R01-R16 en `conditions_json` no referencian `warehouse_id` directamente. El filtro por warehouse ocurre en el Rule Loader (carga de reglas), no en el Rule Evaluator. Por tanto, el cambio está en el Loader, no en las reglas mismas.

### 4.3 Reglas que usan `require_same_warehouse`

R14 (`WAREHOUSE_MISMATCH`) usa `"require_same_warehouse": true`. Esta condición debe implementarse en el Rule Evaluator como:

```sql
-- Para casetilla_ingresos:
EXISTS (
  SELECT 1 FROM casetilla_ingresos ci
  JOIN docks d ON d.id = v_reservation.dock_id
  WHERE ci.reservation_id = p_reservation_id
    AND ci.warehouse_id IS DISTINCT FROM d.warehouse_id
)
```

---

## 5. RLS que Cambia

Las políticas RLS actuales del módulo propuesto (`003_create_inout_rls.sql`) usan `org_id` para el filtro, lo cual es correcto porque:

- `inout_flow_rules.org_id` — filtro directo ✅
- `inout_flow_incidents.org_id` — filtro directo ✅

**No requieren cambios por el modelo de datos.** La resolución `dock_id → warehouse_id` ocurre dentro de las RPCs (SECURITY DEFINER), no en las políticas RLS.

Sin embargo, las políticas RLS existentes en `reservations` usan funciones como `allowed_dock_ids_for_user_v3()` que ya devuelven `(dock_id, org_id, warehouse_id)`. Esto confirma que el sistema actual ya resuelve warehouse a través de docks. Las nuevas políticas del módulo deben ser consistentes con este patrón.

---

## 6. Índices que Cambian

Los 28 índices propuestos en `002_create_inout_indexes.sql` no requieren cambios estructurales por el modelo de datos, porque:

- Los índices sobre `inout_flow_incidents.warehouse_id` indexan la columna **resuelta** (ya almacenada en la tabla), no una columna de `reservations`
- Los índices sobre `inout_flow_rules.warehouse_id` son para filtrar reglas por warehouse, lo cual es correcto

**Lo que SÍ cambia**: La query del Rule Loader usa ahora `docks.warehouse_id` para resolver. El plan de ejecución puede requerir un índice en `docks(warehouse_id)` si no existe ya. Verificar:

```sql
-- ¿Existe este índice?
SELECT indexname FROM pg_indexes 
WHERE tablename = 'docks' AND indexdef ILIKE '%warehouse_id%';
```

Resultado de verificación: **`idx_docks_warehouse_id` ya existe** ✅. No se requiere índice adicional.

---

## 7. FKs que Cambian

### 7.1 FKs existentes (sin cambios)

| FK | Tabla actual | No cambia |
|---|---|---|
| `reservations_dock_id_fkey` → `docks.id` | reservations | ✅ Correcto |
| `docks_warehouse_id_fkey` → `warehouses.id` | docks | ✅ Correcto |

### 7.2 FKs propuestos en el módulo (sin cambios estructurales)

| FK | Propuesto en | ¿Correcto? |
|---|---|---|
| `inout_flow_rules.warehouse_id` → `warehouses.id` | 001 | ✅ — es una columna de alcance de regla |
| `inout_flow_incidents.warehouse_id` → `warehouses.id` | 001 | ✅ — es el warehouse resuelto al momento de la incidencia |

### 7.3 FK que DEBE agregarse como documentación

La relación **implícita** que todo el módulo debe conocer:

```
inout_flow_incidents.reservation_id → reservations.id → reservations.dock_id → docks.id → docks.warehouse_id
```

No se necesita una FK directa de incidents a docks porque la trazabilidad ya existe vía `reservation_id`.

---

## 8. Queries que Cambian (Resumen)

| Query | Ubicación | Cambio |
|---|---|---|
| SELECT FOR UPDATE (bloquear reserva) | RPC §2.1 | Agregar `JOIN docks` para obtener `warehouse_id` |
| Carga de reglas (filtrar por warehouse) | RPC §2.1 | Usar `resolved_warehouse_id` del JOIN |
| INSERT incidencia (warehouse_id) | RPC §2.4 | Usar `resolved_warehouse_id` del JOIN |
| R14 WAREHOUSE_MISMATCH | Rule Evaluator | JOIN docks para obtener warehouse de la reserva |
| Reportes agrupados por warehouse | Fase 6.6 | JOIN docks en vez de columna directa |
| Scheduler (filtros por warehouse) | Fase 6.6 | JOIN docks |

---

## 9. RPC que Cambia

### 9.1 `transition_reservation_status()` — Fase 6.2

La RPC completa (a implementar en Fase 6.2) debe:

1. **En el SELECT FOR UPDATE**, hacer JOIN con docks:
```sql
SELECT r.*, d.warehouse_id as resolved_warehouse_id
INTO v_reservation
FROM public.reservations r
LEFT JOIN public.docks d ON d.id = r.dock_id
WHERE r.id = p_reservation_id
FOR UPDATE;
```

2. **En el Rule Loader**, usar `v_reservation.resolved_warehouse_id` en vez de `v_reservation.warehouse_id`

3. **En el Incident Generator**, insertar `v_reservation.resolved_warehouse_id` en `inout_flow_incidents.warehouse_id`

4. **Si `resolved_warehouse_id` es NULL** (dock sin warehouse), tratarlo como caso especial:
   - Reglas con `warehouse_id` específico: NO aplican (no hay warehouse que comparar)
   - Reglas de organización (`warehouse_id IS NULL`): SÍ aplican

### 9.2 La RPC stub (007) — ELIMINAR de Fase 6.1

El stub actual es doblemente peligroso:
- Usa `warehouse_id` como columna directa de reservations (no existe)
- Permite transiciones sin validación de reglas

---

## 10. Reportes que Cambian

Los reportes (Fase 6.6) que agrupen o filtren por warehouse deben usar:

```sql
-- En vez de:
SELECT * FROM inout_flow_incidents WHERE warehouse_id = $1

-- Que ya funciona porque incidents.warehouse_id es el warehouse resuelto,
-- la query de agregación para dashboard debe joinear:
SELECT 
  COALESCE(i.warehouse_id, d.warehouse_id) as warehouse_id,
  COUNT(*) as total_incidents
FROM inout_flow_incidents i
JOIN reservations r ON r.id = i.reservation_id
LEFT JOIN docks d ON d.id = r.dock_id
WHERE i.org_id = $1
GROUP BY 1;
```

Pero como `inout_flow_incidents.warehouse_id` ya almacena el warehouse resuelto al momento de la detección, los reportes que solo lean de `inout_flow_incidents` no necesitan JOIN adicional. El JOIN solo es necesario para reportes que crucen datos de `reservations` directamente.

---

## 11. Diagramas que Cambian

### 11.1 Diagrama de entidades (afectado)

El diagrama en `RULE_ENGINE_ARCHITECTURE.md` §1.4 debe reflejar:

```
Reservation ←→ Dock ←→ Warehouse ←→ Organization
     │            │
     │            └── warehouse_id (nullable)
     └── dock_id (FK)
```

No:
```
Reservation ←→ Warehouse  ❌ (no existe FK directa)
```

### 11.2 Diagrama de flujo del Rule Loader (afectado)

§2.1 debe mostrar el paso adicional de resolución:
```
1. SELECT ... FROM reservations JOIN docks FOR UPDATE
2. resolved_warehouse_id = docks.warehouse_id
3. Cargar reglas filtrando por resolved_warehouse_id
```

---

## 12. Forma Correcta — Modelo Canónico

### 12.1 Declaración oficial

> **Toda obtención del warehouse de una reserva DEBE hacerse mediante:**
> ```
> reservations.dock_id → docks.id → docks.warehouse_id → warehouses.id
> ```
> **No existe `reservations.warehouse_id`. No debe asumirse en ningún componente del sistema.**

### 12.2 Reglas de implementación

| # | Regla |
|---|---|
| 1 | El `SELECT FOR UPDATE` en la RPC siempre incluye `LEFT JOIN docks` |
| 2 | La variable interna se llama `resolved_warehouse_id`, no `warehouse_id`, para distinguirla de una columna directa |
| 3 | Si `docks.warehouse_id IS NULL`, se trata como "sin warehouse" (reglas específicas no aplican) |
| 4 | `inout_flow_incidents.warehouse_id` almacena el warehouse **resuelto al momento del evento** |
| 5 | `inout_flow_rules.warehouse_id` es un filtro de alcance (qué regla aplica a qué warehouse) — correcto como está |
| 6 | Los reportes que lean `inout_flow_incidents` no necesitan JOIN adicional (el warehouse ya está resuelto) |
| 7 | Los reportes que lean `reservations` directamente SÍ necesitan JOIN con docks |

---

## A. Verificación de `DISCHARGED` con espacio inicial

### A.1 Evidencia

```sql
SELECT code, length(code), ascii(code) FROM reservation_statuses WHERE code ILIKE '%discharged%';
```

**Resultado:**
| code | length | ascii(first_char) |
|---|---|---|
| `' DISCHARGED'` | 11 | 32 (espacio) |

### A.2 Impacto

Si el código real es `' DISCHARGED'` (con espacio), cualquier comparación por string fallará:

- `WHERE code = 'DISCHARGED'` → FALSE (no coincide)
- `WHERE code = ' DISCHARGED'` → TRUE
- `conditions_json` con `"required_new_status_codes": ["DISCHARGED"]` → no detectará el estado
- `CASE WHEN code = 'DISCHARGED'` → falso
- Matriz de estados con código `DISCHARGED` → no matchea

### A.3 Recomendación

**Antes de implementar el módulo**, ejecutar una corrección de datos:

```sql
-- Verificar si hay reservas en ese estado
SELECT COUNT(*) FROM reservations WHERE status_id = '65061cce-28d9-4fe9-8146-2a6d453391bc';

-- Corregir el código (solo si no rompe dependencias):
UPDATE reservation_statuses SET code = 'DISCHARGED' WHERE code = ' DISCHARGED';
```

Si la corrección no es viable (riesgo de romper integraciones externas), entonces todas las comparaciones en el Rule Engine deben usar `TRIM(code)` o `BTRIM(code)`.

---

## B. Estados No Documentados — Verificación

### B.1 Evidencia

| Código | Reservas activas | ¿En uso? |
|---|---|---|
| `CHECKING_IN` | 5 | **Sí — ACTIVO** |
| `CHECKEDIN_PENDING_CLOSE` | 0 | Existe pero sin uso actual |
| `UNLOADED_PENDING_CHECKIN` | 1 | **Sí — ACTIVO** |

### B.2 Clasificación preliminar

| Estado | Clasificación propuesta | Justificación |
|---|---|---|
| `CHECKING_IN` | **No terminal** | El vehículo está en proceso de ingreso. Debe poder transicionar a `ARRIVED_PENDING_UNLOAD` o `CONFIRMED`. |
| `CHECKEDIN_PENDING_CLOSE` | **No terminal** | Ingreso confirmado, pendiente de cierre administrativo. Probablemente → `ARRIVED_PENDING_UNLOAD`. |
| `UNLOADED_PENDING_CHECKIN` | **No terminal** | Descarga completada pero pendiente de check-in formal. Probablemente → `CHECKING_IN` o `ARRIVED_PENDING_UNLOAD`. |

### B.3 Preguntas pendientes para el negocio

1. ¿`CHECKING_IN` es un estado temporal (mientras el vehículo está en la casetilla) o un estado operativo real?
2. ¿Quién asigna `CHECKING_IN`? ¿El sistema (automático al crear `casetilla_ingresos`) o un operador?
3. ¿`CHECKEDIN_PENDING_CLOSE` es legacy o parte del flujo actual?
4. ¿`UNLOADED_PENDING_CHECKIN` es un estado puente entre `DISCHARGED` y un futuro check-in?
5. ¿Pueden eliminarse/deprecarse alguno de estos estados?

### B.4 Recomendación

**NO incluir estos estados en la máquina de estados hasta que el negocio confirme su rol.** Si son parte del flujo activo, la `STATE_MACHINE_SPEC.md` está incompleta y debe actualizarse **antes** de implementar el Rule Engine. Si son legacy, documentarlos como "deprecados — no evaluados por el motor".

---

## C. Resumen Ejecutivo para Aprobación

### Lo que encontramos

| Hallazgo | Severidad | Acción requerida |
|---|---|---|
| `reservations` no tiene `warehouse_id` — se resuelve vía `dock_id → docks.warehouse_id` | **Crítico** | Actualizar §2.1, §12.1 de RULE_ENGINE, eliminar RPC stub, modificar queries del Rule Loader |
| `DISCHARGED` tiene espacio inicial real (`' DISCHARGED'`) | **Alto** | Corregir el dato o usar TRIM en todas las comparaciones |
| 3 estados no documentados (`CHECKING_IN` con 5 reservas activas) | **Alto** | Confirmar con negocio si son parte del flujo. Si sí, actualizar STATE_MACHINE_SPEC |
| RPC stub (007) usa `warehouse_id` como columna directa | **Crítico** | Eliminar de Fase 6.1; implementar RPC completa en 6.2 con JOIN |

### Lo que NO cambia

- Las 7 tablas del módulo (estructura correcta)
- Los 9 permisos (nombres correctos)
- Las 16 reglas (lógica correcta, solo cambia la resolución de warehouse en el Loader)
- Los 4 helpers (sin dependencia del modelo)
- La arquitectura del pipeline en 5 componentes
- La máquina de estados base (12 estados documentados)

### Orden recomendado post-aprobación

1. ✅ Aprobar este documento (`DATA_MODEL_ALIGNMENT.md`)
2. Corregir `RULE_ENGINE_ARCHITECTURE.md` — §2.1 y §12.1 con JOIN
3. Corregir `STATE_MACHINE_SPEC.md` — agregar/quitar estados según decisión de negocio
4. Corregir `INOUT_FLOW_MIGRATION_SQL_SPECS.md` — eliminar 007, ajustar queries
5. Corregir `INOUT_FLOW_MIGRATION_PLAN.md` — reflejar nueva estructura de archivos
6. Corregir `FLOW_RULE_CATALOG.md` — si R14 cambia su descripción
7. Último: ejecutar SQL de Fase 6.1 (sin RPC)