import { describe, expect, it } from "vitest";

import {
  audienceForProfile,
  buildSearchTerms,
  buildShoppingQueries,
  EMPTY_USER_SIZES,
  isRelevantCandidate,
  listLookGarments,
  type LookSpec,
  ProductCategorySchema,
  ShoppingQuerySchema,
  sizeKindForCategory,
  splitStyleProfile,
  synonymsOf,
  UserSizesSchema,
} from "../src";
import { FIXTURE_LOOK_SPECS, FIXTURE_STYLE_PROFILE } from "../src/fixtures";

const sizes = { top: "M", bottom: "42", shoe: "42", shoe_size_system: "EU" as const };
const [look1, look2, look3] = FIXTURE_LOOK_SPECS;

describe("talles", () => {
  it("UserSizesSchema acepta vacíos y rechaza sistemas desconocidos", () => {
    expect(UserSizesSchema.parse(EMPTY_USER_SIZES)).toEqual(EMPTY_USER_SIZES);
    expect(UserSizesSchema.parse({ ...sizes, top: " L " }).top).toBe("L");
    expect(UserSizesSchema.safeParse({ ...sizes, shoe_size_system: "UK" }).success).toBe(false);
  });

  it("sizeKindForCategory cubre todas las categorías", () => {
    expect(sizeKindForCategory("SHIRT")).toBe("top");
    expect(sizeKindForCategory("OUTERWEAR")).toBe("top");
    expect(sizeKindForCategory("BLAZER")).toBe("top");
    expect(sizeKindForCategory("JEANS")).toBe("bottom");
    expect(sizeKindForCategory("SKIRT")).toBe("bottom");
    expect(sizeKindForCategory("SHOES")).toBe("shoe");
    expect(sizeKindForCategory("WATCH")).toBeNull();
    for (const category of ProductCategorySchema.options) {
      expect([null, "top", "bottom", "shoe"]).toContain(sizeKindForCategory(category));
    }
  });
});

describe("buildShoppingQueries", () => {
  it("una query válida por prenda, con slot, talle y público", () => {
    const queries = buildShoppingQueries(look1, { sizes, audience: "MEN" });
    expect(queries.map((q) => q.slot)).toEqual(listLookGarments(look1).map((g) => g.slot));
    expect(queries.map((q) => q.slot)).toEqual([
      "top",
      "bottom",
      "layering:0",
      "shoes",
      "accessory:0",
    ]);
    for (const { slot, query } of queries) {
      expect(ShoppingQuerySchema.parse(query)).toEqual(query);
      expect(query.slot).toBe(slot);
      expect(query.audience).toBe("MEN");
      expect(query.search_terms.length).toBeGreaterThan(0);
      expect(query.limit).toBeGreaterThanOrEqual(3);
      expect(query.limit).toBeLessThanOrEqual(5);
    }
    const bySlot = Object.fromEntries(queries.map((q) => [q.slot, q.query]));
    expect(bySlot.top?.size).toBe("M");
    expect(bySlot.bottom?.size).toBe("42");
    expect(bySlot.shoes?.size).toBe("42");
    expect(bySlot["accessory:0"]?.size).toBeNull();
  });

  it("look sin bottom y con varios accesorios", () => {
    const look: LookSpec = {
      ...look2,
      bottom: null,
      top: { ...look2.top, category: "DRESS", description: "vestido midi de lino" },
      accessories: [
        { ...look2.shoes, category: "BAG", description: "bolso de cuero" },
        { ...look2.shoes, category: "EYEWEAR", description: "lentes de sol redondos" },
      ],
    };
    const slots = buildShoppingQueries(look, { sizes, audience: "WOMEN" }).map((q) => q.slot);
    expect(slots).toEqual(["top", "shoes", "accessory:0", "accessory:1"]);
  });

  it("el límite queda entre 3 y 5", () => {
    expect(buildShoppingQueries(look1, { sizes, audience: null, limit: 20 })[0]?.query.limit).toBe(
      5,
    );
    expect(buildShoppingQueries(look1, { sizes, audience: null, limit: 1 })[0]?.query.limit).toBe(
      3,
    );
  });

  it("sin talles cargados, la query va sin talle", () => {
    const [top] = buildShoppingQueries(look3, { sizes: EMPTY_USER_SIZES, audience: null });
    expect(top?.query.size).toBeNull();
  });
});

