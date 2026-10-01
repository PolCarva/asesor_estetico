-- "Buscar más barato" (paso 09, D17): las alternativas más baratas de una prenda se guardan en
-- look_products como una lista aparte ("Más baratas"), sin pisar el ranking principal.

-- 1. Lista de cada resultado: MAIN (ranking de la prenda) o CHEAPER (más baratas que un
--    producto de referencia, con el tope de precio que se pidió). Una lista CHEAPER por prenda.
alter table public.look_products
  add column list text not null default 'MAIN' check (list in ('MAIN', 'CHEAPER')),
  add column reference_product_id uuid references public.products (id) on delete cascade,
  add column max_price_amount numeric(12, 2) check (max_price_amount is null or max_price_amount > 0),
  add column max_price_currency public.currency_code,
  add constraint look_products_cheaper_reference check (
    (list = 'MAIN' and reference_product_id is null and max_price_amount is null
      and max_price_currency is null)
    or (list = 'CHEAPER' and reference_product_id is not null and max_price_amount is not null
      and max_price_currency is not null)
  );

create index look_products_reference_product_id_idx
  on public.look_products (reference_product_id) where reference_product_id is not null;

-- `replace_look_products` (ranking principal) ya borra todas las filas de la prenda: una
-- búsqueda nueva de la prenda también descarta sus "más baratas", que eran relativas a otro
-- ranking.

-- 2. Reemplazo atómico de las "más baratas" de una prenda. No repite productos que ya están
--    en el ranking principal de la prenda (el rank se renumera después de sacarlos).
create function public.replace_cheaper_look_products(
  p_look_id uuid,
  p_slot text,
  p_reference_product_id uuid,
  p_max_price_amount numeric,
  p_max_price_currency public.currency_code,
  p_items jsonb
)
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

  delete from public.look_products
  where look_id = p_look_id and garment_slot = p_slot and list = 'CHEAPER';

  insert into public.look_products (
    look_id, product_id, garment_slot, rank, score, score_breakdown, size_status, user_size,
    list, reference_product_id, max_price_amount, max_price_currency
  )
  select
    p_look_id,
    (item ->> 'product_id')::uuid,
    p_slot,
    (row_number() over (order by ord))::smallint,
    (item ->> 'score')::numeric,
    coalesce(item -> 'score_breakdown', '{}'::jsonb),
    item ->> 'size_status',
    item ->> 'user_size',
    'CHEAPER',
    p_reference_product_id,
    p_max_price_amount,
    p_max_price_currency
  from jsonb_array_elements(p_items) with ordinality as t (item, ord)
  where (item ->> 'product_id')::uuid <> p_reference_product_id
    and not exists (
      select 1 from public.look_products m
      where m.look_id = p_look_id and m.garment_slot = p_slot
        and m.product_id = (item ->> 'product_id')::uuid
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.replace_cheaper_look_products(uuid, text, uuid, numeric, public.currency_code, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_cheaper_look_products(uuid, text, uuid, numeric, public.currency_code, jsonb)
  to service_role;
