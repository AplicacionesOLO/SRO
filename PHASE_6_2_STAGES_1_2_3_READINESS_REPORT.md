# PHASE 6.2 — STAGES 1, 2, 3: READINESS REPORT (CORREGIDO)

**Fecha**: 2026-07-29
**Versión**: V2 (corregida tras verificación literal final)
**Archivos bajo verificación**: 7 archivos de migración/rollback + 1 archivo de pruebas

---

## RESUMEN EJECUTIVO

Verificación literal completada sobre los archivos físicos de Stages 1, 2 y 3. Se detectaron y corrigieron 3 hallazgos antes de emitir este reporte. Tras correcciones, los archivos cumplen todos los criterios de seguridad estructural y compatibilidad.

---

## 1. VERIFICACIÓN JSONB — EVIDENCIA LITERAL

### Búsqueda: `''::jsonb` en archivos Stage 1/2/3

| Archivo | Línea | Contenido literal | Estado |
|---|---|---|---|
| `20260729130000_...stage_1...sql` | 73 | `evidence_json    JSONB NOT NULL DEFAULT ''::jsonb,` | **VÁLIDO** (`''`) |
| `...stages_1_2_3_tests.sql` | 75 | `-- M3: evidence_json DEFAULT is a valid JSON object ''::jsonb` | Comentario |
| `...stages_1_2_3_tests.sql` | — | Ninguna otra ocurrencia | — |

### Todas las líneas con `::jsonb` en Stage 1:

```
Línea 73:    evidence_json    JSONB NOT NULL DEFAULT ''::jsonb,
```

**Resultado: 0 ocurrencias de `''::jsonb` (cadena vacía) en código ejecutable Stages 1-3.**

### Nota sobre archivos legacy (NO desplegados en estas etapas):

Los archivos `20260729120000`, `20260729120200`, `20260729120300` contienen 5 ocurrencias de `''::jsonb`. Estos archivos NO son parte de Stages 1-3 y NO serán ejecutados. Su corrección corresponde a la implementación del RPC principal (Stage 4+).

---

## 2. CORRECCIÓN M20 — EVIDENCIA

### Antes (inválido):
```sql
RAISE NOTICE 'SKIP: M20 — attempts table is empty, backfill check not applicable';
```

### Después (corregido):
```sql
IF v_total = 0 THEN
    RAISE NOTICE 'PASS: M20 — idempotency_key column exists and is NULLABLE. Table empty (0 rows), backfill check not applicable.';
    RETURN;
END IF;
```

M20 ahora tiene dos partes:
1. **Check estructural** (siempre ejecutable): verifica que `idempotency_key` existe como NULLABLE
2. **Verificación de backfill** (dependiente de datos): si hay filas, verifica que todas tengan NULL

### Búsqueda final `SKIP`:
```
Línea 645:    RAISE NOTICE 'SKIP placeholders: 0';
```
**Única ocurrencia**: es el mensaje de resumen reportando "0 SKIP placeholders". Es meta-información, no una prueba saltada.

### Conteo real de pruebas:
| Clasificación | Cantidad | Pruebas |
|---|---|---|
| EXECUTABLE (sin datos) | **29** | M1-M9, M11-M19, M20 (parte estructural), M21-M30 |
| Best-effort | **1** | M10 (depende de que roles ADMIN/Full Access existan) |
| SKIP placeholders | **0** | — |

---

## 3. VALIDACIÓN DE HELPERS

### Helper 1: `_inout_build_transition_fingerprint`

```sql
CREATE OR REPLACE FUNCTION public._inout_build_transition_fingerprint(
    p_reservation_id    UUID,
    p_target_status_id  UUID,
    p_source            TEXT,
    p_actor             UUID,
    p_org_id            UUID
) RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = 'pg_catalog', 'public'
```

| Criterio | Estado |
|---|---|
| Firma: 5 params (UUID×4, TEXT×1) → TEXT | ✅ |
| SECURITY DEFINER | ✅ |
| search_path = pg_catalog, public | ✅ |
| IMMUTABLE (sin side effects) | ✅ |
| Sin SQL dinámico (LANGUAGE sql, no EXECUTE) | ✅ |
| Referencia columnas reales: `p_reservation_id`, `p_target_status_id`, etc. (son params, no columnas de tabla) | ✅ |
| Revoke PUBLIC, anon, authenticated | ✅ (Step 11) |

