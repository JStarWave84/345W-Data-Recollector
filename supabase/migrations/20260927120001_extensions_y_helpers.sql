-- ============================================================================
-- Migracion: 001_extensions_y_helpers.sql
-- ----------------------------------------------------------------------------
-- Que hace:
--   1. Habilita pgcrypto. En PostgreSQL 13+ gen_random_uuid() ya es nativo,
--      pero se declara explicitamente para no depender de la version.
--   2. Crea set_updated_at(): funcion trigger generica que refresca
--      new.updated_at en cada UPDATE.
--   3. Crea los helpers de sesion current_rol() y current_coordinacion(), que
--      son los que usan las politicas RLS de las migraciones 008.
--
-- Nota de orden (importante):
--   current_rol() y current_coordinacion() leen public.profiles, que recien se
--   crea en la migracion 003. Por eso van declaradas como plpgsql y no como
--   sql: plpgsql no valida la existencia de las tablas referenciadas al crear
--   la funcion (solo al ejecutarla), mientras que un cuerpo sql con
--   check_function_bodies=on fallaria en este punto con
--   "relation profiles does not exist".
--
-- Seguridad:
--   - stable: el valor no cambia dentro de una misma sentencia, por lo que
--     pueden usarse dentro de indices y de condiciones RLS.
--   - security definer: imprescindible para poder leer public.profiles aunque
--     la RLS de profiles este activa y solo deje pasar al propio usuario.
--   - set search_path: fija el search_path para que un objeto malicioso creado
--     por un usuario no pueda secuestrar las referencias public.* / auth.*.
--   - se usa auth.uid() directamente (no current_setting('request.jwt...')).
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- set_updated_at(): trigger generico de refresco de updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger generico BEFORE UPDATE: asigna now() a new.updated_at.';

-- ---------------------------------------------------------------------------
-- current_rol(): rol del usuario autenticado, o NULL si no hay sesion
-- ---------------------------------------------------------------------------
create or replace function public.current_rol()
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rol text;
begin
  select p.rol
    into v_rol
    from public.profiles p
   where p.id = auth.uid()
     and p.activo;

  return v_rol;
end;
$$;

comment on function public.current_rol() is
  'Rol del usuario de la sesion: coordinador o admin. NULL si no hay sesion o si el perfil esta inactivo.';

-- ---------------------------------------------------------------------------
-- current_coordinacion(): coordinacion del usuario autenticado
-- ---------------------------------------------------------------------------
create or replace function public.current_coordinacion()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_coordinacion_id uuid;
begin
  select p.coordinacion_id
    into v_coordinacion_id
    from public.profiles p
   where p.id = auth.uid()
     and p.activo;

  return v_coordinacion_id;
end;
$$;

comment on function public.current_coordinacion() is
  'Coordinacion asignada al usuario de la sesion. NULL para admins y para usuarios sin perfil.';
