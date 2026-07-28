# RULE_ENGINE_ARCHITECTURE.md — Motor de Reglas IN/OUT

> **Versión**: 1.2 | **Fecha**: 2026-07-24  
> **Estado**: Diseño aprobado — Pendiente implementación  
> **Dependencias**: `STATE_MACHINE_SPEC.md` para la matriz de estados y transiciones; `DATA_MODEL_ALIGNMENT.md` como fuente canónica del modelo de datos  
> **Precondición**: Diagnóstico v3.2 del sistema de flujo IN/OUT completado y validado contra código real. Modelo de datos validado contra esquema real de Supabase.

---

## 1. Visión General

### 1.1 Propósito

El Rule Engine es el componente central del sistema de auditoría de flujo IN/OUT. Evalúa cada cambio de estado de una reserva (`reservations.status_id`) y cada evento físico de casetilla (`casetilla_ingresos`, `casetilla_salidas`) contra un catálogo de reglas configurables. Detecta anomalías operativas, bloquea transiciones inválidas, genera advertencias, y produce incidencias trazables.

### 1.2 Fuentes de verdad

El motor solo consume tres fuentes de datos:

| Fuente | Tipo | Qué registra |
|---|---|---|
| `casetilla_ingresos` | Evento físico | Ingreso del vehículo al almacén (IN físico) |
| `casetilla_salidas` | Evento físico | Salida del vehículo del almacén (OUT físico) |
| `activity_log` (cambios de `status_id`) | Evento administrativo | Cada cambio de estado operativo de la reserva |

No existen fuentes separadas de "IN operativo" o "OUT operativo". Todo el catálogo de reglas se construye exclusivamente con estas tres fuentes.

### 1.3 Modos de operación

El motor opera en tres modos, controlados por `enforcement_mode` en cada regla:

```
┌──────────┬──────────────────────────────────────────────────────────────┐
│  MODE    │  COMPORTAMIENTO                                               │
├──────────┼──────────────────────────────────────────────────────────────┤
│ observe  │  Detecta la anomalía, crea incidencia, PERMITE la transición  │
│ warn     │  Detecta la anomalía, crea incidencia, BLOQUEA la transición  │
│          │  hasta que el usuario confirme explícitamente                 │
│ block    │  Detecta la anomalía, crea incidencia, BLOQUEA la transición  │
│          │  Solo puede omitirse con override administrativo autorizado    │
└──────────┴──────────────────────────────────────────────────────────────┘
```

### 1.4 Arquitectura de alto nivel

```
┌──────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                           │
│                                                                   │
│  Calendar → ReservationModal → transition_reservation_status()    │
│  Casetilla → IngresoForm/ExitForm → transition_reservation_status()│
│  Admin → Tab Incidencias → resolve_incident() / override          │
│                                                                   │
│  ⛔ NUNCA: supabase.from('reservations').update({status_id})       │
└───────────────────────────┬───────────────────────────────────────┘
                            │ supabase.rpc('transition_reservation_status')
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│              RPC: transition_reservation_status()                  │
│              (SECURITY DEFINER, search_path seguro)                │
│                                                                   │
│  1. Resolver identidad: auth.uid() → profiles.id → org_id, roles  │
│  2. SELECT ... FOR UPDATE sobre reservations                      │
│  3. Bloqueo optimista: p_expected_current_status_id               │
│  4. Evaluar reglas activas para esta transición                   │
│  5. Según resultado:                                              │
│     - block  → INSERT attempt (blocked) + incident → RETURN       │
│     - warn   → INSERT attempt (warning_pending) + incident → RETURN│
│     - allow  → INSERT attempt (allowed) → UPDATE status → RETURN  │
│  6. NUNCA lanza RAISE EXCEPTION después de INSERT                 │
└───────────────────────────┬───────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│         TRIGGER: block_unauthorized_status_update                  │
│         (última barrera — BEFORE UPDATE OF status_id)              │
│                                                                   │
│  Si app.transition_authorized != 'true' → RAISE EXCEPTION         │
│  (El flag de sesión solo puede setearlo la RPC en su transacción) │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Pipeline de Evaluación (Arquitectura Interna)

Aunque todo el pipeline vive dentro de la misma RPC `transition_reservation_status()`, internamente está compuesto por **cinco componentes lógicos independientes** con responsabilidades claramente delimitadas. Esta separación es conceptual pero debe reflejarse en el código mediante funciones PL/pgSQL privadas dentro de la RPC, facilitando el mantenimiento, testing y futura extracción.

### 2.0 Visión general del pipeline interno

```
                     ┌─────────────────────┐
                     │   EVENTO DISPARADOR  │
                     │ (cambio status_id,   │
                     │  ingreso, salida)    │
                     └──────────┬──────────┘
                                │
                                ▼
               ┌────────────────────────────────┐
               │                                │
               │  1. RULE LOADER                │
               │  ─────────────────             │
               │  • Resuelve identidad          │
               │  • SELECT ... FOR UPDATE       │
               │  • Carga reglas aplicables     │
               │  • Ordena por prioridad        │
               │                                │
               └───────────────┬────────────────┘
                               │ reglas cargadas + contexto
                               ▼
               ┌────────────────────────────────┐
               │                                │
               │  2. RULE EVALUATOR             │
               │  ─────────────────             │
               │  • Itera cada regla            │
               │  • Verifica exclusions_json    │
               │  • Evalúa conditions_json      │
               │  • Clasifica por mode          │
               │  • Construye listas:           │
               │    blocked_rules[]             │
               │    warning_rules[]             │
               │    observed_rules[]            │
               │                                │
               └───────────────┬────────────────┘
                               │ listas clasificadas
                               ▼
               ┌────────────────────────────────┐
               │                                │
               │  3. CONFLICT RESOLVER          │
               │  ─────────────────             │
               │  • ¿override_block? → valida   │
               │  • ¿confirm_warning? → valida  │
               │  • Aplica precedencia:         │
               │    block > warn > observe      │
               │  • Calcula severidad máxima    │
               │  • Decide: BLOCKED / WARNING   │
               │    / ALLOWED                   │
               │                                │
               └───────────────┬────────────────┘
                               │ decisión final
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
          BLOCKED          WARNING           ALLOWED
              │                │                │
              └────────────────┼────────────────┘
                               │
                               ▼
               ┌────────────────────────────────┐
               │                                │
               │  4. INCIDENT GENERATOR         │
               │  ─────────────────             │
               │  • Genera idempotency_key      │
               │  • INSERT/UPDATE incidencias   │
               │  • Vincula incidencias entre sí│
               │  • INSERT transition_attempt   │
               │  • INSERT audit_log            │
               │                                │
               └───────────────┬────────────────┘
                               │ incidencias creadas
                               ▼
               ┌────────────────────────────────┐
               │                                │
               │  5. NOTIFICATION DISPATCHER    │
               │  ─────────────────             │
               │  • Lee notification_mode       │
               │  • immediate → INSERT outbox   │
               │  • hourly/daily/weekly →       │
               │    acumula (cron aparte)       │
               │  • none → termina              │
               │                                │
               └───────────────┬────────────────┘
                               │
                               ▼
                      RETURN JSONB al frontend
