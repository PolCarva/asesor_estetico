import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { MockAIProvider } from "@asesor/ai";
import { AnalyticsService, MemoryAnalyticsProvider } from "@asesor/analytics";
import {
  createPostgresSearchCache,
  getProductById,
  type Json,
  type JobRow,
  toJson,
  type TypedSupabaseClient,
  upsertProducts,
} from "@asesor/db";
import { createAdminClient } from "@asesor/db/admin";
import {
  audienceForProfile,
  buildShoppingQueries,
  createLogger,
  EMPTY_USER_SIZES,
  type LookSpec,
  listLookGarments,
  type Product,
  SHOPPING_STAGES,
  type ShoppingProgress,
  ShoppingProgressSchema,
  splitStyleProfile,
  type UserSizes,
} from "@asesor/shared";
import {
  FIXTURE_LOOK_SPECS,
  FIXTURE_PRODUCTS,
  FIXTURE_STYLE_PROFILE,
} from "@asesor/shared/fixtures";
import {
  MockProductFetcher,
  MockSearchProvider,
  type ProductFetcher,
  type SearchCache,
  searchPoolKey,
  type SearchProvider,
} from "@asesor/shopping";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { handlers } from "../src/handlers";
import type { HandlerDeps, JobContext } from "../src/handlers/types";
import { createPostgresJobQueue } from "../src/queue";

