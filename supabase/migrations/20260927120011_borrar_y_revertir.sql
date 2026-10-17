-- ============================================================================
-- Migracion: 011_borrar_y_reverter.sql
-- ----------------------------------------------------------------------------
-- Que hace: cierra el circuito de correccion.
--
--   1. El trigger bloquear_edicion_actividad admite una sola transicion
--      reversible: enviada -> borrador, y solo si no cambia ningun otro campo.
--   2. La policy de UPDATE se ensancha en USING para que esa transicion llegue
--      al trigger (si no, la RLS filtra la fila antes y nunca se ejecuta).
--   3. La policy de DELETE abre el borrado del propio borrador al coordinador.
--   4. Gateway revertir_actividad(uuid), por la misma razon que 010: el estado y
--      su timestamp se escriben en la misma sentencia.
--
-- El problema que resuelve
-- ------------------------
-- Enviar (010) es practicamente irreversible: una vez enviada, ni el
-- coordinador ni la RLS dejan deshacerlo. El coordinador se equivoca al
-- enviar, no puede corregir, y la unica salida es pedirle a un admin que lo
-- haga a mano. Para una ONG de campo eso es un cuelgue real.
--
-- Por que NO alcanza con cambiar la policy
-- ----------------------------------------
-- La policy de la 010 tiene USING con `estado = 'borrador'`: al revertir, la
-- fila VIEJA esta en 'enviada', asi que USING la filtra y el UPDATE no toca
-- nada. PostgREST no devuelve error en ese caso, devuelve data: null. Ampliar
-- USING alcanza para que la fila sea visible al UPDATE, pero abre la puerta a
-- que el coordinador edite una actividad enviada con una sola sentencia, ya
-- que el trigger (005) hoy levanta excepcion ante cualquier UPDATE con
-- old.estado <> 'borrador'.
--
-- Por eso el permiso se reparte en dos capas y cada una hace una parte:
--
--   RLS     -> decide que filas pueden ser alcanzadas por un UPDATE.
--              Para el coordinador: borrador y enviada de su coordinacion.
--   trigger -> decide que cambios son legales sobre esas filas.
--              Para el coordinador: cualquier cambio si la fila esta en
--              borrador; NADA si esta en enviada, salvo el retorno a borrador
--              sin tocar ningun otro campo.
--
-- Ahi es donde esta el detalle importante: la excepcion del trigger compara
-- la fila entera con `to_jsonb(new) - 'estado' - 'updated_at'`, asi que un
-- coordinador no puede aproveitar la puerta de la reversibilidad para
-- cambiar el municipio o las coordenadas en la misma sentencia. Si se
-- compararan solo un par de columnas, la exception seria un agujero.
--
-- Lo que el coordinador NO puede hacer, y sigue sin poder
-- -------------------------------------------------------
--   - enviada  -> validada  (no: 'validada' no esta en WITH CHECK de la 010).
--   - enviada  -> borrador cambiando otro campo (no: el trigger lo rechaza).
--   - tocar una actividad de otra coordinacion (no: coordinacion_id = mia se
--     exige en USING y en WITH CHECK).
--   - editar la morbilidad de una actividad enviada (no: los triggers de
--     atenciones y atencion_servicios de la 005 la bloquean; recien tras
--     revertir vuelve a estar en borrador y se abre sola).
--   - borrar una actividad enviada o validada (no: la policy de DELETE exige
--     estado = 'borrador').
--   - deshacer una validacion (no: revertir exige estado = 'enviada'). Un
--     admin puede corregir los DATOS de una validada, que es otra cosa; moverla
--     de estado hacia atras no se expone todavia a proposito.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Trigger: una sola transicion reversible
-- ---------------------------------------------------------------------------

create or replace function public.bloquear_edicion_actividad()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- sin sesion = service_role / SQL Editor: se deja pasar.
  if auth.uid() is null then
    return new;
  end if;

  -- un admin puede corregir cualquier actividad en cualquier estado.
  if public.current_rol() = 'admin' then
    return new;
  end if;

  -- Reversibilidad: enviada -> borrador, y nada mas.
  --
  -- La comparacion es de la fila completa menos `estado` (que es justamente lo
  -- que esta cambiando) y menos `updated_at` (que lo bumped el trigger
  -- actividades_set_updated_at, que corre antes que este por orden alfabetico
  -- del nombre del trigger).
  --
  -- Se comparan las dos filas con `-` sobre jsonb en vez de listar columna por
  -- columna a proposito: asi, si mañana se agrega una columna al 345W, esta
  -- comparacion la cubre sola y no queda como un forgot de seguridad.
  if old.estado = 'enviada'
     and new.estado = 'borrador'
     and (to_jsonb(new) - 'estado' - 'updated_at')
       = (to_jsonb(old) - 'estado' - 'updated_at') then
    return new;
  end if;

  if old.estado <> 'borrador' then
    raise exception using
      errcode    = '42501',
      message    = 'La actividad esta en estado ' || old.estado || ' y ya no puede ser editada por un coordinador. Solo un admin puede modificarla.',
      hint       = 'Use estado=borrador o solicite la correccion a un administrador.',
      detail     = format('actividad_id=%s  estado_anterior=%s', old.id, old.estado);
  end if;

  return new;
