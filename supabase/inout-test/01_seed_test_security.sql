-- ============================================================================
-- 01_seed_test_security.sql
-- Fase 6.1 — PAQUETE DE PRUEBAS AISLADAS
-- DATOS DE PRUEBA PARA VALIDACIÓN RLS Y PROVISIONING
--
-- Crea organizaciones, roles, usuarios y asignaciones necesarias
-- para probar RLS con diferentes perfiles.
-- ============================================================================

BEGIN;

-- ===========================================================================
-- 1. País stub (necesario para profiles.country_id FK)
-- ===========================================================================

INSERT INTO public.countries (id, name, code)
VALUES ('00000000-0000-0000-0000-000000000001', 'Costa Rica', 'CR')
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 2. Organizaciones de prueba
-- ===========================================================================

INSERT INTO public.organizations (id, name) VALUES
    ('AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA', 'ORG_A — Organización Principal de Prueba'),
    ('BBBBBBBB-0000-0000-0000-BBBBBBBBBBBB', 'ORG_B — Organización Secundaria de Prueba'),
    ('CCCCCCCC-0000-0000-0000-CCCCCCCCCCCC', 'ORG_NO_ADMIN — Organización Sin Actor Válido')
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 3. Roles
-- ===========================================================================

INSERT INTO public.roles (id, name, description) VALUES
    ('11111111-1111-1111-1111-111111111111', 'ADMIN',       'Administrador del sistema'),
    ('22222222-2222-2222-2222-222222222222', 'Full Access', 'Acceso completo'),
    ('33333333-3333-3333-3333-333333333333', 'SUPERVISOR',  'Supervisor de almacén'),
    ('44444444-4444-4444-4444-444444444444', 'BASIC_USER',  'Usuario básico sin permisos flow_report')
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 4. auth.users (para las FK de profiles)
-- ===========================================================================

INSERT INTO auth.users (id) VALUES
    ('AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA'),  -- admin_org_a
    ('BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB'),  -- supervisor_org_a
    ('CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC'),  -- basic_org_a
    ('DDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD'),  -- admin_org_b
    ('EEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE')   -- no_org_user (sin organización)
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 5. Profiles
-- ===========================================================================

