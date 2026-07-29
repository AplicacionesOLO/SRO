# PHASE_6_2_REMAINING_STEPS_AND_RISKS.md

## Lista de Pendientes Posteriores a Stages 1, 2, 3

---

**Versión:** 1.0
**Fecha:** 2026-07-29
**Referencia:** PHASE_6_2_TRANSITION_ENGINE_DESIGN.md v2.3.1

---

## LO QUE QUEDA FUERA DE STAGES 1, 2, 3

| # | Pendiente | Dependencia | Riesgo | Módulos afectados | Prueba previa | Rollback posible | Orden |
|---|---|---|---|---|---|---|---|
| 1 | **RPC `transition_reservation_status`** | Stages 1+2+3 completados | ALTO — motor central de transiciones | IN/OUT Flow, todas las transiciones de estado | 46 pruebas funcionales + 10 integración | DROP FUNCTION | 4 |
| 2 | **Pruebas funcionales con datos** | RPC desplegado en QA | MEDIO — validación de comportamiento | IN/OUT Flow | Setup de datos de prueba | N/A | 5 |
| 3 | **Pruebas de roles (ADMIN, Full Access, SIN permiso)** | RPC + datos de prueba | MEDIO — validación de autorización | IN/OUT Flow, RBAC | Usuarios con roles específicos | N/A | 5 |
| 4 | **Pruebas de concurrencia** | RPC + entorno multi-sesión | MEDIO — validación de FOR UPDATE + idempotencia | IN/OUT Flow | 2+ sesiones simultáneas | N/A | 6 |
| 5 | **Migración de `api-v1-reservations-patch-status`** | RPC validado en producción | ALTO — cambia el caller principal de transiciones | API v1, Calendario, Móvil | Pruebas de integración API | Revertir edge function | 7 |
| 6 | **Migración de `create-reservation`** | RPC validado | MEDIO — inicializa estado PENDING vía RPC | API v1, Creación de reservas | Pruebas de creación | Revertir edge function | 8 |
| 7 | **Migración de Calendario (frontend)** | RPC + API migrada | MEDIO — UI de cambio de estado usa RPC | Calendario, UI | Pruebas E2E | Revertir frontend | 9 |
| 8 | **Migración de Casetilla (frontend)** | RPC + API migrada | MEDIO — IN/OUT físico dispara transiciones vía RPC | Casetilla, IN/OUT | Pruebas de flujo completo | Revertir frontend | 10 |
| 9 | **Migración de Edge Functions** | RPC validado | ALTO — todas las funciones que modifican status_id | Edge Functions | Pruebas unitarias por función | Revertir una por una | 11 |
| 10 | **Migración de integraciones externas** | Todas las anteriores | BAJO — si existen webhooks/APIs externas | Integraciones | Pruebas de contrato | Revertir configuración | 12 |
| 11 | **Backfill de `idempotency_key`** | Stage 2 completado | BAJO — sin datos actualmente (0 filas) | IN/OUT Flow | Verificar NULL count | No necesario (vacío) | 13 |
| 12 | **Evaluar `idempotency_key NOT NULL`** | RPC en producción + backfill completo | MEDIO — cambia schema de nullable a NOT NULL | IN/OUT Flow, attempts | Verificar 0 NULLs | ALTER DROP NOT NULL | 14 |
| 13 | **Retiro del índice legacy `uq_incidents_idempotency`** | RPC validado + índices parciales funcionando | MEDIO — permite múltiples incidentes por operación | IN/OUT Flow, Incidents | Verificar sin duplicados | CREATE INDEX (restaurar) | 15 |
| 14 | **Trigger anti-bypass en `reservations`** | RPC validado + todos los callers migrados | CRÍTICO — bloquea UPDATEs directos a status_id | Reservas, todas las operaciones | Pruebas de bloqueo | DROP TRIGGER | 16 |
| 15 | **Monitoreo y rollback funcional** | RPC en producción | BAJO — observabilidad | Operaciones | Dashboard de intentos, incidentes | Rollback completo documentado | 17 |

