import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { type Garment, type Product, ProductSchema, ShoppingQuerySchema } from "@asesor/shared";
import { describe, expect, it } from "vitest";

import { colorDistance, DEFAULT_RANKING_WEIGHTS, rankProducts, sizeStatusFor } from "../src";

/** Pools reales grabados con el pipeline del paso 04b (ver `_fuente` en cada fixture). */
const pool = (name: string): Product[] =>
  (
    JSON.parse(readFileSync(resolve(import.meta.dirname, "fixtures", name), "utf8")) as {
      products: unknown[];
    }
  ).products.map((p) => ProductSchema.parse(p));

const remeras = pool("pool-remeras-negras.json");
const pantalones = pool("pool-pantalones.json");

const query = (garment: Garment, overrides: Record<string, unknown> = {}) =>
  ShoppingQuerySchema.parse({
    garment,
    country_code: "UY",
    size: null,
    max_price: null,
    limit: 20,
    ...overrides,
  });

const remeraNegraLisa: Garment = {
  category: "T_SHIRT",
  description: "remera negra lisa",
  color: { name: "negro", hex: "#111111" },
  fit: "regular",
  material: "algodón",
  pattern: null,
};

const pantalonRelaxed: Garment = {
  category: "PANTS",
  description: "pantalón sastrero gris relaxed",
  color: { name: "gris carbón", hex: "#4A4A4A" },
  fit: "relajado",
  material: "lana",
  pattern: null,
};

const titleAt = (ranked: ReturnType<typeof rankProducts>, title: string, price?: number) =>
  ranked.findIndex(
    (r) => r.product.title === title && (price === undefined || r.product.price?.amount === price),
  );