describe("buildSearchTerms", () => {
  const terms = (description: string, category: LookSpec["top"]["category"], color = "negro") =>
    buildSearchTerms({ category, description, color: { name: color }, material: null });

  it("frases cortas del más específico al más general", () => {
    expect(terms("camisa oxford", "SHIRT", "celeste")).toEqual([
      "camisa oxford celeste",
      "camisa oxford",
      "camisa celeste",
      "camisa",
    ]);
  });

  it("traduce términos en inglés y usa el vocabulario uruguayo", () => {
    expect(terms("loafers", "SHOES")[0]).toBe("mocasines negro");
    expect(terms("zapatillas blancas de cuero", "SHOES", "blanco")[0]).toBe(
      "championes cuero blanco",
    );
    expect(terms("overshirt", "OUTERWEAR", "camel")[0]).toBe("sobrecamisa camel");
    expect(terms("t-shirt básica", "T_SHIRT")[0]).toBe("remera basica negro");
    expect(terms("falda plisada", "SKIRT")[0]).toBe("pollera plisada negro");
  });

  it("suma sinónimos en español", () => {
    expect(terms("remera lisa", "T_SHIRT")).toContain("camiseta negro");
    expect(terms("buzo con capucha", "KNITWEAR")).toEqual(
      expect.arrayContaining(["sweater negro"]),
    );
    expect(synonymsOf("zapatillas")).toEqual(expect.arrayContaining(["championes", "zapatillas"]));
  });

  it("no busca lo negado ni repite el color", () => {
    const t = terms("pantalón de vestir sin pinzas", "PANTS", "gris");
    expect(t.join(" ")).not.toContain("pinzas");
    expect(t[0]).toBe("pantalon vestir gris");
    expect(terms("championes blancos", "SHOES", "blanco")[0]).toBe("championes blanco");
  });

  it("unas botas no se buscan como championes", () => {
    const t = terms("desert boots", "SHOES", "chocolate");
    expect(t[0]).toBe("botas chocolate");
    expect(t.join(" ")).not.toContain("championes");
  });
});

describe("pertinencia de candidatas", () => {
  const [remera] = buildShoppingQueries(
    {
      ...look1,
      top: {
        ...look1.top,
        category: "T_SHIRT",
        description: "remera lisa",
        color: { name: "negro", hex: "#111111" },
      },
    },
    { sizes, audience: "MEN" },
  );
  const q = remera!.query;

  it("una remera negra acepta remeras y camisetas, no medias", () => {
    expect(isRelevantCandidate("Remera de hombre adidas negra", q)).toBe(true);
    expect(isRelevantCandidate("CAMISETA BÁSICA UNISSEX - NEGRO", q)).toBe(true);
    expect(isRelevantCandidate("/productos/remeras-lisas-negro_123", q)).toBe(true);
    expect(isRelevantCandidate("Medias antideslizantes negro", q)).toBe(false);
  });

  it("descarta el otro público y niños", () => {
    expect(isRelevantCandidate("Remera de mujer negra", q)).toBe(false);
    expect(isRelevantCandidate("Remera unisex hombre mujer", q)).toBe(true);
    expect(isRelevantCandidate("Remera niño negra", q)).toBe(false);
  });

  it("URL sin palabras: no se puede juzgar", () => {
    expect(isRelevantCandidate("https://uy.hm.com/0450182003/p", q)).toBeNull();
  });

  it("el público sale de la presentación del perfil", () => {
    const { core } = splitStyleProfile(FIXTURE_STYLE_PROFILE);
    expect(audienceForProfile(core)).toBe("MEN");
    const androgynous = {
      ...core,
      appearance: { ...core.appearance, presentation: "ANDROGYNOUS" as const },
    };
    expect(audienceForProfile(androgynous)).toBeNull();
  });
});

describe("ShoppingQuerySchema", () => {
  it("es aditivo: un payload viejo sigue validando con defaults", () => {
    const parsed = ShoppingQuerySchema.parse({
      garment: look1.top,
      country_code: "UY",
      size: null,
      max_price: null,
      limit: 5,
    });
    expect(parsed).toMatchObject({
      slot: null,
      search_terms: [],
      audience: null,
      strict_max_price: false,
    });
  });
});
