# PHASE_6_2_STAGES_1_2_3_IMPACT_REPORT.md

## Informe de Impacto — Stages 1, 2, 3

---

**Versión:** 1.0
**Fecha:** 2026-07-29
**Referencia:** PHASE_6_2_TRANSITION_ENGINE_DESIGN.md v2.3.1
**Alcance:** Stages 1 (infraestructura aislada), 2 (columnas nullable), 3 (índices seguros)

---

## 1. OBJETOS NUEVOS CREADOS

| Objeto | Tipo | Stage | Descripción |
|---|---|---|---|
| `inout_transition_attempt_rules` | TABLE | 1 | Registro normalizado de reglas evaluadas. 16 columnas. |
| `fk_attempt_rules_org` | CONSTRAINT (FK) | 1 | org_id → organizations(id) ON DELETE RESTRICT |
| `fk_attempt_rules_attempt` | CONSTRAINT (FK) | 1 | attempt_id → attempts(id) ON DELETE RESTRICT |
| `fk_attempt_rules_rule` | CONSTRAINT (FK) | 1 | rule_id → rules(id) ON DELETE RESTRICT |
| `idx_attempt_rules_org` | INDEX | 1 | B-tree sobre org_id |
| `idx_attempt_rules_attempt` | INDEX | 1 | B-tree sobre attempt_id |
| `idx_attempt_rules_rule` | INDEX | 1 | B-tree sobre rule_id |
| `uq_attempt_rules_unique` | UNIQUE INDEX | 1 | UNIQUE (attempt_id, rule_id) |
| `Attempt rules - SELECT with audit.view` | RLS POLICY | 1 | SELECT solo con permiso audit.view |
| `casetilla.flow_report.transitions.execute` | PERMISSION | 1 | Permiso para ejecutar transiciones |
| `_inout_build_transition_fingerprint` | FUNCTION | 1 | Helper IMMUTABLE SECURITY DEFINER |
| `_inout_get_attempt_replay` | FUNCTION | 1 | Helper STABLE SECURITY DEFINER |
| `inout_state_transition_attempts.idempotency_key` | COLUMN | 2 | UUID NULLABLE |
| `inout_flow_incidents.attempt_id` | COLUMN | 2 | UUID NULLABLE |
| `fk_incidents_attempt` | CONSTRAINT (FK) | 2 | attempt_id → attempts(id) ON DELETE RESTRICT |
| `uq_attempts_idempotency` | UNIQUE INDEX | 3 | Parcial: WHERE idempotency_key IS NOT NULL |
| `uq_incidents_attempt_rule_type` | UNIQUE INDEX | 3 | Parcial: WHERE attempt_id IS NOT NULL AND rule_id IS NOT NULL |
| `uq_incidents_attempt_admin_type` | UNIQUE INDEX | 3 | Parcial: WHERE attempt_id IS NOT NULL AND rule_id IS NULL |

---

## 2. OBJETOS EXISTENTES MODIFICADOS

| Objeto | Cambio | Stage | Riesgo |
|---|---|---|---|
| `inout_state_transition_attempts` | +1 columna NULLABLE (`idempotency_key`) | 2 | **Cero**. ADD COLUMN IF NOT EXISTS, sin default, sin backfill, sin NOT NULL. |
| `inout_flow_incidents` | +1 columna NULLABLE (`attempt_id`) + 1 FK RESTRICT | 2 | **Cero**. ADD COLUMN IF NOT EXISTS. FK solo aplica a nuevas filas con attempt_id no NULL. |

---

## 3. TABLAS OPERATIVAS NO TOCADAS

Estas tablas NO reciben ningún cambio en Stages 1, 2, 3:

