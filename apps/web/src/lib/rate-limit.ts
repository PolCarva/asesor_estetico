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
  // Cada búsqueda de productos recorre tiendas reales y puede pagar búsquedas web.
  shoppingSearch: createMemoryRateLimiter({ limit: 10, windowMs: 60 * 60_000 }),
  // "Buscar más barato": una prenda por pedido, casi siempre sobre el pool cacheado.
  cheaperSearch: createMemoryRateLimiter({ limit: 20, windowMs: 60 * 60_000 }),
  // Carrito y guardados: escrituras baratas, pero agregar puede encolar una revalidación
  // (una por producto y hora, así que la tienda no recibe más que eso).
  cart: createMemoryRateLimiter({ limit: 60, windowMs: 60_000 }),
  // "Comprar ↗": puede encolar una revalidación (una por producto y hora); evita que se use
  // para recorrer el catálogo.
  productOpen: createMemoryRateLimiter({ limit: 120, windowMs: 60_000 }),
} satisfies Record<string, RateLimiter>;

export async function enforceRateLimit(limiter: RateLimiter, key: string) {
  const result = await limiter.consume(key);
  if (!result.allowed) throw new AppError("RATE_LIMITED", "Demasiados intentos. Probá en un rato.");
}
