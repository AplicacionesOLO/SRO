# TRIGGER ANALYSIS REPORT — Auditoría Enterprise Completa

> **Fecha:** 2026-07-02  
> **Versión del proyecto:** v1201  
> **Alcance:** Análisis exhaustivo de TODOS los triggers, cron jobs, y gaps de auditoría en la base de datos  
> **Metodología:** Cada trigger fue extraído directamente de `pg_trigger` + `pg_proc` con su código fuente completo. Cada gap fue confirmado contra el esquema real de tablas.

---

## 1. INVENTARIO COMPLETO DE TRIGGERS (28 triggers en 13 tablas)

| # | Tabla | Trigger | Timing | Eventos | Función | Propósito |
|---|-------|---------|--------|---------|---------|-----------|
| 1 | `storage.buckets` | `enforce_bucket_name_length_trigger` | BEFORE | INSERT, UPDATE | `enforce_bucket_name_length` | Validar nombre ≤100 chars |
| 2 | `storage.buckets` | `protect_buckets_delete` | BEFORE | DELETE | `protect_delete` | Bloquear DELETE directo |
| 3 | `cargo_types` | `trg_cargo_types_set_updated` | BEFORE | UPDATE | `set_updated_at_and_by` | Auto `updated_at` + `updated_by` |
| 4 | `cargo_types` | `trg_set_audit_fields_cargo_types` | BEFORE | INSERT, UPDATE | `set_audit_fields_cargo_types` | Auto `created_by` + `updated_by` (SECURITY DEFINER) |
| 5 | `client_docks` | `trg_set_client_dock_order_default` | BEFORE | INSERT | `set_client_dock_order_default` | Auto-incrementar `dock_order` por cliente |
| 6 | `client_rules` | `trg_client_rules_set_updated_at` | BEFORE | UPDATE | `set_updated_at` | Auto `updated_at` |
| 7 | `clients` | `trg_clients_set_updated_at` | BEFORE | UPDATE | `set_updated_at` | Auto `updated_at` |
| 8 | `dock_time_blocks` | `trg_blocks_no_overlap` | BEFORE | INSERT, UPDATE | `check_dock_time_conflicts` | Validar no solapamiento entre bloques y reservas |
| 9 | `docks` | `trg_validate_dock_warehouse_org` | BEFORE | INSERT, UPDATE | `validate_dock_warehouse_org` | Validar que warehouse pertenezca a la misma org |
| 10 | `cron.job` | `cron_job_cache_invalidate` | AFTER | INSERT, DELETE, UPDATE, TRUNCATE | `job_cache_invalidate` | Invalidar caché de pg_cron |
| 11 | `storage.objects` | `protect_objects_delete` | BEFORE | DELETE | `protect_delete` | Bloquear DELETE directo |
| 12 | `storage.objects` | `update_objects_updated_at` | BEFORE | UPDATE | `update_updated_at_column` | Auto `updated_at` |
| 13 | `organizations` | `trg_prevent_multiple_organizations` | BEFORE | INSERT | `prevent_multiple_organizations` | Limitar a 1 organización |
| 14 | `provider_cargo_time_profiles` | `trg_pc_set_updated` | BEFORE | UPDATE | `set_updated_at_and_by` | Auto `updated_at` + `updated_by` |
| 15 | `provider_cargo_time_profiles` | `trg_pc_validate_same_org` | BEFORE | INSERT, UPDATE | `pc_validate_same_org` | Validar que provider + cargo_type sean misma org |
| 16 | `provider_cargo_time_profiles` | `trg_set_audit_fields_time_profiles` | BEFORE | INSERT, UPDATE | `set_audit_fields_time_profiles` | Auto `created_by` + `updated_by` (SECURITY DEFINER) |
| 17 | `providers` | `trg_providers_set_updated` | BEFORE | UPDATE | `set_updated_at_and_by` | Auto `updated_at` + `updated_by` |
| 18 | `providers` | `trg_set_audit_fields_providers` | BEFORE | INSERT, UPDATE | `set_audit_fields_providers` | Auto `created_by` + `updated_by` (SECURITY DEFINER) |
| 19 | `reservation_statuses` | `trg_prevent_delete_reservation_statuses` | BEFORE | DELETE | `prevent_delete_reservation_statuses` | Bloquear DELETE (soft-delete con `is_active`) |
| 20 | `reservations` | `trg_reservations_block_sensitive_updates` | BEFORE | UPDATE | `reservations_block_sensitive_updates` | Bloquear cambios a `created_by`, `org_id`, `dock_id` (no-admin) |
| 21 | `reservations` | `trg_validate_reservation_business_hours` | BEFORE | INSERT, UPDATE | `validate_reservation_business_hours` | Validar horario, timezone, conflictos |
| 22 | `reservations` | `trigger_log_reservation_created` | AFTER | INSERT | `log_reservation_created` | Insertar en `activity_log` (SECURITY DEFINER) |
| 23 | `reservations` | `trigger_log_reservation_updated` | AFTER | UPDATE | `log_reservation_updated` | Insertar cambios en `activity_log` (SECURITY DEFINER) |
| 24 | `reservations` | `validate_reservation_conflicts` | BEFORE | INSERT, UPDATE | `check_reservation_conflicts` | Validar conflictos con reservas y bloques |
| 25 | `realtime.subscription` | `tr_check_filters` | BEFORE | INSERT, UPDATE | `subscription_check_filters` | Validar filtros de Realtime |
| 26 | `user_warehouses` | `trg_user_warehouses_country` | BEFORE | INSERT, UPDATE | `enforce_user_warehouse_country` | Validar que usuario tenga acceso al país del warehouse |
| 27 | `warehouses` | `trg_warehouses_set_updated_at` | BEFORE | UPDATE | `set_updated_at` | Auto `updated_at` |
| 28 | `warehouses` | `warehouses_updated_at` | BEFORE | UPDATE | `update_warehouses_updated_at` | Auto `updated_at` |

