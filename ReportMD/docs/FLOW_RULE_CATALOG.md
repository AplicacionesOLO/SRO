# FLOW_RULE_CATALOG.md — Catálogo Funcional de Reglas IN/OUT

> **Versión**: 1.1 | **Fecha**: 2026-07-24  
> **Estado**: Diseño aprobado — Pendiente implementación  
> **Propósito**: Documento funcional para QA, soporte, capacitación y documentación de usuario.  
> **Dependencias**: `RULE_ENGINE_ARCHITECTURE.md`, `STATE_MACHINE_SPEC.md`, `DATA_MODEL_ALIGNMENT.md`

---

## Cómo leer este catálogo

Cada regla se presenta en un formato uniforme con:

| Campo | Significado |
|---|---|
| **Código** | Identificador único de la regla |
| **Nombre** | Nombre descriptivo legible |
| **Objetivo** | Qué problema operativo resuelve esta regla |
| **Caso correcto** | Ejemplo de operación que NO dispara la regla |
| **Caso incorrecto** | Ejemplo de operación que SÍ dispara la regla |
| **Mensaje al usuario** | Qué ve el operador en pantalla cuando la regla se dispara |
| **Severidad** | Nivel de criticidad: `informativa`, `baja`, `media`, `alta`, `critica` |
| **Modo** | `observe` (solo registra), `warn` (pide confirmación), `block` (impide sin override) |
| **Override** | Si un administrador puede omitir la regla |
| **Quién override** | Qué rol o permiso se requiere para omitirla |
| **Notificación** | Si se envía correo y con qué frecuencia |
| **Captura esperada** | Descripción de la evidencia que debería existir |

---

## R01 — STATUS_WITHOUT_GATE_IN

| Campo | Valor |
|---|---|
| **Código** | `STATUS_WITHOUT_GATE_IN` |
| **Nombre** | Cambio a estado operativo sin ingreso por casetilla |
| **Objetivo** | No permitir que una cita avance a estados operativos (ARRIVED_PENDING_UNLOAD, IN_PROGRESS, PENDING_DISCHARGE, START, UNLOADING, DISCHARGED) sin que el vehículo haya sido registrado físicamente en la casetilla de ingreso. |
| **Caso correcto** | `CONFIRMED → [Gate IN en casetilla] → ARRIVED_PENDING_UNLOAD → IN_PROGRESS → ...` |
| **Caso incorrecto** | `CONFIRMED → IN_PROGRESS` (el operador cambió el estado sin registrar ingreso) |
| **Mensaje al usuario** | "La cita no posee registro de ingreso por casetilla. Debe registrar el ingreso del vehículo antes de cambiar el estado operativo." |
| **Severidad** | `alta` |
| **Modo** | `block` |
| **Override** | Sí |
| **Quién override** | Full Access con permiso `casetilla.flow_report.incidents.override` |
| **Notificación** | `none` |
| **Captura esperada** | Registro en `casetilla_ingresos` con `reservation_id`, placa, foto del vehículo, timestamp de ingreso |

---

## R02 — GATE_OUT_WITHOUT_GATE_IN

| Campo | Valor |
|---|---|
| **Código** | `GATE_OUT_WITHOUT_GATE_IN` |
| **Nombre** | Salida por casetilla sin ingreso previo |
| **Objetivo** | Detectar y bloquear el registro de salida de un vehículo que nunca fue registrado como ingresado. Es una imposibilidad lógica: no puede salir quien nunca entró. |
| **Caso correcto** | `[Gate IN] → ...operación... → [Gate OUT]` |
| **Caso incorrecto** | `[Gate OUT]` sin que exista un registro de `[Gate IN]` previo para la misma cita |
| **Mensaje al usuario** | "No se puede registrar la salida. Esta cita no tiene un ingreso registrado en casetilla. Verifique la cita o registre primero el ingreso." |
| **Severidad** | `critica` |
| **Modo** | `block` |
| **Override** | Sí |
| **Quién override** | Full Access con permiso `casetilla.flow_report.incidents.override` |
| **Notificación** | `immediate` — se envía correo inmediato porque es una inconsistencia gravísima |
| **Captura esperada** | Registro en `casetilla_ingresos` vs ausencia del mismo. Registro de `casetilla_salidas` que intentó crearse. |