const envFile = resolve(import.meta.dirname, "../../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function reachable() {
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
const available = await reachable();
if (!available && process.env.CI) throw new Error("[integration] Supabase local no disponible.");
const describeIntegration = available ? describe : describe.skip;

const WORKER = "w-shopping-int";

/**
 * SEARCH_PRODUCTS y REFRESH_PRODUCT reales contra el Supabase local, con el catálogo
 * ficticio (MockSearchProvider + MockProductFetcher) y la cache de pools en Postgres. Los
 * jobs se insertan ya "en curso" bajo un worker de prueba: nunca pasan por la cola.
 */
describeIntegration("jobs de shopping (catálogo ficticio + Supabase local)", () => {
  const db = createAdminClient({ url: url!, serviceRoleKey: key! }) as TypedSupabaseClient;
  // Catálogo, prendas y pools únicos por corrida: `products` y la cache son globales.
  const tag = crypto.randomUUID().slice(0, 8);
  const catalog: Product[] = FIXTURE_PRODUCTS.map((p) => ({
    ...p,
    id: `${p.id}-${tag}`,
    url: `${p.url}-${tag}`,
  }));
  const tagged = (spec: LookSpec): LookSpec => {
    const garment = <T extends { description: string }>(g: T) => ({
      ...g,
      description: `${g.description} ${tag}`,
    });
    return {
      ...spec,
      top: garment(spec.top),
      bottom: spec.bottom ? garment(spec.bottom) : null,
      layering: spec.layering.map(garment),
      shoes: garment(spec.shoes),
      accessories: spec.accessories.map(garment),
    };
  };
  const specs = FIXTURE_LOOK_SPECS.map(tagged);
  const lookSlots = listLookGarments(specs[0]!).map((g) => g.slot);
  const sizes: UserSizes = { ...EMPTY_USER_SIZES, top: "M", bottom: "42", shoe: "42" };

  let premiumId = "";
  let freeId = "";
  let premiumLooks: string[] = [];
  let freeLook = "";
  const analytics = new MemoryAnalyticsProvider();
  const cache = createPostgresSearchCache(db);

  function deps(overrides: Partial<HandlerDeps> = {}): HandlerDeps {
    return {
      db,
      ai: new MockAIProvider(),
      analytics: new AnalyticsService({ provider: analytics, enabled: true }),
      searchProvider: new MockSearchProvider(catalog),
      fetcher: new MockProductFetcher(catalog, () => new Date()),
      searchCache: cache,
      ...overrides,
    };
  }

  /** Job SEARCH_PRODUCTS / REFRESH_PRODUCT ya en curso bajo WORKER (insertado, no reclamado). */
  async function runningJob(type: JobRow["type"], userId: string | null, payload: Json) {
    const { data, error } = await db
      .from("jobs")
      .insert({
        type,
        user_id: userId,
        payload: payload!,
        status: "RUNNING",
        attempts: 1,
        max_attempts: 2,
        locked_by: WORKER,
        locked_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    expect(error).toBeNull();
    return data!;
  }

  /** Ejecuta el handler como el runner: el progreso va a `jobs.progress` y se registra. */
  async function run(job: JobRow, depOverrides: Partial<HandlerDeps> = {}) {
    const queue = createPostgresJobQueue(db, { workerId: WORKER });
    const reported: ShoppingProgress[] = [];
    const ctx: JobContext = {
      logger: createLogger({ service: "test", write: () => {} }),
      signal: new AbortController().signal,
      deps: deps(depOverrides),
      reportProgress: async (progress) => {
        reported.push(ShoppingProgressSchema.parse(progress));
        await queue.progress!(job, progress);
      },
    };
    // Como el runner: el job termina COMPLETED o FAILED (y deja de ser una búsqueda activa).
    try {
      const result = await handlers[job.type]!(job, ctx);
      await queue.complete(job, result);
      return { result, reported };
    } catch (error) {
      await queue.fail(job, String(error), { retryable: false });
      throw error;
    }
  }

  async function lookRows(lookId: string) {
    const { data } = await db
      .from("look_products")
      .select("garment_slot, rank, size_status, products (url, price_amount, currency)")
      .eq("look_id", lookId)
      .order("garment_slot")
      .order("rank");
    return data ?? [];
  }

  async function createUser(label: string, premium: boolean) {
    const { data } = await db.auth.admin.createUser({
      email: `${label}-${crypto.randomUUID().slice(0, 8)}@example.test`,
      password: `Pw-${crypto.randomUUID()}-1`,
      email_confirm: true,
    });
    const userId = data.user!.id;
    const { core, advice } = splitStyleProfile(FIXTURE_STYLE_PROFILE);
    const { data: looks } = await db.rpc("create_style_profile_with_looks", {
      p_user_id: userId,
      p_profile: toJson(core),
      p_advice: toJson(advice),
      p_looks: toJson(specs),
    });
    if (premium) {
      await db.from("subscriptions").insert({
        user_id: userId,
        provider: "MOCK",
        provider_subscription_id: `test-${userId}`,
        status: "ACTIVE",
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
      });
    }
    const ids = looks!.sort((a, b) => a.look_position - b.look_position).map((l) => l.look_id);
    return { userId, ids };
  }

  beforeAll(async () => {
    const premium = await createUser("shop-premium", true);
    premiumId = premium.userId;
    premiumLooks = premium.ids;
    const free = await createUser("shop-free", false);
    freeId = free.userId;
    freeLook = free.ids[0]!;
  });

  afterAll(async () => {
    await db
      .from("shopping_search_cache")
      .delete()
      .ilike("query_json->garment->>description", `%${tag}%`);
    await db.from("products").delete().like("url", `%${tag}%`);
    // Jobs, looks y resultados se borran en cascada con el usuario.
    if (premiumId) await db.auth.admin.deleteUser(premiumId);
    if (freeId) await db.auth.admin.deleteUser(freeId);
  });

  it("look completo: guarda productos y resultados de cada prenda, reemplaza todo el look y escribe el progreso", async () => {
    const lookId = premiumLooks[0]!;
    // Restos de una búsqueda anterior: un producto viejo en "top" y una prenda que ya no
    // está en el look.
    const stale = { ...catalog[5]!, id: `viejo-${tag}`, url: `https://viejo.test/p/${tag}` };
    const staleId = (await upsertProducts(db, [stale])).get(stale.url)!;
    for (const slot of ["top", "accessory:4"]) {
      await db.rpc("replace_look_products", {
        p_look_id: lookId,
        p_slot: slot,
        p_items: [{ product_id: staleId, score: 0.5, score_breakdown: {}, size_status: null }],
      });
    }

    const job = await runningJob("SEARCH_PRODUCTS", premiumId, {
      user_id: premiumId,
      look_id: lookId,
      sizes,
    });
    const { result, reported } = await run(job);

    // El catálogo ficticio no tiene relojes: el accesorio queda sin productos (no es una
    // falla) y la búsqueda se informa como parcial.
    expect(result).toMatchObject({
      mode: "LOOK",
      slots: lookSlots.length,
      slots_with_results: lookSlots.length - 1,
      failed_slots: [],
      partial: true,
      cache_hits: 0,
      candidates: catalog.length * lookSlots.length,
    });
    const rows = await lookRows(lookId);
    expect(new Set(rows.map((r) => r.garment_slot))).toEqual(
      new Set(lookSlots.filter((s) => s !== "accessory:0")),
    );
    expect(rows.some((r) => r.products?.url === stale.url)).toBe(false);
    expect(rows.length).toBe((result as { saved: number }).saved);
    // Talle del usuario por producto: la camisa crudo tiene M en stock.
    expect(rows.every((r) => r.size_status !== null)).toBe(true);
    const { data: stored } = await db.from("products").select("url").like("url", `%-${tag}`);
    expect(stored?.length).toBe(catalog.length);

    // Progreso: etapas en orden, sin retroceder, y el último con el resumen.
    const order = reported.map((p) => SHOPPING_STAGES.indexOf(p.stage));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(reported.map((p) => p.stage))).toEqual(new Set(SHOPPING_STAGES));
    const { data: saved } = await db.from("jobs").select("progress").eq("id", job.id).single();
    expect(saved?.progress).toMatchObject({
      stage: "RANKING",
      slots_total: lookSlots.length,
      slots_done: lookSlots.length,
      summary: result,
    });

    const completed = analytics.events.filter((e) => e.name === "shopping_completed");
    expect(completed.at(-1)).toMatchObject({
      user_id: premiumId,
      properties: { look_id: lookId, mode: "LOOK", partial: true, slots: lookSlots.length },
    });
  });

  it("la segunda búsqueda sale de la cache; una prenda que falla queda vacía y el resultado es parcial", async () => {
    const lookId = premiumLooks[0]!;
    const profile = splitStyleProfile(FIXTURE_STYLE_PROFILE).core;
    const shoes = buildShoppingQueries(specs[0]!, {
      sizes,
      audience: audienceForProfile(profile),
    }).find((q) => q.slot === "shoes")!;
    // El pool de calzado no está en la cache y la tienda falla: solo esa prenda.
    const withoutShoes: SearchCache = {
      ...cache,
      getPool: async (k) => (k === searchPoolKey(shoes.query) ? null : cache.getPool(k)),
    };
    const broken: SearchProvider = {
      name: "calzado-caído",
      search: async (q) => {
        if (q.garment.category === "SHOES") throw new Error("tienda caída");
        return new MockSearchProvider(catalog).search();
      },
    };
    const job = await runningJob("SEARCH_PRODUCTS", premiumId, {
      user_id: premiumId,
      look_id: lookId,
      sizes: { ...sizes, top: "L" },
    });
    const { result } = await run(job, { searchCache: withoutShoes, searchProvider: broken });

    // Calzado falló; el resto sale de la cache (el accesorio también: su pool tiene
    // productos, solo que ninguno es un reloj, y sigue sin resultados).
    expect(result).toMatchObject({
      mode: "LOOK",
      failed_slots: ["shoes"],
      partial: true,
      slots_with_results: lookSlots.length - 2,
      cache_hits: lookSlots.length - 1,
    });
    const rows = await lookRows(lookId);
    expect(rows.filter((r) => r.garment_slot === "shoes")).toEqual([]);
    // Mismo pool, otro talle: la camisa crudo no tiene L en stock.
    const crudo = rows.find((r) => r.garment_slot === "top" && r.products?.url === catalog[0]!.url);
    expect(crudo?.size_status).toBe("OUT_OF_STOCK");
  });

  it("una sola prenda con precio máximo estricto: solo reemplaza esa prenda", async () => {
    const lookId = premiumLooks[0]!;
    const before = (await lookRows(lookId)).filter((r) => r.garment_slot !== "top");
    const job = await runningJob("SEARCH_PRODUCTS", premiumId, {
      user_id: premiumId,
      look_id: lookId,
      sizes,
      slot: "top",
      max_price: { amount: 1000, currency: "UYU" },
    });
    const { result } = await run(job);
    expect(result).toMatchObject({ mode: "SLOT", slots: 1, failed_slots: [] });

    const after = await lookRows(lookId);
    const top = after.filter((r) => r.garment_slot === "top");
    expect(top.length).toBeGreaterThan(0);
    expect(
      top.every((r) => r.products?.currency === "UYU" && Number(r.products.price_amount) <= 1000),
    ).toBe(true);
    expect(after.filter((r) => r.garment_slot !== "top")).toEqual(before);
  });

  it("si todas las prendas fallan, el job falla y los resultados anteriores quedan como estaban", async () => {
    const lookId = premiumLooks[0]!;
    const before = await lookRows(lookId);
    const job = await runningJob("SEARCH_PRODUCTS", premiumId, {
      user_id: premiumId,
      look_id: lookId,
      sizes,
    });
    await expect(
      run(job, {
        searchCache: { ...cache, getPool: async () => null },
        searchProvider: {
          name: "todo-caído",
          search: async () => {
            throw new Error("sin red");
          },
        },
      }),
    ).rejects.toThrow("ninguna prenda");
    expect(await lookRows(lookId)).toEqual(before);
  });

  it("vuelve a verificar en el worker: free, look ajeno o job de otro usuario no buscan", async () => {
    const freeJob = await runningJob("SEARCH_PRODUCTS", freeId, {
      user_id: freeId,
      look_id: freeLook,
      sizes,
    });
    await expect(run(freeJob)).rejects.toMatchObject({ code: "PREMIUM_REQUIRED" });
    expect(await lookRows(freeLook)).toEqual([]);

    // El look del usuario free no es del usuario Premium.
    const foreign = await runningJob("SEARCH_PRODUCTS", premiumId, {
      user_id: premiumId,
      look_id: freeLook,
      sizes,
    });
    await expect(run(foreign)).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Un job cuyo dueño no coincide con el payload.
    const mismatch = await runningJob("SEARCH_PRODUCTS", freeId, {
      user_id: premiumId,
      look_id: premiumLooks[1]!,
      sizes,
    });
    await expect(run(mismatch)).rejects.toThrow("no corresponde");
    expect(await lookRows(premiumLooks[1]!)).toEqual([]);
  });

  it("REFRESH_PRODUCT: verificado avanza la fecha; un 404 deja stock UNKNOWN y la fecha como estaba", async () => {
    const [{ data: row }] = await Promise.all([
      db.from("products").select("id, last_fetched_at").eq("url", catalog[2]!.url).single(),
    ]);
    const old = new Date("2026-01-01T00:00:00.000Z");
    await db.from("products").update({ last_fetched_at: old.toISOString() }).eq("id", row!.id);

    const ok = await runningJob("REFRESH_PRODUCT", null, { product_id: row!.id });
    const { result } = await run(ok);
    expect(result).toEqual({ product_id: row!.id, status: "verified", availability: "IN_STOCK" });
    const verified = await getProductById(db, row!.id);
    expect(new Date(verified!.product.fetched_at).getTime()).toBeGreaterThan(old.getTime());

    const gone: ProductFetcher = {
      name: "404",
      fetch: async (pageUrl) => ({
        url: pageUrl,
        status: 404,
        contentType: "text/html",
        body: "<html></html>",
        fetchedAt: new Date().toISOString(),
      }),
    };
    const fetchedAt = verified!.product.fetched_at;
    const missing = await runningJob("REFRESH_PRODUCT", null, { product_id: row!.id });
    expect((await run(missing, { fetcher: gone })).result).toMatchObject({ status: "gone" });
    const after = await getProductById(db, row!.id);
    expect(after?.product.availability).toBe("UNKNOWN");
    expect(after?.product.fetched_at).toBe(fetchedAt);

    const nothing = await runningJob("REFRESH_PRODUCT", null, { product_id: crypto.randomUUID() });
    await expect(run(nothing)).rejects.toThrow("ya no existe");
    await db.from("jobs").delete().in("id", [ok.id, missing.id, nothing.id]);
  });
});
