# Fase 6.1 — IN/OUT Flow — Paquete de Pruebas Aisladas

Paquete técnico ejecutable para validar las 7 migraciones de Fase 6.1 (módulo IN/OUT Flow) en un entorno PostgreSQL 15 completamente aislado con Docker.

---

## Requisitos

- **Docker** y **Docker Compose** (v2+)
- **psql** (cliente PostgreSQL, incluido en `postgresql-client` o `libpq`)
- ~500 MB de espacio libre en disco
- Conexión a Internet solo para `docker pull postgres:15-alpine` (primera ejecución)

**NO requiere:** Supabase CLI, conexión a ningún servidor remoto, credenciales reales.

---

## Arquitectura de pruebas RLS

El contenedor PostgreSQL crea un usuario superusuario (`inout_test`). Para que las pruebas RLS sean reales y no falsos positivos, el paquete:

1. Crea un rol `authenticated` con `NOSUPERUSER NOBYPASSRLS` (idéntico al rol que reciben los usuarios logueados en Supabase real).
2. Cada prueba RLS ejecuta `SET ROLE authenticated` — el superuser puede hacer `SET ROLE` a cualquier rol.
3. Verifica (identity guard) que `current_user = 'authenticated'`, que NO sea superuser ni BYPASSRLS, y que `auth.uid()` coincida con el usuario esperado.
4. Diferencia bloqueos: privilegio SQL (falta GRANT) vs RLS (política bloquea) vs CHECK vs FK. **No** acepta "cualquier error = PASS".
5. Tests positivos obligatorios ANTES de los negativos (demuestra que los GRANTs SQL básicos existen).
6. `service_role` (BYPASSRLS) solo se usa para provisioning y tareas backend, **nunca** para validar RLS.

---

## Comandos de ejecución

### Linux / macOS

```bash
cd supabase/inout-test

# Iniciar y ejecutar todo
chmod +x run-tests.sh test_concurrent_provisioning.sh
./run-tests.sh

# Conservar contenedor para debug
KEEP_CONTAINER=1 ./run-tests.sh

# Solo limpiar contenedor previo
CLEAN_ONLY=1 ./run-tests.sh
```

### Windows PowerShell (nativo, sin WSL ni Git Bash)

```powershell
cd supabase\inout-test

# Ejecutar todo
.\run-tests.ps1

# Conservar contenedor para debug
$env:KEEP_CONTAINER="1"
.\run-tests.ps1

# Solo limpiar contenedor previo
$env:CLEAN_ONLY="1"
.\run-tests.ps1
```

---

## Rutas independientes para cada sistema operativo

| Componente | Linux/macOS | Windows PowerShell |
|---|---|---|
| Orquestador principal | `run-tests.sh` | `run-tests.ps1` |
| Concurrencia | `test_concurrent_provisioning.sh` (bash) | `test_concurrent_provisioning.ps1` (Start-Job nativo) |

**La ruta de Windows NO depende de bash, WSL, ni Git Bash.** La concurrencia usa `Start-Job` de PowerShell para lanzar dos conexiones psql simultáneas.

---

## Qué hace cada script

