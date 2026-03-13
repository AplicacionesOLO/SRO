-- Migración: Crear tabla client_pickup_rules para reglas de Cliente Retira
-- Fecha: 2024
-- Descripción: Tabla para almacenar reglas de bloqueo automático de andenes por cliente

-- Tabla principal
CREATE TABLE IF NOT EXISTS client_pickup_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  dock_id UUID NOT NULL REFERENCES docks(id) ON DELETE CASCADE,
  block_minutes INTEGER NOT NULL CHECK (block_minutes > 0),
  remove_when_minutes_before INTEGER NOT NULL CHECK (remove_when_minutes_before >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_client_pickup_rules_client_id ON client_pickup_rules(client_id);
CREATE INDEX IF NOT EXISTS idx_client_pickup_rules_dock_id ON client_pickup_rules(dock_id);
CREATE INDEX IF NOT EXISTS idx_client_pickup_rules_active ON client_pickup_rules(is_active) WHERE is_active = true;

-- Índice compuesto para evitar duplicados activos (un cliente solo puede tener una regla activa por andén)
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_pickup_rules_unique_active 
ON client_pickup_rules(client_id, dock_id) 
WHERE is_active = true;

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_client_pickup_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_client_pickup_rules_updated_at
  BEFORE UPDATE ON client_pickup_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_client_pickup_rules_updated_at();

-- Habilitar RLS
ALTER TABLE client_pickup_rules ENABLE ROW LEVEL SECURITY;

-- Policy para lectura: usuarios autenticados pueden ver reglas
CREATE POLICY "Users can view client pickup rules"
  ON client_pickup_rules
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy para inserción: usuarios autenticados pueden crear reglas
CREATE POLICY "Users can create client pickup rules"
  ON client_pickup_rules
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy para actualización: usuarios autenticados pueden actualizar reglas
CREATE POLICY "Users can update client pickup rules"
  ON client_pickup_rules
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy para eliminación: usuarios autenticados pueden eliminar reglas
CREATE POLICY "Users can delete client pickup rules"
  ON client_pickup_rules
  FOR DELETE
  TO authenticated
  USING (true);

-- Comentarios para documentación
COMMENT ON TABLE client_pickup_rules IS 'Reglas de Cliente Retira: bloqueos automáticos de andenes por cliente';
COMMENT ON COLUMN client_pickup_rules.block_minutes IS 'Duración del bloqueo en minutos desde business_start_time';
COMMENT ON COLUMN client_pickup_rules.remove_when_minutes_before IS 'Minutos antes de la reserva para renovar/ajustar el bloqueo';
COMMENT ON COLUMN client_pickup_rules.is_active IS 'Solo puede haber una regla activa por combinación cliente-andén';