---

## 2. PROBLEMAS ENCONTRADOS

### 2.1 🔴 CRÍTICO: Trigger duplicado en `warehouses`

**Tabla:** `warehouses`  
**Triggers:** `trg_warehouses_set_updated_at` + `warehouses_updated_at`

Ambos triggers ejecutan exactamente la misma lógica: `NEW.updated_at = now()`. Se disparan en el mismo evento (BEFORE UPDATE) y en cada fila.

| Trigger | Función | Código |
|---------|---------|--------|
| `trg_warehouses_set_updated_at` | `set_updated_at` | `NEW.updated_at = now(); RETURN NEW;` |
| `warehouses_updated_at` | `update_warehouses_updated_at` | `NEW.updated_at = now(); RETURN NEW;` |

**Impacto:** Cada UPDATE en `warehouses` ejecuta `now()` dos veces innecesariamente. Aunque el resultado es el mismo, es código muerto que ensucia el esquema y podría causar confusión en debugging.

**Recomendación:** Eliminar `warehouses_updated_at` (el duplicado). `trg_warehouses_set_updated_at` ya usa la función compartida `set_updated_at()` que también usan `client_rules` y `clients`.

---

### 2.2 🟠 ALTO: Conflict checks duplicados en `reservations`

**Tabla:** `reservations`  
**Triggers:** `validate_reservation_conflicts` + `trg_validate_reservation_business_hours`

Ambos triggers validan conflictos de solapamiento contra reservas y bloques:

| Validación | `validate_reservation_conflicts` | `trg_validate_reservation_business_hours` |
|------------|----------------------------------|-------------------------------------------|
| Conflictos con reservas | ✅ Sí | ✅ Sí (idéntica lógica) |
| Conflictos con bloques | ✅ Sí | ✅ Sí (idéntica lógica) |
| Validación básica de fechas | ✅ Sí | ✅ Sí |
| Validación de horas de negocio | ❌ No | ✅ Sí |
| Validación de timezone | ❌ No | ✅ Sí |
| Validación de cruce de día | ❌ No | ✅ Sí |

**Impacto:** Cada INSERT o UPDATE en `reservations` ejecuta las mismas queries de conflicto DOS VECES. Son 4 subqueries adicionales innecesarias por operación.

**Recomendación:** Consolidar en UN solo trigger BEFORE que haga todas las validaciones:
1. Validaciones básicas (fechas no nulas, start < end)
2. Horario de negocio + timezone
3. Conflictos contra reservas
4. Conflictos contra bloques
5. Eliminar `validate_reservation_conflicts` (el más simple) y dejar `trg_validate_reservation_business_hours` como el único trigger de validación.

---

### 2.3 🟠 ALTO: `reservations` sin trigger `updated_at`

La tabla `reservations` tiene columna `updated_at` con default `now()`, pero **NO tiene un trigger BEFORE UPDATE que actualice automáticamente `updated_at`**.

