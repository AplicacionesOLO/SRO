-- ============================================================================
-- 02_run_phase_6_1.sql
-- Fase 6.1 — PAQUETE DE PRUEBAS AISLADAS
-- EJECUTA LAS 7 MIGRACIONES EN ORDEN
-- Se detiene en el primer error.
-- ============================================================================

\set ON_ERROR_STOP on
\set QUIET on

\echo '========================================'
\echo '02_run_phase_6_1: Iniciando migraciones...'
\echo '========================================'

\echo ''
\echo '>>> 001: Tablas (inout_flow_rules, incidents, attempts, comments, schedules, runs, audit_log)'
\i /app/supabase/migrations/20260727120000_create_inout_tables.sql
\echo '>>> 001: OK'

\echo ''
\echo '>>> 002: Índices (29 índices sobre las 7 tablas)'
\i /app/supabase/migrations/20260727120100_create_inout_indexes.sql
\echo '>>> 002: OK'

\echo ''
\echo '>>> 003: RLS (habilita RLS + 13 políticas)'
\i /app/supabase/migrations/20260727120200_create_inout_rls.sql
\echo '>>> 003: OK'

\echo ''
\echo '>>> 004: Permisos (9 permisos + asignaciones a roles)'
\i /app/supabase/migrations/20260727120300_create_inout_permissions.sql
\echo '>>> 004: OK'

\echo ''
\echo '>>> 005: Función de provisioning'
\i /app/supabase/migrations/20260727120400_create_inout_provisioning.sql
\echo '>>> 005: OK'

\echo ''
\echo '>>> 006: Seed inicial de reglas'
\i /app/supabase/migrations/20260727120500_seed_inout_rules.sql
\echo '>>> 006: OK'

\echo ''
\echo '>>> 007: Helpers (4 funciones auxiliares)'
\i /app/supabase/migrations/20260727120600_create_rule_helpers.sql
\echo '>>> 007: OK'

\echo ''
\echo '========================================'
\echo '02_run_phase_6_1: LAS 7 MIGRACIONES COMPLETADAS'
\echo '========================================'