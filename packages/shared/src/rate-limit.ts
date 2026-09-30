/**
 * Abstracción de rate limiting para endpoints caros (IA, uploads, shopping).
 * La implementación en memoria sirve para una sola instancia; con varias
 * instancias hay que reemplazarla por una basada en Postgres.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export interface RateLimiter {
  consume(key: string): Promise<RateLimitResult>;
}

export interface RateLimitRule {
  /** Pedidos permitidos por ventana. */
  limit: number;
  windowMs: number;
}

export function createMemoryRateLimiter(
  rule: RateLimitRule,
  now: () => number = Date.now,
): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();

  return {
    async consume(key) {
      const t = now();
      let entry = windows.get(key);
      if (!entry || entry.resetAt <= t) {
        entry = { count: 0, resetAt: t + rule.windowMs };
        windows.set(key, entry);
      }
      entry.count += 1;
      if (windows.size > 10_000) {
        for (const [k, v] of windows) if (v.resetAt <= t) windows.delete(k);
      }
      return {
        allowed: entry.count <= rule.limit,
        remaining: Math.max(0, rule.limit - entry.count),
        resetAt: entry.resetAt,
      };
    },
  };
}
