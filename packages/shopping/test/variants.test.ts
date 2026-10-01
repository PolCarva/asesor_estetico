import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  extractProduct,
  type FetchedPage,
  type FetchLike,
  loadCandidate,
  parseFenicioSizes,
  parsePrice,
  parseShopifyProduct,
  parseVtexCatalog,
  PlatformVariantEnricher,
  PoliteHttpClient,
  type ProductFetcher,
  summarizeOutcomes,
  type VariantEnricher,
} from "../src";

const fixture = (name: string) =>
  readFileSync(resolve(import.meta.dirname, "fixtures", name), "utf8");
const json = (name: string) => JSON.parse(fixture(name)) as unknown;

const page = (url: string, body: string): FetchedPage => ({
  url,
  status: 200,
  contentType: "text/html; charset=utf-8",
  body,
  fetchedAt: "2026-10-01T12:00:00.000Z",
});

/** Transporte falso por URL exacta (sin robots.txt = todo permitido); registra los requests. */
function transport(routes: Record<string, string | { status: number; body?: string }>) {
  const calls: string[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    const route = routes[url];
    if (route === undefined) return new Response("not found", { status: 404 });
    if (typeof route === "string") return new Response(route, { status: 200 });
    return new Response(route.body ?? "", { status: route.status });
  };
  return { http: new PoliteHttpClient({ fetch, minIntervalMs: 0 }), calls };
}

/** Fetcher que sirve una sola página. */
const servePage = (p: FetchedPage): ProductFetcher => ({
  name: "fixture",
  fetch: async () => p,
});

const ADIDAS_URL = "https://www.adidas.com.uy/remera-essentials-logo-adkc0917/p";
const HM_URL = "https://uy.hm.com/1225609039/p";
const JJ_URL = "https://jackjones.com.uy/products/12268608_4644861";
const WOO_URL = "https://www.tiendasmontevideo.com.uy/product/pantalon-de-pijama-estampado-2/";

describe("Fenicio: talles de #lstTalles (página real)", () => {
  it("Legacy: talle en data-cpre y en <b>, SKU en value, todos disponibles", () => {
    const variants = parseFenicioSizes(fixture("fenicio-talles-legacy.html"));
    expect(variants?.map((v) => [v.size, v.availability])).toEqual([
      ["L", "InStock"],
      ["M", "InStock"],
      ["S", "InStock"],
      ["XL", "InStock"],
      ["XXL", "InStock"],
      ["XXXL", "InStock"],
    ]);
    expect(variants?.[0]).toMatchObject({ id: "1:L309A96:ARENA:L:1", sku: "1:L309A96:ARENA:L:1" });
  });

  it("Indian: data-cpre es un código; el talle sale de <b> y los agotados quedan agotados", () => {
    const variants = parseFenicioSizes(fixture("fenicio-talles-indian.html"));
    expect(variants?.map((v) => [v.size, v.availability])).toEqual([
      ["L", "InStock"],
      ["M", "OutOfStock"],
      ["S", "OutOfStock"],
      ["XL", "OutOfStock"],
    ]);
  });

  it("Hering: talles brasileños (P, M, XG) se conservan como etiqueta", () => {
    const variants = parseFenicioSizes(fixture("fenicio-talles-hering.html"));
    expect(variants?.map((v) => v.size)).toEqual(["M", "P", "XG"]);
  });

  it("La Isla: con precio por talle (data-varia) el precio no se mezcla con el talle", () => {
    const variants = parseFenicioSizes(fixture("fenicio-talles-laisla.html"));
    expect(variants?.map((v) => [v.size, parsePrice(v.price), v.availability])).toEqual([
      ["30", 2990, "InStock"],
      ["34", 1990, "InStock"],
      ["36", 1990, "InStock"],
      ["38", 1990, "InStock"],
      ["40", 1990, "InStock"],
      ["32", 2990, "OutOfStock"],
    ]);
  });

  it("sin #lstTalles no hay dato (null), nunca una lista inventada", () => {
    expect(parseFenicioSizes(fixture("fenicio-legacy-producto.html"))).toBeNull();
  });

  it("el enriquecedor no hace requests para Fenicio y normaliza en el producto", async () => {
    const { http, calls } = transport({});
    const body = fixture("fenicio-legacy-producto.html").replace(
      "</body>",
      `${fixture("fenicio-talles-hering.html")}</body>`,
    );
    const p = page("https://www.hering.com.uy/catalogo/camisa_HFL1_YX8EN", body);
    const outcome = await loadCandidate(
      { url: p.url, store: { name: "Hering", domain: "hering.com.uy" }, platform: "FENICIO" },
      { fetcher: servePage(p), variants: new PlatformVariantEnricher(http) },
    );
    expect(calls).toEqual([]);
    expect(outcome.status).toBe("product");
    if (outcome.status !== "product") return;
    expect(outcome.variants).toMatchObject({ status: "verified", source: "fenicio:html" });
    expect(outcome.product.variants.map((v) => [v.size, v.size_label, v.availability])).toEqual([
      ["M", "M", "IN_STOCK"],
      ["S", "P", "IN_STOCK"],
      ["XL", "XG", "IN_STOCK"],
    ]);
    expect(outcome.product.availability).toBe("IN_STOCK");
  });
});

