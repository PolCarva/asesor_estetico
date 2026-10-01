import {
  isProductStale,
  type Product,
  sizeKindForCategory,
  type ShoppingQueryInput,
  ShoppingQuerySchema,
  type ShoppingResult,
  type ShoppingStats,
} from "@asesor/shared";

import { CACHE_TTL_MS, poolQueryOf, searchPoolKey } from "./cache";
import { extractProduct } from "./extract";
import { fetchProductPage, NotHtmlError } from "./fetch";
import { UnsafeUrlError } from "./net";
import { type NormalizeFailure, normalizeProductResult } from "./normalize";
import {
  HttpStatusError,
  ResponseTooLargeError,
  RobotsDisallowedError,
  TooManyRedirectsError,
} from "./providers/http";
import { rankProducts } from "./rank";
import type {
  CandidateUrl,
  ExtractSource,
  ProductFetcher,
  RawField,
  RefreshedProduct,
  SearchCache,
  SearchProvider,
} from "./types";
import { canonicalProductUrl, type ValidationFailure, validateProduct } from "./validate";
import { applyVariants, type VariantEnricher, type VariantResult } from "./variants";

export interface ShoppingDeps {
  searchProvider: SearchProvider;
  fetcher: ProductFetcher;
  /** Talles y stock por plataforma (paso 04b). Sin él, solo lo que dice la página. */
  variants?: VariantEnricher;
  /** Cache de pools (24 h). Sin ella, cada búsqueda va en vivo. */
  cache?: SearchCache;
  now?: () => Date;
  /** Páginas que se descargan en paralelo. */
  concurrency?: number;
  signal?: AbortSignal;
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

/** Por qué no se pudo descargar una página (sin detalles técnicos para la UI). */
export type FetchFailure =
  "blocked" | "gone" | "http_error" | "timeout" | "too_large" | "not_html" | "unsafe" | "network";

export function classifyFetchError(error: unknown): FetchFailure {
  if (error instanceof RobotsDisallowedError) return "blocked";
  if (error instanceof HttpStatusError) {
    if (error.status === 404 || error.status === 410) return "gone";
    if ([401, 403, 429].includes(error.status)) return "blocked";
    return "http_error";
  }
  if (error instanceof UnsafeUrlError) return "unsafe";
  if (error instanceof ResponseTooLargeError) return "too_large";
  if (error instanceof NotHtmlError) return "not_html";
  if (error instanceof TooManyRedirectsError) return "http_error";
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return "timeout";
  }
  return "network";
}

/** Por qué se descartó un producto extraído: normalización o Validate. */
export type DiscardReason = NormalizeFailure | ValidationFailure;

/** Resultado de una URL candidata. Cada candidato falla solo, sin romper la búsqueda. */
export type CandidateOutcome =
  | {
      status: "product";
      candidate: CandidateUrl;
      product: Product;
      sources: Partial<Record<RawField, ExtractSource>>;
      /** Qué pasó con los talles y el stock de la plataforma. */
      variants: VariantResult;
    }
  | { status: "failed"; candidate: CandidateUrl; reason: FetchFailure }
  | { status: "not_product"; candidate: CandidateUrl }
  | { status: "discarded"; candidate: CandidateUrl; reason: DiscardReason };

const NO_VARIANTS: VariantResult = { status: "unsupported" };

/** Fetch → Extract → variantes de la plataforma → Normalize → Validate de una URL candidata. */
export async function loadCandidate(
  candidate: CandidateUrl,
  deps: Pick<ShoppingDeps, "fetcher" | "signal" | "variants">,
): Promise<CandidateOutcome> {
  let page;
  try {
    page = await fetchProductPage(candidate.url, deps.fetcher, { signal: deps.signal });
  } catch (error) {
    return { status: "failed", candidate, reason: classifyFetchError(error) };
  }
  if (page.status === 404 || page.status === 410) {
    return { status: "failed", candidate, reason: "gone" };
  }
  const extracted = extractProduct(page);
  if (!extracted) return { status: "not_product", candidate };
  // Un adaptador que falla no descarta el producto: talles y stock quedan sin verificar.
  const variants =
    (await deps.variants
      ?.enrich({ page, raw: extracted, platform: candidate.platform, signal: deps.signal })
      .catch((): VariantResult => NO_VARIANTS)) ?? NO_VARIANTS;
  const raw = applyVariants(extracted, variants);
  const result = normalizeProductResult(raw, {
    store: candidate.store,
    fetchedAt: page.fetchedAt,
    url: canonicalProductUrl(page.url, raw.canonicalUrl),
  });
  if (!result.ok) return { status: "discarded", candidate, reason: result.reason };
  const valid = validateProduct(result.product, { store: candidate.store, page, raw });
  if (!valid.ok) return { status: "discarded", candidate, reason: valid.reason };
  return { status: "product", candidate, product: result.product, sources: raw.sources, variants };
}

export async function loadCandidates(
  candidates: CandidateUrl[],
  deps: Pick<ShoppingDeps, "fetcher" | "signal" | "concurrency" | "variants">,
): Promise<CandidateOutcome[]> {
  const unique = [...new Map(candidates.map((c) => [c.url, c])).values()];
  return mapWithConcurrency(unique, deps.concurrency ?? 4, (c) => loadCandidate(c, deps));
}

