#!/usr/bin/env pwsh
# ============================================================================
# run-tests.ps1
# Fase 6.1 — PAQUETE DE PRUEBAS AISLADAS (WINDOWS POWERSHELL)
# Ejecuta la secuencia completa de validación en Docker PostgreSQL 15 local.
#
# Requisitos: Docker Desktop, psql (cliente PostgreSQL), PowerShell 7+
#
# Uso:
#   .\run-tests.ps1                          # Ejecución normal
#   $env:KEEP_CONTAINER="1"; .\run-tests.ps1 # No eliminar contenedor
#   $env:CLEAN_ONLY="1"; .\run-tests.ps1     # Solo limpiar contenedor previo
# ============================================================================

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DB_HOST = if ($env:DB_HOST) { $env:DB_HOST } else { "localhost" }
$DB_PORT = if ($env:DB_PORT) { $env:DB_PORT } else { "5439" }
$DB_USER = if ($env:DB_USER) { $env:DB_USER } else { "inout_test" }
$DB_PASS = if ($env:DB_PASS) { $env:DB_PASS } else { "inout_test_local_only" }
$DB_NAME = if ($env:DB_NAME) { $env:DB_NAME } else { "inout_test" }
$ContainerName = "inout-test-db"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$LogDir = Join-Path $ScriptDir "test-results"
$LogFile = Join-Path $LogDir "test-run_$Timestamp.log"
$Failures = 0
$TotalScripts = 0
$env:PGPASSWORD = $DB_PASS

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-Log {
    param([string]$Message)
    $Message | Tee-Object -FilePath $LogFile -Append
    Write-Host $Message
}

function Invoke-PsqlScript {
    param(
        [string]$Label,
        [string]$ScriptName
    )
    $Global:TotalScripts++

    $Header = "=" * 50
    Write-Log ""
    Write-Log $Header -ForegroundColor Cyan
    Write-Log "[$Label] Ejecutando: $ScriptName" -ForegroundColor Cyan
    Write-Log $Header -ForegroundColor Cyan

    $ScriptPath = Join-Path $ScriptDir $ScriptName
    $output = & psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f $ScriptPath 2>&1
    $exitCode = $LASTEXITCODE

    $output | ForEach-Object { $_ | Add-Content -Path $LogFile }

    if ($exitCode -eq 0) {
        Write-Log "[$Label] $ScriptName -> PASS" -ForegroundColor Green
        return $true
    } else {
        Write-Log "[$Label] $ScriptName -> FAIL (exit=$exitCode)" -ForegroundColor Red
        $Global:Failures++
        return $false
    }
}

# ============================================================================
# Validar dependencias
# ============================================================================
function Test-Dependencies {
    $errors = @()
    if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
        $errors += "docker"
    }
    if (-not (Get-Command "psql" -ErrorAction SilentlyContinue)) {
        $errors += "psql"
    }
    if ($errors.Count -gt 0) {
        Write-Host "FATAL: Dependencias faltantes: $($errors -join ', ')" -ForegroundColor Red
        Write-Host "Instala Docker Desktop y PostgreSQL client (psql)."
        exit 1
    }

    # Verificar docker compose
    $dcVersion = docker compose version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Log "docker compose detectado (v2)"
    } else {
        Write-Host "FATAL: docker compose no encontrado" -ForegroundColor Red
        exit 1
    }
}

# ============================================================================
# Limpiar contenedor previo
# ============================================================================
function Remove-PreviousContainer {
    Write-Log "Limpiando contenedor previo '$ContainerName'..." -ForegroundColor Yellow
    docker rm -f $ContainerName 2>$null
    docker volume rm inout-test_inout-test-data 2>$null
    Write-Log "Limpieza completada." -ForegroundColor Green
}

# ============================================================================
# Iniciar PostgreSQL
# ============================================================================
function Start-PostgreSQL {
    Write-Log "Iniciando PostgreSQL 15 en Docker..." -ForegroundColor Yellow
    Push-Location $ScriptDir
    docker compose up -d
    Pop-Location

    Write-Log "Esperando a PostgreSQL ($DB_HOST`:$DB_PORT)..." -ForegroundColor Yellow
    for ($i = 1; $i -le 30; $i++) {
        $result = & psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 1" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Log "PostgreSQL listo (intento $i)." -ForegroundColor Green
            $pgver = & psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT version();" 2>&1
            Write-Log "PostgreSQL: $($pgver.Trim())"
            return
        }
        if ($i -eq 30) {
            Write-Host "FATAL: PostgreSQL no respondió en 30 intentos." -ForegroundColor Red
            docker compose logs --tail=50
            exit 1
        }
        Start-Sleep -Seconds 2
    }
}

# ============================================================================
# Limpiar al final
# ============================================================================
function Invoke-Cleanup {
    if ($env:KEEP_CONTAINER -eq "1") {
        Write-Log "KEEP_CONTAINER=1 -> Contenedor NO se elimina." -ForegroundColor Yellow
    } else {
        Write-Log "Deteniendo contenedor..." -ForegroundColor Yellow
        Push-Location $ScriptDir
        docker compose down -v 2>$null
        Pop-Location
    }
}

# ============================================================================
# MAIN
# ============================================================================

