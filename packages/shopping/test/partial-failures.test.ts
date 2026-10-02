import type { Garment, Product, ShoppingQuery } from "@asesor/shared";
import { FIXTURE_PRODUCTS } from "@asesor/shared/fixtures";
import { describe, expect, it } from "vitest";

import {
  type FetchedPage,
  HttpStatusError,
  MockProductFetcher,
  MockSearchProvider,
  normalizeProduct,
  parseFenicioSizes,
  parseShopifyProduct,
  rankProducts,
  type RawProduct,
  refreshProduct,
  searchProducts,
} from "../src";

/**
 * Paso 11 — "MANEJO DE ERRORES" del SPEC: el shopping sigue con las otras tiendas y resultados
 * si una tienda bloquea, un producto desaparece, cambia el HTML, no hay talle, falla una
 * extracción, falla un candidato o algo tarda demasiado. Un test por caso, más las reglas de
 * "nunca inventar" que salieron de la auditoría.
 */

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
const store = { name: "X", domain: "x.test" };

/** Búsqueda con el catálogo ficticio más un candidato que falla de la forma pedida. */
async function searchWith(
  url: string,
  respond: (url: string) => Promise<FetchedPage> | FetchedPage,
): Promise<Awaited<ReturnType<typeof searchProducts>>> {
  const catalog = await new MockSearchProvider().search();
  const mock = new MockProductFetcher();
  return searchProducts(query(), {
    searchProvider: { name: "test", search: async () => [{ url, store }, ...catalog] },
    fetcher: {
      name: "test",
      fetch: async (u: string) => (u === url ? respond(u) : mock.fetch(u)),
    },
  });
}
const html = (url: string, body: string, status = 200): FetchedPage => ({
  url,
  status,
  contentType: "text/html; charset=utf-8",
  body,
  fetchedAt: "2026-10-01T12:00:00.000Z",
});
const shirts = async () => (await new MockSearchProvider().search()).length;

describe("fallas parciales del SPEC: cada una cuenta y las demás tiendas siguen", () => {
  it("una tienda bloquea: 403, 429 o el desafío anti-bot", async () => {
    for (const status of [403, 429]) {
      const result = await searchWith("https://x.test/p", (u) => {
        throw new HttpStatusError(u, status);
      });
      expect(result.stats.blocked).toBe(1);
      expect(result.stats.products).toBe(await shirts());
      expect(result.items.length).toBeGreaterThan(0);
    }
    // Página de desafío ("Checking your browser…"), con 200 o 503: no es un producto.
    const challenge =
      "<html><head><title>Just a moment...</title></head><body>Checking your browser</body></html>";
    const ok = await searchWith("https://x.test/p", (u) => html(u, challenge));
    expect(ok.stats.not_product).toBe(1);
    const unavailable = await searchWith("https://x.test/p", (u) => {
      throw new HttpStatusError(u, 503);
    });
    expect(unavailable.stats.failed).toBe(1);
    expect(unavailable.items.length).toBeGreaterThan(0);
  });

  it("un producto desapareció: 404 y 410 por el camino real de la descarga", async () => {
    for (const status of [404, 410]) {
      const result = await searchWith("https://x.test/p", (u) => {
        throw new HttpStatusError(u, status);
      });
      expect(result.stats.gone).toBe(1);
      expect(result.items.length).toBeGreaterThan(0);
    }
  });

  it("cambió el HTML: sin datos estructurados no es un producto (no se adivina)", async () => {
    const result = await searchWith("https://x.test/p", (u) =>
      html(
        u,
        '<html><body><h1>Camisa oxford</h1><span class="precio">$ 1.690</span></body></html>',
      ),
    );
    expect(result.stats.not_product).toBe(1);
    expect(result.items.every((i) => i.product.url !== "https://x.test/p")).toBe(true);
  });

  it("no hay talle: sin variantes queda sin verificar; si no está el talle, 'no está'", () => {
    const base = FIXTURE_PRODUCTS.find((p) => p.id === "mock-oxford-crudo")!;
    const sinTalles: Product = { ...base, url: `${base.url}-a`, variants: [] };
    const otroTalle: Product = {
      ...base,
      url: `${base.url}-b`,
      variants: [{ ...base.variants[0]!, id: "s", size: "S", size_label: "S" }],
    };
    const ranked = rankProducts([sinTalles, otroTalle], query({ size: "XL" }));
    const status = new Map(ranked.map((r) => [r.product.url, r.size_status]));
    expect(status.get(sinTalles.url)).toBe("UNVERIFIED");
    expect(status.get(otroTalle.url)).toBe("NOT_OFFERED");
  });

  it("falla una extracción: una entidad HTML fuera de rango no tira la búsqueda (regresión)", async () => {
    // Antes, `String.fromCodePoint` lanzaba RangeError y se caía toda la prenda.
    const body =
      '<script type="application/ld+json">{"@type":"Product","name":"Camisa &#x110000; &#99999999; &#xD800;","offers":{"price":"1690","priceCurrency":"UYU"}}</script>';
    const result = await searchWith("https://x.test/p", (u) => html(u, body));
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.stats.products).toBe((await shirts()) + 1);
    const odd = result.items.find((i) => i.product.url === "https://x.test/p");
    // Las entidades inválidas quedan como texto: nada se inventa ni se rompe.
    if (odd) expect(odd.product.title).toContain("&#x110000;");
  });

  it("falla un candidato (error inesperado o red): cuenta como falla y los demás siguen", async () => {
    for (const error of [new Error("algo raro"), new TypeError("fetch failed")]) {
      const result = await searchWith("https://x.test/p", () => {
        throw error;
      });
      expect(result.stats.failed).toBe(1);
      expect(result.items.length).toBeGreaterThan(0);
    }
  });

  it("timeout: la tienda lenta cuenta como falla y los demás siguen", async () => {
    const result = await searchWith("https://x.test/p", () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    expect(result.stats.failed).toBe(1);
    expect(result.stats.products).toBe(await shirts());
  });
});

