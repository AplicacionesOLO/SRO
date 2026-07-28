# STATE_MACHINE_SPEC.md — Máquina de Estados de Reservas

> **Versión**: 1.0 | **Fecha**: 2026-07-24  
> **Estado**: Diseño aprobado — Pendiente implementación  
> **Dependencia**: `RULE_ENGINE_ARCHITECTURE.md` para el motor de reglas que valida estas transiciones  
> **Fuente**: Código real (`createIngreso`, `createSalida`, `ReservationModal`, `reservation_statuses`)

---

## 1. Estados del Sistema

### 1.1 Catálogo completo de estados

La tabla `reservation_statuses` define los siguientes códigos de estado operativo:

| # | Código | Clasificación | Significado |
|---|---|---|---|
| 1 | `PENDING` | No terminal | Reserva creada, pendiente de confirmación |
| 2 | `CONFIRMED` | No terminal | Reserva confirmada, esperando ingreso |
| 3 | `ARRIVED_PENDING_UNLOAD` | No terminal | Vehículo ingresó por casetilla, esperando descarga |
| 4 | `IN_PROGRESS` | No terminal | Operación en progreso |
| 5 | `PENDING_DISCHARGE` | No terminal | Pendiente de descarga |
| 6 | `START` | No terminal | Inicio de operación |
| 7 | `UNLOADING` | No terminal | Descargando |
| 8 | `DISCHARGED` | No terminal | Descarga completada |
| 9 | `DISPATCHED` | **Semiterminal** | Vehículo salió por casetilla. Solo puede avanzar a DONE. |
| 10 | `DONE` | **Terminal absoluto** | Ciclo de vida completado. Fin. |
| 11 | `CANCELLED` | **Terminal** | Cancelada. `is_cancelled = true`. |
| 12 | `NO_SHOW` | **Terminal corregible** | No se presentó. Reversible por llegada tardía con override. |

### 1.2 Clasificación formal

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  NO TERMINALES (8)                                               │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────────┐         │
│  │ PENDING  │   │CONFIRMED │   │ARRIVED_PENDING_UNLOAD│         │
│  └────┬─────┘   └────┬─────┘   └──────────┬───────────┘         │
│       │              │                    │                      │
│  ┌────┴─────┐   ┌────┴─────┐   ┌──────────┴───────────┐         │
│  │IN_PROGRESS│   │PENDING_  │   │       START          │         │
│  └────┬─────┘   │DISCHARGE │   └──────────┬───────────┘         │
│       │         └────┬─────┘              │                      │
│  ┌────┴─────┐        │         ┌──────────┴───────────┐         │
│  │UNLOADING │        │         │     DISCHARGED       │         │
│  └────┬─────┘        │         └──────────┬───────────┘         │
│       │              │                    │                      │
│                                                                  │
│  SEMITERMINAL (1)                                                │
│  ┌──────────────┐                                                │
│  │  DISPATCHED  │ ← Solo puede ir a DONE                         │
│  └──────┬───────┘                                                │
│         │                                                        │
│  TERMINALES (3)                                                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐                     │
│  │   DONE   │   │CANCELLED │   │ NO_SHOW  │                     │
│  │ ABSOLUTO │   │          │   │CORREGIBLE│                     │
│  └──────────┘   └──────────┘   └──────────┘                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Matriz de Transiciones

### 2.1 Transiciones permitidas

Cada celda `✓` indica que la transición desde el estado fila al estado columna está permitida sin restricciones.

