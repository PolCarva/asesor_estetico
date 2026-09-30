-- Cola de jobs sobre Postgres. Solo service_role puede ejecutar estas funciones.
-- claim_next_job usa FOR UPDATE SKIP LOCKED: varios workers pueden pedir trabajo
-- en paralelo sin tomar el mismo job.

create function public.enqueue_job(
  p_type public.job_type,
  p_payload jsonb default '{}'::jsonb,
  p_user_id uuid default null,
  p_max_attempts integer default 3,
  p_scheduled_at timestamptz default now(),
  p_priority smallint default 0,
  p_idempotency_key text default null
)
returns public.jobs
language plpgsql
set search_path = ''
as $$
declare
  v_job public.jobs;
begin
  insert into public.jobs (type, payload, user_id, max_attempts, scheduled_at, priority, idempotency_key)
  values (p_type, p_payload, p_user_id, p_max_attempts, p_scheduled_at, p_priority, p_idempotency_key)
  on conflict (idempotency_key) do nothing
  returning * into v_job;

  -- Si ya existía un job con la misma clave, se devuelve ese.
  if v_job.id is null then
    select * into v_job from public.jobs where idempotency_key = p_idempotency_key;
  end if;
  return v_job;
end;
$$;

create function public.claim_next_job(
  p_worker_id text,
  p_types public.job_type[] default null,
  p_lock_timeout_seconds integer default 900
)
returns setof public.jobs
language plpgsql
set search_path = ''
as $$
declare
  v_stale_before timestamptz := now() - make_interval(secs => p_lock_timeout_seconds);
begin
  -- Jobs cuyo worker murió sin más intentos disponibles: se marcan como fallidos.
  update public.jobs
  set status = 'FAILED', finished_at = now(), locked_at = null, locked_by = null,
      last_error = coalesce(last_error, 'lock expired')
  where status = 'RUNNING' and locked_at < v_stale_before and attempts >= max_attempts;

  return query
  with next_job as (
    select j.id
    from public.jobs j
    where (
        (j.status = 'QUEUED' and j.scheduled_at <= now())
        -- Jobs bloqueados por un worker caído se vuelven a tomar.
        or (j.status = 'RUNNING' and j.locked_at < v_stale_before)
      )
      and (p_types is null or j.type = any (p_types))
    order by j.priority desc, j.scheduled_at
    limit 1
    for update skip locked
  )
  update public.jobs j
  set status = 'RUNNING',
      locked_at = now(),
      locked_by = p_worker_id,
      attempts = j.attempts + 1
  from next_job
  where j.id = next_job.id
  returning j.*;
end;
$$;

create function public.complete_job(p_job_id uuid, p_worker_id text, p_result jsonb default null)
returns public.jobs
language plpgsql
set search_path = ''
as $$
declare
  v_job public.jobs;
begin
  update public.jobs
  set status = 'COMPLETED', result = p_result, finished_at = now(),
      locked_at = null, locked_by = null, last_error = null
  where id = p_job_id and status = 'RUNNING' and locked_by = p_worker_id
  returning * into v_job;

  if v_job.id is null then
    raise exception 'job % is not running under worker %', p_job_id, p_worker_id
      using errcode = 'P0002';
  end if;
  return v_job;
end;
$$;

-- Falla un intento. Si quedan intentos y el error es reintentable, vuelve a la cola
-- con el delay indicado; si no, queda FAILED.
create function public.fail_job(
  p_job_id uuid,
  p_worker_id text,
  p_error text,
  p_retry_delay_seconds integer default 60,
  p_retryable boolean default true
)
returns public.jobs
language plpgsql
set search_path = ''
as $$
declare
  v_job public.jobs;
begin
  update public.jobs
  set status = case when p_retryable and attempts < max_attempts then 'QUEUED'::public.job_status
                    else 'FAILED'::public.job_status end,
      finished_at = case when p_retryable and attempts < max_attempts then null else now() end,
      scheduled_at = case when p_retryable and attempts < max_attempts
                          then now() + make_interval(secs => greatest(p_retry_delay_seconds, 0))
                          else scheduled_at end,
      last_error = left(p_error, 2000),
      locked_at = null,
      locked_by = null
  where id = p_job_id and status = 'RUNNING' and locked_by = p_worker_id
  returning * into v_job;

  if v_job.id is null then
    raise exception 'job % is not running under worker %', p_job_id, p_worker_id
      using errcode = 'P0002';
  end if;
  return v_job;
end;
$$;

-- Reintento manual (admin) de un job fallido: vuelve a la cola con intentos en cero.
create function public.retry_job(p_job_id uuid)
returns public.jobs
language plpgsql
set search_path = ''
as $$
declare
  v_job public.jobs;
begin
  update public.jobs
  set status = 'QUEUED', attempts = 0, scheduled_at = now(), finished_at = null,
      locked_at = null, locked_by = null
  where id = p_job_id and status = 'FAILED'
  returning * into v_job;

  if v_job.id is null then
    raise exception 'job % is not in FAILED status', p_job_id using errcode = 'P0002';
  end if;
  return v_job;
end;
$$;

revoke all on function public.enqueue_job(public.job_type, jsonb, uuid, integer, timestamptz, smallint, text) from public, anon, authenticated;
revoke all on function public.claim_next_job(text, public.job_type[], integer) from public, anon, authenticated;
revoke all on function public.complete_job(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.fail_job(uuid, text, text, integer, boolean) from public, anon, authenticated;
revoke all on function public.retry_job(uuid) from public, anon, authenticated;

grant execute on function public.enqueue_job(public.job_type, jsonb, uuid, integer, timestamptz, smallint, text) to service_role;
grant execute on function public.claim_next_job(text, public.job_type[], integer) to service_role;
grant execute on function public.complete_job(uuid, text, jsonb) to service_role;
grant execute on function public.fail_job(uuid, text, text, integer, boolean) to service_role;
grant execute on function public.retry_job(uuid) to service_role;
