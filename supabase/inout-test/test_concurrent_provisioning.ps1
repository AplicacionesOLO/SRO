# ============================================================================
# test_concurrent_provisioning.ps1
# Fase 6.1 — PRUEBA DE CONCURRENCIA (CASO H) — WINDOWS POWERSHELL NATIVO
# Lanza dos invocaciones simultaneas de provision_inout_flow_for_org()
# mediante Start-Job y verifica que no haya duplicados ni errores.
#
# Requisitos: Docker corriendo, PostgreSQL healthy, psql en PATH.
# ============================================================================

$ErrorActionPreference = "Stop"

$DB_HOST = if ($env:DB_HOST) { $env:DB_HOST } else { "localhost" }
$DB_PORT = if ($env:DB_PORT) { $env:DB_PORT } else { "5439" }
$DB_USER = if ($env:DB_USER) { $env:DB_USER } else { "inout_test" }
$DB_PASS = if ($env:DB_PASS) { $env:DB_PASS } else { "inout_test_local_only" }
$DB_NAME = if ($env:DB_NAME) { $env:DB_NAME } else { "inout_test" }
$ORG_A  = "AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA"

$env:PGPASSWORD = $DB_PASS

Write-Host "=== Prueba de concurrencia (PowerShell): provisioning simultaneo en ORG_A ==="
Write-Host "Lanzando dos invocaciones simultaneas mediante Start-Job..."

# Limpiar reglas de test previas (por si acaso)
& psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "DELETE FROM public.inout_flow_rules WHERE org_id = '$ORG_A';" 2>&1 | Out-Null
Write-Host "INFO: Reglas previas de ORG_A eliminadas para prueba limpia"

# Definir el script block que ejecuta psql
$jobScript = {
    param($HostName, $Port, $User, $DbName, $OrgId)
    $env:PGPASSWORD = $env:PGPASS
    $output = & psql -h $HostName -p $Port -U $User -d $DbName -c "SELECT provision_inout_flow_for_org('$OrgId');" 2>&1
    $exitCode = $LASTEXITCODE
    return @{
        Output   = $output
        ExitCode = $exitCode
    }
}

# Pasar PGPASSWORD como variable de entorno al job
$env:PGPASS = $DB_PASS

# Lanzar jobs
$job1 = Start-Job -ScriptBlock $jobScript -ArgumentList $DB_HOST, $DB_PORT, $DB_USER, $DB_NAME, $ORG_A -Name "ProvJob1"
$job2 = Start-Job -ScriptBlock $jobScript -ArgumentList $DB_HOST, $DB_PORT, $DB_USER, $DB_NAME, $ORG_A -Name "ProvJob2"

Write-Host "Jobs lanzados: $($job1.Id), $($job2.Id). Esperando..."

# Esperar ambos (timeout 30s)
$timeout = 30
$elapsed = 0
while (($job1.State -eq 'Running' -or $job2.State -eq 'Running') -and $elapsed -lt $timeout) {
    Start-Sleep -Seconds 1
    $elapsed++
}

# Recibir resultados
$result1 = Receive-Job -Job $job1 -Wait
$result2 = Receive-Job -Job $job2 -Wait

# Limpiar jobs
Remove-Job -Job $job1 -Force
Remove-Job -Job $job2 -Force

Write-Host ""
Write-Host "Resultado hilo 1 (exit=$($result1.ExitCode)):"
Write-Host ($result1.Output -join "`n")
Write-Host ""
Write-Host "Resultado hilo 2 (exit=$($result2.ExitCode)):"
Write-Host ($result2.Output -join "`n")
Write-Host ""

# Verificar exit codes
if ($result1.ExitCode -ne 0) {
    Write-Host "FAIL: Hilo 1 falló con exit code $($result1.ExitCode)" -ForegroundColor Red
    exit 1
}
if ($result2.ExitCode -ne 0) {
    Write-Host "FAIL: Hilo 2 falló con exit code $($result2.ExitCode)" -ForegroundColor Red
    exit 1
}

# Verificar: exactamente 16 reglas
$rulesOutput = & psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM public.inout_flow_rules WHERE org_id = '$ORG_A';" 2>&1
$ruleCount = ($rulesOutput -join '').Trim()

Write-Host "Reglas en ORG_A tras concurrencia: $ruleCount"

if ($ruleCount -eq "16") {
    # Verificar que no haya duplicados (COUNT(*) = COUNT(DISTINCT code))
    $distinctOutput = & psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT CASE WHEN COUNT(*) = COUNT(DISTINCT code) THEN 'ok' ELSE 'dup' END FROM public.inout_flow_rules WHERE org_id = '$ORG_A';" 2>&1
    $distinctResult = ($distinctOutput -join '').Trim()

    if ($distinctResult -eq "ok") {
        Write-Host ""
        Write-Host "PASS: Concurrencia (PowerShell) — exactamente 16 reglas, sin duplicados" -ForegroundColor Green
        exit 0
    } else {
        Write-Host ""
        Write-Host "FAIL: Concurrencia — Hay códigos duplicados (COUNT(*) != COUNT(DISTINCT code))" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host ""
    Write-Host "FAIL: Concurrencia — $ruleCount reglas (esperado 16)" -ForegroundColor Red
    exit 1
}