```

### 2.1 RULE LOADER

**Responsabilidad:** Recuperar del contexto de evaluación y cargar las reglas aplicables desde la base de datos.

```
┌─────────────────────────────────────────────────────────────┐
│ RULE LOADER                                                  │
│                                                              │
│  ENTRADA:                                                    │
│    • p_reservation_id                                        │
│    • p_new_status_id                                         │
│    • trigger_event (derivado de p_source)                    │
│                                                              │
│  PROCESO:                                                    │
│    -- 1. Resolver identidad del actor                        │
│    v_auth_uid := auth.uid();                                 │
│    v_profile_id := (SELECT id FROM profiles                  │
│                     WHERE id = v_auth_uid);                  │
│                                                              │
│    -- 2. Bloquear reserva (concurrencia) + resolver warehouse │
│    SELECT r.*, d.warehouse_id AS resolved_warehouse_id       │
│    INTO v_reservation                                        │
│    FROM public.reservations r                                │
│    LEFT JOIN public.docks d ON d.id = r.dock_id              │
│    WHERE r.id = p_reservation_id                             │
│    FOR UPDATE;                                               │
│                                                              │
│    -- Si el dock no tiene warehouse, solo aplican reglas     │
│    -- de organización (warehouse_id IS NULL)                 │                                               │
│                                                              │
│    -- 3. Cargar reglas aplicables                            │
│    SELECT * INTO v_rules                                     │
│    FROM public.inout_flow_rules                              │
│    WHERE org_id = v_reservation.org_id                       │
│      AND is_active = true                                     │
│      AND trigger_event = v_trigger_event                     │
│      AND (warehouse_id IS NULL                               │
│           OR warehouse_id = v_reservation.resolved_warehouse_id) │
│      AND (client_id IS NULL                                  │
│           OR client_id = v_reservation.client_id)             │
│      AND (effective_from IS NULL                             │
│           OR effective_from <= now())                        │
│      AND (effective_to IS NULL                               │
│           OR effective_to >= now())                          │
│    ORDER BY                                                  │
│      (client_id IS NOT NULL                                  │
│       AND warehouse_id IS NOT NULL) DESC,                     │
│      (client_id IS NOT NULL) DESC,                            │
│      (warehouse_id IS NOT NULL) DESC,                         │
│      priority ASC;                                           │
│                                                              │
│  SALIDA:                                                     │
│    • v_rules[] (reglas ordenadas por precedencia)            │
│    • v_reservation (datos de la cita con lock,               │
│      incluye resolved_warehouse_id vía docks)                │
│    • v_actor (profile_id, org_id, roles, permisos)           │
│                                                              │
│  ERRORES POSIBLES:                                           │
│    • Reserva no encontrada → RETURN error                    │
│    • Usuario sin perfil → RETURN error                       │
│    • Conflicto de concurrencia → RETURN conflict             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 RULE EVALUATOR

**Responsabilidad:** Iterar cada regla cargada, evaluar condiciones y exclusiones, y clasificar el resultado.

