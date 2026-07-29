# PHASE 6.2 IMPLEMENTATION PLAN

## Motor de Transiciones de Estados — `transition_reservation_status(...)`

---

**Versión:** 1.0
**Fecha:** 2026-07-29
**Referencia:** PHASE_6_2_TRANSITION_ENGINE_DESIGN.md v2.3.1
**Estado:** PLAN APROBADO — Listo para ejecución de migraciones

---

## 0. GAPS IDENTIFICADOS: Fase 6.1 vs Diseño v2.3.1

Antes de crear objetos nuevos, hay que resolver discrepancias entre el schema creado en Fase 6.1 y lo que requiere el diseño v2.3.1:

### GAP-1: `inout_state_transition_attempts.previous_status_id` es NOT NULL

| Aspecto | Fase 6.1 (actual) | Diseño v2.3.1 (requerido) |
|---|---|---|
| Columna | `previous_status_id UUID NOT NULL` | Debe permitir NULL |
| Motivo | — | La primera transición (NULL → PENDING) requiere previous=NULL |
| Acción | **ALTER COLUMN DROP NOT NULL** | |

### GAP-2: `inout_state_transition_attempts.result` CHECK no incluye `no_op` ni `override`

| Aspecto | Fase 6.1 (actual) | Diseño v2.3.1 (requerido) |
|---|---|---|
| CHECK actual | `'allowed','blocked','warning_pending','allowed_after_warning','allowed_by_override','failed_validation','no_change'` | Faltan `'no_op'` y `'override'` |
| Acción | **ALTER CONSTRAINT para agregar `'no_op'` y `'override'`** | Se conservan los valores existentes para backward compat |

### GAP-3: `inout_state_transition_attempts.idempotency_key` no existe

| Aspecto | Fase 6.1 (actual) | Diseño v2.3.1 (requerido) |
|---|---|---|
| Columna | No existe | `idempotency_key UUID NOT NULL` |
| Acción | **ADD COLUMN → backfill → SET NOT NULL → CREATE UNIQUE INDEX** | |

### GAP-4: `inout_flow_incidents.attempt_id` no existe

| Aspecto | Fase 6.1 (actual) | Diseño v2.3.1 (requerido) |
|---|---|---|
| Columna | No existe | `attempt_id UUID` (estrategia 5 etapas) |
| Acción | **ADD COLUMN nullable + FK ON DELETE RESTRICT** | Backfill opcional (Etapa 3) |

### GAP-5: Índice legacy `uq_incidents_idempotency` debe retirarse

| Aspecto | Fase 6.1 (actual) | Diseño v2.3.1 (requerido) |
|---|---|---|
| Índice | `UNIQUE (org_id, idempotency_key)` | Debe retirarse para permitir múltiples incidentes por operación |
| Acción | **DROP INDEX después de crear los dos índices parciales nuevos** | |

### GAP-6: Tabla `inout_transition_attempt_rules` no existe

| Aspecto | Fase 6.1 (actual) | Diseño v2.3.1 (requerido) |
|---|---|---|
| Tabla | No existe | Nueva tabla con FKs, CHECKs, índices, RLS |
| Acción | **CREATE TABLE completa** | |

### GAP-7: Permiso `casetilla.flow_report.transitions.execute` no existe

| Aspecto | Fase 6.1 (actual) | Diseño v2.3.1 (requerido) |
|---|---|---|
| Permiso | No existe (Fase 6.1 creó 9 permisos, no incluye este) | Requerido para ejecutar transiciones |
| Acción | **INSERT INTO permissions + asignar a roles** | |

### GAP-8: RPC `transition_reservation_status` no existe

| Aspecto | Fase 6.1 (actual) | Diseño v2.3.1 (requerido) |
|---|---|---|
| Función | No existe | Monolítica con RETURNS TABLE(20 columns) |
| Acción | **CREATE OR REPLACE FUNCTION** | |

---

## 1. ORDEN EXACTO DE CREACIÓN DE OBJETOS

