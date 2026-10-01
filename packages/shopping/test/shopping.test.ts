import type { Garment, Product, ShoppingQuery } from "@asesor/shared";
import { FIXTURE_PRODUCTS } from "@asesor/shared/fixtures";
import { describe, expect, it } from "vitest";

import {
  CACHE_TTL_MS,
  createMemoryCache,
  extractProduct,
  isSafeProductUrl,
  MockProductFetcher,
  MockSearchProvider,
  normalizeAvailability,
  normalizeProduct,
  rankProducts,
  refreshProduct,
  renderProductPage,
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
  audience: null,
  strict_max_price: false,
  ...overrides,
});

const byId = (id: string) => FIXTURE_PRODUCTS.find((p) => p.id === id) as Product;

describe("extract + normalize", () => {
  it("round-trip: página JSON-LD → Product equivalente", () => {
    const product = byId("mock-oxford-crudo");
    const page = {
      url: product.url,
      status: 200,
      contentType: "text/html",
      body: renderProductPage(product),
      fetchedAt: product.fetched_at,
    };
    const raw = extractProduct(page);
    expect(raw?.title).toBe(product.title);
    const normalized = normalizeProduct(raw!, {
      store: product.store,
      fetchedAt: product.fetched_at,
    });
    expect(normalized).toMatchObject({
      category: "SHIRT",
      price: product.price,
      availability: "IN_STOCK",
      materials: ["algodón"],
    });
    expect(normalized?.variants.map((v) => v.availability)).toEqual(["IN_STOCK", "OUT_OF_STOCK"]);
  });

  it("devuelve null sin JSON-LD o con respuesta de error", () => {
    expect(
      extractProduct({
        url: "https://a.test",
        status: 200,
        contentType: "text/html",
        body: "<html></html>",
        fetchedAt: "",
      }),
    ).toBeNull();
    expect(
      extractProduct({
        url: "https://a.test",
        status: 404,
        contentType: "text/html",
        body: "",
        fetchedAt: "",
      }),
    ).toBeNull();
  });

  it("mapea disponibilidad de schema.org", () => {
    expect(normalizeAvailability("https://schema.org/InStock")).toBe("IN_STOCK");
    expect(normalizeAvailability("OutOfStock")).toBe("OUT_OF_STOCK");
    expect(normalizeAvailability("https://schema.org/InStoreOnly")).toBe("IN_STORE_ONLY");
    expect(normalizeAvailability("PreOrder")).toBe("UNKNOWN");
    expect(normalizeAvailability(null)).toBe("UNKNOWN");
  });
});

describe("rankProducts", () => {
  it("prioriza categoría, color y stock, y descarta categorías no relacionadas", () => {
    const ranked = rankProducts(FIXTURE_PRODUCTS, query());
    expect(ranked[0]?.product.id).toBe("mock-oxford-crudo");
    expect(ranked.every((r) => r.product.category !== "SHOES")).toBe(true);
    const first = ranked[0]!;
    expect(first.breakdown.category_match).toBe(1);
    expect(first.breakdown.color_match).toBe(1);
    expect(first.score).toBeGreaterThan(ranked[1]!.score);
  });

  it("incluye todos los factores entre 0 y 1", () => {
    const [item] = rankProducts(FIXTURE_PRODUCTS, query());
    expect(Object.keys(item!.breakdown).sort()).toEqual([
      "category_match",
      "color_match",
      "fit_match",
      "material_match",
      "price",
      "size_available",
      "stock",
      "visual_similarity",
    ]);
    for (const value of Object.values(item!.breakdown)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("considera talle disponible y precio máximo", () => {
    const withSize = rankProducts(FIXTURE_PRODUCTS, query({ size: "L" }));
    const crudo = withSize.find((r) => r.product.id === "mock-oxford-crudo")!;
    expect(crudo.breakdown.size_available).toBe(0.25); // existe el talle pero sin stock
    const cheap = rankProducts(
      FIXTURE_PRODUCTS,
      query({ max_price: { amount: 1000, currency: "UYU" } }),
    );
    expect(cheap.find((r) => r.product.id === "mock-oxford-blanca")!.breakdown.price).toBe(1);
    expect(crudo.breakdown.price).toBeLessThan(1);
  });
});

describe("searchProducts", () => {
  it("corre el pipeline completo con mocks y usa cache", async () => {
    let t = 0;
    const cache = createMemoryCache(() => t);
    const deps = {
      searchProvider: new MockSearchProvider(),
      fetcher: new MockProductFetcher(),
      cache,
    };
    const live = await searchProducts(query({ limit: 2 }), deps);
    expect(live.source).toBe("LIVE");
    expect(live.items).toHaveLength(2);
    expect(live.items[0]?.product.id).toBe("mock-oxford-crudo");

    const cached = await searchProducts(query({ limit: 2 }), deps);
    expect(cached.source).toBe("CACHE");

    t = CACHE_TTL_MS.search + 1;
    expect((await searchProducts(query({ limit: 2 }), deps)).source).toBe("LIVE");
  });

  it("ignora candidatos que fallan", async () => {
    const searchProvider = {
      name: "broken",
      search: async () => [
        { url: "https://noexiste.test/x", store: { name: "X", domain: "noexiste.test" } },
        { url: "http://127.0.0.1/admin", store: { name: "SSRF", domain: "127.0.0.1" } },
        ...(await new MockSearchProvider().search()),
      ],
    };
    const result = await searchProducts(query(), {
      searchProvider,
      fetcher: new MockProductFetcher(),
    });
    expect(result.items.length).toBeGreaterThan(0);
  });
});

describe("seguridad y refresh", () => {
  it("bloquea URLs locales o privadas (SSRF)", () => {
    expect(isSafeProductUrl("https://tienda.com.uy/p/1")).toBe(true);
    for (const url of [
      "http://localhost:3000",
      "http://10.0.0.1",
      "http://192.168.1.2",
      "file:///etc/passwd",
      "https://user:pw@tienda.com",
      "http://[::1]/",
    ]) {
      expect(isSafeProductUrl(url)).toBe(false);
    }
  });

  it("refreshProduct marca UNKNOWN si la tienda no responde", async () => {
    const product = byId("mock-oxford-crudo");
    const fresh = await refreshProduct(product, { fetcher: new MockProductFetcher() });
    expect(fresh.availability).toBe("IN_STOCK");
    const gone = await refreshProduct(
      { ...product, url: "https://centro.tienda.test/p/borrado" },
      { fetcher: new MockProductFetcher() },
    );
    expect(gone.availability).toBe("UNKNOWN");
  });
});
