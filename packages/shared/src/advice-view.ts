import type { ColorSwatch } from "./schemas/common";
import type { StyleAdvice, StyleProfileCore } from "./schemas/style-profile";

/**
 * View model de la asesoría de imagen (pantalla de resultados). Lógica pura: decide qué
 * ve cada plan. Free recibe solo el teaser (núcleo recortado) y los títulos de las
 * secciones bloqueadas; la asesoría Premium nunca entra en su view model.
 */

export const ADVICE_SECTION_IDS = [
  "hair",
  "grooming",
  "clothing",
  "shoes_accessories",
  "tattoos",
  "general",
] as const;
export type AdviceSectionId = (typeof ADVICE_SECTION_IDS)[number];

export const ADVICE_SECTION_TITLES: Record<AdviceSectionId, string> = {
  hair: "Pelo",
  grooming: "Grooming",
  clothing: "Ropa y fit",
  shoes_accessories: "Calzado y accesorios",
  tattoos: "Tatuajes",
  general: "Consejos generales",
};

/** `do` = ✓, `avoid` = ×, `info` = dato neutro. */
export type AdviceTone = "do" | "avoid" | "info";

export interface AdviceGroup {
  label: string;
  tone: AdviceTone;
  items: string[];
}

export interface AdviceSection {
  id: AdviceSectionId;
  title: string;
  groups: AdviceGroup[];
  /** Texto destacado y copiable (indicaciones al peluquero). */
  highlight: { label: string; text: string } | null;
}

export interface AdviceView {
  plan: "FREE" | "PREMIUM";
  direction: { primary: string; secondary: string | null; keywords: string[] };
  favors: string[];
  avoid: string[];
  colors: { best: ColorSwatch[]; neutrals: ColorSwatch[]; avoid: ColorSwatch[] };
  /** Secciones completas (solo Premium). */
  sections: AdviceSection[];
  /** Secciones bloqueadas con CTA (solo free). */
  locked: Array<{ id: AdviceSectionId; title: string }>;
  /** Premium sin la asesoría nueva (perfil v1 o sin guardar): "aparece en tu próximo análisis". */
  pendingNextAnalysis: boolean;
}

/** Cuánto del núcleo ve free: suficiente para entender el valor, no todo. */
export const FREE_TEASER_LIMITS = { favors: 3, avoid: 3, bestColors: 6 } as const;

const nonEmpty = (items: string[]) => items.map((s) => s.trim()).filter(Boolean);

function group(label: string, tone: AdviceTone, items: string[]): AdviceGroup | null {
  const clean = nonEmpty(items);
  return clean.length ? { label, tone, items: clean } : null;
}

function section(
  id: AdviceSectionId,
  groups: Array<AdviceGroup | null>,
  highlight: AdviceSection["highlight"] = null,
): AdviceSection | null {
  const present = groups.filter((g): g is AdviceGroup => g !== null);
  if (!present.length && !highlight) return null;
  return { id, title: ADVICE_SECTION_TITLES[id], groups: present, highlight };
}

