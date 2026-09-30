import type {
  Garment,
  Money,
  Product,
  ProductCategory,
  RankedProduct,
  RankingFactor,
  ScoreBreakdown,
  ShoppingQuery,
} from "@asesor/shared";

import { normalizeText } from "./normalize";

export type RankingWeights = Record<RankingFactor, number>;

/** Pesos iniciales. Suman 1. Se ajustarán con datos reales de clics. */
export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  category_match: 0.25,
  visual_similarity: 0.15,
  color_match: 0.2,
  fit_match: 0.08,
  material_match: 0.07,
  size_available: 0.1,
  stock: 0.1,
  price: 0.05,
};

/** Conversión aproximada solo para comparar precios al rankear; nunca se muestra. */
export const APPROX_UYU_PER_USD = 40;

const CATEGORY_GROUPS: ProductCategory[][] = [
  ["SHIRT", "T_SHIRT", "TOP", "KNITWEAR"],
  ["OUTERWEAR", "BLAZER", "KNITWEAR"],
  ["PANTS", "JEANS", "SHORTS", "SKIRT"],
];

const tokens = (text: string) =>
  new Set(
    normalizeText(text)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  );

function jaccard(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const t of a) if (b.has(t)) common++;
  return common / (a.size + b.size - common);
}

const toUyu = (money: Money) =>
  money.currency === "USD" ? money.amount * APPROX_UYU_PER_USD : money.amount;

function categoryScore(garment: Garment, product: Product) {
  if (garment.category === product.category) return 1;
  const related = CATEGORY_GROUPS.some(
    (g) => g.includes(garment.category) && g.includes(product.category),
  );
  return related ? 0.5 : 0;
}

function listScore(target: string | null, values: string[]) {
  if (!target) return 0.5;
  if (values.length === 0) return 0.5;
  const t = normalizeText(target);
  const normalized = values.map(normalizeText);
  if (normalized.some((v) => v === t || v.includes(t) || t.includes(v))) return 1;
  return jaccard(tokens(target), tokens(values.join(" "))) > 0 ? 0.5 : 0;
}

function sizeScore(size: string | null, product: Product) {
  if (!size) return 0.5;
  if (product.variants.length === 0) return 0.5;
  const match = product.variants.filter(
    (v) => v.size && normalizeText(v.size) === normalizeText(size),
  );
  if (match.length === 0) return 0;
  return match.some((v) => v.availability === "IN_STOCK") ? 1 : 0.25;
}

const STOCK_SCORE = { IN_STOCK: 1, IN_STORE_ONLY: 0.6, UNKNOWN: 0.4, OUT_OF_STOCK: 0 } as const;

function priceScore(product: Product, query: ShoppingQuery, range: { min: number; max: number }) {
  const price = toUyu(product.price);
  if (query.max_price) {
    const max = toUyu(query.max_price);
    return price <= max ? 1 : Math.max(0, 1 - (price - max) / max);
  }
  if (range.max === range.min) return 1;
  return 1 - (price - range.min) / (range.max - range.min);
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Ordena productos para una prenda. Cada factor puntúa entre 0 y 1 y el score
 * final es el promedio ponderado. Descarta productos de categoría no relacionada.
 * visual_similarity hoy compara texto; se reemplazará por embeddings de imagen.
 */
export function rankProducts(
  products: Product[],
  query: ShoppingQuery,
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS,
): RankedProduct[] {
  const garment = query.garment;
  const prices = products.map((p) => toUyu(p.price));
  const range = { min: Math.min(...prices), max: Math.max(...prices) };
  const garmentTokens = tokens(`${garment.description} ${garment.material ?? ""}`);
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  return products
    .map((product) => {
      const breakdown: ScoreBreakdown = {
        category_match: categoryScore(garment, product),
        visual_similarity: jaccard(
          garmentTokens,
          tokens(`${product.title} ${product.description ?? ""}`),
        ),
        color_match: listScore(garment.color.name, product.colors),
        fit_match: listScore(garment.fit, product.fit ? [product.fit] : []),
        material_match: listScore(garment.material, product.materials),
        size_available: sizeScore(query.size, product),
        stock: STOCK_SCORE[product.availability],
        price: priceScore(product, query, range),
      };
      const weighted = (Object.keys(weights) as RankingFactor[]).reduce(
        (sum, factor) => sum + weights[factor] * (breakdown[factor] ?? 0),
        0,
      );
      const rounded = Object.fromEntries(
        Object.entries(breakdown).map(([k, v]) => [k, round(v)]),
      ) as ScoreBreakdown;
      return { product, breakdown: rounded, score: round(weighted / totalWeight) };
    })
    .filter((item) => item.breakdown.category_match > 0)
    .sort((a, b) => b.score - a.score);
}
