-- Elimina el overload duplicado de validate_status_sequence (4 argumentos).
--
-- Motivo: existían dos funciones con el mismo nombre:
--   1) validate_status_sequence(uuid, uuid, uuid, uuid)
--   2) validate_status_sequence(uuid, uuid, uuid, uuid, boolean)
--
-- Al llamarla con 4 argumentos nombrados, PostgreSQL lanzaba el error
-- "function validate_status_sequence(...) is not unique", lo que rompía la
-- validación de secuencia de estados. El frontend tenía comportamiento
-- fail-open (dejaba pasar la acción ante cualquier error), así que la
-- validación se saltaba silenciosamente y se permitían transiciones inválidas
-- (ej. Descargando -> Despachado, saltándose "Descargado").
--
-- El overload de 5 argumentos es un superset (p_enforce_no_reversion DEFAULT false),
-- por lo que cubre todos los casos. Se elimina solo el de 4 argumentos.

DROP FUNCTION IF EXISTS public.validate_status_sequence(uuid, uuid, uuid, uuid);