El orden respeta dependencias estrictas: cada paso asume que todos los anteriores fueron completados exitosamente.

```
FASE A — CORRECCIONES DE SCHEMA EXISTENTE (ALTERs)
──────────────────────────────────────────────────
A1. ALTER inout_state_transition_attempts.previous_status_id → DROP NOT NULL
A2. ALTER inout_state_transition_attempts.result CHECK → agregar 'no_op', 'override'
A3. ALTER inout_state_transition_attempts → ADD COLUMN idempotency_key UUID
A4. Backfill idempotency_key con gen_random_uuid() para filas existentes
A5. ALTER inout_state_transition_attempts.idempotency_key → SET NOT NULL
A6. CREATE UNIQUE INDEX uq_attempts_idempotency ON inout_state_transition_attempts(org_id, idempotency_key)

FASE B — NUEVAS COLUMNAS EN INCIDENTES
───────────────────────────────────────
B1. ALTER inout_flow_incidents → ADD COLUMN attempt_id UUID
B2. ALTER inout_flow_incidents → ADD CONSTRAINT fk_incidents_attempt
    FOREIGN KEY (attempt_id) REFERENCES inout_state_transition_attempts(id) ON DELETE RESTRICT

FASE C — NUEVOS ÍNDICES PARCIALES DE INCIDENTES
────────────────────────────────────────────────
C1. CREATE UNIQUE INDEX uq_incidents_attempt_rule_type
    ON inout_flow_incidents(attempt_id, rule_id, incident_type)
    WHERE rule_id IS NOT NULL
C2. CREATE UNIQUE INDEX uq_incidents_attempt_admin_type
    ON inout_flow_incidents(attempt_id, incident_type)
    WHERE rule_id IS NULL

FASE D — RETIRO DE ÍNDICE LEGACY
─────────────────────────────────
D1. Verificar que ninguna función/procedimiento activo hace ON CONFLICT sobre uq_incidents_idempotency
D2. DROP INDEX uq_incidents_idempotency
    (La columna idempotency_key se conserva como trazabilidad auxiliar)

FASE E — NUEVA TABLA inout_transition_attempt_rules
────────────────────────────────────────────────────
E1. CREATE TABLE public.inout_transition_attempt_rules (...)
E2. CREATE INDEX idx_attempt_rules_org
E3. CREATE INDEX idx_attempt_rules_attempt
E4. CREATE INDEX idx_attempt_rules_rule
E5. CREATE UNIQUE INDEX uq_attempt_rules_unique
E6. ALTER TABLE ENABLE ROW LEVEL SECURITY
E7. CREATE POLICY "Attempt rules - SELECT with audit.view"

FASE F — NUEVO PERMISO
───────────────────────
F1. INSERT INTO permissions: casetilla.flow_report.transitions.execute
F2. Asignar a ADMIN, Full Access (SUPERVISOR no recibe este permiso)
F3. (Opcional) Asignar a otros roles según necesidades del negocio

FASE G — RPC PRINCIPAL
───────────────────────
G1. CREATE OR REPLACE FUNCTION public.transition_reservation_status(...)
    RETURNS TABLE (20 columnas)
    LANGUAGE plpgsql SECURITY DEFINER
G2. GRANT EXECUTE TO authenticated, service_role
G3. REVOKE EXECUTE FROM PUBLIC, anon

FASE H — RLS PARA NUEVA TABLA
───────────────────────────────
H1. REVOKE ALL ON inout_transition_attempt_rules FROM PUBLIC, anon
H2. Sin INSERT/UPDATE/DELETE para authenticated (solo RPC escribe)
```

---

## 2. DEPENDENCIAS

### Dependencias entre fases

