import { z } from "zod";

import {
  ColorSwatchSchema,
  ProductCategorySchema,
  shortList,
  StyleRiskLevelSchema,
} from "./common";

/** Una prenda o accesorio dentro de un look. Es la base de la búsqueda de productos. */
export const GarmentSchema = z.object({
  category: ProductCategorySchema,
  description: z.string().min(1).max(160),
  color: ColorSwatchSchema,
  fit: z.string().max(60).nullable(),
  material: z.string().max(60).nullable(),
  pattern: z.string().max(60).nullable(),
});
export type Garment = z.infer<typeof GarmentSchema>;

export const LookSpecSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  concept: z.string().min(1).max(240),
  risk_level: StyleRiskLevelSchema,
  hair: z.object({ style: z.string().max(120), notes: z.string().max(200).nullable() }),
  grooming: z.object({ description: z.string().max(200) }),
  top: GarmentSchema,
  /** null cuando la prenda superior cubre todo (vestido, enterito). */
  bottom: GarmentSchema.nullable(),
  layering: z.array(GarmentSchema).max(3),
  shoes: GarmentSchema,
  accessories: z.array(GarmentSchema).max(5),
  tattoos: z.object({
    visibility: z.enum(["VISIBLE", "PARTIAL", "COVERED", "NOT_APPLICABLE"]),
  }),
  palette: z.array(ColorSwatchSchema).min(1).max(6),
  fit: z.object({ overall: z.string().max(80), notes: shortList(4) }),
  reasoning: shortList(5),
  avoid: shortList(5),
  /** Datos para construir el prompt de imagen; no se muestran al usuario. */
  image_prompt_data: z.object({
    setting: z.string().max(120),
    pose: z.string().max(80),
    lighting: z.string().max(80),
    framing: z.enum(["FULL_BODY", "THREE_QUARTER", "PORTRAIT"]),
    preserve_identity: z.literal(true),
  }),
});
export type LookSpec = z.infer<typeof LookSpecSchema>;

/** Slots de un look en los que se pueden asociar productos. */
export const GarmentSlotSchema = z
  .string()
  .regex(/^(top|bottom|shoes|layering:[0-2]|accessory:[0-4])$/);
export type GarmentSlot = z.infer<typeof GarmentSlotSchema>;

export function listLookGarments(look: LookSpec): Array<{ slot: GarmentSlot; garment: Garment }> {
  const garments: Array<{ slot: GarmentSlot; garment: Garment }> = [
    { slot: "top", garment: look.top },
  ];
  if (look.bottom) garments.push({ slot: "bottom", garment: look.bottom });
  look.layering.forEach((garment, i) => garments.push({ slot: `layering:${i}`, garment }));
  garments.push({ slot: "shoes", garment: look.shoes });
  look.accessories.forEach((garment, i) => garments.push({ slot: `accessory:${i}`, garment }));
  return garments;
}
