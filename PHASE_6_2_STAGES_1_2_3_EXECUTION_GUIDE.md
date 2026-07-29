# PHASE_6_2_STAGES_1_2_3_EXECUTION_GUIDE.md

## Guía de Ejecución — Stages 1, 2, 3

---

**Versión:** 1.0
**Fecha:** 2026-07-29
**Referencia:** PHASE_6_2_TRANSITION_ENGINE_DESIGN.md v2.3.1
**Entorno objetivo:** Supabase Production (SQL Editor)

---

## 0. ANTES DE EMPEZAR

### Decisión requerida por etapa

Cada etapa tiene un punto de decisión explícito:
- **CONTINUAR** — La etapa fue exitosa, proceder a la siguiente.
- **DETENER** — La etapa tuvo warnings. Revisar antes de continuar.
- **REVERTIR** — La etapa falló. Ejecutar rollback y detenerse.

---

## 1. PREFLIGHT

Ejecutar estas consultas en SQL Editor antes de cualquier migración:

```sql
-- 1.1 Verificar que las tablas base existen
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'inout_state_transition_attempts',
    'inout_flow_incidents',
    'inout_flow_rules',
    'organizations',
    'permissions',
    'roles',
    'role_permissions'
  );
-- Esperado: 7 filas

-- 1.2 Verificar que inout_has_permission existe
SELECT proname FROM pg_proc
WHERE proname = 'inout_has_permission'
  AND pronamespace = 'public'::regnamespace;
-- Esperado: 1 fila

-- 1.3 Verificar roles ADMIN y Full Access
SELECT id, name FROM public.roles
WHERE name IN ('ADMIN', 'Full Access');
-- Esperado: 2 filas

-- 1.4 Verificar permisos existentes (para referencia)
SELECT name FROM public.permissions WHERE category = 'casetilla' ORDER BY name;
```

---

## 2. BACKUP RECOMENDADO

Aunque Stages 1-3 no modifican datos productivos, se recomienda:

1. **Exportar schema actual** desde Supabase Dashboard → Database → Backups.
2. **Anotar el estado actual** de índices y constraints:
   ```sql
   SELECT indexname, indexdef FROM pg_indexes
   WHERE tablename IN ('inout_flow_incidents', 'inout_state_transition_attempts')
   ORDER BY tablename, indexname;
   ```

---

## 3. CONSULTAS DE VOLUMEN (para confirmar riesgo de bloqueo)

```sql
SELECT 'inout_state_transition_attempts' AS tbl,
       count(*) AS rows,
       pg_size_pretty(pg_total_relation_size('public.inout_state_transition_attempts')) AS size
UNION ALL
SELECT 'inout_flow_incidents',
       count(*),
       pg_size_pretty(pg_total_relation_size('public.inout_flow_incidents'));
```

**Interpretación:**
- **0 filas** → Sin riesgo de bloqueo. Proceder sin CONCURRENTLY.
- **> 0 filas** → Evaluar si se necesita CONCURRENTLY para Stage 3.

---

## 4. CONSULTAS DE DUPLICADOS (pre-Stage 3)

Ejecutar antes de Stage 3 para confirmar que los índices parciales pueden crearse:

```sql
-- 4.1 Duplicados potenciales para uq_attempts_idempotency
SELECT org_id, idempotency_key, count(*)
FROM public.inout_state_transition_attempts
WHERE idempotency_key IS NOT NULL
GROUP BY org_id, idempotency_key
HAVING count(*) > 1;

-- 4.2 Duplicados potenciales para uq_incidents_attempt_rule_type
SELECT attempt_id, rule_id, incident_type, count(*)
FROM public.inout_flow_incidents
WHERE attempt_id IS NOT NULL AND rule_id IS NOT NULL
GROUP BY attempt_id, rule_id, incident_type
HAVING count(*) > 1;

-- 4.3 Duplicados potenciales para uq_incidents_attempt_admin_type
SELECT attempt_id, incident_type, count(*)
FROM public.inout_flow_incidents
WHERE attempt_id IS NOT NULL AND rule_id IS NULL
GROUP BY attempt_id, incident_type
HAVING count(*) > 1;
```

**Esperado:** 0 filas en las 3 consultas.

---

## 5. VERIFICACIÓN DE WRITERS ACTUALES