---

## R03 — DISPATCHED_WITHOUT_GATE_OUT

| Campo | Valor |
|---|---|
| **Código** | `DISPATCHED_WITHOUT_GATE_OUT` |
| **Nombre** | Cambio a DISPATCHED sin salida por casetilla |
| **Objetivo** | No permitir que una cita se marque como despachada sin que el vehículo haya sido registrado saliendo por la casetilla. DISPATCHED implica que el vehículo ya no está en el almacén. |
| **Caso correcto** | `DISCHARGED → [Gate OUT en casetilla] → DISPATCHED → DONE` |
| **Caso incorrecto** | `DISCHARGED → DISPATCHED` (un operador marcó despachado sin registrar la salida) |
| **Mensaje al usuario** | "La cita no posee registro de salida por casetilla. Debe registrar la salida del vehículo antes de cambiar a DESPACHADO." |
| **Severidad** | `alta` |
| **Modo** | `block` |
| **Override** | Sí |
| **Quién override** | Full Access con permiso `casetilla.flow_report.incidents.override` |
| **Notificación** | `none` |
| **Captura esperada** | Registro en `casetilla_salidas` con `reservation_id`, placa, timestamp de salida |

---

## R04 — DONE_WITHOUT_GATE_OUT

| Campo | Valor |
|---|---|
| **Código** | `DONE_WITHOUT_GATE_OUT` |
| **Nombre** | Cambio a DONE sin salida por casetilla |
| **Objetivo** | Advertir cuando una cita llega a su estado final (DONE) sin que el vehículo haya sido registrado saliendo. Es menos restrictivo que DISPATCHED_WITHOUT_GATE_OUT porque DONE puede ser un cierre administrativo. |
| **Caso correcto** | `DISPATCHED → DONE` (con gate_out registrado) |
| **Caso incorrecto** | `DISPATCHED → DONE` (sin gate_out registrado — cierre administrativo sin evidencia física) |
| **Mensaje al usuario** | "La cita se está cerrando sin registro de salida por casetilla. ¿Confirma que desea marcarla como COMPLETADA sin evidencia de salida?" |
| **Severidad** | `alta` |
| **Modo** | `warn` |
| **Override** | No aplica — es warn, no block. El usuario confirma normalmente. |
| **Quién override** | Cualquier usuario con permiso de cambiar estado (confirma la advertencia) |
| **Notificación** | `none` |
| **Captura esperada** | Registro en `casetilla_salidas`. Si no existe, la confirmación del warning queda registrada en `inout_state_transition_attempts`. |

---

## R05 — DUPLICATE_GATE_IN

| Campo | Valor |
|---|---|
| **Código** | `DUPLICATE_GATE_IN` |
| **Nombre** | Ingreso duplicado por casetilla |
| **Objetivo** | Detectar cuando se registra más de un ingreso para la misma cita. Normalmente cada cita tiene un solo ingreso físico. |
| **Caso correcto** | `[Gate IN]` — un solo registro por cita |
| **Caso incorrecto** | `[Gate IN #1] → [Gate IN #2]` — mismo `reservation_id`, dos registros de ingreso |
| **Mensaje al usuario** | "Esta cita ya posee un registro de ingreso previo. Se ha creado una incidencia de observación." |
| **Severidad** | `media` |
| **Modo** | `observe` |
| **Override** | No aplica — no bloquea la operación |
| **Quién override** | — |
| **Notificación** | `none` |
| **Captura esperada** | Ambos registros de `casetilla_ingresos` con timestamps, placas y fotos |

---

## R06 — DUPLICATE_GATE_OUT

| Campo | Valor |
|---|---|
| **Código** | `DUPLICATE_GATE_OUT` |
| **Nombre** | Salida duplicada por casetilla |
| **Objetivo** | Detectar cuando se registra más de una salida para la misma cita. |
| **Caso correcto** | `[Gate OUT]` — un solo registro por cita |
| **Caso incorrecto** | `[Gate OUT #1] → [Gate OUT #2]` — mismo `reservation_id`, dos registros de salida |
| **Mensaje al usuario** | "Esta cita ya posee un registro de salida previo. Se ha creado una incidencia de observación." |
| **Severidad** | `media` |
| **Modo** | `observe` |
| **Override** | No aplica — no bloquea la operación |
| **Quién override** | — |
| **Notificación** | `none` |
| **Captura esperada** | Ambos registros de `casetilla_salidas` con timestamps, placas y fotos |

