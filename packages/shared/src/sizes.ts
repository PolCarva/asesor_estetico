import { z } from "zod";

import type { ProductCategory } from "./schemas/common";

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

/** Talle del usuario para una categoría, o null si no aplica o no lo cargó. */
export function sizeForCategory(sizes: UserSizes, category: ProductCategory): string | null {
  const kind = sizeKindForCategory(category);
  return kind ? sizes[kind] : null;
}
