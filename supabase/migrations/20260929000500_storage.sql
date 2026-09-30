-- Buckets privados. Nunca públicos: el acceso es siempre con URLs firmadas de corta duración.
-- Convención de rutas: <user_id>/<...>. La primera carpeta identifica al dueño.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('user-photos', 'user-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('generated-looks', 'generated-looks', false, 15728640, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Una imagen generada es legible si el look es del usuario y está desbloqueado.
-- La preview (teaser) es legible para el dueño aunque el look esté bloqueado.
create function public.can_read_generated_look(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.looks l
    where l.user_id = auth.uid()
      and (
        l.preview_storage_path = p_object_name
        or (
          l.image_storage_path = p_object_name
          and (l.position = 1 or public.current_user_is_premium())
        )
      )
  );
$$;
revoke all on function public.can_read_generated_look(text) from public, anon;
grant execute on function public.can_read_generated_look(text) to authenticated, service_role;

-- user-photos: el dueño lee, sube, reemplaza y borra dentro de su carpeta.
create policy "user-photos: select own" on storage.objects
  for select to authenticated
  using (bucket_id = 'user-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "user-photos: insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'user-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "user-photos: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'user-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'user-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "user-photos: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'user-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- generated-looks: solo lectura para el dueño; escribe el worker con service_role.
create policy "generated-looks: select own unlocked" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'generated-looks'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.can_read_generated_look(name)
  );
