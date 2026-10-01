import { z } from "zod";

import {
  ColorSwatchSchema,
  shortList,
  StyleRiskLevelSchema,
  TattooPreferenceSchema,
} from "./common";

export const STYLE_PROFILE_SCHEMA_VERSION = 3;

/** Texto breve de una sola recomendación. Vacío = "no aplica" (sin `.nullable()`, ver D3). */
const brief = (max = 160) => z.string().max(max);

const AppearanceV2Schema = z.object({
  presentation: z.enum(["MASCULINE", "FEMININE", "ANDROGYNOUS"]),
  age_range: z.enum(["18_24", "25_34", "35_44", "45_54", "55_PLUS"]),
  face_shape: z.enum(["OVAL", "ROUND", "SQUARE", "RECTANGLE", "HEART", "DIAMOND", "TRIANGLE"]),
  skin_tone: z.enum(["VERY_LIGHT", "LIGHT", "MEDIUM", "TAN", "DEEP", "VERY_DEEP"]),
  skin_undertone: z.enum(["WARM", "COOL", "NEUTRAL", "OLIVE"]),
  contrast_level: z.enum(["LOW", "MEDIUM", "HIGH"]),
  eye_color: z.string().max(40).nullable(),
});

/**
 * Silueta para vestirse (relación hombros, cintura y cadera a simple vista). Es una
 * categoría de styling, no una medida ni un juicio. `UNKNOWN`: la foto no deja verla o
 * el perfil es anterior a v3.
 */
export const BodyShapeSchema = z.enum([
  "TRAPEZOID",
  "INVERTED_TRIANGLE",
  "RECTANGLE",
  "TRIANGLE",
  "OVAL",
  "HOURGLASS",
  "UNKNOWN",
]);
export type BodyShape = z.infer<typeof BodyShapeSchema>;

/** Largo del torso respecto de las piernas, como etiqueta (sin porcentajes). */
export const TorsoLegsSchema = z.enum(["LONG_TORSO", "BALANCED", "LONG_LEGS", "UNKNOWN"]);
export type TorsoLegs = z.infer<typeof TorsoLegsSchema>;

/** v3: suma los datos cualitativos que muestra el perfil (rasgos, silueta, proporciones). */
const AppearanceSchema = AppearanceV2Schema.extend({
  /** Rasgos del rostro que acompañan la forma ("mandíbula definida"). Vacío en perfiles viejos. */
  face_features: z.array(z.string().min(1).max(60)).max(2),
  body_shape: BodyShapeSchema,
  torso_legs: TorsoLegsSchema,
});

const ColorsSchema = z.object({
  season: z.string().max(40).nullable(),
  best: z.array(ColorSwatchSchema).min(1).max(12),
  neutrals: z.array(ColorSwatchSchema).max(8),
  avoid: z.array(ColorSwatchSchema).max(8),
});

const StyleDirectionSchema = z.object({
  primary: z.string().min(1).max(60),
  secondary: z.string().max(60).nullable(),
  keywords: shortList(8),
  risk_level: StyleRiskLevelSchema,
});

const TextureSchema = z.enum(["STRAIGHT", "WAVY", "CURLY", "COILY"]);
const HairLengthSchema = z.enum(["BALD", "BUZZ", "SHORT", "MEDIUM", "LONG"]);

/**
 * Perfil de estilo del usuario (asesoría de imagen completa). Lo produce el análisis de
 * IA en una sola llamada. Datos estructurados antes que texto libre y sin puntajes.
 *
 * Se guarda partido (ver `splitStyleProfile`): el núcleo teaser en
 * `style_profiles.profile_json` (lo lee cualquier plan) y la asesoría detallada en
 * `style_advice.advice_json` (RLS: solo Premium).
 */