| # | Archivo | Descripción |
|---|---------|-------------|
| 00 | `00_create_prerequisite_schema.sql` | Crea roles PostgreSQL (`anon`, `authenticated`, `service_role`), extensión `pgcrypto`, esquema `auth`, función `auth.uid()` compatible con Supabase, y 13 tablas base mínimas. `GRANT authenticated TO inout_test` para `SET ROLE`. |
| 01 | `01_seed_test_security.sql` | Datos de prueba: 3 organizaciones, 4 roles, 5 usuarios, asignaciones, docks, 17 statuses, 2 reservas |
| 02 | `02_run_phase_6_1.sql` | Ejecuta las 7 migraciones en orden (001→007) |
| 03 | `03_validate_structure.sql` | Valida por nombres exactos: 7 tablas, 29 índices, 13 políticas RLS, 5 funciones, PKs, FKs, CHECKs, UNIQUEs, JSONB defaults |
| 04 | `04_validate_permissions.sql` | ADMIN=9, Full Access=9, SUPERVISOR=6, BASIC_USER=0; verifica prohibiciones de SUPERVISOR |
| 05 | `05_validate_provisioning.sql` | Pruebas de provisioning: 10 casos incluyendo `service_role`, regla personalizada no sobrescrita, R10/R11 |
| 06 | `06_validate_rls.sql` | 18 pruebas RLS con `SET ROLE authenticated` (NOBYPASSRLS). Identity guard antes de cada test. Clasifica cada bloqueo: PRIVILEGE vs RLS vs CHECK vs FK. Tests positivos primero. |
| 07 | `07_validate_idempotency.sql` | Idempotencia de permisos, provisioning, índices, helpers, role_permissions |
| 08 | `08_validate_no_operational_changes.sql` | Verifica que tablas base no fueron modificadas |
| 09 | `09_run_rollback.sql` | Ejecuta `supabase/manual/rollback_inout_module.sql` |
| 10 | `10_validate_rollback.sql` | Clean slate post-rollback: 0 tablas, 0 funciones, 0 permisos, tablas base intactas |

---

## Qué significa PASS

Todos los scripts terminan sin errores. El orquestador retorna exit code **0** y muestra:

```
RESULTADO: ALL TESTS PASSED
Veredicto técnico: CANDIDATO PARA REVISIÓN QA
⚠️  La aprobación final para QA requiere revisión humana de estos logs.
```

**IMPORTANTE:** El veredicto "CANDIDATO PARA REVISIÓN QA" NO es una aprobación automática. Requiere que un humano revise los logs antes de autorizar la ejecución en QA.

## Qué significa FAIL

Uno o más scripts fallaron. El orquestador retorna exit code **≠ 0** y muestra:

```
RESULTADO: N SCRIPT(S) FALLARON
Veredicto: NO APROBADO
```

---

## Roles PostgreSQL creados

| Rol | LOGIN | SUPERUSER | BYPASSRLS | Propósito |
|-----|-------|-----------|-----------|-----------|
| `anon` | NOLOGIN | NO | NO | Rol público de Supabase |
| `authenticated` | NOLOGIN | NO | NO | Rol para usuarios logueados. Usado directamente en `SET ROLE authenticated` para pruebas RLS. |
| `service_role` | NOLOGIN | NO | SÍ | Rol de backend (bypass RLS como en Supabase real). Solo para provisioning, nunca para validar RLS. |

**No existe `inout_rls_test`.** Se eliminó porque:
- No existe en Supabase real.
- `SET ROLE authenticated` replica exactamente el entorno Supabase.
- Evita problemas de NOINHERIT/INHERIT y copia manual de GRANTs.

---

## Simulación de auth.uid()

La función `auth.uid()` implementada en `00_create_prerequisite_schema.sql`:

1. **Prioridad 1:** Lee `request.jwt.claim.sub` (estándar Supabase JWT)
2. **Fallback:** Lee `app.current_user_id` (compatibilidad con versiones anteriores)

Cada prueba RLS en `06` configura el usuario con:
```sql
SET ROLE authenticated;
PERFORM set_config('request.jwt.claim.sub', '<USER_UUID>', true);
```

El identity guard (`test._guard_identity`) verifica después de cada `SET ROLE`:
- `session_user` = `inout_test` (superuser del contenedor)
- `current_user` = `authenticated`
- `auth.uid()` = UUID configurado
- `authenticated` no es superuser ni BYPASSRLS

---

## Clasificación de bloqueos en pruebas RLS

| Clasificación | SQLSTATE | Significado | ¿PASS en test RLS? |
|---|---|---|---|
| `PRIVILEGE` | 42501 | Falta GRANT SQL (ej. no tiene SELECT en la tabla) | ❌ FAIL — la prueba no puede distinguir RLS |
| `RLS` | varios + "row-level security" | Política RLS bloqueó la operación | ✅ PASS (si la prueba espera bloqueo RLS) |
| `CHECK` | 23514 | Violación de CHECK constraint | ❌ FAIL — no es RLS |
| `FK` | 23503 | Violación de foreign key | ❌ FAIL — no es RLS |
| `UNEXPECTED` | otros | Error no clasificado | ❌ FAIL |

