# PHASE 6.2 — EXECUTION GUIDE

## Motor de Transiciones de Estados — `transition_reservation_status(...)`

---

**Version:** 1.0
**Date:** 2026-07-29
**Design Reference:** PHASE_6_2_TRANSITION_ENGINE_DESIGN.md v2.3.1 (frozen)

---

## 1. BACKUP RECOMMENDED

Before running any migration:

```sql
-- In Supabase SQL Editor, export current state:
-- 1. pg_dump of relevant tables
-- 2. Or at minimum, record:
SELECT COUNT(*) FROM public.inout_state_transition_attempts;
SELECT COUNT(*) FROM public.inout_flow_incidents;
SELECT COUNT(*) FROM public.inout_flow_audit_log;
SELECT COUNT(*) FROM public.inout_flow_rules;
SELECT COUNT(*) FROM public.permissions WHERE category = 'casetilla';
```

---

## 2. PREFLIGHT QUERIES

Run these BEFORE migration to confirm environment state:

```sql
-- Verify active statuses (expect 12)
SELECT code, name, is_active FROM public.reservation_statuses WHERE is_active = true ORDER BY order_index;

-- Verify existing rules (expect 16 seeded)
SELECT code, enforcement_mode, trigger_event, is_active FROM public.inout_flow_rules ORDER BY priority, code;

-- Verify no blocking constraints on attempts
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.inout_state_transition_attempts'::regclass AND contype = 'c';

-- Verify existing indexes on incidents
SELECT indexname FROM pg_indexes WHERE tablename = 'inout_flow_incidents';

-- Verify admin/Full Access roles
SELECT id, name FROM public.roles WHERE name IN ('ADMIN', 'Full Access');

-- Verify existing permissions in casetilla category
SELECT name FROM public.permissions WHERE category = 'casetilla' ORDER BY name;
```

---

## 3. EXECUTION ORDER

Migrations must be applied in strict sequence. All within a single Supabase deployment:

```
1. 20260729120000_phase_6_2_schema.sql       ← ALTERs, indexes, new table
2. 20260729120100_phase_6_2_permission.sql    ← Permission + assignments
3. 20260729120200_phase_6_2_helpers.sql       ← Internal helper functions
4. 20260729120300_phase_6_2_rpc.sql           ← RPC + GRANT/REVOKE
```

### If any migration fails:

- **DO NOT continue** to the next migration.
- **Review the error** in the Supabase SQL Editor.
- **Fix the issue** or rollback.
- The most likely failure point is migration #1 if constraints/indexes already exist with different definitions. All DDL uses `IF EXISTS`/`IF NOT EXISTS` guards.

---

## 4. APPLYING MIGRATIONS

### Option A: Supabase Dashboard (recommended)

1. Go to Supabase Dashboard → SQL Editor.
2. Open each migration file in order.
3. Run each one and verify "Success. No rows returned."
4. Do NOT skip any migration.

### Option B: Supabase CLI

```bash
supabase db push
# or
supabase migration up
```

---

## 5. POSTFLIGHT VALIDATION

Run after all 4 migrations succeed:

```sql
-- 1. idempotency_key column
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'inout_state_transition_attempts' AND column_name = 'idempotency_key';
-- Expected: UUID, NO

-- 2. previous_status_id nullable
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'inout_state_transition_attempts' AND column_name = 'previous_status_id';
-- Expected: YES

-- 3. Partial indexes
SELECT indexname FROM pg_indexes
WHERE tablename = 'inout_flow_incidents'
  AND indexname IN ('uq_incidents_attempt_rule_type', 'uq_incidents_attempt_admin_type');
-- Expected: 2 rows

-- 4. Legacy index removed
SELECT indexname FROM pg_indexes
WHERE tablename = 'inout_flow_incidents' AND indexname = 'uq_incidents_idempotency';
-- Expected: 0 rows

-- 5. New table
SELECT table_name FROM information_schema.tables
WHERE table_name = 'inout_transition_attempt_rules';
-- Expected: 1 row

-- 6. RPC exists
SELECT proname FROM pg_proc WHERE proname = 'transition_reservation_status';
-- Expected: 1 row

-- 7. Permission exists and assigned
SELECT p.name, r.name AS role_name
FROM public.permissions p
JOIN public.role_permissions rp ON p.id = rp.permission_id
JOIN public.roles r ON rp.role_id = r.id
WHERE p.name = 'casetilla.flow_report.transitions.execute';
-- Expected: 2 rows (ADMIN, Full Access)

-- 8. Helper functions exist
SELECT proname FROM pg_proc WHERE proname LIKE '_inout_%';
-- Expected: 3 rows

-- 9. RLS on new table
SELECT tablename, policyname, cmd FROM pg_policies
WHERE tablename = 'inout_transition_attempt_rules';
-- Expected: 1 row (SELECT)

-- 10. Test JSONB default
SELECT column_default FROM information_schema.columns
WHERE table_name = 'inout_transition_attempt_rules' AND column_name = 'evidence_json';
-- Expected: ''::jsonb (empty JSON object, not empty string)
```