export const StyleProfileSchema = z.object({
  schema_version: z.literal(STYLE_PROFILE_SCHEMA_VERSION),
  appearance: AppearanceSchema,
  hair: z.object({
    color: z.string().max(60),
    texture: TextureSchema,
    length: HairLengthSchema,
    current_style: z.string().max(120),
    /** Corte recomendado, en una frase. */
    recommended_cut: brief(),
    /** Largo recomendado arriba. */
    recommended_length: brief(),
    /** Qué hacer con los laterales (y la nuca). */
    sides: brief(),
    /** Cómo trabajar la textura natural. */
    texture_tips: shortList(3),
    /** Peinado diario: pasos y producto. */
    styling: shortList(4),
    recommended_styles: shortList(5),
    avoid: shortList(5),
    /** Lo que el usuario le dice al peluquero o barbero. */
    barber_instructions: brief(400),
  }),
  grooming: z.object({
    current: z.string().max(160),
    /** Barba o vello facial. Vacío si no aplica. */
    facial_hair: z.object({ recommended: shortList(4), avoid: shortList(4) }),
    eyebrows: shortList(3),
    recommendations: shortList(6),
    avoid: shortList(4),
  }),
  colors: ColorsSchema,
  body_proportions: z.object({
    frame: z.enum(["PETITE", "AVERAGE", "TALL"]),
    balance_notes: shortList(5),
  }),
  clothing: z.object({
    current_style: z.string().max(160),
    recommended_categories: shortList(8),
    recommended_silhouettes: shortList(5),
    pant_cuts: shortList(4),
    /** Largos de prendas: mangas, ruedos, bajos de remera, etc. */
    lengths: shortList(5),
    layering: shortList(5),
    avoid: shortList(5),
  }),
  fits: z.object({ recommended: shortList(6), avoid: shortList(6) }),
  materials: z.object({ recommended: shortList(6), avoid: shortList(6) }),
  shoes: z.object({ recommended: shortList(6), avoid: shortList(5) }),
  accessories: z.object({
    recommended: shortList(6),
    jewelry: shortList(4),
    /** Anteojos (de sol o recetados). Vacío si no corresponde. */
    eyewear: shortList(4),
    avoid: shortList(5),
  }),
  tattoos: z.object({
    present: z.boolean(),
    visible_areas: shortList(6),
    preference: TattooPreferenceSchema,
    /** Opcionales. Vacío si la preferencia es cubrirlos. */
    suggestions: shortList(4),
    placements: shortList(4),
  }),
  strengths: shortList(6),
  avoid: shortList(6),
  style_direction: StyleDirectionSchema,
  /** Quick wins priorizados: lo primero que conviene cambiar. */
  general_advice: shortList(6),
});
export type StyleProfile = z.infer<typeof StyleProfileSchema>;

/** Claves del teaser: las ve cualquier plan (`style_profiles.profile_json`). */
const CORE_KEYS = {
  schema_version: true,
  appearance: true,
  colors: true,
  strengths: true,
  avoid: true,
  style_direction: true,
} as const;

/** Núcleo del perfil (teaser free). Es lo que se guarda en `style_profiles.profile_json`. */
export const StyleProfileCoreSchema = StyleProfileSchema.pick(CORE_KEYS);
export type StyleProfileCore = z.infer<typeof StyleProfileCoreSchema>;

/** Asesoría detallada (Premium). Se guarda en `style_advice.advice_json`. */
export const StyleAdviceSchema = StyleProfileSchema.omit(CORE_KEYS);
export type StyleAdvice = z.infer<typeof StyleAdviceSchema>;

/** Parte el perfil para guardarlo: núcleo (cualquier plan) y asesoría (solo Premium). */
export function splitStyleProfile(profile: StyleProfile): {
  core: StyleProfileCore;
  advice: StyleAdvice;
} {
  const { schema_version, appearance, colors, strengths, avoid, style_direction, ...advice } =
    profile;
  return {
    core: { schema_version, appearance, colors, strengths, avoid, style_direction },
    advice,
  };
}

/** Perfil completo a partir de sus dos partes (lo usan procesos que necesitan todo). */
export function mergeStyleProfile(core: StyleProfileCore, advice: StyleAdvice): StyleProfile {
  return { ...core, ...advice };
}

// --- Versiones anteriores ------------------------------------------------------------

/** StyleProfile v1 (hasta el 2026-09-30): todo en `profile_json`, sin asesoría detallada. */
export const StyleProfileV1Schema = z.object({
  schema_version: z.literal(1),
  appearance: AppearanceV2Schema,
  hair: z.object({
    color: z.string().max(60),
    texture: TextureSchema,
    length: HairLengthSchema,
    current_style: z.string().max(120),
    recommended_styles: shortList(5),
  }),
  grooming: z.object({
    current: z.string().max(160),
    recommendations: shortList(6),
  }),
  colors: ColorsSchema,
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
  style_direction: StyleDirectionSchema,
});
export type StyleProfileV1 = z.infer<typeof StyleProfileV1Schema>;

