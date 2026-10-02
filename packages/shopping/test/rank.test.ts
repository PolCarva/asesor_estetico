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

  it("más barato (paso 09): estrictamente menor, entre monedas solo para filtrar, por parecido", () => {
    const [lisa] = remeras; // Legacy "REMERA LISA DE ALGODÓN - Negro", UYU 1290
    const cheaper = rankProducts(
      [
        ...remeras,
        // Mismo precio que el máximo: no es más barato.
        { ...lisa!, url: `${lisa!.url}?igual`, id: "igual" },
        // En dólares: se compara con la conversión aproximada (USD 20 ≈ UYU 800).
        { ...lisa!, url: `${lisa!.url}?usd`, id: "usd", price: { amount: 20, currency: "USD" } },
        {
          ...lisa!,
          url: `${lisa!.url}?usd-caro`,
          id: "usd-caro",
          price: { amount: 40, currency: "USD" },
        },
      ],
      query(remeraNegraLisa, { max_price: lisa!.price, strict_max_price: true }),
    );
    const ids = cheaper.map((r) => r.product.id);
    expect(ids).not.toContain(lisa!.id);
    expect(ids).not.toContain("igual");
    expect(ids).toContain("usd");
    expect(ids).not.toContain("usd-caro");
    expect(
      cheaper.every((r) => r.product.price!.currency === "USD" || r.product.price!.amount < 1290),
    ).toBe(true);
    // El orden sigue siendo por parecido, no por precio: primero las lisas y básicas
    // (estilo 1), las estampadas al final, y la más barata (UYU 99) no encabeza.
    const style = cheaper.map((r) => r.breakdown.visual_similarity);
    expect(style.slice(0, 4)).toEqual([1, 1, 1, 1]);
    expect(cheaper.slice(-2).every((r) => /ESTAMPADA/.test(r.product.title))).toBe(true);
    expect(cheaper[0]!.product.price!.amount).not.toBe(99);
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
    expect(strict.every((r) => r.product.price !== null && r.product.price.amount < 700)).toBe(
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

  describe("prueba real del paso 12b", () => {
    const [base] = remeras;
    const product = (title: string, extra: Partial<Product> = {}): Product => ({
      ...base!,
      url: `https://tienda.com.uy/p/${encodeURIComponent(title)}-${extra.store?.domain ?? ""}`,
      title,
      ...extra,
    });

    it("tono: un jean 'Azul Claro' no empata con 'lavado oscuro' en azul noche", () => {
      const jean: Garment = {
        category: "JEANS",
        description: "Jean clásico de lavado parejo oscuro",
        color: { name: "Azul noche", hex: "#0D1829" },
        fit: "Straight fit de tiro medio",
        material: "Denim 100% algodón rígido",
        pattern: null,
      };
      const ranked = rankProducts(
        [
          product("Pantalón de Jean Clásico Azul Claro", { category: "JEANS", colors: ["azul"] }),
          product("PANTALÓN DE JEAN CLÁSICO - Azul", { category: "JEANS", colors: ["azul"] }),
        ],
        query(jean),
        { diversity: 0 },
      );
      expect(ranked[0]!.product.title).toBe("PANTALÓN DE JEAN CLÁSICO - Azul");
      expect(ranked[0]!.breakdown.color_match).toBe(1);
      expect(ranked[1]!.breakdown.color_match).toBe(0.45);
      // Sin tono en el pedido (ni en el hex) no hay conflicto.
      const azul = rankProducts(
        [product("Pantalón de Jean Clásico Azul Claro", { category: "JEANS", colors: ["azul"] })],
        query({ ...jean, description: "Jean clásico", color: { name: "Azul", hex: "#2F5DA8" } }),
      );
      expect(azul[0]!.breakdown.color_match).toBe(1);
    });

    it("rasgos excluyentes: cuello V no reproduce una remera de cuello redondo", () => {
      const remera: Garment = {
        category: "T_SHIRT",
        description: "Remera clásica de cuello redondo cerrado",
        color: { name: "Blanco puro", hex: "#FFFFFF" },
        fit: "regular",
        material: "algodón",
        pattern: null,
      };
      const ranked = rankProducts(
        [
          product("Remera Algodón Cuello V - Blanco", { category: "T_SHIRT", colors: ["blanco"] }),
          product("REMERA BÁSICA DE ALGODÓN - Blanco", { category: "T_SHIRT", colors: ["blanco"] }),
          product("Remera Cuello Redondo - Blanco", { category: "T_SHIRT", colors: ["blanco"] }),
        ],
        query(remera),
        { diversity: 0 },
      );
      const v = ranked.find((r) => r.product.title.includes("Cuello V"))!;
      const basica = ranked.find((r) => r.product.title.includes("BÁSICA"))!;
      expect(ranked.at(-1)!.product.title).toBe("Remera Algodón Cuello V - Blanco");
      expect(v.breakdown.visual_similarity).toBeLessThan(basica.breakdown.visual_similarity / 2);
    });

    it("medida en mm: una caja de 28 mm no reproduce un reloj de 40 mm", () => {
      const reloj: Garment = {
        category: "WATCH",
        description: "Reloj de muñeca con cuadrante sobrio",
        color: { name: "Gris marengo", hex: "#3A3D40" },
        fit: "Caja mediana de 40 mm",
        material: "Acero inoxidable con correa de cuero",
        pattern: null,
      };
      const ranked = rankProducts(
        [
          product("Reloj CASIO RETRO LA680WEL-8A2DF Cuero Gris Esfera 28mm", {
            category: "WATCH",
            colors: ["gris"],
          }),
          product("Reloj Casio MTP-V002 Cuero Gris 40mm", { category: "WATCH", colors: ["gris"] }),
          product("Reloj Swatch Gris Unisex", { category: "WATCH", colors: ["gris"] }),
        ],
        query(reloj),
        { diversity: 0 },
      );
      const fit = (title: string) =>
        ranked.find((r) => r.product.title.includes(title))!.breakdown.fit_match;
      expect(fit("40mm")).toBe(1);
      expect(fit("28mm")).toBe(0.15);
      expect(fit("Swatch")).toBe(0.5); // sin medida en el título: no se sabe
      expect(ranked[0]!.product.title).toContain("40mm");
    });

    it("deporte: unos championes de fútbol 5 no reproducen unos urbanos minimalistas", () => {
      const urbanos: Garment = {
        category: "SHOES",
        description: "Championes urbanos minimalistas",
        color: { name: "Blanco puro", hex: "#FFFFFF" },
        fit: null,
        material: "cuero",
        pattern: null,
      };
      const shoe = (title: string) => product(title, { category: "SHOES", colors: ["blanco"] });
      const ranked = rankProducts(
        [
          shoe("Championes De Fútbol 5 De Cuero Viralto II Matador TF Blancos"),
          shoe("Championes de Hombre New Balance Life Style - Blanco"),
        ],
        query(urbanos),
        { diversity: 0 },
      );
      expect(ranked[0]!.product.title).toContain("New Balance");
      const futbol = ranked.find((r) => r.product.title.includes("Fútbol"))!;
      expect(futbol.breakdown.visual_similarity).toBeLessThan(0.3);
      // Si la prenda es de ese deporte, no castiga.
      const deFutbol = rankProducts(
        [shoe("Championes De Fútbol 5 De Cuero Viralto II Matador TF Blancos")],
        query({ ...urbanos, description: "Championes de fútbol 5" }),
      );
      expect(deFutbol[0]!.breakdown.visual_similarity).toBeGreaterThan(0.5);
    });

    it("rasgos que la prenda no pidió: montaña, capucha, cargo y medio cierre (look 2)", () => {
      const top = (description: string, category: Garment["category"], color: Garment["color"]) =>
        ({ category, description, color, fit: null, material: null, pattern: null }) as Garment;
      const best = (garment: Garment, titles: string[]) =>
        rankProducts(
          titles.map((t) => product(t, { category: garment.category, colors: [] })),
          query(garment),
          { diversity: 0 },
        )[0]!.product.title;
      const negro = { name: "Negro", hex: "#111111" };
      expect(
        best(top("Botas chelsea de perfil estilizado", "SHOES", negro), [
          "Botas invierno de senderismo impermeables hombre, NH100 negro",
          "Botas Chelsea de cuero - Negro",
        ]),
      ).toBe("Botas Chelsea de cuero - Negro");
      const marino = { name: "Azul marino", hex: "#1A2B4C" };
      expect(
        best(top("Buzo liviano de cuello redondo", "KNITWEAR", marino), [
          "Buzo Felpa Medio Cierre Metal Azul Marino",
          "CANGURO MLB YANKEES BACK HD - Navy",
          "Buzo de punto cuello redondo - Azul Marino",
        ]),
      ).toBe("Buzo de punto cuello redondo - Azul Marino");
      const terracota = { name: "Terracota profundo", hex: "#8A3C2A" };
      expect(
        best(top("Pantalón chino liso sin pinzas", "PANTS", terracota), [
          "PANTALÓN CARGO SPANDEX - Terracota",
          "Pantalón Chino - Terracota",
        ]),
      ).toBe("Pantalón Chino - Terracota");
      const gris = { name: "Gris marengo", hex: "#3A3D40" };
      expect(
        best(top("Campera corta estilo Harrington", "OUTERWEAR", gris), [
          "CAMPERA CAPUCHA DESMONTABLE - Gris Oscuro",
          "Campera corta Harrington - Gris",
        ]),
      ).toBe("Campera corta Harrington - Gris");
      // Pedido explícito: una campera con capucha no se castiga.
      expect(
        best(top("Campera con capucha", "OUTERWEAR", gris), [
          "CAMPERA CAPUCHA DESMONTABLE - Gris Oscuro",
          "Campera corta - Gris",
        ]),
      ).toBe("CAMPERA CAPUCHA DESMONTABLE - Gris Oscuro");
    });

    it("lo que claramente no es la prenda va después de lo que sí, aunque tenga el color", () => {
      const buzo: Garment = {
        category: "KNITWEAR",
        description: "Buzo liviano de cuello redondo",
        color: { name: "Azul marino", hex: "#1A2B4C" },
        fit: "Slim straight al torso",
        material: "Lana merino fina peinada",
        pattern: null,
      };
      const knit = (title: string, colors: string[]) =>
        product(title, { category: "KNITWEAR", colors });
      const pool = [
        knit("CANGURO MLB YANKEES BACK HD PRINT WITH EMBROIDERY REGU - Navy", ["azul marino"]),
        knit("Buzo de punto cuello redondo - Rojo", ["rojo"]),
      ];
      for (const diversity of [0, undefined]) {
        const ranked = rankProducts(pool, query(buzo), { diversity });
        expect(ranked[0]!.product.title).toContain("cuello redondo");
        // El canguro tiene más score (color exacto) pero no se parece: va segundo, no se saca.
        expect(ranked[1]!.score).toBeGreaterThan(ranked[0]!.score);
        expect(ranked[1]!.breakdown.visual_similarity).toBeLessThan(0.2);
      }
    });

    it("duplicados: el mismo producto y precio en tres tiendas no ocupa los primeros lugares", () => {
      const zapas = (domain: string, amount = 2490) =>
        product("Championes de Hombre Topper Rocket Urbano - Blanco - Gris - Negro", {
          category: "SHOES",
          colors: ["blanco"],
          store: { name: domain, domain },
          price: { amount, currency: "UYU" },
        });
      const otras = product("Championes urbanos de cuero - Blanco", {
        category: "SHOES",
        colors: ["blanco"],
        store: { name: "otra", domain: "otra.com.uy" },
        price: { amount: 3990, currency: "UYU" },
      });
      const ranked = rankProducts(
        [
          zapas("stadium.com.uy"),
          zapas("peppos.com.uy"),
          zapas("stadiumsport.uy"),
          zapas("outlet.com.uy", 1990),
          otras,
        ],
        query({
          category: "SHOES",
          description: "Championes urbanos minimalistas",
          color: { name: "Blanco puro", hex: "#FFFFFF" },
          fit: null,
          material: "cuero",
          pattern: null,
        }),
      );
      // Nada se saca, pero las copias de $ 2.490 quedan después de las opciones distintas.
      expect(ranked).toHaveLength(5);
      const top = ranked.slice(0, 3).map((r) => `${r.product.title}|${r.product.price?.amount}`);
      expect(new Set(top).size).toBe(3);
      expect(ranked.slice(3).every((r) => r.product.price?.amount === 2490)).toBe(true);
    });
  });
});
