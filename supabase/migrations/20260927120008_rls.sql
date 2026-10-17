-- ============================================================================
-- Migracion: 008_rls.sql
-- ----------------------------------------------------------------------------
-- Que hace: habilita Row Level Security en las 10 tablas y crea 24 politicas.
--
-- Mapa de permisos
--   admin        -> todo, en todas las coordinaciones y en cualquier estado.
--   coordinador  -> solo su coordinacion (current_coordinacion()) y solo
--                   actividades en estado 'borrador'.
--   anon         -> nada. Se revoca explicitamente porque los datos son PII de
--                   personas atendidas por una ONG humanitaria.
--
-- Helpers usados (creados en 001):
--   public.current_rol()           -> 'coordinador' | 'admin' | NULL
--   public.current_coordinacion()  -> uuid de la coordinacion del usuario
--
-- Nota sobre el par (RLS + triggers de la 005): la RLS decide QUE filas puede
-- tocar cada quien; los triggers congelan el campo `estado` para que nadie lo
-- esquive desde dentro de un UPDATE.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Catalogo coordinaciones
-- ---------------------------------------------------------------------------
alter table public.coordinaciones enable row level security;

create policy "coordinaciones_select_autenticado"
  on public.coordinaciones for select to authenticated
  using (true);

create policy "coordinaciones_all_admin"
  on public.coordinaciones for all to authenticated
  using (public.current_rol() = 'admin')
  with check (public.current_rol() = 'admin');

-- ---------------------------------------------------------------------------
-- Catalogo servicios
-- ---------------------------------------------------------------------------
alter table public.servicios enable row level security;

create policy "servicios_select_autenticado"
  on public.servicios for select to authenticated
  using (true);

create policy "servicios_all_admin"
  on public.servicios for all to authenticated
  using (public.current_rol() = 'admin')
  with check (public.current_rol() = 'admin');

-- ---------------------------------------------------------------------------
-- Catalogo tipos_establecimiento
-- ---------------------------------------------------------------------------
alter table public.tipos_establecimiento enable row level security;

create policy "tipos_establecimiento_select_autenticado"
  on public.tipos_establecimiento for select to authenticated
  using (true);

create policy "tipos_establecimiento_all_admin"
  on public.tipos_establecimiento for all to authenticated
  using (public.current_rol() = 'admin')
  with check (public.current_rol() = 'admin');

-- ---------------------------------------------------------------------------
-- Catalogo grupos_atencion
-- ---------------------------------------------------------------------------
alter table public.grupos_atencion enable row level security;

create policy "grupos_atencion_select_autenticado"
  on public.grupos_atencion for select to authenticated
  using (true);

create policy "grupos_atencion_all_admin"
  on public.grupos_atencion for all to authenticated
  using (public.current_rol() = 'admin')
  with check (public.current_rol() = 'admin');

-- ---------------------------------------------------------------------------
-- Catalogo fuentes_financiamiento
-- ---------------------------------------------------------------------------
alter table public.fuentes_financiamiento enable row level security;

create policy "fuentes_financiamiento_select_autenticado"
  on public.fuentes_financiamiento for select to authenticated
  using (true);

create policy "fuentes_financiamiento_all_admin"
  on public.fuentes_financiamiento for all to authenticated
  using (public.current_rol() = 'admin')
  with check (public.current_rol() = 'admin');

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- select: el propio perfil, o cualquiera si sos admin (la app lo necesita para
--         resolver nombres en la vista de admin).
-- No hay politica para el propio INSERT: el perfil lo crea handle_new_user(),
-- que es SECURITY DEFINER y por lo tanto no pasa por RLS. Si se dejara, un
-- usuario podria auto-asignarse rol = 'admin'.
alter table public.profiles enable row level security;

create policy "profiles_select_propio_o_admin"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.current_rol() = 'admin');

create policy "profiles_all_admin"
  on public.profiles for all to authenticated
  using (public.current_rol() = 'admin')
  with check (public.current_rol() = 'admin');

-- ---------------------------------------------------------------------------
-- actividades
-- ---------------------------------------------------------------------------
alter table public.actividades enable row level security;

create policy "actividades_select_admin_o_propia_coordinacion"
  on public.actividades for select to authenticated
  using (
    public.current_rol() = 'admin'
    or coordinacion_id = public.current_coordinacion()
  );

create policy "actividades_insert_admin_o_propia_coordinacion"
  on public.actividades for insert to authenticated
  with check (
    public.current_rol() = 'admin'
    or coordinacion_id = public.current_coordinacion()
  );

create policy "actividades_update_admin_o_borrador_propio"
  on public.actividades for update to authenticated
  using (
    public.current_rol() = 'admin'
    or (estado = 'borrador' and coordinacion_id = public.current_coordinacion())
  )
  with check (
    public.current_rol() = 'admin'
    or (estado = 'borrador' and coordinacion_id = public.current_coordinacion())
  );

create policy "actividades_delete_solo_admin"
  on public.actividades for delete to authenticated
  using (public.current_rol() = 'admin');

-- ---------------------------------------------------------------------------
-- atenciones  (visibilidad y edicion heredadas de la actividad padre)
-- ---------------------------------------------------------------------------
-- Criterio de lectura: existe la actividad padre y es visible.
-- Criterio de escritura: existe la actividad padre y es editable.
alter table public.atenciones enable row level security;

