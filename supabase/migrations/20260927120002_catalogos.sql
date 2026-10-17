-- ============================================================================
-- Migracion: 002_catalogos.sql
-- ----------------------------------------------------------------------------
-- Que hace: crea las 5 tablas de catalogo que alimentan los formularios.
--
--   1. coordinaciones          (id, nombre unique, descripcion, activa, timestamps)
--   2. servicios               (id, nombre, coordinacion_id FK, activo, timestamps,
--                                unique(nombre, coordinacion_id))
--   3. tipos_establecimiento   (id, nombre unique, activo)
--   4. grupos_atencion         (id, nombre unique, activo)
--   5. fuentes_financiamiento  (id, nombre unique, activo)
--
-- Nota de diseno:
--   Los catalogos 3, 4 y 5 se crean SIN timestamps porque asi los define la
--   especificacion; en consecuencia no reciben trigger de updated_at. Si mas
--   adelante se necesitan, agregar created_at/updated_at y enganchar
--   public.set_updated_at() en la migracion 005.
--
-- ON DELETE:
--   servicios.coordinacion_id -> coordinaciones ON DELETE RESTRICT. No se
--   permite borrar una coordinacion que todavia tenga servicios cargados: es
--   preferible a un ON DELETE CASCADE, que borraria en cascada datos de
--   configuracion que el usuario no ve.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. coordinaciones
-- ---------------------------------------------------------------------------
create table public.coordinaciones (
  id          uuid        primary key default gen_random_uuid(),
  nombre      text        not null unique,
  descripcion text,
  activa      boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.coordinaciones is
  'Coordinaciones de la organizacion. Es el eje de aislamiento: un coordinador solo ve y edita los datos de su coordinacion.';

-- ---------------------------------------------------------------------------
-- 2. servicios
-- ---------------------------------------------------------------------------
create table public.servicios (
  id               uuid        primary key default gen_random_uuid(),
  nombre           text        not null,
  coordinacion_id  uuid        not null references public.coordinaciones (id) on delete restrict,
  activo           boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint servicios_nombre_coordinacion_key unique (nombre, coordinacion_id)
);

comment on table public.servicios is
  'Servicios que una atencion puede haber recibido. Pertenecen a una coordinacion.';

create index servicios_coordinacion_id_idx on public.servicios (coordinacion_id);

-- ---------------------------------------------------------------------------
-- 3. tipos_establecimiento
-- ---------------------------------------------------------------------------
create table public.tipos_establecimiento (
  id      uuid    primary key default gen_random_uuid(),
  nombre  text    not null unique,
  activo  boolean not null default true
);

comment on table public.tipos_establecimiento is
  'Catalogo de tipos de establecimiento (comunidad, escuela, hospital, virtual, etc.).';

-- ---------------------------------------------------------------------------
-- 4. grupos_atencion
-- ---------------------------------------------------------------------------
create table public.grupos_atencion (
  id      uuid    primary key default gen_random_uuid(),
  nombre  text    not null unique,
  activo  boolean not null default true
);

comment on table public.grupos_atencion is
  'Catalogo de grupos de atencion / poblacion objetivo.';

-- ---------------------------------------------------------------------------
-- 5. fuentes_financiamiento
-- ---------------------------------------------------------------------------
create table public.fuentes_financiamiento (
  id      uuid    primary key default gen_random_uuid(),
  nombre  text    not null unique,
  activo  boolean not null default true
);

comment on table public.fuentes_financiamiento is
  'Catalogo de fuentes de financiamiento de la actividad.';
