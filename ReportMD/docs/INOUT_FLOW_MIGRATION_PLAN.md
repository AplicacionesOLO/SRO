# INOUT_FLOW_MIGRATION_PLAN.md — Plan de Migración SQL (Fase 6.1)

> **Versión**: 2.0 | **Fecha**: 2026-07-24  
> **Estado**: PENDIENTE APROBACIÓN — No ejecutar SQL  
> **Precondición**: Arquitectura aprobada (`RULE_ENGINE_ARCHITECTURE.md`, `STATE_MACHINE_SPEC.md`, `FLOW_RULE_CATALOG.md`, `DATA_MODEL_ALIGNMENT.md`)  
> **Anexo SQL**: `INOUT_FLOW_MIGRATION_SQL_SPECS.md` — Contenido completo de cada archivo SQL  
> **Prerrequisito de datos**: Auditoría de dependencias de `DISCHARGED` (espacio inicial) antes de normalizar el catálogo  
> **Objetivo**: Crear las 7 tablas del módulo IN/OUT Flow con índices, constraints, RLS, permisos, aprovisionamiento y seeds, SIN crear ninguna RPC pública capaz de modificar `reservations.status_id`.

---

## 1. Verificación Pre-Migración

### 1.1 Estado actual confirmado

| Verificación | Resultado |
|---|---|
| Tablas `inout_*` existentes | **Ninguna** — espacio limpio |
| Índices `inout_*` existentes | **Ninguno** |
| Permisos `casetilla.flow_report.*` | **Ninguno** |
| Constraints que referencien `inout_*` | **Ninguno** |

### 1.2 Esquema real verificado

| Referencia | Realidad |
|---|---|
| `permissions.name` = código de permiso | ✅ Formato: `categoria.accion` |
| `permissions.category` | `text`, nullable |
| `user_org_roles.user_id` → `auth.users.id` | ✅ Confirmado |
| `profiles.id` → `auth.users.id` | ✅ Confirmado |
| `reservations.warehouse_id` | `UUID`, nullable ✅ |
| `reservations.client_id` | `UUID`, nullable ✅ |
| `reservations.status_id` | `UUID`, nullable ✅ |
| `reservation_statuses.code` | `text` (PENDING, DISPATCHED, DONE...) |
| `activity_log.id` | `UUID PK` ✅ |
| `organizations.id` | `UUID PK` ✅ |

### 1.3 Sin riesgo de colisión

Todas las tablas nuevas usan el prefijo `inout_`. Ninguna tabla existente usa ese prefijo. Riesgo operativo bajo.

---

## 2. Inventario de Archivos de Migración

| # | Archivo | Tipo | Fase | Depende de | Riesgo | Reversible |
|---|---|---|---|---|---|---|
| 001 | `001_create_inout_tables.sql` | DDL | 6.1 | — | Bajo | ✅ `DROP TABLE` |
| 002 | `002_create_inout_indexes.sql` | DDL | 6.1 | 001 | Bajo | ✅ `DROP INDEX` |
| 003 | `003_create_inout_rls.sql` | DDL | 6.1 | 001 | Bajo | ✅ `DROP POLICY` |
| 004 | `004_create_inout_permissions.sql` | DML | 6.1 | 001 | Bajo | ✅ `DELETE FROM permissions` |
| 005 | `005_create_inout_provisioning.sql` | DDL | 6.1 | 001, 004 | Bajo | ✅ `DROP FUNCTION` |
| 006 | `006_seed_inout_rules.sql` | DML | 6.1 | 001, 004 | Medio | ✅ `DELETE FROM inout_flow_rules` |
| 007 | `007_create_rule_helpers.sql` | DDL | 6.1 | 001 | Bajo | ✅ `DROP FUNCTION` |
| 008 | `008_create_transition_rpc.sql` | DDL | **6.2** | 001, 006, 007 | Alto | ✅ `DROP FUNCTION` |
| 009 | `009_enable_status_guard.sql` | DDL | **6.5** | 008 | Alto | ✅ `DROP TRIGGER` |
| 010 | `010_rollback_inout_module.sql` | DDL/DML | — | — | — | N/A |

