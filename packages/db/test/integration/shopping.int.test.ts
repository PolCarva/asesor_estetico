import type { Product, RankedProduct, ShoppingStats } from "@asesor/shared";
import {
  FIXTURE_LOOK_SPECS,
  FIXTURE_PRODUCTS,
  FIXTURE_STYLE_PROFILE,
} from "@asesor/shared/fixtures";
import { splitStyleProfile } from "@asesor/shared";
import { afterAll, beforeAll, expect, it } from "vitest";

import {
  createPostgresSearchCache,
  getLookProducts,
  getProductById,
  markProductUnverified,
  markProductVerified,
  purgeExpiredSearchCache,
  saveLookProducts,
  upsertProducts,
} from "../../src/shopping";
import { toJson } from "../../src/types";
import { adminClient, createTestUser, deleteTestUser, describeIntegration } from "./setup";

/** Productos ficticios con URLs únicas por corrida (la tabla es global). */
function products(tag: string): Product[] {
  return FIXTURE_PRODUCTS.slice(0, 3).map((p) => ({
    ...p,
    url: `${p.url}-${tag}`,
    id: `${p.id}-${tag}`,
  }));
}

const STATS: ShoppingStats = {
  candidates: 3,
  products: 3,
  blocked: 0,
  gone: 0,
  failed: 0,
  not_product: 0,
  no_price: 0,
  invalid: 0,
  unverified_stock: 0,
  unverified_sizes: 1,
};

const ranked = (list: Product[]): RankedProduct[] =>
  list.map((product, i) => ({
    product,
    score: 0.9 - i * 0.1,
    breakdown: {
      category_match: 1,
      visual_similarity: 0.8,
      color_match: 1,
      fit_match: 0.5,
      material_match: 1,
      size_available: 1,
      stock: 1,
      price: 0.5,
    },
    size_status: i === 0 ? "AVAILABLE" : "UNVERIFIED",
  }));