```
DESDE ↓ / HACIA →   PEN  CON  APU  INP  PDI  STA  UNL  DIS  DSP  DON  CAN  NSH
PENDING              —    ✓    —    —    —    —    —    —    —    —    ✓    —
CONFIRMED            —    —    ✓    —    —    —    —    —    —    —    ✓    —
ARRIVED_PENDING_     —    —    —    ✓    —    —    —    —    —    —    ✓    —
IN_PROGRESS          —    —    —    —    ✓    —    —    —    —    —    ✓    —
PENDING_DISCHARGE    —    —    —    —    —    ✓    —    —    —    —    ✓    —
START                —    —    —    —    —    —    ✓    —    —    —    ✓    —
UNLOADING            —    —    —    —    —    —    —    ✓    —    —    ✓    —
DISCHARGED           —    —    —    —    —    —    —    —    ✓    ✓    ✓    —
DISPATCHED           —    —    —    —    —    —    —    —    —    ✓    —    —
DONE                 —    —    —    —    —    —    —    —    —    —    —    —
CANCELLED            —    —    —    —    —    —    —    —    —    —    —    —
NO_SHOW              —    —    —    —    —    —    —    —    —    —    —    —
```

**Leyenda:** PEN=PENDING, CON=CONFIRMED, APU=ARRIVED_PENDING_UNLOAD, INP=IN_PROGRESS, PDI=PENDING_DISCHARGE, STA=START, UNL=UNLOADING, DIS=DISCHARGED, DSP=DISPATCHED, DON=DONE, CAN=CANCELLED, NSH=NO_SHOW

### 2.2 Transiciones con override administrativo

Estas transiciones normalmente están prohibidas pero pueden ejecutarse con override explícito por Full Access:

```
DESDE ↓ / HACIA →   PEN  CON  APU  INP  PDI  STA  UNL  DIS  DSP  DON  CAN  NSH
DISPATCHED           —    —    ◈    ◈    ◈    ◈    ◈    ◈    —    ✓    —    —
DONE                 ◈    ◈    ◈    ◈    ◈    ◈    ◈    ◈    ◈    —    —    —
CANCELLED            ◈    ◈    ◈    ◈    ◈    ◈    ◈    ◈    ◈    ◈    —    —
NO_SHOW              —    —    ◈    ◈    ◈    ◈    ◈    ◈    —    —    —    —
```

`◈` = Requiere override administrativo (Full Access + justificación + incidencia `administrative_override`)
`✓` = Permitido sin restricciones (DISPATCHED → DONE es la única transición normal desde semiterminal)
`—` = Sin definición (no aplica)

### 2.3 Transiciones prohibidas (siempre bloqueadas)

Toda transición no listada en 2.1 o 2.2 está **prohibida** y será bloqueada por la regla `INVALID_STATUS_TRANSITION`. Ejemplos notables:

| Desde | Hacia | Razón del bloqueo |
|---|---|---|
| `DISPATCHED` | `IN_PROGRESS` | Semiterminal, solo DONE |
| `DISPATCHED` | `DISCHARGED` | No se puede retroceder |
| `DONE` | Cualquiera | Terminal absoluto |
| `CANCELLED` | Cualquiera (sin override) | Terminal |
| `NO_SHOW` | Cualquiera (sin override) | Terminal corregible |
| `ARRIVED_PENDING_UNLOAD` | `DISPATCHED` | Se saltó todo el flujo operativo |
| `PENDING` | `DISPATCHED` | Se saltó ingreso + operación |

---

## 3. Diagramas de Flujo

### 3.1 Flujo principal (ciclo completo normal)

```
┌──────────┐     ┌──────────┐     ┌──────────────────────┐
│ PENDING  │────▶│CONFIRMED │────▶│ARRIVED_PENDING_UNLOAD│
└──────────┘     └──────────┘     └──────────┬───────────┘
                            ┌────────────────┤
                            │ createIngreso()
                            │ setea ARRIVED_PENDING_UNLOAD
                            ▼
                    ┌──────────────┐
                    │ IN_PROGRESS  │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────────┐
                    │PENDING_DISCHARGE │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────┐
                    │  START   │
                    └────┬─────┘
                         │
                         ▼
                    ┌───────────┐
                    │ UNLOADING │
                    └─────┬─────┘
                          │
                          ▼
                    ┌─────────────┐
                    │ DISCHARGED  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │ createSalida()          │
              │ setea DISPATCHED        │
              ▼                         ▼
       ┌──────────────┐          ┌──────────┐
       │  DISPATCHED  │─────────▶│   DONE   │
       │ (semiterminal)│  único   │(terminal)│
       └──────────────┘  avance  └──────────┘
```

