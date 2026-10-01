-- Locales físicos sin ecommerce (paso 04b, D10). El SPEC pide mostrarlos con "precio si se
-- conoce": un producto IN_STORE_ONLY puede no tener precio publicado. Cualquier otro
-- producto sigue exigiendo precio y moneda (nunca se inventan).

alter table public.products
  alter column price_amount drop not null,
  alter column currency drop not null,
  add constraint products_price_known check (
    (price_amount is null) = (currency is null)
    and (price_amount is not null or availability = 'IN_STORE_ONLY')
  );

-- Precio del carrito: se toma del catálogo, nunca del cliente. Un producto sin precio (local
-- físico) no se compra online: el error es explícito en lugar de un NOT NULL genérico.
create or replace function public.set_cart_item_price_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_price numeric(12, 2);
  v_currency public.currency_code;
begin
  select p.price_amount, p.currency into v_price, v_currency
  from public.products p where p.id = new.product_id;

  if new.variant_id is not null then
    select coalesce(v.price_amount, v_price), coalesce(v.currency, v_currency)
      into v_price, v_currency
    from public.product_variants v
    where v.id = new.variant_id and v.product_id = new.product_id;
    if not found then
      raise exception 'variant % does not belong to product %', new.variant_id, new.product_id;
    end if;
  end if;

  if v_price is null or v_currency is null then
    raise exception 'product % has no price (in store only)', new.product_id
      using errcode = '22023';
  end if;

  new.price_amount_snapshot = v_price;
  new.currency_snapshot = v_currency;
  return new;
end;
$$;

revoke all on function public.set_cart_item_price_snapshot() from public, anon, authenticated;
