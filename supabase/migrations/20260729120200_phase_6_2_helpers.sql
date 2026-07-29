-- ===========================================================================
-- PHASE 6.2 — TRANSITION ENGINE: Internal Helpers
-- Migration: 20260729120200_phase_6_2_helpers.sql
-- ===========================================================================
-- Internal SECURITY DEFINER helpers. NO EXECUTE grants — called only by RPC.
-- All helpers use SET search_path = 'pg_catalog', 'public'.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- _inout_resolve_transition_actor
-- Resolves effective actor from auth context:
--   authenticated → auth.uid() (anti-spoofing enforced)
--   service_role  → p_actor_user_id (if valid) or system UUID
-- Returns: (actor_id, actor_type, error_code, error_message)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._inout_resolve_transition_actor(
    p_actor_user_id UUID
)
RETURNS TABLE(
    actor_id      UUID,
    actor_type    TEXT,
    error_code    TEXT,
    error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'pg_catalog', 'public'
AS $$
DECLARE
    v_uid UUID;
BEGIN
    v_uid := auth.uid();

    IF v_uid IS NULL THEN
        actor_id      := NULL;
        actor_type    := NULL;
        error_code    := 'USER_NOT_AUTHENTICATED';
        error_message := 'Usuario no autenticado. Se requiere JWT valido.';
        RETURN NEXT;
        RETURN;
    END IF;

    -- service_role: can delegate actor
    IF auth.role() = 'service_role' THEN
        IF p_actor_user_id IS NOT NULL THEN
            IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor_user_id) THEN
                actor_id      := NULL;
                actor_type    := NULL;
                error_code    := 'INVALID_ACTOR_USER';
                error_message := 'p_actor_user_id no corresponde a un usuario real.';
                RETURN NEXT;
                RETURN;
            END IF;
            actor_id   := p_actor_user_id;
            actor_type := 'delegated_user';
        ELSE
            actor_id   := '00000000-0000-0000-0000-000000000000'::UUID;
            actor_type := 'system';
        END IF;
        error_code    := NULL;
        error_message := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    -- authenticated: anti-spoofing
    IF p_actor_user_id IS NOT NULL AND p_actor_user_id != v_uid THEN
        actor_id      := NULL;
        actor_type    := NULL;
        error_code    := 'ACTOR_SPOOFING_FORBIDDEN';
        error_message := 'authenticated no puede usar p_actor_user_id para suplantar.';
        RETURN NEXT;
        RETURN;
    END IF;

    actor_id      := v_uid;
    actor_type    := 'user';
    error_code    := NULL;
    error_message := NULL;
    RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- _inout_build_transition_fingerprint
-- Stable fingerprint WITHOUT reason or metadata.
-- = (reservation_id, target_status_id, source, actor, org_id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._inout_build_transition_fingerprint(
    p_reservation_id   UUID,
    p_target_status_id UUID,
    p_source           TEXT,
    p_actor            UUID,
    p_org_id           UUID
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = 'pg_catalog', 'public'
AS $$
BEGIN
    RETURN encode(
        digest(
            p_reservation_id::text || '|' ||
            p_target_status_id::text || '|' ||
            coalesce(p_source, '') || '|' ||
            p_actor::text || '|' ||
            p_org_id::text,
            'sha256'
        ),
        'hex'
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- _inout_create_transition_incident
-- Creates incident with ON CONFLICT via two partial-index branches.
-- Returns (incident_id, is_new). is_new=false means it already existed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._inout_create_transition_incident(
    p_org_id           UUID,
    p_attempt_id       UUID,
    p_reservation_id   UUID,
    p_rule_id          UUID,
    p_incident_type    TEXT,
    p_severity         TEXT,
    p_idempotency_key  UUID
)
RETURNS TABLE(
    incident_id UUID,
    is_new      BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'pg_catalog', 'public'
AS $$
DECLARE
    v_incident_id UUID;
    v_idem_text   TEXT;
BEGIN
    v_idem_text := p_idempotency_key::text;

    IF p_rule_id IS NOT NULL THEN
        -- Branch A: rule-based incident
        INSERT INTO public.inout_flow_incidents (
            org_id, attempt_id, reservation_id, rule_id,
            incident_type, severity, status,
            detected_by_type, detected_by,
            source_event_type, source_event_id,
            idempotency_key, metadata_json,
            first_detected_at, last_detected_at, created_at, updated_at
        ) VALUES (
            p_org_id, p_attempt_id, p_reservation_id, p_rule_id,
            p_incident_type, p_severity, 'nueva',
            'rule_engine', NULL,
            'status_transition', p_attempt_id::text,
            v_idem_text, ''::jsonb,
            now(), now(), now(), now()
        )
        ON CONFLICT (attempt_id, rule_id, incident_type)
            WHERE rule_id IS NOT NULL AND attempt_id IS NOT NULL
        DO NOTHING
        RETURNING id INTO v_incident_id;

        IF v_incident_id IS NOT NULL THEN
            incident_id := v_incident_id;
            is_new      := true;
        ELSE
            SELECT id INTO v_incident_id
            FROM public.inout_flow_incidents
            WHERE attempt_id = p_attempt_id
              AND rule_id = p_rule_id
              AND incident_type = p_incident_type
            LIMIT 1;
            incident_id := v_incident_id;
            is_new      := false;
        END IF;
    ELSE
        -- Branch B: administrative incident (no rule_id)
        INSERT INTO public.inout_flow_incidents (
            org_id, attempt_id, reservation_id, rule_id,
            incident_type, severity, status,
            detected_by_type, detected_by,
            source_event_type, source_event_id,
            idempotency_key, metadata_json,
            first_detected_at, last_detected_at, created_at, updated_at
        ) VALUES (
            p_org_id, p_attempt_id, p_reservation_id, NULL,
            p_incident_type, p_severity, 'nueva',
            'rule_engine', NULL,
            'status_transition', p_attempt_id::text,
            v_idem_text, ''::jsonb,
            now(), now(), now(), now()
        )
        ON CONFLICT (attempt_id, incident_type)
            WHERE rule_id IS NULL AND attempt_id IS NOT NULL
        DO NOTHING
        RETURNING id INTO v_incident_id;

        IF v_incident_id IS NOT NULL THEN
            incident_id := v_incident_id;
            is_new      := true;
        ELSE
            SELECT id INTO v_incident_id
            FROM public.inout_flow_incidents
            WHERE attempt_id = p_attempt_id
              AND rule_id IS NULL
              AND incident_type = p_incident_type
            LIMIT 1;
            incident_id := v_incident_id;
            is_new      := false;
        END IF;
    END IF;

    RETURN NEXT;
END;
$$;

-- No GRANTs — helpers are called only by the RPC (same owner, SECURITY DEFINER)

COMMIT;