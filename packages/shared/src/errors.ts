/**
 * Errores de aplicación con código estable. Las capas de UI/API los traducen a
 * respuestas (401, 403, 404, 429...) sin filtrar detalles internos.
 */
export type AppErrorCode =
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "PREMIUM_REQUIRED"
  | "VALIDATION_FAILED"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "INTERNAL";

const HTTP_STATUS: Record<AppErrorCode, number> = {
  AUTH_REQUIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  PREMIUM_REQUIRED: 402,
  VALIDATION_FAILED: 400,
  RATE_LIMITED: 429,
  CONFLICT: 409,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string = code, options?: ErrorOptions) {
    super(message, options);
    this.name = "AppError";
    this.code = code;
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code];
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
