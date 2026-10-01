import { describe, expect, it } from "vitest";

import {
  currencyInText,
  inferCategory,
  inferColors,
  inferFit,
  inferMaterials,
  normalizeAvailability,
  normalizeProductResult,
  parseCurrency,
  parsePrice,
  type RawProduct,
} from "../src";

const raw = (overrides: Partial<RawProduct> = {}): RawProduct => ({
  url: "https://tienda.com.uy/p/1",
  externalId: null,
  title: "Camisa Oxford - Celeste",
  brand: null,
  description: null,
  imageUrl: "https://tienda.com.uy/img.jpg",
  price: "1690",
  currency: "UYU",
  availability: null,
  color: null,
  material: null,
  category: null,
  variants: [],
  sources: {},
  ...overrides,
});
const context = {
  store: { name: "Tienda", domain: "tienda.com.uy" },
  fetchedAt: "2026-10-01T12:00:00.000Z",
};

describe("precios con formato local", () => {
  it.each([
    ["1.890,00", 1890],
    ["1,890.00", 1890],
    ["6.390", 6390],
    ["1,499", 1499],
    ["UYU 1.690", 1690],
    ["$ 3.890", 3890],
    ["U$S 49,90", 49.9],
    ["1.234.567", 1234567],
    ["4690.00", 4690],
    ["1490.000", 1490],
    ["12,5", 12.5],
    ["0.500", 0.5],
    ["2190", 2190],
    [1499.0, 1499],
    [899, 899],
  ])("%s → %s", (input, expected) => {
    expect(parsePrice(input)).toBe(expected);
  });

  it.each([["0"], [0], ["consultar"], [""], ["1,2.3,4"], [-10], [null], ["1.23.4"]])(
    "%s → sin precio",
    (input) => {
      expect(parsePrice(input)).toBeNull();
    },
  );

  it("moneda declarada o escrita junto al precio; un $ solo no alcanza", () => {
    expect(parseCurrency("UYU")).toBe("UYU");
    expect(parseCurrency("$U")).toBe("UYU");
    expect(parseCurrency("U$S")).toBe("USD");
    expect(parseCurrency("ARS")).toBeNull();
    expect(currencyInText("UYU 1.690")).toBe("UYU");
    expect(currencyInText("U$S 49")).toBe("USD");
    expect(currencyInText("$ 1.690")).toBeNull();
  });
});

describe("categorías con plurales y términos de Uruguay", () => {
  it.each([
    ["Championes negros", "SHOES"],
    ["Remeras básicas", "T_SHIRT"],
    ["Pantalones sastreros", "PANTS"],
    ["Polo tejido", "T_SHIRT"],
    ["Cadena plateada", "JEWELRY"],
    ["Musculosa", "TOP"],
    ["Buzo canguro con capucha", "KNITWEAR"],
    ["Campera puffer", "OUTERWEAR"],
    ["Pollera midi", "SKIRT"],
    ["Bermuda de lino", "SHORTS"],
    ["Anillo de plata", "JEWELRY"],
    ["Lentes de sol", "EYEWEAR"],
    ["Botines de cuero", "SHOES"],
    ["Mocasines", "SHOES"],
    ["Sobrecamisa jean azul", "OUTERWEAR"],
    ["Camisa de jean", "SHIRT"],
    ["Pantalón de jean recto", "JEANS"],
    ["T-shirt oversize", "T_SHIRT"],
    ["Saco tejido", "KNITWEAR"],
    ["Reloj despertador multicolor", "OTHER"],
    ["Almohadón interior", "OTHER"],
    ["Medias pack x3", "OTHER"],
  ] as const)("%s → %s", (title, category) => {
    expect(inferCategory({ title, category: null })).toBe(category);
  });

  it("si el título no dice nada, usa la categoría o las migas de la tienda", () => {
    expect(inferCategory({ title: "Modelo Valentín", category: "Hombre / Bermudas" })).toBe(
      "SHORTS",
    );
    expect(inferCategory({ title: "x", category: "SHIRT" })).toBe("SHIRT");
  });
});

