import {
  type Currency,
  type Product,
  type ProductAvailability,
  type ProductCategory,
  ProductCategorySchema,
  ProductSchema,
  type ProductVariant,
  type Store,
} from "@asesor/shared";

import type { RawProduct } from "./types";
import {
  CATEGORY_PATTERNS,
  COLOR_PATTERNS,
  FIT_PATTERNS,
  MATERIAL_PATTERNS,
  NOT_APPAREL,
} from "./vocabulary";

/** Minúsculas sin tildes: base de todas las comparaciones de texto. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function normalizeAvailability(value: string | null): ProductAvailability {
  if (!value) return "UNKNOWN";
  const v = value
    .replace(/^https?:\/\/schema\.org\//i, "")
    .toLowerCase()
    .replace(/[\s_-]/g, "");
  if (v === "instock" || v === "limitedavailability" || v === "onlineonly") return "IN_STOCK";
  if (v === "outofstock" || v === "soldout" || v === "discontinued" || v === "oos") {
    return "OUT_OF_STOCK";
  }
  if (v === "instoreonly") return "IN_STORE_ONLY";
  return "UNKNOWN";
}

/**
 * Precio con formato local o de schema.org → número positivo, o null si no se entiende.
 * `1.890,00` y `1,890.00` → 1890; `6.390` y `1,499` → miles (un solo separador seguido de
 * 3 dígitos, con 1–3 dígitos adelante); `4690.00`, `1490.000` y `12,5` → decimales.
 * Ignora símbolos y monedas (`UYU 1.690`, `U$S 49,90`).
 */
export function parsePrice(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
  }
  if (typeof value !== "string") return null;
  const s = value.replace(/[^\d.,]/g, "").replace(/^[.,]+|[.,]+$/g, "");
  if (!/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let plain: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    const [int = "", frac, ...rest] = s.split(thousands).join("").split(decimal);
    if (rest.length > 0) return null;
    plain = `${int}.${frac ?? ""}`;
  } else if (lastDot >= 0 || lastComma >= 0) {
    const parts = s.split(lastDot >= 0 ? "." : ",");
    const [int = "", frac = ""] = parts;
    if (parts.length > 2) {
      // Varios separadores iguales: son de miles (1.234.567).
      const groups = parts.slice(1);
      if (int.length === 0 || int.length > 3 || groups.some((g) => g.length !== 3)) return null;
      plain = parts.join("");
    } else {
      const thousands = frac.length === 3 && int.length <= 3 && !int.startsWith("0");
      plain = thousands ? `${int}${frac}` : `${int}.${frac}`;
    }
  } else {
    plain = s;
  }
  const n = Number(plain);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** Código de moneda declarado (`UYU`, `$U`, `U$S`, `US$`…). Lo que no se reconoce → null. */
export function parseCurrency(value: string | null | undefined): Currency | null {
  if (!value) return null;
  const v = value.toUpperCase().replace(/\s+/g, "");
  if (["UYU", "$U", "UY$", "$UY", "UYU$"].includes(v)) return "UYU";
  if (["USD", "U$S", "US$", "U$D", "U$"].includes(v)) return "USD";
  return null;
}

/** Moneda escrita junto al precio ("UYU 1.690", "U$S 49"). Un `$` solo no alcanza. */
export function currencyInText(text: string): Currency | null {
  const t = text.toUpperCase();
  if (/U\$S|US\$|U\$D|\bUSD\b/.test(t)) return "USD";
  if (/\bUYU\b|\$U\b|UY\$/.test(t)) return "UYU";
  return null;
}

function firstMatch<T>(text: string, patterns: Array<[T, RegExp]>): T | null {
  let best: { value: T; index: number } | null = null;
  for (const [value, pattern] of patterns) {
    const index = text.search(pattern);
    if (index >= 0 && (!best || index < best.index)) best = { value, index };
  }
  return best?.value ?? null;
}

/**
 * Categoría por el sustantivo que aparece primero en el título (plurales y términos de
 * Uruguay: championes, buzo, campera, pollera, musculosa…). Si el título no dice nada,
 * se mira la categoría declarada por la tienda y las migas de pan.
 */