```
┌─────────────────────────────────────────────────────────────┐
│ RULE EVALUATOR                                               │
│                                                              │
│  ENTRADA:                                                    │
│    • v_rules[] (del Rule Loader)                             │
│    • v_reservation (datos de la cita)                        │
│                                                              │
│  PROCESO (para cada regla, en orden de prioridad):           │
│                                                              │
│    FOR EACH rule IN v_rules:                                 │
│                                                              │
│      -- a. Evaluar exclusiones                               │
│      IF exclusion_applies(rule.exclusions_json,              │
│                           v_reservation) THEN                │
│        CONTINUE; -- saltar regla                             │
│      END IF;                                                 │
│                                                              │
│      -- b. Evaluar condiciones                               │
│      IF NOT condition_matches(rule.conditions_json,          │
│                               v_reservation,                 │
│                               v_event_context) THEN          │
│        CONTINUE; -- condición no cumple                      │
│      END IF;                                                 │
│                                                              │
│      -- c. Clasificar por enforcement_mode                   │
│      CASE rule.enforcement_mode:                             │
│        WHEN 'block':                                         │
│          blocked_rules.append(rule);                         │
│        WHEN 'warn':                                          │
│          warning_rules.append(rule);                         │
│        WHEN 'observe':                                       │
│          observed_rules.append(rule);                        │
│      END CASE;                                               │
│                                                              │
│    END FOR;                                                  │
│                                                              │
│  SALIDA:                                                     │
│    • blocked_rules[] (reglas que bloquean)                   │
│    • warning_rules[] (reglas que advierten)                  │
│    • observed_rules[] (reglas que solo observan)             │
│    • max_severity (severidad máxima entre todas)             │
│                                                              │
│  NOTAS:                                                      │
│    • El orden de evaluación es crítico: más específicas      │
│      primero.                                                │
│    • Una vez clasificada como block, no se degrada aunque    │
│      haya reglas menos restrictivas después.                 │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 CONFLICT RESOLVER

**Responsabilidad:** Tomar las listas clasificadas, aplicar la lógica de override/confirmación, y decidir si la transición procede.

```
┌─────────────────────────────────────────────────────────────┐
│ CONFLICT RESOLVER                                            │
│                                                              │
│  ENTRADA:                                                    │
│    • blocked_rules[], warning_rules[], observed_rules[]      │
│    • p_override_block, p_confirm_warning                     │
│    • p_justification, p_parent_attempt_id                    │
│    • v_actor (roles, permisos)                               │
│                                                              │
│  PROCESO:                                                    │
│                                                              │
│    -- Rama 1: Solicitud de override                          │
│    IF p_override_block THEN                                  │
│      IF NOT has_override_permission(v_actor) THEN            │
│        RETURN error "Sin permiso para override";             │
│      END IF;                                                 │
│      IF length(p_justification) < 20 THEN                    │
│        RETURN error "Justificación requerida (mín 20)";      │
│      END IF;                                                 │
│      -- Ignorar blocked_rules, proceder                      │
│      v_decision := 'ALLOWED';                                │
│      v_override_applied := true;                             │
│      GOTO generate_incidents;                                │
│    END IF;                                                   │
│                                                              │
│    -- Rama 2: Confirmación de warning                        │
│    IF p_confirm_warning THEN                                 │
│      IF NOT is_valid_pending_warning(p_parent_attempt_id)    │
│         THEN                                                 │
│        RETURN error "Intento de confirmación inválido";      │
│      END IF;                                                 │
│      -- Ignorar warning_rules, proceder                      │
│      v_decision := 'ALLOWED';                                │
│      v_warning_confirmed := true;                            │
│      GOTO generate_incidents;                                │
│    END IF;                                                   │
│                                                              │
│    -- Rama 3: Evaluación normal                              │
│    IF blocked_rules.count > 0 THEN                           │
│      v_decision := 'BLOCKED';                                │
│    ELSEIF warning_rules.count > 0 THEN                       │
│      v_decision := 'WARNING';                                │
│    ELSE                                                      │
│      v_decision := 'ALLOWED';                                │
│    END IF;                                                   │
│                                                              │
│  SALIDA:                                                     │
│    • v_decision: 'BLOCKED' | 'WARNING' | 'ALLOWED'           │
│    • v_override_applied: boolean                             │
│    • v_warning_confirmed: boolean                            │
│    • v_max_severity: 'critica' | 'alta' | ... | 'informativa'│
│                                                              │
│  REGLAS DE PRECEDENCIA:                                      │
│    • block > warn > observe                                  │
│    • override_block anula block (si autorizado)              │
│    • confirm_warning anula warn (si intento pendiente)       │
│    • observe nunca bloquea, siempre genera incidencia         │
└─────────────────────────────────────────────────────────────┘
```

### 2.4 INCIDENT GENERATOR

**Responsabilidad:** Crear las incidencias, intentos de transición y registros de auditoría según la decisión del Conflict Resolver. Es el componente que materializa la trazabilidad.

```
┌─────────────────────────────────────────────────────────────┐
│ INCIDENT GENERATOR                                           │
│                                                              │
│  ENTRADA:                                                    │
│    • v_decision + listas de reglas + contexto                │
│                                                              │
│  PROCESO:                                                    │
│                                                              │
│    -- 1. Insertar transition_attempt                         │
│    INSERT INTO inout_state_transition_attempts (             │
│      org_id, reservation_id, previous_status_id,             │
│      requested_status_id, applied_status_id,                 │
│      result, parent_attempt_id, attempted_by,                │
│      attempted_at, source, ip_address,                       │
│      rule_id, enforcement_mode_applied,                      │
│      blocked_reason, override_requested,                     │
│      override_authorized, override_justification             │
│    ) VALUES (...)                                            │
│    RETURNING id INTO v_attempt_id;                           │
│                                                              │
│    -- 2. Generar incidencia POR REGLA disparada              │
│    FOR EACH rule IN all_triggered_rules:                     │
│      v_key := build_idempotency_key(rule, reservation);       │
│                                                              │
│      INSERT INTO inout_flow_incidents (                      │
│        org_id, reservation_id, warehouse_id, client_id,      │
│        rule_id, incident_type, severity,                     │
│        expected_event, detected_event, event_timestamp,      │
│        detected_by_type, source_event_type,                  │
│        source_event_id, idempotency_key,                     │
│        metadata_json                                         │
│      ) VALUES (...)                                          │
│      ON CONFLICT (org_id, idempotency_key) DO UPDATE         │
│      SET                                                    │
│        last_detected_at = EXCLUDED.last_detected_at,        │
│        occurrence_count = inout_flow_incidents               │
│          .occurrence_count + 1,                              │
│        updated_at = now()                                    │
│      WHERE status IN ('nueva','en_revision','ignorada');    │
│                                                              │
│      -- 3. Vincular incidencias relacionadas                 │
│      UPDATE inout_flow_incidents                             │
│      SET metadata_json = jsonb_set(                          │
│        metadata_json,                                        │
│        '{related_incident_ids}',                             │
│        metadata_json->'related_incident_ids'                 │
│          || to_jsonb(v_incident_id::text)                    │
│      )                                                       │
│      WHERE id = v_previous_incident_id                       │
│        AND id != v_incident_id;                              │
│                                                              │
│    END FOR;                                                  │
│                                                              │
│    -- 4. Insertar audit_log                                 │
│    INSERT INTO inout_flow_audit_log (...) VALUES (...);      │
│                                                              │
│  SALIDA:                                                     │
│    • v_attempt_id (ID del transition_attempt creado)         │
│    • v_incident_ids[] (IDs de incidencias creadas)           │
│                                                              │
│  REGLAS DE INTEGRIDAD:                                       │
│    • Si v_decision = 'BLOCKED': applied_status_id = NULL     │
│    • Si override: genera incidencia administrative_override  │
│    • NUNCA lanzar RAISE después del primer INSERT            │
└─────────────────────────────────────────────────────────────┘
```

### 2.5 Resultado estructurado de la RPC

```jsonc
// CASO 1: Transición bloqueada
{
  "success": false,
  "blocked": true,
  "attempt_id": "uuid-attempt-1",
  "incident_ids": ["uuid-inc-1", "uuid-inc-2"],
  "message": "Transición bloqueada: DISPATCHED_REOPEN_ATTEMPT. Se requiere override administrativo.",
  "blocking_rules": [
    {"code": "DISPATCHED_REOPEN_ATTEMPT", "message": "DISPATCHED solo puede avanzar a DONE"}
  ]
}

// CASO 2: Advertencia (requiere confirmación)
{
  "success": false,
  "blocked": false,
  "warn": true,
  "attempt_id": "uuid-attempt-2",
  "incident_ids": ["uuid-inc-3"],
  "message": "Esta transición requiere confirmación. ¿Desea continuar?",
  "warnings": [
    {"rule_code": "DONE_WITHOUT_GATE_OUT", "message": "La cita no tiene registro de salida por casetilla"}
  ]
}

// CASO 3: Transición permitida
{
  "success": true,
  "blocked": false,
  "attempt_id": "uuid-attempt-3",
  "incident_ids": ["uuid-inc-4"]  // incidencias observe, si las hay
}