### 3.2 Puntos de cancelación

```
Desde cualquier estado NO terminal:

PENDING ──────────┐
CONFIRMED ────────┤
ARRIVED_PENDING_  ─┤
IN_PROGRESS ──────┼──▶ CANCELLED (is_cancelled = true)
PENDING_DISCHARGE ─┤
START ────────────┤
UNLOADING ────────┤
DISCHARGED ───────┘
```

### 3.3 Flujo con No-Show y reversión

```
┌──────────┐     ┌──────────┐
│ PENDING  │────▶│CONFIRMED │
└──────────┘     └────┬─────┘
                       │
          ┌────────────┼────────────┐
          │ El vehículo │            │ El vehículo
          │ NO llega    │            │ SÍ llega
          ▼             │            │
   ┌──────────┐         │            │
   │ NO_SHOW  │         │            ▼
   │(terminal │         │    ┌──────────────────────┐
   │corregible│         │    │ARRIVED_PENDING_UNLOAD│
   └────┬─────┘         │    └──────────────────────┘
        │               │
        │ Llegada tardía│
        │ con override  │
        │ administrativo│
        ▼               │
   ┌──────────────────────┐
   │ARRIVED_PENDING_UNLOAD│
   └──────────────────────┘
```

### 3.4 Flujo: DISPATCHED → intento de retroceso

```
┌──────────────┐
│  DISPATCHED  │
└──────┬───────┘
       │
       ├──▶ DONE ─────────────────────── ✓ Permitido
       │
       ├──▶ DISCHARGED ───────────────── ✗ BLOQUEADO
       │    Regla: DISPATCHED_REOPEN_ATTEMPT
       │    Modo: block
       │    └──▶ ¿Override admin?
       │         ├── Sí → allowed_by_override + incidencia administrativa
       │         └── No → blocked (sin modificar status)
       │
       └──▶ Cualquier otro estado ────── ✗ BLOQUEADO
            Regla: INVALID_STATUS_TRANSITION
            Modo: block
```

### 3.5 Flujo: DONE → intento de cambio

```
┌──────────┐
│   DONE   │ (terminal absoluto)
└────┬─────┘
     │
     └──▶ Cualquier intento de cambio ── ✗ BLOQUEADO
          Regla: DONE_REOPEN_ATTEMPT
          Modo: block
          └──▶ ¿Override admin?
               ├── Sí → allowed_by_override + incidencia administrativa
               │        + notificación immediate
               └── No → blocked (sin modificar status)
```

---

## 4. Overrides Administrativos

### 4.1 Condiciones para ejecutar un override

| Condición | Requisito |
|---|---|
| Rol | Full Access (admin, superadmin, full_access) |
| Permiso | `casetilla.flow_report.incidents.override` |
| Justificación | Obligatoria, mínimo 20 caracteres |
| Evidencia | Opcional (upload de archivo) |
| Auditoría | Se crea incidencia `administrative_override` con severidad `alta` |
| Registro | `inout_state_transition_attempts` con `override_requested=true`, `override_authorized=true` |
| Notificación | Inmediata si `notification_mode = 'immediate'` |

### 4.2 Matriz de overrides por estado

| Estado | ¿Override permitido? | Condiciones adicionales |
|---|---|---|
| `DISPATCHED` | ✅ Sí | Solo para retroceder a estado anterior. Requiere justificación. |
| `DONE` | ⚠️ Pendiente confirmación | Propuesto: sí, con justificación + evidencia + doble autorización |
| `CANCELLED` | ⚠️ Pendiente confirmación | Implica `is_cancelled = false` + nuevo estado |
| `NO_SHOW` | ✅ Sí | Llegada tardía. Cambia a `ARRIVED_PENDING_UNLOAD`. |
| Resto | No aplica | Los estados no-terminales no requieren override |

### 4.3 Flujo de override en UI