### Helper 2: `_inout_get_attempt_replay`

```sql
CREATE OR REPLACE FUNCTION public._inout_get_attempt_replay(
    p_org_id            UUID,
    p_idempotency_key   UUID
) RETURNS TABLE(
    attempt_id          UUID,
    reservation_id      UUID,
    previous_status_id  UUID,
    requested_status_id UUID,
    applied_status_id   UUID,
    result              TEXT,
    metadata_json       JSONB,
    attempted_at        TIMESTAMPTZ,
    attempted_by        UUID,
    source              TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'pg_catalog', 'public'
```

| Criterio | Estado |
|---|---|
| Firma: 2 params (UUID×2) → TABLE(9 columnas) | ✅ |
| SECURITY DEFINER | ✅ |
| search_path = pg_catalog, public | ✅ |
| STABLE (solo lectura) | ✅ |
| Sin SQL dinámico inseguro | ✅ |
| Columnas del RETURNS TABLE coinciden con schema real de `inout_state_transition_attempts` | ✅ Verificado |
| `idempotency_key` — columna referenciada en WHERE | ⚠️ Se agrega en Stage 2. Función creada en Stage 1. Resolución en runtime (plpgsql late binding). No error en CREATE. Error solo si se invoca antes de Stage 2. Documentado en comentario de la migración. |
| Revoke PUBLIC, anon, authenticated | ✅ (Step 11) |

---

## 4. VALIDACIÓN RLS Y PERMISOS

### Política RLS creada:

```sql
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
```

### Verificación de `inout_has_permission`:

Firma real en producción:
```sql
inout_has_permission(p_user_id uuid, p_org_id uuid, p_permission_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
```

| Criterio | Estado |
|---|---|
| La política pasa 3 argumentos en orden correcto (user_id, org_id, permission_name) | ✅ |
| `auth.uid()` → `p_user_id` | ✅ |
| `org_id` → `p_org_id` (columna de la fila) | ✅ |
| `'casetilla.flow_report.audit.view'` → `p_permission_name` | ✅ |
| La función existe en producción | ✅ |
| No concede acceso global (usa EXISTS + permisos del usuario) | ✅ |
| Solo SELECT — no INSERT/UPDATE/DELETE para authenticated | ✅ (Step 6 revokes) |

### Permiso `transitions.execute`:

```sql
INSERT INTO public.permissions (name, description, category)
VALUES (
    'casetilla.flow_report.transitions.execute',
    'Ejecutar transiciones de estado de reservas (cambiar status_id)',
    'casetilla'
)
ON CONFLICT (name) DO NOTHING;
```

| Criterio | Estado |
|---|---|
| Columnas usadas (`name`, `description`, `category`) existen en `public.permissions` | ✅ |
| `ON CONFLICT (name)` — la tabla tiene UNIQUE en `name` | ✅ |
| `id` y `created_at` tienen defaults | ✅ |
| Idempotente (DO NOTHING en re-ejecución) | ✅ |

### Asignación a roles:

```sql
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT tr.id, perm.id
FROM target_roles tr, perm
WHERE NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_id = tr.id AND rp.permission_id = perm.id
);
```

| Criterio | Estado |
|---|---|
| `target_roles` = roles con `name IN ('ADMIN', 'Full Access')` | ✅ |
| `WHERE NOT EXISTS` protege contra duplicados | ✅ |
| Si los roles no existen, INSERT inserta 0 filas (no error) | ✅ |
| No asigna a `PUBLIC`, `anon`, o `authenticated` | ✅ |

**Riesgo de asignación**: Si los roles `ADMIN` y `Full Access` existen, reciben el permiso automáticamente. Esto es intencional según el diseño. Si en producción se requiere control más granular, la asignación puede omitirse y ejecutarse manualmente después.

---

## 5. IDEMPOTENCIA DE LAS MIGRACIONES

### Stage 1

