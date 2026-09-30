import { z } from "zod";

export const StyleRiskLevelSchema = z.enum(["CONSERVATIVE", "BALANCED", "BOLD"]);
export type StyleRiskLevel = z.infer<typeof StyleRiskLevelSchema>;

/** Qué hacer con los tatuajes visibles en los looks. */
export const TattooPreferenceSchema = z.enum(["HIGHLIGHT", "NEUTRAL", "COVER"]);
export type TattooPreference = z.infer<typeof TattooPreferenceSchema>;

export const CurrencySchema = z.enum(["UYU", "USD"]);
export type Currency = z.infer<typeof CurrencySchema>;

export const MoneySchema = z.object({
  amount: z.number().nonnegative(),
  currency: CurrencySchema,
});
export type Money = z.infer<typeof MoneySchema>;

export const ColorSwatchSchema = z.object({
  name: z.string().min(1).max(60),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type ColorSwatch = z.infer<typeof ColorSwatchSchema>;

/** Lista corta de strings: evita que la IA devuelva párrafos largos. */
export const shortList = (max = 8) => z.array(z.string().min(1).max(160)).max(max);

export const ProductCategorySchema = z.enum([
  "SHIRT",
  "T_SHIRT",
  "KNITWEAR",
  "TOP",
  "OUTERWEAR",
  "BLAZER",
  "PANTS",
  "JEANS",
  "SHORTS",
  "SKIRT",
  "DRESS",
  "SHOES",
  "BAG",
  "BELT",
  "JEWELRY",
  "EYEWEAR",
  "WATCH",
  "HAT",
  "SCARF",
  "OTHER",
]);
export type ProductCategory = z.infer<typeof ProductCategorySchema>;
