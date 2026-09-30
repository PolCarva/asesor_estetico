-- Métricas agregadas para /admin. Solo service_role: el servidor Next.js la llama
-- después de verificar que el usuario tiene rol admin.
create function public.admin_overview_metrics()
returns jsonb
language sql
stable
set search_path = ''
as $$
  with premium as (
    select count(distinct s.user_id) as n
    from public.subscriptions s
    where s.status in ('ACTIVE', 'CANCELLED') and s.current_period_end > now()
  ),
  funnel as (
    select
      count(distinct coalesce(e.user_id::text, e.anonymous_id)) filter (where e.name = 'checkout_started') as checkout_started,
      count(distinct coalesce(e.user_id::text, e.anonymous_id)) filter (where e.name = 'subscription_started') as subscription_started,
      count(*) filter (where e.name = 'analysis_completed') as analysis_completed
    from public.analytics_events e
  )
  select jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'premium_users', (select n from premium),
    'free_users', (select count(*) from public.profiles) - (select n from premium),
    'jobs_pending', (select count(*) from public.jobs where status in ('QUEUED', 'RUNNING')),
    'jobs_failed', (select count(*) from public.jobs where status = 'FAILED'),
    'ai_cost_usd', (select coalesce(sum(estimated_cost_usd), 0) from public.ai_usage),
    'ai_cost_usd_30d', (
      select coalesce(sum(estimated_cost_usd), 0) from public.ai_usage where created_at > now() - interval '30 days'
    ),
    'analysis_completed', (select analysis_completed from funnel),
    'checkout_started', (select checkout_started from funnel),
    'subscription_started', (select subscription_started from funnel)
  );
$$;

revoke all on function public.admin_overview_metrics() from public, anon, authenticated;
grant execute on function public.admin_overview_metrics() to service_role;

-- Conteo de eventos de analytics por nombre en los últimos p_days días.
create function public.admin_event_counts(p_days integer default 30)
returns table (name text, total bigint, unique_users bigint)
language sql
stable
set search_path = ''
as $$
  select e.name, count(*) as total, count(distinct coalesce(e.user_id::text, e.anonymous_id)) as unique_users
  from public.analytics_events e
  where e.created_at > now() - make_interval(days => p_days)
  group by e.name
  order by total desc;
$$;

revoke all on function public.admin_event_counts(integer) from public, anon, authenticated;
grant execute on function public.admin_event_counts(integer) to service_role;