| Tabla | Verificación |
|---|---|
| `reservations` | Sin ALTERs, sin triggers, sin columnas nuevas |
| `reservation_statuses` | Sin cambios |
| `casetilla_ingresos` | Sin cambios |
| `casetilla_salidas` | Sin cambios |
| `docks` | Sin cambios |
| `warehouses` | Sin cambios |
| `clients` | Sin cambios |
| `providers` | Sin cambios |
| `activity_log` | Sin cambios |
| `reservation_activity_log` | Sin cambios |
| `inout_flow_audit_log` | Sin cambios |
| `inout_flow_rules` | Sin cambios (solo referenciada como FK target) |
| `organizations` | Sin cambios (solo referenciada como FK target) |
| `permissions` | +1 INSERT idempotente |
| `role_permissions` | +N INSERTs idempotentes para ADMIN y Full Access |
| `roles` | Sin cambios |

---

## 4. MÓDULOS SIN CAMBIO DE COMPORTAMIENTO

| Módulo | Impacto | Justificación |
|---|---|---|
| **Reservas** | Ninguno | Sin ALTERs en la tabla. Sin triggers nuevos. |
| **Calendario** | Ninguno | Sin cambios en queries, índices o columnas que usa. |
| **Casetilla (IN/OUT)** | Ninguno | Sin cambios en casetilla_ingresos, casetilla_salidas, ni sus APIs. |
| **Reportes** | Ninguno | Las nuevas tablas/columnas no son consultadas por reportes existentes. |
| **APIs existentes** | Ninguno | Las edge functions existentes no referencian los nuevos objetos. |
| **Edge Functions** | Ninguno | Sin cambios en código de funciones existentes. |
| **Integraciones** | Ninguno | Sin nuevas dependencias externas. |

---

## 5. RIESGOS

### 5.1 Riesgos de despliegue

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Fallo en Stage 1 (CREATE TABLE) | Baja | Medio | Rollback independiente. Tabla vacía, eliminación segura. |
| Fallo en Stage 2 (ADD COLUMN) | Muy baja | Bajo | ADD COLUMN IF NOT EXISTS es atómico. Sin datos que migrar. |
| Fallo en Stage 3 (CREATE INDEX) | Muy baja | Bajo | Tablas con 0 filas. Sin bloqueo. Índices parciales, no afectan NULLs. |
| Fallo parcial (Stage 1 OK, Stage 2 FAIL) | Baja | Medio | Ejecutar rollback Stage 1. La infraestructura aislada no afecta producción. |

### 5.2 Riesgos de bloqueo

| Riesgo | Evaluación |
|---|---|
| Bloqueo en CREATE INDEX | **Cero.** Tablas con 0 filas. Sin CONCURRENTLY necesario. |
| Bloqueo en ADD COLUMN | **Cero.** Agregar columna NULLABLE sin default es instantáneo. |
| Bloqueo en ADD FK | **Cero.** FK con NOT VALID no se usa aquí, pero tabla vacía = validación instantánea. |
| Deadlock con operaciones existentes | **Cero.** Sin modificaciones a tablas con tráfico activo. |

### 5.3 Riesgos de compatibilidad

| Riesgo | Evaluación |
|---|---|
| Columnas nuevas rompen SELECT * | **No.** Las columnas nuevas son NULLABLE. SELECT * devuelve una columna más, lo cual no rompe código que itera por nombre de columna. |
| Índices nuevos afectan plan de queries | **No.** Índices parciales solo se activan cuando las columnas referenciadas tienen valores no-NULL. |
| FK RESTRICT bloquea DELETEs | **Solo si** alguien inserta filas con attempt_id y luego intenta borrar el attempt. No hay código que haga esto en Stages 1-3. |

---

## 6. QUÉ OCURRE SI UNA MIGRACIÓN FALLA A MITAD

| Escenario | Consecuencia | Acción |
|---|---|---|
| Stage 1 falla en STEP N | ROLLBACK automático (está en BEGIN...COMMIT). Nada persiste. | Corregir error, re-ejecutar Stage 1. |
| Stage 2 falla en STEP N | ROLLBACK automático. Stage 1 sigue commiteado (es seguro). | Corregir error, re-ejecutar Stage 2. Stage 1 no interfiere. |
| Stage 3 falla en STEP N | ROLLBACK automático. Stages 1 y 2 commiteados. | Corregir error, re-ejecutar Stage 3. |
| Stage 3 falla por duplicados | Se aborta con mensaje claro y query de diagnóstico. | Resolver duplicados manualmente, re-ejecutar Stage 3. |