```
FASE A (ALTERs attempts)
  │
  ├──→ FASE B (attempt_id en incidents) — requiere que attempts.id exista
  │      │
  │      ├──→ FASE C (índices parciales incidents) — requiere attempt_id
  │      │      │
  │      │      └──→ FASE D (DROP legacy index) — requiere nuevos índices primero
  │      │
  │      └──→ FASE G (RPC) — requiere attempt_id, idempotency_key, índices
  │             │
  │             └──→ FASE H (RLS nueva tabla) — requiere tabla creada
  │
  ├──→ FASE E (nueva tabla) — requiere attempts.id para FK
  │      │
  │      └──→ FASE G (RPC) — requiere tabla para INSERT
  │
  └──→ FASE F (nuevo permiso) — independiente, pero FASE G lo valida
         │
         └──→ FASE G (RPC) — requiere permiso para validación
```

### Dependencias externas (ya existen de Fase 6.1)

| Dependencia | Tipo | Ubicación | Estado |
|---|---|---|---|
| `organizations` | Tabla | `public` | ✅ Existe |
| `profiles` | Tabla | `public` | ✅ Existe |
| `reservations` | Tabla | `public` | ✅ Existe |
| `reservation_statuses` | Tabla | `public` | ✅ Existe |
| `inout_flow_rules` | Tabla | `public` | ✅ Existe (16 reglas seed) |
| `inout_flow_incidents` | Tabla | `public` | ✅ Existe |
| `inout_state_transition_attempts` | Tabla | `public` | ✅ Existe (requiere ALTERs) |
| `inout_flow_audit_log` | Tabla | `public` | ✅ Existe |
| `casetilla_ingresos` | Tabla | `public` | ✅ Existe (referenciada por R04) |
| `casetilla_salidas` | Tabla | `public` | ✅ Existe (referenciada por R02, R05) |
| `inout_has_permission` | Función | `public` | ✅ Existe |
| `inout_get_user_org_role` | Función | `public` | ✅ Existe |
| `permissions` | Tabla (catálogo) | `public` | ✅ Existe |
| `role_permissions` | Tabla (asignación) | `public` | ✅ Existe |
| `user_org_roles` | Tabla (pertenencia) | `public` | ✅ Existe |
| `roles` | Tabla (catálogo) | `public` | ✅ Existe |

---

## 3. MIGRACIONES NECESARIAS

Se requiere **UNA migración atómica** que ejecute todas las fases en orden dentro de una transacción `BEGIN...COMMIT`.

### Archivo de migración

```
supabase/migrations/20260729XXXXXX_phase_6_2_transition_engine.sql
```

### Contenido (estructura)

```sql
BEGIN;

-- ===========================================================================
-- PHASE 6.2 — TRANSITION ENGINE
-- migration: 20260729XXXXXX_phase_6_2_transition_engine
-- ===========================================================================

-- FASE A: Correcciones de schema existente
-- ... (ALTERs, backfill, índices)

-- FASE B: Nuevas columnas en incidents
-- ... (ADD COLUMN, FK)

-- FASE C: Nuevos índices parciales de incidents
-- ... (CREATE INDEX)

-- FASE D: Retiro de índice legacy
-- ... (DROP INDEX)

-- FASE E: Nueva tabla inout_transition_attempt_rules
-- ... (CREATE TABLE, índices, RLS)

-- FASE F: Nuevo permiso
-- ... (INSERT, asignaciones)

-- FASE G: RPC principal
-- ... (CREATE FUNCTION, GRANT/REVOKE)

-- FASE H: RLS para nueva tabla
-- ... (REVOKE from authenticated)

COMMIT;
```

---

## 4. NUEVAS COLUMNAS

### 4.1 `inout_state_transition_attempts.idempotency_key`

| Propiedad | Valor |
|---|---|
| Tabla | `public.inout_state_transition_attempts` |
| Tipo | `UUID` |
| Nullable | **NO** (NOT NULL después de backfill) |
| Default | Ninguno (el RPC siempre provee valor) |
| Índice | `uq_attempts_idempotency UNIQUE (org_id, idempotency_key)` |
| Backfill | `UPDATE ... SET idempotency_key = gen_random_uuid() WHERE idempotency_key IS NULL` |

### 4.2 `inout_state_transition_attempts.previous_status_id` (modificación)