**Dependencia:** Todo el código de aplicación (`calendarService.ts`, `casetillaService.ts`, Edge Functions como `api-v1-reservations-patch-status`) tiene que recordar manualmente setear `updated_at = new Date().toISOString()`.

**Dónde se hace correctamente (aplicación):**
- `calendarService.ts` líneas 1154, 1203, 1254, 1281, 1527, 1565, 1607 — setea `updated_at` manualmente

**Dónde podría fallar:**
- Edge Function `api-v1-reservations-patch-status` — si no setea `updated_at`, queda stale
- Edge Function `create-reservation` — INSERT, el default funciona
- Actualizaciones directas desde la app móvil (API v1)
- Cualquier futuro código que haga `.update()` sin recordar `updated_at`

**Recomendación:** Crear un trigger `trg_reservations_set_updated_at`:
```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reservations_set_updated_at
BEFORE UPDATE ON public.reservations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

### 2.4 🔴 CRÍTICO: `casetilla_ingresos` y `casetilla_salidas` SIN triggers

Estas son las tablas operacionales más críticas del módulo de Punto de Control. Cada registro representa una entrada o salida física de mercancía. **Cero triggers. Cero auditoría automática.**

| Aspecto | `casetilla_ingresos` | `casetilla_salidas` |
|---------|---------------------|---------------------|
| `created_at` default | `now()` ✅ | `now()` ✅ |
| Trigger `updated_at` | ❌ NO | ❌ NO |
| Trigger `created_by` | ❌ NO (columna existe pero sin trigger) | ❌ NO (columna existe pero sin trigger) |
| Trigger `activity_log` | ❌ NO | ❌ NO |
| Trigger validación | ❌ NO | ❌ NO |

**Lo que NO se registra automáticamente:**
- Quién creó el ingreso/salida (depende de la app setear `created_by`)
- Cuándo se modificó un registro (si alguien corrige datos)
- Un registro en `activity_log` de que ocurrió el evento
- Validación de que la reserva asociada existe y pertenece a la misma org

**Impacto en auditoría:** Si un ingreso se registra desde la app móvil y la app falla en setear `created_by`, nunca sabremos quién lo hizo. Si alguien modifica un registro directamente desde la DB, no hay rastro.

**Recomendación:** Crear triggers para ambas tablas:
1. `trg_casetilla_ingresos_audit` — auto `created_by` + `updated_at` + log en `activity_log`
2. `trg_casetilla_salidas_audit` — auto `created_by` + `updated_at` + log en `activity_log`
3. `trg_casetilla_ingresos_validate` — validar `reservation_id` existe y misma `org_id`
4. `trg_casetilla_salidas_validate` — validar `reservation_id` existe y misma `org_id`

---

### 2.5 🟡 MEDIO: `activity_log` en `trigger_log_reservation_updated` solo registra 4 campos

El trigger AFTER UPDATE en `reservations` (`trigger_log_reservation_updated`) solo registra cambios en:

| Campo monitoreado | Campo NO monitoreado |
|-------------------|---------------------|
| `status_id` ✅ | `client_id` ❌ |
| `start_datetime` ✅ | `cargo_type` ❌ |
| `end_datetime` ✅ | `provider_id` ❌ (vía `reservation_consolidated_providers`, no directo) |
| `dock_id` ✅ | `reference_code` ❌ |
| | `transport_type` ❌ |
| | `notes` ❌ |
| | `is_cancelled` ❌ |
| | `invoice` ❌ |
| | `dua` ❌ |
| | Cualquier otro campo ❌ |

**Impacto:** Si un usuario cambia el cliente de una reserva, el proveedor, o la factura, NO queda registro en `activity_log`. Esto es un gap de auditoría importante.

**Recomendación:** Extender `trigger_log_reservation_updated` para registrar TODOS los cambios de campos relevantes, o implementar un enfoque genérico que compare `OLD` vs `NEW` para todos los campos (excepto `updated_at`, `updated_by`).

---

### 2.6 🟡 MEDIO: `reservations_block_sensitive_updates` tiene bypass parcial

El trigger bloquea cambios a `created_by`, `org_id`, y `dock_id` para no-admins. Pero **no bloquea**:

| Campo | ¿Debería estar protegido? | Estado |
|-------|--------------------------|--------|
| `created_by` | Sí (ownership) | ✅ Bloqueado |
| `org_id` | Sí (data isolation) | ✅ Bloqueado |
| `dock_id` | Sí (reasignación indebida) | ✅ Bloqueado |
| `id` | Extremadamente | ❌ No bloqueado (pero PK, difícil de cambiar) |
| `is_cancelled` | Sí (puede reactivar reservas canceladas) | ❌ No bloqueado |
| Campos de auditoría | Parcialmente | ❌ No bloqueado |

La función busca roles `admin`, `superadmin`, `full_access`, `full access` — esto es correcto.

---

### 2.7 📊 COMPARATIVA: Tablas CON triggers vs SIN triggers

#### Tablas CON triggers (13 de 59 = 22%)

| Tabla | Triggers | Cobertura |
|-------|----------|-----------|
| `reservations` | 5 | Conflictos, auditoría, bloqueo de cambios, horarios |
| `provider_cargo_time_profiles` | 3 | Auditoría, validación org, updated_at |
| `providers` | 2 | Auditoría |
| `cargo_types` | 2 | Auditoría |
| `warehouses` | 2 | ⚠️ Duplicados |
| `clients` | 1 | Solo updated_at |
| `client_rules` | 1 | Solo updated_at |
| `client_docks` | 1 | Solo dock_order default |
| `dock_time_blocks` | 1 | Conflictos |
| `docks` | 1 | Validación org |
| `organizations` | 1 | Límite de 1 org |
| `reservation_statuses` | 1 | Protección DELETE |
| `user_warehouses` | 1 | Validación país |

#### Tablas SIN triggers (46 de 59 = 78%)

**Críticas (operacionales) — DEBERÍAN tener triggers:**
| Tabla | Riesgo |
|-------|--------|
| `casetilla_ingresos` | 🔴 Sin auditoría, sin auto-timestamps |
| `casetilla_salidas` | 🔴 Sin auditoría, sin auto-timestamps |
| `chat_sessions` | 🟠 Sin auto updated_at, sin log |
| `chat_messages` | 🟠 Sin log de actividad |
| `collaborators` | 🟠 Sin auto updated_at/updated_by |
| `correspondence_rules` | 🟠 Sin auto updated_at/updated_by |
| `correspondence_outbox` | 🟠 Sin auto updated_at en status changes |
| `knowledge_documents` | 🟠 Sin auto updated_at, sin log de cambios de status |
| `knowledge_document_versions` | 🟡 Sin auto created_by |
| `org_settings` | 🟠 Sin auto updated_by, sin log de cambios |
| `profiles` | 🟠 Sin auto updated_at |
| `roles` | 🟡 Sin auto updated_at |
| `origen_proveedores` | 🟡 Sin auto updated_at/updated_by |
| `work_types` | 🟡 Sin auto updated_at |
| `gmail_accounts` | 🟡 Sin auto updated_at |
| `provider_clusters` | 🟡 Sin auto updated_at |

**Tablas de junction (NO necesitan triggers de auditoría):**
`cargo_type_warehouses`, `client_providers`, `client_same_day_bypass_users`, `collaborator_warehouses`, `knowledge_document_permissions`, `knowledge_document_roles`, `knowledge_document_tags`, `provider_cluster_items`, `provider_warehouses`, `role_permissions`, `user_clients`, `user_countries`, `user_country_access`, `user_provider_clusters`, `user_providers`, `user_warehouse_access`, `warehouse_clients`

**Tablas de log/auditoría (NO necesitan triggers adicionales):**
`activity_log`, `admin_audit_log`, `chat_audit_logs`, `correspondence_logs`, `reservation_activity_log`

**Tablas estáticas/de configuración:**
`countries`, `permissions`, `dock_categories`, `dock_statuses`, `chat_prompt_configs`, `client_pickup_rules`

---

## 3. CRON JOBS

| Job | Schedule | Estado | Qué dispara |
|-----|----------|--------|-------------|
| `auto-mark-no-show-every-5-min` | `*/5 * * * *` | ✅ Active | Función SQL `auto_mark_no_show_v5()` — marca reservas como no-show si pasó la hora de inicio sin registro de ingreso |
| `generate-client-pickup-blocks-every-minute` | `* * * * *` | ✅ Active | Edge Function `generate-client-pickup-blocks` vía `net.http_post` — genera bloques horarios para clientes con reglas de pickup |

**Verificación de conexión con módulos:**

| Módulo | ¿Disparado por trigger/cron? | Estado |
|--------|------------------------------|--------|
| **Casetilla — No Show** | `auto-mark-no-show-every-5-min` cron → `auto_mark_no_show_v5()` | ✅ Funcionando |
| **Casetilla — Cliente Retira** | `generate-client-pickup-blocks-every-minute` cron → Edge Function | ✅ Funcionando |
| **Casetilla — Registro IN** | NINGÚN trigger en `casetilla_ingresos` | 🔴 Sin trigger |
| **Casetilla — Registro OUT** | NINGÚN trigger en `casetilla_salidas` | 🔴 Sin trigger |
| **Reservas — Creación** | `trigger_log_reservation_created` → `activity_log` | ✅ Funcionando |
| **Reservas — Cambio de estado** | `trigger_log_reservation_updated` → `activity_log` (solo 4 campos) | 🟠 Parcial |
| **Reservas — Conflictos** | `validate_reservation_conflicts` + `trg_validate_reservation_business_hours` | ⚠️ Duplicado |
| **Correspondencia — Dispatch** | NINGÚN trigger en `correspondence_outbox` | 🔴 Sin trigger |
| **Correspondencia — Reglas** | NINGÚN trigger en `correspondence_rules` | 🟠 Sin auditoría |
| **Chat IA — Mensajes** | NINGÚN trigger en `chat_messages` | 🟡 Sin log |
| **Conocimiento — Docs** | NINGÚN trigger en `knowledge_documents` | 🟠 Sin log de cambios |
| **Admin — org_settings** | NINGÚN trigger | 🟠 Sin log de cambios |

---

## 4. MAPA DE DISPARO POR MÓDULO

```
MÓDULO              OPERACIÓN       TRIGGERS QUE SE DISPARAN
───────              ─────────       ─────────────────────────
RESERVAS
  Crear reserva      INSERT   →     trg_validate_reservation_business_hours (BEFORE)
                              →     validate_reservation_conflicts (BEFORE) ⚠️ DUPLICADO
                              →     trigger_log_reservation_created (AFTER) → activity_log
                              
  Editar reserva     UPDATE   →     trg_reservations_block_sensitive_updates (BEFORE)
                              →     trg_validate_reservation_business_hours (BEFORE)
                              →     validate_reservation_conflicts (BEFORE) ⚠️ DUPLICADO
                              →     trigger_log_reservation_updated (AFTER) → activity_log (solo 4 campos)
                              →     ❌ NO trigger updated_at

  Cancelar reserva   UPDATE   →     Misma cadena que "Editar reserva"
                              →     is_cancelled NO se loguea en activity_log ⚠️

