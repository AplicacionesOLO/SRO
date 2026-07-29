# PHASE_6_2_SQL_AUDIT_REPORT.md

## Auditoría Técnica Independiente — Implementación Fase 6.2

---

**Versión del informe:** 1.0  
**Fecha de auditoría:** 2026-07-29  
**Auditor:** Revisión automatizada contra esquema real de Supabase  
**Alcance:** 7 archivos de implementación + 2 documentos de diseño  
**Esquema real verificado:** 2026-07-29 (12 tablas inspeccionadas directamente)  

---

## RESUMEN EJECUTIVO

### Estado: NO APROBADO

**Motivo:** 4 hallazgos CRÍTICOS que impiden el despliegue. La implementación contiene errores de sintaxis SQL que causarían fallos en tiempo de ejecución. Dos de ellos son bloqueantes absolutos (columna inexistente y cast JSONB inválido). Los otros dos son errores de sintaxis en pruebas y un bug lógico de idempotencia.

### Conteo de hallazgos

| Severidad | Cantidad |
|---|---|
| CRÍTICO | 4 |
| ALTO | 5 |
| MEDIO | 4 |
| BAJO | 3 |
| INFORMATIVO | 4 |
| **TOTAL** | **20** |

### Veredicto Final

# REQUIERE CORRECCIONES ANTES DE QA

**No se puede desplegar en QA ni producción hasta que los 4 hallazgos CRÍTICOS sean corregidos.**

---

## HALLAZGOS

---

### H-CRIT-001: Columna `message_template` inexistente en `inout_flow_rules`

| Campo | Valor |
|---|---|
| **Archivo** | `supabase/migrations/20260729120300_phase_6_2_rpc.sql` |
| **Línea aprox.** | ~290 (bloque FOR v_rule, sección 18 "Evaluate rules") |
| **Severidad** | CRÍTICO |
| **Categoría** | Error de SQL — columna inexistente |

**Descripción:** El RPC `transition_reservation_status` ejecuta el siguiente SELECT en el paso 18 (Evaluate rules):

```sql
FOR v_rule IN
    SELECT r.id, r.code, r.enforcement_mode, r.severity,
           r.creates_incident, r.priority,
           COALESCE(r.message_template, '') AS message_template   -- ❌ NO EXISTE
    FROM public.inout_flow_rules r
    WHERE r.org_id = v_org_id AND r.is_active = true
      AND r.trigger_event IN ('on_status_change','always')
    ORDER BY r.priority ASC, r.code ASC
```

La columna `message_template` **NO EXISTE** en `public.inout_flow_rules`. Las columnas reales confirmadas son: `id, org_id, warehouse_id, client_id, code, name, description, category, trigger_event, conditions_json, exclusions_json, severity, enforcement_mode, creates_incident, is_system_rule, edit_policy, is_active, applies_retroactively, grace_period_minutes, notification_mode, deduplication_window_hours, effective_from, effective_to, priority, schema_version, created_by, updated_by, created_at, updated_at`.

**Impacto:** El RPC fallará en tiempo de ejecución con error `column r.message_template does not exist`. Toda llamada que llegue al paso 18 (es decir, cualquier transición que pase las validaciones tempranas) causará un ROLLBACK completo y retornará `INTERNAL_ERROR`. El motor de transiciones queda **completamente inoperativo**.

**Riesgo:** Bloqueante absoluto. El RPC no puede ejecutar ninguna transición que implique evaluación de reglas.

**Recomendación:** 
- Opción A: Agregar columna `message_template TEXT` a `inout_flow_rules` en la migración de schema, con backfill para reglas existentes.
- Opción B: Reemplazar `COALESCE(r.message_template, '')` por `COALESCE(r.description, '')` o `r.name` en el SELECT del FOR loop.
- Opción C: Usar un literal vacío `''` y eliminar la referencia a `message_template` del SELECT.

---

### H-CRIT-002: `''::jsonb` es sintaxis PostgreSQL INVÁLIDA (7 ocurrencias)

| Campo | Valor |
|---|---|
| **Archivos** | `20260729120000_phase_6_2_schema.sql`, `20260729120200_phase_6_2_helpers.sql`, `20260729120300_phase_6_2_rpc.sql` |
| **Líneas aprox.** | Schema:~156, Helpers:~110/~145, RPC:~15/~150/~170/~320 |
| **Severidad** | CRÍTICO |
| **Categoría** | Error de SQL — cast inválido |

**Descripción:** `''::jsonb` intenta convertir una cadena vacía PostgreSQL (`''`) al tipo `jsonb`. Esto NO es válido porque una cadena vacía no es JSON válido:

