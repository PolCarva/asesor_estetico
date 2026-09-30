import {
  ChatMessageSchema,
  LookSpecSchema,
  PhotoValidationResultSchema,
  StyleProfileSchema,
  StyleRiskLevelSchema,
  TattooPreferenceSchema,
  UserPhotoTypeSchema,
} from "@asesor/shared";
import { z } from "zod";

/**
 * Imagen de entrada: data URL (base64) o URL firmada de corta duración. Nunca una
 * URL pública. El worker usa data URLs porque el Storage local no es accesible
 * desde el proveedor.
 */
export const AIImageInputSchema = z.object({
  photo_id: z.uuid(),
  type: UserPhotoTypeSchema,
  url: z
    .string()
    .refine(
      (v) => /^data:image\/(jpeg|png|webp);base64,/.test(v) || /^https?:\/\//.test(v),
      "Debe ser una data URL de imagen o una URL http(s)",
    ),
});
export type AIImageInput = z.infer<typeof AIImageInputSchema>;

export const StylePreferencesSchema = z.object({
  risk_level: StyleRiskLevelSchema,
  tattoo_preference: TattooPreferenceSchema,
});

export const ValidatePhotosInputSchema = z.object({
  photos: z.array(AIImageInputSchema).min(1).max(4),
});
export type ValidatePhotosInput = z.infer<typeof ValidatePhotosInputSchema>;

export const ValidatePhotosOutputSchema = z.object({
  results: z.array(PhotoValidationResultSchema).min(1),
  can_continue: z.boolean(),
});
export type ValidatePhotosOutput = z.infer<typeof ValidatePhotosOutputSchema>;

export const AnalyzeStyleProfileInputSchema = z.object({
  photos: z.array(AIImageInputSchema).min(1).max(4),
  preferences: StylePreferencesSchema,
  country_code: z.literal("UY"),
});
export type AnalyzeStyleProfileInput = z.infer<typeof AnalyzeStyleProfileInputSchema>;

export const AnalyzeStyleProfileOutputSchema = StyleProfileSchema;

export const GenerateLookSpecsInputSchema = z.object({
  style_profile: StyleProfileSchema,
  preferences: StylePreferencesSchema,
  count: z.literal(3),
});
export type GenerateLookSpecsInput = z.infer<typeof GenerateLookSpecsInputSchema>;

export const GenerateLookSpecsOutputSchema = z.object({
  looks: z.array(LookSpecSchema).length(3),
});
export type GenerateLookSpecsOutput = z.infer<typeof GenerateLookSpecsOutputSchema>;

export const GenerateLookImageInputSchema = z.object({
  look: LookSpecSchema,
  reference_photos: z.array(AIImageInputSchema).min(1).max(4),
  /** PREVIEW: imagen chica para teaser/bloqueado. FULL: imagen final. */
  variant: z.enum(["PREVIEW", "FULL"]),
});
export type GenerateLookImageInput = z.infer<typeof GenerateLookImageInputSchema>;

export const GenerateLookImageOutputSchema = z.object({
  mime_type: z.enum(["image/png", "image/jpeg", "image/webp"]),
  base64: z.base64().min(1),
  /** null si el formato no permite leer las dimensiones. */
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});
export type GenerateLookImageOutput = z.infer<typeof GenerateLookImageOutputSchema>;

export const ChatWithStyleAdvisorInputSchema = z.object({
  style_profile: StyleProfileSchema,
  looks: z.array(LookSpecSchema).max(3),
  history: z.array(ChatMessageSchema).max(40),
  message: z.string().min(1).max(2000),
});
export type ChatWithStyleAdvisorInput = z.infer<typeof ChatWithStyleAdvisorInputSchema>;

export const ChatWithStyleAdvisorOutputSchema = z.object({
  reply: z.string().min(1).max(4000),
  suggestions: z.array(z.string().max(120)).max(4),
});
export type ChatWithStyleAdvisorOutput = z.infer<typeof ChatWithStyleAdvisorOutputSchema>;
