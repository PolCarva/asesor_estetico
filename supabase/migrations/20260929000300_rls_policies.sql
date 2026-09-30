-- Row Level Security y permisos.
-- Principios:
--   * anon no tiene acceso a ninguna tabla.
--   * authenticated solo ve y modifica sus propias filas, y solo las columnas necesarias.
--   * jobs, ai_usage, analytics_events y payment_events solo se escriben con service_role
--     (servidor Next.js o worker), nunca desde el cliente.
--   * El contenido Premium (looks 2 y 3, shopping, carrito, chat) se valida también acá,
--     no solo en la UI.

-- Helpers de autorización -------------------------------------------------------------

-- Regla Premium. Replica isPremiumSubscription() de @asesor/shared: si cambia una, cambiar la otra.
create function public.current_user_is_premium()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = auth.uid()
      and s.status in ('ACTIVE', 'CANCELLED')
      and s.current_period_end > now()
  );
$$;

-- Precio del carrito: se toma del catálogo, nunca del cliente.
create function public.set_cart_item_price_snapshot()
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

  new.price_amount_snapshot = v_price;
  new.currency_snapshot = v_currency;
  return new;
end;
$$;

create trigger set_price_snapshot before insert on public.cart_items
  for each row execute function public.set_cart_item_price_snapshot();

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_cart_item_price_snapshot() from public, anon, authenticated;
revoke all on function public.current_user_is_premium() from public, anon;
grant execute on function public.current_user_is_premium() to authenticated, service_role;

-- RLS en todas las tablas -------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.style_profiles enable row level security;
alter table public.user_photos enable row level security;
alter table public.looks enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.look_products enable row level security;
alter table public.favorites enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payment_events enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.jobs enable row level security;
alter table public.ai_usage enable row level security;
alter table public.analytics_events enable row level security;

-- Permisos base: nada para anon ni authenticated; todo para service_role.
revoke all on all tables in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;

-- profiles: el usuario lee y edita su perfil, sin poder cambiar role, id ni país.
grant select on public.profiles to authenticated;
grant update (display_name, style_risk_level, tattoo_preference, onboarding_completed)
  on public.profiles to authenticated;
create policy "profiles: select own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- style_profiles: solo lectura (los crea el worker).
grant select on public.style_profiles to authenticated;
create policy "style_profiles: select own" on public.style_profiles
  for select to authenticated using (user_id = (select auth.uid()));

-- user_photos: el usuario sube y borra sus fotos. El estado lo cambia el worker.
grant select, delete on public.user_photos to authenticated;
grant insert (user_id, storage_path, type, mime_type, size_bytes, metadata_json)
  on public.user_photos to authenticated;
create policy "user_photos: select own" on public.user_photos
  for select to authenticated using (user_id = (select auth.uid()));
create policy "user_photos: insert own" on public.user_photos
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'UPLOADED'
    and pg_column_size(metadata_json) <= 4096
  );
create policy "user_photos: delete own" on public.user_photos
  for delete to authenticated using (user_id = (select auth.uid()));

-- looks: el look 1 es gratis; el resto requiere Premium también a nivel de datos.
grant select on public.looks to authenticated;
create policy "looks: select own unlocked" on public.looks
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and (position = 1 or (select public.current_user_is_premium()))
  );

-- Catálogo: lectura para usuarios autenticados.
grant select on public.products, public.product_variants to authenticated;
create policy "products: select authenticated" on public.products
  for select to authenticated using (true);
create policy "product_variants: select authenticated" on public.product_variants
  for select to authenticated using (true);

-- look_products (shopping): Premium y dueño del look.
grant select on public.look_products to authenticated;
create policy "look_products: select own premium" on public.look_products
  for select to authenticated
  using (
    (select public.current_user_is_premium())
    and exists (
      select 1 from public.looks l where l.id = look_id and l.user_id = (select auth.uid())
    )
  );

-- favorites: looks propios para todos; productos solo Premium.
grant select, delete on public.favorites to authenticated;
grant insert (user_id, look_id, product_id) on public.favorites to authenticated;
create policy "favorites: select own" on public.favorites
  for select to authenticated using (user_id = (select auth.uid()));
create policy "favorites: insert own" on public.favorites
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      look_id is null
      or exists (
        select 1 from public.looks l where l.id = look_id and l.user_id = (select auth.uid())
      )
    )
    and (product_id is null or (select public.current_user_is_premium()))
  );
create policy "favorites: delete own" on public.favorites
  for delete to authenticated using (user_id = (select auth.uid()));

-- carts / cart_items: Premium.
grant select on public.carts to authenticated;
grant insert (user_id) on public.carts to authenticated;
create policy "carts: select own" on public.carts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "carts: insert own premium" on public.carts
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.current_user_is_premium()));

grant select, delete on public.cart_items to authenticated;
grant insert (cart_id, product_id, variant_id, quantity) on public.cart_items to authenticated;
grant update (quantity) on public.cart_items to authenticated;
create policy "cart_items: select own" on public.cart_items
  for select to authenticated
  using (exists (
    select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())
  ));
create policy "cart_items: insert own premium" on public.cart_items
  for insert to authenticated
  with check (
    (select public.current_user_is_premium())
    and exists (
      select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())
    )
  );
create policy "cart_items: update own premium" on public.cart_items
  for update to authenticated
  using (exists (
    select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())
  ))
  with check ((select public.current_user_is_premium()));
create policy "cart_items: delete own" on public.cart_items
  for delete to authenticated
  using (exists (
    select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())
  ));

-- subscriptions: solo lectura. Las escribe el servidor tras validar el pago.
grant select on public.subscriptions to authenticated;
create policy "subscriptions: select own" on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

-- chat: Premium. El usuario solo puede escribir mensajes con role = 'user'.
grant select, delete on public.chat_threads to authenticated;
grant insert (user_id, look_id, title) on public.chat_threads to authenticated;
grant update (title) on public.chat_threads to authenticated;
create policy "chat_threads: select own" on public.chat_threads
  for select to authenticated using (user_id = (select auth.uid()));
create policy "chat_threads: insert own premium" on public.chat_threads
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.current_user_is_premium())
    and (
      look_id is null
      or exists (
        select 1 from public.looks l where l.id = look_id and l.user_id = (select auth.uid())
      )
    )
  );
create policy "chat_threads: update own" on public.chat_threads
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "chat_threads: delete own" on public.chat_threads
  for delete to authenticated using (user_id = (select auth.uid()));

grant select on public.chat_messages to authenticated;
grant insert (thread_id, user_id, role, content) on public.chat_messages to authenticated;
create policy "chat_messages: select own" on public.chat_messages
  for select to authenticated using (user_id = (select auth.uid()));
create policy "chat_messages: insert own user message" on public.chat_messages
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and role = 'user'
    and (select public.current_user_is_premium())
    and exists (
      select 1 from public.chat_threads t
      where t.id = thread_id and t.user_id = (select auth.uid())
    )
  );

-- jobs: el usuario puede ver el estado de sus jobs, nunca crearlos ni modificarlos.
grant select (id, type, status, user_id, attempts, max_attempts, scheduled_at, finished_at, created_at, updated_at)
  on public.jobs to authenticated;
create policy "jobs: select own" on public.jobs
  for select to authenticated using (user_id = (select auth.uid()));

-- ai_usage, analytics_events, payment_events: sin acceso desde el cliente
-- (RLS habilitado y sin políticas ni grants para anon/authenticated).
