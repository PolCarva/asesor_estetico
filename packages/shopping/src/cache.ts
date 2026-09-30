import type { ShoppingCache } from "./types";

/**
 * TTLs de cache previstos:
 *  - búsqueda (query → resultados): 24 h
 *  - producto (precio/stock): 8 h
 *  - al agregar al carrito se revalida siempre el producto (refreshProduct), sin cache.
 */
export const CACHE_TTL_MS = {
  search: 24 * 60 * 60 * 1000,
  product: 8 * 60 * 60 * 1000,
} as const;

/** Cache en memoria para desarrollo y tests. En producción irá en Postgres (ver docs/SHOPPING_ENGINE.md). */
export function createMemoryCache(now: () => number = Date.now): ShoppingCache {
  const store = new Map<string, { value: unknown; expiresAt: number }>();
  return {
    async get<T>(key: string) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= now()) {
        store.delete(key);
        return null;
      }
      return entry.value as T;
    },
    async set(key, value, ttlMs) {
      store.set(key, { value, expiresAt: now() + ttlMs });
    },
  };
}