describe("nunca inventar: precio, stock y talle", () => {
  const base = FIXTURE_PRODUCTS.find((p) => p.id === "mock-oxford-crudo")!;

  it("una revalidación fallida deja UNKNOWN el producto y cada talle, con la fecha de antes", async () => {
    const product = { ...base, fetched_at: "2025-12-01T00:00:00.000Z" };
    expect(product.variants.map((v) => v.availability)).toContain("IN_STOCK");
    const failed = await refreshProduct(product, {
      fetcher: {
        name: "caida",
        fetch: async () => {
          throw new TypeError("fetch failed");
        },
      },
    });
    expect(failed.product.availability).toBe("UNKNOWN");
    expect(failed.product.variants.every((v) => v.availability === "UNKNOWN")).toBe(true);
    expect(failed.product.fetched_at).toBe(product.fetched_at);
    // El ranking ya no dice "tu talle en stock" con un dato que no se pudo verificar.
    const [ranked] = rankProducts([failed.product], query({ size: "M" }));
    expect(ranked?.size_status).not.toBe("AVAILABLE");
  });

  it("una variante en otra moneda (ARS) no hereda la del producto: queda sin precio", () => {
    const raw: RawProduct = {
      url: "https://tienda.com.uy/p/1",
      canonicalUrl: null,
      externalId: null,
      sku: null,
      title: "Camisa Oxford - Celeste",
      brand: null,
      description: null,
      imageUrl: null,
      price: "1690",
      currency: "UYU",
      availability: "InStock",
      color: null,
      material: null,
      category: null,
      variants: [
        {
          id: "a",
          sku: null,
          size: "M",
          color: null,
          availability: "InStock",
          price: "25000",
          currency: "ARS",
        },
        {
          id: "b",
          sku: null,
          size: "L",
          color: null,
          availability: "InStock",
          price: "1790",
          currency: null,
        },
      ],
      regions: [],
      inStore: null,
      audience: null,
      sources: {},
    };
    const product = normalizeProduct(raw, {
      store: { name: "Tienda", domain: "tienda.com.uy" },
      fetchedAt: "2026-10-01T12:00:00.000Z",
    })!;
    expect(product.variants.find((v) => v.size === "M")?.price).toBeNull();
    expect(product.variants.find((v) => v.size === "L")?.price).toEqual({
      amount: 1790,
      currency: "UYU",
    });
  });

  it("'Calce' es el fit, no el talle (Shopify)", () => {
    const variants = parseShopifyProduct(
      {
        handle: "jean-recto",
        options: ["Calce", "Talle"],
        variants: [
          { id: 1, option1: "Slim", option2: "42", available: true, price: 199000 },
          { id: 2, option1: "Regular", option2: "44", available: false, price: 199000 },
        ],
      },
      "jean-recto",
    );
    expect(variants.map((v) => v.size)).toEqual(["42", "44"]);
  });

  it("Fenicio sin etiqueta visible: un código interno no se toma como talle", () => {
    const list = (cpre: string) =>
      `<ul id="lstTalles"><li data-stock="disponible"><input type="radio" name="sku" value="SKU1" data-cpre="${cpre}" data-stock="3"><b></b></li></ul>`;
    expect(parseFenicioSizes(list("0135247710301"))?.[0]?.size).toBeNull();
    expect(parseFenicioSizes(list("M"))?.[0]?.size).toBe("M");
  });
});