/** StyleProfile v2 (hasta el 2026-10-01): sin rasgos del rostro, silueta ni proporciones. */
export const StyleProfileV2Schema = StyleProfileSchema.extend({
  schema_version: z.literal(2),
  appearance: AppearanceV2Schema,
});
export type StyleProfileV2 = z.infer<typeof StyleProfileV2Schema>;

/** Núcleo v2 guardado en `profile_json` (la asesoría no cambió entre v2 y v3). */
const StyleProfileV2CoreSchema = StyleProfileV2Schema.pick(CORE_KEYS);

/** Datos de v3 que un perfil viejo no tiene: "no se sabe", nunca un valor inventado. */
function upgradeAppearanceV2(
  appearance: z.infer<typeof AppearanceV2Schema>,
): StyleProfile["appearance"] {
  return { ...appearance, face_features: [], body_shape: "UNKNOWN", torso_legs: "UNKNOWN" };
}

/** Sube un perfil v1 a la versión actual: conserva todo y deja vacía la asesoría nueva. */
export function upgradeStyleProfileV1(v1: StyleProfileV1): StyleProfile {
  return {
    ...v1,
    schema_version: STYLE_PROFILE_SCHEMA_VERSION,
    appearance: upgradeAppearanceV2(v1.appearance),
    hair: {
      ...v1.hair,
      recommended_cut: "",
      recommended_length: "",
      sides: "",
      texture_tips: [],
      styling: [],
      avoid: [],
      barber_instructions: "",
    },
    grooming: {
      ...v1.grooming,
      facial_hair: { recommended: [], avoid: [] },
      eyebrows: [],
      avoid: [],
    },
    clothing: {
      ...v1.clothing,
      recommended_silhouettes: [],
      pant_cuts: [],
      lengths: [],
      layering: [],
      avoid: [],
    },
    shoes: { ...v1.shoes, avoid: [] },
    accessories: { ...v1.accessories, jewelry: [], eyewear: [], avoid: [] },
    tattoos: { ...v1.tattoos, suggestions: [], placements: [] },
    general_advice: [],
  };
}

export interface StoredStyleProfile {
  /** Núcleo teaser: lo ve cualquier plan. */
  profile: StyleProfileCore;
  /**
   * Asesoría detallada. `null` si no se pudo leer: usuario free (la RLS no la devuelve)
   * o perfil sin asesoría. En perfiles v1 viene de `profile_json` (subida a la versión
   * actual con los campos nuevos vacíos): mostrarla o no según el plan es tarea de la UI.
   */
  advice: StyleAdvice | null;
}

/**
 * Lectura tolerante de lo guardado: acepta `profile_json` v3 o v2 (núcleo) o v1 (perfil
 * completo viejo) y la asesoría de `style_advice.advice_json` si la hay. Todo sale en la
 * versión actual. Devuelve `null` si `profile_json` no es un perfil válido de ninguna
 * versión.
 */
export function parseStoredStyleProfile(
  profileJson: unknown,
  adviceJson: unknown = null,
): StoredStyleProfile | null {
  const stored = StyleAdviceSchema.safeParse(adviceJson);
  const advice = stored.success ? stored.data : null;

  const current = StyleProfileCoreSchema.safeParse(profileJson);
  if (current.success) return { profile: current.data, advice };

  const v2 = StyleProfileV2CoreSchema.safeParse(profileJson);
  if (v2.success)
    return {
      profile: {
        ...v2.data,
        schema_version: STYLE_PROFILE_SCHEMA_VERSION,
        appearance: upgradeAppearanceV2(v2.data.appearance),
      },
      advice,
    };

  const legacy = StyleProfileV1Schema.safeParse(profileJson);
  if (!legacy.success) return null;
  const upgraded = splitStyleProfile(upgradeStyleProfileV1(legacy.data));
  return { profile: upgraded.core, advice: advice ?? upgraded.advice };
}
