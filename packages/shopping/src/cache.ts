import { createHash } from "node:crypto";

import {
  normalizeText,
  PRODUCT_FRESHNESS_MS,
  SHOPPING_SEARCH_TTL_MS,
  type ShoppingQuery,
} from "@asesor/shared";

import type { CachedPool, PoolQuery, SearchCache } from "./types";

/**
 * TTLs de cache (SPEC "CACHE"):
 *  - búsqueda (pool de productos validados de una prenda): 24 h;
 *  - producto (precio y stock): 8 h; pasado eso se revalida antes de mostrarlo;
 *  - al agregar al carrito o abrir la compra se revalida si está viejo (pasos 08 y 10a).
 */
export const CACHE_TTL_MS = {
  search: SHOPPING_SEARCH_TTL_MS,
  product: PRODUCT_FRESHNESS_MS,
} as const;

/** Subirla cuando cambie qué entra a un pool (extracción, variantes, Validate). */
// 3 (2026-10-01): Indian pasó a tienda de mujer y el descubrimiento web respeta el público de
// las tiendas registradas; los pools de hombre la incluían.
// 4 (paso 11): los productos traen el público que declara su página (`Product.audience`).
// 5 (paso 12b): el color de las variantes conserva el tono ("azul oscuro") y WooCommerce lee
// stock y precio de todas las variaciones desde la página.
export const POOL_VERSION = 5;

/** Lo que identifica al pool de una query: la prenda, sin talle, precio, límite ni slot. */
export function poolQueryOf(query: ShoppingQuery): PoolQuery {
  const g = query.garment;
  const text = (v: string | null) => (v ? normalizeText(v) : null);
  return {
    v: POOL_VERSION,
    country_code: query.country_code,
    audience: query.audience,
    search_terms: query.search_terms.map(normalizeText),
    garment: {
      category: g.category,
      description: normalizeText(g.description),
      color: { name: normalizeText(g.color.name), hex: g.color.hex.toUpperCase() },
      fit: text(g.fit),
      material: text(g.material),
      pattern: text(g.pattern),
    },
  };
}

/** Clave del pool: sha256 de `poolQueryOf` (64 hex). */
export function searchPoolKey(query: ShoppingQuery): string {
  return createHash("sha256")
    .update(JSON.stringify(poolQueryOf(query)))
    .digest("hex");
}

/** Cache de pools en memoria (desarrollo y tests). En el worker se usa Postgres. */
export function createMemorySearchCache(now: () => number = Date.now): SearchCache {
  const store = new Map<string, CachedPool & { expiresAt: number }>();
  return {
    async getPool(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= now()) {
        store.delete(key);
        return null;
      }
      const { expiresAt: _, ...pool } = entry;
      return pool;
    },
    async savePool(key, entry, ttlMs) {
      store.set(key, {
        products: entry.products,
        stats: entry.stats,
        cachedAt: new Date(now()).toISOString(),
        expiresAt: now() + ttlMs,
      });
    },
    async updateProducts(updated) {
      const byUrl = new Map(updated.map((u) => [u.product.url, u.product]));
      for (const entry of store.values()) {
        entry.products = entry.products.map((p) => byUrl.get(p.url) ?? p);
      }
    },
  };
}
