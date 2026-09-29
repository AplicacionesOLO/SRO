-- ═══════════════════════════════════════════════════════════════════════════
-- Catálogo: Tipos de Vehículo (vehicle_types)
-- Alcance: por almacén (igual que cargo_types).
-- Se agrega la columna reservations.vehicle_type (guarda el id del catálogo).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Tablas ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicle_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT current_user_or_system(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vehicle_types_org_name_uniq
  ON public.vehicle_types (org_id, lower(trim(name)));
CREATE INDEX IF NOT EXISTS vehicle_types_org_active_idx
  ON public.vehicle_types (org_id, active);

CREATE TABLE IF NOT EXISTS public.vehicle_type_warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  vehicle_type_id uuid NOT NULL REFERENCES public.vehicle_types(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vehicle_type_warehouses_org_vt_wh_key
  ON public.vehicle_type_warehouses (org_id, vehicle_type_id, warehouse_id);

-- ── 2. Columna en reservations ─────────────────────────────────────────────
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS vehicle_type text;

-- ── 3. RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.vehicle_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_type_warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY vehicle_types_select_org_members ON public.vehicle_types
  FOR SELECT USING (org_id IN (SELECT uor.org_id FROM user_org_roles uor WHERE uor.user_id = auth.uid()));
CREATE POLICY vehicle_types_insert_org_members ON public.vehicle_types
  FOR INSERT WITH CHECK (org_id IN (SELECT uor.org_id FROM user_org_roles uor WHERE uor.user_id = auth.uid()));
CREATE POLICY vehicle_types_update_org_members ON public.vehicle_types
  FOR UPDATE USING (org_id IN (SELECT uor.org_id FROM user_org_roles uor WHERE uor.user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT uor.org_id FROM user_org_roles uor WHERE uor.user_id = auth.uid()));
CREATE POLICY vehicle_types_delete_org_members ON public.vehicle_types
  FOR DELETE USING (org_id IN (SELECT uor.org_id FROM user_org_roles uor WHERE uor.user_id = auth.uid()));
CREATE POLICY org_access_vehicle_type_warehouses ON public.vehicle_type_warehouses
  FOR ALL USING (org_id IN (SELECT user_org_roles.org_id FROM user_org_roles WHERE user_org_roles.user_id = auth.uid()));

-- ── 4. Permisos ────────────────────────────────────────────────────────────
INSERT INTO public.permissions (name, description, category)
SELECT v.name, v.description, 'vehicle_types'
FROM (VALUES
  ('vehicle_types.view','Ver tipos de vehículo'),
  ('vehicle_types.create','Crear tipos de vehículo'),
  ('vehicle_types.update','Actualizar tipos de vehículo'),
  ('vehicle_types.delete','Eliminar tipos de vehículo')
) AS v(name, description)
WHERE NOT EXISTS (SELECT 1 FROM public.permissions p WHERE p.name = v.name);

-- Copiar asignaciones de roles desde cargo_types (mismos roles que ya gestionan catálogos)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, np.id
FROM public.role_permissions rp
JOIN public.permissions cp ON cp.id = rp.permission_id AND cp.name LIKE 'cargo_types.%'
JOIN public.permissions np ON np.name = 'vehicle_types.' || split_part(cp.name, '.', 2)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions x WHERE x.role_id = rp.role_id AND x.permission_id = np.id
);

-- ── 5. Seed de tipos por defecto + asignación a almacenes ──────────────────
INSERT INTO public.vehicle_types (org_id, name)
SELECT o.id, v.name
FROM public.organizations o
CROSS JOIN (VALUES
  ('Gandola de plataforma'),
  ('750 de plataforma'),
  ('Cava 350'),
  ('Cava 750'),
  ('Furgón'),
  ('Container 40"'),
  ('Container 20"'),
  ('Vehículo particular'),
  ('Motocicleta')
) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.vehicle_types vt WHERE vt.org_id = o.id AND lower(trim(vt.name)) = lower(trim(v.name))
);

INSERT INTO public.vehicle_type_warehouses (org_id, vehicle_type_id, warehouse_id)
SELECT vt.org_id, vt.id, w.id
FROM public.vehicle_types vt
JOIN public.warehouses w ON w.org_id = vt.org_id
ON CONFLICT (org_id, vehicle_type_id, warehouse_id) DO NOTHING;