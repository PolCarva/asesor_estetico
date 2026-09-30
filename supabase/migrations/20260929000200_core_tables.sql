-- Tablas del dominio. RLS se habilita en todas; las políticas están en la migración siguiente.

-- Perfil de la app, 1:1 con auth.users.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  country_code char(2) not null default 'UY' check (country_code = 'UY'),
  role public.user_role not null default 'user',
  style_risk_level public.style_risk_level not null default 'BALANCED',
  tattoo_preference public.tattoo_preference not null default 'NEUTRAL',
  onboarding_completed boolean not null default false,
  -- El MVP es solo para mayores de 18: se registra cuándo lo confirmó.
  age_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Versiones del perfil de estilo generado por IA. Solo una activa por usuario.
create table public.style_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  version integer not null check (version > 0),
  profile_json jsonb not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, version)
);
create unique index style_profiles_one_active_per_user on public.style_profiles (user_id) where active;

-- Fotos subidas por el usuario. El archivo vive en Storage (bucket user-photos).
create table public.user_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null unique,
  type public.user_photo_type not null,
  status public.user_photo_status not null default 'UPLOADED',
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Una foto por tipo: reemplazar borra la anterior.
  unique (user_id, type),
  -- La ruta siempre empieza con el id del dueño.
  check (split_part(storage_path, '/', 1) = user_id::text)
);

create table public.looks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  style_profile_id uuid not null references public.style_profiles (id) on delete cascade,
  name text not null check (char_length(name) <= 80),
  -- 1 es el look gratis; 2 y 3 requieren Premium.
  position smallint not null check (position between 1 and 3),
  status public.look_status not null default 'PENDING',
  spec_json jsonb not null,
  image_storage_path text,
  preview_storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (style_profile_id, position)
);
create index looks_user_id_idx on public.looks (user_id);

-- Catálogo global de productos externos normalizados (lo escribe el worker).
create table public.products (
  id uuid primary key default gen_random_uuid(),
  external_id text not null,
  store_name text not null,
  store_domain text not null,
  url text not null unique check (url ~ '^https?://'),
  title text not null,
  brand text,
  category public.product_category not null,
  description text,
  image_url text check (image_url is null or image_url ~ '^https?://'),
  price_amount numeric(12, 2) not null check (price_amount >= 0),
  currency public.currency_code not null,
  colors text[] not null default '{}',
  materials text[] not null default '{}',
  fit text,
  availability public.product_availability not null default 'UNKNOWN',
  data_json jsonb not null default '{}'::jsonb,
  last_fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_domain, external_id)
);
create index products_category_idx on public.products (category);
create index products_last_fetched_at_idx on public.products (last_fetched_at);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  external_id text not null,
  sku text,
  size text,
  color text,
  availability public.product_availability not null default 'UNKNOWN',
  price_amount numeric(12, 2) check (price_amount >= 0),
  currency public.currency_code,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, external_id)
);

-- Productos sugeridos para cada prenda (slot) de un look.
create table public.look_products (
  id uuid primary key default gen_random_uuid(),
  look_id uuid not null references public.looks (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  garment_slot text not null check (garment_slot ~ '^(top|bottom|shoes|layering:[0-2]|accessory:[0-4])$'),
  rank smallint not null check (rank > 0),
  score numeric(5, 4) not null check (score between 0 and 1),
  score_breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (look_id, garment_slot, product_id)
);
create index look_products_product_id_idx on public.look_products (product_id);

create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  look_id uuid references public.looks (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (num_nonnulls(look_id, product_id) = 1),
  unique (user_id, look_id),
  unique (user_id, product_id)
);
create index favorites_look_id_idx on public.favorites (look_id);
create index favorites_product_id_idx on public.favorites (product_id);

-- Carrito externo: un carrito por usuario.
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  quantity smallint not null default 1 check (quantity between 1 and 10),
  price_amount_snapshot numeric(12, 2) not null check (price_amount_snapshot >= 0),
  currency_snapshot public.currency_code not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (cart_id, product_id, variant_id)
);
create index cart_items_product_id_idx on public.cart_items (product_id);
create index cart_items_variant_id_idx on public.cart_items (variant_id);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider public.payment_provider not null,
  provider_subscription_id text,
  status public.subscription_status not null default 'PENDING',
  plan text not null default 'premium_monthly',
  price_amount numeric(10, 2) not null default 4.99,
  currency public.currency_code not null default 'USD',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);
create index subscriptions_user_id_idx on public.subscriptions (user_id, status);

-- Webhooks de pagos recibidos. unique(provider, event_id) da idempotencia.
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider public.payment_provider not null,
  event_id text not null,
  event_type text not null,
  status public.payment_event_status not null default 'RECEIVED',
  payload jsonb not null,
  error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  look_id uuid references public.looks (id) on delete set null,
  title text check (char_length(title) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chat_threads_user_id_idx on public.chat_threads (user_id, updated_at desc);
create index chat_threads_look_id_idx on public.chat_threads (look_id);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.chat_role not null,
  content text not null check (char_length(content) between 1 and 4000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index chat_messages_thread_id_idx on public.chat_messages (thread_id, created_at);
create index chat_messages_user_id_idx on public.chat_messages (user_id);

-- Cola de trabajos en Postgres (ver migración de funciones de jobs).
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  type public.job_type not null,
  status public.job_status not null default 'QUEUED',
  user_id uuid references public.profiles (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  priority smallint not null default 0,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts > 0),
  idempotency_key text unique,
  scheduled_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  finished_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Índice parcial para claim_next_job: solo filas pendientes.
create index jobs_queue_idx on public.jobs (priority desc, scheduled_at) where status = 'QUEUED';
create index jobs_running_idx on public.jobs (locked_at) where status = 'RUNNING';
create index jobs_user_id_idx on public.jobs (user_id, created_at desc);
create index jobs_status_created_at_idx on public.jobs (status, created_at desc);

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  operation public.ai_operation not null,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  image_count integer not null default 0 check (image_count >= 0),
  estimated_cost_usd numeric(12, 6) not null default 0 check (estimated_cost_usd >= 0),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  success boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index ai_usage_created_at_idx on public.ai_usage (created_at desc);
create index ai_usage_user_id_idx on public.ai_usage (user_id);
create index ai_usage_job_id_idx on public.ai_usage (job_id);

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name ~ '^[a-z][a-z_]{1,63}$'),
  user_id uuid references public.profiles (id) on delete set null,
  anonymous_id text check (char_length(anonymous_id) <= 64),
  path text check (char_length(path) <= 200),
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index analytics_events_name_created_at_idx on public.analytics_events (name, created_at desc);
create index analytics_events_user_id_idx on public.analytics_events (user_id);

-- updated_at automático.
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.user_photos
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.looks
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.product_variants
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.carts
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.cart_items
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.chat_threads
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

-- Crear el perfil automáticamente al registrarse.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, age_confirmed_at)
  values (
    new.id,
    nullif(left(trim(new.raw_user_meta_data ->> 'display_name'), 80), ''),
    case when (new.raw_user_meta_data ->> 'age_confirmed') = 'true' then now() end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
