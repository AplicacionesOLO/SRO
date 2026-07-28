-- ============================================================================
-- 09_run_rollback.sql
-- Fase 6.1 — PAQUETE DE PRUEBAS AISLADAS
-- EJECUTA EL ROLLBACK MANUAL
-- Usa el script de rollback desde supabase/manual/
-- ============================================================================

\set ON_ERROR_STOP on

\echo '========================================'
\echo '09_run_rollback: Ejecutando rollback...'
\echo '========================================'

\i /app/supabase/manual/rollback_inout_module.sql

\echo '========================================'
\echo '09_run_rollback: Rollback completado'
\echo '========================================'