import {
  CurrencySchema,
  type Product,
  type ProductAvailability,
  type ProductCategory,
  ProductCategorySchema,
  ProductSchema,
  type Store,
} from "@asesor/shared";

import type { RawProduct } from "./types";

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
  const v = value.replace(/^https?:\/\/schema\.org\//i, "").toLowerCase();
  if (v === "instock" || v === "limitedavailability" || v === "onlineonly") return "IN_STOCK";
  if (v === "outofstock" || v === "soldout" || v === "discontinued") return "OUT_OF_STOCK";
  if (v === "instoreonly") return "IN_STORE_ONLY";
  return "UNKNOWN";
}

const CATEGORY_KEYWORDS: Array<[ProductCategory, RegExp]> = [
  ["T_SHIRT", /\b(remera|t-?shirt|camiseta)\b/],
  ["SHIRT", /\b(camisa|shirt)\b/],
  ["KNITWEAR", /\b(sweater|buzo|cardigan|punto|pullover)\b/],
  ["BLAZER", /\b(blazer|saco)\b/],
  ["OUTERWEAR", /\b(campera|chaqueta|abrigo|tapado|overshirt|parka|jacket)\b/],
  ["JEANS", /\b(jean|jeans|denim)\b/],
  ["PANTS", /\b(pantalon|chino|jogger|trousers)\b/],
  ["SHORTS", /\b(short|bermuda)\b/],
  ["SKIRT", /\b(pollera|falda|skirt)\b/],
  ["DRESS", /\b(vestido|dress|enterito)\b/],
  ["SHOES", /\b(zapato|zapatilla|bota|botin|boots?|loafers?|mocasin|sandalia|sneakers?)\b/],
  ["BAG", /\b(cartera|bolso|mochila|bag)\b/],
  ["BELT", /\b(cinto|cinturon|belt)\b/],
  ["WATCH", /\b(reloj|watch)\b/],
  ["EYEWEAR", /\b(lentes|anteojos|gafas)\b/],
  ["HAT", /\b(gorro|gorra|sombrero|hat)\b/],
  ["SCARF", /\b(bufanda|panuelo|scarf)\b/],
  ["JEWELRY", /\b(collar|anillo|pulsera|aros|caravanas)\b/],
];

export function inferCategory(raw: Pick<RawProduct, "category" | "title">): ProductCategory {
  const declared = raw.category?.toUpperCase().replace(/[\s-]/g, "_");
  const parsed = ProductCategorySchema.safeParse(declared);
  if (parsed.success) return parsed.data;
  const text = normalizeText(`${raw.category ?? ""} ${raw.title ?? ""}`);
  return CATEGORY_KEYWORDS.find(([, pattern]) => pattern.test(text))?.[0] ?? "OTHER";
}

const splitList = (value: string | null) =>
  value
    ? value
        .split(/[,/]| y /)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : [];

/**
 * Convierte datos crudos en un Product validado. Devuelve null si faltan datos
 * esenciales (título, precio, moneda soportada).
 */
export function normalizeProduct(
  raw: RawProduct,
  context: { store: Store; fetchedAt: string },
): Product | null {
  const currency = CurrencySchema.safeParse(raw.currency?.toUpperCase());
  if (!raw.title || raw.price === null || !currency.success) return null;

  const variants = raw.variants.map((variant, i) => ({
    id: variant.id ?? `${raw.externalId ?? raw.url}#${i}`,
    sku: variant.sku,
    size: variant.size,
    color: variant.color?.toLowerCase() ?? null,
    availability: normalizeAvailability(variant.availability),
    price: variant.price === null ? null : { amount: variant.price, currency: currency.data },
  }));

  const variantColors = variants.map((v) => v.color).filter((c): c is string => Boolean(c));
  const candidate = {
    id: raw.externalId ?? raw.url,
    store: context.store,
    url: raw.url,
    title: raw.title.slice(0, 200),
    brand: raw.brand,
    category: inferCategory(raw),
    description: raw.description?.slice(0, 2000) ?? null,
    image_url: raw.imageUrl,
    price: { amount: raw.price, currency: currency.data },
    colors: [...new Set([...splitList(raw.color), ...variantColors])],
    materials: splitList(raw.material),
    fit: null,
    availability: normalizeAvailability(raw.availability),
    variants,
    fetched_at: context.fetchedAt,
  };
  const parsed = ProductSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