CALENDARIO
  Crear bloque       INSERT   →     trg_blocks_no_overlap (BEFORE)
  Editar bloque      UPDATE   →     trg_blocks_no_overlap (BEFORE)

CASETILLA
  Registrar IN       INSERT   →     ❌ NINGÚN trigger en casetilla_ingresos
  Registrar OUT      INSERT   →     ❌ NINGÚN trigger en casetilla_salidas
  No Show auto       CRON     →     auto_mark_no_show_v5() cada 5 min
  Cliente Retira     CRON     →     generate-client-pickup-blocks cada 1 min

CATÁLOGOS
  Crear provider     INSERT   →     trg_set_audit_fields_providers (BEFORE) ✅
  Editar provider    UPDATE   →     trg_set_audit_fields_providers + trg_providers_set_updated ✅
  Crear cargo_type   INSERT   →     trg_set_audit_fields_cargo_types ✅
  Editar cargo_type  UPDATE   →     trg_set_audit_fields_cargo_types + trg_cargo_types_set_updated ✅
  Crear time_profile INSERT   →     trg_pc_validate_same_org + trg_set_audit_fields_time_profiles ✅
  Editar time_profile UPDATE  →     trg_pc_validate_same_org + trg_set_audit_fields_time_profiles + trg_pc_set_updated ✅

