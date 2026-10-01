import type { JobRow } from "@asesor/db";
import type { Logger } from "@asesor/shared";

import {
  type HandlerDeps,
  type HandlerRegistry,
  isRetryable,
  NonRetryableJobError,
} from "./handlers/types";
import type { JobQueue } from "./queue";

export interface WorkerRunnerOptions {
  queue: JobQueue;
  handlers: HandlerRegistry;
  deps: HandlerDeps;
  logger: Logger;
  /** Jobs procesados en paralelo. */
  concurrency: number;
  /** Espera cuando no hay jobs pendientes. */
  pollIntervalMs?: number;
  /** Tiempo máximo para terminar jobs en curso al apagarse; después se abortan. */
  shutdownTimeoutMs?: number;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 2000);
  return "Error desconocido";
}

/**
 * Loop del worker: N "carriles" que toman jobs de la cola (bloqueo atómico en
 * Postgres), ejecutan el handler y marcan el resultado. Apagado limpio: deja de
 * tomar jobs, espera los que están en curso y, si se pasa del timeout, los aborta
 * (quedan con error reintentable y vuelven a la cola).
 */
export class WorkerRunner {
  private stopping = false;
  private readonly wake = new AbortController();
  private readonly abortJobs = new AbortController();
  private lanes: Promise<void>[] = [];
  private inFlight = 0;

  constructor(private readonly options: WorkerRunnerOptions) {}

  get activeJobs() {
    return this.inFlight;
  }

  start(): Promise<void> {
    this.options.logger.info("worker iniciado", { concurrency: this.options.concurrency });
    this.lanes = Array.from({ length: this.options.concurrency }, (_, i) => this.lane(i));
    return Promise.all(this.lanes).then(() => undefined);
  }

  async stop(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    this.wake.abort();
    this.options.logger.info("apagando worker", { activeJobs: this.inFlight });

    const timeoutMs = this.options.shutdownTimeoutMs ?? 30_000;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), timeoutMs);
    });
    const outcome = await Promise.race([
      Promise.all(this.lanes).then(() => "done" as const),
      timeout,
    ]);
    if (outcome === "timeout") {
      this.options.logger.warn("timeout de apagado: abortando jobs en curso", {
        activeJobs: this.inFlight,
      });
      this.abortJobs.abort(new Error("worker shutdown"));
      await Promise.all(this.lanes);
    }
    clearTimeout(timer);
    this.options.logger.info("worker detenido");
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => {
      if (this.wake.signal.aborted) return resolve();
      const timer = setTimeout(resolve, ms);
      this.wake.signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }

  private async lane(index: number) {
    const idleMs = this.options.pollIntervalMs ?? 1000;
    while (!this.stopping) {
      let job: JobRow | null;
      try {
        job = await this.options.queue.claim();
      } catch (error) {
        this.options.logger.error("no se pudo tomar un job", { lane: index, error });
        await this.sleep(idleMs * 5);
        continue;
      }
      if (!job) {
        await this.sleep(idleMs);
        continue;
      }
      await this.process(job);
    }
  }

  private async process(job: JobRow) {
    const logger = this.options.logger.child({
      jobId: job.id,
      jobType: job.type,
      attempt: job.attempts,
    });
    const handler = this.options.handlers[job.type];
    const started = Date.now();
    this.inFlight++;
    try {
      if (!handler) throw new NonRetryableJobError(`Sin handler para ${job.type}.`);
      logger.info("job iniciado");
      const result = await handler(job, {
        logger,
        signal: this.abortJobs.signal,
        deps: this.options.deps,
        reportProgress: async (progress) => {
          try {
            await this.options.queue.progress?.(job, progress);
          } catch (error) {
            logger.warn("no se pudo guardar el progreso del job", { error });
          }
        },
      });
      await this.options.queue.complete(job, result);
      logger.info("job completado", { durationMs: Date.now() - started });
    } catch (error) {
      const retryable = isRetryable(error);
      logger.warn("job fallido", { durationMs: Date.now() - started, retryable, error });
      try {
        await this.options.queue.fail(job, errorMessage(error), { retryable });
      } catch (failError) {
        // Si no se pudo marcar, el lock vence y claim_next_job lo vuelve a tomar.
        logger.error("no se pudo marcar el job como fallido", { error: failError });
      }
    } finally {
      this.inFlight--;
    }
  }
}