Confirmar que no hay escrituras activas en las tablas que se van a alterar:

```sql
SELECT pid, state, query, wait_event_type, wait_event
FROM pg_stat_activity
WHERE query LIKE '%inout_state_transition_attempts%'
   OR query LIKE '%inout_flow_incidents%';
```

---

## 6. EJECUCIÓN — STAGE 1

### Archivo
```
supabase/migrations/20260729130000_phase_6_2_stage_1_isolated_infrastructure.sql
```

### Qué hace
- Crea tabla `inout_transition_attempt_rules` (16 columnas)
- Crea 3 FK constraints (ON DELETE RESTRICT)
- Crea 4 índices (3 B-tree + 1 UNIQUE)
- Activa RLS + política SELECT
- Crea permiso `casetilla.flow_report.transitions.execute`
- Asigna permiso a ADMIN y Full Access
- Crea 2 helpers (`_inout_build_transition_fingerprint`, `_inout_get_attempt_replay`)
- Aplica REVOKE de helpers a PUBLIC, anon, authenticated

### Ejecución
1. Abrir SQL Editor en Supabase Dashboard.
2. Pegar el contenido completo del archivo.
3. Ejecutar (Run).
4. Verificar output: debe mostrar `Stage 1 COMPLETE: All validations passed.`

### Validación post-Stage 1

```sql
-- Tabla existe
SELECT count(*) FROM information_schema.tables
WHERE table_name = 'inout_transition_attempt_rules';

-- Permiso existe
SELECT name FROM permissions
WHERE name = 'casetilla.flow_report.transitions.execute';

-- Helpers existen
SELECT proname FROM pg_proc
WHERE proname IN ('_inout_build_transition_fingerprint', '_inout_get_attempt_replay');
```

### Punto de decisión
- ✅ **CONTINUAR** — Si el postflight muestra Stage 1 COMPLETE.
- ⚠️ **DETENER** — Si hay warnings pero la tabla/permisos existen.
- ❌ **REVERTIR** — Si falló. Ejecutar `20260729130000_..._rollback.sql`.

---

## 7. PAUSA DE OBSERVACIÓN (POST-STAGE 1)

**Duración recomendada:** 5-10 minutos.

**Verificar:**
- El sistema sigue funcionando (calendario, casetilla, APIs).
- No hay errores en Supabase logs.
- La tabla nueva está vacía: `SELECT count(*) FROM inout_transition_attempt_rules;` → 0.

---

## 8. EJECUCIÓN — STAGE 2

### Archivo
```
supabase/migrations/20260729130100_phase_6_2_stage_2_nullable_columns.sql
```

### Qué hace
- Agrega `idempotency_key UUID` (NULLABLE) a `inout_state_transition_attempts`
- Agrega `attempt_id UUID` (NULLABLE) a `inout_flow_incidents`
- Crea FK `fk_incidents_attempt` con ON DELETE RESTRICT
- Sin backfill, sin NOT NULL

### Ejecución
1. Pegar contenido en SQL Editor.
2. Ejecutar.
3. Verificar: `Stage 2 COMPLETE: All validations passed.`

### Validación post-Stage 2

```sql
-- Columnas existen y son nullable
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name IN ('inout_state_transition_attempts', 'inout_flow_incidents')
  AND column_name IN ('idempotency_key', 'attempt_id');
-- Esperado: 2 filas, is_nullable = YES

-- FK existe
SELECT conname, confdeltype FROM pg_constraint
WHERE conname = 'fk_incidents_attempt';
-- Esperado: confdeltype = 'r' (RESTRICT)
```

### Punto de decisión
- ✅ **CONTINUAR** — Postflight OK.
- ⚠️ **DETENER** — Si columnas existen pero FK no.
- ❌ **REVERTIR** — Ejecutar `20260729130100_..._rollback.sql`.

---

## 9. PAUSA DE OBSERVACIÓN (POST-STAGE 2)

**Duración recomendada:** 5-10 minutos.

**Verificar:**
- Las columnas nuevas no afectan queries existentes (SELECT * devuelve una columna más).
- Las FK no bloquean operaciones (no hay filas con attempt_id no-NULL).

---

## 10. EJECUCIÓN — STAGE 3

