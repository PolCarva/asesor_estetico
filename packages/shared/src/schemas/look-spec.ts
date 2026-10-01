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

/** Aspecto de la persona al que responde una razón del look. */
export const LookReasonAspectSchema = z.enum(["COLOR", "SILHOUETTE", "FACE", "HAIR", "STYLE"]);
export type LookReasonAspect = z.infer<typeof LookReasonAspectSchema>;

/** "Por qué te queda bien": una razón con su aspecto, para etiquetas como "COLOR · CÁLIDO". */
export const LookReasonSchema = z.object({
  aspect: LookReasonAspectSchema,
  /** Calificativo de 1 a 3 palabras ("cálido", "trapecio invertido"). Vacío si no hay. */
  qualifier: z.string().max(30),
  text: z.string().min(1).max(160),
});
export type LookReason = z.infer<typeof LookReasonSchema>;

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
  reasoning: z.array(LookReasonSchema).max(5),
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

/** LookSpec guardado antes del 2026-10-01: `reasoning` era texto, sin aspecto. */
const LookSpecV1Schema = LookSpecSchema.extend({ reasoning: shortList(5) });

/**
 * Lectura tolerante de `looks.spec_json`: acepta el formato actual y el anterior. Las
 * razones viejas pasan a `STYLE` sin calificativo (el aspecto no se puede saber), para
 * que un look guardado nunca aparezca bloqueado por no validar.
 */
export const StoredLookSpecSchema = z.union([
  LookSpecSchema,
  LookSpecV1Schema.transform((v1): LookSpec => ({
    ...v1,
    reasoning: v1.reasoning.map((text) => ({ aspect: "STYLE", qualifier: "", text })),
  })),
]);

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