export function summarizeOutcomes(outcomes: CandidateOutcome[]): ShoppingStats {
  const stats: ShoppingStats = {
    candidates: outcomes.length,
    products: 0,
    blocked: 0,
    gone: 0,
    failed: 0,
    not_product: 0,
    no_price: 0,
    invalid: 0,
    unverified_stock: 0,
    unverified_sizes: 0,
  };
  for (const outcome of outcomes) {
    if (outcome.status === "product") {
      stats.products++;
      const { product } = outcome;
      if (product.availability === "UNKNOWN") stats.unverified_stock++;
      if (sizeKindForCategory(product.category) && !product.variants.some((v) => v.size)) {
        stats.unverified_sizes++;
      }
    } else if (outcome.status === "not_product") stats.not_product++;
    else if (outcome.status === "discarded") {
      if (outcome.reason === "no_price") stats.no_price++;
      else stats.invalid++;
    } else if (outcome.reason === "blocked") stats.blocked++;
    else if (outcome.reason === "gone") stats.gone++;
    else if (outcome.reason === "not_html") stats.not_product++;
    else stats.failed++;
  }
  return stats;
}

/**
 * Revalida los productos del pool verificados hace más de 8 h. Los que desaparecieron
 * (404/410) salen del resultado; una falla deja el stock en UNKNOWN y la fecha como estaba.
 */
async function refreshStale(
  products: Product[],
  deps: Pick<ShoppingDeps, "fetcher" | "signal" | "variants" | "concurrency">,
  now: Date,
): Promise<{ products: Product[]; refreshed: RefreshedProduct[] }> {
  const stale = products.filter((p) => isProductStale(p.fetched_at, now, CACHE_TTL_MS.product));
  if (stale.length === 0) return { products, refreshed: [] };
  const results = await mapWithConcurrency(stale, deps.concurrency ?? 4, (p) =>
    refreshProduct(p, deps),
  );
  const byUrl = new Map(stale.map((p, i) => [p.url, results[i]!]));
  const kept = products.flatMap((p) => {
    const result = byUrl.get(p.url);
    if (!result) return [p];
    return result.status === "gone" ? [] : [result.product];
  });
  return {
    products: kept,
    refreshed: results.map((r) => ({ product: r.product, verified: r.status === "verified" })),
  };
}

/**
 * Pipeline: ShoppingQuery → (cache del pool) → SearchProvider → URLs candidatas → Fetch →
 * Extract → variantes de la plataforma → Normalize → Validate → Rank. El pool cacheado es
 * de la prenda, sin datos del usuario: en cada pedido se re-rankea con su talle y su precio
 * máximo, así que el mismo pool da órdenes distintos a usuarios distintos. El resultado
 * lleva los conteos de lo que falló y de lo que no se pudo verificar.
 */
export async function searchProducts(
  rawQuery: ShoppingQueryInput,
  deps: ShoppingDeps,
): Promise<ShoppingResult> {
  const query = ShoppingQuerySchema.parse(rawQuery);
  const now = deps.now ?? (() => new Date());
  const key = searchPoolKey(query);

  let pool: Product[];
  let stats: ShoppingStats;
  let source: ShoppingResult["source"];
  // Una cache caída no rompe la búsqueda: se va en vivo.
  const cached = deps.cache ? await deps.cache.getPool(key).catch(() => null) : null;
  if (cached) {
    const fresh = await refreshStale(cached.products, deps, now());
    if (fresh.refreshed.length > 0) await deps.cache?.updateProducts?.(fresh.refreshed);
    pool = fresh.products;
    stats = cached.stats;
    source = "CACHE";
  } else {
    const candidates = await deps.searchProvider.search(query);
    const outcomes = await loadCandidates(candidates, deps);
    pool = outcomes.flatMap((o) => (o.status === "product" ? [o.product] : []));
    stats = summarizeOutcomes(outcomes);
    source = "LIVE";
    await deps.cache?.savePool(
      key,
      { query: poolQueryOf(query), products: pool, stats },
      CACHE_TTL_MS.search,
    );
  }

  return {
    query,
    items: rankProducts(pool, query).slice(0, query.limit),
    source,
    generated_at: now().toISOString(),
    stats,
  };
}

/**
 * Resultado de revalidar un producto. Solo `verified` trae datos nuevos y `fetched_at`
 * nuevo: una falla no cuenta como verificación, así que conserva la fecha de la última
 * verificación buena y deja la disponibilidad en UNKNOWN (no se sostienen datos viejos
 * como ciertos).
 */
export type RefreshResult =
  | { status: "verified"; product: Product }
  | { status: "gone"; product: Product }
  | {
      status: "failed";
      product: Product;
      reason: FetchFailure | "not_product" | DiscardReason;
    };

/**
 * Vuelve a leer la página del producto (precio, stock). Se usa al agregar al carrito y
 * en los jobs REFRESH_PRODUCT.
 */
export async function refreshProduct(
  product: Product,
  deps: Pick<ShoppingDeps, "fetcher" | "signal" | "variants">,
): Promise<RefreshResult> {
  const outcome = await loadCandidate({ url: product.url, store: product.store }, deps);
  if (outcome.status === "product") {
    return { status: "verified", product: { ...outcome.product, id: product.id } };
  }
  const stale = { ...product, availability: "UNKNOWN" as const };
  if (outcome.status === "failed" && outcome.reason === "gone") {
    return { status: "gone", product: stale };
  }
  return {
    status: "failed",
    product: stale,
    reason: outcome.status === "not_product" ? "not_product" : outcome.reason,
  };
}