---

## 6. RUNNING TESTS

### Schema tests (M1-M12): Run immediately

```sql
-- In Supabase SQL Editor, open and run:
-- supabase/tests/phase_6_2_transition_engine_tests.sql
-- M1-M12 will execute automatically and report PASS/FAIL.
```

### Functional tests (F1-F46): Requires test data

Before running functional tests, you need:
1. A known test reservation in an org with rules configured.
2. A user with `transitions.execute` permission in that org.
3. A user with `incidents.override` permission in that org.
4. Known status IDs.

Setup:
```sql
-- Find a test org with active rules
SELECT DISTINCT org_id FROM public.inout_flow_rules WHERE is_active = true LIMIT 1;

-- Find a test reservation in that org
SELECT id, org_id, status_id FROM public.reservations WHERE org_id = '<org_id>' LIMIT 1;

-- Find a user with transitions.execute in that org
SELECT uor.user_id, r.name FROM public.user_org_roles uor
JOIN public.roles r ON uor.role_id = r.id
WHERE uor.org_id = '<org_id>' AND r.name IN ('ADMIN', 'Full Access');
```

Then use the RPC directly:
```sql
SELECT * FROM public.transition_reservation_status(
    '<reservation_id>'::UUID,
    '<target_status_id>'::UUID,
    'Test transition',
    'manual_test',
    gen_random_uuid(),
    ''::jsonb,
    NULL
);
```

---

## 7. MANUAL VALIDATION

After deployment, verify with these manual operations:

### 7.1 Test SAME_STATUS
```sql
SELECT success, allowed, error_code, idempotent_replay
FROM public.transition_reservation_status(
    '<reservation_id>', '<current_status_id>', 'test', 'manual', gen_random_uuid(), ''::jsonb, NULL
);
-- Expected: success=true, allowed=true, idempotent_replay=false
```

### 7.2 Test idempotent replay
```sql
-- In Supabase SQL Editor, use a variable declared in a DO block:
DO $$
DECLARE
    v_key UUID := gen_random_uuid();
    r RECORD;
BEGIN
    -- First call
    SELECT * INTO r FROM public.transition_reservation_status(
        '<reservation_id>'::UUID, '<target_status_id>'::UUID, 'test', 'manual',
        v_key, ''::jsonb, NULL
    );
    RAISE NOTICE 'First call: success=%, attempt_id=%', r.success, r.attempt_id;
    
    -- Second call with same key
    SELECT * INTO r FROM public.transition_reservation_status(
        '<reservation_id>'::UUID, '<target_status_id>'::UUID, 'test', 'manual',
        v_key, ''::jsonb, NULL
    );
    RAISE NOTICE 'Second call: idempotent_replay=%, same attempt_id=%', r.idempotent_replay, r.attempt_id;
    -- Expected: idempotent_replay=true, same attempt_id
END $$;
```

### 7.3 Verify attempt_rules populated
```sql
SELECT ar.rule_code, ar.result, ar.blocked, ar.incident_created
FROM public.inout_transition_attempt_rules ar
WHERE ar.attempt_id = '<attempt_id_from_above>'
ORDER BY ar.execution_order;
```

### 7.4 Verify audit log
```sql
SELECT action, old_value, new_value, created_at
FROM public.inout_flow_audit_log
WHERE entity_id = '<reservation_id>'
ORDER BY created_at DESC LIMIT 5;
```

