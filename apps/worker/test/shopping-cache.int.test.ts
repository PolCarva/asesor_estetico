import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { createPostgresSearchCache, type TypedSupabaseClient } from "@asesor/db";
import { createAdminClient } from "@asesor/db/admin";
import type { ShoppingQuery } from "@asesor/shared";
import { FIXTURE_PRODUCTS } from "@asesor/shared/fixtures";
import {
  CACHE_TTL_MS,
  MockProductFetcher,
  MockSearchProvider,
  type SearchCache,
  searchPoolKey,
  searchProducts,
} from "@asesor/shopping";
import { afterAll, describe, expect, it } from "vitest";

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

describeIntegration("searchProducts con la cache de pools en Postgres", () => {
  const db = createAdminClient({ url: url!, serviceRoleKey: key! }) as TypedSupabaseClient;
  // Prenda y catálogo únicos por corrida: la cache y `products` son globales (y el seed usa
  // las URLs del catálogo ficticio), así que el test no toca filas ajenas.
  const tag = crypto.randomUUID().slice(0, 8);
  const catalog = FIXTURE_PRODUCTS.map((p) => ({
    ...p,
    id: `${p.id}-${tag}`,
    url: `${p.url}-${tag}`,
  }));
  const query: ShoppingQuery = {
    garment: {
      category: "SHIRT",
      description: `camisa oxford ${tag}`,
      color: { name: "crudo", hex: "#EFE8DA" },
      fit: "regular",
      material: "algodón",
      pattern: null,
    },
    country_code: "UY",
    size: "L",
    max_price: null,
    limit: 5,
    slot: "top",
    search_terms: ["camisa oxford"],
    audience: "MEN",
    strict_max_price: false,
  };

  afterAll(async () => {
    await db.from("shopping_search_cache").delete().eq("key", searchPoolKey(query));
    await db
      .from("products")
      .delete()
      .in(
        "url",
        catalog.map((p) => p.url),
      );
  });

  it("miss en vivo, hit sin buscar, re-ranking por talle y vencimiento a las 24 h", async () => {
    let now = new Date("2026-01-01T12:30:00.000Z");
    const cache: SearchCache = createPostgresSearchCache(db, { now: () => now });
    let searches = 0;
    const provider = new MockSearchProvider(catalog);
    const deps = {
      searchProvider: { name: "contado", search: async () => (searches++, provider.search()) },
      fetcher: new MockProductFetcher(catalog),
      cache,
      now: () => now,
    };

    const talleL = await searchProducts(query, deps);
    expect(talleL.source).toBe("LIVE");
    const talleM = await searchProducts({ ...query, size: "M" }, deps);
    expect(talleM.source).toBe("CACHE");
    expect(searches).toBe(1);

    const crudo = (r: typeof talleL) =>
      r.items.find((i) => i.product.id === `mock-oxford-crudo-${tag}`)!;
    expect(crudo(talleL).size_status).toBe("OUT_OF_STOCK");
    expect(crudo(talleM).size_status).toBe("AVAILABLE");
    // Los productos del pool salen de `products` (cache persistente), no de la cache en memoria.
    const { data } = await db
      .from("products")
      .select("url")
      .in(
        "url",
        catalog.map((p) => p.url),
      );
    expect(data).toHaveLength(catalog.length);

    now = new Date(now.getTime() + CACHE_TTL_MS.search + 1);
    expect((await searchProducts(query, deps)).source).toBe("LIVE");
    expect(searches).toBe(2);
  });
});