describe("VTEX: API de catálogo por SKU (respuestas reales)", () => {
  it("Adidas: talles de `Talla`, stock por SKU y precio por variante", () => {
    const variants = parseVtexCatalog(json("vtex-adidas-catalogo.json"), ADIDAS_URL);
    expect(variants.map((v) => [v.id, v.size, v.availability, v.price])).toEqual([
      ["29253", "S", "InStock", 1490],
      ["29269", "M", "InStock", 1490],
      ["29222", "L", "InStock", 1490],
      ["29237", "XL", "OutOfStock", 1490],
      ["29206", "2XL", "OutOfStock", 1490],
    ]);
  });

  it("H&M: la clave del talle es `Talla Hombre`", () => {
    const variants = parseVtexCatalog(json("vtex-hm-catalogo.json"), HM_URL);
    expect(variants.map((v) => [v.size, v.availability])).toEqual([
      ["S", "InStock"],
      ["M", "OutOfStock"],
      ["L", "OutOfStock"],
      ["XL", "OutOfStock"],
      ["XXL", "OutOfStock"],
    ]);
  });

  it("busca por el SKU de la página (sin ceros a la izquierda) con `?fq=` y completa el producto", async () => {
    const api = "https://www.adidas.com.uy/api/catalog_system/pub/products/search?fq=skuId:29253";
    const { http, calls } = transport({ [api]: fixture("vtex-adidas-catalogo.json") });
    const p = page(ADIDAS_URL, fixture("vtex-adidas-producto.html"));
    const outcome = await loadCandidate(
      { url: p.url, store: { name: "Adidas", domain: "adidas.com.uy" }, platform: "VTEX" },
      { fetcher: servePage(p), variants: new PlatformVariantEnricher(http) },
    );
    expect(calls).toContain(api);
    if (outcome.status !== "product") throw new Error(outcome.status);
    expect(outcome.product.variants.map((v) => [v.size, v.availability])).toEqual([
      ["S", "IN_STOCK"],
      ["M", "IN_STOCK"],
      ["L", "IN_STOCK"],
      ["XL", "OUT_OF_STOCK"],
      ["XXL", "OUT_OF_STOCK"],
    ]);
    expect(outcome.product.variants.at(-1)?.size_label).toBe("2XL");
    expect(outcome.sources.variants).toBe("platform");
  });

  it("H&M: el SKU sale del JSON-LD de la página (FastStore) y robots permite `?fq=`", async () => {
    const api = "https://uy.hm.com/api/catalog_system/pub/products/search?fq=skuId:245570";
    const { http } = transport({
      "https://uy.hm.com/robots.txt":
        "User-agent: *\nDisallow: /*_*\nAllow: /api/catalog_system/pub/products/search?fq=",
      [api]: fixture("vtex-hm-catalogo.json"),
    });
    const p = page(HM_URL, fixture("vtex-hm-producto.html"));
    const raw = extractProduct(p)!;
    expect(raw.sku).toBe("245570");
    const result = await new PlatformVariantEnricher(http).enrich({
      page: p,
      raw,
      platform: "VTEX",
    });
    expect(result).toMatchObject({
      status: "verified",
      source: "vtex:catalog",
      availability: "InStock",
    });
  });

  it("si robots.txt prohíbe la API (BAS), falla como `blocked` y el producto queda sin talles", async () => {
    const { http, calls } = transport({
      "https://www.bas.com.uy/robots.txt": "User-agent: *\nDisallow: /api/",
    });
    const p = page(
      "https://www.bas.com.uy/sobrecamisa-jean-azul-1000481678/p",
      fixture("vtex-bas-producto.html").replace('"price":0', '"price":1290'),
    );
    const raw = extractProduct(p)!;
    const result = await new PlatformVariantEnricher(http).enrich({
      page: p,
      raw: { ...raw, sku: "1000481678" },
      platform: "VTEX",
    });
    expect(result).toEqual({ status: "failed", source: "vtex:catalog", reason: "blocked" });
    expect(calls.some((c) => c.includes("/api/"))).toBe(false);
  });

  it("si la API devuelve otro producto, no se usan sus talles (`mismatch`)", async () => {
    const api = "https://www.adidas.com.uy/api/catalog_system/pub/products/search?fq=skuId:29253";
    const { http } = transport({ [api]: fixture("vtex-hm-catalogo.json") });
    const p = page(ADIDAS_URL, fixture("vtex-adidas-producto.html"));
    const result = await new PlatformVariantEnricher(http).enrich({
      page: p,
      raw: extractProduct(p)!,
      platform: "VTEX",
    });
    expect(result).toEqual({ status: "failed", source: "vtex:catalog", reason: "mismatch" });
  });

  it("sin SKU numérico no hay con qué buscar (`no_id`)", async () => {
    const { http, calls } = transport({});
    const p = page(ADIDAS_URL, fixture("vtex-adidas-producto.html"));
    const raw = { ...extractProduct(p)!, sku: null, variants: [] };
    const result = await new PlatformVariantEnricher(http).enrich({
      page: p,
      raw,
      platform: "VTEX",
    });
    expect(result).toEqual({ status: "failed", source: "vtex:catalog", reason: "no_id" });
    expect(calls).toEqual([]);
  });
});