export function inferCategory(raw: Pick<RawProduct, "category" | "title">): ProductCategory {
  const declared = raw.category?.toUpperCase().replace(/[\s-]/g, "_");
  const parsed = ProductCategorySchema.safeParse(declared);
  if (parsed.success) return parsed.data;
  const title = normalizeText(raw.title ?? "");
  if (NOT_APPAREL.test(title)) return "OTHER";
  const category =
    firstMatch(title, CATEGORY_PATTERNS) ??
    firstMatch(normalizeText(raw.category ?? ""), CATEGORY_PATTERNS) ??
    "OTHER";
  // "Pantalón de jean" es un jean; "saco tejido" es un tejido.
  if (category === "PANTS" && /\b(jeans?|denim)\b/.test(title)) return "JEANS";
  if (category === "BLAZER" && /\b(tejid[oa]|punto|hilo|lana)\b/.test(title)) return "KNITWEAR";
  return category;
}

const FIT_ALTERNATION = FIT_PATTERNS.map(([, p]) => p).join("|");
const FIT_IN_DESCRIPTION = new RegExp(
  `\\b(?:fit|corte|modelo|calce|silueta|horma|pierna)\\s+(?:de\\s+|es\\s+)?(?:${FIT_ALTERNATION})\\b|\\b(?:${FIT_ALTERNATION})\\s+fit\\b`,
);

function fitIn(text: string): string | null {
  return firstMatch(
    text,
    FIT_PATTERNS.map(([value, p]) => [value, new RegExp(`\\b(${p})\\b`)] as [string, RegExp]),
  );
}

/**
 * Fit solo cuando la tienda lo dice: en el título ("Jean slim", "Pantalón recto") o en la
 * descripción con contexto ("modelo Slim", "corte entallado", "regular fit").
 */
export function inferFit(title: string | null, description: string | null): string | null {
  const fromTitle = fitIn(normalizeText(title ?? ""));
  if (fromTitle) return fromTitle;
  const phrase = FIT_IN_DESCRIPTION.exec(normalizeText(description ?? "").slice(0, 2000));
  return phrase ? fitIn(phrase[0]) : null;
}

function matchAll(text: string, patterns: Array<[string, RegExp]>): string[] {
  return patterns.filter(([, p]) => p.test(text)).map(([value]) => value);
}

/** Colores canónicos de un texto ("GRIS OSCURO" → gris, "Black" → negro). */
export function colorsIn(text: string): string[] {
  return matchAll(normalizeText(text), COLOR_PATTERNS);
}

/**
 * Colores declarados (JSON-LD, microdata, variantes) o, si no hay, los del título. Las
 * tiendas Fenicio ponen el color al final ("CAMISA OXFORD - Arena", "Pantalón - Negro -
 * Blanco"): se leen esos segmentos y, si no hay, cualquier color que nombre el título. Del
 * título solo salen colores del vocabulario: un nombre de fantasía ("Forest River") no se
 * puede comparar y queda como "sin dato".
 */
export function inferColors(declared: string[], title: string | null): string[] {
  const fromDeclared = declared.flatMap((c) => {
    const known = colorsIn(c);
    return known.length > 0 ? known : [c.trim().toLowerCase()];
  });
  if (fromDeclared.length > 0) return [...new Set(fromDeclared.filter(Boolean))];
  if (!title) return [];
  const segments = title.split(/\s[-–|]\s/).slice(1);
  const trailing: string[] = [];
  for (let i = segments.length - 1; i >= 0; i--) {
    // Shopify agrega la opción después de ":" ("Ensign Blue Stripes:STRIPES").
    const known = colorsIn(segments[i]!.split(":")[0]!);
    if (known.length === 0) break;
    trailing.unshift(...known);
  }
  return [...new Set(trailing.length > 0 ? trailing : colorsIn(title))];
}