---

## R07 — GATE_OUT_BEFORE_GATE_IN

| Campo | Valor |
|---|---|
| **Código** | `GATE_OUT_BEFORE_GATE_IN` |
| **Nombre** | Salida con timestamp anterior al ingreso |
| **Objetivo** | Detectar y bloquear situaciones donde el registro de salida tiene una fecha/hora anterior al registro de ingreso. Es una inconsistencia temporal: no se puede salir antes de entrar. |
| **Caso correcto** | `[Gate IN] 10:00 → [Gate OUT] 14:30` |
| **Caso incorrecto** | `[Gate IN] 10:00 → [Gate OUT] 09:45` (la salida se registró con hora anterior al ingreso) |
| **Mensaje al usuario** | "Inconsistencia temporal detectada. La hora de salida registrada es anterior a la hora de ingreso. Verifique los datos e intente nuevamente." |
| **Severidad** | `critica` |
| **Modo** | `block` |
| **Override** | Sí |
| **Quién override** | Full Access con permiso `casetilla.flow_report.incidents.override` |
| **Notificación** | `immediate` — se envía correo inmediato |
| **Captura esperada** | Ambos registros con timestamps. Verificación de que los relojes de casetilla estén sincronizados. |

---

## R08 — STATUS_BEFORE_GATE_IN

| Campo | Valor |
|---|---|
| **Código** | `STATUS_BEFORE_GATE_IN` |
| **Nombre** | Cambio de estado operativo antes del ingreso por casetilla |
| **Objetivo** | Detectar casos donde el `activity_log` muestra un cambio de estado operativo con timestamp anterior al registro de ingreso en casetilla. |
| **Caso correcto** | `[Gate IN] 10:00 → [Cambio a IN_PROGRESS] 10:15` |
| **Caso incorrecto** | `[Cambio a IN_PROGRESS] 09:50 → [Gate IN] 10:00` (el estado cambió antes de que el vehículo ingresara) |
| **Mensaje al usuario** | "Se detectó un cambio de estado operativo con timestamp anterior al ingreso por casetilla. Se ha registrado la incidencia." |
| **Severidad** | `media` |
| **Modo** | `observe` |
| **Override** | No aplica — no bloquea la operación |
| **Quién override** | — |
| **Notificación** | `none` |
| **Captura esperada** | Registro de `activity_log` + registro de `casetilla_ingresos` con timestamps |

---

## R09 — INVALID_STATUS_TRANSITION

| Campo | Valor |
|---|---|
| **Código** | `INVALID_STATUS_TRANSITION` |
| **Nombre** | Transición de estado no permitida |
| **Objetivo** | Bloquear cualquier cambio de estado que no esté en la matriz de transiciones permitidas (ver `STATE_MACHINE_SPEC.md`). Actúa como red de seguridad para transiciones no contempladas por reglas más específicas. |
| **Caso correcto** | `CONFIRMED → ARRIVED_PENDING_UNLOAD` (transición válida) |
| **Caso incorrecto** | `ARRIVED_PENDING_UNLOAD → DISPATCHED` (se saltó todo el flujo operativo) |
| **Mensaje al usuario** | "Transición no permitida: no se puede cambiar de [estado_actual] a [estado_solicitado]. Consulte la matriz de estados permitidos." |
| **Severidad** | `alta` |
| **Modo** | `block` |
| **Override** | Sí |
| **Quién override** | Full Access con permiso `casetilla.flow_report.incidents.override` |
| **Notificación** | `none` |
| **Captura esperada** | Matriz de transiciones en `STATE_MACHINE_SPEC.md` |

---

## R10 — DISPATCHED_REOPEN_ATTEMPT

