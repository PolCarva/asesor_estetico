import { z } from "zod";

import { CurrencySchema, MoneySchema, ProductCategorySchema } from "./common";
import { GarmentSchema, GarmentSlotSchema } from "./look-spec";

export const ProductAvailabilitySchema = z.enum([
  "IN_STOCK",
  "OUT_OF_STOCK",
  "UNKNOWN",
  "IN_STORE_ONLY",
]);
export type ProductAvailability = z.infer<typeof ProductAvailabilitySchema>;

export const StoreSchema = z.object({
  name: z.string().min(1).max(80),
  domain: z.string().min(3).max(120),
});
export type Store = z.infer<typeof StoreSchema>;

export const ProductVariantSchema = z.object({
  id: z.string().min(1).max(120),
  sku: z.string().max(80).nullable(),
  size: z.string().max(20).nullable(),
  color: z.string().max(60).nullable(),
  availability: ProductAvailabilitySchema,
  price: MoneySchema.nullable(),
});
export type ProductVariant = z.infer<typeof ProductVariantSchema>;

/** Producto normalizado de una tienda externa. */
export const ProductSchema = z.object({
  id: z.string().min(1).max(120),
  store: StoreSchema,
  url: z.url({ protocol: /^https?$/ }),
  title: z.string().min(1).max(200),
  brand: z.string().max(80).nullable(),
  category: ProductCategorySchema,
  description: z.string().max(2000).nullable(),
  image_url: z.url({ protocol: /^https?$/ }).nullable(),
  price: MoneySchema,
  colors: z.array(z.string().max(60)).max(20),
  materials: z.array(z.string().max(60)).max(10),
  fit: z.string().max(60).nullable(),
  availability: ProductAvailabilitySchema,
  variants: z.array(ProductVariantSchema).max(100),
  fetched_at: z.iso.datetime({ offset: true }),
});
export type Product = z.infer<typeof ProductSchema>;

/** Público de la prenda. `null` = sin filtro (unisex o no se sabe). */
export const ShoppingAudienceSchema = z.enum(["MEN", "WOMEN"]);
export type ShoppingAudience = z.infer<typeof ShoppingAudienceSchema>;

/**
 * Qué buscar para una prenda de un look. Los campos nuevos (paso 03) tienen default para
 * que los payloads viejos sigan validando; `buildShoppingQueries` los completa.
 */
export const ShoppingQuerySchema = z.object({
  garment: GarmentSchema,
  country_code: z.literal("UY"),
  size: z.string().max(20).nullable(),
  max_price: z.object({ amount: z.number().positive(), currency: CurrencySchema }).nullable(),
  limit: z.number().int().min(1).max(20),
  /** Slot del look al que corresponde la prenda. */
  slot: GarmentSlotSchema.nullable().default(null),
  /** Términos en español rioplatense, del más específico al más general. */
  search_terms: z.array(z.string().min(1).max(80)).max(8).default([]),
  audience: ShoppingAudienceSchema.nullable().default(null),
  /** true: `max_price` es un tope duro (se descarta lo que lo supera), no solo un factor. */
  strict_max_price: z.boolean().default(false),
});
export type ShoppingQuery = z.infer<typeof ShoppingQuerySchema>;
export type ShoppingQueryInput = z.input<typeof ShoppingQuerySchema>;

export const RANKING_FACTORS = [
  "category_match",
  "visual_similarity",
  "color_match",
  "fit_match",
  "material_match",
  "size_available",
  "stock",
  "price",
] as const;
export const RankingFactorSchema = z.enum(RANKING_FACTORS);
export type RankingFactor = z.infer<typeof RankingFactorSchema>;

/** Puntaje de cada factor entre 0 y 1. */
export const ScoreBreakdownSchema = z.record(RankingFactorSchema, z.number().min(0).max(1));
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

export const RankedProductSchema = z.object({
  product: ProductSchema,
  score: z.number().min(0).max(1),
  breakdown: ScoreBreakdownSchema,
});
export type RankedProduct = z.infer<typeof RankedProductSchema>;

export const ShoppingResultSchema = z.object({
  query: ShoppingQuerySchema,
  items: z.array(RankedProductSchema),
  source: z.enum(["LIVE", "CACHE"]),
  generated_at: z.iso.datetime({ offset: true }),
});
export type ShoppingResult = z.infer<typeof ShoppingResultSchema>;