end;
$$;

comment on function public.bloquear_edicion_actividad() is
  'BEFORE UPDATE ON actividades: un no-admin solo edita en estado borrador, salvo la transicion reversible enviada -> borrador y siempre que no cambie ningun otro campo.';

-- ---------------------------------------------------------------------------
-- 2. Politica de UPDATE: el coordinador alcanza tambien las filas enviadas
-- ---------------------------------------------------------------------------
--
-- USING se evalua contra la fila VIEJA y WITH CHECK contra la NUEVA. Por eso
-- USING suma 'enviada' (para que la fila sea alcanzable) y WITH CHECK se deja
-- como en la 010 (el estado resultante solo puede ser 'borrador' o 'enviada',
-- y 'validada' sigue vedado).
--
-- El trigger es lo que impide abusar del USING ampliado: si el UPDATE no es la
-- transicion reversible pura, se bloquea con 42501.

drop policy if exists "actividades_update_admin_o_editar_y_enviar" on public.actividades;

create policy "actividades_update_admin_o_editar_enviar_revertir"
  on public.actividades for update to authenticated
  using (
    public.current_rol() = 'admin'
    or (
      estado in ('borrador', 'enviada')
      and coordinacion_id = public.current_coordinacion()
    )
  )
  with check (
    public.current_rol() = 'admin'
    or (
      coordinacion_id = public.current_coordinacion()
      and estado in ('borrador', 'enviada')
    )
  );

comment on policy "actividades_update_admin_o_editar_enviar_revertir" on public.actividades is
  'Admin: cualquier estado y coordinacion. Coordinador: solo su coordinacion; edita mientras este en borrador, la envia, y puede revertir una enviada a borrador. El trigger bloquear_edicion_actividad es lo que impide editar el resto de los campos de una enviada.';

-- ---------------------------------------------------------------------------
-- 3. Politica de DELETE: el coordinador borra su propio borrador
-- ---------------------------------------------------------------------------
--
-- El borrado de una actividad arrastra sus atenciones y sus servicios por
-- ON DELETE CASCADE. Los triggers de la 005 no bloquean ese cascada: cuando se
-- borra el padre, los triggers de los hijos ven que la actividad ya no existe
-- y los dejan pasar (por eso tienen el `v_actividad.estado is not null`).
--
-- Igual, el borrado queda limitado a estado = 'borrador', o sea que nunca se
-- pierde una jornada que ya se envio.

drop policy if exists "actividades_delete_solo_admin" on public.actividades;

create policy "actividades_delete_admin_o_borrador_propio"
  on public.actividades for delete to authenticated
  using (
    public.current_rol() = 'admin'
    or (
      estado = 'borrador'
      and coordinacion_id = public.current_coordinacion()
    )
  );

comment on policy "actividades_delete_admin_o_borrador_propio" on public.actividades is
  'Admin: borra cualquier actividad. Coordinador: solo su propia actividad y solo si sigue en borrador. El ON DELETE CASCADE se lleva atenciones y atencion_servicios.';

-- ---------------------------------------------------------------------------
-- 4. Gateway: revertir
-- ---------------------------------------------------------------------------
--
-- El `and estado = 'enviada'` hace dos trabajos a la vez: impide revertir una
-- validada y, sobre todo, convierte un intento invalido en `v_actividad.id is
-- null`, que es la senal clara de "no la pudiste tocar" en vez de un UPDATE
-- silencioso que no cambia nada.
--
-- `enviada_at` NO se toca. Queda registrado el momento del ultimo envio y se
-- sobreescribe la proxima vez que se envie. Es informacion de auditoria: que la
-- jornada estuvo en circulacion, aunque despues haya vuelto a borrador.
--
-- SECURITY INVOKER a proposito: la RLS y el trigger siguen siendo los que
-- autorizan. Si fuera SECURITY DEFINER habria que replicar aca a mano los
-- controles de rol y de coordinacion, y ese es exactamente el error que hace
-- peligrrosa una funcion definer.

create or replace function public.revertir_actividad(p_actividad_id uuid)
returns public.actividades
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_actividad public.actividades;
begin
  update public.actividades
     set estado = 'borrador'
   where id = p_actividad_id
     and estado = 'enviada'
  returning * into v_actividad;

  if v_actividad.id is null then
    raise exception using
      errcode = 'P0002',
      message = 'No se encontro una actividad enviada que revertir, o no tenes permiso sobre ella.',
      hint    = 'Solo se puede revertir una actividad en estado enviada, y solo por un admin o el coordinador de esa coordinacion.';
  end if;

  return v_actividad;
end;
$$;

comment on function public.revertir_actividad(uuid) is
  'Reversible enviada -> borrador para el coordinador de esa coordinacion o un admin. Exige estado = enviada, no toca enviada_at y es SECURITY INVOKER para que la RLS y el trigger sigan autorizando.';

grant execute on function public.revertir_actividad(uuid) to authenticated;