```
1. Admin intenta transición bloqueada (ej: DISPATCHED → DISCHARGED)
2. Frontend: ¿es transición bloqueada? → Sí
3. Frontend: ¿tiene permiso casetilla.flow_report.incidents.override? 
   → No: mostrar error
   → Sí: mostrar modal de OVERRIDE
4. Modal:
   ┌─────────────────────────────────────────┐
   │  ⚠️ Override Administrativo              │
   │                                         │
   │  Transición: DISPATCHED → DISCHARGED     │
   │  Bloqueada por: DISPATCHED_REOPEN_ATTEMPT│
   │                                         │
   │  Motivo (obligatorio, mín 20 chars):     │
   │  ┌─────────────────────────────────────┐│
   │  │                                     ││
   │  └─────────────────────────────────────┘│
   │                                         │
   │  Evidencia (opcional): [Seleccionar]     │
   │                                         │
   │  [Cancelar]  [Confirmar Override]        │
   └─────────────────────────────────────────┘
5. Admin completa motivo y confirma
6. RPC: transition_reservation_status(override_block=true, justification)
7. RPC: INSERT attempt (allowed_by_override) + incident + UPDATE status
8. UI: toast "Transición aplicada con override. Incidencia #INC-XXX creada."
```

---

## 5. Reglas Asociadas por Transición

### 5.1 Reglas que se evalúan en cada punto

| Trigger | Reglas evaluadas |
|---|---|
| **Cambio a estado operativo** (APU, INP, PDI, STA, UNL, DIS) | `STATUS_WITHOUT_GATE_IN`, `STATUS_BEFORE_GATE_IN`, `INVALID_STATUS_TRANSITION`, `INCOMPLETE_DATA` |
| **Cambio a DISPATCHED** | `DISPATCHED_WITHOUT_GATE_OUT`, `INVALID_STATUS_TRANSITION`, `DISPATCHED_REOPEN_ATTEMPT` (si viene de estado ≠ DISCHARGED) |
| **Cambio a DONE** | `DONE_WITHOUT_GATE_OUT`, `INVALID_STATUS_TRANSITION`, `DONE_REOPEN_ATTEMPT` |
| **Cambio a CANCELLED** | `INVALID_STATUS_TRANSITION` |
| **Cambio desde NO_SHOW** | `ACTIVITY_AFTER_NO_SHOW` |
| **Ingreso por casetilla** | `DUPLICATE_GATE_IN`, `WAREHOUSE_MISMATCH` |
| **Salida por casetilla** | `GATE_OUT_WITHOUT_GATE_IN`, `DUPLICATE_GATE_OUT`, `GATE_OUT_BEFORE_GATE_IN`, `WAREHOUSE_MISMATCH` |
| **Schedule (cron)** | `TEMPORAL_INCONSISTENCY`, `INCOMPLETE_DATA`, `ACTIVITY_AFTER_CANCELLED` |

### 5.2 Relación regla ↔ estado

| Regla | Estados donde aplica |
|---|---|
| `STATUS_WITHOUT_GATE_IN` | ARRIVED_PENDING_UNLOAD, IN_PROGRESS, PENDING_DISCHARGE, START, UNLOADING, DISCHARGED |
| `DISPATCHED_WITHOUT_GATE_OUT` | DISPATCHED (cuando viene de estado ≠ DONE) |
| `DONE_WITHOUT_GATE_OUT` | DONE |
| `DISPATCHED_REOPEN_ATTEMPT` | DISPATCHED → cualquier estado ≠ DONE |
| `DONE_REOPEN_ATTEMPT` | DONE → cualquier estado |
| `ACTIVITY_AFTER_CANCELLED` | CANCELLED (detección programada) |
| `ACTIVITY_AFTER_NO_SHOW` | NO_SHOW → cualquier estado operativo |

---

## 6. Severidad por Tipo de Transición