describe("Shopify: `/products/<handle>.js` (respuesta real)", () => {
  it("opciones Color/Talla, `available` por variante y precio en centésimos", () => {
    const variants = parseShopifyProduct(
      json("shopify-jackjones-producto-js.json"),
      "12268608_4644861",
    );
    expect(variants.map((v) => [v.size, v.color, v.availability, v.price])).toEqual([
      ["XL", "Black", "InStock", 1499],
      ["S", "Black", "OutOfStock", 1499],
      ["M", "Black", "InStock", 1499],
      ["XXL", "Black", "InStock", 1499],
      ["L", "Black", "InStock", 1499],
    ]);
    expect(variants[0]?.id).toBe("50765850411300");
  });

  it("completa el producto de la página: los ids de variante coinciden con los `?variant=`", async () => {
    const { http, calls } = transport({
      [`${JJ_URL}.js`]: fixture("shopify-jackjones-producto-js.json"),
    });
    const p = page(JJ_URL, fixture("shopify-jackjones-producto.html"));
    const outcome = await loadCandidate(
      {
        url: p.url,
        store: { name: "Jack & Jones", domain: "jackjones.com.uy" },
        platform: "SHOPIFY",
      },
      { fetcher: servePage(p), variants: new PlatformVariantEnricher(http) },
    );
    expect(calls).toContain(`${JJ_URL}.js`);
    if (outcome.status !== "product") throw new Error(outcome.status);
    const sizes = outcome.product.variants.map((v) => [v.size, v.availability]);
    expect(sizes).toContainEqual(["S", "OUT_OF_STOCK"]);
    expect(sizes).toContainEqual(["M", "IN_STOCK"]);
    expect(outcome.product.availability).toBe("IN_STOCK");
  });

  it("otro handle en la respuesta → `mismatch`", () => {
    expect(() => parseShopifyProduct(json("shopify-jackjones-producto-js.json"), "otro")).toThrow(
      /otro producto/,
    );
  });
});