---

## 8. SUCCESS CRITERIA

| Criterion | How to verify |
|---|---|
| All 4 migrations applied without errors | Supabase dashboard shows success for each |
| Postflight queries all pass | Section 5 checks return expected values |
| M1-M12 schema tests pass | Test output shows PASS for all |
| RPC can be called by authenticated user | Manual validation 7.1 returns success |
| Idempotency works | Manual validation 7.2 returns replay on second call |
| attempt_rules populated | Manual validation 7.3 shows correct rows |
| Audit log written | Manual validation 7.4 shows audit entries |
| No existing functionality broken | Calendar, casetilla, dashboard still work |

---

## 9. ABORT CRITERIA

**Stop and rollback if:**

| Condition | Action |
|---|---|
| Any migration fails | Do NOT continue. Fix or rollback. |
| Postflight check #6 (RPC missing) fails | RPC did not deploy. Rollback and retry. |
| Postflight check #7 (permission not assigned) | Admins cannot use RPC. Fix or rollback. |
| Existing edge functions break | Verify no side effects from schema changes. |
| Partial indexes have wrong WHERE clause | May allow duplicate incidents. Drop and recreate. |

---

## 10. ROLLBACK

If you need to undo Phase 6.2 completely:

```sql
-- In Supabase SQL Editor, run:
-- supabase/migrations/20260729129999_phase_6_2_rollback.sql
```

**Rollback will:**
- Drop RPC and helpers
- Drop new table (only if empty — aborts if data exists)
- Remove new permission and assignments
- Drop partial indexes
- Restore legacy index (only if safe)
- Remove FK on incidents.attempt_id
- Preserve attempt_id column data (does NOT drop it)
- Remove idempotency_key from attempts
- Restore original CHECKs and NOT NULL constraints (only if safe)

**Rollback will NOT:**
- Delete incidents, attempts, or audit logs
- Drop columns with production data
- Restore constraints if data would violate them

---

## 11. POST-ROLLBACK VERIFICATION

```sql
-- Verify RPC is gone
SELECT COUNT(*) FROM pg_proc WHERE proname = 'transition_reservation_status';
-- Expected: 0

-- Verify legacy index restored
SELECT COUNT(*) FROM pg_indexes
WHERE tablename = 'inout_flow_incidents' AND indexname = 'uq_incidents_idempotency';
-- Expected: 1 (or 0 if duplicates prevented restoration)

-- Verify original CHECKs restored
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conname = 'ck_attempts_result' AND conrelid = 'public.inout_state_transition_attempts'::regclass;

-- Verify no orphaned objects
SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'inout_transition_attempt_rules';
-- Expected: 0
```

---

## 12. EVIDENCE TO SAVE

After successful deployment, capture:

1. **Screenshot of postflight query results** (Section 5, all 10 checks).
2. **Screenshot of M1-M12 test output** showing all PASS.
3. **Output of manual validation 7.1-7.4** (RPC call results).
4. **Row counts before and after:**
   - `inout_state_transition_attempts`
   - `inout_flow_incidents`
   - `inout_flow_audit_log`
   - `permissions` (casetilla category)
   - `role_permissions`

---

## QUICK REFERENCE: Migration Files

| Order | File | Contents |
|---|---|---|
| 1 | `20260729120000_phase_6_2_schema.sql` | ALTERs, new columns, indexes, legacy drop, new table, RLS |
| 2 | `20260729120100_phase_6_2_permission.sql` | `transitions.execute` permission + assignments |
| 3 | `20260729120200_phase_6_2_helpers.sql` | `_inout_resolve_transition_actor`, `_inout_build_transition_fingerprint`, `_inout_create_transition_incident` |
| 4 | `20260729120300_phase_6_2_rpc.sql` | `transition_reservation_status(...)` RPC + GRANT/REVOKE |
| R | `20260729129999_phase_6_2_rollback.sql` | Conservative rollback (preserves evidence) |

## QUICK REFERENCE: Test Files

| File | Contents |
|---|---|
| `supabase/tests/phase_6_2_transition_engine_tests.sql` | 69 tests (13 migration + 46 functional + 10 integration) |

---

*Guide generated 2026-07-29 for Phase 6.2 deployment.*