```sql
SELECT ''::jsonb;
-- ERROR: invalid input syntax for type json
-- DETAIL: The input string ended unexpectedly.
```

El valor correcto para un objeto JSON vacío es `''::jsonb`. El esquema real de la base de datos confirma que las tablas existentes ya usan `''::jsonb` (ej: `inout_state_transition_attempts.metadata_json` tiene default `''::jsonb`).

**7 ocurrencias exactas:**

| # | Archivo | Contexto | Código |
|---|---|---|---|
| 1 | Schema | CREATE TABLE — columna evidence_json | `evidence_json JSONB NOT NULL DEFAULT ''::jsonb` |
| 2 | Helpers | Rama A INSERT incidentes con rule_id | `v_idem_text, ''::jsonb,` |
| 3 | Helpers | Rama B INSERT incidentes sin rule_id | `v_idem_text, ''::jsonb,` |
| 4 | RPC | Parámetro p_metadata default | `p_metadata JSONB DEFAULT ''::jsonb` |
| 5 | RPC | Paso 07 — INSERT attempt permiso denegado | `p_idempotency_key, ''::jsonb,` |
| 6 | RPC | Paso 08 — INSERT attempt SAME_STATUS | `p_idempotency_key, ''::jsonb, false, false, v_start_ts` |
| 7 | RPC | Paso 18 — INSERT attempt_rules | `v_rule.message_template, ''::jsonb` |

**Impacto:** Cualquier ruta de código que intente evaluar `''::jsonb` fallará con un error de sintaxis SQL en tiempo de ejecución. Esto afecta:
- Ocurrencia #1: La migración de schema fallará al crear la tabla `inout_transition_attempt_rules`.
- Ocurrencias #2-#3: El helper `_inout_create_transition_incident` fallará al insertar incidentes.
- Ocurrencia #4: Toda llamada al RPC sin pasar `p_metadata` explícitamente usará el default y fallará.
- Ocurrencias #5-#6: Los intentos fallidos (permiso denegado, SAME_STATUS) no podrán persistirse.
- Ocurrencia #7: El registro de reglas evaluadas fallará.

