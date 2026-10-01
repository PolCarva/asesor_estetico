-- Jobs de shopping reales (paso 06, D13 y D14): progreso por etapas, referencias legibles
-- para que la UI encuentre la búsqueda de un look y una sola búsqueda activa por prenda.

-- 1. Progreso por etapas (`ShoppingProgress` de @asesor/shared): etapa del pipeline y
--    conteos reales, nunca porcentajes. Lo escribe solo el worker que tiene el job
--    (`update_job_progress`) y lo lee el dueño del job.
alter table public.jobs
  add column progress jsonb check (progress is null or jsonb_typeof(progress) = 'object');

-- 2. Look y prenda del job, sacados del payload (ya validado con Zod al encolar): la UI
--    los necesita y `payload` no se expone al cliente. Al ser generadas no pueden divergir.
alter table public.jobs
  add column look_id uuid generated always as ((payload ->> 'look_id')::uuid) stored,
  add column garment_slot text generated always as (payload ->> 'slot') stored;

create index jobs_look_id_idx on public.jobs (look_id, created_at desc) where look_id is not null;

-- 3. Una sola búsqueda activa por (look, prenda). La del look completo (sin prenda) no
--    bloquea la de una sola prenda ("Buscar más barato", paso 09). El índice cubre la
--    carrera entre dos pedidos simultáneos: el segundo encolado falla con 23505.
create unique index jobs_one_active_search_idx
  on public.jobs (look_id, coalesce(garment_slot, '*'))
  where type = 'SEARCH_PRODUCTS' and status in ('QUEUED', 'RUNNING');

grant select (progress, look_id, garment_slot) on public.jobs to authenticated;

-- 4. Progreso: solo el worker que tiene el job (RUNNING y bloqueado por él) lo actualiza.
create function public.update_job_progress(p_job_id uuid, p_worker_id text, p_progress jsonb)
returns public.jobs
language plpgsql
set search_path = ''
as $$
declare
  v_job public.jobs;
begin
  if jsonb_typeof(p_progress) is distinct from 'object' then
    raise exception 'el progreso tiene que ser un objeto' using errcode = '22023';
  end if;

  update public.jobs
  set progress = p_progress
  where id = p_job_id and status = 'RUNNING' and locked_by = p_worker_id
  returning * into v_job;

  if v_job.id is null then
    raise exception 'job % is not running under worker %', p_job_id, p_worker_id
      using errcode = 'P0002';
  end if;
  return v_job;
end;
$$;

revoke all on function public.update_job_progress(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.update_job_progress(uuid, text, jsonb) to service_role;

-- 5. Costo de las búsquedas web del descubrimiento de tiendas (`openrouter:web_search`),
--    registrado en ai_usage por job como el resto del uso de IA.
alter type public.ai_operation add value if not exists 'WEB_SEARCH';
