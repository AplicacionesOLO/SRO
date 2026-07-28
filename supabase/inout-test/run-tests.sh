#!/usr/bin/env bash
# ============================================================================
# run-tests.sh
# Fase 6.1 — PAQUETE DE PRUEBAS AISLADAS
# Ejecuta la secuencia completa de validación en Docker PostgreSQL 15 local.
#
# Requisitos: Docker, docker compose, psql (cliente PostgreSQL), bash
#
# Uso:
#   ./run-tests.sh                          # Ejecución normal
#   KEEP_CONTAINER=1 ./run-tests.sh         # No eliminar contenedor al terminar
#   CLEAN_ONLY=1 ./run-tests.sh             # Solo limpiar contenedor previo
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5439}"
DB_USER="${DB_USER:-inout_test}"
DB_PASS="${DB_PASS:-inout_test_local_only}"
DB_NAME="${DB_NAME:-inout_test}"
CONTAINER_NAME="inout-test-db"
LOG_DIR="$SCRIPT_DIR/test-results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/test-run_$TIMESTAMP.log"
FAILURES=0
TOTAL_SCRIPTS=0

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

mkdir -p "$LOG_DIR"

# ============================================================================
# TRAP: en caso de error, mostrar el último log y opcionalmente conservar
#       el contenedor para debugging.
# ============================================================================
cleanup_on_error() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        echo ""
        echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
        echo -e "${RED}  ERROR: El script falló con exit code $exit_code${NC}"
        echo -e "${RED}  Últimas 30 líneas del log:${NC}"
        echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
        tail -30 "$LOG_FILE" 2>/dev/null || true
        echo ""
        if [ "${KEEP_CONTAINER:-0}" = "1" ]; then
            echo -e "${YELLOW}  KEEP_CONTAINER=1 → El contenedor '$CONTAINER_NAME' NO se elimina.${NC}"
            echo -e "${YELLOW}  Para debug: docker exec -it $CONTAINER_NAME psql -U $DB_USER -d $DB_NAME${NC}"
        else
            echo -e "${YELLOW}  Para debug, ejecuta: KEEP_CONTAINER=1 ./run-tests.sh${NC}"
        fi
    fi
    exit $exit_code
}

trap cleanup_on_error EXIT

log() {
    echo -e "$1" | tee -a "$LOG_FILE"
}

psql_cmd() {
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" "$@"
}

run_script() {
    local label="$1"
    local script="$2"

    TOTAL_SCRIPTS=$((TOTAL_SCRIPTS + 1))

    log ""
    log "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    log "${CYAN}[$label] Ejecutando: $script${NC}"
    log "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    if psql_cmd -f "$SCRIPT_DIR/$script" >> "$LOG_FILE" 2>&1; then
        log "${GREEN}[$label] $script → PASS${NC}"
        return 0
    else
        log "${RED}[$label] $script → FAIL${NC}"
        FAILURES=$((FAILURES + 1))
        return 1
    fi
}

# ============================================================================
# Validar dependencias
# ============================================================================
check_deps() {
    local missing=""

    if ! command -v docker &> /dev/null; then
        missing="$missing docker"
    fi
    if ! command -v psql &> /dev/null; then
        missing="$missing psql"
    fi
    if ! command -v bash &> /dev/null; then
        missing="$missing bash"
    fi

    if [ -n "$missing" ]; then
        echo -e "${RED}FATAL: Dependencias faltantes:$missing${NC}"
        echo "Instala: Docker (https://docker.com), PostgreSQL client (apt install postgresql-client)"
        exit 1
    fi

    # Verificar docker compose (puede ser docker-compose o docker compose)
    if docker compose version &> /dev/null; then
        log "docker compose detectado (v2)"
    elif docker-compose version &> /dev/null; then
        log "docker-compose detectado (v1)"
    else
        echo -e "${RED}FATAL: docker compose no encontrado${NC}"
        exit 1
    fi
}

# ============================================================================
# Limpiar contenedor y volumen previo
# ============================================================================
clean_previous() {
    log "${YELLOW}Limpiando contenedor previo '$CONTAINER_NAME'...${NC}"
    docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
    docker volume rm inout-test_inout-test-data 2>/dev/null || true
    log "${GREEN}Limpieza completada.${NC}"
}

# ============================================================================
# Iniciar PostgreSQL
# ============================================================================
start_postgres() {
    log "${YELLOW}Iniciando PostgreSQL 15 en Docker...${NC}"
    cd "$SCRIPT_DIR"
    docker compose up -d

    log "${YELLOW}Esperando a PostgreSQL ($DB_HOST:$DB_PORT)...${NC}"
    for i in $(seq 1 30); do
        if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
            log "${GREEN}PostgreSQL listo (intento $i).${NC}"

            # Verificar versión de PostgreSQL
            local pgver
            pgver=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT version();" 2>/dev/null | head -1)
            log "PostgreSQL: $pgver"
            return 0
        fi
        if [ "$i" -eq 30 ]; then
            log "${RED}FATAL: PostgreSQL no respondió en 30 intentos.${NC}"
            docker compose logs --tail=50
            exit 1
        fi
        sleep 2
    done
}

