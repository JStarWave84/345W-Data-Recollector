-- ============================================================================
-- Migracion: 003_profiles.sql
-- ----------------------------------------------------------------------------
-- Que hace: crea public.profiles, la extension de application de auth.users.
--
--  (id uuid PK -> auth.users ON DELETE CASCADE, email, nombre,
--    rol CHECK in ('coordinador','admin') default 'coordinador',
--    coordinacion_id FK, activo default true, timestamps)
--
-- Decisiones:
--   - id no es un uuid generado: es el mismo id de auth.users, para poder
--     emparejar con auth.uid() en las politicas RLS.
--   - ON DELETE CASCADE a auth.users: si se borra el usuario de Supabase Auth,
--     su perfil se borra solo. Por eso las columnas created_by / validada_por
--     de actividades y atenciones son ON DELETE SET NULL y no CASCADE: perder
--     un usuario no debe perder las jornadas de campo ni las atenciones.
--   - No hay politica de INSERT para el propio usuario (ver 008). El perfil lo
--     crea el trigger handle_new_user() de la migracion 005, que corre como
--     SECURITY DEFINER y por lo tanto no pasa por RLS.
-- ============================================================================

create table public.profiles (
  id              uuid        primary key references auth.users (id) on delete cascade,
  email           text        not null,
  nombre          text,
  rol             text        not null default 'coordinador'
                    check (rol in ('coordinador', 'admin')),
  coordinacion_id uuid        references public.coordinaciones (id) on delete set null,
  activo          boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.profiles is
  'Perfil de aplicacion por usuario. id coincide con auth.users.id. Solo un admin puede crear, editar o desactivar perfiles.';

-- Un email no puede repetirse: la promocion a admin documentada en el README
-- (update profiles set rol = ''admin'' where email = '''') asume que el email
-- identifica de forma univoca a una persona. El indice es sobre lower(email)
-- para que el case no genere duplicados.
create unique index profiles_email_lower_unique on public.profiles (lower(email));
