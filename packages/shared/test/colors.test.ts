import { describe, expect, it } from "vitest";

import { colorShade, garmentShade, hexLightness, variantColorDistance } from "../src";

describe("tono del color (paso 12b)", () => {
  it("lo lee del texto en español e inglés; si nombra los dos, no se sabe", () => {
    expect(colorShade("Pantalón de Jean Clásico Azul Claro")).toBe("light");
    expect(colorShade("Jean clásico de lavado parejo oscuro")).toBe("dark");
    expect(colorShade("Azul noche")).toBe("dark");
    expect(colorShade("Light Blue")).toBe("light");
    expect(colorShade("Azul")).toBeNull();
    expect(colorShade("claro y oscuro")).toBeNull();
  });

  it("la prenda: lo que dice o, si no, la luminosidad de su hex", () => {
    expect(hexLightness("#000000")).toBe(0);
    expect(hexLightness("#FFFFFF")).toBeCloseTo(100, 0);
    expect(hexLightness("rojo")).toBeNull();
    const garment = (name: string, hex: string, description = "Remera") => ({
      description,
      color: { name, hex },
    });
    expect(garmentShade(garment("Gris marengo", "#3A3D40"))).toBe("dark");
    expect(garmentShade(garment("Blanco puro", "#FFFFFF"))).toBe("light");
    expect(garmentShade(garment("Verde oliva", "#6B6B3A"))).toBeNull();
    expect(garmentShade(garment("Azul", "#2F5DA8", "Jean de lavado oscuro"))).toBe("dark");
  });

  it("distancia del color de una variante al de la prenda", () => {
    const jean = { description: "Jean", color: { name: "Azul noche", hex: "#0D1829" } };
    expect(variantColorDistance("azul oscuro", jean)).toBe(0);
    expect(variantColorDistance("azul claro", jean)).toBe(1);
    expect(variantColorDistance("negro", jean)).toBe(2);
    expect(variantColorDistance(null, jean)).toBe(0);
    expect(variantColorDistance("azul", null)).toBe(0);
  });
});