create policy "atenciones_select_si_actividad_visible"
  on public.atenciones for select to authenticated
  using (
    exists (
      select 1
        from public.actividades a
       where a.id = atenciones.actividad_id
         and (
           public.current_rol() = 'admin'
           or a.coordinacion_id = public.current_coordinacion()
         )
    )
  );

create policy "atenciones_insert_si_actividad_editable"
  on public.atenciones for insert to authenticated
  with check (
    exists (
      select 1
        from public.actividades a
       where a.id = atenciones.actividad_id
         and (
           public.current_rol() = 'admin'
           or a.coordinacion_id = public.current_coordinacion()
         )
    )
  );

create policy "atenciones_update_si_actividad_borrador"
  on public.atenciones for update to authenticated
  using (
    exists (
      select 1
        from public.actividades a
       where a.id = atenciones.actividad_id
         and (
           public.current_rol() = 'admin'
           or (a.estado = 'borrador' and a.coordinacion_id = public.current_coordinacion())
         )
    )
  )
  with check (
    exists (
      select 1
        from public.actividades a
       where a.id = atenciones.actividad_id
         and (
           public.current_rol() = 'admin'
           or (a.estado = 'borrador' and a.coordinacion_id = public.current_coordinacion())
         )
    )
  );

-- Nota de diseno: actividades.delete es solo-admin, pero el DELETE de
-- atenciones se permite tambien al coordinador mientras la actividad este en
-- borrador. Si no, un coordinator no podria corregir una atencion mal capturada
-- y tendria que pedirle a un admin que la borrara.
create policy "atenciones_delete_si_actividad_borrador"
  on public.atenciones for delete to authenticated
  using (
    exists (
      select 1
        from public.actividades a
       where a.id = atenciones.actividad_id
         and (
           public.current_rol() = 'admin'
           or (a.estado = 'borrador' and a.coordinacion_id = public.current_coordinacion())
         )
    )
  );

-- ---------------------------------------------------------------------------
-- atencion_servicios  (mismo criterio, resolviendo dos niveles)
-- ---------------------------------------------------------------------------
alter table public.atencion_servicios enable row level security;

create policy "atencion_servicios_select_si_actividad_visible"
  on public.atencion_servicios for select to authenticated
  using (
    exists (
      select 1
        from public.atenciones at
        join public.actividades a on a.id = at.actividad_id
       where at.id = atencion_servicios.atencion_id
         and (
           public.current_rol() = 'admin'
           or a.coordinacion_id = public.current_coordinacion()
         )
    )
  );

create policy "atencion_servicios_insert_si_actividad_editable"
  on public.atencion_servicios for insert to authenticated
  with check (
    exists (
      select 1
        from public.atenciones at
        join public.actividades a on a.id = at.actividad_id
       where at.id = atencion_servicios.atencion_id
         and (
           public.current_rol() = 'admin'
           or a.coordinacion_id = public.current_coordinacion()
         )
    )
  );

create policy "atencion_servicios_update_si_actividad_borrador"
  on public.atencion_servicios for update to authenticated
  using (
    exists (
      select 1
        from public.atenciones at
        join public.actividades a on a.id = at.actividad_id
       where at.id = atencion_servicios.atencion_id
         and (
           public.current_rol() = 'admin'
           or (a.estado = 'borrador' and a.coordinacion_id = public.current_coordinacion())
         )
    )
  )
  with check (
    exists (
      select 1
        from public.atenciones at
        join public.actividades a on a.id = at.actividad_id
       where at.id = atencion_servicios.atencion_id
         and (
           public.current_rol() = 'admin'
           or (a.estado = 'borrador' and a.coordinacion_id = public.current_coordinacion())
         )
    )
  );

create policy "atencion_servicios_delete_si_actividad_borrador"
  on public.atencion_servicios for delete to authenticated
  using (
    exists (
      select 1
        from public.atenciones at
        join public.actividades a on a.id = at.actividad_id
       where at.id = atencion_servicios.atencion_id
         and (
           public.current_rol() = 'admin'
           or (a.estado = 'borrador' and a.coordinacion_id = public.current_coordinacion())
         )
    )
  );

-- ============================================================================
-- Grants
-- ============================================================================
-- authenticated: puede leer y escribir, sujeto a la RLS de arriba.
grant usage on schema public to authenticated;

grant select, insert, update, delete on
  public.coordinaciones,
  public.servicios,
  public.tipos_establecimiento,
  public.grupos_atencion,
  public.fuentes_financiamiento,
  public.profiles,
  public.actividades,
  public.atenciones,
  public.atencion_servicios
  to authenticated;

-- La vista necesita un GRANT explicito: a diferencia de las tablas, los
-- permisos por defecto de PostgreSQL no la cubren.
grant select on public.v_agregados_actividad to authenticated;

-- service_role (lo usa la app para operaciones administrativas y la carga
-- inicial) conserva el bypass de RLS que le otorga BYPASSRLS.
grant all on all tables in schema public to service_role;
grant select on public.v_agregados_actividad to service_role;

-- anon no debe ver nada: son datos personales de personas atendidas. Los
-- catalogos tampoco, porque no aportan nada a un visitante no autenticado.
revoke all on
  public.coordinaciones,
  public.servicios,
  public.tipos_establecimiento,
  public.grupos_atencion,
  public.fuentes_financiamiento,
  public.profiles,
  public.actividades,
  public.atenciones,
  public.atencion_servicios
  from anon;

revoke all on public.v_agregados_actividad from anon;