describe("WooCommerce: Store API (respuestas reales)", () => {
  const api = "https://www.tiendasmontevideo.com.uy/wp-json/wc/store/v1/products";

  it("talles de los términos del atributo y stock de cada variación; las que no responden quedan UNKNOWN", async () => {
    const { http, calls } = transport({
      [`${api}?slug=pantalon-de-pijama-estampado-2`]: fixture(
        "woo-tiendasmontevideo-producto.json",
      ),
      [`${api}/374349`]: fixture("woo-tiendasmontevideo-variacion-374349.json"),
      [`${api}/374358`]: fixture("woo-tiendasmontevideo-variacion-374358.json"),
    });
    const p = page(WOO_URL, fixture("woo-tiendasmontevideo-producto.html"));
    const result = await new PlatformVariantEnricher(http, { maxWooVariations: 4 }).enrich({
      page: p,
      raw: extractProduct(p)!,
      platform: "WOOCOMMERCE",
    });
    if (result.status !== "verified") throw new Error(result.status);
    expect(result.source).toBe("woo:store-api");
    // Diez variaciones: se consultan 4 (tope); dos responden (en stock), dos dan 404.
    expect(calls.filter((c) => /\/products\/\d+$/.test(c))).toHaveLength(4);
    expect(
      result.variants.slice(0, 4).map((v) => [v.id, v.size, v.color, v.availability, v.price]),
    ).toEqual([
      ["391004", "M", "DISEÑO 8", null, null],
      ["374349", "L", "DISEÑO 1", "InStock", 319],
      ["374357", "L", "DISEÑO 3", null, null],
      ["374358", "XL", "DISEÑO 3", "InStock", 319],
    ]);
    expect(result.variants.slice(4).every((v) => v.availability === null)).toBe(true);
    expect(result.availability).toBe("InStock");
  });

  it("la página del producto pasa por todo el pipeline con los talles de la Store API", async () => {
    const { http } = transport({
      [`${api}?slug=pantalon-de-pijama-estampado-2`]: fixture(
        "woo-tiendasmontevideo-producto.json",
      ),
      [`${api}/374349`]: fixture("woo-tiendasmontevideo-variacion-374349.json"),
    });
    const p = page(WOO_URL, fixture("woo-tiendasmontevideo-producto.html"));
    const outcome = await loadCandidate(
      {
        url: p.url,
        store: { name: "Tiendas Montevideo", domain: "tiendasmontevideo.com.uy" },
        platform: "WOOCOMMERCE",
      },
      { fetcher: servePage(p), variants: new PlatformVariantEnricher(http) },
    );
    if (outcome.status !== "product") throw new Error(outcome.status);
    expect(outcome.product.price).toEqual({ amount: 319, currency: "UYU" });
    expect(outcome.product.url).toBe(
      "https://www.tiendasmontevideo.com.uy/product/pantalon-de-pijama-estampado-2",
    );
    expect(new Set(outcome.product.variants.map((v) => v.size))).toEqual(
      new Set(["S", "M", "L", "XL"]),
    );
  });
});

describe("un adaptador que falla no descarta el producto", () => {
  it("el producto sigue con lo que dice su página; talles y stock sin verificar se cuentan", async () => {
    const failing: VariantEnricher = { enrich: async () => Promise.reject(new Error("caído")) };
    const p = page(ADIDAS_URL, fixture("vtex-adidas-producto.html"));
    const outcome = await loadCandidate(
      { url: p.url, store: { name: "Adidas", domain: "adidas.com.uy" }, platform: "VTEX" },
      { fetcher: servePage(p), variants: failing },
    );
    if (outcome.status !== "product") throw new Error(outcome.status);
    expect(outcome.variants).toEqual({ status: "unsupported" });
    // El JSON-LD de Adidas trae un Offer por SKU sin talle: hay variantes, pero sin talle.
    expect(outcome.product.variants.every((v) => v.size === null)).toBe(true);
    expect(summarizeOutcomes([outcome])).toMatchObject({ products: 1, unverified_sizes: 1 });
  });

  it("sin dato de stock en la página ni en la plataforma, la disponibilidad es UNKNOWN", async () => {
    const { http } = transport({
      [`${JJ_URL}.js`]: { status: 500 },
    });
    const body = fixture("shopify-jackjones-producto.html").replace(
      /"availability":\s*"[^"]*"/g,
      '"availability":""',
    );
    const p = page(JJ_URL, body);
    const outcome = await loadCandidate(
      {
        url: p.url,
        store: { name: "Jack & Jones", domain: "jackjones.com.uy" },
        platform: "SHOPIFY",
      },
      { fetcher: servePage(p), variants: new PlatformVariantEnricher(http) },
    );
    if (outcome.status !== "product") throw new Error(outcome.status);
    expect(outcome.variants).toEqual({
      status: "failed",
      source: "shopify:product-js",
      reason: "unavailable",
    });
    expect(outcome.product.availability).toBe("UNKNOWN");
    expect(outcome.product.variants.every((v) => v.availability === "UNKNOWN")).toBe(true);
    expect(summarizeOutcomes([outcome])).toMatchObject({
      unverified_stock: 1,
      unverified_sizes: 1,
    });
  });
});
