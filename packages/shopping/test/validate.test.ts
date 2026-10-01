import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ProductSchema } from "@asesor/shared";
import { FIXTURE_IN_STORE_PRODUCT, FIXTURE_PRODUCTS } from "@asesor/shared/fixtures";
import { describe, expect, it } from "vitest";

import {
  canonicalProductUrl,
  type CandidateUrl,
  extractProduct,
  type FetchedPage,
  loadCandidate,
  MockProductFetcher,
  type ProductFetcher,
  sellsInUruguay,
  validateProduct,
} from "../src";

const fixture = (name: string) =>
  readFileSync(resolve(import.meta.dirname, "fixtures", name), "utf8");

const page = (url: string, body: string, finalUrl = url): FetchedPage => ({
  url: finalUrl,
  status: 200,
  contentType: "text/html",
  body,
  fetchedAt: "2026-10-01T12:00:00.000Z",
});

/** Página mínima con JSON-LD Product. */
function productPage(offer: Record<string, unknown>, extra: unknown[] = []) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Camisa de lino arena",
    offers: { "@type": "Offer", ...offer },
  };
  return `<html><head>${[jsonLd, ...extra]
    .map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`)
    .join("")}</head><body></body></html>`;
}

const load = (candidate: CandidateUrl, body: string, finalUrl?: string) => {
  const fetcher: ProductFetcher = {
    name: "fixture",
    fetch: async (url) => page(url, body, finalUrl ?? url),
  };
  return loadCandidate(candidate, { fetcher });
};

describe("URL canónica", () => {
  it("saca tracking, variante, fragmento y `/` final; host en minúsculas", () => {
    expect(
      canonicalProductUrl(
        "https://Tienda.com.uy/catalogo/camisa_123/?utm_source=ig&utm_medium=x&fbclid=1&gclid=2&_pos=1&_sid=a&_ss=r&variant=55&srsltid=z#reviews",
      ),
    ).toBe("https://tienda.com.uy/catalogo/camisa_123");
    // Parámetros que identifican la página se conservan.
    expect(canonicalProductUrl("https://tienda.com.uy/producto.php?id=9&utm_campaign=x")).toBe(
      "https://tienda.com.uy/producto.php?id=9",
    );
  });

  it("usa `<link rel=canonical>` solo si es de la misma tienda y no es una ruta interna", () => {
    const url = "https://jackjones.com.uy/collections/camisas/products/x?variant=1";
    expect(canonicalProductUrl(url, "https://jackjones.com.uy/products/x")).toBe(
      "https://jackjones.com.uy/products/x",
    );
    expect(canonicalProductUrl(url, "/products/x")).toBe("https://jackjones.com.uy/products/x");
    expect(canonicalProductUrl(url, "https://otra.com/products/x")).toBe(
      "https://jackjones.com.uy/collections/camisas/products/x",
    );
    expect(canonicalProductUrl(url, "https://jackjones.com.uy/")).toBe(
      "https://jackjones.com.uy/collections/camisas/products/x",
    );
    expect(
      canonicalProductUrl(
        "https://www.adidas.com.uy/remera/p",
        "https://www.adidas.com.uy/_v/segment/routing/vtex.store@2.x/product/1/remera/p",
      ),
    ).toBe("https://www.adidas.com.uy/remera/p");
  });

  it("el producto queda con la URL canónica (real: canonical de Woo, con `/` final)", async () => {
    const url =
      "https://www.tiendasmontevideo.com.uy/product/pantalon-de-pijama-estampado-2/?utm_source=x";
    const outcome = await load(
      { url, store: { name: "Tiendas Montevideo", domain: "tiendasmontevideo.com.uy" } },
      fixture("woo-tiendasmontevideo-producto.html"),
    );
    if (outcome.status !== "product") throw new Error(outcome.status);
    expect(outcome.product.url).toBe(
      "https://www.tiendasmontevideo.com.uy/product/pantalon-de-pijama-estampado-2",
    );
  });
});

describe("Validate", () => {
  const store = { name: "Tienda", domain: "tienda.com.uy" };

  it("acepta un producto real de una tienda uruguaya", async () => {
    const outcome = await load(
      { url: "https://www.tienda.com.uy/p/1", store },
      productPage({
        price: 1690,
        priceCurrency: "UYU",
        availability: "https://schema.org/InStock",
      }),
    );
    expect(outcome.status).toBe("product");
  });

  it("rechaza si la página (después de redirects) es de otro dominio que la tienda", async () => {
    const outcome = await load(
      { url: "https://tienda.com.uy/p/1", store },
      productPage({ price: 1690, priceCurrency: "UYU" }),
      "https://otra-tienda.com.uy/p/1",
    );
    expect(outcome).toMatchObject({ status: "discarded", reason: "host_mismatch" });
  });

  it("rechaza monedas fuera de UYU/USD (EUR de zara.com/es, ARS)", async () => {
    for (const currency of ["EUR", "ARS"]) {
      const outcome = await load(
        { url: "https://tienda.com.uy/p/1", store },
        productPage({ price: 49.95, priceCurrency: currency }),
      );
      expect(outcome).toMatchObject({ status: "discarded", reason: "unsupported_currency" });
    }
  });

  it("rechaza precio ≤ 0 (BAS publica 0 en algunos agotados)", async () => {
    const outcome = await load(
      { url: "https://tienda.com.uy/p/1", store },
      productPage({ price: 0, priceCurrency: "UYU" }),
    );
    expect(outcome).toMatchObject({ status: "discarded", reason: "no_price" });

    const [product] = FIXTURE_PRODUCTS;
    const zero = { ...product!, price: { amount: 0, currency: "UYU" as const } };
    const p = page(product!.url, productPage({ price: 1, priceCurrency: "UYU" }));
    expect(
      validateProduct(zero, { store: product!.store, page: p, raw: extractProduct(p)! }),
    ).toEqual({ ok: false, reason: "invalid_price" });
  });

  it("rechaza tiendas que no venden en Uruguay: .com.ar en dólares sin evidencia", async () => {
    const foreign = { name: "Tienda AR", domain: "tienda.com.ar" };
    const outcome = await load(
      { url: "https://tienda.com.ar/p/1", store: foreign },
      productPage({ price: 49, priceCurrency: "USD" }),
    );
    expect(outcome).toMatchObject({ status: "discarded", reason: "foreign_store" });

    // La misma tienda, si declara que vende en Uruguay, pasa.
    const withRegion = await load(
      { url: "https://tienda.com.ar/p/1", store: foreign },
      productPage({
        price: 49,
        priceCurrency: "USD",
        eligibleRegion: { "@type": "Country", name: "UY" },
      }),
    );
    expect(withRegion.status).toBe("product");
  });

  it("rechaza tiendas bloqueadas (D7), aunque la página se haya podido leer", async () => {
    const zara = { name: "Zara", domain: "zara.com" };
    const outcome = await load(
      { url: "https://www.zara.com/uy/es/camisa-p1.html", store: zara },
      productPage({ price: 1990, priceCurrency: "UYU" }),
    );
    expect(outcome).toMatchObject({ status: "discarded", reason: "blocked_store" });
  });

  it("exige que título y precio salgan de la página descargada (nunca de un snippet)", () => {
    const [product] = FIXTURE_PRODUCTS;
    const p = page(product!.url, productPage({ price: 1890, priceCurrency: "UYU" }));
    const raw = extractProduct(p)!;
    expect(validateProduct(product!, { store: product!.store, page: p, raw })).toEqual({
      ok: true,
    });
    expect(
      validateProduct(product!, { store: product!.store, page: p, raw: { ...raw, sources: {} } }),
    ).toEqual({ ok: false, reason: "not_extracted" });
  });

  it("evidencias de que vende en Uruguay", () => {
    const usd = { price: { amount: 10, currency: "USD" as const } };
    const uyu = { price: { amount: 10, currency: "UYU" as const } };
    expect(sellsInUruguay("uy.hm.com", usd, { regions: [] })).toBe(true); // registro
    expect(sellsInUruguay("boutique.com.uy", usd, { regions: [] })).toBe(true); // .uy
    expect(sellsInUruguay("boutique.com", uyu, { regions: [] })).toBe(true); // pesos uruguayos
    expect(sellsInUruguay("boutique.com", usd, { regions: ["Uruguay"] })).toBe(true);
    expect(sellsInUruguay("boutique.com", usd, { regions: ["AR"] })).toBe(false);
  });

  it("og:locale es_UY también cuenta como evidencia", async () => {
    const body = productPage({ price: 30, priceCurrency: "USD" }).replace(
      "<head>",
      '<head><meta property="og:locale" content="es_UY">',
    );
    const outcome = await load(
      { url: "https://boutique.com/p/1", store: { name: "Boutique", domain: "boutique.com" } },
      body,
    );
    expect(outcome.status).toBe("product");
  });
});

describe("IN_STORE_ONLY: locales sin ecommerce", () => {
  const store = { name: "Sombrerería", domain: "sombrereria.com.uy" };
  const local = {
    "@type": "Store",
    name: "Sombrerería Centro",
    telephone: "+598 2900 0000",
    url: "https://sombrereria.com.uy/contacto",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Av. 18 de Julio 1234",
      addressLocality: "Montevideo",
      addressCountry: "UY",
    },
  };

  it("sin precio: se muestra con ubicación y contacto, y precio null", async () => {
    const outcome = await load(
      { url: "https://sombrereria.com.uy/sombrero", store },
      productPage({ availability: "https://schema.org/InStoreOnly", availableAtOrFrom: local }),
    );
    if (outcome.status !== "product") throw new Error(JSON.stringify(outcome));
    expect(outcome.product).toMatchObject({
      availability: "IN_STORE_ONLY",
      price: null,
      in_store: {
        address: "Av. 18 de Julio 1234",
        locality: "Montevideo",
        phone: "+598 2900 0000",
        contact_url: "https://sombrereria.com.uy/contacto",
      },
    });
  });

  it("con precio: lo conserva; el local puede venir de un LocalBusiness de la página", async () => {
    const outcome = await load(
      { url: "https://sombrereria.com.uy/sombrero", store },
      productPage({ price: "2.490", priceCurrency: "UYU", availability: "InStoreOnly" }, [
        { ...local, "@type": "ClothingStore" },
      ]),
    );
    if (outcome.status !== "product") throw new Error(JSON.stringify(outcome));
    expect(outcome.product.price).toEqual({ amount: 2490, currency: "UYU" });
    expect(outcome.product.in_store?.address).toBe("Av. 18 de Julio 1234");
  });

  it("sin ubicación publicada: no se inventa; el contacto es la página del producto", async () => {
    const outcome = await load(
      { url: "https://sombrereria.com.uy/sombrero", store },
      productPage({ availability: "https://schema.org/InStoreOnly" }),
    );
    if (outcome.status !== "product") throw new Error(JSON.stringify(outcome));
    expect(outcome.product.in_store).toEqual({
      address: null,
      locality: null,
      phone: null,
      contact_url: "https://sombrereria.com.uy/sombrero",
    });
  });

  it("solo un local físico puede no tener precio: online sin precio se descarta", async () => {
    const outcome = await load(
      { url: "https://sombrereria.com.uy/sombrero", store },
      productPage({ availability: "https://schema.org/InStock" }),
    );
    expect(outcome).toMatchObject({ status: "discarded", reason: "no_price" });
    expect(
      ProductSchema.safeParse({ ...FIXTURE_IN_STORE_PRODUCT, availability: "IN_STOCK" }).success,
    ).toBe(false);
    expect(ProductSchema.safeParse(FIXTURE_IN_STORE_PRODUCT).success).toBe(true);
  });

  it("el producto ficticio de local físico ida y vuelta por el mock (página → producto)", async () => {
    const fetcher = new MockProductFetcher([FIXTURE_IN_STORE_PRODUCT]);
    const outcome = await loadCandidate(
      { url: FIXTURE_IN_STORE_PRODUCT.url, store: FIXTURE_IN_STORE_PRODUCT.store },
      { fetcher },
    );
    if (outcome.status !== "product") throw new Error(JSON.stringify(outcome));
    expect(outcome.product).toMatchObject({
      availability: "IN_STORE_ONLY",
      price: null,
      in_store: FIXTURE_IN_STORE_PRODUCT.in_store,
    });
  });
});