| Propiedad | Valor |
|---|---|
| Cambio | `NOT NULL` → **NULLABLE** |
| Motivo | Permitir primera transición desde NULL → PENDING |

### 4.3 `inout_state_transition_attempts.result` (modificación CHECK)

| Propiedad | Valor |
|---|---|
| CHECK actual | `'allowed','blocked','warning_pending','allowed_after_warning','allowed_by_override','failed_validation','no_change'` |
| CHECK nuevo | Agregar `'no_op'`, `'override'` al final |
| Motivo | `no_op` = SAME_STATUS, `override` = reapertura autorizada |

### 4.4 `inout_flow_incidents.attempt_id`

| Propiedad | Valor |
|---|---|
| Tabla | `public.inout_flow_incidents` |
| Tipo | `UUID` |
| Nullable | **SÍ** (estrategia 5 etapas — Etapa 1) |
| Default | NULL |
| FK | `REFERENCES inout_state_transition_attempts(id) ON DELETE RESTRICT` |
| Backfill | Solo si existe relación confiable (Etapa 3, opcional en esta migración) |

---

## 5. NUEVOS ÍNDICES

### 5.1 `uq_attempts_idempotency`

```sql
CREATE UNIQUE INDEX uq_attempts_idempotency
ON public.inout_state_transition_attempts (org_id, idempotency_key);
```

| Propósito | Idempotencia de operaciones — previene doble procesamiento |
|---|---|
| Tipo | UNIQUE (índice, no constraint) |
| Columnas | `(org_id, idempotency_key)` |
| ON CONFLICT target | `(org_id, idempotency_key)` |

### 5.2 `uq_incidents_attempt_rule_type`

```sql
CREATE UNIQUE INDEX uq_incidents_attempt_rule_type
ON public.inout_flow_incidents (attempt_id, rule_id, incident_type)
WHERE rule_id IS NOT NULL;
```

| Propósito | Deduplicación de incidentes con regla asociada |
|---|---|
| Tipo | UNIQUE parcial |
| Columnas | `(attempt_id, rule_id, incident_type)` |
| WHERE | `rule_id IS NOT NULL` |
| ON CONFLICT target | `(attempt_id, rule_id, incident_type) WHERE rule_id IS NOT NULL` |

### 5.3 `uq_incidents_attempt_admin_type`

```sql
CREATE UNIQUE INDEX uq_incidents_attempt_admin_type
ON public.inout_flow_incidents (attempt_id, incident_type)
WHERE rule_id IS NULL;
```

| Propósito | Deduplicación de incidentes administrativos (sin regla) |
|---|---|
| Tipo | UNIQUE parcial |
| Columnas | `(attempt_id, incident_type)` |
| WHERE | `rule_id IS NULL` |
| ON CONFLICT target | `(attempt_id, incident_type) WHERE rule_id IS NULL` |

### 5.4 Índices de `inout_transition_attempt_rules`

```sql
CREATE INDEX idx_attempt_rules_org     ON public.inout_transition_attempt_rules (org_id);
CREATE INDEX idx_attempt_rules_attempt ON public.inout_transition_attempt_rules (attempt_id);
CREATE INDEX idx_attempt_rules_rule    ON public.inout_transition_attempt_rules (rule_id);
CREATE UNIQUE INDEX uq_attempt_rules_unique ON public.inout_transition_attempt_rules (attempt_id, rule_id);
```

### 5.5 Índice a retirar

```sql
DROP INDEX IF EXISTS public.uq_incidents_idempotency;
```

| Índice | `uq_incidents_idempotency UNIQUE (org_id, idempotency_key)` |
|---|---|
| Motivo | Contradice el modelo "un incidente por regla". La idempotencia ahora vive en attempts. |
| Columna | `idempotency_key` se conserva como TEXT de trazabilidad auxiliar |

---

## 6. NUEVA TABLA

### `public.inout_transition_attempt_rules`