| Campo | Valor |
|---|---|
| **Código** | `DISPATCHED_REOPEN_ATTEMPT` |
| **Nombre** | Intento de reabrir una cita despachada |
| **Objetivo** | DISPATCHED es un estado semiterminal: la única transición normal permitida es hacia DONE. Cualquier intento de retroceder (ej: volver a DISCHARGED o IN_PROGRESS) debe bloquearse. |
| **Caso correcto** | `DISPATCHED → DONE` (única transición normal desde DISPATCHED) |
| **Caso incorrecto** | `DISPATCHED → DISCHARGED` (intento de retroceso — el vehículo ya salió) |
| **Mensaje al usuario** | "No se puede modificar una cita en estado DESPACHADO. La cita ya registró salida. Si requiere revertir, solicite un override administrativo." |
| **Severidad** | `alta` |
| **Modo** | `block` |
| **Override** | Sí |
| **Quién override** | Full Access con permiso `casetilla.flow_report.incidents.override` |
| **Notificación** | `immediate` |
| **Captura esperada** | Registro de `casetilla_salidas`, estado actual DISPATCHED, intento de transición bloqueado en `inout_state_transition_attempts` |

---

## R11 — DONE_REOPEN_ATTEMPT

| Campo | Valor |
|---|---|
| **Código** | `DONE_REOPEN_ATTEMPT` |
| **Nombre** | Intento de modificar una cita completada |
| **Objetivo** | DONE es un estado terminal absoluto. Cualquier intento de cambiar el estado de una cita completada debe bloquearse completamente. Es la protección más fuerte del sistema. |
| **Caso correcto** | `DONE` — la cita permanece en DONE para siempre |
| **Caso incorrecto** | `DONE → DISPATCHED` o cualquier otro cambio desde DONE |
| **Mensaje al usuario** | "No se puede modificar una cita COMPLETADA. El ciclo de vida de esta cita ha finalizado. Si es estrictamente necesario, solicite un override administrativo con justificación." |
| **Severidad** | `alta` |
| **Modo** | `block` |
| **Override** | Sí (con restricciones máximas) |
| **Quién override** | Full Access con permiso `casetilla.flow_report.incidents.override`. Requiere justificación detallada y evidencia. |
| **Notificación** | `immediate` |
| **Captura esperada** | Estado DONE confirmado. Cualquier override desde DONE genera incidencia `administrative_override` con severidad alta y notificación inmediata. |

---

## R12 — ACTIVITY_AFTER_CANCELLED

| Campo | Valor |
|---|---|
| **Código** | `ACTIVITY_AFTER_CANCELLED` |
| **Nombre** | Actividad posterior a la cancelación |
| **Objetivo** | Detectar eventos (ingresos, cambios de estado) que ocurren después de que una cita fue cancelada. La cita cancelada no debería tener actividad operativa. |
| **Caso correcto** | `CANCELLED` — sin actividad posterior |
| **Caso incorrecto** | `CANCELLED → [Gate IN]` (alguien registró ingreso de una cita cancelada) |
| **Mensaje al usuario** | "Se detectó actividad en una cita cancelada. Revise si la cancelación fue correcta o si el evento es legítimo." |
| **Severidad** | `media` |
| **Modo** | `observe` |
| **Override** | No aplica — no bloquea la operación |
| **Quién override** | — |
| **Notificación** | `daily` |
| **Captura esperada** | Registro de cancelación (`is_cancelled = true`) + evento posterior (casetilla o activity_log) |

---

## R13 — ACTIVITY_AFTER_NO_SHOW

| Campo | Valor |
|---|---|
| **Código** | `ACTIVITY_AFTER_NO_SHOW` |
| **Nombre** | Actividad posterior a No-Show |
| **Objetivo** | Advertir cuando se intenta cambiar el estado de una cita marcada como NO_SHOW. Puede ser legítimo (el vehículo llegó tarde) o un error (la cita se marcó como no-show por equivocación). |
| **Caso correcto** | `NO_SHOW` — permanece así |
| **Caso incorrecto** | `NO_SHOW → ARRIVED_PENDING_UNLOAD` (el vehículo llegó tarde — requiere confirmación) |
| **Mensaje al usuario** | "Esta cita fue marcada como NO SHOW. ¿Confirma que el vehículo se presentó tarde y desea revertir el estado?" |
| **Severidad** | `media` |
| **Modo** | `warn` |
| **Override** | No aplica — es warn, no block |
| **Quién override** | Operador con permiso de cambiar estado (confirma la advertencia) |
| **Notificación** | `none` |
| **Captura esperada** | Registro de `auto-mark-no-show` + nuevo registro de casetilla o cambio de estado manual |

