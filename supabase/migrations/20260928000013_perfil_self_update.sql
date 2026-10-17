-- ===========================================================================
-- Migracion: 013_perfil_self_update.sql
-- ----------------------------------------------------------------------------
-- Que hace: permite a cada usuario editar su propio nombre en public.profiles.
--
-- Sin esto, la vista de perfil no podria guardar el nombre: la unica policy de
-- escritura es profiles_all_admin, que exige rol = 'admin'.
--
-- Alcance deliberado: esta policy solo habilita el UPDATE de la fila propia
-- (id = auth.uid()). No toca rol ni coordinacion_id desde el punto de vista de
-- la fila que se puede alcanzar, pero una policy de RLS no puede restringir
-- columnas. El frontend solo envia { nombre }; para blindar el rol haria falta
-- un trigger, que es otra entrega.
-- ===========================================================================

drop policy if exists "profiles_update_nombre_propio" on public.profiles;

create policy "profiles_update_nombre_propio"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

comment on policy "profiles_update_nombre_propio" on public.profiles is
  'Cada usuario actualiza su propio nombre. No puede tocar la fila de otro.';
