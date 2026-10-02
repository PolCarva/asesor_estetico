-- Carrito real (paso 10a, D18). El carrito no procesa la compra: agrupa productos externos por
-- look y prenda, con el precio que fija la base (nunca el cliente), y se puede marcar lo que
-- ya se compró en la tienda.

-- 1. Look y prenda de cada ítem, y cuándo se compró.
--    Con look, la prenda es obligatoria. Sin look hay dos casos: un producto suelto (sin
--    prenda) o un ítem cuyo look se borró (`on delete set null`: el ítem queda en el carrito,
--    con la prenda como referencia).
--    El precio lo fija siempre el trigger: los defaults solo existen para que el cliente no
--    tenga que mandarlo (tampoco puede: no tiene grant sobre esas columnas).
alter table public.cart_items
  add column look_id uuid references public.looks (id) on delete set null,
  add column garment_slot text
    check (garment_slot ~ '^(top|bottom|shoes|layering:[0-2]|accessory:[0-4])$'),
  add column purchased_at timestamptz,
  add constraint cart_items_look_slot check (look_id is null or garment_slot is not null),
  alter column price_amount_snapshot set default 0,
  alter column currency_snapshot set default 'UYU';

create index cart_items_look_id_idx on public.cart_items (look_id) where look_id is not null;

-- 2. Único. El mismo producto (y talle) puede estar en dos looks, una vez por prenda; suelto,
--    una vez. Los ítems de looks borrados no tienen único: si no, borrar un look con el mismo
--    producto que otro look ya borrado chocaría al poner `look_id` en null.
alter table public.cart_items drop constraint cart_items_cart_id_product_id_variant_id_key;
create unique index cart_items_look_item_key
  on public.cart_items (cart_id, look_id, garment_slot, product_id, variant_id) nulls not distinct
  where look_id is not null;
create unique index cart_items_loose_item_key
  on public.cart_items (cart_id, product_id, variant_id) nulls not distinct
  where look_id is null and garment_slot is null;

-- 3. Precio del ítem: se toma del catálogo al agregar y también al cambiar el producto o el
--    talle (variante). Un producto sin precio (local físico) no se agrega: error explícito
--    (`22023`) que la app traduce a un mensaje humano. Si solo cambia el talle de un producto
--    que se quedó sin precio, o la base borra una variante que la tienda dejó de publicar
--    (`variant_id` → null), se conserva el último precio conocido: el carrito no se rompe.
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
    if tg_op = 'UPDATE' and new.product_id = old.product_id then
      return new;
    end if;
    raise exception 'product % has no price (in store only)', new.product_id
      using errcode = '22023';
  end if;

  new.price_amount_snapshot = v_price;
  new.currency_snapshot = v_currency;
  return new;
end;
$$;

revoke all on function public.set_cart_item_price_snapshot() from public, anon, authenticated;

drop trigger set_price_snapshot on public.cart_items;
create trigger set_price_snapshot
  before insert or update of product_id, variant_id on public.cart_items
  for each row execute function public.set_cart_item_price_snapshot();

-- 4. Permisos por columna. Se suman look y prenda al insert, y producto (cambiar por otra
--    alternativa), talle y comprado al update. Precio, moneda y carrito siguen fuera.
grant insert (look_id, garment_slot) on public.cart_items to authenticated;
grant update (product_id, variant_id, purchased_at) on public.cart_items to authenticated;

-- 5. IDOR: el look de un ítem tiene que ser del usuario (al agregar y al modificar).
drop policy "cart_items: insert own premium" on public.cart_items;
create policy "cart_items: insert own premium" on public.cart_items
  for insert to authenticated
  with check (
    (select public.current_user_is_premium())
    and exists (
      select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())
    )
    and (
      look_id is null
      or exists (
        select 1 from public.looks l where l.id = look_id and l.user_id = (select auth.uid())
      )
    )
  );

drop policy "cart_items: update own premium" on public.cart_items;
create policy "cart_items: update own premium" on public.cart_items
  for update to authenticated
  using (exists (
    select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())
  ))
  with check (
    (select public.current_user_is_premium())
    and exists (
      select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())
    )
    and (
      look_id is null
      or exists (
        select 1 from public.looks l where l.id = look_id and l.user_id = (select auth.uid())
      )
    )
  );
