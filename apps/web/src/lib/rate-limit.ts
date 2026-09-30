import "server-only";

import { getServerEnv } from "@asesor/config/env/server";
import { AppError, createMemoryRateLimiter, type RateLimiter } from "@asesor/shared";

// En desarrollo y tests se permiten más intentos de auth: los E2E crean varias cuentas
// seguidas desde la misma IP. En producción aplica el límite estricto.
const AUTH_LIMIT = getServerEnv().NODE_ENV === "production" ? 10 : 200;

/**
 * Límites para endpoints caros o sensibles. En memoria: alcanza para una sola
 * instancia. Con varias instancias, reemplazar por una implementación en Postgres
 * manteniendo la interfaz RateLimiter.
 */
export const rateLimiters = {
  auth: createMemoryRateLimiter({ limit: AUTH_LIMIT, windowMs: 60_000 }),
  photoUpload: createMemoryRateLimiter({ limit: 20, windowMs: 60 * 60_000 }),
  analytics: createMemoryRateLimiter({ limit: 60, windowMs: 60_000 }),
  webhook: createMemoryRateLimiter({ limit: 120, windowMs: 60_000 }),
} satisfies Record<string, RateLimiter>;

export async function enforceRateLimit(limiter: RateLimiter, key: string) {
  const result = await limiter.consume(key);
  if (!result.allowed) throw new AppError("RATE_LIMITED", "Demasiados intentos. Probá en un rato.");
}
