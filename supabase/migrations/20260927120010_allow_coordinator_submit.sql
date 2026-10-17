-- ============================================================================
-- Migracion: 010_allow_coordinator_submit.sql
-- ----------------------------------------------------------------------------
-- Que hace: habilita al coordinador a cerrar su propia jornada (enviar) y fija
-- el campo enviada_at, cerrando el circuito de captura en la app.
--
-- Contexto (el problema que resuelve)
-- -----------------------------------
-- La politica actividades_update_admin_o_borrador_propio (008) usaba el mismo
-- predicado en USING y WITH CHECK:
--
--     using   ( admin or (estado='borrador' and coordinacion_id = mia) )
--     with check ( admin or (estado='borrador' and coordinacion_id = mia) )
--
-- En un UPDATE, USING evalua la fila VIEJA y WITH CHECK la fila NUEVA. Al pasar
-- una actividad de 'borrador' a 'enviada', WITH check decia: la fila resultante
-- ya no esta en 'borrador', ergo no cumple -> la policy rechazaba la sentencia.
-- El coordinador podia llenar la jornada pero NO podía enviarla: quedaba
-- trabado y dependia de un admin para cerrar cada actividad. Para una ONG de
-- campo eso es inviable.
--
-- Como lo arreglamos
-- -----------------
-- Separamos las dos mitades con el estado ANTERIOR en USING y el estado
-- NUEVO permitido en WITH CHECK:
--
--   USING      ( admin
--             or ( estado = 'borrador' and coordinacion_id = mia ) )
--                -- la fila que se va a tocar debe ser editable ahora
--
--   WITH CHECK ( admin
--             or ( coordinacion_id = mia
--                  and estado in ('borrador','enviada') ) )
--                -- la fila resultante debe seguir siendo de mi coordinacion
--                -- y solo puede quedar en borrador o enviada
--
-- Efectos, uno por uno:
--   - coordinador: borrador -> enviada  SI (cierra la jornada). sigue editable.
--   - coordinador: enviada  -> validada NO (con check no lo permite).
--   - coordinador: enviada  -> borrador NO (no puede des-enviar; la With Check
--     no contempla el estado destino 'borrador' como reversible, y ademas el
--     trigger bloquear_atencion_actividad ya habria bloqueado la morbilidad).
--   - admin:        sin cambios, cualquier estado y cualquier coordinacion.
--
-- Seguridad: un coordinador NUNCA puede tocar una actividad de otra
-- coordinacion, ni en borrador ni al enviarla, porque coordinacion_id = mia se
-- exige en AMBOS predicados. Y no puede validar, porque 'validada' no esta en
-- la lista de WITH CHECK.
--
-- Nota sobre el trigger: bloquear_edicion_actividad (005) se dispara BEFORE
-- UPDATE y solo levanta excepcion si old.estado <> 'borrador' para un
-- no-admin. borrador -> enviada pasa ese chequeo, asi que la policy es la
-- unica que hacia falta ajustar. Se mantiene el trigger: sigue siendo lo que
-- impide editar una actividad ya enviada.
-- ============================================================================

drop policy if exists "actividades_update_admin_o_borrador_propio" on public.actividades;

create policy "actividades_update_admin_o_editar_y_enviar"
  on public.actividades for update to authenticated
  using (
    public.current_rol() = 'admin'
    or (estado = 'borrador' and coordinacion_id = public.current_coordinacion())
  )
  with check (
    public.current_rol() = 'admin'
    or (
      coordinacion_id = public.current_coordinacion()
      and estado in ('borrador', 'enviada')
    )
  );

comment on policy "actividades_update_admin_o_editar_y_enviar" on public.actividades is
  'Admin: cualquier estado y coordinacion. Coordinador: solo su coordinacion; puede editar la fila mientras este en borrador y pasarla a enviada (con With Check), pero no puede validar ni des-enviar.';

-- ---------------------------------------------------------------------------
-- Gateway: enviar = setear estado + enviada_at en la misma sentencia, para que
-- no quede una actividad 'enviada' sin timestamp por un fallo de red a mitad de
-- camino. Si el cliente mandara el UPDATE con estado='enviada' y sin el
-- timestamp, la actividad quedaria enviada pero sin registro de cuando.
-- ---------------------------------------------------------------------------

create or replace function public.enviar_actividad(p_actividad_id uuid)
returns public.actividades
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_actividad public.actividades;
begin
  update public.actividades
     set estado       = 'enviada',
         enviada_at   = now()
   where id = p_actividad_id
  returning * into v_actividad;

  if v_actividad.id is null then
    raise exception using
      errcode = 'P0002',
      message = 'No se encontro la actividad, o no tenes permiso para enviarla.',
      hint    = 'Solo un admin, o el coordinador de esa coordinacion, pueden enviar una actividad en borrador.';
  end if;

  return v_actividad;
end;
$$;

comment on function public.enviar_actividad(uuid) is
  'Cierra la jornada: borrador -> enviada y setea enviada_at en la misma sentencia. SECURITY INVOKER, asi que la RLS y el trigger de bloqueo siguen aplicando.';

grant execute on function public.enviar_actividad(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Validar: el mismo patron para el paso del admin. Lo separamos para que el
-- cliente nunca tenga que armar el UPDATE a mano con validada_por y validada_at.
-- ---------------------------------------------------------------------------

create or replace function public.validar_actividad(p_actividad_id uuid)
returns public.actividades
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_actividad public.actividades;
begin
  if public.current_rol() <> 'admin' then
    raise exception using
      errcode = '42501',
      message = 'Solo un administrador puede validar una actividad.',
      hint    = 'El coordinador envia; la validacion la hace un admin.';
  end if;

  update public.actividades
     set estado       = 'validada',
         validada_at  = now(),
         validada_por = auth.uid()
   where id = p_actividad_id
     and estado = 'enviada'
  returning * into v_actividad;

  if v_actividad.id is null then
    raise exception using
      errcode = 'P0002',
      message = 'No se encontro una actividad en estado enviada para validar.',
      hint    = 'Solo se puede validar una actividad que el coordinador ya envio (estado=enviada).';
  end if;

  return v_actividad;
end;
$$;

comment on function public.validar_actividad(uuid) is
  'Cierra el circuito: enviada -> validada, con validada_por = auth.uid() y validada_at = now(). Solo admin. Exige que la actividad este en enviada.';

grant execute on function public.validar_actividad(uuid) to authenticated;