```sql
CREATE TABLE public.inout_transition_attempt_rules (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id           UUID NOT NULL,
    attempt_id       UUID NOT NULL
        REFERENCES public.inout_state_transition_attempts(id) ON DELETE RESTRICT,
    rule_id          UUID NOT NULL
        REFERENCES public.inout_flow_rules(id) ON DELETE RESTRICT,
    rule_code        TEXT NOT NULL,
    execution_order  INTEGER NOT NULL,
    matched          BOOLEAN NOT NULL DEFAULT true,
    result           TEXT NOT NULL
        CHECK (result IN (
            'applied', 'blocked', 'warned', 'observed',
            'excluded', 'not_matched', 'error'
        )),
    severity         TEXT
        CHECK (severity IS NULL OR severity IN ('baja', 'media', 'alta', 'critica')),
    enforcement_mode TEXT
        CHECK (enforcement_mode IS NULL OR enforcement_mode IN ('block', 'warn', 'observe')),
    blocked          BOOLEAN NOT NULL DEFAULT false,
    incident_created BOOLEAN NOT NULL DEFAULT false,
    incident_id      UUID
        REFERENCES public.inout_flow_incidents(id) ON DELETE SET NULL,
    message          TEXT,
    evidence_json    JSONB NOT NULL DEFAULT ''::jsonb,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### RLS

```sql
ALTER TABLE public.inout_transition_attempt_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Attempt rules - SELECT with audit.view"
ON public.inout_transition_attempt_rules
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.inout_has_permission(
            auth.uid(), org_id, 'casetilla.flow_report.audit.view'
        )
    )
);

-- Sin INSERT/UPDATE/DELETE para authenticated
-- Escritura solo mediante funciones SECURITY DEFINER
```

---

## 7. NUEVO PERMISO

### `casetilla.flow_report.transitions.execute`

```sql
INSERT INTO public.permissions (name, description, category)
VALUES (
    'casetilla.flow_report.transitions.execute',
    'Ejecutar transiciones de estado de reservas (cambiar status_id)',
    'casetilla'
)
ON CONFLICT (name) DO NOTHING;
```

### Asignación a roles

| Rol | Recibe permiso | Motivo |
|---|---|---|
| ADMIN | ✅ Sí | Control total |
| Full Access | ✅ Sí | Control total |
| SUPERVISOR | ❌ No | Solo vista y resolución de incidentes |

```sql
WITH perm AS (
    SELECT id FROM public.permissions
    WHERE name = 'casetilla.flow_report.transitions.execute'
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, perm.id
FROM public.roles r, perm
WHERE r.name IN ('ADMIN', 'Full Access')
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp2
    WHERE rp2.role_id = r.id AND rp2.permission_id = perm.id
  );
