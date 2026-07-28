#!/usr/bin/env bash
# ============================================================================
# test_concurrent_provisioning.sh
# Fase 6.1 — PRUEBA DE CONCURRENCIA (CASO H)
# Lanza dos invocaciones simultaneas de provision_inout_flow_for_org()
# y verifica que no haya duplicados ni errores.
#
# Requisitos: Docker corriendo, PostgreSQL healthy.
# ============================================================================

set -euo pipefail

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5439}"
DB_USER="${DB_USER:-inout_test}"
DB_PASS="${DB_PASS:-inout_test_local_only}"
DB_NAME="${DB_NAME:-inout_test}"
ORG_A="AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA"

export PGPASSWORD="$DB_PASS"
PSQL="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"

echo "=== Prueba de concurrencia: provisioning simultaneo en ORG_A ==="
echo "Lanzando dos invocaciones simultaneas..."

# Ejecutar ambas en paralelo
$PSQL -c "SELECT provision_inout_flow_for_org('$ORG_A');" > /tmp/prov_result_1.txt 2>&1 &
PID1=$!
$PSQL -c "SELECT provision_inout_flow_for_org('$ORG_A');" > /tmp/prov_result_2.txt 2>&1 &
PID2=$!

# Esperar que ambas terminen
wait $PID1
EXIT1=$?
wait $PID2
EXIT2=$?

echo "Resultado hilo 1 (exit=$EXIT1):"
cat /tmp/prov_result_1.txt
echo ""
echo "Resultado hilo 2 (exit=$EXIT2):"
cat /tmp/prov_result_2.txt
echo ""

# Verificar: exactamente 16 reglas
RULES=$($PSQL -t -c "SELECT COUNT(*) FROM public.inout_flow_rules WHERE org_id = '$ORG_A';")
RULES=$(echo "$RULES" | tr -d ' ')

echo "Reglas en ORG_A tras concurrencia: $RULES"

if [ "$RULES" = "16" ]; then
    echo ""
    echo "PASS: Concurrencia — exactamente 16 reglas, sin duplicados"
    exit 0
else
    echo ""
    echo "FAIL: Concurrencia — $RULES reglas (esperado 16)"
    exit 1
fi