describeIntegration("shopping: persistencia y cache de búsquedas", () => {
  const admin = adminClient();
  const tag = crypto.randomUUID().slice(0, 8);
  const created: string[] = [];
  const cacheKeys: string[] = [];
  let owner: Awaited<ReturnType<typeof createTestUser>>;
  let other: Awaited<ReturnType<typeof createTestUser>>;
  let lookId = "";

  beforeAll(async () => {
    owner = await createTestUser("shop-owner");
    other = await createTestUser("shop-other");
    const { core, advice } = splitStyleProfile(FIXTURE_STYLE_PROFILE);
    const { data, error } = await admin.rpc("create_style_profile_with_looks", {
      p_user_id: owner.id,
      p_profile: toJson(core),
      p_advice: toJson(advice),
      p_looks: toJson(FIXTURE_LOOK_SPECS),
    });
    expect(error).toBeNull();
    lookId = data!.find((r) => r.look_position === 1)!.look_id;
  });

  afterAll(async () => {
    if (cacheKeys.length) await admin.from("shopping_search_cache").delete().in("key", cacheKeys);
    if (created.length) await admin.from("products").delete().in("id", created);
    await deleteTestUser(owner.id);
    await deleteTestUser(other.id);
  });

  it("upsert de productos idempotente por URL canónica; las variantes se reemplazan sin perder uuid", async () => {
    const list = products(`up-${tag}`);
    const first = await upsertProducts(admin, list);
    created.push(...first.values());
    const second = await upsertProducts(admin, list);
    expect([...second.entries()]).toEqual([...first.entries()]);

    const crudoUrl = list[0]!.url;
    const crudoId = first.get(crudoUrl)!;
    const { data: before } = await admin
      .from("product_variants")
      .select("id, external_id")
      .eq("product_id", crudoId)
      .order("external_id");
    expect(before?.map((v) => v.external_id)).toEqual([
      "mock-oxford-crudo-l",
      "mock-oxford-crudo-m",
    ]);

    // La tienda deja de publicar el talle L y cambia el título: misma fila, una variante menos.
    const updated = {
      ...list[0]!,
      title: "Camisa oxford cruda (nueva)",
      variants: list[0]!.variants.slice(0, 1),
    };
    const third = await upsertProducts(admin, [updated, updated]); // duplicado en el lote: no rompe
    expect(third.get(crudoUrl)).toBe(crudoId);
    const { data: after } = await admin
      .from("product_variants")
      .select("id, external_id")
      .eq("product_id", crudoId);
    expect(after?.map((v) => v.external_id)).toEqual(["mock-oxford-crudo-m"]);
    expect(after?.[0]?.id).toBe(before?.find((v) => v.external_id === "mock-oxford-crudo-m")?.id);
    expect((await getProductById(admin, crudoId))?.product.title).toBe(
      "Camisa oxford cruda (nueva)",
    );
  });

  it("el mismo id externo en dos URLs (handle renombrado) no viola ningún único", async () => {
    const [base] = products(`dup-${tag}`);
    const renamed = { ...base!, url: `${base!.url}-renombrado` };
    const ids = await upsertProducts(admin, [base!, renamed]);
    created.push(...ids.values());
    expect(new Set(ids.values()).size).toBe(2);
  });

  it("solo una verificación exitosa mueve last_fetched_at; una falla deja el stock UNKNOWN", async () => {
    const [product] = products(`fresh-${tag}`);
    const ids = await upsertProducts(admin, [product!]);
    const id = ids.get(product!.url)!;
    created.push(id);

    await markProductUnverified(admin, id);
    const failed = await getProductById(admin, id);
    expect(failed?.product.availability).toBe("UNKNOWN");
    expect(failed?.product.fetched_at).toBe(product!.fetched_at);

    const verifiedAt = "2026-10-01T15:00:00.000Z";
    await markProductVerified(admin, id, {
      ...product!,
      availability: "IN_STOCK",
      fetched_at: verifiedAt,
    });
    const verified = await getProductById(admin, id);
    expect(verified?.product).toMatchObject({ availability: "IN_STOCK", fetched_at: verifiedAt });
  });

  it("ranking por look: reemplazo atómico e idempotente; solo lo lee el dueño Premium", async () => {
    const list = products(`look-${tag}`);
    expect(await saveLookProducts(admin, { lookId, slot: "top", items: ranked(list) })).toBe(3);
    expect(
      await saveLookProducts(admin, { lookId, slot: "top", items: ranked(list.slice(0, 2)) }),
    ).toBe(2);
    const ids = await upsertProducts(admin, list);
    created.push(...ids.values());

    const rows = await getLookProducts(admin, lookId);
    expect(rows.map((r) => [r.slot, r.rank, r.product.product.url, r.sizeStatus])).toEqual([
      ["top", 1, list[0]!.url, "AVAILABLE"],
      ["top", 2, list[1]!.url, "UNVERIFIED"],
    ]);
    expect(rows[0]!.breakdown.color_match).toBe(1);

    // RLS: el dueño sin Premium no ve resultados; con Premium sí; otro usuario nunca.
    expect(await getLookProducts(owner.client, lookId)).toEqual([]);
    await admin.from("subscriptions").insert({
      user_id: owner.id,
      provider: "MOCK",
      provider_subscription_id: `test-${owner.id}`,
      status: "ACTIVE",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect((await getLookProducts(owner.client, lookId)).length).toBe(2);
    expect(await getLookProducts(other.client, lookId)).toEqual([]);

    // Nadie escribe resultados desde el cliente, ni por la función.
    const rpc = await owner.client.rpc("replace_look_products", {
      p_look_id: lookId,
      p_slot: "top",
      p_items: toJson([]),
    });
    expect(rpc.error).not.toBeNull();
    const insert = await owner.client.from("look_products").insert({
      look_id: lookId,
      product_id: ids.get(list[2]!.url)!,
      garment_slot: "top",
      rank: 9,
      score: 1,
    });
    expect(insert.error).not.toBeNull();
  });

  it("cache de pools en Postgres: hit, vencimiento y purga; sin datos del usuario", async () => {
    let now = new Date("2026-10-01T12:00:00.000Z");
    const cache = createPostgresSearchCache(admin, { now: () => now });
    const key = crypto.randomUUID().replaceAll("-", "").padEnd(64, "0").slice(0, 64);
    cacheKeys.push(key);
    const list = products(`cache-${tag}`);
    const query = {
      v: 1,
      country_code: "UY",
      audience: "MEN",
      search_terms: ["camisa"],
      garment: { category: "SHIRT" },
    };

    expect(await cache.getPool(key)).toBeNull(); // miss
    await cache.savePool(key, { query, products: list, stats: STATS }, 24 * 60 * 60 * 1000);
    const ids = await upsertProducts(admin, list);
    created.push(...ids.values());

    const hit = await cache.getPool(key);
    expect(hit?.products.map((p) => p.url)).toEqual(list.map((p) => p.url));
    expect(hit?.stats).toEqual(STATS);
    expect(hit?.cachedAt).toBe(now.toISOString());

    const { data: row } = await admin
      .from("shopping_search_cache")
      .select("query_json, product_ids, expires_at")
      .eq("key", key)
      .single();
    expect(row?.product_ids).toHaveLength(3);
    expect(Date.parse(row!.expires_at) - now.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(JSON.stringify(row?.query_json)).not.toMatch(/size|max_price|user/);

    now = new Date(now.getTime() + 24 * 60 * 60 * 1000 + 1);
    expect(await cache.getPool(key)).toBeNull(); // vencido
    await purgeExpiredSearchCache(admin, now);
    const { data: gone } = await admin.from("shopping_search_cache").select("key").eq("key", key);
    expect(gone).toEqual([]);
  });

  it("la cache de búsquedas es solo del worker: ni anon ni authenticated la leen o escriben", async () => {
    const read = await owner.client.from("shopping_search_cache").select("key").limit(1);
    expect(read.error).not.toBeNull();
    const write = await owner.client.from("shopping_search_cache").insert({
      key: "f".repeat(64),
      query_json: toJson({}),
      expires_at: new Date().toISOString(),
    });
    expect(write.error).not.toBeNull();
  });
});
