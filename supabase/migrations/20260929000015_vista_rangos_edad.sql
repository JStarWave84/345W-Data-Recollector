-- Agrega el desglose por rango de edad y sexo a la vista de agregados.
--
-- Motivo: el 345W solo distingue <18 y >=60, que es demasiado grueso para
-- dimensionar la atencion. Se agregan 7 rangos x 2 sexos = 14 columnas, que
-- el exportador escribe en una hoja aparte (no en la del 345W, que la ONU
-- valida con un orden de columnas fijo).
--
-- DROP + CREATE por la misma razon que la migracion 014: CREATE OR REPLACE no
-- permite cambiar el orden ni agregar columnas en el medio.

DROP VIEW IF EXISTS public.v_agregados_actividad;

CREATE VIEW public.v_agregados_actividad
WITH (security_invoker = true)
AS
SELECT
  a.id                       AS actividad_id,
  a.titulo,
  a.fecha,
  a.mes_reporte,
  c.nombre                   AS coordinacion,
  a.responsable,
  a.estado,
  a.estado_ubicacion,
  a.municipio,
  a.parroquia,
  a.establecimiento,
  te.nombre                  AS tipo_establecimiento,
  a.latitud,
  a.longitud,
  ff.nombre                  AS fuente_financiamiento,
  a.observaciones,

  -- --- agregados de morbilidad (345W) ---
  count(at.id)::int                                                            AS total_atenciones,
  count(at.id) filter (where at.edad  < 18 and at.sexo = 'F')::int             AS girls,
  count(at.id) filter (where at.edad  < 18 and at.sexo = 'M')::int             AS boys,
  count(at.id) filter (where at.edad >= 18 and at.sexo = 'F')::int             AS female,
  count(at.id) filter (where at.edad >= 18 and at.sexo = 'M')::int             AS male,
  count(at.id) filter (where at.edad >= 60 and at.sexo = 'F')::int             AS elderly_female,
  count(at.id) filter (where at.edad >= 60 and at.sexo = 'M')::int             AS elderly_male,
  count(at.id) filter (where at.indigena      is true)::int                    AS indigenas,
  count(at.id) filter (where at.discapacidad is true)::int                    AS discapacidad,
  count(at.id) filter (where at.gestante      is true)::int                    AS gestantes,
  count(at.id) filter (where at.lgbtiq        is true)::int                    AS lgbtiq,
  count(at.id) filter (where at.victima_trata is true)::int                    AS victimas_trata,

  -- --- desglose por rango de edad y sexo ---
  count(at.id) filter (where at.edad between  0 and   5 and at.sexo = 'F')::int AS edad_0_5_f,
  count(at.id) filter (where at.edad between  0 and   5 and at.sexo = 'M')::int AS edad_0_5_m,
  count(at.id) filter (where at.edad between  6 and  19 and at.sexo = 'F')::int AS edad_6_19_f,
  count(at.id) filter (where at.edad between  6 and  19 and at.sexo = 'M')::int AS edad_6_19_m,
  count(at.id) filter (where at.edad between 20 and  49 and at.sexo = 'F')::int AS edad_20_49_f,
  count(at.id) filter (where at.edad between 20 and  49 and at.sexo = 'M')::int AS edad_20_49_m,
  count(at.id) filter (where at.edad between 50 and  59 and at.sexo = 'F')::int AS edad_50_59_f,
  count(at.id) filter (where at.edad between 50 and  59 and at.sexo = 'M')::int AS edad_50_59_m,
  count(at.id) filter (where at.edad between 60 and  69 and at.sexo = 'F')::int AS edad_60_69_f,
  count(at.id) filter (where at.edad between 60 and  69 and at.sexo = 'M')::int AS edad_60_69_m,
  count(at.id) filter (where at.edad between 70 and  79 and at.sexo = 'F')::int AS edad_70_79_f,
  count(at.id) filter (where at.edad between 70 and  79 and at.sexo = 'M')::int AS edad_70_79_m,
  count(at.id) filter (where at.edad >= 80               and at.sexo = 'F')::int AS edad_80_mas_f,
  count(at.id) filter (where at.edad >= 80               and at.sexo = 'M')::int AS edad_80_mas_m

FROM public.actividades a
LEFT JOIN public.coordinaciones         c  ON c.id  = a.coordinacion_id
LEFT JOIN public.tipos_establecimiento  te ON te.id = a.tipo_establecimiento_id
LEFT JOIN public.fuentes_financiamiento ff ON ff.id = a.fuente_financiamiento_id
LEFT JOIN public.atenciones             at ON at.actividad_id = a.id

GROUP BY a.id, c.nombre, te.nombre, ff.nombre;

COMMENT ON VIEW public.v_agregados_actividad IS
  'Una fila por actividad: cabecera + agregados 345W + desglose por rango de edad y sexo. LEFT JOIN, asi que incluye tambien las actividades sin atenciones (todo en cero). security_invoker: respeta la RLS de actividades.';

-- ---------------------------------------------------------------------------
-- Correlacion de los rangos de edad con las columnas del exportador
-- ---------------------------------------------------------------------------
--   edad_0_5_f / edad_0_5_m         edad between  0 and  5
--   edad_6_19_f / edad_6_19_m       edad between  6 and 19
--   edad_20_49_f / edad_20_49_m     edad between 20 and 49
--   edad_50_59_f / edad_50_59_m     edad between 50 and 59
--   edad_60_69_f / edad_60_69_m     edad between 60 and 69
--   edad_70_79_f / edad_70_79_m     edad between 70 and 79
--   edad_80_mas_f / edad_80_mas_m   edad >= 80
--
-- Los rangos son contiguos y sin superposicion: cada edad de 0 a 120 cae en
-- exactamente uno, por el check de atenciones (edad between 0 and 120).
--
-- Estas columnas NO suman total_atenciones, y no es un error. Quedan fuera:
--
--   - Quien tiene sexo = 'O' u otro valor. Se mantiene la convencion de la
--     migracion 007: meter a esas personas en una columna binaria falsearia el
--     dato. Se puede ver el desglose de sexo con total_atenciones, girls,
--     boys, female y male en la hoja del 345W.
--   - Quien tiene edad IS NULL, porque las comparaciones con NULL dan NULL y no
--     cuentan. Suman en total_atenciones, como ya pasaba con girls/boys.
--
-- `src/lib/edades.js` espeja estos rangos para la columna "Rango de edad" de la
-- hoja de detalle. Si se cambia un limite aca, hay que cambiarlo alla.