describe("ranking con productos reales", () => {
  it("los pesos suman 1 y la estética pesa bastante más que el precio", () => {
    const w = DEFAULT_RANKING_WEIGHTS;
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
    const aesthetic =
      w.category_match + w.visual_similarity + w.color_match + w.fit_match + w.material_match;
    expect(aesthetic).toBeGreaterThan(0.75);
    expect(aesthetic / w.price).toBeGreaterThan(15);
    expect(w.size_available + w.stock).toBeGreaterThan(w.price);
  });

  it("la remera negra lisa le gana a las estampadas aunque sea más cara", () => {
    const ranked = rankProducts(remeras, query(remeraNegraLisa), { diversity: 0 });
    const lisa = titleAt(ranked, "REMERA LISA DE ALGODÓN - Negro", 1290);
    const estampadaLegacy = titleAt(ranked, "REMERA ESTAMPADA DE ALGODÓN - Negro", 1190);
    const estampadaJj = titleAt(ranked, "REMERA MAINE ESTAMPADA-", 799);
    expect(lisa).toBeGreaterThanOrEqual(0);
    expect(lisa).toBeLessThan(estampadaLegacy);
    expect(lisa).toBeLessThan(estampadaJj);
    // El estampado se nota en la similitud de estilo, no solo en el total.
    expect(ranked[lisa]!.breakdown.visual_similarity).toBeGreaterThan(
      ranked[estampadaLegacy]!.breakdown.visual_similarity,
    );
    // Arriba quedan solo remeras negras sin estampa (lisas o básicas), todas en stock.
    for (const r of ranked.slice(0, 4)) {
      expect(r.product.title).not.toMatch(/ESTAMPADA/i);
      expect(r.product.colors).toContain("negro");
      expect(r.product.availability).toBe("IN_STOCK");
    }
  });

  it("el pantalón relaxed le gana al skinny (aunque el skinny tenga el talle 42)", () => {
    const sinTalle = rankProducts(pantalones, query(pantalonRelaxed), { diversity: 0 });
    const ancho = titleAt(sinTalle, "PANTALÓN ANCHO TIRO ALTO HUNTER - Charcoal Art");
    const skinny = titleAt(sinTalle, "PANTALÓN SKINNY CON SPANDEX - Gris");
    expect(ancho).toBeLessThan(skinny);
    expect(sinTalle[ancho]!.breakdown.fit_match).toBe(0.75); // ancho ≈ relajado
    expect(sinTalle[skinny]!.breakdown.fit_match).toBe(0); // skinny contradice relaxed
    // "Charcoal" es gris: el color coincide por nombre.
    expect(sinTalle[ancho]!.breakdown.color_match).toBe(1);

    const conTalle = rankProducts(pantalones, query(pantalonRelaxed, { size: "42" }), {
      diversity: 0,
    });
    expect(titleAt(conTalle, "PANTALÓN ANCHO TIRO ALTO HUNTER - Charcoal Art")).toBeLessThan(
      titleAt(conTalle, "PANTALÓN SKINNY CON SPANDEX - Gris"),
    );
  });

  it("el mismo pool con dos talles distintos da órdenes distintos", () => {
    const xs = rankProducts(remeras, query(remeraNegraLisa, { size: "XS" }), { diversity: 0 });
    const xxxxl = rankProducts(remeras, query(remeraNegraLisa, { size: "4XL" }), { diversity: 0 });
    const barata = (r: typeof xs) => titleAt(r, "REMERA LISA DE ALGODÓN - Negro", 637);
    const cara = (r: typeof xs) => titleAt(r, "REMERA LISA DE ALGODÓN - Negro", 1290);
    // XS: solo la de 637 lo tiene en stock; 4XL: solo la de 1290.
    expect(xs[barata(xs)]!.size_status).toBe("AVAILABLE");
    expect(xs[cara(xs)]!.size_status).toBe("NOT_OFFERED");
    expect(xxxxl[cara(xxxxl)]!.size_status).toBe("AVAILABLE");
    expect(xxxxl[barata(xxxxl)]!.size_status).toBe("NOT_OFFERED");
    expect(barata(xs)).toBeLessThan(cara(xs));
    expect(cara(xxxxl)).toBeLessThan(barata(xxxxl));
    expect(xs.map((r) => r.product.url)).not.toEqual(xxxxl.map((r) => r.product.url));
  });

  it("un producto con el talle del usuario en stock le gana a uno equivalente sin ese talle", () => {
    const [base] = remeras;
    const conTalle = {
      ...base!,
      url: `${base!.url}?con`,
      variants: [
        { ...base!.variants[0]!, size: "M", size_label: "M", availability: "IN_STOCK" as const },
      ],
    };
    const agotado = {
      ...base!,
      url: `${base!.url}?agotado`,
      variants: [{ ...conTalle.variants[0]!, availability: "OUT_OF_STOCK" as const }],
    };
    const sinDato = { ...base!, url: `${base!.url}?sin-dato`, variants: [] };
    const ranked = rankProducts(
      [sinDato, agotado, conTalle],
      query(remeraNegraLisa, { size: "M" }),
      {
        diversity: 0,
      },
    );
    expect(ranked.map((r) => [r.product.url.split("?")[1], r.size_status])).toEqual([
      ["con", "AVAILABLE"],
      ["sin-dato", "UNVERIFIED"],
      ["agotado", "OUT_OF_STOCK"],
    ]);
  });

  it("talle en otro sistema (42 EU contra cintura en pulgadas) queda sin verificar, no 'no lo tiene'", () => {
    const hunter = pantalones.find((p) => p.title.includes("HUNTER"))!;
    expect(sizeStatusFor(query(pantalonRelaxed, { size: "42" }), hunter)).toBe("UNVERIFIED");
    expect(sizeStatusFor(query(pantalonRelaxed, { size: "32" }), hunter)).toBe("AVAILABLE");
    expect(
      sizeStatusFor(query({ ...pantalonRelaxed, category: "WATCH" }, { size: "M" }), hunter),
    ).toBe("NOT_APPLICABLE");
    expect(sizeStatusFor(query(pantalonRelaxed), hunter)).toBe("NOT_REQUESTED");
  });

  it("precio: secundario, filtro estricto opcional y sin factor de precio cuando no hay", () => {
    const strict = rankProducts(
      remeras,
      query(remeraNegraLisa, {
        max_price: { amount: 700, currency: "UYU" },
        strict_max_price: true,
      }),
    );
    expect(strict.length).toBeGreaterThan(0);
    expect(strict.every((r) => r.product.price !== null && r.product.price.amount <= 700)).toBe(
      true,
    );

    const soft = rankProducts(
      remeras,
      query(remeraNegraLisa, { max_price: { amount: 700, currency: "UYU" } }),
    );
    expect(soft.length).toBeGreaterThan(strict.length);

    // El mismo producto sin precio publicado (local físico) se puntúa con los otros 7 factores.
    const [base] = remeras;
    const local = {
      ...base!,
      url: `${base!.url}?local`,
      price: null,
      availability: "IN_STORE_ONLY" as const,
    };
    const [ranked] = rankProducts([local], query(remeraNegraLisa));
    const w = DEFAULT_RANKING_WEIGHTS;
    const expected =
      (Object.entries(ranked!.breakdown) as Array<[keyof typeof w, number]>)
        .filter(([f]) => f !== "price")
        .reduce((sum, [f, v]) => sum + w[f] * v, 0) /
      (1 - w.price);
    expect(ranked!.score).toBeCloseTo(expected, 3);
  });

  it("color por cercanía cuando no coincide el nombre; colores desconocidos quedan neutros", () => {
    expect(colorDistance("#111111", "#111111")).toBe(0);
    expect(colorDistance("#111111", "#808080")!).toBeLessThan(colorDistance("#111111", "#F7F7F5")!);
    const ranked = rankProducts(remeras, query(remeraNegraLisa), { diversity: 0 });
    const verde = ranked.find((r) => r.product.title.includes("Lacoste"))!;
    expect(verde.breakdown.color_match).toBeLessThan(0.5);
    const loose = rankProducts(pantalones, query(pantalonRelaxed)).find((r) =>
      r.product.title.includes("Magical Forest"),
    )!;
    expect(loose.breakdown.color_match).toBe(0.5); // "magical forest" no es un color comparable
  });

  it("títulos reales de la prueba del paso 05: rayas en inglés y desert boots", () => {
    const [base] = remeras;
    const camisa = (title: string, colors: string[]) => ({
      ...base!,
      url: `${base!.url}?${encodeURIComponent(title)}`,
      title,
      category: "SHIRT" as const,
      colors,
      fit: "regular",
      materials: ["algodón"],
    });
    const oxfordCruda: Garment = {
      category: "SHIRT",
      description: "camisa oxford",
      color: { name: "crudo", hex: "#EFE8DA" },
      fit: "regular",
      material: "algodón",
      pattern: null,
    };
    const ranked = rankProducts(
      [
        camisa("CAMISA CLÁSICA REGULAR OXFORD - Crockery Stripes:STRIPES", [
          "crockery stripes:stripes",
        ]),
        camisa("CAMISA OXFORD LISA - Crudo", ["crudo"]),
      ],
      query(oxfordCruda),
      { diversity: 0 },
    );
    expect(ranked[0]!.product.title).toBe("CAMISA OXFORD LISA - Crudo");
    expect(ranked[1]!.breakdown.visual_similarity).toBeLessThan(0.5); // "Stripes" es estampado

    const botas = rankProducts(
      [
        {
          ...base!,
          url: `${base!.url}?botas`,
          title: "Botas Blundstone 562 - Crazy Horse Brown",
          category: "SHOES" as const,
        },
      ],
      query({
        category: "SHOES",
        description: "desert boots",
        color: { name: "chocolate", hex: "#4A3222" },
        fit: null,
        material: "gamuza",
        pattern: null,
      }),
    );
    // "desert boots" se lee como "botas" (los mismos alias que la búsqueda).
    expect(botas[0]!.breakdown.visual_similarity).toBe(1);
  });

  it("diversidad: una tienda no acapara el top cuando hay empates cercanos", () => {
    const strictOrder = rankProducts(remeras, query(remeraNegraLisa), { diversity: 0 });
    const diverse = rankProducts(remeras, query(remeraNegraLisa));
    const storesTop = (r: typeof diverse) =>
      new Set(r.slice(0, 3).map((x) => x.product.store.domain)).size;
    expect(storesTop(diverse)).toBeGreaterThanOrEqual(storesTop(strictOrder));
    // Mismos productos y mismos scores: solo cambia el orden.
    expect(new Set(diverse.map((r) => r.product.url))).toEqual(
      new Set(strictOrder.map((r) => r.product.url)),
    );
  });
});
