import {
  getLookForUser,
  getProductById,
  getStyleProfileCore,
  isUserPremium,
  type Json,
  type JobRow,
  markProductUnverified,
  markProductVerified,
  removeLookProductsExcept,
  saveLookProducts,
  toJson,
} from "@asesor/db";
import {
  AppError,
  audienceForProfile,
  buildShoppingQueries,
  type GarmentSlot,
  SHOPPING_STAGES,
  type ShoppingProgress,
  type ShoppingResult,
  type ShoppingSearchSummary,
  type ShoppingStage,
  StoredLookSpecSchema,
} from "@asesor/shared";
import { refreshProduct, searchProducts } from "@asesor/shopping";

import { type JobContext, NonRetryableJobError, parsePayload } from "./types";

/**
 * Jobs de shopping reales (paso 06): SEARCH_PRODUCTS busca las prendas de un look (o una
 * sola) con el pipeline de los pasos 03–05 y guarda el ranking; REFRESH_PRODUCT revalida
 * un producto guardado. Corren con service role, así que verifican dueño y Premium acá.
 */

/** Tope de una búsqueda de look: el usuario espera, y los pools cacheados la acortan. */
export const SEARCH_JOB_TIMEOUT_MS = 4 * 60_000;
export const REFRESH_JOB_TIMEOUT_MS = 60_000;

// --- Progreso --------------------------------------------------------------------------

export interface StageTracker {
  /** La prenda `index` llegó a `stage` (las etapas de una prenda nunca retroceden). */
  advance(index: number, stage: ShoppingStage): void;
  /** La prenda `index` terminó (con o sin resultados). */
  finish(index: number): void;
  /** Último progreso, con el resumen para la UI. Espera a que se guarden todos. */
  complete(summary: ShoppingSearchSummary): Promise<void>;
}

/**
 * Progreso de un job con varias prendas en paralelo. La etapa del job es la de la prenda
 * más atrasada: así nunca retrocede y "Comparando opciones" significa que todas ya pasaron
 * por las tiendas. Solo reporta cambios, en orden (una cadena de promesas), sin porcentajes.
 */
export function createStageTracker(
  slots: number,
  report: (progress: ShoppingProgress) => Promise<void>,
  now: () => Date = () => new Date(),
): StageTracker {
  const done = SHOPPING_STAGES.length;
  const positions = Array.from({ length: slots }, () => 0);
  let last = "";
  let chain = Promise.resolve();

  const emit = (summary: ShoppingSearchSummary | null = null) => {
    const slowest = positions.length > 0 ? Math.min(...positions) : done;
    const progress: ShoppingProgress = {
      stage: SHOPPING_STAGES[Math.min(slowest, done - 1)]!,
      slots_total: slots,
      slots_done: positions.filter((p) => p === done).length,
      updated_at: now().toISOString(),
      summary,
    };
    const key = `${progress.stage}|${progress.slots_done}|${summary ? "final" : ""}`;
    if (key === last) return;
    last = key;
    chain = chain.then(() => report(progress)).catch(() => undefined);
  };

  emit();
  return {
    advance(index, stage) {
      const position = SHOPPING_STAGES.indexOf(stage);
      if (position > (positions[index] ?? done)) {
        positions[index] = position;
        emit();
      }
    },
    finish(index) {
      positions[index] = done;
      emit();
    },
    async complete(summary) {
      emit(summary);
      await chain;
    },
  };
}

// --- Resumen ---------------------------------------------------------------------------

export type SlotOutcome =
  | { slot: GarmentSlot; ok: true; result: ShoppingResult; saved: number }
  | { slot: GarmentSlot; ok: false; error: unknown };

/** Resumen chico de la búsqueda: solo conteos (va a `jobs.result` y al último progreso). */
export function summarizeSearch(
  mode: ShoppingSearchSummary["mode"],
  outcomes: SlotOutcome[],
): ShoppingSearchSummary {
  const ok = outcomes.filter((o) => o.ok);
  const items = ok.flatMap((o) => o.result.items);
  const sum = (pick: (o: (typeof ok)[number]) => number) => ok.reduce((n, o) => n + pick(o), 0);
  return {
    mode,
    slots: outcomes.length,
    slots_with_results: ok.filter((o) => o.saved > 0).length,
    failed_slots: outcomes.filter((o) => !o.ok).map((o) => o.slot),
    candidates: sum((o) => o.result.stats.candidates),
    products: sum((o) => o.result.stats.products),
    saved: sum((o) => o.saved),
    unverified_stock: items.filter((i) => i.product.availability === "UNKNOWN").length,
    unverified_sizes: items.filter((i) => i.size_status === "UNVERIFIED").length,
    partial: outcomes.some((o) => !o.ok || o.saved === 0),
    cache_hits: ok.filter((o) => o.result.source === "CACHE").length,
  };
}

// --- SEARCH_PRODUCTS -------------------------------------------------------------------

