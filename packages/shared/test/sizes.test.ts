import { describe, expect, it } from "vitest";

import {
  buildShoppingQueries,
  EMPTY_USER_SIZES,
  isSizeOption,
  type LookSpec,
  missingSizesForLook,
  normalizeSizeLabel,
  SIZE_OPTIONS,
  sizeForCategory,
  sizeMatches,
  sizeSystem,
} from "../src";
import { FIXTURE_LOOK_SPECS } from "../src/fixtures";

describe("normalizeSizeLabel: talles de tiendas a forma canónica", () => {
  it.each([
    // Letras, en inglés y en español
    ["M", "M"],
    [" m ", "M"],
    ["Medium", "M"],
    ["Mediano", "M"],
    ["Small", "S"],
    ["Chico", "S"],
    ["Grande", "L"],
    ["Extra Large", "XL"],
    ["2XL", "XXL"],
    ["XXL", "XXL"],
    ["3XL", "XXXL"],
    ["XXS", "XXS"],
    ["Talle: XL", "XL"],
    ["TALLA L", "L"],
    // Talles brasileños (Hering)
    ["PP", "XS"],
    ["P", "S"],
    ["G", "L"],
    ["GG", "XL"],
    ["XG", "XL"],
    ["XGG", "XXL"],
    // Números de pantalón y calzado EU
    ["42", "42"],
    ["42,5", "42.5"],
    ["42.5", "42.5"],
    ["EU 42", "42"],
    ["42 EU", "42"],
    ["W32 L34", "32/34"],
    ["32/34", "32/34"],
    ["32x32", "32/32"],
    ["32-30", "32/30"],
    ["38 (L33)", "38/33"],
    // Calzado de EE. UU. y del Reino Unido
    ["US 9", "US 9"],
    ["9.5 US", "US 9.5"],
    ["UK 8", "UK 8"],
    // Talle único
    ["Único", "ÚNICO"],
    ["TU", "ÚNICO"],
    ["Talle único", "ÚNICO"],
    ["One Size", "ÚNICO"],
  ])("%s → %s", (label, expected) => {
    expect(normalizeSizeLabel(label)).toBe(expected);
  });

  it("lo que no reconoce vuelve en mayúsculas (la etiqueta original se guarda aparte)", () => {
    expect(normalizeSizeLabel("Junior 14")).toBe("JUNIOR 14");
    expect(normalizeSizeLabel("x".repeat(30))).toHaveLength(20);
  });

  it("vacío o ausente → null", () => {
    expect(normalizeSizeLabel("")).toBeNull();
    expect(normalizeSizeLabel("   ")).toBeNull();
    expect(normalizeSizeLabel(null)).toBeNull();
    expect(normalizeSizeLabel(undefined)).toBeNull();
  });
});

describe("sizeMatches: talle del usuario contra el de la variante", () => {
  it.each([
    ["M", "M", true],
    ["M", "Medium", true],
    ["L", "G", true],
    ["S", "XS/S", true],
    ["M", "XS/S", false],
    ["32", "32-30", true],
    ["32", "W32 L34", true],
    ["38", "38 (L33)", true],
    ["40", "38 (L33)", false],
    ["M", "M / W32 L33", true],
    ["32", "M / W32 L33", true],
    ["42", "US 9", false],
    ["M", null, false],
    [null, "M", false],
  ])("%s en %s → %s", (user, variant, expected) => {
    expect(sizeMatches(user, variant)).toBe(expected);
  });
});

describe("talles del usuario (paso 07)", () => {
  const [look] = FIXTURE_LOOK_SPECS;

  it("pide solo los talles relevantes del look y que falten, en orden", () => {
    // Look 1: camisa, pantalón, overshirt (arriba), desert boots y un reloj (sin talle).
    expect(missingSizesForLook(look, EMPTY_USER_SIZES)).toEqual(["top", "bottom", "shoe"]);
    expect(missingSizesForLook(look, { ...EMPTY_USER_SIZES, bottom: "32" })).toEqual([
      "top",
      "shoe",
    ]);
    expect(
      missingSizesForLook(look, { ...EMPTY_USER_SIZES, top: "M", bottom: "32", shoe: "42" }),
    ).toEqual([]);
  });

  it("un look sin pantalón no lo pide, y los accesorios no piden nada", () => {
    const dress: LookSpec = {
      ...look,
      top: { ...look.top, category: "DRESS" },
      bottom: null,
      layering: [],
    };
    expect(missingSizesForLook(dress, EMPTY_USER_SIZES)).toEqual(["top", "shoe"]);
  });

  it("el calzado de EE. UU. viaja con su sistema: un 9 US no es un 42 ni un 9 europeo", () => {
    const us = { ...EMPTY_USER_SIZES, shoe: "9", shoe_size_system: "US" as const };
    expect(sizeForCategory(us, "SHOES")).toBe("US 9");
    expect(sizeForCategory({ ...us, shoe_size_system: "EU" }, "SHOES")).toBe("9");
    expect(sizeMatches(sizeForCategory(us, "SHOES"), "US 9")).toBe(true);
    expect(sizeMatches(sizeForCategory(us, "SHOES"), "9")).toBe(false);
    const shoes = buildShoppingQueries(look, { sizes: us, audience: "MEN" }).find(
      (q) => q.slot === "shoes",
    );
    expect(shoes?.query.size).toBe("US 9");
  });

  it("las opciones ya están en forma canónica y del sistema que dicen", () => {
    for (const size of SIZE_OPTIONS.top) {
      expect(normalizeSizeLabel(size)).toBe(size);
      expect(sizeSystem(size)).toBe("ALPHA");
    }
    for (const size of [...SIZE_OPTIONS.bottom, ...SIZE_OPTIONS.shoe.EU]) {
      expect(normalizeSizeLabel(size)).toBe(size);
      expect(sizeSystem(size)).toBe("NUMBER");
    }
    for (const size of SIZE_OPTIONS.shoe.US) expect(sizeSystem(`US ${size}`)).toBe("US");
    expect(isSizeOption("top", "M")).toBe(true);
    expect(isSizeOption("top", "42")).toBe(false);
    expect(isSizeOption("shoe", "9.5", "US")).toBe(true);
    expect(isSizeOption("shoe", "9.5", "EU")).toBe(false);
  });
});