/** Materiales declarados o, si no hay, los que nombran el título o la descripción. */
export function inferMaterials(
  declared: string[],
  title: string | null,
  description: string | null,
): string[] {
  const t = normalizeText(title ?? "");
  const d = normalizeText(description ?? "").slice(0, 2000);
  const source = declared.length > 0 ? normalizeText(declared.join(", ")) : null;
  const found = MATERIAL_PATTERNS.filter(([, pattern, options]) =>
    source !== null
      ? pattern.test(source)
      : pattern.test(t) || (!options?.titleOnly && pattern.test(d)),
  ).map(([value]) => value);
  const unique = found.includes("cuero sintético") ? found.filter((m) => m !== "cuero") : found;
  if (unique.length > 0 || source === null) return unique;
  // Declarado pero fuera del vocabulario: se guarda como lo escribe la tienda.
  return declared.map((m) => m.trim().toLowerCase()).filter(Boolean);
}

const splitList = (value: string | null) =>
  value
    ? value
        .split(/[,/]| y /)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

const within = (value: string | null, max: number) => (value && value.length <= max ? value : null);

function normalizeVariants(raw: RawProduct, currency: Currency): ProductVariant[] {
  const seen = new Set<string>();
  const variants: ProductVariant[] = [];
  for (const variant of raw.variants) {
    // Id de la plataforma o SKU; sin ninguno no hay forma estable de nombrarla.
    const id = within(variant.id ?? variant.sku, 120);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const price = parsePrice(variant.price);
    const variantCurrency = parseCurrency(variant.currency) ?? currency;
    variants.push({
      id,
      sku: within(variant.sku, 80),
      size: within(variant.size?.trim() ?? null, 20),
      color: variant.color
        ? (colorsIn(variant.color)[0] ?? within(variant.color.toLowerCase(), 60))
        : null,
      availability: normalizeAvailability(variant.availability),
      price: price === null ? null : { amount: price, currency: variantCurrency },
    });
    if (variants.length === 100) break;
  }
  return variants;
}

export type NormalizeFailure = "no_title" | "no_price" | "unsupported_currency" | "invalid";

export type NormalizeResult =
  { ok: true; product: Product } | { ok: false; reason: NormalizeFailure };

/**
 * Convierte datos crudos en un Product validado, o dice por qué no: sin título, sin precio
 * legible, moneda distinta de UYU/USD o datos que no pasan el schema. Nunca completa un
 * precio, un stock ni un talle que la página no dio.
 */
export function normalizeProductResult(
  raw: RawProduct,
  context: { store: Store; fetchedAt: string },
): NormalizeResult {
  const title = raw.title?.trim();
  if (!title) return { ok: false, reason: "no_title" };
  const price = parsePrice(raw.price);
  if (price === null) return { ok: false, reason: "no_price" };
  const currency = raw.currency
    ? parseCurrency(raw.currency)
    : typeof raw.price === "string"
      ? currencyInText(raw.price)
      : null;
  if (!currency) return { ok: false, reason: "unsupported_currency" };

  const variants = normalizeVariants(raw, currency);
  const declaredColors = [
    ...splitList(raw.color),
    ...raw.variants.map((v) => v.color).filter((c): c is string => Boolean(c)),
  ];
  const candidate = {
    id: raw.externalId ?? raw.url,
    store: context.store,
    url: raw.url,
    title: title.slice(0, 200),
    brand: raw.brand?.slice(0, 80) ?? null,
    category: inferCategory(raw),
    description: raw.description?.slice(0, 2000) ?? null,
    image_url: raw.imageUrl && /^https?:\/\//.test(raw.imageUrl) ? raw.imageUrl : null,
    price: { amount: price, currency },
    colors: inferColors(declaredColors, title).slice(0, 20),
    materials: inferMaterials(splitList(raw.material), title, raw.description).slice(0, 10),
    fit: inferFit(title, raw.description),
    availability: normalizeAvailability(raw.availability),
    variants,
    fetched_at: context.fetchedAt,
  };
  const parsed = ProductSchema.safeParse(candidate);
  return parsed.success ? { ok: true, product: parsed.data } : { ok: false, reason: "invalid" };
}

export function normalizeProduct(
  raw: RawProduct,
  context: { store: Store; fetchedAt: string },
): Product | null {
  const result = normalizeProductResult(raw, context);
  return result.ok ? result.product : null;
}