---

## Limitaciones conocidas

1. **Tablas sin datos reales:** Las tablas base contienen solo stubs mínimos. Las pruebas RLS no cubren escenarios con datos masivos.
2. **auth.uid() simulada:** No replica el comportamiento completo de Supabase Auth (JWT real, refresh tokens).
3. **Sin triggers reales:** No prueba integración con triggers existentes del proyecto.
4. **Sin integración frontend:** Solo PostgreSQL. No prueba componentes React, Edge Functions, ni APIs.
5. **service_role con BYPASSRLS:** Coincide con Supabase real. Solo se usa para provisioning (test 05), nunca para validar RLS (test 06).

---

## Debugging

```bash
# Conectar al contenedor después de un fallo
docker exec -it inout-test-db psql -U inout_test -d inout_test

# Ver logs del contenedor
docker compose logs --tail=100

# Ejecutar un solo script de prueba
PGPASSWORD="inout_test_local_only" psql -h localhost -p 5439 -U inout_test -d inout_test -f 06_validate_rls.sql
```

---

## Estructura de archivos

```
supabase/inout-test/
  README.md                          ← Este archivo
  docker-compose.yml                 ← PostgreSQL 15 aislado (puerto 5439)
  run-tests.sh                       ← Orquestador Linux/macOS (bash)
  run-tests.ps1                      ← Orquestador Windows PowerShell (nativo)
  test_concurrent_provisioning.sh    ← Concurrencia Linux/macOS (bash)
  test_concurrent_provisioning.ps1   ← Concurrencia Windows (Start-Job nativo)
  TEST_RESULTS_TEMPLATE.md           ← Plantilla para documentar resultados
  00_create_prerequisite_schema.sql  ← Roles + extensión pgcrypto + auth.uid() + 13 tablas base
  01_seed_test_security.sql          ← Datos de prueba
  02_run_phase_6_1.sql               ← Ejecuta migraciones 001-007
  03_validate_structure.sql          ← Validación estructural (listas exactas)
  04_validate_permissions.sql        ← Permisos RBAC
  05_validate_provisioning.sql       ← Provisioning (10 casos)
  06_validate_rls.sql                ← RLS (18 tests, SET ROLE authenticated, identity guard, clasificación PRIVILEGE/RLS/CHECK/FK)
  07_validate_idempotency.sql        ← Idempotencia
  08_validate_no_operational_changes.sql ← Integridad operativa
  09_run_rollback.sql                ← Ejecuta rollback
  10_validate_rollback.sql           ← Validación post-rollback
  test-results/                      ← Logs de ejecución (autogenerado)
```

---

## Confirmación

- ✅ No se ejecutó SQL contra la base remota de Supabase
- ✅ No se usaron credenciales reales
- ✅ Docker no se conecta a ningún servicio externo
- ✅ 008 y 009 no se incluyen ni se ejecutan
- ✅ Pruebas RLS usan `SET ROLE authenticated` (NOBYPASSRLS real, mismo rol que Supabase)
- ✅ Identity guard: session_user, current_user, auth.uid() verificados en cada test
- ✅ Bloqueos clasificados: PRIVILEGE vs RLS vs CHECK vs FK — no "cualquier error = PASS"
- ✅ Tests positivos antes de negativos (demuestra que los GRANTs SQL existen)
- ✅ `service_role` solo para provisioning, nunca para validar RLS
- ✅ Roles `anon`, `authenticated`, `service_role` creados para GRANTs
- ✅ auth.uid() compatible con `request.jwt.claim.sub`
- ✅ Windows PowerShell: concurrencia nativa con `Start-Job`, sin dependencia de bash/WSL/Git Bash