| Tipo de transición | Severidad | Justificación |
|---|---|---|
| Cambio normal dentro del flujo | — | No genera incidencia |
| Cambio a estado operativo sin gate_in | `alta` | Riesgo operativo: vehículo no registró ingreso |
| Cambio a DISPATCHED sin gate_out | `alta` | Riesgo de integridad: salida no registrada |
| Cambio a DONE sin gate_out | `alta` | Riesgo moderado: cierre administrativo sin salida física |
| Intento de retroceso desde DISPATCHED | `alta` | Riesgo alto: semiterminal comprometido |
| Intento de cambio desde DONE | `alta` | Riesgo máximo: terminal absoluto |
| Actividad tras NO_SHOW | `media` | Posible llegada tardía legítima |
| Ingreso/salida duplicados | `media` | Posible error de registro |
| Gate out sin gate in | `crítica` | Imposibilidad lógica: salir sin haber entrado |
| Gate out antes que gate in | `crítica` | Inconsistencia temporal grave |
| Warehouse mismatch | `media` | Vehículo en almacén incorrecto |
| Inconsistencia temporal | `baja` | Posible diferencia de relojes |
| Datos incompletos | `baja` | Campos obligatorios vacíos |

---

## 7. Estados y Eventos Físicos

### 7.1 Correspondencia evento → estado

| Evento físico | Fuente | Estado resultante |
|---|---|---|
| Vehículo ingresa por casetilla | `casetilla_ingresos` + `createIngreso()` | `ARRIVED_PENDING_UNLOAD` |
| Vehículo sale por casetilla | `casetilla_salidas` + `createSalida()` | `DISPATCHED` |

### 7.2 Validaciones en eventos físicos

**En `createIngreso()`:**
- ¿Ya existe `casetilla_ingresos` para esta reserva? → Regla `DUPLICATE_GATE_IN` (observe)
- ¿El warehouse_id de casetilla coincide con `reservations.warehouse_id`? → Regla `WAREHOUSE_MISMATCH` (observe)
- ¿La reserva está en un estado válido para ingreso? → Debe ser CONFIRMED

**En `createSalida()`:**
- ¿Ya existe `casetilla_salidas` para esta reserva? → Regla `DUPLICATE_GATE_OUT` (observe)
- ¿Existe `casetilla_ingresos` previo? → Regla `GATE_OUT_WITHOUT_GATE_IN` (block)
- ¿El timestamp de salida es posterior al de ingreso? → Regla `GATE_OUT_BEFORE_GATE_IN` (block)

---

## 8. Acciones Automáticas por Estado

| Estado | Acción automática | Edge Function |
|---|---|---|
| `PENDING` → `CONFIRMED` | Disparar email de confirmación | `correspondence-process-event` |
| `CONFIRMED` → `NO_SHOW` (por cron) | Marcar como no-show | `auto-mark-no-show` |
| `DISPATCHED` | — | — |
| `DONE` | — | — |
| `CANCELLED` | — | — |

---

## 9. Estados y Permisos

### 9.1 Quién puede cambiar a cada estado

| Estado destino | ¿Quién puede? | Condición |
|---|---|---|
| `ARRIVED_PENDING_UNLOAD` | CASETILLA, OPERADOR, ADMIN | Requiere `createIngreso()` |
| `IN_PROGRESS` | OPERADOR, ADMIN | Desde APU |
| `PENDING_DISCHARGE` | OPERADOR, ADMIN | Desde IN_PROGRESS |
| `START` | OPERADOR, ADMIN | Desde PENDING_DISCHARGE |
| `UNLOADING` | OPERADOR, ADMIN | Desde START |
| `DISCHARGED` | OPERADOR, ADMIN | Desde UNLOADING |
| `DISPATCHED` | CASETILLA, OPERADOR, ADMIN | Requiere `createSalida()` |
| `DONE` | OPERADOR, ADMIN | Desde DISPATCHED |
| `CANCELLED` | ADMIN | Desde cualquier estado no-terminal |
| `NO_SHOW` | Sistema (cron) | `auto-mark-no-show` |

---

## 10. Restricciones de UI

### 10.1 `blocked_status_ids` en `org_settings`

El calendario respeta `blocked_status_ids` de `org_settings`: si una reserva está en un estado de esa lista, **ni siquiera Full Access** puede editarla desde el calendario. Esto es una restricción adicional de UI, no del motor de reglas.

