-- Pipeline de análisis: guarda de forma atómica un StyleProfile nuevo (versión
-- siguiente, activo) y sus 3 looks. Solo service_role (lo usa el worker).
create function public.create_style_profile_with_looks(
  p_user_id uuid,
  p_profile jsonb,
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

  -- Serializa por usuario: dos análisis simultáneos no pueden pisarse la versión.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select coalesce(max(sp.version), 0) + 1 into v_version
  from public.style_profiles sp where sp.user_id = p_user_id;

  update public.style_profiles set active = false where user_id = p_user_id and active;

  insert into public.style_profiles (user_id, version, profile_json, active)
  values (p_user_id, v_version, p_profile, true)
  returning id into v_profile_id;

  update public.profiles set onboarding_completed = true where id = p_user_id;

  return query
  insert into public.looks (user_id, style_profile_id, name, position, status, spec_json)
  select p_user_id, v_profile_id, left(look ->> 'name', 80), ord::smallint, 'PENDING', look
  from jsonb_array_elements(p_looks) with ordinality as t (look, ord)
  returning looks.style_profile_id, looks.id, looks.position;
end;
$$;

revoke all on function public.create_style_profile_with_looks(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_style_profile_with_looks(uuid, jsonb, jsonb) to service_role;