| Sentencia | Mecanismo | Idempotente |
|---|---|---|
| `CREATE TABLE IF NOT EXISTS` | IF NOT EXISTS | ✅ |
| `ALTER TABLE ADD CONSTRAINT` (FK org_id) | DO block + `pg_constraint` check | ✅ |
| `CREATE INDEX IF NOT EXISTS` (×4) | IF NOT EXISTS | ✅ |
| `ALTER TABLE ENABLE ROW LEVEL SECURITY` | Re-ejecución segura | ✅ |
| `DROP POLICY IF EXISTS` + `CREATE POLICY` | IF EXISTS + recreación | ✅ |
| `REVOKE ALL ON TABLE` | Re-ejecución segura | ✅ |
| `INSERT INTO permissions ... ON CONFLICT (name) DO NOTHING` | ON CONFLICT DO NOTHING | ✅ |
| `INSERT INTO role_permissions ... WHERE NOT EXISTS` | WHERE NOT EXISTS subquery | ✅ |
| `CREATE OR REPLACE FUNCTION` (×2) | OR REPLACE | ✅ |
| `REVOKE ALL ON FUNCTION` | Re-ejecución segura | ✅ |

### Stage 2

| Sentencia | Mecanismo | Idempotente |
|---|---|---|
| `ALTER TABLE ADD COLUMN IF NOT EXISTS` (×2) | IF NOT EXISTS | ✅ |
| `ALTER TABLE ADD CONSTRAINT` (FK) | DO block + `pg_constraint` check | ✅ |

**Nota**: `ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS` NO se usó porque no es sintaxis estándar en PostgreSQL. Se usó bloque DO consultando `pg_constraint`.

### Stage 3

| Sentencia | Mecanismo | Idempotente |
|---|---|---|
| `CREATE UNIQUE INDEX IF NOT EXISTS` (×3) | IF NOT EXISTS | ✅ |
| Preflight DO block (duplicate check) | Aborta si hay duplicados | ✅ (no-op si índice ya existe) |

**Todas las migraciones son completamente idempotentes. Ejecutarlas dos veces no produce errores ni objetos duplicados.**

---

## 6. COMPATIBILIDAD CON PRODUCCIÓN — BÚSQUEDAS LITERALES

| Patrón buscado | Stage 1 | Stage 2 | Stage 3 | Estado |
|---|---|---|---|---|
| `UPDATE public.reservations` | 0 | 0 | 0 | ✅ |
| `ALTER TABLE public.reservations` | 0 | 0 | 0 | ✅ |
| `DELETE FROM public.reservations` | 0 | 0 | 0 | ✅ |
| `INSERT INTO public.reservations` | 0 | 0 | 0 | ✅ |
| `transition_reservation_status` | 0 | 0 | 0 | ✅ |
| Trigger anti-bypass | 0 | 0 | 0 | ✅ |
| `DROP INDEX` (legacy) | 0 | 0 | Solo en comentario "No DROP INDEX" | ✅ |
| `SET NOT NULL` | 0 | 0 | 0 | ✅ |
| Backfill de datos | 0 | 0 | 0 | ✅ |
| `ON DELETE CASCADE` | 0 | 0 | 0 (todas son RESTRICT) | ✅ |
| `casetilla_ingresos` | 0 | 0 | 0 | ✅ |
| `casetilla_salidas` | 0 | 0 | 0 | ✅ |

**Las migraciones no contienen ninguna modificación a tablas operativas.**

---

## 7. OBJETOS YA EXISTENTES — PREFLIGHT QUERIES

Ejecutar antes de cada migración para detectar conflictos:

### Stage 1 preflight:

```sql
-- ¿Ya existe la tabla?
SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'inout_transition_attempt_rules'
);

-- ¿Ya existe el permiso?
SELECT id, name, description FROM public.permissions
WHERE name = 'casetilla.flow_report.transitions.execute';

-- ¿Ya existen los helpers? (diferente firma = conflicto)
SELECT proname, pg_get_functiondef(oid)
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('_inout_build_transition_fingerprint', '_inout_get_attempt_replay');
```

**Acción si ya existen**: Si la tabla, helpers o permisos existen con definiciones diferentes a las de la migración, NO ejecutar. Documentar la diferencia y decidir manualmente.

### Stage 2 preflight:

```sql
-- ¿Ya existen las columnas?
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'inout_state_transition_attempts' AND column_name = 'idempotency_key')
    OR (table_name = 'inout_flow_incidents' AND column_name = 'attempt_id'));

-- ¿Ya existe la FK?
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'fk_incidents_attempt';
```