**Riesgo:** Bloqueante absoluto. La migración del schema podría fallar (#1). Si pasa (porque `DEFAULT` se evalúa en runtime), todas las rutas del RPC que usan `''::jsonb` causarán errores de ejecución.

**Recomendación:** Reemplazar TODAS las ocurrencias de `''::jsonb` por `''::jsonb`. Usar un script determinista sobre los archivos reales (no herramientas que normalizan ``).

---

### H-CRIT-003: `ROLLBACK` dentro de bloque DO en prueba M3

| Campo | Valor |
|---|---|
| **Archivo** | `supabase/tests/phase_6_2_transition_engine_tests.sql` |
| **Línea aprox.** | ~50 (bloque M3) |
| **Severidad** | CRÍTICO |
| **Categoría** | Error de SQL — comando no permitido |

**Descripción:** La prueba M3 contiene:

```sql
DO $$ BEGIN
    BEGIN
        INSERT INTO public.inout_state_transition_attempts (...) ... ;
        RAISE NOTICE 'M3 PASS: no_op accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE EXCEPTION 'M3 FAIL: no_op rejected by CHECK';
    END;
    ROLLBACK;   -- ❌ INVÁLIDO dentro de DO block
END $$;
```

`ROLLBACK` **no puede ejecutarse dentro de un bloque `DO`** en PostgreSQL. Los bloques `DO` ejecutan en su propia subtransacción implícita. Emitir `ROLLBACK` desde dentro causa:

```
ERROR: cannot roll back while a subtransaction is active
```

**Impacto:** La prueba M3 fallará con un error de sintaxis, no por la lógica que intenta probar. Además, M3 intenta insertar datos basura (UUIDs ficticios) que violan FKs — la prueba fallaría por `foreign key violation` antes siquiera de llegar al ROLLBACK.

**Riesgo:** Las pruebas de migración no son ejecutables. M3 falla. Esto da una falsa sensación de validación.

**Recomendación:** Eliminar `ROLLBACK;` del bloque DO. Ejecutar las pruebas dentro de una transacción explícita (`BEGIN; ... ROLLBACK;`) en el SQL Editor, o documentar que deben ejecutarse con `BEGIN/ROLLBACK` envolvente.

---

### H-CRIT-004: SAME_STATUS y intentos fallidos sin fingerprint rompen idempotencia

| Campo | Valor |
|---|---|
| **Archivo** | `supabase/migrations/20260729120300_phase_6_2_rpc.sql` |
| **Línea aprox.** | ~150 (paso 07), ~170 (paso 08) |
| **Severidad** | CRÍTICO |
| **Categoría** | Error lógico — idempotencia quebrada |

**Descripción:** Los pasos 07 (permiso denegado) y 08 (SAME_STATUS) insertan un registro en `inout_state_transition_attempts` con `metadata_json = ''::jsonb` (que además es inválido, ver H-CRIT-002). Incluso si se corrige a `''::jsonb`, estos inserts **no incluyen fingerprint** en `metadata_json`.

Cuando el paso 12 (idempotency check) busca un intento previo:

```sql
SELECT a.id, a.result, a.applied_status_id,
       a.metadata_json->>'fingerprint' AS stored_fp
INTO v_existing_attempt
FROM public.inout_state_transition_attempts a
WHERE a.org_id = v_org_id AND a.idempotency_key = p_idempotency_key;
```

Para un replay de SAME_STATUS o permiso denegado, `stored_fp` será `NULL` (porque `''::jsonb->>'fingerprint'` retorna NULL). La comparación:

```sql
IF v_existing_attempt.stored_fp IS NOT NULL
   AND v_existing_attempt.stored_fp = v_fingerprint THEN
```

Evaluará a FALSE (porque `NULL IS NOT NULL` es FALSE), y el replay será tratado como `IDEMPOTENCY_CONFLICT` en lugar de `IDEMPOTENCY_REPLAY`.

**Impacto:** Un caller que reintenta una operación SAME_STATUS o una operación bloqueada por permiso recibirá `IDEMPOTENCY_CONFLICT` en lugar del resultado original. Esto rompe la garantía de idempotencia para estos casos.

**Riesgo:** Aunque SAME_STATUS y permisos denegados son casos "inofensivos" (no modifican la reserva), el caller espera idempotencia y recibe un conflicto. Esto puede causar lógica de reintento incorrecta en edge functions.

**Recomendación:** Incluir `jsonb_build_object('fingerprint', v_fingerprint)` en `metadata_json` para los INSERT de los pasos 07 y 08, igual que se hace en los pasos 16 y 17.

---

### H-HIGH-001: Prueba M6 verifica `confupdtype` en lugar de `confdeltype`

| Campo | Valor |
|---|---|
| **Archivo** | `supabase/tests/phase_6_2_transition_engine_tests.sql` |
| **Línea aprox.** | ~60 (bloque M6) |
| **Severidad** | ALTO |
| **Categoría** | Error lógico en prueba |

**Descripción:** La prueba M6 verifica:

```sql
SELECT 1 FROM pg_constraint
WHERE conname = 'fk_incidents_attempt' AND confupdtype = 'r'
```

La FK `fk_incidents_attempt` se crea como `ON DELETE RESTRICT` sin especificar ON UPDATE. En PostgreSQL:
- `confdeltype` = `'r'` (RESTRICT para DELETE)  
- `confupdtype` = `'a'` (NO ACTION para UPDATE, que es el default)

La prueba verifica `confupdtype` (ON UPDATE) cuando debería verificar `confdeltype` (ON DELETE).

**Impacto:** La prueba M6 siempre fallará porque `confupdtype` será `'a'`, no `'r'`. Falsa alarma.

**Recomendación:** Cambiar `confupdtype = 'r'` por `confdeltype = 'r'`.

---

### H-HIGH-002: Migración dividida en 4 archivos = despliegue no atómico

| Campo | Valor |
|---|---|
| **Archivos** | `20260729120000` al `20260729120300` |
| **Severidad** | ALTO |
| **Categoría** | Riesgo operacional |

**Descripción:** La implementación usa 4 migraciones secuenciales, cada una con su propio `BEGIN...COMMIT`. Si la migración #3 (helpers) o #4 (RPC) falla, las migraciones #1 y #2 ya están commiteadas. Esto deja la base de datos en un estado parcial:

- Schema modificado (ALTERs, índices, nueva tabla) ✅
- Permiso creado y asignado ✅  
- Helpers ❌ (no existen)
- RPC ❌ (no existe)

En este estado, los callers no pueden usar el RPC, pero los índices parciales y constraints ya están activos, y la columna `idempotency_key` ya es NOT NULL.

**Impacto:** Recuperación manual requerida. El rollback tendría que ejecutarse explícitamente.

**Riesgo:** Un fallo en migración #3 o #4 deja la BD en estado inconsistentente que requiere intervención manual.

**Recomendación:** Documentar explícitamente en la guía de ejecución que las 4 migraciones forman una unidad lógica y que si cualquiera falla, debe ejecutarse el rollback completo. O alternativamente, combinar todo en una sola migración (aunque sea grande).

---

### H-HIGH-003: 56 de 69 pruebas son placeholders no ejecutables

| Campo | Valor |
|---|---|
| **Archivo** | `supabase/tests/phase_6_2_transition_engine_tests.sql` |
| **Severidad** | ALTO |
| **Categoría** | Cobertura de pruebas insuficiente |

**Descripción:** El plan de implementación promete 69 pruebas (46 funcionales + 13 migración + 10 integración). Sin embargo:

- **M1-M12**: Ejecutables (schema checks), aunque M3 falla (H-CRIT-003) y M6 falla (H-HIGH-001).
- **M13**: SKIP documentado.
- **F1-F46**: TODAS son `RAISE NOTICE 'FX SKIP [DATA_REQUIRED]'` sin lógica de prueba real.
- **I1-I10**: Solo comentarios documentando qué probarían, sin código ejecutable.

Total real de pruebas ejecutables: **10 de 69** (M1, M2, M4, M5, M7, M8, M9, M10, M11, M12). Y de esas 10, M3 y M6 están rotas.

**Impacto:** No hay validación real del comportamiento del RPC. Si se despliega, los errores H-CRIT-001 y H-CRIT-002 solo se descubrirán en tiempo de ejecución.

**Recomendación:** Implementar pruebas funcionales reales (no solo comentarios) usando datos de prueba en una transacción con ROLLBACK. Priorizar pruebas que validen el RPC con combinaciones de parámetros reales.

---

### H-HIGH-004: `evidence_json` usa DEFAULT `''::jsonb` en la migración de schema

| Campo | Valor |
|---|---|
| **Archivo** | `supabase/migrations/20260729120000_phase_6_2_schema.sql` |
| **Línea aprox.** | ~156 |
| **Severidad** | ALTO |
| **Categoría** | Error de SQL — cast inválido en DDL |

**Descripción:** La creación de la tabla `inout_transition_attempt_rules` define:

```sql
evidence_json JSONB NOT NULL DEFAULT ''::jsonb,
```

Esto hará que la migración falle al crear la tabla porque `''::jsonb` no es sintaxis PostgreSQL válida (ver H-CRIT-002). A diferencia de los defaults en parámetros de función (que se evalúan en runtime), los defaults de columna en DDL se validan durante la creación de la tabla.

**Impacto:** La migración #1 fallará en el CREATE TABLE de `inout_transition_attempt_rules`. Toda la Fase 6.2 se detiene aquí. Las operaciones anteriores dentro del mismo bloque BEGIN...COMMIT también harán rollback.

**Riesgo:** Bloquea el despliegue en el primer archivo de migración.

**Recomendación:** Cambiar a `DEFAULT ''::jsonb`.

---

### H-HIGH-005: R11 lookup depende de código hardcodeado que puede no coincidir con la BD

| Campo | Valor |
|---|---|
| **Archivo** | `supabase/migrations/20260729120300_phase_6_2_rpc.sql` |
| **Línea aprox.** | ~210 (paso 15, búsqueda de R11) |
| **Severidad** | ALTO |
| **Categoría** | Error lógico — dependencia frágil |

**Descripción:** En el paso 15 (DONE override), el RPC busca el rule_id de R11:

```sql
SELECT id INTO v_rule_id_for_inc
FROM public.inout_flow_rules
WHERE code = 'DONE_REOPEN_ATTEMPT' AND org_id = v_org_id AND is_active = true
LIMIT 1;
```

Si la regla R11 tiene un código diferente en la BD, o si no existe para esa organización, `v_rule_id_for_inc` será NULL. Luego se pasa a `_inout_create_transition_incident` con `p_rule_id = NULL`, lo que hace que el incidente se cree como "administrativo" (rama B, rule_id IS NULL) en lugar de "basado en regla" (rama A). Esto es incorrecto: R11 debe siempre generar un incidente vinculado a la regla.

**Impacto:** Si el código de R11 en BD no es exactamente `'DONE_REOPEN_ATTEMPT'`, el incidente por reapertura DONE no tendrá `rule_id`, perdiendo trazabilidad.

**Riesgo:** Medio en producción actual (las 16 reglas seeded sí tienen ese código), pero frágil ante cambios de configuración.

**Recomendación:** Si `v_rule_id_for_inc` es NULL después de la búsqueda, generar un WARNING o un incidente administrativo con mensaje explícito indicando que R11 no fue encontrada.

---

### H-MED-001: Postflight #10 en guía de ejecución se contradice

| Campo | Valor |
|---|---|
| **Archivo** | `PHASE_6_2_EXECUTION_GUIDE.md` |
| **Línea aprox.** | ~110 |
| **Severidad** | MEDIO |
| **Categoría** | Documentación incorrecta |

**Descripción:** El postflight check #10 dice:

```
SELECT column_default FROM information_schema.columns
WHERE table_name = 'inout_transition_attempt_rules' AND column_name = 'evidence_json';
-- Expected: ''::jsonb (object, not empty string)
```

Esto es contradictorio: `''` es una cadena vacía, no un objeto. Además, `''::jsonb` no es sintaxis válida. El valor esperado correcto debería ser `''::jsonb`.

**Recomendación:** Corregir a `Expected: ''::jsonb (empty JSON object)`.

---

### H-MED-002: Guía de ejecución usa `\gset` (psql específico)

| Campo | Valor |
|---|---|
| **Archivo** | `PHASE_6_2_EXECUTION_GUIDE.md` |
| **Línea aprox.** | ~160 |
| **Severidad** | MEDIO |
| **Categoría** | Documentación — comando no portable |

**Descripción:** La sección 7.2 de validación manual usa:

```sql
SELECT gen_random_uuid() AS key \gset
```

`\gset` es un meta-comando específico de `psql` (PostgreSQL CLI). No funciona en Supabase SQL Editor ni en otros clientes SQL.

**Recomendación:** Reemplazar con instrucciones que funcionen en Supabase SQL Editor (ej: copiar manualmente el UUID generado, o usar una variable en una transacción DO).

---

### H-MED-003: M3 inserta datos que violan FKs

| Campo | Valor |
|---|---|
| **Archivo** | `supabase/tests/phase_6_2_transition_engine_tests.sql` |
| **Línea aprox.** | ~35 |
| **Severidad** | MEDIO |
| **Categoría** | Prueba mal diseñada |

**Descripción:** La prueba M3 intenta insertar:

```sql
INSERT INTO public.inout_state_transition_attempts (
    org_id, reservation_id, previous_status_id, requested_status_id,
    applied_status_id, result, attempted_by, source, idempotency_key
) VALUES (
    '00000000-0000-0000-0000-000000000001'::UUID,   -- org fake
    '00000000-0000-0000-0000-000000000002'::UUID,   -- reservation fake
    NULL, ... 'no_op', ...
);
```

Estos UUIDs son ficticios. La inserción fallará por `foreign key violation` en `org_id → organizations(id)`, `reservation_id → reservations(id)`, o `attempted_by → profiles(id)`, antes de siquiera probar el CHECK de `result`.

**Impacto:** La prueba M3 nunca prueba el CHECK que dice probar.

**Recomendación:** Usar UUIDs de organizaciones, reservas y perfiles reales extraídos de la BD de prueba.

---

### H-MED-004: `reservations.dock_id` es NOT NULL pero el RPC lo lee sin usarlo

| Campo | Valor |
|---|---|
| **Archivo** | `supabase/migrations/20260729120300_phase_6_2_rpc.sql` |
| **Línea aprox.** | ~85, ~190 |
| **Severidad** | MEDIO |
| **Categoría** | Código muerto |

**Descripción:** Los pasos 03 y 13 seleccionan `r.dock_id` junto con otros campos de la reserva. `dock_id` es NOT NULL en el esquema real. Sin embargo, el valor nunca se usa en ninguna validación ni lógica posterior. Es código muerto.

**Impacto:** Ninguno funcional. Solo ruido en el código.

**Recomendación:** Eliminar `r.dock_id` de los SELECTs en pasos 03 y 13, o documentar por qué se lee (ej: uso futuro para validación R13 WAREHOUSE_MISMATCH).

---

### H-LOW-001: Rollback restaura constraint con definición diferente a la original

| Campo | Valor |
|---|---|
| **Archivo** | `supabase/migrations/20260729129999_phase_6_2_rollback.sql` |
| **Línea aprox.** | ~200 |
| **Severidad** | BAJO |
| **Categoría** | Inconsistencia estructural |

**Descripción:** La constraint original `ck_attempts_different_status` en la BD real es:

```sql
CHECK ((previous_status_id <> requested_status_id))
```

El rollback la restaura como:

```sql
CHECK (previous_status_id IS NULL OR previous_status_id <> requested_status_id)
```

Aunque son **semánticamente equivalentes** (porque `NULL <> X` evalúa a NULL, y CHECK pasa con NULL), la definición textual es diferente. Esto podría causar confusiones en futuras auditorías de schema.

**Recomendación:** Restaurar la definición exacta original: `CHECK ((previous_status_id <> requested_status_id))`.

---

### H-LOW-002: Preflight espera ≥12 estados activos pero hay exactamente 12

| Campo | Valor |
|---|---|
| **Archivo** | `supabase/migrations/20260729120000_phase_6_2_schema.sql` |
| **Línea aprox.** | ~20 |
| **Severidad** | BAJO |
| **Categoría** | Validación laxa |

**Descripción:** El preflight verifica:

```sql
IF v_count < 12 THEN RAISE WARNING 'Expected >=12 active statuses, found %', v_count; END IF;
```

Actualmente hay exactamente 12 estados activos. Si en el futuro se agrega un estado 13, la validación pasa silenciosamente (lo cual es aceptable). Pero si se elimina un estado, solo genera WARNING (no bloquea). Esto es intencionalmente no-bloqueante, pero el umbral `>=12` podría ajustarse para ser más preciso.

**Recomendación:** Cambiar `v_count < 12` a `v_count != 12` si se quiere detectar tanto la adición como la eliminación de estados. O mantener `>= 12` si solo importa el piso mínimo.

---

### H-LOW-003: `status_id` en `reservations` es NULLABLE

| Campo | Valor |
|---|---|
| **Archivos** | RPC, design doc |
| **Severidad** | BAJO |
| **Categoría** | Consistencia con esquema |

**Descripción:** `reservations.status_id` es NULLABLE en el esquema real. El RPC maneja correctamente el caso NULL (pasos 09, 14). Sin embargo, `dock_id` es NOT NULL, lo que significa que toda reserva tiene un andén asignado. Esto no afecta al RPC.

**Recomendación:** Ninguna. Solo documentar para conciencia del desarrollador.

---

### H-INFO-001: `inout_has_permission` confirmado con 3 parámetros

**Archivo:** RPC, RLS policy  
**Verificación:** El esquema real confirma `inout_has_permission(p_user_id UUID, p_org_id UUID, p_permission_name TEXT) RETURNS BOOLEAN`. Todas las llamadas en el RPC y la RLS policy usan exactamente 3 argumentos. ✅

---

### H-INFO-002: `inout_flow_audit_log` tiene las columnas esperadas

**Verificación:** Columnas reales: `id, org_id, entity_type, entity_id, action, old_value, new_value, user_id, ip_address, created_at`. Coinciden con las usadas en los INSERT del RPC. ✅

---

### H-INFO-003: `reservation_statuses` tiene 12 códigos activos que coinciden con el grafo

**Verificación:** PENDING, CONFIRMED, ARRIVED_PENDING_UNLOAD, IN_PROGRESS, PENDING_DISCHARGE, START, UNLOADING, DISCHARGED, DISPATCHED, CANCELLED, DONE, NO_SHOW. Las 9 transiciones forward del RPC usan estos códigos exactos. Los 3 estados legacy inactivos (CHECKING_IN, CHECKEDIN_PENDING_CLOSE, UNLOADED_PENDING_CHECKIN) son correctamente excluidos por el filtro `is_active = true`. ✅

---

### H-INFO-004: Índices parciales y constraint de FKs bien diseñados

**Verificación:** Los 2 índices parciales propuestos (`uq_incidents_attempt_rule_type` con `WHERE rule_id IS NOT NULL AND attempt_id IS NOT NULL`, y `uq_incidents_attempt_admin_type` con `WHERE rule_id IS NULL AND attempt_id IS NOT NULL`) usan exactamente la misma cláusula WHERE que los ON CONFLICT en el helper `_inout_create_transition_incident`. Esto es correcto y garantiza que PostgreSQL pueda hacer el match. ✅

---

## MATRIZ DE RIESGOS

| ID | Hallazgo | Severidad | Probabilidad | Impacto | Bloquea despliegue |
|---|---|---|---|---|---|
| H-CRIT-001 | `message_template` no existe en `inout_flow_rules` | CRÍTICO | 100% | RPC inoperativo | ✅ SÍ |
| H-CRIT-002 | `''::jsonb` inválido (7 ocurrencias) | CRÍTICO | 100% | Múltiples fallos runtime | ✅ SÍ |
| H-CRIT-003 | `ROLLBACK` en DO block (prueba M3) | CRÍTICO | 100% | Pruebas no ejecutables | ✅ SÍ (pruebas) |
| H-CRIT-004 | SAME_STATUS sin fingerprint | CRÍTICO | 100% | Idempotencia rota para SAME_STATUS | ✅ SÍ |
| H-HIGH-001 | M6 verifica columna incorrecta | ALTO | 100% | Prueba siempre falla | No |
| H-HIGH-002 | 4 migraciones no atómicas | ALTO | Baja | Recuperación manual | No |
| H-HIGH-003 | 56/69 pruebas son placeholders | ALTO | N/A | Sin validación real | No (pero riesgoso) |
| H-HIGH-004 | `evidence_json` DEFAULT `''::jsonb` | ALTO | 100% | Migración #1 falla | ✅ SÍ |
| H-HIGH-005 | R11 lookup frágil | ALTO | Baja | Incidente sin rule_id | No |
| H-MED-001 | Postflight #10 contradictorio | MEDIO | N/A | Confusión en validación | No |
| H-MED-002 | `\gset` no portable | MEDIO | N/A | Documentación incorrecta | No |
| H-MED-003 | M3 viola FKs | MEDIO | 100% | Prueba nunca prueba CHECK | No |
| H-MED-004 | `dock_id` leído sin usar | MEDIO | N/A | Código muerto | No |
| H-LOW-001 | Rollback constraint diferente | BAJO | N/A | Inconsistencia estructural | No |
| H-LOW-002 | Preflight ≥12 laxo | BAJO | N/A | No detecta adición | No |
| H-LOW-003 | `status_id` NULLABLE | BAJO | N/A | Documentado | No |
| H-INFO-(1-4) | Verificaciones de conformidad | INFO | N/A | Informativo | No |

---

## COMPATIBILIDAD

### Evaluación: Esta implementación NO rompe módulos existentes... SI los hallazgos CRÍTICOS se corrigen primero.

**Análisis por módulo:**

| Módulo | ¿Afectado? | Detalle |
|---|---|---|
| **Reservas** (CRUD) | No | El RPC solo modifica `status_id`, `is_cancelled`, `cancel_*`, `updated_by`, `updated_at`. No toca `dock_id`, `start_datetime`, ni columnas estructurales. |
| **Calendario** | No | El calendario lee `reservations.status_id` y `reservation_statuses`. El RPC no modifica la estructura de estados. |
| **Casetilla** (ingresos/salidas) | No | `inout_flow_incidents` gana `attempt_id` (NULLABLE). Las funciones existentes no referencian esta columna. Los índices parciales nuevos no interfieren con consultas existentes. |
| **Reportes** | No | La nueva tabla `inout_transition_attempt_rules` es adicional. Los reportes existentes no la consultan. |
| **APIs actuales** | No | `api-v1-reservations-patch-status` sigue funcionando con su lógica actual (no migrada). `api-v1-reservations-get-*` no se modifican. |
| **Edge Functions** | No (sintaxis) | Ninguna edge function referenciada en el código de migración. Las funciones existentes no dependen de `message_template` (columna que no existe). |
| **Triggers** | No | `trg_reservations_block_sensitive_updates` bloquea `created_by`, `org_id`, `dock_id` — el RPC no modifica estas columnas. `trg_reservations_set_updated_at` es redundante pero inofensivo. `validate_reservation_conflicts` está DISABLED. |
| **RLS** | No | Las políticas RLS existentes en `reservations` no se modifican. `inout_state_transition_attempts` mantiene sus políticas actuales. |
| **Índices existentes** | Sí — pero planeado | `uq_incidents_idempotency` se retira. Esto es intencional y el diseño lo documenta extensamente (Sección 16.5). Dos índices parciales nuevos lo reemplazan. |

### Riesgos de compatibilidad identificados

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| `uq_incidents_idempotency` retirado podría afectar queries que asumen unicidad | Baja | Ningún código existente hace ON CONFLICT sobre este índice |
| `idempotency_key` UUID en attempts es NOT NULL — backfill necesario | N/A | La migración hace backfill con `gen_random_uuid()` |
| `previous_status_id` se vuelve nullable | N/A | El preflight verifica que sea seguro. La constraint `ck_attempts_different_status` usa `<>`, que ya tolera NULL |

### Veredicto de compatibilidad

**"No se identifican impactos fuera del módulo IN/OUT que impidan el despliegue, siempre que los hallazgos CRÍTICOS sean corregidos."**

---

## RESUMEN DE OCURRENCIAS `''::jsonb`

| Archivo | Línea aprox. | Contexto | Estado |
|---|---|---|---|
| Schema | 156 | `evidence_json DEFAULT ''::jsonb` | ❌ DEBE ser `''::jsonb` |
| Helpers | 110 | Rama A: `''::jsonb` en INSERT incidentes | ❌ DEBE ser `''::jsonb` |
| Helpers | 145 | Rama B: `''::jsonb` en INSERT incidentes | ❌ DEBE ser `''::jsonb` |
| RPC | 15 | `p_metadata DEFAULT ''::jsonb` | ❌ DEBE ser `''::jsonb` |
| RPC | 150 | Paso 07: `''::jsonb` en metadata_json attempt | ❌ DEBE ser `''::jsonb` |
| RPC | 170 | Paso 08: `''::jsonb` en metadata_json attempt | ❌ DEBE ser `''::jsonb` |
| RPC | 320 | Paso 18: `''::jsonb` en evidence_json | ❌ DEBE ser `''::jsonb` |

**Conteo: 7 ocurrencias — TODAS deben ser `''::jsonb`**

---

## RESUMEN DE PRUEBAS REALMENTE EJECUTABLES

| ID | Ejecutable | Estado esperado |
|---|---|---|
| M1 | ✅ Sí | PASS |
| M2 | ✅ Sí | PASS |
| M3 | ❌ Roto | Falla por ROLLBACK + FK violation |
| M4 | ✅ Sí | PASS |
| M5 | ✅ Sí | PASS |
| M6 | ❌ Roto | Falla por `confupdtype` vs `confdeltype` |
| M7 | ✅ Sí | PASS |
| M8 | ✅ Sí | PASS |
| M9 | ✅ Sí | PASS |
| M10 | ✅ Sí | PASS |
| M11 | ✅ Sí | PASS |
| M12 | ✅ Sí | PASS |
| M13 | ⏭️ SKIP | Documentado |
| F1-F46 | ⏭️ SKIP | Placeholders (solo comentarios) |
| I1-I10 | ⏭️ SKIP | Placeholders (solo comentarios) |

**Total ejecutables reales: 10 de 69 (14.5%). De esas 10, 2 están rotas.**

---

## VERIFICACIÓN DE NO REGRESIÓN (Decisiones v2.3)

| Elemento | Estado en implementación |
|---|---|
| `uq_incidents_attempt_rule_type` | ✅ Índice parcial creado correctamente |
| `uq_incidents_attempt_admin_type` | ✅ Índice parcial creado correctamente |
| attempt_id estrategia 5 etapas | ✅ Columna NULLABLE + FK RESTRICT (Etapas 1-2) |
| ON DELETE RESTRICT en attempt_id FK | ✅ |
| ON DELETE RESTRICT en attempt_rules FKs | ✅ |
| Dos ramas ON CONFLICT | ✅ Helper `_inout_create_transition_incident` |
| p_idempotency_key UUID obligatorio | ✅ NOT NULL, no default, validado en RPC |
| fingerprint sin reason ni metadata | ✅ Helper `_inout_build_transition_fingerprint` |
| Retiro `uq_incidents_idempotency` | ✅ DROP INDEX en migración |
| `''::jsonb` → `''::jsonb` | ❌ **7 ocurrencias sin corregir** |
| 46 pruebas | ❌ **Solo 10 ejecutables, 2 rotas** |
| `p_actor_user_id` anti-spoofing | ✅ Helper `_inout_resolve_transition_actor` |

---

## VEREDICTO FINAL

# REQUIERE CORRECCIONES ANTES DE QA

**4 hallazgos CRÍTICOS bloquean el despliegue:**

1. **H-CRIT-001**: `r.message_template` no existe en `inout_flow_rules` → RPC inoperativo.
2. **H-CRIT-002**: 7 ocurrencias de `''::jsonb` (sintaxis inválida) → fallos en migración y runtime.
3. **H-CRIT-003**: `ROLLBACK` en DO block de prueba M3 → pruebas rotas.
4. **H-CRIT-004**: SAME_STATUS y permiso denegado insertan sin fingerprint → idempotencia rota.

**Acciones requeridas antes de QA:**

| Prioridad | Acción | Archivos |
|---|---|---|
| 1 | Agregar `message_template TEXT` a `inout_flow_rules` o cambiar el SELECT del RPC | RPC línea ~290 |
| 2 | Reemplazar 7× `''::jsonb` → `''::jsonb` | Schema, Helpers, RPC |
| 3 | Eliminar `ROLLBACK;` de M3 y corregir FKs de prueba | Tests |
| 4 | Agregar fingerprint a INSERTs de pasos 07 y 08 | RPC |
| 5 | Cambiar M6: `confupdtype` → `confdeltype` | Tests |
| 6 | Implementar pruebas funcionales F1-F46 reales | Tests |
| 7 | Corregir postflight #10 en guía de ejecución | Execution Guide |

---

*Informe generado el 2026-07-29. No se realizaron modificaciones a los archivos auditados.*