export async function searchLookProducts(job: JobRow, ctx: JobContext): Promise<Json> {
  const payload = parsePayload(job, "SEARCH_PRODUCTS");
  const { db, analytics } = ctx.deps;
  if (job.user_id !== payload.user_id) {
    throw new NonRetryableJobError("El job no corresponde al usuario del pedido.");
  }
  // Service role, sin RLS: el look tiene que ser del usuario y el usuario, Premium (hoy,
  // no cuando se encoló).
  const look = await getLookForUser(db, payload.look_id, payload.user_id);
  if (!(await isUserPremium(db, payload.user_id))) {
    throw new AppError("PREMIUM_REQUIRED", "La búsqueda de productos es Premium.");
  }
  const spec = StoredLookSpecSchema.safeParse(look.spec_json);
  if (!spec.success) {
    throw new NonRetryableJobError("El look guardado no cumple el schema.", { cause: spec.error });
  }
  const profile = await getStyleProfileCore(db, look.style_profile_id, payload.user_id);
  const all = buildShoppingQueries(spec.data, {
    sizes: payload.sizes,
    audience: profile ? audienceForProfile(profile) : null,
  });
  const mode = payload.slot ? "SLOT" : "LOOK";
  const queries = payload.slot ? all.filter((q) => q.slot === payload.slot) : all;
  if (queries.length === 0) throw new NonRetryableJobError("La prenda pedida no está en el look.");
  if (payload.max_price) {
    for (const { query } of queries) {
      query.max_price = payload.max_price;
      query.strict_max_price = true;
    }
  }

  const started = Date.now();
  const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(SEARCH_JOB_TIMEOUT_MS)]);
  const tracker = createStageTracker(queries.length, (p) => ctx.reportProgress(toJson(p)));
  const webSearch = { usd: 0, count: 0 };

  // Todas las prendas en paralelo: el cliente HTTP ya limita por tienda, y la etapa del
  // job avanza parejo. Cada prenda falla sola.
  const outcomes = await Promise.all(
    queries.map(async ({ slot, query }, index): Promise<SlotOutcome> => {
      try {
        const result = await searchProducts(query, {
          searchProvider: ctx.deps.searchProvider,
          fetcher: ctx.deps.fetcher,
          variants: ctx.deps.variants,
          cache: ctx.deps.searchCache,
          signal,
          onStage: (stage) => tracker.advance(index, stage),
          onCost: (usd) => {
            webSearch.usd += usd;
            webSearch.count++;
          },
        });
        const saved = await saveLookProducts(db, {
          lookId: look.id,
          slot,
          items: result.items,
          userSize: query.size,
        });
        return { slot, ok: true, result, saved };
      } catch (error) {
        ctx.logger.warn("la búsqueda de una prenda falló", { slot, error });
        return { slot, ok: false, error };
      } finally {
        tracker.finish(index);
      }
    }),
  );

  if (webSearch.count > 0 && ctx.deps.webSearch) {
    await analytics.recordAIUsage({
      user_id: payload.user_id,
      job_id: job.id,
      operation: "WEB_SEARCH",
      provider: ctx.deps.webSearch.provider,
      model: ctx.deps.webSearch.model,
      input_tokens: 0,
      output_tokens: 0,
      image_count: 0,
      estimated_cost_usd: webSearch.usd,
      duration_ms: Date.now() - started,
      success: true,
      metadata: { searches: webSearch.count },
    });
  }

  const failed = outcomes.filter((o) => !o.ok);
  if (failed.length === outcomes.length) {
    // Nada que mostrar: el job falla (y se reintenta si queda intento). Los resultados de
    // una búsqueda anterior quedan como estaban.
    throw new Error("No se pudo buscar ninguna prenda del look.", { cause: failed[0]?.error });
  }
  // Una búsqueda completa reemplaza el look entero: las prendas que fallaron no conservan
  // resultados viejos (se informan como fallidas) y se borran las que ya no están en el look.
  if (mode === "LOOK") {
    for (const { slot } of failed) {
      await saveLookProducts(db, { lookId: look.id, slot, items: [] });
    }
    await removeLookProductsExcept(
      db,
      look.id,
      all.map((q) => q.slot),
    );
  }

  const summary = summarizeSearch(mode, outcomes);
  await tracker.complete(summary);
  const durationMs = Date.now() - started;
  ctx.logger.info("búsqueda de productos terminada", { ...summary, durationMs });
  await analytics.trackEvent("shopping_completed", {
    userId: payload.user_id,
    properties: {
      look_id: look.id,
      mode,
      slot: payload.slot ?? null,
      slots: summary.slots,
      slots_with_results: summary.slots_with_results,
      failed_slots: summary.failed_slots.length,
      saved: summary.saved,
      unverified_stock: summary.unverified_stock,
      unverified_sizes: summary.unverified_sizes,
      partial: summary.partial,
      cache_hits: summary.cache_hits,
      web_searches: webSearch.count,
      duration_ms: durationMs,
    },
  });
  return toJson(summary);
}

// --- REFRESH_PRODUCT -------------------------------------------------------------------

/**
 * Revalida un producto guardado (precio, stock, variantes). `last_fetched_at` solo avanza
 * si se verificó; si no, el stock queda en UNKNOWN y la fecha como estaba.
 */
export async function refreshStoredProduct(job: JobRow, ctx: JobContext): Promise<Json> {
  const payload = parsePayload(job, "REFRESH_PRODUCT");
  const { db } = ctx.deps;
  const stored = await getProductById(db, payload.product_id);
  if (!stored) throw new NonRetryableJobError("El producto ya no existe.");

  const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(REFRESH_JOB_TIMEOUT_MS)]);
  const refreshed = await refreshProduct(stored.product, {
    fetcher: ctx.deps.fetcher,
    variants: ctx.deps.variants,
    signal,
  });
  // Un apagado no es una falla de la tienda: el job vuelve a la cola sin tocar el producto.
  ctx.signal.throwIfAborted();
  if (refreshed.status === "verified") {
    await markProductVerified(db, stored.id, refreshed.product);
  } else {
    await markProductUnverified(db, stored.id);
  }
  return {
    product_id: stored.id,
    status: refreshed.status,
    availability: refreshed.product.availability,
  };
}