ADMIN - USUARIOS
  Asignar warehouse  INSERT   →     trg_user_warehouses_country (BEFORE)
  Cambiar warehouse  UPDATE   →     trg_user_warehouses_country (BEFORE)
  Asignar rol        INSERT   →     ❌ NINGÚN trigger en user_org_roles
  Cambiar rol        UPDATE   →     ❌ NINGÚN trigger en user_org_roles

ADMIN - ALMACENES
  Editar warehouse   UPDATE   →     trg_warehouses_set_updated_at + warehouses_updated_at ⚠️ DUPLICADO

CORRESPONDENCIA
  Crear regla        INSERT   →     ❌ NINGÚN trigger
  Editar regla       UPDATE   →     ❌ NINGÚN trigger
  Enviar correo      INSERT   →     ❌ NINGÚN trigger en correspondence_outbox
  Cambiar status     UPDATE   →     ❌ NINGÚN trigger en correspondence_outbox

CHAT IA
  Iniciar sesión     INSERT   →     ❌ NINGÚN trigger en chat_sessions
  Enviar mensaje     INSERT   →     ❌ NINGÚN trigger en chat_messages

CONOCIMIENTO
  Subir documento    INSERT   →     ❌ NINGÚN trigger en knowledge_documents
  Cambiar status     UPDATE   →     ❌ NINGÚN trigger en knowledge_documents
  Nueva versión      INSERT   →     ❌ NINGÚN trigger en knowledge_document_versions