// CASO 4: Conflicto de concurrencia
{
  "success": false,
  "conflict": true,
  "current_status_id": "uuid-estado-real",
  "message": "La cita fue modificada por otro usuario. Recargue e intente nuevamente."
}
```

---

## 3. DSL de Reglas

### 3.1 `conditions_json` — Esquema cerrado

El DSL está estrictamente limitado a un conjunto declarativo de campos, operadores y valores. **No se permite SQL, JavaScript, eval, lambdas ni expresiones arbitrarias.** Esto garantiza que las reglas sean auditables, predecibles y no puedan ejecutar código arbitrario.

#### Catálogo de campos

| Categoría | Campo | Tipo | Descripción |
|---|---|---|---|
| Estados | `required_previous_status_codes` | TEXT[] | Estados desde los que se permite la transición |
| Estados | `prohibited_previous_status_codes` | TEXT[] | Estados desde los que se bloquea |
| Estados | `required_new_status_codes` | TEXT[] | Estados a los que aplica la regla |
| Estados | `prohibited_new_status_codes` | TEXT[] | Estados a los que no aplica |
| Estados | `allowed_transitions` | TEXT[][] | Pares [desde, hasta] explícitamente permitidos |
| Eventos | `required_event_tables` | TEXT[] | Tablas de evento que deben existir |
| Eventos | `prohibited_event_tables` | TEXT[] | Tablas de evento que no deben existir |
| Eventos | `require_event_order` | TEXT[][] | Pares [A, B] donde A debe preceder a B |
| Temporales | `max_time_between_events_minutes` | INTEGER | Tiempo máximo entre eventos |
| Temporales | `min_time_between_events_minutes` | INTEGER | Tiempo mínimo entre eventos |
| Temporales | `require_timestamp_order` | TEXT[][] | Pares donde columna A < columna B |
| Datos | `required_fields` | TEXT[] | Campos obligatorios en reservations |
| Datos | `require_is_cancelled` | BOOLEAN | La cita debe estar cancelada |
| Datos | `exclude_is_cancelled` | BOOLEAN | La cita no debe estar cancelada |
| Conteo | `max_occurrences` | INTEGER | Máximo de ocurrencias de un evento |
| Conteo | `min_occurrences` | INTEGER | Mínimo de ocurrencias |
| Almacén | `require_same_warehouse` | BOOLEAN | El evento debe ser del mismo almacén |

#### Operadores

| Operador | Aplica a | Significado |
|---|---|---|
| `eq` | Escalares | Igualdad |
| `neq` | Escalares | Desigualdad |
| `in` | Arrays | El valor está en la lista |
| `not_in` | Arrays | El valor NO está en la lista |
| `exists` | Sub-tablas | EXISTS (SELECT ...) |
| `not_exists` | Sub-tablas | NOT EXISTS (SELECT ...) |
| `gt`, `gte`, `lt`, `lte` | Timestamps, integers | Comparaciones |

#### Ejemplo: `STATUS_WITHOUT_GATE_IN`

```json
{
  "required_new_status_codes": [
    "ARRIVED_PENDING_UNLOAD", "IN_PROGRESS", "PENDING_DISCHARGE",
    "START", "UNLOADING", "DISCHARGED"
  ],
  "require_event_tables": ["casetilla_ingresos"],
  "event_check": "not_exists"
}
```

#### Versionado

Cada regla tiene `schema_version INTEGER NOT NULL DEFAULT 1`. Al evolucionar el DSL (nuevos campos, nuevos operadores), se incrementa la versión. Las reglas existentes se migran mediante scripts que leen `schema_version` y transforman `conditions_json` según corresponda.

### 3.2 `exclusions_json` — Esquema cerrado

```jsonc
{
  "excluded_status_codes": ["PENDING", "CONFIRMED", "CANCELLED"],
  "excluded_warehouse_ids": ["uuid-warehouse-norte"],
  "excluded_client_ids": ["uuid-cliente-especial"],
  "excluded_operation_types": ["crossdock"],
  "temporary_exceptions": [
    {
      "reservation_id": "uuid-abc",
      "reason": "Aprobado por gerente de operaciones",
      "expires_at": "2026-07-30T23:59:59Z",
      "approved_by": "uuid-admin",
      "created_at": "2026-07-24T10:00:00Z"
    }
  ],
  "excluded_roles": []
}
```

Las exclusiones son **por regla**, no globales. Una cita puede estar excluida de la regla de "falta de ingreso" (`STATUS_WITHOUT_GATE_IN`) por estar en estado PENDING, pero no excluida de la regla de "transición inválida" (`INVALID_STATUS_TRANSITION`).

---

## 4. Priorización

### 4.1 Jerarquía de precedencia

```
MAYOR PRIORIDAD (más específica)
  │
  ├── 1. Regla con client_id + warehouse_id (cliente específico en almacén específico)
  ├── 2. Regla con client_id solamente (cliente específico, todos los almacenes)
  ├── 3. Regla con warehouse_id solamente (almacén específico, todos los clientes)
  ├── 4. Regla de organización (warehouse_id=NULL, client_id=NULL)
  └── 5. Regla plantilla del sistema (is_system_rule=true, mismo nivel de especificidad)
  │
MENOR PRIORIDAD (más genérica)
```

Dentro del mismo nivel de especificidad, gana la regla con **menor `priority`** (1 = máxima prioridad, 100 = default, mayor número = menor prioridad).

### 4.2 Resolución de conflictos entre enforcement_modes

| Situación | Resultado |
|---|---|
| Al menos una regla `block` disparada | Transición BLOQUEADA (sin override) |
| Sin `block`, al menos una `warn` | Se genera WARNING consolidado |
| Solo `observe` | Transición PERMITIDA, se crean incidencias |

### 4.3 Severidad efectiva

Cuando múltiples reglas se disparan simultáneamente, la severidad efectiva de la evaluación es la **máxima** entre todas:

```
critica > alta > media > baja > informativa
```

### 4.4 Múltiples incidencias

Se crea **una incidencia por cada regla disparada**, no una incidencia consolidada. Cada incidencia tiene su propio `rule_id`, `incident_type` y `severity`. Se vinculan entre sí mediante `metadata_json.related_incident_ids`. Esto garantiza trazabilidad individual: si una regla se modifica después, se puede saber exactamente qué incidencias generó.

---

## 5. Reglas del Sistema

### 5.1 Definición

Las reglas del sistema son reglas **no eliminables y estructuralmente inmutables** que se siembran por organización al activar el módulo de flujo IN/OUT. Proveen la base de validación operativa que toda organización debe tener.

| Propiedad | Valor |
|---|---|
| `is_system_rule` | `true` |
| `edit_policy` | `locked` o `configuration_only` |
| `org_id` | NOT NULL (toda regla pertenece a una organización) |
| Eliminación | Prohibida |
| Desactivación | Prohibida (`is_active` no puede cambiarse si `edit_policy = 'locked'`) |

### 5.2 `edit_policy`

| `is_system_rule` | `edit_policy` | Qué se puede modificar |
|---|---|---|
| `true` | `locked` | Nada. La regla es inmutable en todos sus campos. |
| `true` | `configuration_only` | `warehouse_id`, `client_id`, `grace_period_minutes`, `notification_mode`, `effective_from`, `effective_to`, `priority`, `is_active`, `applies_retroactively`, `deduplication_window_hours` |
| `true` | `fully_editable` | ❌ PROHIBIDO — CHECK constraint lo impide |
| `false` | `fully_editable` | Todo (regla creada por el usuario) |
| `false` | `configuration_only` | Solo configuración (congelada por admin) |
| `false` | `locked` | Nada (congelada por admin) |

---

## 6. Reglas Configurables

Los usuarios con permiso `casetilla.flow_report.rules.manage` pueden:

- **Crear** reglas propias (`is_system_rule = false`, `edit_policy = 'fully_editable'`)
- **Modificar** reglas existentes (según `edit_policy`)
- **Desactivar** reglas (`is_active = false`)
- **Configurar** alcance (`warehouse_id`, `client_id`)
- **Ajustar** parámetros operativos (`grace_period_minutes`, `priority`, `notification_mode`)

Las reglas configurables heredan la precedencia: una regla específica de warehouse **reemplaza** a la regla general de organización para ese warehouse, no la complementa.

---

## 7. Motor en Tiempo Real

### 7.1 Puntos de entrada

Todo cambio de `reservations.status_id` debe pasar por la RPC `transition_reservation_status()`. Esto incluye:

| Fuente | `source` | Disparador |
|---|---|---|
| Calendario (UI) | `frontend_calendar` | ReservationModal.handleSubmit |
| Casetilla ingreso | `casetilla_ingreso` | casetillaService.createIngreso |
| Casetilla salida | `casetilla_salida` | casetillaService.createSalida |
| API externa | `external_api` | api-v1-reservations-patch-status |
| Auto No-Show | `auto_no_show` | auto-mark-no-show Edge Function |
| Override admin | `admin_override` | UI de incidencias / admin |
| Reconciliación | `scheduled_reconciliation` | evaluate-inout-flow |
| Sistema | `system` | Migraciones, correcciones programadas |

### 7.2 Identidad del actor

La RPC resuelve al actor internamente, **nunca desde un parámetro enviado por el frontend**:

```
auth.uid() → profiles.id → user_org_roles → org_id, role, permisos
```

| Actor | `attempted_by` | Notas |
|---|---|---|
| Usuario autenticado | `profiles.id` desde `auth.uid()` | Validado contra `user_org_roles` |
| Service role | NULL | Edge functions, cron jobs |
| Sistema | NULL | Procesos internos |

### 7.3 Seguridad de la RPC

```sql
-- La función debe declararse con:
SECURITY DEFINER
SET search_path = 'pg_catalog', 'public'

