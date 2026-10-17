-- ===========================================================================
-- Migracion: 012_servicios_por_coordinacion.sql
-- ----------------------------------------------------------------------------
-- Que hace: el coordinador puede hacer CRUD de los servicios de SU
-- coordinacion. Antes solo el admin podia escribir en servicios, lo que
-- dejaba al coordinador sin forma de ofrecer un servicio nuevo desde la app.
--
-- El admin mantiene acceso total (la policy servicios_all_admin ya existente
-- lo cubre). Estas policies se suman: no la reemplazan.
--
-- Segun el comentario de la tabla, un servicio pertenece a una coordinacion,
-- asi que el WITH CHECK de UPDATE tambien verifica la coordinacion: un
-- coordinador no puede mover un servicio a otra coordinacion.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- INSERT: el coordinador puede crear servicios de su coordinacion
-- ---------------------------------------------------------------------------
drop policy if exists "servicios_insert_coordinador" on public.servicios;

create policy "servicios_insert_coordinador"
  on public.servicios for insert to authenticated
  with check (
    public.current_rol() = 'admin'
    or coordinacion_id = public.current_coordinacion()
  );

-- ---------------------------------------------------------------------------
-- UPDATE: el coordinador puede editar servicios de su coordinacion
-- ---------------------------------------------------------------------------
drop policy if exists "servicios_update_coordinador" on public.servicios;

create policy "servicios_update_coordinador"
  on public.servicios for update to authenticated
  using (
    public.current_rol() = 'admin'
    or coordinacion_id = public.current_coordinacion()
  )
  with check (
    public.current_rol() = 'admin'
    or coordinacion_id = public.current_coordinacion()
  );

-- ---------------------------------------------------------------------------
-- DELETE: el coordinador puede borrar servicios de su coordinacion
-- ---------------------------------------------------------------------------
drop policy if exists "servicios_delete_coordinador" on public.servicios;

create policy "servicios_delete_coordinador"
  on public.servicios for delete to authenticated
  using (
    public.current_rol() = 'admin'
    or coordinacion_id = public.current_coordinacion()
  );

comment on policy "servicios_insert_coordinador" on public.servicios is
  'El coordinador crea servicios de su coordinacion; el admin, de cualquiera.';
comment on policy "servicios_update_coordinador" on public.servicios is
  'El coordinador edita servicios de su coordinacion; el admin, de cualquiera.';
comment on policy "servicios_delete_coordinador" on public.servicios is
  'El coordinador borra servicios de su coordinacion; el admin, de cualquiera.';
