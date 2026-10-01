import { AIError, type AIProvider } from "@asesor/ai";
import type { AnalyticsService } from "@asesor/analytics";
import type { Json, JobRow, TypedSupabaseClient } from "@asesor/db";
import { isAppError, type JobType, type Logger } from "@asesor/shared";
import type { ProductFetcher, SearchProvider, VariantEnricher } from "@asesor/shopping";
import { ZodError } from "zod";

export interface HandlerDeps {
  /** Cliente service role: cada handler filtra explícitamente por user_id. */
  db: TypedSupabaseClient;
  ai: AIProvider;
  analytics: AnalyticsService;
  searchProvider: SearchProvider;
  fetcher: ProductFetcher;
  /** Talles y stock por plataforma (solo con SHOPPING_PROVIDER=live). */
  variants?: VariantEnricher;
}

export interface JobContext {
  logger: Logger;
  /** Se aborta si el worker se apaga antes de que termine el job. */
  signal: AbortSignal;
  deps: HandlerDeps;
}

/** Devuelve el resultado a guardar en jobs.result. */
export type JobHandler = (job: JobRow, ctx: JobContext) => Promise<Json | undefined>;
export type HandlerRegistry = Partial<Record<JobType, JobHandler>>;

/** Error que no tiene sentido reintentar (payload inválido, recurso inexistente...). */
export class NonRetryableJobError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NonRetryableJobError";
  }
}

const PERMANENT_APP_ERRORS = new Set([
  "VALIDATION_FAILED",
  "NOT_FOUND",
  "FORBIDDEN",
  "PREMIUM_REQUIRED",
]);

export function isRetryable(error: unknown): boolean {
  if (error instanceof NonRetryableJobError || error instanceof ZodError) return false;
  if (error instanceof AIError) return error.retryable;
  if (isAppError(error)) return !PERMANENT_APP_ERRORS.has(error.code);
  return true;
}

/** true si este fallo deja el job en FAILED (no habrá otro intento). */
export function isFinalFailure(
  job: Pick<JobRow, "attempts" | "max_attempts">,
  error: unknown,
): boolean {
  return !isRetryable(error) || job.attempts >= job.max_attempts;
}