# ============================================================================
# Limpiar al final
# ============================================================================
cleanup_success() {
    if [ "${KEEP_CONTAINER:-0}" = "1" ]; then
        log "${YELLOW}KEEP_CONTAINER=1 → Contenedor NO se elimina.${NC}"
        log "  Para limpiar manualmente: docker compose down -v"
    else
        log "${YELLOW}Deteniendo contenedor...${NC}"
        cd "$SCRIPT_DIR"
        docker compose down -v 2>/dev/null || true
    fi
}

# ============================================================================
# MAIN
# ============================================================================

log ""
log "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
log "${YELLOW}  FASE 6.1 — IN/OUT FLOW — PAQUETE DE PRUEBAS AISLADAS${NC}"
log "${YELLOW}  Fecha: $(date)${NC}"
log "${YELLOW}  PostgreSQL: $DB_HOST:$DB_PORT/$DB_NAME${NC}"
log "${YELLOW}  Log: $LOG_FILE${NC}"
log "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"

# Solo limpiar
if [ "${CLEAN_ONLY:-0}" = "1" ]; then
    clean_previous
    log "${GREEN}Limpieza completada. Saliendo.${NC}"
    trap - EXIT
    exit 0
fi

check_deps
clean_previous
start_postgres

# ============================================================================
# FASE 0: Prerrequisitos
# ============================================================================
log ""
log "${YELLOW}=== FASE 0: PRERREQUISITOS ===${NC}"

run_script "00" "00_create_prerequisite_schema.sql" || exit 1
run_script "01" "01_seed_test_security.sql" || exit 1

# ============================================================================
# FASE 1: Migración
# ============================================================================
log ""
log "${YELLOW}=== FASE 1: MIGRACIÓN 001–007 ===${NC}"

run_script "02" "02_run_phase_6_1.sql" || exit 1

# ============================================================================
# FASE 2: Validaciones
# ============================================================================
log ""
log "${YELLOW}=== FASE 2: VALIDACIONES ===${NC}"

run_script "03" "03_validate_structure.sql" || exit 1
run_script "04" "04_validate_permissions.sql" || exit 1
run_script "05" "05_validate_provisioning.sql" || exit 1
run_script "06" "06_validate_rls.sql" || exit 1
run_script "07" "07_validate_idempotency.sql" || exit 1
run_script "08" "08_validate_no_operational_changes.sql" || exit 1

# ============================================================================
# FASE 2.5: Concurrencia
# ============================================================================
log ""
log "${YELLOW}=== FASE 2.5: CONCURRENCIA ===${NC}"

log "${CYAN}[CONCURRENT] Ejecutando test_concurrent_provisioning.sh...${NC}"
if bash "$SCRIPT_DIR/test_concurrent_provisioning.sh" >> "$LOG_FILE" 2>&1; then
    log "${GREEN}[CONCURRENT] Concurrencia → PASS${NC}"
else
    log "${RED}[CONCURRENT] Concurrencia → FAIL${NC}"
    FAILURES=$((FAILURES + 1))
fi

# ============================================================================
# FASE 3: Rollback
# ============================================================================
log ""
log "${YELLOW}=== FASE 3: ROLLBACK ===${NC}"

run_script "09" "09_run_rollback.sql" || exit 1
run_script "10" "10_validate_rollback.sql" || exit 1

# ============================================================================
# RESUMEN FINAL
# ============================================================================
log ""
log "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"

if [ "$FAILURES" -eq 0 ]; then
    log "${GREEN}  RESULTADO: ALL TESTS PASSED${NC}"
    log ""
    log "${GREEN}  Veredicto técnico: CANDIDATO PARA REVISIÓN QA${NC}"
    log "${CYAN}  ⚠️  La aprobación final para QA requiere revisión humana de estos logs.${NC}"
else
    log "${RED}  RESULTADO: $FAILURES SCRIPT(S) FALLARON${NC}"
    log "${RED}  Veredicto: NO APROBADO${NC}"
fi

log "${YELLOW}  Ejecutados: $TOTAL_SCRIPTS scripts + concurrencia${NC}"
log "${YELLOW}  Log completo: $LOG_FILE${NC}"
log "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"

# Limpiar (o conservar si KEEP_CONTAINER=1)
cleanup_success

# Desactivar trap antes de salir para que cleanup_on_error no se ejecute
trap - EXIT

exit $FAILURES