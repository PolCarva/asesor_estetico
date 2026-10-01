import { z } from "zod";

import type { ProductCategory } from "./schemas/common";
import { type LookSpec, listLookGarments } from "./schemas/look-spec";

/** Tipo de talle que usa cada categoría de prenda. */
export type SizeKind = "top" | "bottom" | "shoe";

export const ShoeSizeSystemSchema = z.enum(["EU", "US"]);
export type ShoeSizeSystem = z.infer<typeof ShoeSizeSystemSchema>;

const sizeLabel = z.string().trim().min(1).max(10);

/** Talles del usuario. Todos opcionales: se piden antes de buscar (paso 07). */
export const UserSizesSchema = z.object({
  top: sizeLabel.nullable(),
  bottom: sizeLabel.nullable(),
  shoe: sizeLabel.nullable(),
  shoe_size_system: ShoeSizeSystemSchema,
});
export type UserSizes = z.infer<typeof UserSizesSchema>;

export const EMPTY_USER_SIZES: UserSizes = {
  top: null,
  bottom: null,
  shoe: null,
  shoe_size_system: "EU",
};

const SIZE_KIND_BY_CATEGORY: Record<ProductCategory, SizeKind | null> = {
  SHIRT: "top",
  T_SHIRT: "top",
  KNITWEAR: "top",
  TOP: "top",
  OUTERWEAR: "top",
  BLAZER: "top",
  DRESS: "top",
  PANTS: "bottom",
  JEANS: "bottom",
  SHORTS: "bottom",
  SKIRT: "bottom",
  SHOES: "shoe",
  BAG: null,
  BELT: null,
  JEWELRY: null,
  EYEWEAR: null,
  WATCH: null,
  HAT: null,
  SCARF: null,
  OTHER: null,
};

/** Qué talle del usuario aplica a una categoría (null: accesorios, talle único). */
export function sizeKindForCategory(category: ProductCategory): SizeKind | null {
  return SIZE_KIND_BY_CATEGORY[category];
}

/**
 * Talle del usuario para una categoría, o null si no aplica o no lo cargó. El calzado de
 * EE. UU. va con su sistema (`US 9`): un 9 de EE. UU. no es un 9 europeo.
 */
export function sizeForCategory(sizes: UserSizes, category: ProductCategory): string | null {
  const kind = sizeKindForCategory(category);
  if (!kind) return null;
  const size = sizes[kind];
  return kind === "shoe" && size && sizes.shoe_size_system === "US" ? `US ${size}` : size;
}

/** Orden en el que se piden los talles (de arriba hacia abajo). */
export const SIZE_KINDS: readonly SizeKind[] = ["top", "bottom", "shoe"];

/**
 * Opciones que se le ofrecen al usuario (SPEC "TALLES": remera/camisa S/M/L/XL…,
 * pantalón 30/32/34…, calzado EU/US). Ya están en forma canónica (`normalizeSizeLabel`).
 * El pantalón es el número de la etiqueta: cintura en pulgadas (28–36) o talle uruguayo
 * (38–50); las tiendas usan los dos.
 */
export const SIZE_OPTIONS = {
  top: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"],
  bottom: ["28", "30", "32", "34", "36", "38", "40", "42", "44", "46", "48", "50"],
  shoe: {
    EU: ["35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47"],
    US: [
      "5",
      "5.5",
      "6",
      "6.5",
      "7",
      "7.5",
      "8",
      "8.5",
      "9",
      "9.5",
      "10",
      "10.5",
      "11",
      "11.5",
      "12",
      "13",
      "14",
    ],
  },
} as const satisfies {
  top: readonly string[];
  bottom: readonly string[];
  shoe: Record<ShoeSizeSystem, readonly string[]>;
};

/** ¿Es una de las opciones que se ofrecen para ese tipo de talle? */
export function isSizeOption(kind: SizeKind, value: string, system: ShoeSizeSystem = "EU") {
  const options: readonly string[] =
    kind === "shoe" ? SIZE_OPTIONS.shoe[system] : SIZE_OPTIONS[kind];
  return options.includes(value);
}

/**
 * Talles que hacen falta para buscar las prendas de un look y el usuario todavía no cargó.
 * Solo los relevantes: un look sin pantalón no pide pantalón, los accesorios no piden
 * nada. En orden: arriba, abajo, calzado.
 */
export function missingSizesForLook(look: LookSpec, sizes: UserSizes): SizeKind[] {
  const needed = new Set(
    listLookGarments(look).flatMap(({ garment }) => {
      const kind = sizeKindForCategory(garment.category);
      return kind ? [kind] : [];
    }),
  );
  return SIZE_KINDS.filter((kind) => needed.has(kind) && !sizes[kind]);
}

