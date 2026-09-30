-- Asesoría de imagen detallada (StyleProfile v2). El análisis se guarda partido:
--   * style_profiles.profile_json: núcleo teaser (lo lee cualquier plan).
--   * style_advice.advice_json: asesoría detallada (pelo, grooming, ropa y fit, calzado,
--     accesorios, tatuajes, consejos). Premium también a nivel de datos, como los looks 2-3.

-- Permite una FK compuesta que garantiza que la asesoría es del mismo usuario que el perfil.
alter table public.style_profiles
  add constraint style_profiles_id_user_id_key unique (id, user_id);

create table public.style_advice (
  style_profile_id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  advice_json jsonb not null check (jsonb_typeof(advice_json) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (style_profile_id, user_id)
    references public.style_profiles (id, user_id) on delete cascade
);
create index style_advice_user_id_idx on public.style_advice (user_id);

-- Los default privileges de Supabase dan ALL a anon y authenticated: se revocan.
alter table public.style_advice enable row level security;
revoke all on public.style_advice from anon, authenticated;

-- Solo lectura, solo lo propio y solo con Premium vigente (la escribe el worker).
grant select on public.style_advice to authenticated;
create policy "style_advice: select own premium" on public.style_advice
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and (select public.current_user_is_premium())
  );

-- Guardado atómico: reemplaza la versión de 3 argumentos para que ningún perfil nuevo
-- quede sin su asesoría.
drop function public.create_style_profile_with_looks(uuid, jsonb, jsonb);

create function public.create_style_profile_with_looks(
  p_user_id uuid,
  p_profile jsonb,
  p_advice jsonb,
  p_looks jsonb
)
returns table (style_profile_id uuid, look_id uuid, look_position smallint)
language plpgsql
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_version integer;
begin
  if jsonb_typeof(p_looks) <> 'array' or jsonb_array_length(p_looks) <> 3 then
    raise exception 'se esperaban exactamente 3 looks' using errcode = '22023';
  end if;
  if jsonb_typeof(p_advice) is distinct from 'object' then
    raise exception 'se esperaba la asesoría como objeto' using errcode = '22023';
  end if;

  -- Serializa por usuario: dos análisis simultáneos no pueden pisarse la versión.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select coalesce(max(sp.version), 0) + 1 into v_version
  from public.style_profiles sp where sp.user_id = p_user_id;

  update public.style_profiles set active = false where user_id = p_user_id and active;

  insert into public.style_profiles (user_id, version, profile_json, active)
  values (p_user_id, v_version, p_profile, true)
  returning id into v_profile_id;

  insert into public.style_advice (style_profile_id, user_id, advice_json)
  values (v_profile_id, p_user_id, p_advice);

  update public.profiles set onboarding_completed = true where id = p_user_id;

  return query
  insert into public.looks (user_id, style_profile_id, name, position, status, spec_json)
  select p_user_id, v_profile_id, left(look ->> 'name', 80), ord::smallint, 'PENDING', look
  from jsonb_array_elements(p_looks) with ordinality as t (look, ord)
  returning looks.style_profile_id, looks.id, looks.position;
end;
$$;

revoke all on function public.create_style_profile_with_looks(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_style_profile_with_looks(uuid, jsonb, jsonb, jsonb) to service_role;