### 10.2 Comportamiento del modal de edición

```
ReservationModal:
  isReadOnly = !!reservation && (!canEditReservation || isStatusBlocked)
  
  Si isReadOnly = true:
    - Todos los campos deshabilitados
    - Selector de estado deshabilitado
    - Botón "Guardar" oculto
  
  Si isReadOnly = false:
    - Campos editables según permisos
    - Selector de estado muestra solo transiciones permitidas
    - Al cambiar estado → se llama a transition_reservation_status()
```

---

## 11. Ciclo de Vida Completo (Línea de Tiempo)

```
T0: Creación
    │
    ▼
PENDING ──────────────────────────────────────────
    │                                               │
    │ (admin confirma)                              │ (admin cancela)
    ▼                                               ▼
CONFIRMED ────────────────────────────         CANCELLED ⛔
    │                                    (terminal)
    │ (vehículo llega)
    │ createIngreso()
    ▼
ARRIVED_PENDING_UNLOAD ─────────────────
    │                                    │
    │ (operador inicia)                  │ (admin cancela)
    ▼                                    ▼
IN_PROGRESS ────────────────         CANCELLED ⛔
    │
    ▼
PENDING_DISCHARGE ───────────
    │                         │
    ▼                         ▼
START ────────────       CANCELLED ⛔
    │
    ▼
UNLOADING ──────────
    │                │
    ▼                ▼
DISCHARGED ──── CANCELLED ⛔
    │
    │ (vehículo sale)
    │ createSalida()
    ▼
DISPATCHED ⛔ (semiterminal)
    │
    │ (único avance posible)
    ▼
DONE ⛔⛔ (terminal absoluto — fin del ciclo)
```

---

## 12. Resumen de Reglas del Sistema por Estado

| Estado | Reglas que lo protegen |
|---|---|
| `ARRIVED_PENDING_UNLOAD` | `STATUS_WITHOUT_GATE_IN` (block) |
| `IN_PROGRESS` | `STATUS_WITHOUT_GATE_IN` (block) |
| `PENDING_DISCHARGE` | `STATUS_WITHOUT_GATE_IN` (block) |
| `START` | `STATUS_WITHOUT_GATE_IN` (block) |
| `UNLOADING` | `STATUS_WITHOUT_GATE_IN` (block) |
| `DISCHARGED` | `STATUS_WITHOUT_GATE_IN` (block) |
| `DISPATCHED` | `DISPATCHED_WITHOUT_GATE_OUT` (block) + `DISPATCHED_REOPEN_ATTEMPT` (block) |
| `DONE` | `DONE_WITHOUT_GATE_OUT` (warn) + `DONE_REOPEN_ATTEMPT` (block) |
| `CANCELLED` | `ACTIVITY_AFTER_CANCELLED` (observe) |
| `NO_SHOW` | `ACTIVITY_AFTER_NO_SHOW` (warn) |

---

## 13. Preguntas de Negocio Pendientes

1. **¿DISPATCHED solo puede avanzar a DONE?** ¿Hay otra transición legítima?
2. **¿DONE puede revertirse por Full Access?** ¿En qué circunstancias?
3. **¿Full Access puede ejecutar override de reglas `block`?**
4. **¿CANCELLED puede reabrirse?** Implica `is_cancelled = false`.
5. **¿NO_SHOW se revierte cuando el vehículo llega tarde?**
6. **¿DONE requiere `casetilla_salidas`?** (Actualmente en modo `warn`)
7. **¿Incidencias históricas: simulación primero?**
8. **¿Reportes por org, almacén o cliente?**
9. **¿Destinatarios externos permitidos en reportes?**
10. **¿Severidades con envío inmediato?** (Propuesta: solo `critica`)
11. **¿Existe `operation_type` en reservations?**
12. **¿Almacenes sin casetilla física?**
13. **¿Horario de envío configurable por usuario?**
14. **¿Doble autorización para overrides?** (Propuesta: no en v1)
15. **¿Falso positivo desactiva regla automáticamente?** (Propuesta: no, solo sugerencia)