MANPOWER
  Crear colaborador  INSERT   →     ❌ NINGÚN trigger en collaborators
  Editar colaborador UPDATE   →     ❌ NINGÚN trigger en collaborators
```

---

## 5. RESUMEN DE HALLAZGOS Y PRIORIDAD

| # | Hallazgo | Severidad | Módulo Afectado | Acción |
|---|----------|-----------|-----------------|--------|
| 1 | `warehouses` tiene 2 triggers idénticos | 🔴 CRÍTICO | Admin-Almacenes | Eliminar `warehouses_updated_at` |
| 2 | `reservations` tiene 2 triggers de conflicto duplicados | 🟠 ALTO | Calendario/Reservas | Consolidar en uno solo |
| 3 | `reservations` sin trigger `updated_at` automático | 🟠 ALTO | Todos (reservas) | Agregar trigger BEFORE UPDATE |
| 4 | `casetilla_ingresos` sin trigger de auditoría | 🔴 CRÍTICO | Casetilla | Agregar triggers de auditoría + activity_log |
| 5 | `casetilla_salidas` sin trigger de auditoría | 🔴 CRÍTICO | Casetilla | Agregar triggers de auditoría + activity_log |
| 6 | `trigger_log_reservation_updated` solo registra 4 campos | 🟡 MEDIO | Auditoría | Extender a todos los campos |
| 7 | `is_cancelled` no se loguea en activity_log | 🟡 MEDIO | Reservas | Agregar al trigger de auditoría |
| 8 | `correspondence_rules` sin trigger de auditoría | 🟠 ALTO | Correspondencia | Agregar `set_updated_at_and_by` |
| 9 | `correspondence_outbox` sin trigger de auditoría | 🟠 ALTO | Correspondencia | Agregar log de cambios de status |
| 10 | `knowledge_documents` sin trigger de auditoría | 🟠 ALTO | Conocimiento | Agregar `set_updated_at` + log de status |
| 11 | `org_settings` sin trigger de auditoría | 🟠 ALTO | Admin-Config | Agregar `set_updated_at_and_by` + activity_log |
| 12 | `chat_sessions` sin `updated_at` trigger | 🟡 MEDIO | Chat IA | Agregar trigger |
| 13 | `profiles` sin `updated_at` trigger | 🟡 MEDIO | Perfil | Agregar trigger |
| 14 | `collaborators` sin trigger de auditoría | 🟡 MEDIO | Manpower | Agregar `set_updated_at_and_by` |
| 15 | `roles` sin `updated_at` trigger | 🟡 MEDIO | Admin-Roles | Agregar trigger |
| 16 | `user_org_roles` sin trigger de auditoría | 🟡 MEDIO | Admin-Usuarios | Agregar log en activity_log |
| 17 | `reservations_block_sensitive_updates` no protege `is_cancelled` | 🟡 BAJO | Seguridad | Evaluar si debe protegerlo |

---

## 6. PLAN DE ACCIÓN RECOMENDADO

### Fase 1 — Correcciones inmediatas (hoy)
1. **Eliminar trigger duplicado** `warehouses_updated_at`
2. **Agregar trigger `updated_at`** en `reservations`
3. **Agregar triggers de auditoría** en `casetilla_ingresos` y `casetilla_salidas`

### Fase 2 — Alta prioridad (esta semana)
4. **Consolidar conflict checks** de `reservations` en un solo trigger
5. **Extender `trigger_log_reservation_updated`** para cubrir todos los campos
6. **Agregar triggers de auditoría** en `correspondence_rules`, `correspondence_outbox`, `knowledge_documents`, `org_settings`

### Fase 3 — Media prioridad (próximo sprint)
7. **Agregar triggers** en `chat_sessions`, `profiles`, `collaborators`, `roles`, `user_org_roles`

---

*Documento generado a partir del análisis directo del esquema de base de datos y código fuente del proyecto. Cero suposiciones.*