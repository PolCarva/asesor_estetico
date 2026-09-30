-- Fundación: tipos enumerados y helpers comunes.
-- Todos los objetos viven en el schema public; las funciones fijan search_path vacío.

create type public.user_role as enum ('user', 'admin');
create type public.style_risk_level as enum ('CONSERVATIVE', 'BALANCED', 'BOLD');
create type public.tattoo_preference as enum ('HIGHLIGHT', 'NEUTRAL', 'COVER');
create type public.user_photo_type as enum ('MAIN_BODY', 'FACE_DETAIL');
create type public.user_photo_status as enum ('UPLOADED', 'VALIDATING', 'VALID', 'INVALID');
create type public.look_status as enum ('PENDING', 'GENERATING', 'READY', 'FAILED');
create type public.product_availability as enum ('IN_STOCK', 'OUT_OF_STOCK', 'UNKNOWN', 'IN_STORE_ONLY');
create type public.product_category as enum (
  'SHIRT', 'T_SHIRT', 'KNITWEAR', 'TOP', 'OUTERWEAR', 'BLAZER', 'PANTS', 'JEANS', 'SHORTS',
  'SKIRT', 'DRESS', 'SHOES', 'BAG', 'BELT', 'JEWELRY', 'EYEWEAR', 'WATCH', 'HAT', 'SCARF', 'OTHER'
);
create type public.currency_code as enum ('UYU', 'USD');
create type public.payment_provider as enum ('MOCK', 'MERCADOPAGO');
create type public.subscription_status as enum (
  'FREE', 'PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED'
);
create type public.payment_event_status as enum ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');
create type public.chat_role as enum ('user', 'assistant');
create type public.job_type as enum (
  'VALIDATE_PHOTOS', 'ANALYZE_STYLE_PROFILE', 'GENERATE_LOOK_PREVIEW', 'GENERATE_LOOK',
  'GENERATE_STYLE_BOARD', 'SEARCH_PRODUCTS', 'REFRESH_PRODUCT'
);
create type public.job_status as enum ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');
create type public.ai_operation as enum (
  'VALIDATE_PHOTOS', 'ANALYZE_STYLE_PROFILE', 'GENERATE_LOOK_SPECS', 'GENERATE_LOOK_IMAGE', 'CHAT'
);

-- Mantiene updated_at en cada UPDATE.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
