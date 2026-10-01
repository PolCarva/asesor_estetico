import {
  applyTermAliases,
  type Garment,
  type Money,
  normalizeText,
  type Product,
  type ProductCategory,
  type RankedProduct,
  type RankingFactor,
  type ScoreBreakdown,
  type ShoppingQuery,
  sizeKindForCategory,
  sizeMatches,
  type SizeStatus,
  sizeSystem,
  synonymsOf,
} from "@asesor/shared";

import { colorsIn, inferFit } from "./normalize";
import { COLOR_HEX, MATERIAL_PATTERNS } from "./vocabulary";

export type RankingWeights = Record<RankingFactor, number>;

/**
 * Pesos del ranking (suman 1). La prioridad es "qué tan bien reproduce el outfit": los
 * factores estéticos (categoría, estilo, color, fit, material) suman 0.77; la
 * disponibilidad (talle y stock), 0.18; el precio es secundario, 0.05. Justificación en
 * `docs/SHOPPING_ENGINE.md` (D11).
 */
export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  category_match: 0.2,
  visual_similarity: 0.18,
  color_match: 0.2,
  fit_match: 0.12,
  material_match: 0.07,
  size_available: 0.1,
  stock: 0.08,
  price: 0.05,
};

/** Conversión aproximada solo para comparar precios al rankear; nunca se muestra. */
export const APPROX_UYU_PER_USD = 40;

/** Penalización por cada producto de la misma tienda que ya quedó más arriba. */
export const STORE_DIVERSITY_PENALTY = 0.03;

const round = (n: number) => Math.round(n * 10_000) / 10_000;
const clamp = (n: number) => Math.min(1, Math.max(0, n));

const toUyu = (money: Money) =>
  money.currency === "USD" ? money.amount * APPROX_UYU_PER_USD : money.amount;

// --- Categoría -------------------------------------------------------------------------

const CATEGORY_GROUPS: ProductCategory[][] = [
  ["SHIRT", "T_SHIRT", "TOP", "KNITWEAR"],
  ["OUTERWEAR", "BLAZER", "KNITWEAR"],
  ["PANTS", "JEANS", "SHORTS", "SKIRT"],
];

function categoryScore(garment: Garment, product: Product) {
  if (garment.category === product.category) return 1;
  const related = CATEGORY_GROUPS.some(
    (g) => g.includes(garment.category) && g.includes(product.category),
  );
  return related ? 0.5 : 0;
}

// --- Estilo: lo que pide la prenda, liso o estampado ----------------------------------

/** Palabras de estampado y de liso (sin tildes). */
const PRINT =
  /\b(estampad[oa]s?|print(ed)?|rayad[oa]s?|rayas|cuadros|cuadrille|escoces[ao]|floral|flores|lunares|logo|grafic[oa]s?|graphic|dibujos?|camuflad[oa]|camo|tie ?dye|jacquard|team|bordad[oa]s?|stripes?|striped|checks?|checked|plaid|tartan)\b/;
const PLAIN = /\b(lis[oa]s?|basic[oa]s?|basic|plain)\b/;

const STYLE_STOPWORDS = new Set(
  "de del la el los las con sin y o a en para por un una al tipo estilo corte look color".split(
    " ",
  ),
);

const stem = (word: string) => word.slice(0, 5);

/** Palabras que describen la prenda, sin color, fit ni estampado (tienen su propio factor). */
function descriptorWords(garment: Garment): string[] {
  const colorWords = new Set(normalizeText(garment.color.name).split(" ").map(stem));
  return applyTermAliases(garment.description)
    .split(/[^a-z0-9-]+/)
    .filter(
      (w) =>
        w.length > 2 &&
        !STYLE_STOPWORDS.has(w) &&
        !colorWords.has(stem(w)) &&
        colorsIn(w).length === 0 &&
        !inferFit(w, null) &&
        !PRINT.test(w) &&
        !PLAIN.test(w),
    );
}

/** Texto del producto donde se busca el estilo: título y el comienzo de la descripción. */
const productText = (product: Product) =>
  ` ${normalizeText(`${product.title} ${(product.description ?? "").slice(0, 400)}`).replace(/[^a-z0-9]+/g, " ")} `;

/**
 * Similitud de estilo (reemplaza al Jaccard de texto): qué parte de lo que describe la
 * prenda aparece en el producto (con sinónimos y raíz corta), y si el estampado coincide.
 * Pedir liso y recibir estampado castiga fuerte; liso declarado suma.
 */
function styleScore(garment: Garment, product: Product) {
  const text = productText(product);
  const words = [...new Set(descriptorWords(garment))];
  const found = words.filter((w) => synonymsOf(w).some((s) => text.includes(` ${stem(s)}`))).length;
  let score = words.length > 0 ? 0.25 + 0.75 * (found / words.length) : 0.5;

  const wanted = normalizeText(`${garment.pattern ?? ""} ${garment.description}`);
  const wantsPrint = PRINT.test(wanted) && !PLAIN.test(normalizeText(garment.pattern ?? ""));
  const hasPrint = PRINT.test(text);
  const saysPlain = PLAIN.test(text);
  if (!wantsPrint) {
    if (hasPrint) score *= 0.4;
    else if (saysPlain) score += 0.15;
  } else if (hasPrint) {
    score += 0.15;
  } else if (saysPlain) {
    score *= 0.5;
  }
  return clamp(score);
}