---

## R14 — WAREHOUSE_MISMATCH

| Campo | Valor |
|---|---|
| **Código** | `WAREHOUSE_MISMATCH` |
| **Nombre** | Evento en almacén diferente al de la cita |
| **Objetivo** | Detectar cuando un evento de casetilla (ingreso o salida) se registra en un almacén diferente al que tiene asignado la cita. Puede indicar error de asignación o un vehículo en el lugar equivocado. |
| **Caso correcto** | Cita en Almacén Norte → Gate IN en Almacén Norte |
| **Caso incorrecto** | Cita en Almacén Norte → Gate IN en Almacén Sur |
| **Mensaje al usuario** | "El evento se registró en un almacén diferente al de la cita. Verifique la asignación." |
| **Severidad** | `media` |
| **Modo** | `observe` |
| **Override** | No aplica — no bloquea la operación |
| **Quién override** | — |
| **Notificación** | `daily` |
| **Captura esperada** | El warehouse de la cita se resuelve mediante `reservations.dock_id → docks.id → docks.warehouse_id`. El motor compara este warehouse resuelto contra el `warehouse_id` del registro de casetilla. |

> **Nota técnica**: El warehouse de la reserva NO es una columna directa. Ver `DATA_MODEL_ALIGNMENT.md` §1.2.

---

## R15 — TEMPORAL_INCONSISTENCY

| Campo | Valor |
|---|---|
| **Código** | `TEMPORAL_INCONSISTENCY` |
| **Nombre** | Inconsistencia temporal entre eventos |
| **Objetivo** | Detectar cualquier par de eventos donde el orden cronológico no coincide con el orden lógico esperado, y que no está cubierto por reglas más específicas (como R07 GATE_OUT_BEFORE_GATE_IN). Actúa como red de seguridad temporal. |
| **Caso correcto** | Evento A (10:00) → Evento B (10:15) — orden cronológico correcto |
| **Caso incorrecto** | Evento A (10:15) → Evento B (10:00) — B ocurrió antes que A cuando debería ser al revés |
| **Mensaje al usuario** | "Se detectó una posible inconsistencia en el orden de los eventos. Se ha registrado para revisión." |
| **Severidad** | `baja` |
| **Modo** | `observe` |
| **Override** | No aplica — no bloquea la operación |
| **Quién override** | — |
| **Notificación** | `weekly` |
| **Captura esperada** | Timestamps de eventos en `casetilla_ingresos`, `casetilla_salidas` y `activity_log`. Se aplica `grace_period_minutes = 5` para tolerar diferencias de reloj. |

---

## R16 — INCOMPLETE_DATA

| Campo | Valor |
|---|---|
| **Código** | `INCOMPLETE_DATA` |
| **Nombre** | Datos incompletos en cita operativa |
| **Objetivo** | Detectar citas que están en estado operativo (ya no son PENDING ni CONFIRMED) pero les faltan campos obligatorios como conductor, placa u orden de compra. |
| **Caso correcto** | Cita en IN_PROGRESS con `driver = "Juan Pérez"`, `truck_plate = "ABC-123"`, `purchase_order = "PO-456"` |
| **Caso incorrecto** | Cita en IN_PROGRESS con `driver = NULL` o `truck_plate = NULL` |
| **Mensaje al usuario** | "La cita se encuentra en estado operativo pero le faltan datos obligatorios: [campos_faltantes]. Complete la información." |
| **Severidad** | `baja` |
| **Modo** | `observe` |
| **Override** | No aplica — no bloquea la operación |
| **Quién override** | — |
| **Notificación** | `weekly` |
| **Captura esperada** | Campos `driver`, `truck_plate`, `purchase_order` en `reservations` |

---

## Resumen visual