### Archivo
```
supabase/migrations/20260729130200_phase_6_2_stage_3_safe_indexes.sql
```

### Qué hace
- Crea `uq_attempts_idempotency` (parcial: WHERE idempotency_key IS NOT NULL)
- Crea `uq_incidents_attempt_rule_type` (parcial: WHERE attempt_id IS NOT NULL AND rule_id IS NOT NULL)
- Crea `uq_incidents_attempt_admin_type` (parcial: WHERE attempt_id IS NOT NULL AND rule_id IS NULL)
- **No toca** `uq_incidents_idempotency` (legacy)

### Precondición
Ejecutar las consultas de duplicados (Sección 4). Deben retornar 0 filas.

### Ejecución
1. Pegar contenido en SQL Editor.
2. Ejecutar.
3. Verificar: `Stage 3 COMPLETE: All 3 new indexes created. Legacy index preserved.`

### Validación post-Stage 3

```sql
-- Nuevos índices existen
SELECT indexname FROM pg_indexes
WHERE indexname IN (
    'uq_attempts_idempotency',
    'uq_incidents_attempt_rule_type',
    'uq_incidents_attempt_admin_type'
);
-- Esperado: 3 filas

-- Legacy index sigue existiendo
SELECT indexname FROM pg_indexes
WHERE indexname = 'uq_incidents_idempotency';
-- Esperado: 1 fila
```

### Punto de decisión
- ✅ **CONTINUAR** — Postflight OK, legacy index intacto.
- ⚠️ **DETENER** — Si algún índice falló pero legacy sigue.
- ❌ **REVERTIR** — Ejecutar `20260729130200_..._rollback.sql`.

---

## 11. PRUEBAS POST-DESPLIEGUE

Ejecutar el archivo de pruebas completo:

```
supabase/tests/phase_6_2_stages_1_2_3_tests.sql
```

**Esperado:** 30 pruebas, todas PASS. Si alguna falla, revisar el mensaje de error.

---

## 12. MONITOREO POST-DESPLIEGUE

### Inmediato (primeras 24 horas)
- Verificar que no hay errores en Supabase logs.
- Verificar que calendario, casetilla, y APIs siguen operativas.
- Confirmar que ningún módulo existente lanza errores.

### Continuo (1 semana)
- Monitorear `inout_transition_attempt_rules` — debe permanecer vacía.
- Monitorear `pg_stat_activity` por locks en nuevas tablas.
- Verificar que los índices parciales no causan problemas de rendimiento.

---

## 13. ROLLBACK POR ETAPA

### Rollback Stage 3 solamente
```sql
-- Ejecutar: supabase/migrations/rollback/20260729130200_phase_6_2_stage_3_safe_indexes_rollback.sql
-- Solo elimina los 3 índices nuevos. Legacy intacto.
```

### Rollback Stage 2 + Stage 3
```sql
-- 1. Ejecutar rollback Stage 3
-- 2. Ejecutar rollback Stage 2
--    (aborta si columnas tienen datos)
```

### Rollback completo (Stages 1 + 2 + 3)
```sql
-- Orden: Stage 3 → Stage 2 → Stage 1
-- 1. Rollback Stage 3 (DROP INDEXes)
-- 2. Rollback Stage 2 (DROP COLUMNs, si vacías)
-- 3. Rollback Stage 1 (DROP TABLE, DROP FUNCTIONs, DELETE permission)
--    (aborta si la tabla tiene datos)
```

---

## 14. CHECKLIST FINAL

- [ ] Preflight queries ejecutadas (Sección 1)
- [ ] Consultas de volumen revisadas (Sección 3)
- [ ] Consultas de duplicados ejecutadas (Sección 4)
- [ ] Stage 1 ejecutado exitosamente
- [ ] Pausa post-Stage 1 completada
- [ ] Stage 2 ejecutado exitosamente
- [ ] Pausa post-Stage 2 completada
- [ ] Stage 3 ejecutado exitosamente
- [ ] 30 pruebas ejecutadas (todas PASS)
- [ ] Sistema operativo verificado (calendario, casetilla, APIs)
- [ ] Rollbacks probados en entorno QA (opcional pero recomendado)

---

*Guía generada el 2026-07-29. Stages 1-3: despliegue incremental de infraestructura aislada.*