> ⚠️ **Archivos 008 y 009 NO se ejecutan en Fase 6.1.** Pertenecen a fases posteriores.
> El contenido SQL detallado de cada archivo está en `INOUT_FLOW_MIGRATION_SQL_SPECS.md`.

---

## 3. Orden de Ejecución y Dependencias

```
┌─────────────────────────────────────────────────────────────────────┐
│                      ORDEN DE EJECUCIÓN — FASE 6.1                   │
│                     BASE ESTRUCTURAL PASIVA                          │
│                                                                      │
│  001_create_inout_tables.sql          ← 7 tablas + constraints      │
│  │                                                                   │
│  ├──▶ 002_create_inout_indexes.sql    ← 28 índices                  │
│  ├──▶ 003_create_inout_rls.sql        ← 17 políticas RLS            │
│  ├──▶ 004_create_inout_permissions.sql ← 9 permisos + asignación    │
│  │     │                                                             │
│  │     ├──▶ 005_create_inout_provisioning.sql ← función idempotente │
│  │     └──▶ 006_seed_inout_rules.sql  ← 16 reglas × N orgs         │
│  │                                                                   │
│  └──▶ 007_create_rule_helpers.sql     ← 4 funciones auxiliares      │
│                                                                      │
│  ⛔ NO SE CREA NINGUNA RPC PÚBLICA CAPAZ DE MODIFICAR STATUS_ID      │
│                                                                      │
│  ⚠️ ROLLBACK: 010_rollback_inout_module.sql                         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Qué se ejecuta AHORA (Fase 6.1 — BASE ESTRUCTURAL PASIVA)

```
1. 001_create_inout_tables.sql
2. 002_create_inout_indexes.sql
3. 003_create_inout_rls.sql
4. 004_create_inout_permissions.sql
5. 005_create_inout_provisioning.sql   ← función idempotente de aprovisionamiento
6. 006_seed_inout_rules.sql
7. 007_create_rule_helpers.sql
```

### Qué NO se ejecuta todavía

```
8. 008_create_transition_rpc.sql  ← Fase 6.2 — RPC COMPLETA con Rule Engine
9. 009_enable_status_guard.sql    ← Fase 6.5 — solo tras migrar todos los callers
```

---

## 4. Resumen de lo que Crea Cada Archivo

### 001 — 7 tablas

| Tabla | Columnas | PK | FKs | CHECKs | UNIQUE |
|---|---|---|---|---|---|
| `inout_flow_rules` | 29 | id UUID | org, wh, client, profiles×2 | 10 | (org_id, code) |
| `inout_flow_incidents` | 29 | id UUID | org, reservation, wh, client, rule, profiles×2, activity_log | 4 | (org_id, idempotency_key) |
| `inout_state_transition_attempts` | 23 | id UUID | org, reservation, status×3, self, rule, profiles×3 | 3 | — |
| `inout_incident_comments` | 7 | id UUID | org, incident (CASCADE), profiles | 1 | — |
| `inout_report_schedules` | 20 | id UUID | org, profiles×2 | 1 | — |
| `inout_report_runs` | 17 | id UUID | org, schedule, profiles | 1 | — |
| `inout_flow_audit_log` | 10 | id UUID | org, profiles | — | — |

> **Nota**: `inout_flow_incidents.warehouse_id` almacena el warehouse **resuelto al momento del evento** (snapshot histórico), obtenido vía `reservations.dock_id → docks.warehouse_id`. Ver `DATA_MODEL_ALIGNMENT.md`.

### 002 — 28 índices

(Sin cambios — ver SQL_SPECS)

### 003 — 17 políticas RLS

(Sin cambios — ver SQL_SPECS)

### 004 — 9 permisos

(Sin cambios respecto a versión anterior)

### 005 — Función de aprovisionamiento

`provision_inout_flow_for_org(p_org_id UUID)`:
- Idempotente (puede ejecutarse N veces)
- Crea reglas faltantes, no sobrescribe existentes
- Retorna JSON estructurado: `{success, org_id, rules_created, rules_existing, permissions_checked}`

### 006 — 16 reglas del sistema por organización

(Sin cambios respecto a versión anterior — ver `FLOW_RULE_CATALOG.md`)

### 007 — 4 funciones auxiliares

| Función | Propósito | Tipo |
|---|---|---|
| `inout_get_user_org_role` | Obtener rol del usuario en la org | STABLE |
| `inout_has_permission` | Verificar si usuario tiene permiso | STABLE |
| `inout_generate_idempotency_key` | Generar clave de idempotencia | IMMUTABLE |
| `inout_get_max_severity` | Calcular severidad máxima | IMMUTABLE |

### 008 — RPC completa (Fase 6.2, NO en 6.1)

`transition_reservation_status()` — **NO se crea en Fase 6.1.** La primera versión será la RPC completa con los 5 componentes del pipeline (Rule Loader, Rule Evaluator, Conflict Resolver, Incident Generator, Notification Dispatcher), con `LEFT JOIN docks` para resolver `resolved_warehouse_id`, y `BTRIM(code)` para manejar `DISCHARGED`.

---

## 5. Riesgos por Componente

| Componente | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| `inout_flow_rules` | FK a org inexistente en seeds | Nula | Alto | Solo se insertan para orgs existentes |
| `inout_flow_incidents` | FK a reservation eliminada | Baja | Medio | Reservas no se eliminan, se cancelan |
| `inout_state_transition_attempts` | FK circular | Baja | Bajo | Padre se crea antes que hijo |
| `inout_incident_comments` | CASCADE borra comentarios | Baja | Medio | Incidencias no se borran |
| `inout_report_schedules` | FK a profiles requiere perfil | Media | Bajo | Validar antes de insertar |
| `provision_inout_flow_for_org` | Doble ejecución concurrente | Baja | Bajo | `ON CONFLICT DO NOTHING` |
| RPC completa (Fase 6.2) | `warehouse_id` resuelto incorrectamente | Media | Alto | Validado en Fase 6.3 con 12 casos de prueba |
| Trigger (Fase 6.5) | Bloquea operaciones legítimas | **Alta** | **Crítico** | ⛔ No activar hasta migrar TODOS los callers |
| `DISCHARGED` con espacio | Comparaciones de código fallan | **Alta** | **Alto** | `BTRIM(code)` en todas las lecturas del motor. Auditoría de dependencias antes de normalizar. |

---

## 6. Impacto sobre Datos Actuales

| Componente | ¿Afecta datos existentes? |
|---|---|
| 7 tablas nuevas | No — vacías |
| 28 índices | No — solo aceleran queries futuras |
| 17 políticas RLS | No — solo nuevas tablas |
| 9 permisos + asignaciones | Sí (leve) — inserts en permissions y role_permissions |
| Función de aprovisionamiento | No — nueva función |
| 16 reglas × N orgs | No — inserts en tabla nueva |
| 4 funciones auxiliares | No — nuevas |
| RPC completa (Fase 6.2) | No en 6.1 — se crea en fase posterior |
| Trigger (Fase 6.5) | No en 6.1 — se crea en fase posterior |

**Conclusión: Riesgo operativo bajo en Fase 6.1, sin modificaciones directas sobre reservations, casetilla_ingresos ni casetilla_salidas. La migración modifica el catálogo de permisos, asignaciones de roles y agrega objetos de base de datos.**

---

## 7. Validación Post-Migración

### 7.1 Checklists

```sql
-- ESTRUCTURA
-- [ ] 7 tablas: SELECT count(*)=7 FROM pg_tables WHERE tablename LIKE 'inout_%';
-- [ ] 28 índices: SELECT count(*)=28 FROM pg_indexes WHERE tablename LIKE 'inout_%';
-- [ ] RLS activo: SELECT count(*)=7 FROM pg_tables WHERE tablename LIKE 'inout_%' AND rowsecurity=true;
-- [ ] 17 políticas: SELECT count(*)=17 FROM pg_policies WHERE tablename LIKE 'inout_%';

