import { buildShoppingQueries, EMPTY_USER_SIZES, type Product } from "@asesor/shared";
import { FIXTURE_LOOK_SPECS, FIXTURE_PRODUCTS } from "@asesor/shared/fixtures";
import { describe, expect, it } from "vitest";

import {
  extractProduct,
  type FetchedPage,
  forAudience,
  normalizeProduct,
  rankProducts,
} from "../src";

/**
 * Público que declara la página (paso 11). En la prueba real del paso 10b apareció una camisa
 * de mujer (Indian) recomendada a un perfil de hombre: además del registro de tiendas, cada
 * producto trae el público que dice su página y el ranking descarta el otro.
 */

const PRODUCT_MICRODATA = `
  <div itemscope itemtype="http://schema.org/Product">
    <h1 itemprop="name">Camisa Xavro - Crudo / Natural</h1>
    <div itemprop="offers" itemscope itemtype="http://schema.org/Offer">
      <meta itemprop="price" content="1399"><meta itemprop="priceCurrency" content="UYU">
      <link itemprop="availability" href="http://schema.org/InStock">
    </div>
  </div>`;

const page = (body: string): FetchedPage => ({
  url: "https://tienda.com.uy/catalogo/camisa_1",
  status: 200,
  contentType: "text/html; charset=utf-8",
  body: `<html><head></head><body>${body}${PRODUCT_MICRODATA}</body></html>`,
  fetchedAt: "2026-10-01T12:00:00.000Z",
});
const ld = (value: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
const audienceOf = (body: string) => extractProduct(page(body))?.audience;

describe("extracción del público que declara la página", () => {
  it("la tienda entera es de mujer (Indian: Organization en JSON-LD)", () => {
    const body = ld({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Indian",
      alternateName: "Indian | Tienda de Ropa para Mujer",
      description:
        "Descubre la mejor tienda de ropa para las mujeres uruguayas. Contamos con las últimas tendencias de la moda en un solo lugar.",
    });
    expect(audienceOf(body)).toBe("WOMEN");
  });

  it('la sección del producto en Fenicio (Guapa: "seccion":"Hombre")', () => {
    const body = `<script>var producto = {"sale":false,"outlet":false,"nuevo":true,"carac":{"seccion":"Hombre"}};</script>`;
    expect(audienceOf(body)).toBe("MEN");
  });

  it("schema.org: audience.suggestedGender y gender", () => {
    expect(
      audienceOf(
        ld({
          "@type": "Product",
          name: "Camisa",
          audience: { "@type": "PeopleAudience", suggestedGender: "female" },
          offers: { price: "1", priceCurrency: "UYU" },
        }),
      ),
    ).toBe("WOMEN");
    expect(audienceOf(ld({ "@type": "Product", name: "Camisa", gender: "Male" }))).toBe("MEN");
  });

  it("las migas de pan (JSON-LD y microdata de Fenicio)", () => {
    expect(
      audienceOf(
        ld({
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Inicio" },
            { "@type": "ListItem", position: 2, name: "Hombre" },
            { "@type": "ListItem", position: 3, name: "Camisas" },
            { "@type": "ListItem", position: 4, name: "Camisa Xavro" },
          ],
        }),
      ),
    ).toBe("MEN");
    expect(
      audienceOf(
        `<span itemscope itemtype="http://data-vocabulary.org/Breadcrumb"><span itemprop="title">Mujer</span></span>`,
      ),
    ).toBe("WOMEN");
  });

  it("el producto manda sobre la tienda, y unisex es unisex", () => {
    const store = ld({ "@type": "Organization", alternateName: "Tienda de Ropa para Mujer" });
    expect(audienceOf(`${store}<script>{"carac":{"seccion":"Unisex"}}</script>`)).toBe("UNISEX");
    expect(audienceOf(`${store}<script>{"carac":{"seccion":"Hombre"}}</script>`)).toBe("MEN");
  });

  it("si no lo dice, o la tienda vende a los dos (Hering), no se inventa: null", () => {
    expect(audienceOf("")).toBeNull();
    expect(
      audienceOf(ld({ "@type": "Organization", description: "Ropa de Hombre & Ropa de Mujer" })),
    ).toBeNull();
    // Una palabra suelta no alcanza: "menú" no es "men", "Hermano" no es "hombre".
    expect(
      audienceOf(ld({ "@type": "Organization", description: "Menú · Hermanos Pérez" })),
    ).toBeNull();
  });

  it("llega al producto normalizado", () => {
    const raw = extractProduct(page(`<script>{"carac":{"seccion":"Mujer"}}</script>`))!;
    const product = normalizeProduct(raw, {
      store: { name: "Tienda", domain: "tienda.com.uy" },
      fetchedAt: "2026-10-01T12:00:00.000Z",
    });
    expect(product?.audience).toBe("WOMEN");
  });
});

describe("el ranking descarta el otro público", () => {
  const [query] = buildShoppingQueries(FIXTURE_LOOK_SPECS[0], {
    sizes: EMPTY_USER_SIZES,
    audience: "MEN",
  }).map((q) => q.query);
  const shirt = (id: string, audience: Product["audience"]): Product => ({
    ...FIXTURE_PRODUCTS[0]!,
    id,
    url: `https://tienda.com.uy/p/${id}`,
    audience,
  });

  it("de mujer afuera en una búsqueda de hombre; unisex o sin dato, adentro", () => {
    const pool = [
      shirt("mujer", "WOMEN"),
      shirt("hombre", "MEN"),
      shirt("unisex", "UNISEX"),
      shirt("sin-dato", null),
    ];
    const ids = rankProducts(pool, query!).map((r) => r.product.id);
    expect(ids).not.toContain("mujer");
    expect(ids.sort()).toEqual(["hombre", "sin-dato", "unisex"]);
    expect(forAudience(shirt("mujer", "WOMEN"), { ...query!, audience: null })).toBe(true);
  });
});