// --- Color: nombre o cercanía de hex ----------------------------------------------------

function hexToLab(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [channel((n >> 16) & 255), channel((n >> 8) & 255), channel(n & 255)];
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** Distancia perceptual (CIE76) entre dos colores hex. */
export function colorDistance(a: string, b: string): number | null {
  const [la, lb] = [hexToLab(a), hexToLab(b)];
  if (!la || !lb) return null;
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

/**
 * 1 si el producto tiene el color de la prenda (nombre canónico); si no, la cercanía del
 * hex más parecido (hasta 0.85: otro color nunca empata con el pedido). Sin colores
 * reconocibles ("Magical Forest") no se sabe: 0.5.
 */
function colorScore(garment: Garment, product: Product) {
  if (product.colors.length === 0) return 0.5;
  const wanted = colorsIn(garment.color.name)[0] ?? normalizeText(garment.color.name);
  const known = product.colors
    .map((c) => (COLOR_HEX[c] ? c : (colorsIn(c)[0] ?? null)))
    .filter((c): c is string => c !== null && Boolean(COLOR_HEX[c]));
  if (known.includes(wanted)) return 1;
  if (known.length === 0) return 0.5;
  const best = Math.max(
    ...known.map((c) => {
      const distance = colorDistance(garment.color.hex, COLOR_HEX[c]!);
      return distance === null ? 0 : clamp(1 - distance / 60);
    }),
  );
  return 0.85 * best;
}

// --- Fit y material ------------------------------------------------------------------

const FIT_FAMILY: Record<string, "tight" | "straight" | "loose"> = {
  skinny: "tight",
  slim: "tight",
  recto: "straight",
  regular: "straight",
  relajado: "loose",
  ancho: "loose",
  oversize: "loose",
  boxy: "loose",
};

/** Fit canónico de la prenda: el que dice `fit` ("relaxed", "entallado") o la descripción. */
function garmentFit(garment: Garment): string | null {
  return inferFit(garment.fit, null) ?? inferFit(garment.description, null);
}

/** Mismo fit 1; misma familia 0.75; recto contra otro 0.4; ajustado contra holgado 0. */
function fitScore(garment: Garment, product: Product) {
  const wanted = garmentFit(garment);
  if (!wanted || !product.fit) return 0.5;
  if (wanted === product.fit) return 1;
  const [a, b] = [FIT_FAMILY[wanted], FIT_FAMILY[product.fit]];
  if (!a || !b) return 0.5;
  if (a === b) return 0.75;
  return a === "straight" || b === "straight" ? 0.4 : 0;
}

const MATERIAL_FAMILIES: string[][] = [
  ["lana", "cashmere", "tweed", "franela"],
  ["algodón", "piqué", "denim", "gabardina", "lona", "pana"],
  ["cuero", "gamuza", "cuero sintético"],
  ["poliéster", "nylon", "elastano", "acrílico"],
  ["seda", "viscosa", "lyocell", "terciopelo"],
  ["lino"],
];

function materialsIn(text: string): string[] {
  const t = normalizeText(text);
  return MATERIAL_PATTERNS.filter(([, pattern]) => pattern.test(t)).map(([value]) => value);
}

/** Material pedido presente 1; de la misma familia 0.5; otro 0.15; sin dato 0.5. */
function materialScore(garment: Garment, product: Product) {
  const wanted = materialsIn(garment.material ?? "");
  if (wanted.length === 0 || product.materials.length === 0) return 0.5;
  if (wanted.some((m) => product.materials.includes(m))) return 1;
  const related = wanted.some((m) =>
    MATERIAL_FAMILIES.some((f) => f.includes(m) && product.materials.some((p) => f.includes(p))),
  );
  return related ? 0.5 : 0.15;
}

// --- Talle, stock y precio ------------------------------------------------------------

/** Qué pasa con el talle del usuario en este producto (para el score y para la UI). */
export function sizeStatusFor(query: ShoppingQuery, product: Product): SizeStatus {
  if (!sizeKindForCategory(query.garment.category)) return "NOT_APPLICABLE";
  if (!query.size) return "NOT_REQUESTED";
  const sized = product.variants.filter((v) => v.size);
  if (sized.length === 0) return "UNVERIFIED";
  const match = sized.filter((v) => sizeMatches(query.size, v.size));
  if (match.length === 0) {
    // Otro sistema de talles (42 EU contra cintura 32/30 en pulgadas): no se puede saber.
    const user = sizeSystem(query.size);
    return sized.some((v) => sizeSystem(v.size) === user) ? "NOT_OFFERED" : "UNVERIFIED";
  }
  if (match.some((v) => v.availability === "IN_STOCK" || v.availability === "IN_STORE_ONLY")) {
    return "AVAILABLE";
  }
  return match.every((v) => v.availability === "OUT_OF_STOCK") ? "OUT_OF_STOCK" : "UNVERIFIED";
}

const SIZE_SCORE: Record<SizeStatus, number> = {
  AVAILABLE: 1,
  UNVERIFIED: 0.4,
  OUT_OF_STOCK: 0.1,
  NOT_OFFERED: 0,
  NOT_REQUESTED: 0.5,
  NOT_APPLICABLE: 0.5,
};

const STOCK_SCORE = { IN_STOCK: 1, IN_STORE_ONLY: 0.6, UNKNOWN: 0.4, OUT_OF_STOCK: 0 } as const;

/** Precio: secundario. Con máximo, 1 si entra; sin máximo, relativo dentro del pool. */
function priceScore(price: Money, query: ShoppingQuery, range: { min: number; max: number }) {
  const amount = toUyu(price);
  if (query.max_price) {
    const max = toUyu(query.max_price);
    return amount <= max ? 1 : clamp(1 - (amount - max) / max);
  }
  if (range.max === range.min) return 1;
  return 1 - (amount - range.min) / (range.max - range.min);
}

/**
 * ¿Es más barato que el máximo estricto ("Buscar más barato": precio menor, no igual)? Sin
 * precio no se puede saber: queda afuera. Entre monedas distintas compara con la conversión
 * aproximada: solo para filtrar, nunca para mostrar.
 */
function withinStrictMax(product: Product, query: ShoppingQuery) {
  if (!query.strict_max_price || !query.max_price) return true;
  return product.price !== null && toUyu(product.price) < toUyu(query.max_price);
}

/** Reordena levemente para que una tienda no acapare el top (el score no cambia). */
function diversify(items: RankedProduct[], penalty: number): RankedProduct[] {
  const pending = [...items];
  const perStore = new Map<string, number>();
  const out: RankedProduct[] = [];
  while (pending.length > 0) {
    let best = 0;
    let bestValue = -Infinity;
    pending.forEach((item, i) => {
      const value = item.score - penalty * (perStore.get(item.product.store.domain) ?? 0);
      if (value > bestValue) {
        bestValue = value;
        best = i;
      }
    });
    const [item] = pending.splice(best, 1);
    perStore.set(item!.product.store.domain, (perStore.get(item!.product.store.domain) ?? 0) + 1);
    out.push(item!);
  }
  return out;
}

export interface RankOptions {
  weights?: RankingWeights;
  /** Penalización por tienda repetida en el top (0 = orden estricto por score). */
  diversity?: number;
}

/**
 * Ordena el pool de productos para una prenda y un pedido (talle y precio del usuario).
 * Cada factor puntúa entre 0 y 1 y el score es el promedio ponderado; un producto sin
 * precio (local físico) se rankea sin el factor de precio. Descarta categorías no
 * relacionadas y, con `strict_max_price`, lo que supera el máximo. Puro: se puede
 * re-rankear el mismo pool cacheado para cada usuario.
 */
export function rankProducts(
  products: Product[],
  query: ShoppingQuery,
  options: RankOptions | RankingWeights = {},
): RankedProduct[] {
  const { weights = DEFAULT_RANKING_WEIGHTS, diversity = STORE_DIVERSITY_PENALTY } =
    "category_match" in options ? { weights: options } : options;
  const garment = query.garment;
  const pool = products.filter((p) => withinStrictMax(p, query));
  const prices = pool.flatMap((p) => (p.price ? [toUyu(p.price)] : []));
  const range = { min: Math.min(...prices), max: Math.max(...prices) };

  const ranked = pool
    .map((product): RankedProduct => {
      const sizeStatus = sizeStatusFor(query, product);
      const breakdown: ScoreBreakdown = {
        category_match: categoryScore(garment, product),
        visual_similarity: styleScore(garment, product),
        color_match: colorScore(garment, product),
        fit_match: fitScore(garment, product),
        material_match: materialScore(garment, product),
        size_available: SIZE_SCORE[sizeStatus],
        stock: STOCK_SCORE[product.availability],
        // Sin precio publicado el factor no aplica (y no se cuenta en el promedio).
        price: product.price ? priceScore(product.price, query, range) : 0,
      };
      const factors = (Object.keys(weights) as RankingFactor[]).filter(
        (f) => f !== "price" || product.price !== null,
      );
      const total = factors.reduce((sum, f) => sum + weights[f], 0);
      const weighted = factors.reduce((sum, f) => sum + weights[f] * (breakdown[f] ?? 0), 0);
      const rounded = Object.fromEntries(
        Object.entries(breakdown).map(([k, v]) => [k, round(v)]),
      ) as ScoreBreakdown;
      return {
        product,
        breakdown: rounded,
        score: round(total > 0 ? weighted / total : 0),
        size_status: sizeStatus,
      };
    })
    .filter((item) => item.breakdown.category_match > 0)
    .sort((a, b) => b.score - a.score);
  return diversity > 0 ? diversify(ranked, diversity) : ranked;
}
