import { normalizeText } from "./shopping-query";

/**
 * Tono de un color: claro u oscuro (paso 12b). El color canónico de las tiendas pierde el
 * tono ("Azul Claro" y "Azul noche" son "azul"); el ranking y la elección de la variante del
 * carrito lo comparan aparte.
 */
export type ColorShade = "dark" | "light";

const DARK_WORDS = /\b(oscur[oa]s?|noche|profund[oa]s?|dark|deep)\b/;
const LIGHT_WORDS = /\b(clar[oa]s?|light|pastel(es)?|palid[oa]s?|bleach(ed)?)\b/;

/** Tono que nombra un texto ("Azul Claro", "lavado oscuro"); si nombra los dos, ninguno. */
export function colorShade(text: string): ColorShade | null {
  const t = normalizeText(text);
  const [dark, light] = [DARK_WORDS.test(t), LIGHT_WORDS.test(t)];
  return dark === light ? null : dark ? "dark" : "light";
}

/** Luminosidad L* (CIELAB, 0–100) de un hex `#RRGGBB`; null si no es un hex válido. */
export function hexLightness(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const y =
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255);
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}

/** Tono que pide una prenda: lo que dicen su color y su descripción o, si no, su hex. */
export function garmentShade(garment: {
  description: string;
  color: { name: string; hex: string };
}): ColorShade | null {
  const said = colorShade(`${garment.color.name} ${garment.description}`);
  if (said) return said;
  const lightness = hexLightness(garment.color.hex);
  if (lightness === null) return null;
  return lightness < 30 ? "dark" : lightness > 80 ? "light" : null;
}

/** Palabra del tono para mostrar junto al color canónico ("azul oscuro"). */
export const SHADE_WORD: Record<ColorShade, string> = { dark: "oscuro", light: "claro" };
