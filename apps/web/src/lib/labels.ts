import type {
  BodyShape,
  LookReasonAspect,
  ProductCategory,
  ShoppingStage,
  SizeKind,
  StyleProfile,
  StyleRiskLevel,
  TattooPreference,
  TorsoLegs,
  UserSizes,
} from "@asesor/shared";

/** Textos de la UI para los enums del dominio (español rioplatense). */

type Appearance = StyleProfile["appearance"];

export const FACE_SHAPE_LABEL: Record<Appearance["face_shape"], string> = {
  OVAL: "Ovalado",
  ROUND: "Redondo",
  SQUARE: "Cuadrado",
  RECTANGLE: "Rectangular",
  HEART: "Corazón",
  DIAMOND: "Diamante",
  TRIANGLE: "Triangular",
};

export const UNDERTONE_LABEL: Record<Appearance["skin_undertone"], string> = {
  WARM: "cálido",
  COOL: "frío",
  NEUTRAL: "neutro",
  OLIVE: "oliva",
};

export const CONTRAST_LABEL: Record<Appearance["contrast_level"], string> = {
  LOW: "bajo",
  MEDIUM: "medio",
  HIGH: "alto",
};

export const FRAME_LABEL: Record<StyleProfile["body_proportions"]["frame"], string> = {
  PETITE: "Contextura menuda",
  AVERAGE: "Contextura media",
  TALL: "Contextura alta",
};

/** Silueta para vestirse. `UNKNOWN` no tiene etiqueta: la UI no la muestra. */
export const BODY_SHAPE_LABEL: Record<Exclude<BodyShape, "UNKNOWN">, string> = {
  TRAPEZOID: "Trapecio",
  INVERTED_TRIANGLE: "Triángulo invertido",
  RECTANGLE: "Rectángulo",
  TRIANGLE: "Triángulo",
  OVAL: "Óvalo",
  HOURGLASS: "Reloj de arena",
};

/** Proporción torso/piernas, en el orden de la escala del perfil. */
export const TORSO_LEGS_LABEL: Record<Exclude<TorsoLegs, "UNKNOWN">, string> = {
  LONG_TORSO: "Torso largo",
  BALANCED: "Equilibradas",
  LONG_LEGS: "Piernas largas",
};

export const REASON_ASPECT_LABEL: Record<LookReasonAspect, string> = {
  COLOR: "Color",
  SILHOUETTE: "Silueta",
  FACE: "Rostro",
  HAIR: "Pelo",
  STYLE: "Estilo",
};

/** "Mandíbula definida, frente media": une frases cortas en una sola oración. */
export function sentenceList(items: string[]): string {
  return items
    .map((item, i) => {
      const text = item.trim();
      return i === 0
        ? text.charAt(0).toUpperCase() + text.slice(1)
        : text.charAt(0).toLowerCase() + text.slice(1);
    })
    .filter(Boolean)
    .join(", ");
}

export const RISK_LABEL: Record<StyleRiskLevel, string> = {
  CONSERVATIVE: "Clásico",
  BALANCED: "Equilibrado",
  BOLD: "Audaz",
};

export const TATTOO_LABEL: Record<TattooPreference, string> = {
  HIGHLIGHT: "Mostrarlos",
  NEUTRAL: "Indistinto",
  COVER: "Cubrirlos",
};

export const CATEGORY_LABEL: Record<ProductCategory, string> = {
  SHIRT: "Camisa",
  T_SHIRT: "Remera",
  KNITWEAR: "Tejido",
  TOP: "Top",
  OUTERWEAR: "Abrigo",
  BLAZER: "Blazer",
  PANTS: "Pantalón",
  JEANS: "Jean",
  SHORTS: "Short",
  SKIRT: "Pollera",
  DRESS: "Vestido",
  SHOES: "Calzado",
  BAG: "Bolso",
  BELT: "Cinto",
  JEWELRY: "Joyería",
  EYEWEAR: "Anteojos",
  WATCH: "Reloj",
  HAT: "Gorro",
  SCARF: "Bufanda",
  OTHER: "Accesorio",
};

/** "01", "02"… como en las etiquetas técnicas del diseño. */
export function twoDigits(n: number): string {
  return String(n).padStart(2, "0");
}

/** Primer nombre para saludar ("Javier, estas son…"). */
export function firstName(displayName: string | null | undefined): string | null {
  const first = displayName?.trim().split(/\s+/)[0];
  return first ? first : null;
}

/** Qué talle se pide (SPEC "TALLES"). */
export const SIZE_KIND_LABEL: Record<SizeKind, string> = {
  top: "Remera, camisa o abrigo",
  bottom: "Pantalón, bermuda o pollera",
  shoe: "Calzado",
};

/** "M", "32", "42 EU", "9.5 US"; null si no lo cargó. */
export function sizeText(sizes: UserSizes, kind: SizeKind): string | null {
  const size = sizes[kind];
  if (!size) return null;
  return kind === "shoe" ? `${size} ${sizes.shoe_size_system}` : size;
}

/** Etapas de la búsqueda de productos, con los textos del SPEC ("JOBS"). */
export const SHOPPING_STAGE_LABEL: Record<ShoppingStage, string> = {
  SEARCHING: "Buscando prendas…",
  CHECKING_STORES: "Revisando tiendas…",
  COMPARING: "Comparando opciones…",
  VERIFYING: "Verificando precios y talles…",
  RANKING: "Ordenando las mejores coincidencias…",
};