| # | Código | Severidad | Modo | Override | Notificación |
|---|---|---|---|---|---|
| R01 | `STATUS_WITHOUT_GATE_IN` | Alta | Block | Sí (Full Access) | — |
| R02 | `GATE_OUT_WITHOUT_GATE_IN` | Crítica | Block | Sí (Full Access) | Inmediato |
| R03 | `DISPATCHED_WITHOUT_GATE_OUT` | Alta | Block | Sí (Full Access) | — |
| R04 | `DONE_WITHOUT_GATE_OUT` | Alta | Warn | No (confirmación) | — |
| R05 | `DUPLICATE_GATE_IN` | Media | Observe | — | — |
| R06 | `DUPLICATE_GATE_OUT` | Media | Observe | — | — |
| R07 | `GATE_OUT_BEFORE_GATE_IN` | Crítica | Block | Sí (Full Access) | Inmediato |
| R08 | `STATUS_BEFORE_GATE_IN` | Media | Observe | — | — |
| R09 | `INVALID_STATUS_TRANSITION` | Alta | Block | Sí (Full Access) | — |
| R10 | `DISPATCHED_REOPEN_ATTEMPT` | Alta | Block | Sí (Full Access) | Inmediato |
| R11 | `DONE_REOPEN_ATTEMPT` | Alta | Block | Sí (Full Access) | Inmediato |
| R12 | `ACTIVITY_AFTER_CANCELLED` | Media | Observe | — | Diario |
| R13 | `ACTIVITY_AFTER_NO_SHOW` | Media | Warn | No (confirmación) | — |
| R14 | `WAREHOUSE_MISMATCH` | Media | Observe | — | Diario |
| R15 | `TEMPORAL_INCONSISTENCY` | Baja | Observe | — | Semanal |
| R16 | `INCOMPLETE_DATA` | Baja | Observe | — | Semanal |

---

## Flujo de decisión para el operador

```
¿La operación que intentas está bloqueada?

  ├── SÍ → ¿Eres Full Access?
  │         ├── SÍ → ¿Tienes permiso casetilla.flow_report.incidents.override?
  │         │         ├── SÍ → Completa la justificación (mín 20 caracteres)
  │         │         │        y ejecuta el override. Quedará registrado.
  │         │         └── NO → Contacta a un administrador.
  │         └── NO → Contacta a un administrador con permiso de override.
  │
  ├── SÍ (pero es WARN) → Lee la advertencia.
  │                        ¿Es correcto continuar?
  │                        ├── SÍ → Confirma. La acción se registra.
  │                        └── NO → Cancela. La incidencia queda para revisión.
  │
  └── NO (es OBSERVE) → La operación continúa normalmente.
                         Se generó una incidencia para revisión posterior.
```

---

## Preguntas frecuentes (para soporte)

**P: ¿Por qué no puedo cambiar una cita de DISPATCHED a DISCHARGED?**
R: DISPATCHED es un estado semiterminal. El vehículo ya registró salida. Solo puede avanzar a DONE. Si realmente necesita revertir, solicite un override administrativo.

**P: ¿Qué diferencia hay entre WARN y BLOCK?**
R: WARN te pide confirmar que estás seguro. BLOCK te impide continuar a menos que un administrador con permiso especial lo autorice.

**P: ¿Por qué recibo un correo inmediato por algunas incidencias?**
R: Solo las incidencias con severidad CRÍTICA y modo BLOCK generan notificación inmediata. Son situaciones que requieren atención urgente.

**P: ¿Puedo desactivar una regla que me está molestando?**
R: Las reglas del sistema (`is_system_rule = true`) no se pueden desactivar. Las reglas configurables sí, contacta a tu administrador.

**P: ¿Qué pasa si dos operadores intentan modificar la misma cita al mismo tiempo?**
R: El sistema procesa una solicitud a la vez. El segundo operador recibirá un mensaje de "La cita fue modificada por otro usuario".

---

## Notas técnicas

### Warehouse de la reserva

El warehouse de una reserva no es una columna directa en la tabla `reservations`. Se resuelve mediante:

```
reservations.dock_id → docks.id → docks.warehouse_id
```

El Rule Engine obtiene el `resolved_warehouse_id` durante el `SELECT FOR UPDATE` con `LEFT JOIN docks`. Las reglas que filtran por `warehouse_id` en `inout_flow_rules` usan este valor resuelto. Ver `DATA_MODEL_ALIGNMENT.md` para el modelo canónico completo.

### `DISCHARGED` con espacio inicial

El código real en `reservation_statuses` es `' DISCHARGED'` (con espacio inicial). El Rule Engine aplica `BTRIM(code)` en todas las comparaciones internas para evitar falsos negativos. La normalización definitiva del catálogo requiere una auditoría previa de dependencias.