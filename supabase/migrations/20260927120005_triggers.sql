-- ============================================================================
-- Migracion: 005_triggers.sql
-- ----------------------------------------------------------------------------
-- Que hace: instala los 4 triggers del modelo.
--
--   1. set_updated_at  -> BEFORE UPDATE en todas las tablas con updated_at
--   2. handle_new_user -> AFTER INSERT ON auth.users, crea public.profiles
--   3. bloquear_edicion_actividad
--                       -> BEFORE UPDATE ON actividades
--   4. bloquear_atencion_si_enviada
--                       -> BEFORE INSERT/UPDATE/DELETE ON atenciones
--                       -> BEFORE INSERT/UPDATE/DELETE ON atencion_servicios
--
-- Por que hay triggers ADEMAS de RLS:
--   Las politicas RLS filtran filas, pero no impiden que un UPDATE cambie
--   libremente la columna que decide la visibilidad. Sin el trigger, un
--   coordinador podria dejar su actividad en 'enviada' y alterar el estado en
--   la misma sentencia. El trigger congela el estado; la RLS sigue decidiendo
--   quien puede tocar la fila. Las dos capas hacen falta.
--
-- Guarda de service_role en los triggers de bloqueo:
--   auth.uid() es NULL cuando no hay JWT en la peticion, es decir bajo la
--   service_role key o desde el SQL Editor. En ese contexto el caller ya
--   opera por encima de RLS, asi que bloquearlo dejaria imposible el
--   mantenimiento legitimo (y los scripts de carga inicial). Por eso los
--   triggers solo bloquean cuando hay sesion y esa sesion no es admin.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. set_updated_at en todas las tablas con columna updated_at
-- ---------------------------------------------------------------------------
create trigger coordinaciones_set_updated_at
  before update on public.coordinaciones
  for each row execute function public.set_updated_at();

create trigger servicios_set_updated_at
  before update on public.servicios
  for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger actividades_set_updated_at
  before update on public.actividades
  for each row execute function public.set_updated_at();

create trigger atenciones_set_updated_at
  before update on public.atenciones
  for each row execute function public.set_updated_at();

-- atencion_servicios no lleva updated_at, y los catalogos 3/4/5 tampoco.

-- ---------------------------------------------------------------------------
-- 2. handle_new_user: crea el perfil automaticamente
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, nombre, rol)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'nombre', ''),
    -- decision de seguridad: el rol SIEMPRE nace como 'coordinador'.
    -- Honrar new.raw_user_meta_data ->> 'rol' permitiria que cualquiera que
    -- se registre desde el cliente se auto-asignara 'admin'. La promocion a
    -- admin se hace a proposito, con SQL, segun el README.
    'coordinador'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Crea public.profiles al registrarse en auth.users. Lee raw_user_meta_data->>''nombre''; el rol se fuerza a ''coordinador'' y se promueve a mano.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. bloquear_edicion_actividad
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
  'BEFORE UPDATE ON actividades: solo un admin edita actividades fuera de estado borrador.';

create trigger trg_bloquear_edicion_actividad
  before update on public.actividades
  for each row execute function public.bloquear_edicion_actividad();

-- ---------------------------------------------------------------------------
-- 4. bloquear_atencion_si_enviada (atenciones)
-- ---------------------------------------------------------------------------
create or replace function public.bloquear_atencion_si_enviada()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row_id        uuid;
  v_actividad_id  uuid;
  v_actividad     public.actividades%rowtype;
begin
  -- sin sesion = service_role / SQL Editor: se deja pasar.
  if auth.uid() is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  -- un admin puede corregir la morbilidad despues del envio.
  if public.current_rol() = 'admin' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  -- en DELETE las columnas viven en OLD, en INSERT/UPDATE en NEW.
  if tg_op = 'DELETE' then
    v_row_id       := old.id;
    v_actividad_id := old.actividad_id;
  else
    v_row_id       := new.id;
    v_actividad_id := new.actividad_id;
  end if;

  select a.* into v_actividad
    from public.actividades a
   where a.id = v_actividad_id;

  -- si la actividad padre no existe, v_actividad queda con todo NULL y no se
  -- bloquea: la FK se encarga de rechazar la fila.
  if v_actividad.estado is not null and v_actividad.estado <> 'borrador' then
    raise exception using
      errcode = '42501',
      message = 'No se puede modificar la morbilidad de una actividad en estado ' || v_actividad.estado || '. Solo un admin puede corregirla.',
      hint    = 'La actividad debe seguir en estado borrador, o la correccion la debe hacer un administrador.',
      detail  = format('atencion_id=%s  actividad_id=%s  estado=%s',
                       v_row_id, v_actividad_id, v_actividad.estado);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

comment on function public.bloquear_atencion_si_enviada() is
  'BEFORE INSERT/UPDATE/DELETE en atenciones y atencion_servicios: bloquea la morbilidad cuando la actividad padre ya no esta en borrador.';

create trigger trg_bloquear_atencion_si_enviada
  before insert or update or delete on public.atenciones
  for each row execute function public.bloquear_atencion_si_enviada();

-- El mismo bloqueo sobre el pivote: sin esto, un coordinador podria meter o
-- sacar servicios de una atencion de una actividad ya enviada, que es
-- justamente lo que el trigger de atenciones pretende impedir.
create or replace function public.bloquear_atencion_servicio_si_enviada()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_atencion_id  uuid;
  v_actividad    public.actividades%rowtype;
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if public.current_rol() = 'admin' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    v_atencion_id := old.atencion_id;
  else
    v_atencion_id := new.atencion_id;
  end if;

  select a.* into v_actividad
    from public.actividades a
    join public.atenciones at on at.actividad_id = a.id
   where at.id = v_atencion_id;

  if v_actividad.estado is not null and v_actividad.estado <> 'borrador' then
    raise exception using
      errcode = '42501',
      message = 'No se pueden modificar los servicios de una atencion de una actividad en estado ' || v_actividad.estado || '. Solo un admin puede corregirlos.',
      hint    = 'La actividad debe seguir en estado borrador, o la correccion la debe hacer un administrador.',
      detail  = format('atencion_id=%s  actividad_id=%s  estado=%s',
                       v_atencion_id, v_actividad.id, v_actividad.estado);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

comment on function public.bloquear_atencion_servicio_si_enviada() is
  'Equivalente del trigger anterior para atencion_servicios.';

create trigger trg_bloquear_atencion_servicio_si_enviada
  before insert or update or delete on public.atencion_servicios
  for each row execute function public.bloquear_atencion_servicio_si_enviada();