---

## DETALLE POR PENDIENTE

### 1. RPC `transition_reservation_status`
- **Archivo esperado:** `supabase/migrations/20260729XXXXXX_phase_6_2_stage_4_rpc.sql`
- **Depende de:** Stages 1, 2, 3 (tabla, columnas, índices)
- **Complejidad:** ~400 líneas PL/pgSQL
- **Pruebas:** 46 funcionales + 10 integración
- **Rollback:** `DROP FUNCTION` + rollback de Stages 1-3 en orden inverso

### 2-4. Pruebas funcionales, de roles y concurrencia
- Requieren entorno QA con datos de prueba (reservas, usuarios, permisos)
- Las 30 pruebas de catálogo actuales validan estructura, no comportamiento

### 5-10. Migración de callers
- **Riesgo principal:** cambiar el comportamiento de módulos existentes
- **Estrategia recomendada:** feature flag por caller, migración gradual
- **Cada caller** debe validarse independientemente antes de migrar el siguiente

### 11. Backfill de `idempotency_key`
- Actualmente 0 filas en attempts → backfill es no-op
- Si en el futuro hay filas: `UPDATE ... SET idempotency_key = gen_random_uuid() WHERE idempotency_key IS NULL`

### 12. `idempotency_key NOT NULL`
- Solo después de backfill completo + verificación de 0 NULLs
- Impacto: el índice parcial `uq_attempts_idempotency` puede convertirse en índice completo

### 13. Retiro de `uq_incidents_idempotency`
- **Precondición:** los dos índices parciales nuevos están funcionando correctamente
- **Precondición:** el RPC usa ON CONFLICT con los índices parciales
- **Riesgo:** si se retira antes de que el RPC esté activo, no hay impacto

### 14. Trigger anti-bypass
- **Máximo riesgo:** si se activa antes de migrar todos los callers, las operaciones existentes fallan
- **Orden correcto:** último paso, después de migrar TODOS los callers
- **Validación:** monitorear que todas las transiciones pasan por el RPC durante N días

### 15. Monitoreo
- Panel de intentos en `inout_state_transition_attempts`
- Dashboard de incidentes en `inout_flow_incidents`
- Alertas de `RULE_BLOCKED` y `TERMINAL_STATE_BLOCKED`
- Métricas de latencia del RPC

---

## ORDEN RECOMENDADO DE EJECUCIÓN

```
Stages 1-3 (ESTE DESPLIEGUE)
    │
    ├── QA: Desplegar Stages 1-3
    │
Stage 4: RPC (PRÓXIMO)
    │
    ├── QA: Desplegar RPC
    ├── QA: 46 pruebas funcionales
    ├── QA: 10 pruebas de integración
    │
Stage 5: Pruebas exhaustivas
    │
    ├── QA: Pruebas de roles
    ├── QA: Pruebas de concurrencia
    │
Stage 6: Migración de callers (gradual)
    │
    ├── api-v1-reservations-patch-status
    ├── create-reservation
    ├── Calendario frontend
    ├── Casetilla frontend
    ├── Otras edge functions
    │
Stage 7: Backfill + NOT NULL + retiro legacy index
    │
Stage 8: Trigger anti-bypass
    │
Stage 9: Monitoreo continuo
```

---

## RIESGOS ACUMULADOS

| Riesgo | Stages 1-3 | + Stage 4 (RPC) | + Migración callers | + Trigger |
|---|---|---|---|---|
| Romper producción | **Cero** | Bajo (nadie llama al RPC) | Medio (callers migrados) | Alto (bloquea bypass) |
| Pérdida de datos | **Cero** | Bajo (ROLLBACK en error) | Bajo | Bajo |
| Bloqueo operativo | **Cero** | Bajo | Medio | Alto |
| Regresión | **Cero** | Bajo | Medio | Alto |

---

*Documento generado el 2026-07-29. Stages 1-3 son el primer despliegue seguro de la Fase 6.2.*