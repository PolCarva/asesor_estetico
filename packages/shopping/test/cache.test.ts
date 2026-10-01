import { type Garment, type ShoppingQuery } from "@asesor/shared";
import { FIXTURE_PRODUCTS } from "@asesor/shared/fixtures";
import { describe, expect, it } from "vitest";

import {
  CACHE_TTL_MS,
  createMemorySearchCache,
  MockProductFetcher,
  MockSearchProvider,
  poolQueryOf,
  type ProductFetcher,
  type SearchCache,
  searchPoolKey,
  searchProducts,
} from "../src";

const oxford: Garment = {
  category: "SHIRT",
  description: "camisa oxford",
  color: { name: "crudo", hex: "#EFE8DA" },
  fit: "regular",
  material: "algodón",
  pattern: null,
};

const query = (overrides: Partial<ShoppingQuery> = {}): ShoppingQuery => ({
  garment: oxford,
  country_code: "UY",
  size: null,
  max_price: null,
  limit: 5,
  slot: "top",
  search_terms: ["camisa oxford crudo", "camisa oxford", "camisa"],
  audience: "MEN",
  strict_max_price: false,
  ...overrides,
});

/** Buscador y fetcher del catálogo ficticio que cuentan cuántas veces se los llama. */
function counted(fetchedAt = new Date("2026-01-01T12:00:00.000Z")) {
  const calls = { search: 0, fetch: 0 };
  const provider = new MockSearchProvider();
  const pages = new MockProductFetcher(FIXTURE_PRODUCTS, () => fetchedAt);
  const searchProvider = {
    name: "contado",
    search: async (q: ShoppingQuery) => {
      calls.search++;
      return provider.search(q);
    },
  };
  const fetcher: ProductFetcher = {
    name: "contado",
    fetch: async (url, options) => {
      calls.fetch++;
      return pages.fetch(url, options);
    },
  };
  return { calls, searchProvider, fetcher };
}

describe("clave del pool", () => {
  it("no depende del talle, el precio máximo, el límite ni el slot (ni de nada del usuario)", () => {
    const base = searchPoolKey(query());
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(
      searchPoolKey(
        query({
          size: "XL",
          max_price: { amount: 900, currency: "UYU" },
          strict_max_price: true,
          limit: 12,
          slot: "layering:0",
        }),
      ),
    ).toBe(base);
    // Mayúsculas y tildes no cambian la prenda.
    expect(searchPoolKey(query({ garment: { ...oxford, description: "Camisa Oxford" } }))).toBe(
      base,
    );
    expect(JSON.stringify(poolQueryOf(query({ size: "XL" })))).not.toMatch(/XL|max_price|limit/);
  });

  it("cambia si cambia la prenda o el público", () => {
    const base = searchPoolKey(query());
    expect(
      searchPoolKey(query({ garment: { ...oxford, color: { name: "azul", hex: "#2F5DA8" } } })),
    ).not.toBe(base);
    expect(searchPoolKey(query({ audience: "WOMEN" }))).not.toBe(base);
  });
});

describe("búsqueda con cache de pools", () => {
  it("miss → en vivo; hit → sin buscar ni descargar; vence a las 24 h", async () => {
    let t = Date.parse("2026-01-01T12:00:00.000Z");
    const cache = createMemorySearchCache(() => t);
    const { calls, searchProvider, fetcher } = counted();
    const deps = { searchProvider, fetcher, cache, now: () => new Date(t) };

    const live = await searchProducts(query(), deps);
    expect(live.source).toBe("LIVE");
    const afterLive = { ...calls };

    t += 60 * 60 * 1000; // 1 h después: el pool y los productos siguen frescos
    const hit = await searchProducts(query(), deps);
    expect(hit.source).toBe("CACHE");
    expect(calls).toEqual(afterLive); // ni búsqueda ni descargas
    expect(hit.items.map((i) => i.product.url)).toEqual(live.items.map((i) => i.product.url));

    t = Date.parse("2026-01-01T12:00:00.000Z") + CACHE_TTL_MS.search + 1;
    const expired = await searchProducts(query(), deps);
    expect(expired.source).toBe("LIVE");
    expect(calls.search).toBe(afterLive.search + 1);
  });

  it("el mismo pool cacheado se re-rankea con el talle de cada pedido", async () => {
    const t = Date.parse("2026-01-01T13:00:00.000Z");
    const cache = createMemorySearchCache(() => t);
    const { calls, searchProvider, fetcher } = counted();
    const deps = { searchProvider, fetcher, cache, now: () => new Date(t) };

    const talleL = await searchProducts(query({ size: "L" }), deps);
    const talleM = await searchProducts(query({ size: "M" }), deps);
    expect([talleL.source, talleM.source]).toEqual(["LIVE", "CACHE"]);
    expect(calls.search).toBe(1);

    const crudo = (r: typeof talleL) => r.items.find((i) => i.product.id === "mock-oxford-crudo")!;
    expect(crudo(talleL).size_status).toBe("OUT_OF_STOCK"); // L agotado
    expect(crudo(talleM).size_status).toBe("AVAILABLE"); // M en stock
    expect(crudo(talleM).score).toBeGreaterThan(crudo(talleL).score);
    // El pool guardado es completo (todos los productos validados, sin score): el recorte
    // por `limit` y el orden son de cada pedido.
    const saved = await cache.getPool(searchPoolKey(query()));
    expect(saved?.products).toHaveLength(FIXTURE_PRODUCTS.length);
    expect(Object.keys(saved!.products[0]!)).not.toContain("score");
    const uno = await searchProducts(query({ size: "M", limit: 1 }), deps);
    expect(uno.items).toHaveLength(1);
  });

  it("productos de más de 8 h se revalidan antes de rankear (y solo esos)", async () => {
    const searchedAt = Date.parse("2026-01-01T12:00:00.000Z");
    let t = searchedAt;
    const cache = createMemorySearchCache(() => t);
    const { calls, searchProvider, fetcher } = counted(new Date(searchedAt));
    const updates: string[] = [];
    const tracked: SearchCache = {
      getPool: (key) => cache.getPool(key),
      savePool: (key, entry, ttl) => cache.savePool(key, entry, ttl),
      updateProducts: async (products) => {
        updates.push(...products.map((p) => `${p.product.id}:${p.verified}`));
        await cache.updateProducts!(products);
      },
    };
    const deps = { searchProvider, fetcher, cache: tracked, now: () => new Date(t) };
    const live = await searchProducts(query(), deps);
    const fetchesLive = calls.fetch;

    t = searchedAt + CACHE_TTL_MS.product + 60_000; // 8 h y 1 min: pool vigente, productos viejos
    const hit = await searchProducts(query(), deps);
    expect(hit.source).toBe("CACHE");
    expect(calls.search).toBe(1); // no se vuelve a buscar
    expect(calls.fetch).toBe(fetchesLive + FIXTURE_PRODUCTS.length); // solo se re-descargan las páginas
    expect(updates.length).toBe(FIXTURE_PRODUCTS.length);
    expect(updates.every((u) => u.endsWith(":true"))).toBe(true);
    expect(hit.items.length).toBe(live.items.length);
  });

  it("una cache caída no rompe la búsqueda: va en vivo", async () => {
    const { searchProvider, fetcher } = counted();
    const broken: SearchCache = {
      getPool: async () => Promise.reject(new Error("db caída")),
      savePool: async () => {},
    };
    const result = await searchProducts(query(), { searchProvider, fetcher, cache: broken });
    expect(result.source).toBe("LIVE");
    expect(result.items.length).toBeGreaterThan(0);
  });
});
