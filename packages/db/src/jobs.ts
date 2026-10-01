import {
  AppError,
  computeRetryDelaySeconds,
  JobPayloadSchemas,
  type JobPayload,
  type JobType,
} from "@asesor/shared";

import type { Database, Json, JobRow, TypedSupabaseClient } from "./types";

/**
 * Cola de jobs sobre Postgres. Todas las operaciones pasan por funciones SQL
 * (ver supabase/migrations/*_job_queue.sql) que solo puede ejecutar service_role.
 */

export interface EnqueueJobInput<T extends JobType> {
  type: T;
  payload: JobPayload<T>;
  userId?: string | null;
  maxAttempts?: number;
  scheduledAt?: Date;
  priority?: number;
  /** Evita duplicados: si ya existe un job con esta clave, se devuelve ese. */
  idempotencyKey?: string;
}

export async function enqueueJob<T extends JobType>(
  client: TypedSupabaseClient,
  input: EnqueueJobInput<T>,
): Promise<JobRow> {
  const payload = JobPayloadSchemas[input.type].parse(input.payload);
  const args: Database["public"]["Functions"]["enqueue_job"]["Args"] = {
    p_type: input.type as JobType,
    p_payload: payload as Json,
    p_max_attempts: input.maxAttempts ?? 3,
    p_priority: input.priority ?? 0,
  };
  // Sin fecha explícita manda el `now()` de la base: con el reloj de Node, unos ms de
  // desfasaje dejaban un job recién encolado fuera del alcance de `claim_next_job`.
  if (input.scheduledAt) args.p_scheduled_at = input.scheduledAt.toISOString();
  if (input.userId) args.p_user_id = input.userId;
  if (input.idempotencyKey) args.p_idempotency_key = input.idempotencyKey;
  const { data, error } = await client.rpc("enqueue_job", args);
  if (error || !data)
    throw new AppError("INTERNAL", "No se pudo encolar el job.", { cause: error });
  return data;
}

export async function claimNextJob(
  client: TypedSupabaseClient,
  input: { workerId: string; types?: JobType[]; lockTimeoutSeconds?: number },
): Promise<JobRow | null> {
  const { data, error } = await client.rpc("claim_next_job", {
    p_worker_id: input.workerId,
    p_types: input.types,
    p_lock_timeout_seconds: input.lockTimeoutSeconds ?? 900,
  });
  if (error) throw new AppError("INTERNAL", "No se pudo tomar un job.", { cause: error });
  return data[0] ?? null;
}

export async function completeJob(
  client: TypedSupabaseClient,
  input: { jobId: string; workerId: string; result?: Json },
): Promise<JobRow> {
  const { data, error } = await client.rpc("complete_job", {
    p_job_id: input.jobId,
    p_worker_id: input.workerId,
    p_result: input.result ?? undefined,
  });
  if (error || !data)
    throw new AppError("CONFLICT", "No se pudo completar el job.", { cause: error });
  return data;
}

export async function failJob(
  client: TypedSupabaseClient,
  input: {
    job: Pick<JobRow, "id" | "attempts">;
    workerId: string;
    error: string;
    retryDelaySeconds?: number;
    /** false: falla definitivamente aunque queden intentos (p. ej., payload inválido). */
    retryable?: boolean;
  },
): Promise<JobRow> {
  const { data, error } = await client.rpc("fail_job", {
    p_job_id: input.job.id,
    p_worker_id: input.workerId,
    p_error: input.error,
    p_retry_delay_seconds: input.retryDelaySeconds ?? computeRetryDelaySeconds(input.job.attempts),
    p_retryable: input.retryable ?? true,
  });
  if (error || !data)
    throw new AppError("CONFLICT", "No se pudo marcar el job como fallido.", { cause: error });
  return data;
}

/**
 * Guarda el progreso de un job en curso (`jobs.progress`, lo lee el dueño). Solo funciona
 * para el worker que lo tiene tomado: si el job ya no es suyo, CONFLICT.
 */
export async function updateJobProgress(
  client: TypedSupabaseClient,
  input: { jobId: string; workerId: string; progress: NonNullable<Json> },
): Promise<void> {
  const { error } = await client.rpc("update_job_progress", {
    p_job_id: input.jobId,
    p_worker_id: input.workerId,
    p_progress: input.progress,
  });
  if (error)
    throw new AppError("CONFLICT", "No se pudo guardar el progreso del job.", { cause: error });
}

/** Reintento manual de un job FAILED (por ejemplo, desde /admin). */
export async function retryJob(client: TypedSupabaseClient, jobId: string): Promise<JobRow> {
  const { data, error } = await client.rpc("retry_job", { p_job_id: jobId });
  if (error || !data)
    throw new AppError("CONFLICT", "Solo se pueden reintentar jobs fallidos.", { cause: error });
  return data;
}
