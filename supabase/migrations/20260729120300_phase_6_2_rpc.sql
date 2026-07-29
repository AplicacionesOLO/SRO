-- ===========================================================================
-- PHASE 6.2 — TRANSITION ENGINE: RPC Main
-- Migration: 20260729120300_phase_6_2_rpc.sql
-- ===========================================================================
-- Centralized status transition RPC + GRANT/REVOKE + RLS write revokes.
-- FIXES applied (2026-07-29 audit):
--   H-CRIT-001: message_template → COALESCE(description, name, code)
--   H-CRIT-004: fingerprint + idempotency check in steps 07 and 08
--   H-HIGH-005: NULL guard on R11 lookup with fallback message
-- ===========================================================================

BEGIN;

-- ===========================================================================
-- RPC: public.transition_reservation_status
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.transition_reservation_status(
    p_reservation_id    UUID,
    p_target_status_id  UUID,
    p_reason            TEXT    DEFAULT 'Status transition via RPC',
    p_source            TEXT    DEFAULT 'system',
    p_idempotency_key   UUID,
    p_metadata          JSONB   DEFAULT ''::jsonb,
    p_actor_user_id     UUID    DEFAULT NULL
)
RETURNS TABLE(
    success               BOOLEAN,
    allowed               BOOLEAN,
    reservation_id        UUID,
    org_id                UUID,
    previous_status_id    UUID,
    previous_status_code  TEXT,
    target_status_id      UUID,
    target_status_code    TEXT,
    resulting_status_id   UUID,
    resulting_status_code TEXT,
    attempt_id            UUID,
    incident_ids          UUID[],
    applied_rule_codes    TEXT[],
    blocking_rule_codes   TEXT[],
    warnings              TEXT[],
    idempotent_replay     BOOLEAN,
    override_applied      BOOLEAN,
    error_code            TEXT,
    error_message         TEXT,
    executed_at           TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'pg_catalog', 'public'
AS $$
DECLARE
    v_start_ts           TIMESTAMPTZ;
    v_executed_at        TIMESTAMPTZ;
    v_actor              UUID;
    v_actor_type         TEXT;
    v_is_service_role    BOOLEAN;
    v_reservation        RECORD;
    v_org_id             UUID;
    v_prev_status_id     UUID;
    v_prev_status_code   TEXT;
    v_target_code        TEXT;
    v_target_name        TEXT;
    v_target_active      BOOLEAN;
    v_is_reopen          BOOLEAN := false;
    v_is_override        BOOLEAN := false;
    v_override_applied   BOOLEAN := false;
    v_transition_allowed BOOLEAN := true;
    v_fingerprint        TEXT;
    v_existing_attempt   RECORD;
    v_attempt_id         UUID;
    v_attempt_result     TEXT;
    v_rule               RECORD;
    v_rules_evaluated    INTEGER := 0;
    v_allowed            BOOLEAN := true;
    v_applied_codes      TEXT[] := ARRAY[]::TEXT[];
    v_blocking_codes     TEXT[] := ARRAY[]::TEXT[];
    v_warning_msgs       TEXT[] := ARRAY[]::TEXT[];
    v_incident_ids       UUID[] := ARRAY[]::UUID[];
    v_incident_rec       RECORD;
    v_result_status_id   UUID;
    v_result_status_code TEXT;
    v_old_value          JSONB;
    v_new_value          JSONB;
    v_err_code           TEXT;
    v_err_msg            TEXT;
    v_admin_type         TEXT;
    v_admin_sev          TEXT;
    v_audit_action       TEXT;
    v_rule_id_for_inc    UUID;
    v_rule_message       TEXT;
BEGIN
    v_start_ts := now();

    -- ========================================================================
    -- 01. Resolve actor via helper
    -- ========================================================================
    SELECT a.actor_id, a.actor_type, a.error_code, a.error_message
    INTO v_actor, v_actor_type, v_err_code, v_err_msg
    FROM public._inout_resolve_transition_actor(p_actor_user_id) a;

    IF v_err_code IS NOT NULL THEN
        v_executed_at := now();
        success               := false;
        allowed               := false;
        reservation_id        := p_reservation_id;
        org_id                := NULL;
        previous_status_id    := NULL;
        previous_status_code  := NULL;
        target_status_id      := p_target_status_id;
        target_status_code    := NULL;
        resulting_status_id   := NULL;
        resulting_status_code := NULL;
        attempt_id            := NULL;
        incident_ids          := ARRAY[]::UUID[];
        applied_rule_codes    := ARRAY[]::TEXT[];
        blocking_rule_codes   := ARRAY[]::TEXT[];
        warnings              := ARRAY[]::TEXT[];
        idempotent_replay     := false;
        override_applied      := false;
        error_code            := v_err_code;
        error_message         := v_err_msg;
        executed_at           := v_executed_at;
        RETURN NEXT;
        RETURN;
    END IF;

    v_is_service_role := (auth.role() = 'service_role');

    -- ========================================================================
    -- 02. Validate idempotency_key
    -- ========================================================================
    IF p_idempotency_key IS NULL THEN
        v_executed_at := now();
        success               := false; allowed := false;
        reservation_id        := p_reservation_id; org_id := NULL;
        previous_status_id    := NULL; previous_status_code := NULL;
        target_status_id      := p_target_status_id; target_status_code := NULL;
        resulting_status_id   := NULL; resulting_status_code := NULL;
        attempt_id            := NULL; incident_ids := ARRAY[]::UUID[];
        applied_rule_codes    := ARRAY[]::TEXT[]; blocking_rule_codes := ARRAY[]::TEXT[];
        warnings              := ARRAY[]::TEXT[]; idempotent_replay := false;
        override_applied      := false;
        error_code            := 'IDEMPOTENCY_KEY_REQUIRED';
        error_message         := 'p_idempotency_key UUID es obligatorio.';
        executed_at           := v_executed_at;
        RETURN NEXT; RETURN;
    END IF;

    -- ========================================================================
    -- 03. Find reservation (preliminary, no lock)
    -- ========================================================================
    SELECT r.id, r.org_id, r.status_id, r.is_cancelled,
           r.cancel_reason, r.cancelled_by, r.cancelled_at, r.dock_id
    INTO v_reservation
    FROM public.reservations r WHERE r.id = p_reservation_id;

    IF v_reservation.id IS NULL THEN
        v_executed_at := now();
        success := false; allowed := false;
        reservation_id := p_reservation_id; org_id := NULL;
        previous_status_id := NULL; previous_status_code := NULL;
        target_status_id := p_target_status_id; target_status_code := NULL;
        resulting_status_id := NULL; resulting_status_code := NULL;
        attempt_id := NULL; incident_ids := ARRAY[]::UUID[];
        applied_rule_codes := ARRAY[]::TEXT[]; blocking_rule_codes := ARRAY[]::TEXT[];
        warnings := ARRAY[]::TEXT[]; idempotent_replay := false;
        override_applied := false;
        error_code := 'RESERVATION_NOT_FOUND';
        error_message := 'La reserva no existe.';
        executed_at := v_executed_at;
        RETURN NEXT; RETURN;
    END IF;

    v_org_id := v_reservation.org_id;
    v_prev_status_id := v_reservation.status_id;

    -- ========================================================================
    -- 04. Validate org membership (bypassed for service_role)
    -- ========================================================================
    IF NOT v_is_service_role THEN
        IF NOT EXISTS (SELECT 1 FROM public.user_org_roles
                       WHERE user_id = v_actor AND org_id = v_org_id) THEN
            v_executed_at := now();
            success := false; allowed := false;
            reservation_id := p_reservation_id; org_id := v_org_id;
            previous_status_id := v_prev_status_id; previous_status_code := NULL;
            target_status_id := p_target_status_id; target_status_code := NULL;
            resulting_status_id := NULL; resulting_status_code := NULL;
            attempt_id := NULL; incident_ids := ARRAY[]::UUID[];
            applied_rule_codes := ARRAY[]::TEXT[]; blocking_rule_codes := ARRAY[]::TEXT[];
            warnings := ARRAY[]::TEXT[]; idempotent_replay := false;
            override_applied := false;
            error_code := 'ORG_MISMATCH';
            error_message := 'Usuario no pertenece a la organizacion de la reserva.';
            executed_at := v_executed_at;
            RETURN NEXT; RETURN;
        END IF;
    END IF;

    -- ========================================================================
    -- 05. Validate target status
    -- ========================================================================
    SELECT s.code, s.name, s.is_active INTO v_target_code, v_target_name, v_target_active
    FROM public.reservation_statuses s WHERE s.id = p_target_status_id;

    IF v_target_code IS NULL THEN
        v_executed_at := now();
        success := false; allowed := false;
        reservation_id := p_reservation_id; org_id := v_org_id;
        previous_status_id := v_prev_status_id; previous_status_code := NULL;
        target_status_id := p_target_status_id; target_status_code := NULL;
        resulting_status_id := NULL; resulting_status_code := NULL;
        attempt_id := NULL; incident_ids := ARRAY[]::UUID[];
        applied_rule_codes := ARRAY[]::TEXT[]; blocking_rule_codes := ARRAY[]::TEXT[];
        warnings := ARRAY[]::TEXT[]; idempotent_replay := false;
        override_applied := false;
        error_code := 'INVALID_TARGET_STATUS';
        error_message := 'Estado destino no existe.';
        executed_at := v_executed_at;
        RETURN NEXT; RETURN;
    END IF;

    IF NOT v_target_active THEN
        v_executed_at := now();
        success := false; allowed := false;
        reservation_id := p_reservation_id; org_id := v_org_id;
        previous_status_id := v_prev_status_id; previous_status_code := NULL;
        target_status_id := p_target_status_id; target_status_code := v_target_code;
        resulting_status_id := NULL; resulting_status_code := NULL;
        attempt_id := NULL; incident_ids := ARRAY[]::UUID[];
        applied_rule_codes := ARRAY[]::TEXT[]; blocking_rule_codes := ARRAY[]::TEXT[];
        warnings := ARRAY[]::TEXT[]; idempotent_replay := false;
        override_applied := false;
        error_code := 'INACTIVE_TARGET_STATUS';
        error_message := 'Estado destino inactivo.';
        executed_at := v_executed_at;
        RETURN NEXT; RETURN;
    END IF;

    -- ========================================================================
    -- 06. Previous status code
    -- ========================================================================
    IF v_prev_status_id IS NOT NULL THEN
        SELECT s.code INTO v_prev_status_code
        FROM public.reservation_statuses s WHERE s.id = v_prev_status_id;
    END IF;

    -- ========================================================================
    -- 07. Build fingerprint (moved earlier for all-attempt coverage)
    --     Fingerprint: (reservation_id, target_status_id, source, actor, org_id)
    --     EXCLUDES: reason, metadata
    -- ========================================================================
    v_fingerprint := public._inout_build_transition_fingerprint(
        p_reservation_id, p_target_status_id, p_source, v_actor, v_org_id
    );

    -- ========================================================================
    -- 08. Validate permission transitions.execute (with idempotency)
    -- ========================================================================
    IF NOT v_is_service_role THEN
        IF NOT public.inout_has_permission(v_actor, v_org_id, 'casetilla.flow_report.transitions.execute') THEN
            -- Check idempotency first
            SELECT a.id, a.result, a.applied_status_id,
                   a.metadata_json->>'fingerprint' AS stored_fp
            INTO v_existing_attempt
            FROM public.inout_state_transition_attempts a
            WHERE a.org_id = v_org_id AND a.idempotency_key = p_idempotency_key;

            IF v_existing_attempt.id IS NOT NULL THEN
                IF v_existing_attempt.stored_fp IS NOT NULL
                   AND v_existing_attempt.stored_fp = v_fingerprint THEN
                    v_executed_at := now();
                    success := true;
                    allowed := (v_existing_attempt.result IN ('allowed','override','no_op','allowed_by_override'));
                    reservation_id := p_reservation_id; org_id := v_org_id;
                    previous_status_id := v_prev_status_id; previous_status_code := v_prev_status_code;
                    target_status_id := p_target_status_id; target_status_code := v_target_code;
                    resulting_status_id := v_existing_attempt.applied_status_id;
                    resulting_status_code := (SELECT s.code FROM public.reservation_statuses s WHERE s.id = v_existing_attempt.applied_status_id);
                    attempt_id := v_existing_attempt.id; incident_ids := ARRAY[]::UUID[];
                    applied_rule_codes := ARRAY[]::TEXT[]; blocking_rule_codes := ARRAY[]::TEXT[];
                    warnings := ARRAY[]::TEXT[]; idempotent_replay := true;
                    override_applied := false;
                    error_code := NULL; error_message := NULL;
                    executed_at := v_executed_at;
                    RETURN NEXT; RETURN;
                ELSE
                    v_executed_at := now();
                    success := false; allowed := false;
                    reservation_id := p_reservation_id; org_id := v_org_id;
                    previous_status_id := v_prev_status_id; previous_status_code := v_prev_status_code;
                    target_status_id := p_target_status_id; target_status_code := v_target_code;
                    resulting_status_id := v_prev_status_id; resulting_status_code := v_prev_status_code;
                    attempt_id := NULL; incident_ids := ARRAY[]::UUID[];
                    applied_rule_codes := ARRAY[]::TEXT[]; blocking_rule_codes := ARRAY[]::TEXT[];
                    warnings := ARRAY[]::TEXT[]; idempotent_replay := false;
                    override_applied := false;
                    error_code := 'IDEMPOTENCY_CONFLICT';
                    error_message := 'Misma llave UUID, parametros diferentes.';
                    executed_at := v_executed_at;
                    RETURN NEXT; RETURN;
                END IF;
            END IF;

            -- No existing attempt: insert with fingerprint
            INSERT INTO public.inout_state_transition_attempts (
                org_id, reservation_id, previous_status_id, requested_status_id,
                applied_status_id, result, attempted_by, source,
                idempotency_key, metadata_json,
                override_requested, override_authorized, blocked_reason, attempted_at
            ) VALUES (
                v_org_id, p_reservation_id, v_prev_status_id, p_target_status_id,
                v_prev_status_id, 'failed_validation', v_actor, p_source,
                p_idempotency_key,
                jsonb_build_object('fingerprint', v_fingerprint,
                    'applied_rules', ARRAY[]::TEXT[],
                    'blocking_rules', ARRAY[]::TEXT[]),
                false, false, 'Sin permiso transitions.execute', v_start_ts
            ) RETURNING id INTO v_attempt_id;

            INSERT INTO public.inout_flow_audit_log (
                org_id, entity_type, entity_id, action, old_value, new_value, user_id, created_at
            ) VALUES (
                v_org_id, 'reservation', p_reservation_id, 'status_transition_blocked',
                jsonb_build_object('status_id', v_prev_status_id, 'status_code', v_prev_status_code),
                jsonb_build_object('status_id', p_target_status_id, 'status_code', v_target_code,
                                   'error', 'USER_NOT_AUTHORIZED'),
                v_actor, now()
            );

            v_executed_at := now();
            success := false; allowed := false;
            reservation_id := p_reservation_id; org_id := v_org_id;
            previous_status_id := v_prev_status_id; previous_status_code := v_prev_status_code;
            target_status_id := p_target_status_id; target_status_code := v_target_code;
            resulting_status_id := v_prev_status_id; resulting_status_code := v_prev_status_code;
            attempt_id := v_attempt_id; incident_ids := ARRAY[]::UUID[];
            applied_rule_codes := ARRAY[]::TEXT[]; blocking_rule_codes := ARRAY[]::TEXT[];
            warnings := ARRAY[]::TEXT[]; idempotent_replay := false;
            override_applied := false;
            error_code := 'USER_NOT_AUTHORIZED';
            error_message := 'Sin permiso transitions.execute.';
            executed_at := v_executed_at;
            RETURN NEXT; RETURN;
        END IF;
    END IF;

    -- ========================================================================
    -- 09. SAME_STATUS check (with idempotency)
    -- ========================================================================
    IF v_prev_status_id IS NOT NULL AND v_prev_status_id = p_target_status_id THEN
        -- Check idempotency first
        SELECT a.id, a.result, a.applied_status_id,
               a.metadata_json->>'fingerprint' AS stored_fp
        INTO v_existing_attempt
        FROM public.inout_state_transition_attempts a
        WHERE a.org_id = v_org_id AND a.idempotency_key = p_idempotency_key;

        IF v_existing_attempt.id IS NOT NULL THEN
            IF v_existing_attempt.stored_fp IS NOT NULL
               AND v_existing_attempt.stored_fp = v_fingerprint THEN
                SELECT COALESCE(array_agg(ar.incident_id)
                       FILTER (WHERE ar.incident_id IS NOT NULL), ARRAY[]::UUID[])
                INTO v_incident_ids
                FROM public.inout_transition_attempt_rules ar
                WHERE ar.attempt_id = v_existing_attempt.id;

                v_executed_at := now();
                success := true;
                allowed := (v_existing_attempt.result IN ('allowed','override','no_op','allowed_by_override'));
                reservation_id := p_reservation_id; org_id := v_org_id;
                previous_status_id := v_prev_status_id; previous_status_code := v_prev_status_code;
                target_status_id := p_target_status_id; target_status_code := v_target_code;
                resulting_status_id := v_existing_attempt.applied_status_id;
                resulting_status_code := v_prev_status_code;
                attempt_id := v_existing_attempt.id; incident_ids := v_incident_ids;
                applied_rule_codes := ARRAY[]::TEXT[]; blocking_rule_codes := ARRAY[]::TEXT[];
                warnings := ARRAY[]::TEXT[]; idempotent_replay := true;
                override_applied := false;
                error_code := NULL; error_message := NULL;
                executed_at := v_executed_at;
                RETURN NEXT; RETURN;
            ELSE
                v_executed_at := now();
                success := false; allowed := false;
                reservation_id := p_reservation_id; org_id := v_org_id;
                previous_status_id := v_prev_status_id; previous_status_code := v_prev_status_code;
                target_status_id := p_target_status_id; target_status_code := v_target_code;
                resulting_status_id := v_prev_status_id; resulting_status_code := v_prev_status_code;
                attempt_id := NULL; incident_ids := ARRAY[]::UUID[];
                applied_rule_codes := ARRAY[]::TEXT[]; blocking_rule_codes := ARRAY[]::TEXT[];
                warnings := ARRAY[]::TEXT[]; idempotent_replay := false;
                override_applied := false;
                error_code := 'IDEMPOTENCY_CONFLICT';
                error_message := 'Misma llave UUID, parametros diferentes.';
                executed_at := v_executed_at;
                RETURN NEXT; RETURN;
            END IF;
        END IF;

        -- No existing attempt: insert NO_OP with fingerprint (audit only for first attempt)
        INSERT INTO public.inout_state_transition_attempts (
            org_id, reservation_id, previous_status_id, requested_status_id,
            applied_status_id, result, attempted_by, source,
            idempotency_key, metadata_json,
            override_requested, override_authorized, attempted_at
        ) VALUES (
            v_org_id, p_reservation_id, v_prev_status_id, p_target_status_id,
            v_prev_status_id, 'no_op', v_actor, p_source,
            p_idempotency_key,
            jsonb_build_object('fingerprint', v_fingerprint,
                'applied_rules', ARRAY[]::TEXT[],
                'blocking_rules', ARRAY[]::TEXT[]),
            false, false, v_start_ts
        ) RETURNING id INTO v_attempt_id;

        INSERT INTO public.inout_flow_audit_log (
            org_id, entity_type, entity_id, action, old_value, new_value, user_id, created_at
        ) VALUES (
            v_org_id, 'reservation', p_reservation_id, 'status_transition_no_op',
            jsonb_build_object('status_id', v_prev_status_id, 'status_code', v_prev_status_code),
            jsonb_build_object('status_id', v_prev_status_id, 'status_code', v_prev_status_code),
            v_actor, now()
        );

        v_executed_at := now();
        success := true; allowed := true;
        reservation_id := p_reservation_id; org_id := v_org_id;
        previous_status_id := v_prev_status_id; previous_status_code := v_prev_status_code;
        target_status_id := p_target_status_id; target_status_code := v_target_code;
        resulting_status_id := v_prev_status_id; resulting_status_code := v_prev_status_code;
        attempt_id := v_attempt_id; incident_ids := ARRAY[]::UUID[];
        applied_rule_codes := ARRAY[]::TEXT[]; blocking_rule_codes := ARRAY[]::TEXT[];
        warnings := ARRAY[]::TEXT[]; idempotent_replay := false;
        override_applied := false;
        error_code := NULL; error_message := NULL;
        executed_at := v_executed_at;
        RETURN NEXT; RETURN;
    END IF;

    -- ========================================================================
    -- 10. NULL → only PENDING
    -- ========================================================================
    IF v_prev_status_id IS NULL AND v_target_code != 'PENDING' THEN
        v_executed_at := now();
        success := false; allowed := false;
        reservation_id := p_reservation_id; org_id := v_org_id;
        previous_status_id := NULL; previous_status_code := NULL;
        target_status_id := p_target_status_id; target_status_code := v_target_code;
        resulting_status_id := NULL; resulting_status_code := NULL;
        attempt_id := NULL; incident_ids := ARRAY[]::UUID[];
        applied_rule_codes := ARRAY[]::TEXT[]; blocking_rule_codes := ARRAY[]::TEXT[];
        warnings := ARRAY[]::TEXT[]; idempotent_replay := false;
        override_applied := false;
        error_code := 'TRANSITION_NOT_ALLOWED';
        error_message := 'NULL solo permite primera transicion a PENDING.';
        executed_at := v_executed_at;
        RETURN NEXT; RETURN;
    END IF;

    -- ========================================================================
    -- 11. Reason required
    -- ========================================================================
    v_is_reopen := v_prev_status_code IN ('DISPATCHED','DONE','CANCELLED','NO_SHOW');
    IF (v_target_code IN ('CANCELLED','NO_SHOW') OR v_is_reopen) THEN
        IF p_reason IS NULL OR trim(p_reason) = '' THEN
            v_executed_at := now();
            success := false; allowed := false;
            reservation_id := p_reservation_id; org_id := v_org_id;
            previous_status_id := v_prev_status_id; previous_status_code := v_prev_status_code;
            target_status_id := p_target_status_id; target_status_code := v_target_code;
            resulting_status_id := v_prev_status_id; resulting_status_code := v_prev_status_code;
            attempt_id := NULL; incident_ids := ARRAY[]::UUID[];
            applied_rule_codes := ARRAY[]::TEXT[]; blocking_rule_codes := ARRAY[]::TEXT[];
            warnings := ARRAY[]::TEXT[]; idempotent_replay := false;
            override_applied := false;
            error_code := 'REASON_REQUIRED';
            error_message := 'Operacion requiere p_reason no vacio.';
            executed_at := v_executed_at;
            RETURN NEXT; RETURN;
        END IF;
    END IF;

    -- ========================================================================
    -- 12. Idempotency check (preliminary, no lock)
    --     Fingerprint already computed in step 07.
    -- ========================================================================
    SELECT a.id, a.result, a.applied_status_id,
           a.metadata_json->>'fingerprint' AS stored_fp
    INTO v_existing_attempt
    FROM public.inout_state_transition_attempts a
    WHERE a.org_id = v_org_id AND a.idempotency_key = p_idempotency_key;

    IF v_existing_attempt.id IS NOT NULL THEN
        IF v_existing_attempt.stored_fp IS NOT NULL
           AND v_existing_attempt.stored_fp = v_fingerprint THEN
            -- Replay: recover incident_ids
            SELECT COALESCE(array_agg(ar.incident_id)
                   FILTER (WHERE ar.incident_id IS NOT NULL), ARRAY[]::UUID[])
            INTO v_incident_ids
            FROM public.inout_transition_attempt_rules ar
            WHERE ar.attempt_id = v_existing_attempt.id;

            v_executed_at := now();
            success := true;
            allowed := (v_existing_attempt.result IN ('allowed','override','no_op','allowed_by_override'));
            reservation_id := p_reservation_id; org_id := v_org_id;
            previous_status_id := v_prev_status_id; previous_status_code := v_prev_status_code;
            target_status_id := p_target_status_id; target_status_code := v_target_code;
            resulting_status_id := v_existing_attempt.applied_status_id;
            resulting_status_code := (SELECT s.code FROM public.reservation_statuses s WHERE s.id = v_existing_attempt.applied_status_id);
            attempt_id := v_existing_attempt.id; incident_ids := v_incident_ids;
            applied_rule_codes := ARRAY[]::TEXT[]; blocking_rule_codes := ARRAY[]::TEXT[];
            warnings := ARRAY[]::TEXT[]; idempotent_replay := true;
            override_applied := (v_existing_attempt.result = 'override');
            error_code := NULL; error_message := NULL;
            executed_at := v_executed_at;
            RETURN NEXT; RETURN;
        ELSE
            v_executed_at := now();
            success := false; allowed := false;
            reservation_id := p_reservation_id; org_id := v_org_id;
            previous_status_id := v_prev_status_id; previous_status_code := v_prev_status_code;
            target_status_id := p_target_status_id; target_status_code := v_target_code;
            resulting_status_id := v_prev_status_id; resulting_status_code := v_prev_status_code;
            attempt_id := NULL; incident_ids := ARRAY[]::UUID[];
            applied_rule_codes := ARRAY[]::TEXT[]; blocking_rule_codes := ARRAY[]::TEXT[];
            warnings := ARRAY[]::TEXT[]; idempotent_replay := false;
            override_applied := false;
            error_code := 'IDEMPOTENCY_CONFLICT';
            error_message := 'Misma llave UUID, parametros diferentes.';
            executed_at := v_executed_at;
            RETURN NEXT; RETURN;
        END IF;
    END IF;

    -- ========================================================================
    -- 13. ACQUIRE LOCK
    -- ========================================================================
    PERFORM r.id FROM public.reservations r WHERE r.id = p_reservation_id FOR UPDATE;

    SELECT r.status_id, r.is_cancelled, r.dock_id
    INTO v_reservation.status_id, v_reservation.is_cancelled, v_reservation.dock_id
    FROM public.reservations r WHERE r.id = p_reservation_id;

    v_prev_status_id := v_reservation.status_id;
    IF v_prev_status_id IS NOT NULL THEN
        SELECT s.code INTO v_prev_status_code
        FROM public.reservation_statuses s WHERE s.id = v_prev_status_id;
    ELSE
        v_prev_status_code := NULL;
    END IF;

    -- ========================================================================
    -- 14. Validate transition graph
    -- ========================================================================
    v_is_reopen := (v_prev_status_code IN ('DISPATCHED','DONE','CANCELLED','NO_SHOW'));

    -- Re-check NULL post-lock
    IF v_prev_status_id IS NULL AND v_target_code != 'PENDING' THEN
        v_executed_at := now();
        success := false; allowed := false;
        reservation_id := p_reservation_id; org_id := v_org_id;
        previous_status_id := NULL; previous_status_code := NULL;
        target_status_id := p_target_status_id; target_status_code := v_target_code;
        resulting_status_id := NULL; resulting_status_code := NULL;
        attempt_id := NULL; incident_ids := ARRAY[]::UUID[];
        applied_rule_codes := ARRAY[]::TEXT[]; blocking_rule_codes := ARRAY[]::TEXT[];
        warnings := ARRAY[]::TEXT[]; idempotent_replay := false;
        override_applied := false;
        error_code := 'TRANSITION_NOT_ALLOWED';
        error_message := 'NULL solo permite PENDING.';
        executed_at := v_executed_at;
        RETURN NEXT; RETURN;
    END IF;

    -- Forward-only graph check (non-reopen, non-cancel, non-no-show)
    IF NOT v_is_reopen AND v_target_code NOT IN ('CANCELLED','NO_SHOW') THEN
        IF NOT (
            (v_prev_status_code = 'PENDING'   AND v_target_code = 'CONFIRMED') OR
            (v_prev_status_code = 'CONFIRMED' AND v_target_code = 'ARRIVED_PENDING_UNLOAD') OR
            (v_prev_status_code = 'ARRIVED_PENDING_UNLOAD' AND v_target_code = 'IN_PROGRESS') OR
            (v_prev_status_code = 'IN_PROGRESS' AND v_target_code = 'PENDING_DISCHARGE') OR
            (v_prev_status_code = 'PENDING_DISCHARGE' AND v_target_code = 'START') OR
            (v_prev_status_code = 'START'      AND v_target_code = 'UNLOADING') OR
            (v_prev_status_code = 'UNLOADING'  AND v_target_code = 'DISCHARGED') OR
            (v_prev_status_code = 'DISCHARGED' AND v_target_code = 'DISPATCHED') OR
            (v_prev_status_code = 'DISPATCHED' AND v_target_code = 'DONE')
        ) THEN
            v_transition_allowed := false;
        END IF;
    END IF;

    -- ========================================================================
    -- 15. Override determination
    -- ========================================================================
    v_is_override := false;
    v_override_applied := false;

    IF v_is_reopen THEN
        IF v_prev_status_code = 'DONE' THEN
            IF NOT v_is_service_role THEN
                IF NOT public.inout_has_permission(v_actor, v_org_id, 'casetilla.flow_report.incidents.override') THEN
                    -- Insert attempt + R11 incident
                    INSERT INTO public.inout_state_transition_attempts (
                        org_id, reservation_id, previous_status_id, requested_status_id,
                        applied_status_id, result, attempted_by, source,
                        idempotency_key, metadata_json,
                        override_requested, override_authorized, blocked_reason, attempted_at
                    ) VALUES (
                        v_org_id, p_reservation_id, v_prev_status_id, p_target_status_id,
                        v_prev_status_id, 'blocked', v_actor, p_source,
                        p_idempotency_key,
                        jsonb_build_object('fingerprint', v_fingerprint,
                            'applied_rules', ARRAY['DONE_REOPEN_ATTEMPT'],
                            'blocking_rules', ARRAY['DONE_REOPEN_ATTEMPT']),
                        true, false, 'DONE terminal cerrado. Override requiere incidents.override.', v_start_ts
                    ) RETURNING id INTO v_attempt_id;

                    -- Find R11 rule_id (with NULL guard — if not found, use descriptive message)
                    SELECT id INTO v_rule_id_for_inc
                    FROM public.inout_flow_rules
                    WHERE code = 'DONE_REOPEN_ATTEMPT' AND org_id = v_org_id AND is_active = true
                    LIMIT 1;

                    SELECT inc.incident_id, inc.is_new INTO v_incident_rec
                    FROM public._inout_create_transition_incident(
                        v_org_id, v_attempt_id, p_reservation_id,
                        v_rule_id_for_inc,
                        CASE WHEN v_rule_id_for_inc IS NOT NULL THEN 'DONE_REOPEN_ATTEMPT' ELSE 'admin_override' END,
                        'alta', p_idempotency_key
                    ) inc;
                    IF v_incident_rec.incident_id IS NOT NULL THEN
                        v_incident_ids := array_append(v_incident_ids, v_incident_rec.incident_id);
                    END IF;

                    INSERT INTO public.inout_flow_audit_log (
                        org_id, entity_type, entity_id, action, old_value, new_value, user_id, created_at
                    ) VALUES (
                        v_org_id, 'reservation', p_reservation_id, 'status_transition_blocked',
                        jsonb_build_object('status_id', v_prev_status_id, 'status_code', v_prev_status_code),
                        jsonb_build_object('status_id', p_target_status_id, 'status_code', v_target_code,
                                           'error', 'TERMINAL_STATE_BLOCKED', 'rule', 'DONE_REOPEN_ATTEMPT'),
                        v_actor, now()
                    );

                    v_executed_at := now();
                    success := true; allowed := false;
                    reservation_id := p_reservation_id; org_id := v_org_id;
                    previous_status_id := v_prev_status_id; previous_status_code := v_prev_status_code;
                    target_status_id := p_target_status_id; target_status_code := v_target_code;
                    resulting_status_id := v_prev_status_id; resulting_status_code := v_prev_status_code;
                    attempt_id := v_attempt_id; incident_ids := v_incident_ids;
                    applied_rule_codes := ARRAY['DONE_REOPEN_ATTEMPT'];
                    blocking_rule_codes := ARRAY['DONE_REOPEN_ATTEMPT'];
                    warnings := ARRAY[]::TEXT[]; idempotent_replay := false;
                    override_applied := false;
                    error_code := 'TERMINAL_STATE_BLOCKED';
                    error_message := 'DONE terminal cerrado. Override requiere incidents.override.';
                    executed_at := v_executed_at;
                    RETURN NEXT; RETURN;
                END IF;
            END IF;
            v_is_override := true;
            v_override_applied := true;
            v_transition_allowed := true;
        ELSE
            -- DISPATCHED/CANCELLED/NO_SHOW reopen
            IF NOT v_is_service_role THEN
                IF NOT public.inout_has_permission(v_actor, v_org_id, 'casetilla.flow_report.incidents.override') THEN
                    v_executed_at := now();
                    success := false; allowed := false;
                    reservation_id := p_reservation_id; org_id := v_org_id;
                    previous_status_id := v_prev_status_id; previous_status_code := v_prev_status_code;
                    target_status_id := p_target_status_id; target_status_code := v_target_code;
                    resulting_status_id := v_prev_status_id; resulting_status_code := v_prev_status_code;
                    attempt_id := NULL; incident_ids := ARRAY[]::UUID[];
                    applied_rule_codes := ARRAY[]::TEXT[]; blocking_rule_codes := ARRAY[]::TEXT[];
                    warnings := ARRAY[]::TEXT[]; idempotent_replay := false;
                    override_applied := false;
                    error_code := 'OVERRIDE_NOT_AUTHORIZED';
                    error_message := 'Reapertura requiere incidents.override.';
                    executed_at := v_executed_at;
                    RETURN NEXT; RETURN;
                END IF;
            END IF;
            v_is_override := true;
            v_override_applied := true;
            v_transition_allowed := true;
        END IF;
    END IF;

    -- ========================================================================
    -- 16. Block invalid forward transitions
    -- ========================================================================
    IF NOT v_transition_allowed AND NOT v_is_override THEN
        INSERT INTO public.inout_state_transition_attempts (
            org_id, reservation_id, previous_status_id, requested_status_id,
            applied_status_id, result, attempted_by, source,
            idempotency_key, metadata_json,
            override_requested, override_authorized, blocked_reason, attempted_at
        ) VALUES (
            v_org_id, p_reservation_id, v_prev_status_id, p_target_status_id,
            v_prev_status_id, 'failed_validation', v_actor, p_source,
            p_idempotency_key, jsonb_build_object('fingerprint', v_fingerprint),
            false, false,
            'Transicion fuera del grafo: ' || coalesce(v_prev_status_code,'NULL') || ' > ' || v_target_code,
            v_start_ts
        ) RETURNING id INTO v_attempt_id;

        INSERT INTO public.inout_flow_audit_log (
            org_id, entity_type, entity_id, action, old_value, new_value, user_id, created_at
        ) VALUES (
            v_org_id, 'reservation', p_reservation_id, 'status_transition_blocked',
            jsonb_build_object('status_id', v_prev_status_id, 'status_code', v_prev_status_code),
            jsonb_build_object('status_id', p_target_status_id, 'status_code', v_target_code,
                               'error', 'TRANSITION_NOT_ALLOWED'),
            v_actor, now()
        );

        v_executed_at := now();
        success := false; allowed := false;
        reservation_id := p_reservation_id; org_id := v_org_id;
        previous_status_id := v_prev_status_id; previous_status_code := v_prev_status_code;
        target_status_id := p_target_status_id; target_status_code := v_target_code;
        resulting_status_id := v_prev_status_id; resulting_status_code := v_prev_status_code;
        attempt_id := v_attempt_id; incident_ids := ARRAY[]::UUID[];
        applied_rule_codes := ARRAY[]::TEXT[]; blocking_rule_codes := ARRAY[]::TEXT[];
        warnings := ARRAY[]::TEXT[]; idempotent_replay := false;
        override_applied := false;
        error_code := 'TRANSITION_NOT_ALLOWED';
        error_message := 'Transicion fuera del grafo permitido.';
        executed_at := v_executed_at;
        RETURN NEXT; RETURN;
    END IF;

    -- ========================================================================
    -- 17. Persist attempt (post-lock, definitive)
    -- ========================================================================
    v_attempt_result := CASE WHEN v_is_override THEN 'override' ELSE 'allowed' END;

    INSERT INTO public.inout_state_transition_attempts (
        org_id, reservation_id, previous_status_id, requested_status_id,
        applied_status_id, result, attempted_by, source,
        idempotency_key, metadata_json,
        override_requested, override_authorized, attempted_at
    ) VALUES (
        v_org_id, p_reservation_id, v_prev_status_id, p_target_status_id,
        CASE WHEN v_attempt_result IN ('allowed','override') THEN p_target_status_id ELSE v_prev_status_id END,
        v_attempt_result, v_actor, p_source,
        p_idempotency_key, jsonb_build_object('fingerprint', v_fingerprint),
        v_is_override, v_override_applied, v_start_ts
    )
    ON CONFLICT (org_id, idempotency_key) DO NOTHING
    RETURNING id INTO v_attempt_id;

    -- If ON CONFLICT swallowed the insert, recover the existing attempt
    IF v_attempt_id IS NULL THEN
        SELECT a.id, a.metadata_json->>'fingerprint' AS stored_fp
        INTO v_existing_attempt
        FROM public.inout_state_transition_attempts a
        WHERE a.org_id = v_org_id AND a.idempotency_key = p_idempotency_key;

        IF v_existing_attempt.stored_fp IS NOT NULL
           AND v_existing_attempt.stored_fp = v_fingerprint THEN
            -- Replay: use existing attempt
            v_attempt_id := v_existing_attempt.id;

            SELECT COALESCE(array_agg(ar.incident_id)
                   FILTER (WHERE ar.incident_id IS NOT NULL), ARRAY[]::UUID[])
            INTO v_incident_ids
            FROM public.inout_transition_attempt_rules ar
            WHERE ar.attempt_id = v_attempt_id;

            v_executed_at := now();
            success := true;
            allowed := true;
            reservation_id := p_reservation_id; org_id := v_org_id;
            previous_status_id := v_prev_status_id; previous_status_code := v_prev_status_code;
            target_status_id := p_target_status_id; target_status_code := v_target_code;
            resulting_status_id := p_target_status_id; resulting_status_code := v_target_code;
            attempt_id := v_attempt_id; incident_ids := v_incident_ids;
            applied_rule_codes := v_applied_codes; blocking_rule_codes := v_blocking_codes;
            warnings := v_warning_msgs; idempotent_replay := true;
            override_applied := v_override_applied;
            error_code := NULL; error_message := NULL;
            executed_at := v_executed_at;
            RETURN NEXT; RETURN;
        ELSE
            v_executed_at := now();
            success := false; allowed := false;
            reservation_id := p_reservation_id; org_id := v_org_id;
            previous_status_id := v_prev_status_id; previous_status_code := v_prev_status_code;
            target_status_id := p_target_status_id; target_status_code := v_target_code;
            resulting_status_id := v_prev_status_id; resulting_status_code := v_prev_status_code;
            attempt_id := NULL; incident_ids := ARRAY[]::UUID[];
            applied_rule_codes := ARRAY[]::TEXT[]; blocking_rule_codes := ARRAY[]::TEXT[];
            warnings := ARRAY[]::TEXT[]; idempotent_replay := false;
            override_applied := false;
            error_code := 'IDEMPOTENCY_CONFLICT';
            error_message := 'Conflicto de idempotencia: la misma llave ya fue usada con parametros diferentes.';
            executed_at := v_executed_at;
            RETURN NEXT; RETURN;
        END IF;
    END IF;

    -- ========================================================================
    -- 18. Evaluate rules
    --     Uses COALESCE(description, name, code) for message — no message_template column.
    -- ========================================================================
    v_rules_evaluated := 0;
    v_allowed := true;
    v_applied_codes := ARRAY[]::TEXT[];
    v_blocking_codes := ARRAY[]::TEXT[];
    v_warning_msgs := ARRAY[]::TEXT[];

    FOR v_rule IN
        SELECT r.id, r.code, r.enforcement_mode, r.severity,
               r.creates_incident, r.priority,
               r.name, r.description,
               COALESCE(r.description, r.name, r.code) AS rule_message
        FROM public.inout_flow_rules r
        WHERE r.org_id = v_org_id AND r.is_active = true
          AND r.trigger_event IN ('on_status_change','always')
        ORDER BY r.priority ASC, r.code ASC
    LOOP
        v_rules_evaluated := v_rules_evaluated + 1;

        INSERT INTO public.inout_transition_attempt_rules (
            org_id, attempt_id, rule_id, rule_code,
            execution_order, matched, result, severity,
            enforcement_mode, blocked, incident_created, incident_id,
            message, evidence_json
        ) VALUES (
            v_org_id, v_attempt_id, v_rule.id, v_rule.code,
            v_rules_evaluated, true,
            CASE v_rule.enforcement_mode
                WHEN 'block' THEN 'blocked'
                WHEN 'warn'  THEN 'warned'
                WHEN 'observe' THEN 'observed'
                ELSE 'applied'
            END,
            v_rule.severity, v_rule.enforcement_mode,
            (v_rule.enforcement_mode = 'block'),
            false, NULL,
            v_rule.rule_message,
            ''::jsonb
        );

        v_applied_codes := array_append(v_applied_codes, v_rule.code);

        IF v_rule.enforcement_mode = 'block' THEN
            IF v_rule.code = 'DONE_REOPEN_ATTEMPT' AND v_is_override AND v_override_applied THEN
                NULL; -- R11 applied but not blocking when override authorized
            ELSE
                v_allowed := false;
                v_blocking_codes := array_append(v_blocking_codes, v_rule.code);
            END IF;
        ELSIF v_rule.enforcement_mode = 'warn' THEN
            v_warning_msgs := array_append(v_warning_msgs,
                v_rule.code || ': ' || v_rule.rule_message);
        END IF;
    END LOOP;

    -- ========================================================================
    -- 19. Create incidents for applied rules
    -- ========================================================================
    FOR v_rule IN
        SELECT r.id AS rule_id, r.code, r.severity
        FROM public.inout_flow_rules r
        WHERE r.org_id = v_org_id AND r.is_active = true
          AND r.trigger_event IN ('on_status_change','always')
          AND r.creates_incident = true
        ORDER BY r.priority ASC, r.code ASC
    LOOP
        SELECT inc.incident_id, inc.is_new INTO v_incident_rec
        FROM public._inout_create_transition_incident(
            v_org_id, v_attempt_id, p_reservation_id,
            v_rule.rule_id, v_rule.code, v_rule.severity, p_idempotency_key
        ) inc;

        IF v_incident_rec.incident_id IS NOT NULL THEN
            v_incident_ids := array_append(v_incident_ids, v_incident_rec.incident_id);
            UPDATE public.inout_transition_attempt_rules
            SET incident_created = v_incident_rec.is_new,
                incident_id = v_incident_rec.incident_id
            WHERE attempt_id = v_attempt_id AND rule_id = v_rule.rule_id;
        END IF;
    END LOOP;

    -- ========================================================================
    -- 20. Administrative incident for overrides
    -- ========================================================================
    IF v_is_override AND v_override_applied THEN
        v_admin_type := CASE v_prev_status_code
            WHEN 'DONE' THEN 'done_reopen'
            WHEN 'DISPATCHED' THEN 'dispatched_reopen'
            WHEN 'CANCELLED' THEN 'cancelled_reopen'
            WHEN 'NO_SHOW' THEN 'no_show_reopen'
            ELSE 'admin_override'
        END;
        v_admin_sev := CASE WHEN v_prev_status_code = 'DONE' THEN 'alta' ELSE 'media' END;

        SELECT inc.incident_id, inc.is_new INTO v_incident_rec
        FROM public._inout_create_transition_incident(
            v_org_id, v_attempt_id, p_reservation_id,
            NULL, v_admin_type, v_admin_sev, p_idempotency_key
        ) inc;

        IF v_incident_rec.incident_id IS NOT NULL THEN
            v_incident_ids := array_append(v_incident_ids, v_incident_rec.incident_id);
        END IF;

        IF v_prev_status_code = 'NO_SHOW' THEN
            v_warning_msgs := array_append(v_warning_msgs,
                'R12: Reapertura desde NO_SHOW. Verificar actividad posterior.');
        END IF;
    END IF;

    -- ========================================================================
    -- 21. UPDATE reservations
    -- ========================================================================
    IF v_allowed OR v_override_applied THEN
        v_result_status_id := p_target_status_id;
        v_result_status_code := v_target_code;

        IF v_target_code = 'CANCELLED' THEN
            UPDATE public.reservations SET
                status_id = p_target_status_id, is_cancelled = true,
                cancel_reason = p_reason, cancelled_by = v_actor, cancelled_at = now(),
                updated_by = v_actor, updated_at = now()
            WHERE id = p_reservation_id;
        ELSIF v_prev_status_code = 'CANCELLED' AND v_is_override THEN
            UPDATE public.reservations SET
                status_id = p_target_status_id, is_cancelled = false,
                cancel_reason = NULL, cancelled_by = NULL, cancelled_at = NULL,
                updated_by = v_actor, updated_at = now()
            WHERE id = p_reservation_id;
        ELSE
            UPDATE public.reservations SET
                status_id = p_target_status_id,
                updated_by = v_actor, updated_at = now()
            WHERE id = p_reservation_id;
        END IF;
    ELSE
        v_result_status_id := v_prev_status_id;
        v_result_status_code := v_prev_status_code;
    END IF;

    -- ========================================================================
    -- 22. Audit
    -- ========================================================================
    v_audit_action := CASE
        WHEN v_override_applied THEN 'status_transition_override'
        WHEN v_allowed THEN 'status_transition'
        ELSE 'status_transition_blocked'
    END;

    v_old_value := jsonb_build_object(
        'status_id', v_prev_status_id, 'status_code', v_prev_status_code,
        'is_cancelled', v_reservation.is_cancelled
    );
    v_new_value := jsonb_build_object(
        'status_id', v_result_status_id, 'status_code', v_result_status_code,
        'allowed', (v_allowed OR v_override_applied), 'result', v_attempt_result,
        'applied_rules', v_applied_codes, 'blocking_rules', v_blocking_codes,
        'attempt_id', v_attempt_id, 'override_applied', v_override_applied
    );

    INSERT INTO public.inout_flow_audit_log (
        org_id, entity_type, entity_id, action,
        old_value, new_value, user_id, created_at
    ) VALUES (
        v_org_id, 'reservation', p_reservation_id, v_audit_action,
        v_old_value, v_new_value, v_actor, now()
    );

    -- ========================================================================
    -- 23. Return response
    -- ========================================================================
    v_executed_at := now();
    success := true;
    allowed := (v_allowed OR v_override_applied);
    reservation_id := p_reservation_id;
    org_id := v_org_id;
    previous_status_id := v_prev_status_id;
    previous_status_code := v_prev_status_code;
    target_status_id := p_target_status_id;
    target_status_code := v_target_code;
    resulting_status_id := v_result_status_id;
    resulting_status_code := v_result_status_code;
    attempt_id := v_attempt_id;
    incident_ids := v_incident_ids;
    applied_rule_codes := v_applied_codes;
    blocking_rule_codes := v_blocking_codes;
    warnings := v_warning_msgs;
    idempotent_replay := false;
    override_applied := v_override_applied;

    IF v_allowed OR v_override_applied THEN
        error_code := NULL; error_message := NULL;
    ELSE
        error_code := 'RULE_BLOCKED';
        error_message := 'Una o mas reglas bloquean la transicion.';
    END IF;
    executed_at := v_executed_at;
    RETURN NEXT;
END;
$$;

-- ===========================================================================
-- GRANT / REVOKE
-- ===========================================================================

-- RPC: only authenticated and service_role
REVOKE ALL ON FUNCTION public.transition_reservation_status(
    UUID, UUID, TEXT, TEXT, UUID, JSONB, UUID
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.transition_reservation_status(
    UUID, UUID, TEXT, TEXT, UUID, JSONB, UUID
) TO authenticated, service_role;

-- Helpers: NO EXECUTE for anyone (called internally by RPC, same owner)
REVOKE ALL ON FUNCTION public._inout_resolve_transition_actor(UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._inout_build_transition_fingerprint(UUID, UUID, TEXT, UUID, UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._inout_create_transition_incident(UUID, UUID, UUID, UUID, TEXT, TEXT, UUID)
    FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- FASE H — Revoke direct writes from authenticated on new table
-- ===========================================================================
REVOKE ALL ON TABLE public.inout_transition_attempt_rules FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.inout_transition_attempt_rules FROM authenticated;

-- ===========================================================================
-- SQL COMMENTS
-- ===========================================================================
COMMENT ON FUNCTION public.transition_reservation_status(
    UUID, UUID, TEXT, TEXT, UUID, JSONB, UUID
) IS 'Centralized reservation status transition engine (Phase 6.2). Evaluates inout_flow_rules, creates incidents, logs audit. Idempotent via p_idempotency_key UUID.';

COMMENT ON TABLE public.inout_transition_attempt_rules IS 'One row per rule evaluated during a transition attempt. Linked to both the attempt and the rule.';

COMMIT;