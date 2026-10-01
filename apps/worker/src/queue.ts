import {
  claimNextJob,
  completeJob,
  failJob,
  type Json,
  type JobRow,
  type TypedSupabaseClient,
  updateJobProgress,
} from "@asesor/db";
import type { JobType } from "@asesor/shared";

/** Operaciones de cola que usa el runner. Permite testearlo sin base de datos. */
export interface JobQueue {
  claim(): Promise<JobRow | null>;
  complete(job: JobRow, result: Json | undefined): Promise<void>;
  fail(job: JobRow, error: string, options: { retryable: boolean }): Promise<void>;
  /** Progreso de un job en curso (opcional: las colas de los tests no lo necesitan). */
  progress?(job: JobRow, progress: NonNullable<Json>): Promise<void>;
}

export function createPostgresJobQueue(
  client: TypedSupabaseClient,
  options: { workerId: string; types?: JobType[]; lockTimeoutSeconds?: number },
): JobQueue {
  return {
    claim: () =>
      claimNextJob(client, {
        workerId: options.workerId,
        types: options.types,
        lockTimeoutSeconds: options.lockTimeoutSeconds,
      }),
    complete: async (job, result) => {
      await completeJob(client, { jobId: job.id, workerId: options.workerId, result });
    },
    fail: async (job, error, { retryable }) => {
      await failJob(client, { job, workerId: options.workerId, error, retryable });
    },
    progress: async (job, progress) => {
      await updateJobProgress(client, { jobId: job.id, workerId: options.workerId, progress });
    },
  };
}
