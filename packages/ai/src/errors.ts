import { ZodError } from "zod";

import type { AIOperation } from "@asesor/shared";

export type AIErrorCode =
  | "INVALID_INPUT"
  | "INVALID_OUTPUT"
  | "PROVIDER_ERROR"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "CONTENT_REJECTED"
  | "AUTH_OR_BILLING"
  | "NOT_IMPLEMENTED";

/** Errores que tiene sentido reintentar. INVALID_OUTPUT también: un nuevo intento del modelo suele corregirlo. */
const RETRYABLE: ReadonlySet<AIErrorCode> = new Set([
  "PROVIDER_ERROR",
  "RATE_LIMITED",
  "TIMEOUT",
  "INVALID_OUTPUT",
]);

/** Error normalizado de cualquier proveedor de IA. */
export class AIError extends Error {
  readonly code: AIErrorCode;
  readonly retryable: boolean;
  operation?: AIOperation;
  provider?: string;
  durationMs?: number;

  constructor(code: AIErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AIError";
    this.code = code;
    this.retryable = RETRYABLE.has(code);
  }
}

export function normalizeAIError(error: unknown): AIError {
  if (error instanceof AIError) return error;
  if (error instanceof ZodError) {
    return new AIError("INVALID_OUTPUT", "La respuesta del proveedor no cumple el schema.", {
      cause: error,
    });
  }
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return new AIError("TIMEOUT", "El proveedor no respondió a tiempo.", { cause: error });
  }
  return new AIError("PROVIDER_ERROR", "Error del proveedor de IA.", { cause: error });
}
