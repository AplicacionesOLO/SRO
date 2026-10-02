-- ═══════════════════════════════════════════════════════════════════════════
-- Tipos de Vehículo — alcance por PAÍS
-- Cada tipo de vehículo pertenece a un país y solo es visible en los
-- almacenes de ese país (los almacenes ya tienen country_id).
-- Se agrega country_id a vehicle_types y se rellena tomando el país de los
-- almacenes previamente asignados (el más frecuente por tipo).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Columna country_id ───────────────────────────────────────────────────
ALTER TABLE public.vehicle_types ADD COLUMN IF NOT EXISTS country_id uuid;

-- ── 2. Backfill desde asignaciones de almacén existentes ────────────────────
WITH ranked AS (
  SELECT vtw.vehicle_type_id,
         w.country_id,
         row_number() OVER (PARTITION BY vtw.vehicle_type_id ORDER BY count(*) DESC, w.country_id) AS rn
  FROM public.vehicle_type_warehouses vtw
  JOIN public.warehouses w ON w.id = vtw.warehouse_id
  WHERE w.country_id IS NOT NULL
  GROUP BY vtw.vehicle_type_id, w.country_id
)
UPDATE public.vehicle_types vt
SET country_id = r.country_id
FROM ranked r
WHERE r.vehicle_type_id = vt.id
  AND r.rn = 1
  AND vt.country_id IS NULL;

-- ── 3. Índice para filtrar por org + país + activo ──────────────────────────
CREATE INDEX IF NOT EXISTS vehicle_types_org_country_active_idx
  ON public.vehicle_types (org_id, country_id, active);