/** Talles de letra en orden, y cómo los escriben las tiendas (inglés, español, Brasil). */
const ALPHA_SIZES: Array<[string, RegExp]> = [
  ["XXS", /^(XXS|2XS|EXTRA ?EXTRA ?(CHICO|SMALL))$/],
  ["XS", /^(XS|PP|EXTRA ?(CHICO|SMALL))$/],
  ["S", /^(S|P|CH|CHICO|SMALL|PEQUEÑO|PEQUENO)$/],
  ["M", /^(M|MEDIANO|MEDIUM|MEDIO)$/],
  ["L", /^(L|G|GRANDE|LARGE)$/],
  ["XL", /^(XL|GG|XG|EG|EXTRA ?(GRANDE|LARGE))$/],
  ["XXL", /^(XXL|2XL|XXG|XGG|EGG|G3)$/],
  ["XXXL", /^(XXXL|3XL|XXXG|G4)$/],
  ["4XL", /^(XXXXL|4XL|G5)$/],
];

const UNIQUE_SIZE =
  /^(U|TU|UNI|UNICO|ÚNICO|TALLE ÚNICO|TALLE UNICO|TALLA ÚNICA|TALLA UNICA|ONE ?SIZE|OS|STANDARD)$/;

/**
 * Talle de una tienda → forma canónica para comparar con el del usuario:
 * - letras: `XS`…`XXL` (también "Small", "Grande", y los brasileños P/M/G/GG/XG);
 * - números de pantalón o calzado EU: `42`, `42.5`; pantalón con largo: `32/34`;
 * - calzado de EE. UU. o del Reino Unido: `US 9`, `UK 8`;
 * - talle único: `ÚNICO`.
 * Lo que no reconoce vuelve en mayúsculas, tal cual (la etiqueta original se guarda aparte).
 */
export function normalizeSizeLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  const s = label
    .trim()
    .toUpperCase()
    .replace(/^(TALLE|TALLA|TALL|SIZE|TAM\.?|TAMAÑO|NRO\.?|N°|Nº)\s*:?\s*/, "")
    .replace(/\s+/g, " ");
  if (!s) return null;
  if (UNIQUE_SIZE.test(s)) return "ÚNICO";
  for (const [canonical, pattern] of ALPHA_SIZES) if (pattern.test(s)) return canonical;

  const number = (n: string) => n.replace(",", ".").replace(/\.0$/, "");
  const regional =
    /^(US|UK|EU|EUR|BR)\s?(\d{1,2}(?:[.,]5)?)$|^(\d{1,2}(?:[.,]5)?)\s?(US|UK|EU|EUR|BR)$/.exec(s);
  if (regional) {
    const system = (regional[1] ?? regional[4])!;
    const value = number((regional[2] ?? regional[3])!);
    return system === "EU" || system === "EUR" ? value : `${system} ${value}`;
  }
  // Pantalón con cintura y largo ("W32 L34", "32/34", "32x34", "32-30", "38 (L33)").
  const waistLength = /^W?(\d{2})\s?(?:[/X-]|\sL|\s?\(L)\s?L?(\d{2})\)?$/.exec(s);
  if (waistLength) return `${waistLength[1]}/${waistLength[2]}`;
  if (/^\d{1,2}(?:[.,]5)?$/.test(s)) return number(s);
  return s.slice(0, 20);
}

/**
 * ¿El talle de una variante sirve para el talle del usuario? Compara formas canónicas y
 * entiende los talles combinados de las tiendas: `XS/S` (sirve para XS y para S), `32/34`
 * (cintura 32 con largo), `M / W32 L33` (letra o cintura).
 */
export function sizeMatches(userSize: string | null, variantSize: string | null): boolean {
  const user = normalizeSizeLabel(userSize);
  const variant = normalizeSizeLabel(variantSize);
  if (!user || !variant) return false;
  if (user === variant) return true;
  // Cintura con largo: "32/34" sirve para "32".
  const waist = /^(\d{2})\/\d{2}$/.exec(variant)?.[1];
  if (waist && waist === user) return true;
  // Combinados: cada parte por separado ("XS/S", "M / W32 L33").
  const parts = variant
    .split(/\s*\/\s*|\s+/)
    .map((part) => normalizeSizeLabel(part.replace(/^W(\d{2})$/, "$1")))
    .filter((part): part is string => Boolean(part));
  return parts.length > 1 && parts.includes(user);
}

/** Sistema de un talle canónico, para saber si dos talles se pueden comparar. */
export type SizeSystem = "ALPHA" | "NUMBER" | "WAIST_LENGTH" | "US" | "UK" | "UNIQUE" | "OTHER";

export function sizeSystem(size: string | null): SizeSystem | null {
  const s = normalizeSizeLabel(size);
  if (!s) return null;
  if (s === "ÚNICO") return "UNIQUE";
  if (ALPHA_SIZES.some(([canonical]) => canonical === s)) return "ALPHA";
  if (/^\d{1,2}(\.5)?$/.test(s)) return "NUMBER";
  if (/^\d{2}\/\d{2}$/.test(s)) return "WAIST_LENGTH";
  if (s.startsWith("US ")) return "US";
  if (s.startsWith("UK ")) return "UK";
  return "OTHER";
}
