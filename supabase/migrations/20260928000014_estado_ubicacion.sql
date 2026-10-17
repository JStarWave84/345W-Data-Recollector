-- Agrega el campo estado_ubicacion a la tabla de actividades.
-- Este campo almacena el estado geográfico de Venezuela donde se realizó la jornada.
-- Se separa del campo 'estado' (que indica borrador/enviada/validada) para evitar confusión.

ALTER TABLE actividades
ADD COLUMN IF NOT EXISTS estado_ubicacion text;

-- Recrear la vista con la nueva columna, manteniendo la estructura existente.
-- Se hace DROP + CREATE porque CREATE OR REPLACE no permite cambiar el orden
-- o quitar columnas existentes.
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

  -- --- agregados de morbilidad ---
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
  count(at.id) filter (where at.victima_trata is true)::int                    AS victimas_trata

FROM public.actividades a
LEFT JOIN public.coordinaciones         c  ON c.id  = a.coordinacion_id
LEFT JOIN public.tipos_establecimiento  te ON te.id = a.tipo_establecimiento_id
LEFT JOIN public.fuentes_financiamiento ff ON ff.id = a.fuente_financiamiento_id
LEFT JOIN public.atenciones             at ON at.actividad_id = a.id

GROUP BY a.id, c.nombre, te.nombre, ff.nombre;

COMMENT ON VIEW public.v_agregados_actividad IS
  'Una fila por actividad: cabecera + agregados 345W. LEFT JOIN, asi que incluye tambien las actividades sin atenciones (todo en cero). security_invoker: respeta la RLS de actividades.';