-- Acceso restringido:
REVOKE EXECUTE ON FUNCTION transition_reservation_status FROM PUBLIC;
GRANT EXECUTE ON FUNCTION transition_reservation_status TO authenticated;
GRANT EXECUTE ON FUNCTION transition_reservation_status TO service_role;

-- Todas las tablas se referencian con schema calificado: public.inout_flow_rules, etc.
-- La RPC setea un flag de sesión para que el trigger lo valide:
PERFORM set_config('app.transition_authorized', 'true', true);
-- ... lógica ...
PERFORM set_config('app.transition_authorized', '', true);
```

### 7.4 Protección contra bypass

| Vector de ataque | Protección |
|---|---|
| Frontend hace `supabase.from('reservations').update({status_id})` | El trigger `block_unauthorized_status_update` bloquea (no hay flag de sesión) |
| Edge function antigua hace UPDATE directo | El trigger bloquea. Debe migrarse a usar la RPC. |
| Usuario autenticado llama a REST API de Supabase | El trigger bloquea |
| `service_role` hace UPDATE directo | El trigger bloquea |
| Otro usuario intenta `set_config('app.transition_authorized', 'true')` | La configuración es `local` a la transacción; no es visible fuera de ella |

---

## 8. Motor Batch

### 8.1 Reconciliación histórica

El motor batch opera a través de la Edge Function `evaluate-inout-flow`, invocada manualmente desde la UI de administración:

```
FASE 1 — SIMULACIÓN
  - Itera sobre lotes de 100 reservas
  - Evalúa reglas con applies_retroactively = true
  - Cuenta incidencias potenciales (sin INSERT)
  - Devuelve KPIs + muestra de 20 incidencias

FASE 2 — APROBACIÓN
  - UI muestra resultados de simulación
  - Admin puede excluir reglas específicas
  - Admin descarga CSV de detalle
  - Admin presiona "Aprobar y ejecutar"

FASE 3 — EJECUCIÓN REAL
  - Misma Edge Function con dry_run = false
  - Crea incidencias con idempotency_key
  - Maneja duplicados con ON CONFLICT
  - Inserta audit_log
  - Devuelve conteo final
```

### 8.2 Programación

La Edge Function también se ejecuta periódicamente vía `pg_cron` para evaluar reglas con `trigger_event = 'on_schedule'`:

- `TEMPORAL_INCONSISTENCY`: cada hora
- `INCOMPLETE_DATA`: cada 6 horas  
- `ACTIVITY_AFTER_CANCELLED`: cada hora

### 8.3 Rendimiento

| Operación | Tiempo estimado | Estrategia |
|---|---|---|
| RPC (tiempo real) | < 100ms | 3-5 queries indexadas |
| Lote de 100 citas | < 500ms | Joins indexados |
| 10,000 citas | ~50 segundos | 100 lotes secuenciales |
| 100,000+ citas | Paginación por rango de fechas obligatorio | Lotes + filtro de PENDING/CONFIRMED sin eventos |

---

## 9. Notification Dispatcher (Componente Independiente)

### 9.1 Por qué es un componente separado

Aunque hoy el único canal de notificación es SMTP (vía `correspondence_outbox` + `smtp-send`), el Notification Dispatcher se diseña como un componente **desacoplado** del Rule Engine. Esto permite agregar nuevos canales (Teams, Slack, WhatsApp, Push, SMS) sin modificar el motor de reglas.

### 9.2 Arquitectura

```
┌──────────────────────────────────────────────────────────────────┐
│                    NOTIFICATION DISPATCHER                        │
│                                                                   │
│  ┌─────────────────┐                                              │
│  │  RULE ENGINE     │                                              │
│  │  (Incident       │                                              │
│  │   Generator)     │                                              │
│  └────────┬────────┘                                              │
│           │ notification_mode + incidencia                        │
│           ▼                                                       │
│  ┌─────────────────────────────────────────────────────┐         │
│  │              DISPATCHER CORE                         │         │
│  │                                                     │         │
│  │  CASE notification_mode:                            │         │
│  │    'immediate' → enqueue_now()                      │         │
│  │    'hourly'    → accumulate_for_later()             │         │
│  │    'daily'     → accumulate_for_later()             │         │
│  │    'weekly'    → accumulate_for_later()             │         │
│  │    'none'      → skip                               │         │
│  │                                                     │         │
│  └────────┬──────────────┬──────────────┬──────────────┘         │
│           │              │              │                          │
│           ▼              ▼              ▼                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                   │
│  │  SMTP      │  │  TEAMS     │  │  SLACK     │  ← v2            │
│  │  (hoy)     │  │  (futuro)  │  │  (futuro)  │                   │
│  └─────┬──────┘  └────────────┘  └────────────┘                   │
│        │                                                           │
│        ▼                                                           │
│  ┌─────────────────────────────────────────────────────┐         │
│  │              CHANNEL ADAPTERS                        │         │
│  │                                                     │         │
│  │  Cada canal implementa:                             │         │
│  │    • format_message(incident, template) → payload    │         │
│  │    • send(payload) → result                         │         │
│  │    • retry_on_failure(payload, attempt) → result     │         │
│  │                                                     │         │
│  └─────────────────────────────────────────────────────┘         │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 9.3 Canal SMTP (implementación actual)