-- PERMISOS
-- [ ] 9 permisos: SELECT count(*)=9 FROM permissions WHERE name LIKE 'casetilla.flow_report.%';
-- [ ] Asignados a admin: verificar que roles admin tengan los 9 permisos

-- REGLAS
-- [ ] 16 × N orgs: SELECT org_id,count(*) FROM inout_flow_rules WHERE is_system_rule=true GROUP BY org_id;
-- [ ] Sin reglas inválidas: SELECT count(*)=0 FROM inout_flow_rules WHERE is_system_rule=true AND edit_policy='fully_editable';
-- [ ] Sin rangos inválidos: SELECT count(*)=0 FROM inout_flow_rules WHERE effective_from IS NOT NULL AND effective_to IS NOT NULL AND effective_from >= effective_to;

-- FUNCIONES
-- [ ] 4 helpers: SELECT count(*)=4 FROM pg_proc WHERE proname LIKE 'inout_%';
-- [ ] Función de aprovisionamiento: SELECT count(*)=1 FROM pg_proc WHERE proname='provision_inout_flow_for_org';
-- [ ] ⛔ SIN RPC pública: SELECT count(*)=0 FROM pg_proc WHERE proname='transition_reservation_status';
```

### 7.2 Prueba de humo

```sql
-- Probar helper de idempotencia
SELECT public.inout_generate_idempotency_key(
  '00000000-0000-0000-0000-000000000001'::uuid, 'TEST', 'ref-1'
);
-- Debe retornar un hash MD5 (32 caracteres hex)

