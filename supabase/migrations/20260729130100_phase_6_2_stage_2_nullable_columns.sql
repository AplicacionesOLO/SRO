-- ===========================================================================
-- PHASE 6.2 — STAGE 2: NULLABLE COLUMNS (COMPATIBLE ADDITIONS)
-- migration: 20260729130100_phase_6_2_stage_2_nullable_columns
-- ===========================================================================
-- OBJECTIVE:
--   Add new columns to existing tables as NULLABLE only.
--   Zero impact on existing queries, APIs, or modules.
--   No backfill. No NOT NULL. No constraint changes on existing columns.
--
-- INCLUDES:
--   1. ADD COLUMN idempotency_key UUID (NULLABLE) → inout_state_transition_attempts
--   2. ADD COLUMN attempt_id UUID (NULLABLE) → inout_flow_incidents
--   3. ADD FK: incidents.attempt_id → attempts(id) ON DELETE RESTRICT
--
-- EXCLUDES:
--   - No backfill
--   - No NOT NULL conversion
--   - No changes to existing constraints
--   - No modification of reservations
--   - No index creation (Stage 3)
-- ===========================================================================

BEGIN;

-- ===========================================================================
-- STEP 1: PREFLIGHT — Check table row counts
-- ===========================================================================
DO $$
DECLARE
    v_att_count INTEGER;
    v_inc_count INTEGER;
BEGIN
    SELECT count(*) INTO v_att_count FROM public.inout_state_transition_attempts;
    SELECT count(*) INTO v_inc_count FROM public.inout_flow_incidents;

    RAISE NOTICE 'PREFLIGHT Stage 2: attempts=%, incidents=%', v_att_count, v_inc_count;
END $$;

-- ===========================================================================
-- STEP 2: ADD idempotency_key UUID NULLABLE to attempts
-- ===========================================================================
ALTER TABLE public.inout_state_transition_attempts
ADD COLUMN IF NOT EXISTS idempotency_key UUID;

COMMENT ON COLUMN public.inout_state_transition_attempts.idempotency_key
    IS 'UUID de idempotencia de la operación de transición. El caller debe generar y proveer la llave. NULLABLE durante Stage 2. Fase 6.2 Stage 2.';

-- ===========================================================================
-- STEP 3: ADD attempt_id UUID NULLABLE to incidents
-- ===========================================================================
ALTER TABLE public.inout_flow_incidents
ADD COLUMN IF NOT EXISTS attempt_id UUID;

COMMENT ON COLUMN public.inout_flow_incidents.attempt_id
    IS 'Vincula el incidente con el intento de transición que lo generó. NULLABLE para compatibilidad con registros legacy. Fase 6.2 Stage 2.';

-- ===========================================================================
-- STEP 4: ADD FK — incidents.attempt_id → attempts(id) ON DELETE RESTRICT
-- ===========================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.inout_flow_incidents'::regclass
          AND conname = 'fk_incidents_attempt'
    ) THEN
        ALTER TABLE public.inout_flow_incidents
        ADD CONSTRAINT fk_incidents_attempt
            FOREIGN KEY (attempt_id)
            REFERENCES public.inout_state_transition_attempts(id)
            ON DELETE RESTRICT;
    END IF;
END $$;

-- ===========================================================================
-- STEP 5: POSTFLIGHT VALIDATION
-- ===========================================================================
DO $$
DECLARE
    v_idem_col     BOOLEAN;
    v_idem_null    TEXT;
    v_att_col      BOOLEAN;
    v_att_null     TEXT;
    v_fk_exists    BOOLEAN;
BEGIN
    -- Check idempotency_key exists and is nullable
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'inout_state_transition_attempts'
          AND column_name = 'idempotency_key'
    ) INTO v_idem_col;

    SELECT is_nullable INTO v_idem_null
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inout_state_transition_attempts'
      AND column_name = 'idempotency_key';

    -- Check attempt_id exists and is nullable
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'inout_flow_incidents'
          AND column_name = 'attempt_id'
    ) INTO v_att_col;

    SELECT is_nullable INTO v_att_null
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inout_flow_incidents'
      AND column_name = 'attempt_id';

    -- Check FK exists
    SELECT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.inout_flow_incidents'::regclass
          AND conname = 'fk_incidents_attempt'
    ) INTO v_fk_exists;

    RAISE NOTICE 'POSTFLIGHT Stage 2: idem_col=%, idem_null=%, att_col=%, att_null=%, fk=%',
        v_idem_col, v_idem_null, v_att_col, v_att_null, v_fk_exists;

    IF NOT v_idem_col THEN
        RAISE EXCEPTION 'Stage 2 FAILED: idempotency_key column not found in attempts';
    END IF;
    IF v_idem_null != 'YES' THEN
        RAISE EXCEPTION 'Stage 2 FAILED: idempotency_key must be NULLABLE (got: %)', v_idem_null;
    END IF;
    IF NOT v_att_col THEN
        RAISE EXCEPTION 'Stage 2 FAILED: attempt_id column not found in incidents';
    END IF;
    IF v_att_null != 'YES' THEN
        RAISE EXCEPTION 'Stage 2 FAILED: attempt_id must be NULLABLE (got: %)', v_att_null;
    END IF;
    IF NOT v_fk_exists THEN
        RAISE EXCEPTION 'Stage 2 FAILED: FK fk_incidents_attempt not found';
    END IF;

    RAISE NOTICE 'Stage 2 COMPLETE: All validations passed.';
END $$;

COMMIT;