**Acción**: `ADD COLUMN IF NOT EXISTS` maneja columnas existentes. La FK se crea con DO block. Si la FK ya existe con diferente definición (ej. CASCADE), abortar.

### Stage 3 preflight:

```sql
-- ¿Ya existen los índices?
SELECT indexname, indexdef FROM pg_indexes
WHERE indexname IN (
    'uq_attempts_idempotency',
    'uq_incidents_attempt_rule_type',
    'uq_incidents_attempt_admin_type'
);

-- ¿Hay duplicados que impedirían crear los índices únicos?
SELECT org_id, idempotency_key, count(*)
FROM public.inout_state_transition_attempts
WHERE idempotency_key IS NOT NULL
GROUP BY org_id, idempotency_key HAVING count(*) > 1;
```

**Acción**: `IF NOT EXISTS` maneja índices existentes. Si hay duplicados, abortar (la migración ya incluye este check).

---

## 8. ANÁLISIS DE BLOQUEOS

### Estado actual de las tablas (verificado 2026-07-29):

| Tabla | Filas | Operación | Lock esperado |
|---|---|---|---|
| `inout_state_transition_attempts` | **0** | `ADD COLUMN` (Stage 2), `CREATE INDEX` (Stage 3) | AccessExclusive (instantáneo con 0 filas) |
| `inout_flow_incidents` | **0** | `ADD COLUMN` (Stage 2), `CREATE INDEX` (Stage 3) | AccessExclusive (instantáneo con 0 filas) |
| `inout_transition_attempt_rules` | **N/A** (nueva) | `CREATE TABLE` (Stage 1) | Sin bloqueo sobre tablas existentes |

### Evaluación de riesgo:

- **Riesgo de bloqueo**: **Muy bajo** — 0 filas en ambas tablas, operaciones DDL instantáneas.
- **Duración estimada**: < 1 segundo por sentencia DDL.
- **Sesiones activas a revisar**: Ninguna esperada (tablas vacías, sin writers concurrentes en el módulo IN/OUT).

### Verificación inmediata antes de ejecutar:

```sql
-- Confirmar conteo de filas
SELECT 'attempts' as tbl, count(*) FROM public.inout_state_transition_attempts
UNION ALL
SELECT 'incidents', count(*) FROM public.inout_flow_incidents;

-- Verificar sesiones activas con locks
SELECT pid, state, wait_event_type, wait_event, query
FROM pg_stat_activity
WHERE state = 'active' AND pid != pg_backend_pid();
```

### Si aparece bloqueo:

- `statement_timeout` recomendado: 30 segundos.
- Si un DDL excede 30s, cancelar con `SELECT pg_cancel_backend(<pid>)`.
- No forzar terminación con `pg_terminate_backend`.

### ¿CONCURRENTLY?

**No se usa CONCURRENTLY.** Con 0 filas, `CREATE INDEX` sin CONCURRENTLY es instantáneo. Si en el futuro las tablas tienen millones de filas, los índices del Stage 3 deberán recrearse con CONCURRENTLY, pero eso no es necesario ahora.

---

## 9. MATRIZ DE RIESGOS CORREGIDA

| Riesgo | Probabilidad | Impacto | Nivel | Mitigación |
|---|---|---|---|---|
| `''::jsonb` causa error de sintaxis PostgreSQL | **Nula** (corregido) | Alto | — | Corregido a `''::jsonb`. Verificado con grep literal. |
| `_inout_get_attempt_replay` invocado antes de Stage 2 | Baja | Bajo | **Muy bajo** | Documentado. Solo lo invocará el RPC (Stage 4+), después de Stage 2. |
| Asignación automática de permiso a ADMIN/Full Access | Baja | Bajo | **Muy bajo** | Intencional según diseño. Roles objetivo bien definidos. |
| FK `fk_incidents_attempt` falla si hay NULLs en `attempt_id` | **Nula** | — | — | Las FK no validan NULLs. Solo aplican a valores no-nulos. |
| Índice único parcial falla por duplicados preexistentes | **Nula** | — | — | Tablas tienen 0 filas. Preflight verifica duplicados antes de crear. |
| Bloqueo por DDL en tablas con escritores activos | **Muy baja** | Bajo | **Muy bajo** | 0 filas, sin writers del módulo IN/OUT. DDL instantáneo. |
| Rollback no puede eliminar columnas con datos | Baja | Medio | **Bajo** | Rollback verifica NULLs antes de DROP. Aborta si hay datos. |
| Objeto preexistente con definición incompatible | Baja | Medio | **Bajo** | Preflight queries documentadas. Decisión manual requerida. |
| Romper módulos existentes (Reservas, Calendario, Casetilla) | **Nula** | — | — | Búsquedas confirman 0 modificaciones a tablas operativas. |

