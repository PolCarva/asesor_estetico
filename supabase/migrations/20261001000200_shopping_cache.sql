-- Cache de búsquedas de shopping y persistencia de resultados (paso 05, D12).

-- 1. La identidad de un producto es su URL canónica (paso 04b). El único por
--    (store_domain, external_id) chocaba con el de url cuando una tienda renombra un
--    producto o la página declara su id de forma distinta entre corridas: queda como índice.
alter table public.products drop constraint products_store_domain_external_id_key;
create index products_store_external_idx on public.products (store_domain, external_id);

-- 2. Pools de búsqueda (24 h): la clave es la prenda (sha256 de la query sin talle, precio
--    máximo ni límite) y el valor, todos los productos validados de esa búsqueda, sin
--    ranking. Sin datos del usuario. Solo el worker (service role) la lee y la escribe.
create table public.shopping_search_cache (
  key text primary key check (key ~ '^[0-9a-f]{64}$'),
  query_json jsonb not null check (jsonb_typeof(query_json) = 'object'),
  product_ids uuid[] not null default '{}',
  stats jsonb not null default '{}'::jsonb check (jsonb_typeof(stats) = 'object'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index shopping_search_cache_expires_at_idx on public.shopping_search_cache (expires_at);

alter table public.shopping_search_cache enable row level security;
revoke all on public.shopping_search_cache from anon, authenticated;

-- 3. look_products: cómo quedó el talle del usuario en cada producto rankeado, para
--    mostrar "talle sin verificar" con honestidad (null en filas anteriores al paso 05).
alter table public.look_products
  add column size_status text check (
    size_status in (
      'AVAILABLE', 'OUT_OF_STOCK', 'NOT_OFFERED', 'UNVERIFIED', 'NOT_REQUESTED', 'NOT_APPLICABLE'
    )
  );

-- 4. Reemplazo atómico del ranking de una prenda de un look: nunca queda a medias (sin
--    resultados viejos mezclados con nuevos ni la prenda vacía entre el borrado y el alta).
create function public.replace_look_products(p_look_id uuid, p_slot text, p_items jsonb)
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
    (look_id, product_id, garment_slot, rank, score, score_breakdown, size_status)
  select
    p_look_id,
    (item ->> 'product_id')::uuid,
    p_slot,
    ord::smallint,
    (item ->> 'score')::numeric,
    coalesce(item -> 'score_breakdown', '{}'::jsonb),
    item ->> 'size_status'
  from jsonb_array_elements(p_items) with ordinality as t (item, ord);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.replace_look_products(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.replace_look_products(uuid, text, jsonb) to service_role;
