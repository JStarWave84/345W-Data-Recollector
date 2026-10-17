-- ============================================================================
-- Migracion: 004_operativas.sql
-- ----------------------------------------------------------------------------
-- Que hace: crea las 3 tablas operativas del modelo.
--
--   7. actividades       (jornadas de campo; es la unidad que se exporta)
--   8. atenciones        (personas atendidas dentro de una actividad)
--   9. atencion_servicios (N:M entre atenciones y servicios, con cantidad)
--
-- Decisiones de ON DELETE (todas explicitas, nunca implícitas):
--   - actividades.coordinacion_id  -> coordinaciones          RESTRICT
--     No se puede borrar una coordinacion con jornadas registradas.
--   - actividades.tipo_establecimiento_id / fuente_financiamiento_id
--                                 -> catalogos                SET NULL
--     Son datos descriptivos: si se da de baja un catalogo, la actividad
--     historica se conserva y solo se queda sin clasificar.
--   - actividades.created_by / validada_por
--                                 -> profiles                 SET NULL
--     idem: perder un usuario no puede borrar jornadas de campo.
--   - atenciones.actividad_id      -> actividades              CASCADE
--     Borra la actividad arrastra sus atenciones (y las filas de
--     atencion_servicios, que en cascada a su vez).
--   - atenciones.grupo_atencion_id -> grupos_atencion          SET NULL
--   - atenciones.created_by        -> profiles                 SET NULL
--   - atencion_servicios           -> CASCADE en ambos lados.
--
-- Sobre mes_reporte: es la clave de periodo del reporte 345W y la que se cruza
-- en la exportacion. Se declara como date (primer dia del mes) y no como text
-- para poder filtrar por rango en el servidor y no depender del formato.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 7. actividades
-- ---------------------------------------------------------------------------
create table public.actividades (
  id                       uuid        primary key default gen_random_uuid(),
  titulo                   text        not null,
  fecha                    date,
  mes_reporte              date        not null,
  coordinacion_id          uuid        not null references public.coordinaciones (id) on delete restrict,
  responsable              text,
  estado                   text        not null default 'borrador'
                             check (estado in ('borrador', 'enviada', 'validada')),
  estado_ve                text,
  municipio                text,
  parroquia                text,
  establecimiento           text,
  tipo_establecimiento_id  uuid        references public.tipos_establecimiento (id) on delete set null,
  latitud                  numeric(10, 6),
  longitud                 numeric(10, 6),
  fuente_financiamiento_id uuid        references public.fuentes_financiamiento (id) on delete set null,
  observaciones            text,
  created_by               uuid        references public.profiles (id) on delete set null,
  enviada_at               timestamptz,
  validada_at              timestamptz,
  validada_por             uuid        references public.profiles (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.actividades is
  'Jornadas de campo. Una fila por actividad de reporte 345W. Su estado (borrador/enviada/validada) gobierna la edicion tanto por RLS como por triggers.';

comment on column public.actividades.estado is
  'borrador = editable por el coordinador; enviada = ya enviada a la ONU, solo la edita un admin; validada = validada por la admin.';

comment on column public.actividades.mes_reporte is
  'Mes del reporte 345W. Se almacena como date en el primer dia del mes (YYYY-01-01).';

comment on column public.actividades.estado_ve is
  'Estado de verificacion por parte de la VE. Texto libre porque su catalogo no forma parte de esta entrega.';

-- ---------------------------------------------------------------------------
-- 8. atenciones
-- ---------------------------------------------------------------------------
create table public.atenciones (
  id                 uuid        primary key default gen_random_uuid(),
  actividad_id       uuid        not null references public.actividades (id) on delete cascade,
  cedula             text,
  nombre_apellido    text,
  edad               integer     check (edad between 0 and 120),
  sexo               char(1)     check (sexo in ('F', 'M', 'O')),
  motivo             text,
  grupo_atencion_id  uuid        references public.grupos_atencion (id) on delete set null,
  indigena           boolean     not null default false,
  gestante           boolean     not null default false,
  discapacidad      boolean     not null default false,
  tipo_discapacidad  text,
  lgbtiq             boolean     not null default false,
  victima_trata      boolean     not null default false,
  created_by         uuid        references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.atenciones is
  'Personas atendidas dentro de una actividad. Los indicadores del 345W se derivan de estas filas en v_agregados_actividad.';

comment on column public.atenciones.sexo is
  'F = femenino, M = masculino, O = otro. O existe para que no se fuerce una clasificacion binaria; la vista 345W no lo suma a Female/Male.';

-- ---------------------------------------------------------------------------
-- 9. atencion_servicios
-- ---------------------------------------------------------------------------
create table public.atencion_servicios (
  atencion_id uuid    not null references public.atenciones (id) on delete cascade,
  servicio_id uuid    not null references public.servicios (id) on delete cascade,
  cantidad    integer not null default 1 check (cantidad > 0),
  primary key (atencion_id, servicio_id)
);

comment on table public.atencion_servicios is
  'Servicios recibidos por una atencion. La PK compuesta impide duplicar el mismo servicio en la misma atencion.';