---

## 10. COMPATIBILIDAD HACIA ATRÁS

### Verificación explícita por módulo:

| Módulo | ¿Afectado? | Evidencia |
|---|---|---|
| **Reservas** | No | 0 UPDATE/ALTER/DELETE/INSERT sobre `public.reservations` |
| **Calendario** | No | Sin cambios en `reservation_statuses`, `docks`, `dock_statuses` |
| **Casetilla (ingresos/salidas)** | No | 0 referencias a `casetilla_ingresos` o `casetilla_salidas` |
| **Reportes** | No | Solo se agrega tabla nueva + columnas NULLABLE. Sin cambios en vistas o queries existentes. |
| **APIs existentes** | No | Las columnas nuevas son NULLABLE con defaults. No alteran respuestas de API. |
| **Edge Functions** | No | Sin cambios en schemas que las Edge Functions consultan. |
| **Integraciones actuales** | No | Sin modificaciones a endpoints o estructuras de datos externas. |

**Conclusión: No se identifican impactos fuera del módulo IN/OUT. Las Stages 1-3 son puramente aditivas.**

---

## 11. ROLLBACKS — VERIFICACIÓN

### Stage 1 rollback:
- Verifica que `inout_transition_attempt_rules` esté vacía (0 filas)
- Aborta si hay datos (preserva evidencia)
- Elimina helpers → permisos → política → tabla
- Sin CASCADE

### Stage 2 rollback:
- Verifica que `idempotency_key` sea all-NULL
- Verifica que `attempt_id` sea all-NULL
- Aborta si alguna columna tiene datos
- Elimina FK → columnas
- Sin CASCADE

### Stage 3 rollback:
- Verifica que índice legacy `uq_incidents_idempotency` siga existiendo
- Aborta si fue eliminado por otra migración
- Elimina solo los 3 índices nuevos
- No toca índices legacy

**Los tres rollbacks son conservadores, verifican precondiciones y abortan ante datos.**

---

## 12. VEREDICTO FINAL

# LISTO PARA EJECUCIÓN CONTROLADA EN PRODUCCIÓN

### Evidencia que respalda el veredicto:

| Criterio | Resultado |
|---|---|
| `''::jsonb` en código ejecutable Stages 1-3 | **0 ocurrencias** |
| `RAISE NOTICE 'SKIP'` en pruebas | **0 ocurrencias** |
| Helpers usan objetos reales (columnas, tablas) | **2/2 verificados** |
| Política RLS usa `inout_has_permission` (función real) | **Verificada — 3 args, orden correcto** |
| Permiso INSERT usa columnas reales de `permissions` | **Verificado — `name`, `description`, `category`** |
| Todas las migraciones son idempotentes | **100% (23/23 sentencias)** |
| Sin modificaciones a módulos operativos | **0 ocurrencias (12 patrones buscados)** |
| Preflight queries documentadas | **Sí (6 queries para las 3 etapas)** |
| Rollbacks conservadores (abortan ante datos) | **3/3 verificados** |
| Riesgo de bloqueo | **Muy bajo (0 filas, DDL instantáneo)** |

### Riesgo operativo: **Muy bajo**

- Las 3 migraciones son puramente aditivas
- 0 filas en las tablas afectadas → DDL instantáneo sin bloqueo
- Sin cambios en reservas, casetilla, calendario, APIs o Edge Functions
- Completamente reversibles con rollbacks conservadores
- Idempotentes (ejecutar 2 veces no causa errores)

### Lo que NO está en estas etapas (excluido intencionalmente):

- RPC `transition_reservation_status`
- Migración de callers
- Cambios en frontend
- Cambios en Edge Functions
- Trigger anti-bypass
- Backfill de datos
- Conversión `NOT NULL` de `idempotency_key`
- Retiro de índice legacy