| Componente | Rol |
|---|---|
| `smtp-send` Edge Function | Consumidor de la cola `correspondence_outbox`. Lee, envía, actualiza estado. Ya existe y funciona. |
| `correspondence_outbox` | Cola de correos. Se agrega `attachment_urls JSONB DEFAULT '[]'` para adjuntos. |
| Secretos | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — sin cambios. |

### 9.4 Flujo inmediato (incidencia crítica)

```
Incidencia creada con severity = 'critica'
        │
        ▼
Notification Dispatcher lee notification_mode = 'immediate'
        │
        ▼
Genera payload HTML
        │
        ▼
INSERT INTO correspondence_outbox:
  event_type = 'inout_flow_report'
  to_emails = schedule.recipients
  subject = template(incident)
  body_html = template(incident)
  status = 'queued'
        │
        ▼
smtp-send (cron/polling) procesa la cola → envía
```

### 9.5 Flujo programado (consolidado)

```
Cron (pg_cron o edge function schedule):
        │
        ▼
Buscar schedules activos con next_scheduled_at <= now()
        │
        ▼
Para cada schedule:
  1. Calcular período (last_sent_at → now())
  2. Query incidencias según filters_json
  3. Si count = 0 → skip
  4. Generar contenido según format:
     - HTML → template inline
     - PDF → librería → Storage → signed URL
     - Excel → librería → Storage → signed URL
     - CSV → texto → Storage → signed URL
  5. INSERT en correspondence_outbox (con attachment_urls si aplica)
  6. INSERT en inout_report_runs
  7. UPDATE schedule: last_sent_at, next_scheduled_at
```

### 9.6 Storage para reportes

```
Bucket: inout-reports (privado, solo service_role)
Ruta: /{org_id}/{yyyy}/{mm}/{report_id}.{format}
Acceso: Signed URLs con expiración de 7 días
```

### 9.7 Modos de notificación (matriz de decisión)

| `notification_mode` | Gatillo | Canal hoy | Canales futuros |
|---|---|---|---|
| `none` | — | — | — |
| `immediate` | Incidencia creada | SMTP directo | + Push, + SMS |
| `hourly` | Cron cada hora | SMTP consolidado | + Teams webhook |
| `daily` | Cron diario | SMTP consolidado | + Slack digest |
| `weekly` | Cron semanal | SMTP consolidado | + Teams weekly |

### 9.8 Extensibilidad futura

Para agregar un nuevo canal (ej: Slack) en v2:

1. Crear el Channel Adapter: `slack_adapter.format_message()`, `slack_adapter.send()`
2. Agregar `notification_channel` a `inout_flow_rules` y `inout_report_schedules`
3. El Dispatcher Core enruta según `notification_channel` además de `notification_mode`
4. El Rule Engine no se modifica — solo el Dispatcher

---

## 10. Findings: Agrupación de Incidencias (v2)

### 10.1 Problema actual (v1)

Hoy el Incident Generator crea **una incidencia por cada regla disparada**. Si una misma reserva rompe 5 reglas en un solo evento (ej: cambiar a DISPATCHED sin gate_out también rompe `INVALID_STATUS_TRANSITION` y `DISPATCHED_REOPEN_ATTEMPT`), el usuario ve **5 incidencias separadas** en el dashboard. Esto es técnicamente correcto (trazabilidad individual) pero operativamente ruidoso.

### 10.2 Concepto de Findings

Un **Finding** es un hallazgo individual dentro de una incidencia. La incidencia se convierte en un **contenedor** que agrupa hallazgos relacionados.

```
┌──────────────────────────────────────────────────────────────┐
│  INCIDENCIA #INC-0042                                        │
│  Reserva: #CIT-8891 | Cliente: ACME | Almacén: Norte         │
│  Estado: nueva | Severidad: alta                             │
│  Detectada: 2026-07-24 14:32:15                              │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ FINDING 1 — DISPATCHED_WITHOUT_GATE_OUT         BLOCK  │  │
│  │ La cita cambió a DISPATCHED sin registro de salida     │  │
│  │ por casetilla.                                         │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ FINDING 2 — DISPATCHED_REOPEN_ATTEMPT           BLOCK  │  │
│  │ Intento de retroceso desde DISPATCHED.                 │  │
│  │ Transición bloqueada.                                  │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ FINDING 3 — INCOMPLETE_DATA                    OBSERVE │  │
│  │ Campos obligatorios vacíos: purchase_order.            │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  [Asignar] [Iniciar revisión] [Resolver]                     │
└──────────────────────────────────────────────────────────────┘
```

### 10.3 Cómo se implementaría en v2

```
Modelo actual (v1):                  Modelo con Findings (v2):
                                     
  inout_flow_incidents                inout_flow_incidents
  ├── id                              ├── id
  ├── rule_id                         ├── (rule_id se mueve al finding)
  ├── incident_type                   ├── incident_type = 'composite'
  ├── severity  ← máxima              ├── severity ← máxima de findings
  ├── ...                             ├── ...
  └── (una incidencia por regla)      └── inout_incident_findings  ← NUEVA TABLA
                                          ├── id
                                          ├── incident_id FK
                                          ├── rule_id FK
                                          ├── finding_type
                                          ├── severity
                                          ├── enforcement_mode
                                          ├── message
                                          └── ...
```

**Nueva tabla `inout_incident_findings` (v2):**

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | — |
| `incident_id` | UUID FK → inout_flow_incidents.id | Incidencia contenedora |
| `rule_id` | UUID FK → inout_flow_rules.id | Regla que generó este hallazgo |
| `finding_type` | TEXT | Mismos valores que `incident_type` actual |
| `severity` | TEXT | Severidad de este hallazgo específico |
| `enforcement_mode` | TEXT | `observe`, `warn`, `block` |
| `message` | TEXT | Mensaje legible para el usuario |
| `sort_order` | INTEGER | Orden de presentación (por severidad) |

### 10.4 Cuándo se agrupan

Se agrupan en una misma incidencia cuando comparten **el mismo `idempotency_root`**:

```
idempotency_root = MD5(org_id || '::' || reservation_id || '::' || event_trigger_id)
```

| Mismo evento | ¿Se agrupan? |
|---|---|
| Cambio de PENDING_DISCHARGE a DISPATCHED rompe 3 reglas | ✅ Sí — una incidencia, 3 findings |
| Dos cambios separados en horas distintas | ❌ No — dos incidencias independientes |
| Misma regla disparada por reconciliation + por tiempo real | ❌ No — diferentes eventos |

