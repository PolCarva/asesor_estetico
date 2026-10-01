import {
  type Product,
  type ShoppingQuery,
  type ShoppingQueryInput,
  ShoppingQuerySchema,
  type ShoppingResult,
  type ShoppingStats,
} from "@asesor/shared";

import { CACHE_TTL_MS } from "./cache";
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
  SearchProvider,
  ShoppingCache,
} from "./types";

export interface ShoppingDeps {
  searchProvider: SearchProvider;
  fetcher: ProductFetcher;
  cache?: ShoppingCache;
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

/** Resultado de una URL candidata. Cada candidato falla solo, sin romper la búsqueda. */
export type CandidateOutcome =
  | {
      status: "product";
      candidate: CandidateUrl;
      product: Product;
      sources: Partial<Record<RawField, ExtractSource>>;
    }
  | { status: "failed"; candidate: CandidateUrl; reason: FetchFailure }
  | { status: "not_product"; candidate: CandidateUrl }
  | { status: "discarded"; candidate: CandidateUrl; reason: NormalizeFailure };

/** Fetch → Extract → Normalize de una URL candidata. */
export async function loadCandidate(
  candidate: CandidateUrl,
  deps: Pick<ShoppingDeps, "fetcher" | "signal">,
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
  const raw = extractProduct(page);
  if (!raw) return { status: "not_product", candidate };
  const result = normalizeProductResult(raw, { store: candidate.store, fetchedAt: page.fetchedAt });
  return result.ok
    ? { status: "product", candidate, product: result.product, sources: raw.sources }
    : { status: "discarded", candidate, reason: result.reason };
}

export async function loadCandidates(
  candidates: CandidateUrl[],
  deps: Pick<ShoppingDeps, "fetcher" | "signal" | "concurrency">,
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
  };
  for (const outcome of outcomes) {
    if (outcome.status === "product") stats.products++;
    else if (outcome.status === "not_product") stats.not_product++;
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

export function searchCacheKey(query: ShoppingQuery) {
  return `search:${JSON.stringify(query)}`;
}

/**
 * Pipeline: ShoppingQuery → SearchProvider → URLs candidatas → Fetch → Extract →
 * Normalize → Rank → Cache. El resultado lleva los conteos de lo que falló.
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
  const outcomes = await loadCandidates(candidates, deps);
  const products = outcomes.flatMap((o) => (o.status === "product" ? [o.product] : []));

  const result: ShoppingResult = {
    query,
    items: rankProducts(products, query).slice(0, query.limit),
    source: "LIVE",
    generated_at: now().toISOString(),
    stats: summarizeOutcomes(outcomes),
  };
  await deps.cache?.set(key, result, CACHE_TTL_MS.search);
  return result;
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
      reason: FetchFailure | "not_product" | NormalizeFailure;
    };

/**
 * Vuelve a leer la página del producto (precio, stock). Se usa al agregar al carrito y
 * en los jobs REFRESH_PRODUCT.
 */
export async function refreshProduct(
  product: Product,
  deps: Pick<ShoppingDeps, "fetcher" | "signal">,
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