Write-Log ""
Write-Log ("=" * 55) -ForegroundColor Yellow
Write-Log "  FASE 6.1 — IN/OUT FLOW — PAQUETE DE PRUEBAS AISLADAS" -ForegroundColor Yellow
Write-Log "  Fecha: $(Get-Date)" -ForegroundColor Yellow
Write-Log "  PostgreSQL: $DB_HOST`:$DB_PORT/$DB_NAME" -ForegroundColor Yellow
Write-Log "  Log: $LogFile" -ForegroundColor Yellow
Write-Log ("=" * 55) -ForegroundColor Yellow

if ($env:CLEAN_ONLY -eq "1") {
    Remove-PreviousContainer
    Write-Log "Limpieza completada. Saliendo." -ForegroundColor Green
    exit 0
}

Test-Dependencies
Remove-PreviousContainer
Start-PostgreSQL

# ============================================================================
# FASE 0: Prerrequisitos
# ============================================================================
Write-Log ""
Write-Log "=== FASE 0: PRERREQUISITOS ===" -ForegroundColor Yellow
if (-not (Invoke-PsqlScript -Label "00" -ScriptName "00_create_prerequisite_schema.sql")) { exit 1 }
if (-not (Invoke-PsqlScript -Label "01" -ScriptName "01_seed_test_security.sql")) { exit 1 }

# ============================================================================
# FASE 1: Migración
# ============================================================================
Write-Log ""
Write-Log "=== FASE 1: MIGRACIÓN 001-007 ===" -ForegroundColor Yellow
if (-not (Invoke-PsqlScript -Label "02" -ScriptName "02_run_phase_6_1.sql")) { exit 1 }

# ============================================================================
# FASE 2: Validaciones
# ============================================================================
Write-Log ""
Write-Log "=== FASE 2: VALIDACIONES ===" -ForegroundColor Yellow
if (-not (Invoke-PsqlScript -Label "03" -ScriptName "03_validate_structure.sql")) { exit 1 }
if (-not (Invoke-PsqlScript -Label "04" -ScriptName "04_validate_permissions.sql")) { exit 1 }
if (-not (Invoke-PsqlScript -Label "05" -ScriptName "05_validate_provisioning.sql")) { exit 1 }
if (-not (Invoke-PsqlScript -Label "06" -ScriptName "06_validate_rls.sql")) { exit 1 }
if (-not (Invoke-PsqlScript -Label "07" -ScriptName "07_validate_idempotency.sql")) { exit 1 }
if (-not (Invoke-PsqlScript -Label "08" -ScriptName "08_validate_no_operational_changes.sql")) { exit 1 }

# ============================================================================
# FASE 2.5: Concurrencia (PowerShell nativo)
# ============================================================================
Write-Log ""
Write-Log "=== FASE 2.5: CONCURRENCIA (PowerShell nativo) ===" -ForegroundColor Yellow
Write-Log "[CONCURRENT] Ejecutando test_concurrent_provisioning.ps1..." -ForegroundColor Cyan

$concurrentPs1 = Join-Path $ScriptDir "test_concurrent_provisioning.ps1"
$env:DB_HOST = $DB_HOST
$env:DB_PORT = $DB_PORT
$env:DB_USER = $DB_USER
$env:DB_PASS = $DB_PASS
$env:DB_NAME = $DB_NAME

# Detectar PowerShell 7+ (pwsh) o fallback a Windows PowerShell 5.1
$psExe = if (Get-Command "pwsh" -ErrorAction SilentlyContinue) { "pwsh" } else { "powershell.exe" }
$concurrentResult = & $psExe -NoProfile -ExecutionPolicy Bypass -File $concurrentPs1 2>&1
$concurrentExitCode = $LASTEXITCODE
$concurrentResult | ForEach-Object { $_ | Add-Content -Path $LogFile; Write-Host $_ }

if ($concurrentExitCode -eq 0) {
    Write-Log "[CONCURRENT] Concurrencia -> PASS" -ForegroundColor Green
} else {
    Write-Log "[CONCURRENT] Concurrencia -> FAIL (exit=$concurrentExitCode)" -ForegroundColor Red
    $Global:Failures++
}

# ============================================================================
# FASE 3: Rollback
# ============================================================================
Write-Log ""
Write-Log "=== FASE 3: ROLLBACK ===" -ForegroundColor Yellow
if (-not (Invoke-PsqlScript -Label "09" -ScriptName "09_run_rollback.sql")) { exit 1 }
if (-not (Invoke-PsqlScript -Label "10" -ScriptName "10_validate_rollback.sql")) { exit 1 }

# ============================================================================
# RESUMEN FINAL
# ============================================================================
Write-Log ""
Write-Log ("=" * 55) -ForegroundColor Yellow

if ($Failures -eq 0) {
    Write-Log "  RESULTADO: ALL TESTS PASSED" -ForegroundColor Green
    Write-Log ""
    Write-Log "  Veredicto técnico: CANDIDATO PARA REVISIÓN QA" -ForegroundColor Green
    Write-Log "  ⚠️  La aprobación final para QA requiere revisión humana de estos logs." -ForegroundColor Cyan
} else {
    Write-Log "  RESULTADO: $Failures SCRIPT(S) FALLARON" -ForegroundColor Red
    Write-Log "  Veredicto: NO APROBADO" -ForegroundColor Red
}

Write-Log "  Ejecutados: $TotalScripts scripts + concurrencia" -ForegroundColor Yellow
Write-Log "  Log completo: $LogFile" -ForegroundColor Yellow
Write-Log ("=" * 55) -ForegroundColor Yellow

Invoke-Cleanup

exit $Failures