-- Probar helper de severidad máxima
SELECT public.inout_get_max_severity(ARRAY['media','baja','critica']);
-- Esperado: 'critica'
```

---

## 8. Rollback (010)

Si algo falla, `010_rollback_inout_module.sql` revierte todo en orden:

```
trigger → RPC → helpers → políticas → RLS → datos → permisos → tablas
```

Tiempo estimado de rollback: < 1 minuto.

---

## 9. Matriz Go/No-Go

| Condición | Estado |
|---|---|
| Arquitectura aprobada (4 docs: RULE_ENGINE, STATE_MACHINE, FLOW_RULE_CATALOG, DATA_MODEL_ALIGNMENT) | ✅ |
| Esquema real verificado | ✅ |
| Sin colisiones de nombres | ✅ |
| Plan de rollback documentado | ✅ |
| Auditoría de dependencias de `DISCHARGED` completada | ⬜ Pendiente |
| Equipo notificado | ⬜ Pendiente |
| Backup de seguridad | ⬜ Pendiente |
| Ventana de bajo tráfico | ⬜ Pendiente |

---

## 10. Próximas Fases

| Fase | Entregable | Depende de |
|---|---|---|
| 6.1 | **7 tablas + índices + RLS + permisos + provisioning + seeds + helpers** (BASE ESTRUCTURAL PASIVA — sin RPC) | ← ESTAMOS AQUÍ |
| 6.2 | RPC completa `transition_reservation_status()` con 5 componentes, JOIN a docks, BTRIM | 6.1 |
| 6.3 | Pruebas aisladas del motor (12 casos) | 6.2 |
| 6.4 | Migración de 7 callers a la RPC | 6.2 |
| 6.5 | Activación del trigger `block_unauthorized_status_update` | 6.4 |

---

**Documento creado para revisión. No se ha ejecutado SQL. No se han creado tablas. No se ha modificado código.**
**Versión 2.0: RPC stub eliminada de Fase 6.1. Modelo canónico `dock_id → docks.warehouse_id` incorporado. `DISCHARGED` documentado como prerrequisito.**