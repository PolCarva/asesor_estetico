-- Talle del usuario con el que se rankeó cada resultado (paso 08). `size_status` se refiere
-- a ese talle: si después el usuario cambia sus talles en el perfil, la UI no puede mostrar
-- "Talle 44 ✓" sobre un estado que se calculó para el 42. null = sin talle (accesorios,
-- talle no cargado) o filas anteriores a esta migración.
alter table public.look_products
  add column user_size text check (user_size is null or char_length(user_size) <= 20);

create or replace function public.replace_look_products(p_look_id uuid, p_slot text, p_items jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'se esperaba un array de productos' using errcode = '22023';
  end if;

  delete from public.look_products where look_id = p_look_id and garment_slot = p_slot;

  insert into public.look_products
    (look_id, product_id, garment_slot, rank, score, score_breakdown, size_status, user_size)
  select
    p_look_id,
    (item ->> 'product_id')::uuid,
    p_slot,
    ord::smallint,
    (item ->> 'score')::numeric,
    coalesce(item -> 'score_breakdown', '{}'::jsonb),
    item ->> 'size_status',
    item ->> 'user_size'
  from jsonb_array_elements(p_items) with ordinality as t (item, ord);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.replace_look_products(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.replace_look_products(uuid, text, jsonb) to service_role;
