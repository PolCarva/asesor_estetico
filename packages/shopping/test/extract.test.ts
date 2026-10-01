import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { extractProduct, type FetchedPage, normalizeProduct, parseHtml } from "../src";

const page = (name: string, url: string, status = 200): FetchedPage => ({
  url,
  status,
  contentType: "text/html; charset=utf-8",
  body: readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"),
  fetchedAt: "2026-10-01T12:00:00.000Z",
});

const normalize = (p: FetchedPage) => {
  const raw = extractProduct(p);
  if (!raw) throw new Error("sin producto");
  const product = normalizeProduct(raw, {
    store: { name: "Tienda", domain: new URL(p.url).hostname },
    fetchedAt: p.fetchedAt,
  });
  return { raw, product };
};

describe("cascada de extracción con páginas reales grabadas", () => {
  it("Fenicio (Legacy): microdata, imagen relativa al protocolo y moneda declarada", () => {
    const { raw, product } = normalize(
      page(
        "fenicio-legacy-producto.html",
        "https://legacy.com.uy/catalogo/camisa-lisa-de-lino-cuello-mao-arena_L309A96_ARENA",
      ),
    );
    expect(raw.sources).toMatchObject({
      title: "microdata",
      price: "microdata",
      currency: "microdata",
      availability: "microdata",
      imageUrl: "microdata",
    });
    expect(product).toMatchObject({
      title: "CAMISA LISA DE LINO CUELLO MAO - Arena",
      brand: "Legacy",
      price: { amount: 2190, currency: "UYU" },
      availability: "IN_STOCK",
      category: "SHIRT",
      colors: ["arena"],
      materials: ["lino"],
      image_url: expect.stringMatching(/^https:\/\/f\.fcdn\.app\/.+\.jpg$/),
    });
    // El <br /> de la descripción no deja etiquetas ni espacios dobles.
    expect(product?.description).toMatch(/bermudas\. El modelo mide/);
  });

  it("Fenicio (Hering): fit explícito en la descripción ('modelo Slim')", () => {
    const { product } = normalize(
      page(
        "fenicio-hering-producto.html",
        "https://www.hering.com.uy/catalogo/camiseta-basica-unissex-blanco_N204_N0A00S",
      ),
    );
    expect(product).toMatchObject({
      category: "T_SHIRT",
      fit: "slim",
      colors: ["blanco"],
      price: { amount: 799, currency: "UYU" },
    });
  });

  it("VTEX (Adidas): JSON-LD con AggregateOffer → variantes por SKU y 'alguna disponible'", () => {
    const { raw, product } = normalize(
      page(
        "vtex-adidas-producto.html",
        "https://www.adidas.com.uy/remera-essentials-logo-adkc0917/p",
      ),
    );
    expect(raw.sources.title).toBe("jsonld");
    // La categoría no está en el JSON-LD: la completa OpenGraph (product:category).
    expect(raw.sources.category).toBe("opengraph");
    expect(product).toMatchObject({
      title: "Remera Essentials Logo",
      brand: "Adidas",
      category: "T_SHIRT",
      price: { amount: 1490, currency: "UYU" },
      availability: "IN_STOCK",
    });
    expect(product?.variants.map((v) => [v.id, v.availability])).toEqual([
      ["00029253", "IN_STOCK"],
      ["00029269", "IN_STOCK"],
      ["00029222", "IN_STOCK"],
      ["00029237", "OUT_OF_STOCK"],
      ["00029206", "OUT_OF_STOCK"],
    ]);
  });

  it("VTEX FastStore (BAS): migas de pan como categoría y precio OpenGraph 0 ignorado", () => {
    const { raw, product } = normalize(
      page("vtex-bas-producto.html", "https://www.bas.com.uy/sobrecamisa-jean-azul-1000481678/p"),
    );
    expect(raw.category).toBe("MUJER / ABRIGOS");
    expect(product).toMatchObject({
      title: "SOBRECAMISA JEAN AZUL",
      category: "OUTERWEAR", // "sobrecamisa" aparece antes que "jean"
      price: { amount: 899, currency: "UYU" },
      availability: "OUT_OF_STOCK",
      colors: ["azul"],
    });
  });

  it("Shopify (Jack & Jones): un Offer por variante con id de Shopify, entidades decodificadas", () => {
    const { product } = normalize(
      page("shopify-jackjones-producto.html", "https://jackjones.com.uy/products/12268608_4644861"),
    );
    expect(product).toMatchObject({
      title: "CAMPERA BOMBER CHARGE - Black",
      brand: "JACK & JONES",
      category: "OUTERWEAR",
      colors: ["negro"],
      price: { amount: 1499, currency: "UYU" },
      availability: "IN_STOCK",
    });
    expect(product?.variants[0]).toMatchObject({
      id: "50765850411300", // ?variant= de Shopify
      sku: "5715672094794",
      availability: "IN_STOCK",
      price: { amount: 1499, currency: "UYU" },
    });
    expect(product?.variants[1]?.availability).toBe("OUT_OF_STOCK");
  });

  it("Shopify (Decathlon): ProductGroup con hasVariant, precio de una variante disponible", () => {
    const { raw, product } = normalize(
      page(
        "shopify-decathlon-producto.html",
        "https://decathlon.com.uy/products/chaqueta-impermeable-montana-y-trekking-mujer-quechua-mh500",
      ),
    );
    expect(raw.externalId).toBe("14999721771378");
    expect(product?.id).toBe("14999721771378");
    // La variante más barata (4690) disponible es "S / ROJO"; la de 4690 en XS está agotada.
    expect(product?.price).toEqual({ amount: 4690, currency: "UYU" });
    expect(product?.availability).toBe("IN_STOCK");
    expect(product?.category).toBe("OUTERWEAR");
    // El grupo no trae imagen propia: se usa la de la primera variante.
    expect(product?.image_url).toMatch(/^https:\/\/decathlon\.com\.uy\/cdn\/shop\/files\//);
    expect(product?.variants).toHaveLength(6);
    expect(product?.variants.map((v) => v.id)).toContain("61651623248242");
  });

  it("OpenGraph como último recurso: precio con punto de miles ('6.390')", () => {
    const { raw, product } = normalize(
      page(
        "opengraph-decathlon-producto.html",
        "https://decathlon.com.uy/products/chaqueta-impermeable-montana-y-trekking-mujer-quechua-mh500",
      ),
    );
    expect(new Set(Object.values(raw.sources))).toEqual(new Set(["opengraph"]));
    expect(product).toMatchObject({
      title: "Campera impermeable de senderismo mujer mh500",
      price: { amount: 6390, currency: "UYU" },
      availability: "UNKNOWN", // OpenGraph no dice stock: no se inventa
      image_url: expect.stringMatching(/^https:\/\//),
    });
  });

  it("página de categoría, 404 o JSON-LD roto → no es un producto", () => {
    expect(
      extractProduct(
        page("fenicio-legacy-categoria.html", "https://legacy.com.uy/catalogo?q=camisa"),
      ),
    ).toBeNull();
    expect(
      extractProduct(page("fenicio-legacy-producto.html", "https://legacy.com.uy/x", 404)),
    ).toBeNull();
    const broken: FetchedPage = {
      url: "https://x.com.uy/p",
      status: 200,
      contentType: "text/html",
      body: '<script type="application/ld+json">{"@type":"Product", roto</script>',
      fetchedAt: "",
    };
    expect(extractProduct(broken)).toBeNull();
  });

  it("un listado con varios Product en JSON-LD no se toma como producto", () => {
    const items = ["Camisa A", "Camisa B", "Camisa C"].map((name) => ({
      "@type": "Product",
      name,
      offers: { price: 1000, priceCurrency: "UYU" },
    }));
    const listing: FetchedPage = {
      url: "https://x.com.uy/camisas",
      status: 200,
      contentType: "text/html",
      body: `<script type="application/ld+json">${JSON.stringify({ "@graph": items })}</script>`,
      fetchedAt: "",
    };
    expect(extractProduct(listing)).toBeNull();
  });
});

describe("parseHtml", () => {
  it("microdata anidada, valores por atributo y texto, y metas", () => {
    const data = parseHtml(`
      <meta property="og:type" content="product">
      <div itemscope itemtype="https://schema.org/Product">
        <h1 itemprop="name">Buzo <b>canguro</b> &amp; capucha</h1>
        <div itemprop="brand" itemscope itemtype="https://schema.org/Brand"><span itemprop="name">Marca</span></div>
        <span itemprop="price" content="1690">UYU 1.690</span>
        <a itemprop="url" href="/p/1">ver</a>
        <script>var itemprop = "no";</script>
      </div>`);
    expect(data.meta.get("og:type")).toEqual(["product"]);
    const [item] = data.items;
    expect(item?.props.get("name")).toEqual(["Buzo canguro & capucha"]);
    expect(item?.props.get("price")).toEqual(["1690"]);
    expect(item?.props.get("url")).toEqual(["/p/1"]);
    const brand = item?.props.get("brand")?.[0];
    expect(typeof brand === "object" && brand.props.get("name")).toEqual(["Marca"]);
  });
});
