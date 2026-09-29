-- ============================================================================
-- Achicar citas despachadas y liberar el espacio no usado
-- ============================================================================
-- Objetivo: cuando una cita se despacha (salida por el módulo in/out) ANTES de
-- su fin planificado, el bloque del calendario se achica y la parte no usada
-- queda disponible para agendar nuevas citas el mismo día.
--
-- Diseño:
--   * Se agrega la columna `actual_end_datetime` a reservations (hora real de
--     fin / salida). SOLO se escribe desde el flujo de salida (in/out).
--   * El "fin efectivo" de una reserva se calcula siempre como:
--       LEAST(end_datetime, COALESCE(actual_end_datetime, end_datetime))
--     => NUNCA crece, solo puede achicarse. Si actual_end es null o posterior
--     al planificado, el fin efectivo es el planificado.
--   * `end_datetime` (duración planificada) NO se modifica, por lo que los
--     reportes de duración esperada / tiempo teórico siguen intactos.
--   * Toda la lógica de capacidad (trigger de solapamiento + edge function +
--     frontend) pasa a usar el fin efectivo.
--
-- Aplicar solo de hoy en adelante: actual_end_datetime solo lo escriben las
-- nuevas salidas; las reservas históricas quedan con null (sin cambios).
-- ============================================================================

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS actual_end_datetime timestamptz NULL;

COMMENT ON COLUMN public.reservations.actual_end_datetime IS
  'Hora real de fin de la cita (ej. salida/despacho por el módulo in/out). Se usa para achicar el bloque en el calendario y liberar el espacio no usado. El fin efectivo = LEAST(end_datetime, COALESCE(actual_end_datetime, end_datetime)).';

CREATE OR REPLACE FUNCTION public.validate_reservation_business_hours()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_wh_id        uuid;
  v_wh_timezone  text;
  v_start_time   time;
  v_end_time     time;
  v_start_t      time;
  v_end_t        time;
  v_start_date   date;
  v_end_date     date;
  v_conflict_exists boolean;
begin
  if new.start_datetime is null or new.end_datetime is null then
    raise exception 'start_datetime y end_datetime son obligatorios';
  end if;

  if new.end_datetime <= new.start_datetime then
    raise exception 'end_datetime debe ser mayor que start_datetime';
  end if;

  select d.warehouse_id into v_wh_id
  from public.docks d
  where d.id = new.dock_id;

  if v_wh_id is null then
    raise exception 'El andén no tiene warehouse asignado';
  end if;

  select w.business_start_time, w.business_end_time,
         coalesce(w.timezone, 'America/Costa_Rica')
    into v_start_time, v_end_time, v_wh_timezone
  from public.warehouses w
  where w.id = v_wh_id;

  v_start_date := date(new.start_datetime AT TIME ZONE v_wh_timezone);
  v_end_date   := date(new.end_datetime   AT TIME ZONE v_wh_timezone);

  if v_start_date <> v_end_date then
    raise exception 'La reserva no puede cruzar al día siguiente';
  end if;

  v_start_t := (new.start_datetime AT TIME ZONE v_wh_timezone)::time;
  v_end_t   := (new.end_datetime   AT TIME ZONE v_wh_timezone)::time;

  if v_start_t < v_start_time then
    raise exception 'La reserva inicia antes del horario permitido del almacén (%)', v_start_time;
  end if;

  if v_end_t > v_end_time then
    raise exception 'La reserva termina después del horario permitido del almacén (%)', v_end_time;
  end if;

  select exists (
    select 1
    from public.dock_time_blocks b
    where b.dock_id = new.dock_id
      and b.is_cancelled = false
      and new.start_datetime < b.end_datetime
      and new.end_datetime > b.start_datetime
  ) into v_conflict_exists;

  if v_conflict_exists then
    raise exception 'La reserva choca con un bloqueo de tiempo';
  end if;

  -- Fin efectivo de las reservas existentes (nunca crece, solo se achica).
  if current_setting('app.overlap_bypass', true) IS DISTINCT FROM 'true' then
    select exists (
      select 1
      from public.reservations r
      where r.dock_id = new.dock_id
        and r.is_cancelled = false
        and r.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
        and new.start_datetime < least(r.end_datetime, coalesce(r.actual_end_datetime, r.end_datetime))
        and new.end_datetime > r.start_datetime
    ) into v_conflict_exists;

    if v_conflict_exists then
      raise exception 'La reserva se solapa con otra reserva existente';
    end if;
  end if;

  return new;
end;
$function$;