### 10.5 Beneficio para el usuario

| v1 (hoy) | v2 (Findings) |
|---|---|
| 5 incidencias en el dashboard | 1 incidencia con 5 hallazgos |
| Hay que leer 5 títulos para entender qué pasó | Una mirada y se entiende todo |
| Resolver cada una por separado | Resolver la incidencia y todos los findings juntos |
| Riesgo de resolver 3 y olvidar 2 | Una acción resuelve todo |

### 10.6 Migración de v1 a v2

```
Fase 1: Crear tabla inout_incident_findings (sin migrar datos)
Fase 2: Modificar Incident Generator para crear findings en vez de incidencias individuales
Fase 3: Incidencias existentes quedan como están (1 regla = 1 incidencia)
Fase 4: Nuevas detecciones usan el modelo agrupado
Fase 5: Dashboard muestra incidencias con contador de findings
```

**No se migran incidencias históricas.** Las v1 quedan como evidencia histórica. La agrupación aplica solo a nuevas detecciones.

---

## 11. Idempotencia

### 11.1 Clave determinista

```
idempotency_key = MD5(org_id || '::' || rule_code || '::' || event_reference)
```

| Tipo de incidencia | `event_reference` |
|---|---|
| Evento faltante | `reservation_id || '::' || expected_stage` |
| Evento duplicado | `reservation_id || '::' || source_table || '::' || event_row_id` |
| Secuencia temporal | `reservation_id || '::' || event_a || '<' || event_b` |
| Transición inválida | `reservation_id || '::' || prev_code || '->' || req_code` |
| Estado terminal | `reservation_id || '::' || terminal_code` |
| Schedule | `reservation_id || '::' || time_bucket` |
| Warehouse mismatch | `reservation_id || '::' || event_table || '::' || wh_id` |

### 11.2 Comportamiento ante duplicado

```sql
INSERT INTO inout_flow_incidents (...)
VALUES (...)
ON CONFLICT (org_id, idempotency_key) DO UPDATE
SET 
  last_detected_at = EXCLUDED.last_detected_at,
  occurrence_count = inout_flow_incidents.occurrence_count + 1,
  updated_at = now()
WHERE inout_flow_incidents.status IN ('nueva', 'en_revision', 'ignorada')
   OR (
     inout_flow_incidents.status = 'resuelta' 
     AND inout_flow_incidents.resolved_at > now() - (rule.deduplication_window_hours || ' hours')::interval
   );
```

### 11.3 Matriz de reapertura

| Estado actual | ¿Reabre? | Efecto |
|---|---|---|
| `nueva` | N/A | Solo incrementa `occurrence_count` |
| `en_revision` | N/A | Solo incrementa `occurrence_count` |
| `resuelta` (dentro de ventana) | ✅ Sí | `status → 'nueva'`, `reopened_count++` |
| `resuelta` (fuera de ventana) | ❌ No | Nueva incidencia |
| `ignorada` | N/A | Solo incrementa `occurrence_count` |
| `falso_positivo` | ❌ No | No se modifica |

---

## 12. Concurrencia

### 12.1 Bloqueo pesimista: SELECT FOR UPDATE

La RPC bloquea la fila de `reservations` al inicio de la transacción:

```sql
SELECT r.*, d.warehouse_id AS resolved_warehouse_id
INTO v_reservation
FROM public.reservations r
LEFT JOIN public.docks d ON d.id = r.dock_id
WHERE r.id = p_reservation_id
FOR UPDATE;
```

Esto garantiza que dos llamadas simultáneas para la misma reserva se ejecuten secuencialmente.

### 12.2 Bloqueo optimista

El frontend puede enviar `p_expected_current_status_id`. Si el estado cambió entre la lectura y la confirmación:

```json
{
  "success": false,
  "conflict": true,
  "current_status_id": "uuid-real",
  "message": "La cita fue modificada por otro usuario. Recargue e intente nuevamente."
}
```

### 12.3 Prevención de doble confirmación

El campo `confirmation_status` en `inout_state_transition_attempts` actúa como semáforo:
- `pending`: se puede confirmar
- `confirmed`: ya fue confirmado, rechazar
- `rejected`: ya fue rechazado, rechazar

### 12.4 Prevención de doble incidencia

`UNIQUE (org_id, idempotency_key)` + `ON CONFLICT DO UPDATE` garantiza cero duplicados.

---

## 13. Modelo de Datos del Motor

### 13.1 Tablas (7)

| # | Tabla | Propósito |
|---|---|---|
| 1 | `inout_flow_rules` | Catálogo de reglas con DSL, exclusiones, severidad y modo |
| 2 | `inout_flow_incidents` | Incidencias detectadas, trazabilidad de ciclo de vida |
| 3 | `inout_state_transition_attempts` | Bitácora inmutable de todo intento de cambio de estado |
| 4 | `inout_incident_comments` | Hilo de comentarios por incidencia |
| 5 | `inout_report_schedules` | Configuración de reportes automáticos |
| 6 | `inout_report_runs` | Historial de ejecuciones de reportes |
| 7 | `inout_flow_audit_log` | Registro inmutable de cambios administrativos |

### 13.2 Permisos requeridos

| Permiso | Propósito |
|---|---|
| `casetilla.flow_report.view` | Ver el módulo de flujo IN/OUT |
| `casetilla.flow_report.rules.view` | Ver reglas configuradas |
| `casetilla.flow_report.rules.manage` | Crear, editar, activar, desactivar reglas |
| `casetilla.flow_report.incidents.view` | Ver incidencias |
| `casetilla.flow_report.incidents.resolve` | Gestionar incidencias (asignar, resolver, ignorar) |
| `casetilla.flow_report.incidents.override` | Ejecutar override administrativo de reglas block |
| `casetilla.flow_report.reports.send` | Enviar reportes manuales |
| `casetilla.flow_report.schedules.manage` | Gestionar schedules de reportes |
| `casetilla.flow_report.audit.view` | Ver auditoría |

---

## 14. Catálogo de Reglas (16 reglas iniciales)

