import { z } from "zod";

import {
  ColorSwatchSchema,
  shortList,
  StyleRiskLevelSchema,
  TattooPreferenceSchema,
} from "./common";

export const STYLE_PROFILE_SCHEMA_VERSION = 1;

/**
 * Perfil de estilo del usuario. Lo produce el análisis de IA y se guarda en
 * style_profiles.profile_json. Datos estructurados antes que texto libre.
 */
export const StyleProfileSchema = z.object({
  schema_version: z.literal(STYLE_PROFILE_SCHEMA_VERSION),
  appearance: z.object({
    presentation: z.enum(["MASCULINE", "FEMININE", "ANDROGYNOUS"]),
    age_range: z.enum(["18_24", "25_34", "35_44", "45_54", "55_PLUS"]),
    face_shape: z.enum(["OVAL", "ROUND", "SQUARE", "RECTANGLE", "HEART", "DIAMOND", "TRIANGLE"]),
    skin_tone: z.enum(["VERY_LIGHT", "LIGHT", "MEDIUM", "TAN", "DEEP", "VERY_DEEP"]),
    skin_undertone: z.enum(["WARM", "COOL", "NEUTRAL", "OLIVE"]),
    contrast_level: z.enum(["LOW", "MEDIUM", "HIGH"]),
    eye_color: z.string().max(40).nullable(),
  }),
  hair: z.object({
    color: z.string().max(60),
    texture: z.enum(["STRAIGHT", "WAVY", "CURLY", "COILY"]),
    length: z.enum(["BALD", "BUZZ", "SHORT", "MEDIUM", "LONG"]),
    current_style: z.string().max(120),
    recommended_styles: shortList(5),
  }),
  grooming: z.object({
    current: z.string().max(160),
    recommendations: shortList(6),
  }),
  colors: z.object({
    season: z.string().max(40).nullable(),
    best: z.array(ColorSwatchSchema).min(1).max(12),
    neutrals: z.array(ColorSwatchSchema).max(8),
    avoid: z.array(ColorSwatchSchema).max(8),
  }),
  body_proportions: z.object({
    frame: z.enum(["PETITE", "AVERAGE", "TALL"]),
    balance_notes: shortList(5),
  }),
  clothing: z.object({
    current_style: z.string().max(160),
    recommended_categories: shortList(8),
  }),
  fits: z.object({ recommended: shortList(6), avoid: shortList(6) }),
  materials: z.object({ recommended: shortList(6), avoid: shortList(6) }),
  shoes: z.object({ recommended: shortList(6) }),
  accessories: z.object({ recommended: shortList(6) }),
  tattoos: z.object({
    present: z.boolean(),
    visible_areas: shortList(6),
    preference: TattooPreferenceSchema,
  }),
  strengths: shortList(6),
  avoid: shortList(6),
  style_direction: z.object({
    primary: z.string().min(1).max(60),
    secondary: z.string().max(60).nullable(),
    keywords: shortList(8),
    risk_level: StyleRiskLevelSchema,
  }),
});
export type StyleProfile = z.infer<typeof StyleProfileSchema>;