/** Todas las secciones Premium a partir de la asesoría. Omite las que vienen vacías. */
export function buildAdviceSections(advice: StyleAdvice): AdviceSection[] {
  const { hair, grooming, clothing, fits, materials, body_proportions, shoes, accessories } =
    advice;
  const barber = hair.barber_instructions.trim();
  const sections = [
    section(
      "hair",
      [
        group("Corte", "do", [hair.recommended_cut, hair.recommended_length, hair.sides]),
        group("Estilos que te quedan", "do", hair.recommended_styles),
        group("Textura", "info", hair.texture_tips),
        group("Peinado diario", "info", hair.styling),
        group("Mejor evitar", "avoid", hair.avoid),
      ],
      barber ? { label: "Para decirle al peluquero", text: barber } : null,
    ),
    section("grooming", [
      group("Barba", "do", grooming.facial_hair.recommended),
      group("Barba: evitar", "avoid", grooming.facial_hair.avoid),
      group("Cejas", "do", grooming.eyebrows),
      group("Cuidado", "do", grooming.recommendations),
      group("Mejor evitar", "avoid", grooming.avoid),
    ]),
    section("clothing", [
      group("Prendas clave", "do", clothing.recommended_categories),
      group("Siluetas", "do", clothing.recommended_silhouettes),
      group("Pantalones", "do", clothing.pant_cuts),
      group("Largos", "info", clothing.lengths),
      group("Capas", "do", clothing.layering),
      group("Fit", "do", fits.recommended),
      group("Materiales", "do", materials.recommended),
      group("Proporciones", "info", body_proportions.balance_notes),
      group("Mejor evitar", "avoid", [...clothing.avoid, ...fits.avoid, ...materials.avoid]),
    ]),
    section("shoes_accessories", [
      group("Calzado", "do", shoes.recommended),
      group("Calzado: evitar", "avoid", shoes.avoid),
      group("Accesorios", "do", accessories.recommended),
      group("Joyería", "do", accessories.jewelry),
      group("Anteojos", "do", accessories.eyewear),
      group("Accesorios: evitar", "avoid", accessories.avoid),
    ]),
    section("tattoos", [
      group("Ideas", "do", advice.tattoos.suggestions),
      group("Dónde", "info", advice.tattoos.placements),
    ]),
    section("general", [group("Por dónde empezar", "do", advice.general_advice)]),
  ];
  return sections.filter((s): s is AdviceSection => s !== null);
}

/**
 * La asesoría nueva (v2 en adelante) tiene contenido: un perfil v1 subido deja vacíos todos
 * los campos que v2 agregó. Se mira cualquiera de ellos (paso 13: mirar solo el corte, el
 * texto para el peluquero y los consejos marcaba "pendiente" a alguien rapado sin consejos).
 */
export function hasV2Advice(advice: StyleAdvice): boolean {
  const { hair, grooming, clothing, shoes, accessories, tattoos } = advice;
  const texts = [
    hair.recommended_cut,
    hair.recommended_length,
    hair.sides,
    hair.barber_instructions,
  ];
  const lists = [
    hair.texture_tips,
    hair.styling,
    hair.avoid,
    grooming.facial_hair.recommended,
    grooming.facial_hair.avoid,
    grooming.eyebrows,
    grooming.avoid,
    clothing.recommended_silhouettes,
    clothing.pant_cuts,
    clothing.lengths,
    clothing.layering,
    clothing.avoid,
    shoes.avoid,
    accessories.jewelry,
    accessories.eyewear,
    accessories.avoid,
    tattoos.suggestions,
    tattoos.placements,
    advice.general_advice,
  ];
  return texts.some((t) => t.trim() !== "") || lists.some((l) => l.length > 0);
}

/**
 * Arma lo que ve cada plan. `advice` se ignora si el usuario no es Premium (un perfil v1
 * la trae desde `profile_json`, que free puede leer).
 */
export function selectAdviceForPlan(
  profile: StyleProfileCore,
  advice: StyleAdvice | null,
  isPremium: boolean,
): AdviceView {
  const direction = {
    primary: profile.style_direction.primary,
    secondary: profile.style_direction.secondary,
    keywords: nonEmpty(profile.style_direction.keywords),
  };

  if (!isPremium) {
    return {
      plan: "FREE",
      direction,
      favors: nonEmpty(profile.strengths).slice(0, FREE_TEASER_LIMITS.favors),
      avoid: nonEmpty(profile.avoid).slice(0, FREE_TEASER_LIMITS.avoid),
      colors: {
        best: profile.colors.best.slice(0, FREE_TEASER_LIMITS.bestColors),
        neutrals: [],
        avoid: [],
      },
      sections: [],
      locked: ADVICE_SECTION_IDS.map((id) => ({ id, title: ADVICE_SECTION_TITLES[id] })),
      pendingNextAnalysis: false,
    };
  }

  return {
    plan: "PREMIUM",
    direction,
    favors: nonEmpty(profile.strengths),
    avoid: nonEmpty(profile.avoid),
    colors: profile.colors,
    sections: advice ? buildAdviceSections(advice) : [],
    locked: [],
    pendingNextAnalysis: !advice || !hasV2Advice(advice),
  };
}