| # | Código | Severidad | Modo | Trigger | Notificación |
|---|---|---|---|---|---|
| R01 | `STATUS_WITHOUT_GATE_IN` | Alta | block | `on_status_change` | `none` |
| R02 | `GATE_OUT_WITHOUT_GATE_IN` | Crítica | block | `on_gate_out` | `immediate` |
| R03 | `DISPATCHED_WITHOUT_GATE_OUT` | Alta | block | `on_status_change` | `none` |
| R04 | `DONE_WITHOUT_GATE_OUT` | Alta | warn | `on_status_change` | `none` |
| R05 | `DUPLICATE_GATE_IN` | Media | observe | `on_gate_in` | `none` |
| R06 | `DUPLICATE_GATE_OUT` | Media | observe | `on_gate_out` | `none` |
| R07 | `GATE_OUT_BEFORE_GATE_IN` | Crítica | block | `on_gate_out` | `immediate` |
| R08 | `STATUS_BEFORE_GATE_IN` | Media | observe | `on_status_change` | `none` |
| R09 | `INVALID_STATUS_TRANSITION` | Alta | block | `on_status_change` | `none` |
| R10 | `DISPATCHED_REOPEN_ATTEMPT` | Alta | block | `on_status_change` | `immediate` |
| R11 | `DONE_REOPEN_ATTEMPT` | Alta | block | `on_status_change` | `immediate` |
| R12 | `ACTIVITY_AFTER_CANCELLED` | Media | observe | `on_schedule` | `daily` |
| R13 | `ACTIVITY_AFTER_NO_SHOW` | Media | warn | `on_status_change` | `none` |
| R14 | `WAREHOUSE_MISMATCH` | Media | observe | `on_gate_in`, `on_gate_out` | `daily` |

> **Nota sobre warehouse**: El warehouse de la reserva NO es una columna directa. Se resuelve mediante: `reservations.dock_id → docks.id → docks.warehouse_id`. El Rule Loader obtiene `resolved_warehouse_id` vía `LEFT JOIN docks` durante el `SELECT FOR UPDATE`. Ver `DATA_MODEL_ALIGNMENT.md`.
| R15 | `TEMPORAL_INCONSISTENCY` | Baja | observe | `on_schedule` | `weekly` |
| R16 | `INCOMPLETE_DATA` | Baja | observe | `on_schedule` | `weekly` |

---

## 15. Flujo WARN vs OVERRIDE

### 15.1 WARN (confirmación)

```
LLAMADA 1 → RPC detecta warn → INSERT attempt (warning_pending) → RETURN {warn: true}
LLAMADA 2 → RPC recibe confirm_warning=true → valida parent_attempt_id pending
           → INSERT attempt (allowed_after_warning) → UPDATE status → RETURN {success: true}
```

- `confirm_warning = true`: confirma la advertencia
- `override_block = false`: NO es un override
- No se considera administrativo; es una confirmación operativa normal

### 15.2 BLOCK (override)

```
LLAMADA 1 → RPC detecta block → INSERT attempt (blocked) + incident → RETURN {blocked: true}
LLAMADA 2 → RPC recibe override_block=true + justification → valida Full Access + permiso
           → INSERT attempt (allowed_by_override) + incident (administrative_override)
           → UPDATE status → RETURN {success: true}
```

- `override_block = true`: solicita omitir regla block
- `justification`: obligatorio, mínimo 20 caracteres
- Requiere permiso `casetilla.flow_report.incidents.override`
- Genera incidencia de tipo `administrative_override` con severidad `alta`

### 15.3 Parámetros de la RPC

| Parámetro | Tipo | Default | Propósito |
|---|---|---|---|
| `p_reservation_id` | UUID | — | Cita a modificar |
| `p_new_status_id` | UUID | — | Estado deseado |
| `p_source` | TEXT | `'frontend_calendar'` | Origen del cambio |
| `p_source_event_id` | TEXT | NULL | ID del evento origen |
| `p_confirm_warning` | BOOLEAN | false | Confirma advertencia previa |
| `p_override_block` | BOOLEAN | false | Solicita override de bloqueo |
| `p_justification` | TEXT | NULL | Motivo (obligatorio si override_block=true) |
| `p_parent_attempt_id` | UUID | NULL | Vincula con intento original |
| `p_expected_current_status_id` | UUID | NULL | Bloqueo optimista |
| `p_metadata` | JSONB | `''` | Contexto adicional |

---

## 16. Riesgos

| # | Riesgo | Impacto | Probabilidad | Mitigación |
|---|---|---|---|---|
| 1 | Edge functions existentes no migran a la RPC y el trigger las bloquea | Alto | Alta | Migrar primero, activar trigger después (rollout en 2 fases) |
| 2 | `casetilla_ingresos.reservation_id` es NULL en registros antiguos | Medio | Alta | Ignorar en reconciliación; asegurar que nuevos siempre tengan reservation_id |
| 3 | Falsos positivos en `TEMPORAL_INCONSISTENCY` por diferencias de reloj | Bajo | Alta | `grace_period_minutes = 5` para esta regla |
| 4 | Performance en orgs con >100K citas | Medio | Baja | Paginación por lotes, filtro por rango de fechas obligatorio |
| 5 | Full Access desactiva todas las reglas | Alto | Baja | `is_system_rule = true` no permite desactivación |
| 6 | Dos admins intentan override simultáneo sobre misma reserva | Bajo | Muy baja | `SELECT FOR UPDATE` serializa |
| 7 | Colisión de `idempotency_key` entre organizaciones | Bajo | Muy baja | `org_id` incluido en el hash |
| 8 | `DISPATCHED → DONE` bloqueado incorrectamente | Alto | Baja | Exclusión explícita en `DISPATCHED_REOPEN_ATTEMPT` |
| 9 | `DISCHARGED` tiene espacio inicial real (`' DISCHARGED'`) causando fallos en comparaciones de código | Alto | Alta | `BTRIM(code)` en todas las comparaciones del motor. Auditoría de dependencias antes de normalizar el catálogo. |

---

## 17. Prerrequisitos de Datos

### 17.1 `DISCHARGED` con espacio inicial

**Evidencia**: El código real en `reservation_statuses` es `' DISCHARGED'` (11 caracteres, primer byte = 32, espacio). Cualquier comparación `= 'DISCHARGED'` falla.

**Mitigación temporal**: El Rule Engine debe usar `BTRIM(rs.code)` en TODAS las comparaciones contra `reservation_statuses.code`. Esto aplica al Rule Loader, Rule Evaluator, y cualquier query interna que compare códigos de estado.

**Corrección definitiva** (fuera del alcance del módulo):
1. Auditar todas las dependencias del código `' DISCHARGED'` (Edge Functions, frontend, triggers, RPCs existentes)
2. Una vez confirmado que no hay dependencias frágiles, ejecutar `UPDATE reservation_statuses SET code = 'DISCHARGED' WHERE code = ' DISCHARGED'`
3. Agregar constraint: `ALTER TABLE reservation_statuses ADD CONSTRAINT ck_code_no_spaces CHECK (code = BTRIM(code))`

### 17.2 Modelo canónico warehouse

Toda obtención del warehouse de una reserva DEBE usar:
```
reservations.dock_id → docks.id → docks.warehouse_id → warehouses.id
```

No existe `reservations.warehouse_id`. El `SELECT FOR UPDATE` en la RPC debe incluir `LEFT JOIN docks`. La variable interna se llama `resolved_warehouse_id`. Si `docks.warehouse_id IS NULL`, solo aplican reglas de organización.