```

---

## 8. RPC PRINCIPAL

### Firma

```sql
CREATE OR REPLACE FUNCTION public.transition_reservation_status(
    p_reservation_id    UUID,
    p_target_status_id  UUID,
    p_reason            TEXT    DEFAULT 'Status transition via RPC',
    p_source            TEXT    DEFAULT 'system',
    p_idempotency_key   UUID,
    p_metadata          JSONB   DEFAULT ''::jsonb,
    p_actor_user_id     UUID    DEFAULT NULL
) RETURNS TABLE(
    success               BOOLEAN,
    allowed               BOOLEAN,
    reservation_id        UUID,
    org_id                UUID,
    previous_status_id    UUID,
    previous_status_code  TEXT,
    target_status_id      UUID,
    target_status_code    TEXT,
    resulting_status_id   UUID,
    resulting_status_code TEXT,
    attempt_id            UUID,
    incident_ids          UUID[],
    applied_rule_codes    TEXT[],
    blocking_rule_codes   TEXT[],
    warnings              TEXT[],
    idempotent_replay     BOOLEAN,
    override_applied      BOOLEAN,
    error_code            TEXT,
    error_message         TEXT,
    executed_at           TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'pg_catalog', 'public';
```

### GRANT / REVOKE

```sql
REVOKE ALL ON FUNCTION public.transition_reservation_status(
    UUID, UUID, TEXT, TEXT, UUID, JSONB, UUID
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.transition_reservation_status(
    UUID, UUID, TEXT, TEXT, UUID, JSONB, UUID
) TO authenticated, service_role;
```

### Algoritmo interno

El RPC implementa el algoritmo documentado en la Sección 20 del diseño v2.3.1. La implementación sigue exactamente los 32 pasos del diagrama de flujo (Sección 5), incluyendo:

- Validación anti-spoofing del `p_actor_user_id`
- Verificación de pertenencia a organización + permiso `transitions.execute`
- Idempotencia vía `p_idempotency_key UUID` + fingerprint sin reason
- `SELECT ... FOR UPDATE` sobre la reserva
- Evaluación de reglas `on_status_change` + `always`
- Dos ramas explícitas de `ON CONFLICT` para índices parciales
- Registro en `inout_transition_attempt_rules` (una fila por regla)
- UPDATE de `reservations` solo si `allowed = true`
- Auditoría en `inout_flow_audit_log`
- Manejo de estados terminales (DONE requiere override)
- Manejo de cancelación (actualiza `is_cancelled` y columnas relacionadas)
- Manejo de reapertura desde CANCELLED (limpia columnas de cancelación)
- Rollback completo ante cualquier excepción no controlada

---

## 9. GRANTS Y REVOKES

### Resumen

| Objeto | authenticated | service_role | anon | PUBLIC |
|---|---|---|---|---|
| `transition_reservation_status` | EXECUTE | EXECUTE | REVOKE | REVOKE |
| `inout_transition_attempt_rules` (SELECT) | Vía RLS (audit.view) | Bypass | — | — |
| `inout_transition_attempt_rules` (INSERT/UPDATE/DELETE) | REVOKE | REVOKE | REVOKE | REVOKE |
| `casetilla.flow_report.transitions.execute` (permiso) | ADMIN, Full Access | N/A | N/A | N/A |

---

## 10. RLS

### Nueva política

| Tabla | Política | Operación | Condición |
|---|---|---|---|
| `inout_transition_attempt_rules` | SELECT with audit.view | SELECT | `inout_has_permission(auth.uid(), org_id, 'casetilla.flow_report.audit.view')` |

### Políticas existentes (sin cambios)

Todas las políticas creadas en Fase 6.1 permanecen sin modificaciones:

- `inout_flow_rules`: SELECT, INSERT, UPDATE (3 políticas)
- `inout_flow_incidents`: SELECT (1 política)
- `inout_state_transition_attempts`: SELECT (1 política)
- `inout_incident_comments`: SELECT, INSERT (2 políticas)
- `inout_report_schedules`: SELECT, INSERT, UPDATE, DELETE (4 políticas)
- `inout_report_runs`: SELECT (1 política)
- `inout_flow_audit_log`: SELECT (1 política)

---

## 11. ROLLBACK

### Script de rollback

```sql
BEGIN;

-- 1. Retirar RPC
DROP FUNCTION IF EXISTS public.transition_reservation_status(
    UUID, UUID, TEXT, TEXT, UUID, JSONB, UUID
);

-- 2. Retirar tabla hija (solo si no contiene evidencia productiva)
DROP TABLE IF EXISTS public.inout_transition_attempt_rules CASCADE;

-- 3. Retirar índices parciales nuevos
DROP INDEX IF EXISTS public.uq_incidents_attempt_rule_type;
DROP INDEX IF EXISTS public.uq_incidents_attempt_admin_type;

-- 4. Restaurar índice legacy (solo si es seguro)
CREATE UNIQUE INDEX IF NOT EXISTS uq_incidents_idempotency
ON public.inout_flow_incidents (org_id, idempotency_key);

-- 5. Retirar FK de attempt_id
ALTER TABLE public.inout_flow_incidents
DROP CONSTRAINT IF EXISTS fk_incidents_attempt;

-- 6. CONSERVAR attempt_id si ya contiene datos de auditoría
-- (no se droppea la columna, se mantiene como trazabilidad)

-- 7. Retirar idempotency_key de attempts
ALTER TABLE public.inout_state_transition_attempts
DROP COLUMN IF EXISTS idempotency_key;

-- 8. Restaurar previous_status_id NOT NULL
-- Solo si no hay filas con NULL legítimo
-- ALTER TABLE public.inout_state_transition_attempts
-- ALTER COLUMN previous_status_id SET NOT NULL;

-- 9. Retirar permiso
DELETE FROM public.role_permissions
WHERE permission_id = (
    SELECT id FROM public.permissions
    WHERE name = 'casetilla.flow_report.transitions.execute'
);

DELETE FROM public.permissions
WHERE name = 'casetilla.flow_report.transitions.execute';

COMMIT;
```

### Principios de rollback

| Principio | Aplicación |
|---|---|
| No borrar incidents | Los incidentes son evidencia histórica, no se eliminan |
| No borrar attempts | Los intentos son bitácora inmutable, no se eliminan |
| No eliminar evidencia productiva | Datos generados durante la operación del sistema |
| Conservar columnas con datos | `attempt_id` en incidents se mantiene si fue usado |
| Restaurar índice legacy solo si es seguro | Verificar que no hay duplicados pendientes |

---

## 12. CASOS DE PRUEBA

### 12.1 Pruebas de migración (sin datos)

| # | Prueba | Validación |
|---|---|---|
| M1 | La migración ejecuta sin errores en BD limpia | Sin errores |
| M2 | La migración es idempotente (segunda ejecución) | Sin errores, sin duplicados |
| M3 | Rollback ejecuta sin errores | Sin errores |
| M4 | Re-ejecución después de rollback | Sin errores |
| M5 | `previous_status_id` acepta NULL después del ALTER | INSERT con NULL exitoso |
| M6 | `result` acepta 'no_op' y 'override' | INSERT exitoso |
| M7 | `uq_attempts_idempotency` rechaza duplicados | UNIQUE violation |
| M8 | `uq_incidents_attempt_rule_type` rechaza duplicado misma regla | UNIQUE violation |
| M9 | `uq_incidents_attempt_admin_type` rechaza duplicado admin | UNIQUE violation |
| M10 | FK RESTRICT impide eliminar attempt con attempt_rules | FK violation |
| M11 | FK RESTRICT impide eliminar attempt con incidents | FK violation |
| M12 | FK SET NULL en incident_id (al eliminar incident) | incident_id → NULL |
| M13 | JSONB default es objeto vacío, no string vacía | `''::jsonb` |

### 12.2 Pruebas funcionales del RPC (46 pruebas del diseño)

Ver Sección 21 del diseño v2.3.1. Las 46 pruebas cubren:

- **Validaciones tempranas** (1-6): auth, existencia, permisos
- **Transiciones normales** (7-8): forward, saltos
- **No-op** (9): SAME_STATUS
- **Cancelación** (10-11): reason requerido, válida
- **No-Show** (12-13): reason requerido, válido
- **Finalización** (14): DISPATCHED → DONE
- **Reaperturas** (15-20): DISPATCHED, DONE, CANCELLED, NO_SHOW
- **NULL → PENDING** (21-22): primera transición
- **Warnings/Blocks** (23-24): R05, R02
- **Idempotencia** (25-26): replay, conflicto
- **Service role** (27-28): con/sin p_actor
- **anon** (29): sin EXECUTE
- **attempt_rules** (30): una fila por regla
- **Incidentes** (31-32, 33-46): deduplicación, coexistencia, ON CONFLICT, replay

### 12.3 Pruebas de integración

| # | Prueba | Validación |
|---|---|---|
| I1 | RPC → INSERT en attempts | attempt_id retornado, fila existe en BD |
| I2 | RPC → INSERT en attempt_rules | N filas = N reglas evaluadas |
| I3 | RPC → INSERT en incidents | incident_ids en respuesta coinciden con BD |
| I4 | RPC → INSERT en audit_log | fila existe con action correcto |
| I5 | RPC → UPDATE reservations | status_id cambiado en BD |
| I6 | RPC cancelación → columnas cancel | is_cancelled=true, cancel_reason, etc. |
| I7 | RPC reapertura CANCELLED → limpia | is_cancelled=false, columnas null |
| I8 | RPC bloqueado → reservations sin cambios | status_id = previous |
| I9 | Replay → mismos IDs que original | attempt_id, incident_ids idénticos |
| I10 | Concurrencia → segunda transacción ve nuevo estado | FOR UPDATE serializa |

---

## 13. RESUMEN DE ARCHIVOS IMPLICADOS

### Archivos a crear

| Archivo | Tipo | Contenido |
|---|---|---|
| `supabase/migrations/20260729XXXXXX_phase_6_2_transition_engine.sql` | Migración | Fases A-H completas |

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `project_plan.md` | Marcar Fase 6.2 como completada después de migración exitosa |

### Archivos sin cambios

| Archivo | Motivo |
|---|---|
| `PHASE_6_2_TRANSITION_ENGINE_DESIGN.md` | Congelado como contrato |
| `supabase/migrations/20260727120000_*.sql` hasta `20260727120600_*.sql` | Migraciones de Fase 6.1, inalteradas |
| Resto del proyecto | Sin impacto |

---

## 14. VERIFICACIÓN POST-MIGRACIÓN

```sql
-- 1. Verificar que la columna idempotency_key existe y es NOT NULL
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'inout_state_transition_attempts'
  AND column_name = 'idempotency_key';
-- Esperado: UUID, NO

-- 2. Verificar que previous_status_id es nullable
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'inout_state_transition_attempts'
  AND column_name = 'previous_status_id';
-- Esperado: YES

-- 3. Verificar índices parciales nuevos
SELECT indexname FROM pg_indexes
WHERE tablename = 'inout_flow_incidents'
  AND indexname IN ('uq_incidents_attempt_rule_type', 'uq_incidents_attempt_admin_type');
-- Esperado: 2 filas

-- 4. Verificar que índice legacy fue retirado
SELECT indexname FROM pg_indexes
WHERE tablename = 'inout_flow_incidents'
  AND indexname = 'uq_incidents_idempotency';
-- Esperado: 0 filas

-- 5. Verificar nueva tabla
SELECT table_name FROM information_schema.tables
WHERE table_name = 'inout_transition_attempt_rules';
-- Esperado: 1 fila

-- 6. Verificar RPC
SELECT proname FROM pg_proc
WHERE proname = 'transition_reservation_status';
-- Esperado: 1 fila

-- 7. Verificar permiso
SELECT name FROM public.permissions
WHERE name = 'casetilla.flow_report.transitions.execute';
-- Esperado: 1 fila

-- 8. Verificar RLS en nueva tabla
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename = 'inout_transition_attempt_rules';
-- Esperado: 1 fila (SELECT)
```

---

## 15. SECUENCIA DE EJECUCIÓN RECOMENDADA

```
1. [LOCAL]   Ejecutar migración en entorno de pruebas Docker
2. [LOCAL]   Ejecutar 46 pruebas funcionales con ROLLBACK
3. [LOCAL]   Validar queries de verificación post-migración
4. [LOCAL]   Ejecutar rollback y re-ejecutar migración (idempotencia)
5. [STAGING] Ejecutar migración en Supabase staging
6. [STAGING] Probar RPC con datos reales (org OLO, usuario admin)
7. [STAGING] Verificar que las 46 pruebas pasan
8. [PROD]    Ejecutar migración en producción
9. [PROD]    Monitorear intentos en inout_state_transition_attempts
10. [PROD]   Verificar que edge functions existentes no se rompen
```

---

*Documento generado el 2026-07-29. Plan de implementación para Fase 6.2.*
*Referencia: PHASE_6_2_TRANSITION_ENGINE_DESIGN.md v2.3.1 (congelado).*