INSERT INTO public.profiles (id, name, email, country_id) VALUES
    ('AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', 'Admin ORG A',      'admin_a@test.local',  '00000000-0000-0000-0000-000000000001'),
    ('BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB',  'Supervisor ORG A', 'super_a@test.local',  '00000000-0000-0000-0000-000000000001'),
    ('CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC',  'Básico ORG A',     'basic_a@test.local',  '00000000-0000-0000-0000-000000000001'),
    ('DDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD',  'Admin ORG B',      'admin_b@test.local',  '00000000-0000-0000-0000-000000000001'),
    ('EEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE',  'Sin Organización', 'no_org@test.local',   '00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 6. Asignaciones user_org_roles
-- ===========================================================================

-- ORG_A: admin_org_a → ADMIN, supervisor_org_a → SUPERVISOR, basic_org_a → BASIC_USER
INSERT INTO public.user_org_roles (id, user_id, org_id, role_id) VALUES
    ('A0010000-0000-0000-0000-000000000001', 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', 'AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA', '11111111-1111-1111-1111-111111111111'),
    ('A0020000-0000-0000-0000-000000000001', 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB',  'AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA', '33333333-3333-3333-3333-333333333333'),
    ('A0030000-0000-0000-0000-000000000001', 'CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC',  'AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA', '44444444-4444-4444-4444-444444444444')
ON CONFLICT (user_id, org_id) DO NOTHING;

-- ORG_B: admin_org_b → ADMIN
INSERT INTO public.user_org_roles (id, user_id, org_id, role_id) VALUES
    ('B0010000-0000-0000-0000-000000000001', 'DDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD', 'BBBBBBBB-0000-0000-0000-BBBBBBBBBBBB', '11111111-1111-1111-1111-111111111111')
ON CONFLICT (user_id, org_id) DO NOTHING;

-- ===========================================================================
-- 7. Docks stub (necesario para reservations.dock_id FK)
-- ===========================================================================

INSERT INTO public.docks (id, name) VALUES
    ('DOCK-A001-0000-0000-000000000001', 'Muelle A1 — ORG A'),
    ('DOCK-A002-0000-0000-000000000001', 'Muelle A2 — ORG A'),
    ('DOCK-B001-0000-0000-000000000001', 'Muelle B1 — ORG B')
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 8. Reservation statuses (15 códigos reales, al menos 2 por org para FKs)
-- ===========================================================================

INSERT INTO public.reservation_statuses (id, org_id, code, name, color, order_index) VALUES
    -- ORG_A statuses
    ('STAT-A01-0000-0000-000000000001', 'AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA', 'PENDING',               'Pendiente',             '#9CA3AF', 1),
    ('STAT-A02-0000-0000-000000000001', 'AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA', 'CONFIRMED',             'Confirmada',            '#3B82F6', 2),
    ('STAT-A03-0000-0000-000000000001', 'AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA', 'ARRIVED_PENDING_UNLOAD','Arribo Pendiente Descarga','#F59E0B', 3),
    ('STAT-A04-0000-0000-000000000001', 'AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA', 'CHECKING_IN',           'En Check-in',           '#10B981', 4),
    ('STAT-A05-0000-0000-000000000001', 'AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA', 'IN_PROGRESS',           'En Progreso',           '#8B5CF6', 5),
    ('STAT-A06-0000-0000-000000000001', 'AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA', 'PENDING_DISCHARGE',     'Pendiente Descarga',    '#EC4899', 6),
    ('STAT-A07-0000-0000-000000000001', 'AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA', 'UNLOADING',             'Descargando',           '#F97316', 7),
    ('STAT-A08-0000-0000-000000000001', 'AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA', 'DISCHARGED',            'Descargado',            '#14B8A6', 8),
    ('STAT-A09-0000-0000-000000000001', 'AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA', 'UNLOADED_PENDING_CHECKIN','Descargado Pendiente Check-in','#D946EF', 9),
    ('STAT-A10-0000-0000-000000000001', 'AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA', 'CHECKEDIN_PENDING_CLOSE','Check-in Pendiente Cierre','#0EA5E9', 10),
    ('STAT-A11-0000-0000-000000000001', 'AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA', 'START',                 'Inicio',                '#84CC16', 11),
    ('STAT-A12-0000-0000-000000000001', 'AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA', 'DISPATCHED',            'Despachado',            '#06B6D4', 12),
    ('STAT-A13-0000-0000-000000000001', 'AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA', 'DONE',                  'Completado',            '#22C55E', 13),
    ('STAT-A14-0000-0000-000000000001', 'AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA', 'CANCELLED',             'Cancelado',             '#EF4444', 14),
    ('STAT-A15-0000-0000-000000000001', 'AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA', 'NO_SHOW',               'No Show',               '#6B7280', 15),
    -- ORG_B statuses (mínimo 2 para FKs)
    ('STAT-B01-0000-0000-000000000001', 'BBBBBBBB-0000-0000-0000-BBBBBBBBBBBB', 'PENDING',               'Pendiente',             '#9CA3AF', 1),
    ('STAT-B02-0000-0000-000000000001', 'BBBBBBBB-0000-0000-0000-BBBBBBBBBBBB', 'DONE',                  'Completado',            '#22C55E', 13)
ON CONFLICT (org_id, code) DO NOTHING;

-- ===========================================================================
-- 9. Reservations de prueba (mínimo 1 por org para FKs)
-- ===========================================================================

INSERT INTO public.reservations (id, org_id, dock_id, start_datetime, end_datetime, status_id, created_by) VALUES
    ('RESV-A01-0000-0000-000000000001', 'AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA', 'DOCK-A001-0000-0000-000000000001', '2026-07-27 08:00:00-06', '2026-07-27 09:00:00-06', 'STAT-A01-0000-0000-000000000001', 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA'),
    ('RESV-B01-0000-0000-000000000001', 'BBBBBBBB-0000-0000-0000-BBBBBBBBBBBB', 'DOCK-B001-0000-0000-000000000001', '2026-07-27 10:00:00-06', '2026-07-27 11:00:00-06', 'STAT-B01-0000-0000-000000000001', 'DDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD')
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 10. Activity log stub (1 entrada para FK de inout_flow_incidents)
-- ===========================================================================

INSERT INTO public.activity_log (id, org_id, entity_type, entity_id, action, created_at) VALUES
    ('ALOG-A01-0000-0000-000000000001', 'AAAAAAAA-0000-0000-0000-AAAAAAAAAAAA', 'reservation', 'RESV-A01-0000-0000-000000000001', 'status_change', '2026-07-27 08:30:00-06'),
    ('ALOG-B01-0000-0000-000000000001', 'BBBBBBBB-0000-0000-0000-BBBBBBBBBBBB', 'reservation', 'RESV-B01-0000-0000-000000000001', 'status_change', '2026-07-27 10:30:00-06')
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- Verificación de datos de prueba
-- ===========================================================================

DO $$
DECLARE
    v_orgs INTEGER; v_users INTEGER; v_assignments INTEGER; v_statuses INTEGER;
    v_reservations INTEGER; v_roles_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_orgs FROM public.organizations WHERE id LIKE '____0000-0000-0000-%';
    SELECT COUNT(*) INTO v_users FROM public.profiles WHERE email LIKE '%@test.local';
    SELECT COUNT(*) INTO v_assignments FROM public.user_org_roles WHERE org_id LIKE '____0000-0000-0000-%';
    SELECT COUNT(*) INTO v_roles_count FROM public.roles WHERE id LIKE '________-____-____-____-____________';
    SELECT COUNT(*) INTO v_statuses FROM public.reservation_statuses;
    SELECT COUNT(*) INTO v_reservations FROM public.reservations WHERE id LIKE 'RESV-%';

    RAISE NOTICE '[01_seed] Orgs: %, Users: %, Assignments: %, Roles: %, Statuses: %, Reservations: %',
        v_orgs, v_users, v_assignments, v_roles_count, v_statuses, v_reservations;

    IF v_orgs < 3 THEN RAISE EXCEPTION '[01_seed] Faltan organizaciones (esperado >=3, actual %)', v_orgs; END IF;
    IF v_users < 5 THEN RAISE EXCEPTION '[01_seed] Faltan usuarios (esperado >=5, actual %)', v_users; END IF;
    IF v_assignments < 4 THEN RAISE EXCEPTION '[01_seed] Faltan asignaciones (esperado >=4, actual %)', v_assignments; END IF;
    IF v_roles_count < 4 THEN RAISE EXCEPTION '[01_seed] Faltan roles (esperado >=4, actual %)', v_roles_count; END IF;
    IF v_statuses < 17 THEN RAISE WARNING '[01_seed] Pocos statuses (esperado >=17, actual %)', v_statuses; END IF;
    IF v_reservations < 2 THEN RAISE EXCEPTION '[01_seed] Faltan reservas (esperado >=2, actual %)', v_reservations; END IF;

    RAISE NOTICE '[01_seed] Datos de prueba listos.';
END $$;

COMMIT;