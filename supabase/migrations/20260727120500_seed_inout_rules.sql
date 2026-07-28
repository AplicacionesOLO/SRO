-- ============================================================================
-- 006_seed_inout_rules.sql
-- Fase 6.1 — BASE ESTRUCTURAL PASIVA
-- Siembra las 16 reglas del sistema invocando provision_inout_flow_for_org()
--
-- CORRECCIONES APLICADAS (v3.0 — Auditoría Final):
--   ✅ NO duplica las definiciones de reglas — invoca la función de 005
--      → UNA SOLA fuente de verdad para el catálogo de 16 reglas
--   ✅ Sin fallback a cualquier usuario: si no hay actor válido, la función
--      retorna success=false y se omite la organización.
--   ✅ Reporta: organizaciones aprovisionadas, omitidas, y warnings
--   ✅ La función provision_inout_flow_for_org() es idempotente y concurrent-safe
-- ============================================================================

BEGIN;

DO $$
DECLARE
    v_org RECORD;
    v_result JSONB;
    v_orgs_provisioned INTEGER := 0;
    v_orgs_skipped INTEGER := 0;
    v_total_rules_created INTEGER := 0;
    v_total_rules_existing INTEGER := 0;
BEGIN
    FOR v_org IN SELECT id, name FROM public.organizations ORDER BY name LOOP

        -- Invocar la función de provisioning (definida en 005)
        -- La función es SECURITY DEFINER y solo service_role puede ejecutarla,
        -- pero aquí estamos en un DO block que corre con los privilegios del
        -- rol que ejecuta la migración (service_role o superuser).
        v_result := public.provision_inout_flow_for_org(v_org.id);

        IF (v_result->>'success')::boolean THEN
            v_orgs_provisioned := v_orgs_provisioned + 1;
            v_total_rules_created := v_total_rules_created + COALESCE((v_result->>'rules_created')::integer, 0);
            v_total_rules_existing := v_total_rules_existing + COALESCE((v_result->>'rules_existing')::integer, 0);

            RAISE NOTICE '[006_seed] Org "%" (id=%): % reglas creadas, % ya existentes',
                v_org.name, v_org.id,
                v_result->>'rules_created', v_result->>'rules_existing';
        ELSE
            v_orgs_skipped := v_orgs_skipped + 1;
            RAISE WARNING '[006_seed] Org "%" (id=%) OMITIDA: %',
                v_org.name, v_org.id, v_result->>'message';
        END IF;

    END LOOP;

    -- Reporte final
    RAISE NOTICE '[006_seed] RESUMEN: % organizaciones aprovisionadas, % omitidas. Reglas: % nuevas, % ya existentes.',
        v_orgs_provisioned, v_orgs_skipped, v_total_rules_created, v_total_rules_existing;

    IF v_orgs_skipped > 0 THEN
        RAISE WARNING '[006_seed] % organización(es) omitida(s). Revise los warnings anteriores. Use provision_inout_flow_for_org() cuando haya un administrador asignado.',
            v_orgs_skipped;
    END IF;
END $$;

COMMIT;