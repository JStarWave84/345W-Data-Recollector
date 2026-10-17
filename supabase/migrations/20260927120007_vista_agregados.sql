-- ============================================================================
-- Migracion: 007_vista_agregados.sql
-- ----------------------------------------------------------------------------
-- Que hace: crea public.v_agregados_actividad, una fila por actividad con la
-- cabecera mas los agregados de morbilidad que pide el 345W.
--
-- ---------------------------------------------------------------------------
-- security_invoker = true  (lo mas importante de esta migracion)
-- ---------------------------------------------------------------------------
-- En PostgreSQL una vista es "security definer" por defecto: se ejecuta con los
-- privilegios de su owner (postgres), que ignora la RLS de las tablas base. Si
-- esta vista se creara normal, un coordinador de Psicologia podria leer via
-- PostgREST las actividades de TODAS las coordinaciones, saltandose el
-- aislamiento. Con security_invoker = true la vista se evalua con los
-- privilegios del usuario que consulta, y por lo tanto la RLS de actividades
-- se aplica normalmente.
--
-- ---------------------------------------------------------------------------
-- Correlacion de los agregados con las columnas del 345W
-- ---------------------------------------------------------------------------
--   Girls             edad < 18 y sexo = 'F'
--   Boys              edad < 18 y sexo = 'M'
--   Female            edad >= 18 y sexo = 'F'
--   Male              edad >= 18 y sexo = 'M'
--   Elderly Female    edad >= 60 y sexo = 'F'   (subconjunto de Female)
--   Elderly Male      edad >= 60 y sexo = 'M'   (subconjunto de Male)
--
-- Girls/Boys y Female/Male son excluyentes entre si, pero los "elderly" se
-- solapan con Female/Male a proposito: en el 345W elderly es un desglose, no una
-- categoria aparte.
--
-- Quien tiene sexo = 'O' no se suma a Female/Male, asi que
-- total_atenciones puede no ser igual a girls + boys + female + male. Es lo
-- correcto: forzar a esas personas dentro de una categoria binaria seria
-- falsear el dato.
--
-- Los conteos usan "is true" explicito: asi una fila sin match del LEFT JOIN
-- (donde el booleano llega NULL) nunca se cuenta como atencion atendida.
-- ---------------------------------------------------------------------------

create or replace view public.v_agregados_actividad
with (security_invoker = true)
as
select
  -- --- cabecera ---
  a.id                       as actividad_id,
  a.titulo,
  a.fecha,
  a.mes_reporte,
  c.nombre                   as coordinacion,
  a.responsable,
  a.estado,
  a.estado_ve,
  a.municipio,
  a.parroquia,
  a.establecimiento,
  te.nombre                  as tipo_establecimiento,
  a.latitud,
  a.longitud,
  ff.nombre                  as fuente_financiamiento,
  a.observaciones,

  -- --- agregados de morbilidad ---
  count(at.id)::int                                                            as total_atenciones,
  count(at.id) filter (where at.edad  < 18 and at.sexo = 'F')::int             as girls,
  count(at.id) filter (where at.edad  < 18 and at.sexo = 'M')::int             as boys,
  count(at.id) filter (where at.edad >= 18 and at.sexo = 'F')::int             as female,
  count(at.id) filter (where at.edad >= 18 and at.sexo = 'M')::int             as male,
  count(at.id) filter (where at.edad >= 60 and at.sexo = 'F')::int             as elderly_female,
  count(at.id) filter (where at.edad >= 60 and at.sexo = 'M')::int             as elderly_male,
  count(at.id) filter (where at.indigena      is true)::int                    as indigenas,
  count(at.id) filter (where at.discapacidad is true)::int                    as discapacidad,
  count(at.id) filter (where at.gestante      is true)::int                    as gestantes,
  count(at.id) filter (where at.lgbtiq        is true)::int                    as lgbtiq,
  count(at.id) filter (where at.victima_trata is true)::int                    as victimas_trata

from public.actividades a
-- LEFT JOIN en todas: una actividad sin atenciones debe seguir apareciendo con
-- sus agregados en cero, que es justo el caso que necesita el reporte 345W.
left join public.coordinaciones         c  on c.id  = a.coordinacion_id
left join public.tipos_establecimiento  te on te.id = a.tipo_establecimiento_id
left join public.fuentes_financiamiento ff on ff.id = a.fuente_financiamiento_id
left join public.atenciones             at on at.actividad_id = a.id

-- group by a.id basta para todas las columnas de a: a.id es su primary key y
-- PostgreSQL detecta la dependencia funcional. Las columnas de los catalogos
-- si deben listarse.
group by a.id, c.nombre, te.nombre, ff.nombre;

comment on view public.v_agregados_actividad is
  'Una fila por actividad: cabecera + agregados 345W. LEFT JOIN, asi que incluye tambien las actividades sin atenciones (todo en cero). security_invoker: respeta la RLS de actividades.';

comment on column public.v_agregados_actividad.total_atenciones is
  'Numero de personas atendidas (filas de atenciones), no de servicios.';
