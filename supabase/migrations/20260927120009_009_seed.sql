-- ============================================================================
-- Migracion: 009_seed.sql
-- ----------------------------------------------------------------------------
-- Que hace: carga los catalogos iniciales de la organizacion.
--
--   - 6 coordinaciones
--   - 6 servicios (cada uno colgado de su coordinacion)
--   - 10 tipos de establecimiento
--   - 4 grupos de atencion
--   - 6 fuentes de financiamiento
--
-- Es idempotente: todos los inserts usan ON CONFLICT DO NOTHING, de modo que
-- puede ejecutarse mas de una vez sin duplicar filas ni fallar. Esto permite
-- que supabase/seed.sql (que hace \ir de este archivo) y esta migracion
-- convivan sin importar el orden.
--
-- Para agregar un catalogo nuevo despues, se agrega aqui con el mismo patron.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Coordinaciones
-- ---------------------------------------------------------------------------
insert into public.coordinaciones (nombre, descripcion) values
  ('Psicología', 'Atención psicosocial individual y grupal.'),
  ('Médica',     'Consulta médica general y especializada.'),
  ('ASH',        'Agua, Saneamiento e Higiene: entrega de kits.'),
  ('PEAS',       'Prevención, Educación, Acción y Sensibilización.'),
  ('Nutrición',  'Atención nutricional y seguridad alimentaria.'),
  ('Protección', 'Protección de derechos y atención a casos de trata.')
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------------------
-- Servicios (se resuelven por nombre de coordinacion para no hardcodear UUIDs)
-- ---------------------------------------------------------------------------
insert into public.servicios (nombre, coordinacion_id)
select v.nombre, c.id
  from (values
    ('Consulta individual (Psicología)', 'Psicología'),
    ('Sesión grupal (Psicología)',       'Psicología'),
    ('Consulta médica (Médica)',         'Médica'),
    ('Kit de higiene menstrual (ASH)',    'ASH'),
    ('Kit de higiene familiar (ASH)',     'ASH'),
    ('Sensibilización PEAS (PEAS)',       'PEAS')
  ) as v(nombre, coordinacion)
  join public.coordinaciones c on c.nombre = v.coordinacion
on conflict (nombre, coordinacion_id) do nothing;

-- ---------------------------------------------------------------------------
-- Tipos de establecimiento
-- ---------------------------------------------------------------------------
insert into public.tipos_establecimiento (nombre) values
  ('Comunidad'),
  ('Escuela o centro educativo'),
  ('Espacio o centro comunitario / institucional'),
  ('Sede / Espacios de la organización'),
  ('Clínica Popular'),
  ('Hospital'),
  ('Ambulatorio'),
  ('Consultorio'),
  ('Virtual'),
  ('Otro')
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------------------
-- Grupos de atención
-- ---------------------------------------------------------------------------
insert into public.grupos_atencion (nombre) values
  ('Población de acogida'),
  ('Población indígena'),
  ('Ninguna de las anteriores'),
  ('No aplica')
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------------------
-- Fuentes de financiamiento
-- ---------------------------------------------------------------------------
insert into public.fuentes_financiamiento (nombre) values
  ('Autogestión'),
  ('Subvención'),
  ('Donación'),
  ('Convenio'),
  ('Ninguno de los anteriores'),
  ('Otros')
on conflict (nombre) do nothing;
