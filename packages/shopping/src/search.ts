import {
  type Product,
  type ShoppingQuery,
  type ShoppingQueryInput,
  ShoppingQuerySchema,
  type ShoppingResult,
} from "@asesor/shared";

import { CACHE_TTL_MS } from "./cache";
import { extractProduct } from "./extract";
import { fetchProductPage } from "./fetch";
import { normalizeProduct } from "./normalize";
import { rankProducts } from "./rank";
import type { CandidateUrl, ProductFetcher, SearchProvider, ShoppingCache } from "./types";

export interface ShoppingDeps {
  searchProvider: SearchProvider;
  fetcher: ProductFetcher;
  cache?: ShoppingCache;
  now?: () => Date;
  /** Páginas que se descargan en paralelo. */
  concurrency?: number;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

async function loadProduct(candidate: CandidateUrl, deps: ShoppingDeps): Promise<Product | null> {
  try {
    const page = await fetchProductPage(candidate.url, deps.fetcher);
    const raw = extractProduct(page);
    return raw
      ? normalizeProduct(raw, { store: candidate.store, fetchedAt: page.fetchedAt })
      : null;
  } catch {
    // Una tienda caída o una URL inválida no rompe la búsqueda completa.
    return null;
  }
}

export function searchCacheKey(query: ShoppingQuery) {
  return `search:${JSON.stringify(query)}`;
}

/**
 * Pipeline: ShoppingQuery → SearchProvider → URLs candidatas → Fetch → Extract →
 * Normalize → Rank → Cache.
 */
export async function searchProducts(
  rawQuery: ShoppingQueryInput,
  deps: ShoppingDeps,
): Promise<ShoppingResult> {
  const query = ShoppingQuerySchema.parse(rawQuery);
  const now = deps.now ?? (() => new Date());
  const key = searchCacheKey(query);

  const cached = await deps.cache?.get<ShoppingResult>(key);
  if (cached) return { ...cached, source: "CACHE" };

  const candidates = await deps.searchProvider.search(query);
  const unique = [...new Map(candidates.map((c) => [c.url, c])).values()];
  const products = (
    await mapWithConcurrency(unique, deps.concurrency ?? 4, (c) => loadProduct(c, deps))
  ).filter((p): p is Product => p !== null);

  const result: ShoppingResult = {
    query,
    items: rankProducts(products, query).slice(0, query.limit),
    source: "LIVE",
    generated_at: now().toISOString(),
  };
  await deps.cache?.set(key, result, CACHE_TTL_MS.search);
  return result;
}

/**
 * Vuelve a leer la página del producto (precio, stock). Se usa al agregar al
 * carrito y en los jobs REFRESH_PRODUCT. Si la tienda no responde, marca la
 * disponibilidad como UNKNOWN en lugar de mantener datos viejos como ciertos.
 */
export async function refreshProduct(
  product: Product,
  deps: Pick<ShoppingDeps, "fetcher" | "now">,
): Promise<Product> {
  const now = deps.now ?? (() => new Date());
  try {
    const page = await fetchProductPage(product.url, deps.fetcher);
    const raw = extractProduct(page);
    const fresh = raw
      ? normalizeProduct(raw, { store: product.store, fetchedAt: page.fetchedAt })
      : null;
    if (fresh) return { ...fresh, id: product.id };
  } catch {
    // Se cae al caso UNKNOWN.
  }
  return { ...product, availability: "UNKNOWN", fetched_at: now().toISOString() };
}
