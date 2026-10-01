import { describe, expect, it } from "vitest";

import { normalizeSizeLabel, sizeMatches } from "../src";

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
