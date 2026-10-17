-- ============================================================================
-- Migracion: 006_indices.sql
-- ----------------------------------------------------------------------------
-- Que hace: crea los indices de apoyo del modelo.
--
--   actividades(coordinacion_id)  -> toda politica RLS de actividades y la
--                                     existencia de atenciones filtran por
--                                     coordinacion.
--   actividades(estado)            -> filtro del dashboard y de la
--                                     exportacion (solo enviada/validada).
--   actividades(mes_reporte)       -> rango de meses de la exportacion.
--   atenciones(actividad_id)       -> LEFT JOIN de la vista y ON DELETE
--                                     CASCADE.
--   atencion_servicios(servicio_id)-> se crea aparte del indice primario de
--                                     la PK (atencion_id, servicio_id), que
--                                     solo cubre el lado de atencion.
--   servicios(coordinacion_id)     -> se creo ya en la migracion 002 junto a
--                                     la tabla; se repite aqui con
--                                     if not exists para que este archivo sea
--                                     autocontenido e idempotente.
--
-- Indices que NO se crean a proposito:
--   - atenciones(created_by) / actividades(created_by): columnas de auditoria,
--     nunca se filtran por ellas.
--   - atenciones(sexo, edad): el filtro de la vista se aggregate con
--     count(...) filter, que ya se apoya en el indice de actividad_id.
--   - perfiles(coordinacion_id): la tabla tiene una fila por usuario.
-- ============================================================================

create index actividades_coordinacion_id_idx
  on public.actividades (coordinacion_id);

create index actividades_estado_idx
  on public.actividades (estado);

create index actividades_mes_reporte_idx
  on public.actividades (mes_reporte);

create index atenciones_actividad_id_idx
  on public.atenciones (actividad_id);

create index atencion_servicios_servicio_id_idx
  on public.atencion_servicios (servicio_id);

-- Idempotente: el indice se creo en 002 al definir servicios.
create index if not exists servicios_coordinacion_id_idx
  on public.servicios (coordinacion_id);