---

## 7. CÓMO REVERTIR CADA ETAPA

| Stage | Rollback | Complejidad | Riesgo |
|---|---|---|---|
| 1 | `20260729130000_..._rollback.sql` | Bajo | Aborta si la tabla tiene datos. Si vacía: DROP limpio. |
| 2 | `20260729130100_..._rollback.sql` | Bajo | Aborta si las columnas tienen valores no-NULL. Si todo NULL: DROP limpio. |
| 3 | `20260729130200_..._rollback.sql` | Bajo | Solo DROP INDEX. Índice legacy verificado antes de proceder. |

---

## 8. MÉTRICAS POST-DESPLIEGUE

| Métrica | Cómo verificar |
|---|---|
| Tabla nueva existe | `SELECT count(*) FROM information_schema.tables WHERE table_name = 'inout_transition_attempt_rules'` |
| Columnas nuevas existen | `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name IN ('inout_state_transition_attempts', 'inout_flow_incidents') AND column_name IN ('idempotency_key', 'attempt_id')` |
| Índices nuevos existen | `SELECT indexname FROM pg_indexes WHERE indexname LIKE 'uq_attempts_idempotency' OR indexname LIKE 'uq_incidents_attempt_%'` |
| Permiso creado | `SELECT name FROM permissions WHERE name = 'casetilla.flow_report.transitions.execute'` |
| Funcionamiento normal | Verificar que calendario, casetilla, y APIs siguen operativas |
| Sin errores en logs | Revisar Supabase logs por errores relacionados con nuevas FK/índices |

---

## 9. CÓMO VERIFICAR QUE NINGÚN CALLER ACTUAL USA LOS OBJETOS NUEVOS

| Verificación | Método |
|---|---|
| Edge Functions | `grep -r "inout_transition_attempt_rules" supabase/functions/` → 0 resultados esperados |
| Edge Functions | `grep -r "transitions.execute" supabase/functions/` → 0 resultados esperados |
| Frontend | `grep -r "inout_transition_attempt_rules" src/` → 0 resultados esperados |
| Frontend | `grep -r "idempotency_key" src/` → 0 resultados esperados |
| SQL queries activas | `SELECT query FROM pg_stat_activity WHERE query LIKE '%inout_transition_attempt_rules%'` → 0 resultados esperados |

---

## 10. MATRIZ RESUMEN

| Objeto | Cambio | Riesgo | Afecta producción funcionalmente | Reversible |
|---|---|---|---|---|
| `inout_transition_attempt_rules` | Nueva tabla | Bajo | No | Sí (si vacía) |
| `fk_attempt_rules_*` | Nuevas FK (RESTRICT) | Bajo | No | Sí |
| Índices tabla nueva | Nuevos índices | Bajo | No | Sí |
| RLS tabla nueva | Nueva política | Bajo | No | Sí |
| `transitions.execute` | Nuevo permiso | Bajo | No (nadie lo valida aún) | Sí |
| `_inout_build_transition_fingerprint` | Nuevo helper | Bajo | No | Sí |
| `_inout_get_attempt_replay` | Nuevo helper | Bajo | No | Sí |
| `attempts.idempotency_key` | Nueva columna NULLABLE | Bajo | No | Sí (si vacía) |
| `incidents.attempt_id` | Nueva columna NULLABLE | Bajo | No | Sí (si vacía) |
| `fk_incidents_attempt` | Nueva FK (RESTRICT) | Bajo | No | Sí |
| `uq_attempts_idempotency` | Nuevo índice parcial | Bajo | No | Sí |
| `uq_incidents_attempt_rule_type` | Nuevo índice parcial | Bajo | No | Sí |
| `uq_incidents_attempt_admin_type` | Nuevo índice parcial | Bajo | No | Sí |
| `uq_incidents_idempotency` (legacy) | **Sin cambios** | Nulo | No | N/A |

---

*Informe generado el 2026-07-29. Stages 1-3: infraestructura aditiva de riesgo mínimo.*