describe("fit, colores y materiales", () => {
  it("fit solo cuando es explícito", () => {
    expect(inferFit("Jean slim fit", null)).toBe("slim");
    expect(inferFit("Pantalón recto chino", null)).toBe("recto");
    expect(inferFit("Remera oversized", null)).toBe("oversize");
    expect(inferFit("Bermuda relaxed", null)).toBe("relajado");
    expect(inferFit("Pantalón Wide Leg", null)).toBe("ancho");
    expect(inferFit("Camiseta", "Camiseta modelo Slim de manga larga")).toBe("slim");
    expect(inferFit("Campera", "Corte entallado con elastano")).toBe("slim");
    expect(inferFit("Camisa", "Regular fit, cuello italiano")).toBe("regular");
    // "fit cómodo", "mejor ajuste" o "recto" sin contexto no son un fit.
    expect(inferFit("Campera bomber", "Cuello baseball y fit cómodo, mejor ajuste")).toBeNull();
    expect(inferFit("Camisa", "Bolsillo recto en el pecho")).toBeNull();
  });

  it("colores del vocabulario, en español", () => {
    expect(inferColors([], "CAMISETA BÁSICA - GRIS OSCURO")).toEqual(["gris"]);
    expect(inferColors([], "Pantalón Adidas - Negro - Blanco")).toEqual(["negro", "blanco"]);
    expect(inferColors([], "CAMPERA BOMBER CHARGE - Black")).toEqual(["negro"]);
    expect(inferColors([], "Camisa Oxford - Ensign Blue Stripes:STRIPES")).toEqual(["azul"]);
    expect(inferColors([], "Pantalón Haries - Verde Oliva")).toEqual(["verde oliva", "verde"]);
    expect(inferColors([], "CAMISA MANGA LARGA CELESTE CON RAYAS BLANCAS")).toEqual([
      "celeste",
      "blanco",
    ]);
    // Nombre de fantasía: sin dato (no se puede comparar), no un color inventado.
    expect(inferColors([], "SOBRECAMISA VESTERBRO - Forest River")).toEqual([]);
    // Lo declarado por la tienda manda.
    expect(inferColors(["Navy"], "Remera - Blanco")).toEqual(["azul marino"]);
  });

  it("materiales declarados o nombrados; 'jean' en la descripción no es material", () => {
    expect(inferMaterials([], "Camisa de lino", null)).toEqual(["lino"]);
    expect(inferMaterials([], "Campera", "Composición: 50% Poliéster, 50% Algodón")).toEqual([
      "algodón",
      "poliéster",
    ]);
    expect(inferMaterials([], "Camisa", "Ideal para combinar con un jean")).toEqual([]);
    expect(inferMaterials([], "Campera de eco cuero", null)).toEqual(["cuero sintético"]);
    expect(inferMaterials(["100% cotton"], "Remera de lino", null)).toEqual(["algodón"]);
  });

  it("disponibilidad de schema.org y de OpenGraph", () => {
    expect(normalizeAvailability("http://schema.org/InStock")).toBe("IN_STOCK");
    expect(normalizeAvailability("in stock")).toBe("IN_STOCK");
    expect(normalizeAvailability("out of stock")).toBe("OUT_OF_STOCK");
    expect(normalizeAvailability("preorder")).toBe("UNKNOWN");
  });
});

describe("normalizeProductResult", () => {
  it("producto completo, con fecha de verificación", () => {
    const result = normalizeProductResult(raw({ price: "UYU 1.690", currency: null }), context);
    expect(result.ok && result.product).toMatchObject({
      id: "https://tienda.com.uy/p/1",
      category: "SHIRT",
      colors: ["celeste"],
      price: { amount: 1690, currency: "UYU" },
      availability: "UNKNOWN",
      fetched_at: "2026-10-01T12:00:00.000Z",
    });
  });

  it("dice por qué descarta: sin título, sin precio o moneda no soportada", () => {
    expect(normalizeProductResult(raw({ title: " " }), context)).toEqual({
      ok: false,
      reason: "no_title",
    });
    expect(normalizeProductResult(raw({ price: "0" }), context)).toEqual({
      ok: false,
      reason: "no_price",
    });
    expect(normalizeProductResult(raw({ price: null }), context)).toEqual({
      ok: false,
      reason: "no_price",
    });
    expect(normalizeProductResult(raw({ currency: "ARS" }), context)).toEqual({
      ok: false,
      reason: "unsupported_currency",
    });
    // "$ 1.690" sin moneda declarada: no se supone UYU.
    expect(normalizeProductResult(raw({ price: "$ 1.690", currency: null }), context)).toEqual({
      ok: false,
      reason: "unsupported_currency",
    });
  });

  it("ids de variante estables: de la plataforma o SKU, nunca el índice", () => {
    const variants: RawProduct["variants"] = [
      {
        id: "111",
        sku: "A-S",
        size: "S",
        color: null,
        availability: "InStock",
        price: "1690",
        currency: null,
      },
      {
        id: null,
        sku: "A-M",
        size: "M",
        color: "Black",
        availability: "OutOfStock",
        price: null,
        currency: null,
      },
      {
        id: null,
        sku: null,
        size: "L",
        color: null,
        availability: "InStock",
        price: null,
        currency: null,
      },
      {
        id: "111",
        sku: "dup",
        size: "S",
        color: null,
        availability: null,
        price: null,
        currency: null,
      },
    ];
    const first = normalizeProductResult(raw({ variants }), context);
    const reordered = normalizeProductResult(raw({ variants: [...variants].reverse() }), context);
    const ids = (r: typeof first) => (r.ok ? r.product.variants.map((v) => v.id).sort() : []);
    expect(ids(first)).toEqual(["111", "A-M"]);
    expect(ids(reordered)).toEqual(ids(first));
    expect(first.ok && first.product.variants.find((v) => v.id === "A-M")).toMatchObject({
      sku: "A-M",
      color: "negro",
      availability: "OUT_OF_STOCK",
      price: null,
    });
  });
});
