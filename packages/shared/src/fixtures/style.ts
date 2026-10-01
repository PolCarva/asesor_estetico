import type { LookSpec } from "../schemas/look-spec";
import type { StyleProfile, StyleProfileV1, StyleProfileV2 } from "../schemas/style-profile";

/** `appearance` de v1 y v2 (sin rasgos del rostro, silueta ni proporciones). */
const APPEARANCE_V2: StyleProfileV2["appearance"] = {
  presentation: "MASCULINE",
  age_range: "25_34",
  face_shape: "OVAL",
  skin_tone: "MEDIUM",
  skin_undertone: "WARM",
  contrast_level: "MEDIUM",
  eye_color: "marrón",
};

/** Datos ficticios para desarrollo, tests y mocks. No representan a ninguna persona real. */
export const FIXTURE_STYLE_PROFILE: StyleProfile = {
  schema_version: 3,
  appearance: {
    ...APPEARANCE_V2,
    face_features: ["mandíbula definida", "frente media"],
    body_shape: "TRAPEZOID",
    torso_legs: "LONG_LEGS",
  },
  hair: {
    color: "castaño oscuro",
    texture: "WAVY",
    length: "SHORT",
    current_style: "corto sin forma definida",
    recommended_cut: "textured crop con flequillo corto hacia adelante",
    recommended_length: "4 a 5 cm arriba para que se marque la onda",
    sides: "degradado bajo con tijera, sin rapar al cero",
    texture_tips: [
      "secar con los dedos en vez de cepillo para definir la onda",
      "crema de peinar liviana con el pelo húmedo",
    ],
    styling: [
      "aplicar pasta mate del tamaño de un garbanzo con el pelo seco",
      "despeinar hacia adelante y apenas hacia un costado",
    ],
    recommended_styles: ["textured crop", "corte medio con volumen arriba"],
    avoid: ["gel con efecto mojado", "laterales rapados al cero con arriba largo"],
    barber_instructions:
      "Textured crop: arriba 4-5 cm texturizado con tijera, laterales en degradado bajo con máquina 2 que se funde con tijera, nuca prolija y natural, sin línea marcada.",
  },
  grooming: {
    current: "barba de pocos días irregular",
    facial_hair: {
      recommended: [
        "barba corta de 3 a 5 mm pareja",
        "línea de mejilla natural apenas perfilada",
        "cuello limpio dos dedos arriba de la nuez",
      ],
      avoid: ["barba con zonas desparejas sin recortar", "perfilado muy marcado y recto"],
    },
    eyebrows: [
      "quitar solo los pelos del entrecejo",
      "peinarlas hacia arriba con gel transparente",
    ],
    recommendations: ["barba corta perfilada en mejillas", "cejas prolijas sin afinar"],
    avoid: ["afinar las cejas", "dejar crecer la barba sin mantenimiento semanal"],
  },
  colors: {
    season: "otoño",
    best: [
      { name: "camel", hex: "#C19A6B" },
      { name: "verde oliva", hex: "#6B6B3A" },
      { name: "terracota", hex: "#B5553C" },
      { name: "azul petróleo", hex: "#1F4E5F" },
    ],
    neutrals: [
      { name: "crudo", hex: "#EFE8DA" },
      { name: "chocolate", hex: "#4A3222" },
      { name: "gris topo", hex: "#8B8580" },
    ],
    avoid: [
      { name: "negro puro junto a la cara", hex: "#000000" },
      { name: "rosa frío", hex: "#F4A6C6" },
    ],
  },
  body_proportions: {
    frame: "AVERAGE",
    balance_notes: [
      "hombros apenas más anchos que la cadera: cortes rectos mantienen el equilibrio",
      "piernas largas: admiten tiro medio y remeras por fuera",
    ],
  },
  clothing: {
    current_style: "casual básico con prendas holgadas",
    recommended_categories: ["camisas de algodón", "punto fino", "pantalón chino", "overshirt"],
    recommended_silhouettes: [
      "arriba regular y abajo recto",
      "capa abierta sobre remera lisa",
      "cintura marcada con cinturón",
    ],
    pant_cuts: ["recto de tiro medio", "chino con pierna apenas cónica", "sastrero sin pinzas"],
    lengths: [
      "remeras que terminan a mitad del cierre del pantalón",
      "ruedo con quiebre mínimo sobre el zapato",
      "mangas de camisa hasta el hueso de la muñeca",
    ],
    layering: [
      "overshirt abierto sobre remera lisa",
      "cardigan fino sobre camisa",
      "campera corta que no pase la cadera",
    ],
    avoid: ["prendas dos talles más grandes", "remeras que tapan el bolsillo del pantalón"],
  },
  fits: {
    recommended: ["regular con caída limpia", "pantalón de tiro medio y pierna recta"],
    avoid: ["remeras muy largas", "jeans skinny"],
  },
  materials: {
    recommended: ["algodón peinado", "lino", "lana merino", "gamuza"],
    avoid: ["poliéster brillante"],
  },
  shoes: {
    recommended: ["desert boots", "zapatillas blancas de cuero", "loafers de gamuza"],
    avoid: ["zapatillas deportivas técnicas con ropa de vestir", "punta cuadrada"],
  },
  accessories: {
    recommended: ["reloj con malla de cuero", "cinturón marrón"],
    jewelry: ["cadena fina de plata o acero", "anillo liso en el meñique"],
    eyewear: ["lentes de sol de acetato carey con forma cuadrada suave"],
    avoid: ["cadenas gruesas", "relojes deportivos grandes con ropa de vestir"],
  },
  tattoos: {
    present: true,
    visible_areas: ["antebrazo izquierdo"],
    preference: "NEUTRAL",
    suggestions: ["piezas chicas de línea fina que sigan el estilo del antebrazo"],
    placements: ["antebrazo interno derecho", "parte alta del brazo"],
  },
  strengths: ["sonrisa amplia", "tono de piel cálido que admite colores tierra"],
  avoid: ["logos grandes", "contrastes blanco/negro muy duros"],
  style_direction: {
    primary: "smart casual cálido",
    secondary: "minimalista",
    keywords: ["texturas", "tonos tierra", "prendas atemporales"],
    risk_level: "BALANCED",
  },
  general_advice: [
    "cortar el pelo con el largo y los laterales indicados",
    "perfilar la barba una vez por semana",
    "cambiar remeras largas por remeras de largo justo",
    "sumar un overshirt camel como capa base",
  ],
};

/** Perfil v2 (guardado entre el 2026-09-30 y el 2026-10-01) para tests de compatibilidad. */
export const FIXTURE_STYLE_PROFILE_V2: StyleProfileV2 = {
  ...FIXTURE_STYLE_PROFILE,
  schema_version: 2,
  appearance: APPEARANCE_V2,
};

/** Perfil v1 (formato anterior, guardado antes del 2026-09-30) para tests de compatibilidad. */
export const FIXTURE_STYLE_PROFILE_V1: StyleProfileV1 = {
  schema_version: 1,
  appearance: APPEARANCE_V2,
  hair: {
    color: "castaño oscuro",
    texture: "WAVY",
    length: "SHORT",
    current_style: "corto sin forma definida",
    recommended_styles: ["textured crop", "corte medio con volumen arriba"],
  },
  grooming: {
    current: "barba de pocos días irregular",
    recommendations: ["barba corta perfilada en mejillas", "cejas prolijas sin afinar"],
  },
  colors: FIXTURE_STYLE_PROFILE.colors,
  body_proportions: FIXTURE_STYLE_PROFILE.body_proportions,
  clothing: {
    current_style: "casual básico con prendas holgadas",
    recommended_categories: ["camisas de algodón", "punto fino", "pantalón chino", "overshirt"],
  },
  fits: FIXTURE_STYLE_PROFILE.fits,
  materials: FIXTURE_STYLE_PROFILE.materials,
  shoes: { recommended: ["desert boots", "zapatillas blancas de cuero", "loafers de gamuza"] },
  accessories: { recommended: ["reloj con malla de cuero", "cinturón marrón"] },
  tattoos: { present: true, visible_areas: ["antebrazo izquierdo"], preference: "NEUTRAL" },
  strengths: FIXTURE_STYLE_PROFILE.strengths,
  avoid: FIXTURE_STYLE_PROFILE.avoid,
  style_direction: FIXTURE_STYLE_PROFILE.style_direction,
};

const identityPrompt = {
  pose: "de pie, relajado",
  lighting: "luz natural suave",
  framing: "FULL_BODY",
  preserve_identity: true,
} as const;

export const FIXTURE_LOOK_SPECS: [LookSpec, LookSpec, LookSpec] = [
  {
    id: "look-1",
    name: "Smart casual cálido",
    concept: "Base neutra con capas en tonos tierra para el día a día.",
    risk_level: "CONSERVATIVE",
    hair: { style: "textured crop", notes: null },
    grooming: { description: "barba corta perfilada" },
    top: {
      category: "SHIRT",
      description: "camisa oxford",
      color: { name: "crudo", hex: "#EFE8DA" },
      fit: "regular",
      material: "algodón",
      pattern: null,
    },
    bottom: {
      category: "PANTS",
      description: "pantalón chino",
      color: { name: "verde oliva", hex: "#6B6B3A" },
      fit: "recto",
      material: "gabardina",
      pattern: null,
    },
    layering: [
      {
        category: "OUTERWEAR",
        description: "overshirt",
        color: { name: "camel", hex: "#C19A6B" },
        fit: "regular",
        material: "lana",
        pattern: null,
      },
    ],
    shoes: {
      category: "SHOES",
      description: "desert boots",
      color: { name: "chocolate", hex: "#4A3222" },
      fit: null,
      material: "gamuza",
      pattern: null,
    },
    accessories: [
      {
        category: "WATCH",
        description: "reloj con malla de cuero",
        color: { name: "marrón", hex: "#6F4E37" },
        fit: null,
        material: "cuero",
        pattern: null,
      },
    ],
    tattoos: { visibility: "PARTIAL" },
    palette: [
      { name: "crudo", hex: "#EFE8DA" },
      { name: "camel", hex: "#C19A6B" },
      { name: "verde oliva", hex: "#6B6B3A" },
    ],
    fit: { overall: "regular con caída limpia", notes: ["arremangar la camisa dos vueltas"] },
    reasoning: [
      {
        aspect: "COLOR",
        qualifier: "cálido",
        text: "los tonos tierra acompañan el subtono cálido",
      },
      {
        aspect: "SILHOUETTE",
        qualifier: "trapecio",
        text: "el overshirt abierto suma estructura sin ensanchar los hombros",
      },
    ],
    avoid: ["zapatillas deportivas técnicas"],
    image_prompt_data: { setting: "calle de Montevideo, fachada clara", ...identityPrompt },
  },
  {
    id: "look-2",
    name: "Minimal nocturno",
    concept: "Monocromo profundo con textura para salidas.",
    risk_level: "BALANCED",
    hair: { style: "peinado hacia atrás con textura", notes: null },
    grooming: { description: "barba corta" },
    top: {
      category: "KNITWEAR",
      description: "sweater de punto fino cuello redondo",
      color: { name: "azul petróleo", hex: "#1F4E5F" },
      fit: "regular",
      material: "lana merino",
      pattern: null,
    },
    bottom: {
      category: "PANTS",
      description: "pantalón de vestir sin pinzas",
      color: { name: "gris topo", hex: "#8B8580" },
      fit: "recto",
      material: "lana",
      pattern: null,
    },
    layering: [],
    shoes: {
      category: "SHOES",
      description: "loafers",
      color: { name: "chocolate", hex: "#4A3222" },
      fit: null,
      material: "gamuza",
      pattern: null,
    },
    accessories: [],
    tattoos: { visibility: "COVERED" },
    palette: [
      { name: "azul petróleo", hex: "#1F4E5F" },
      { name: "gris topo", hex: "#8B8580" },
    ],
    fit: { overall: "entallado sin ajustar", notes: [] },
    reasoning: [
      {
        aspect: "COLOR",
        qualifier: "contraste medio",
        text: "el azul petróleo da contraste medio sin endurecer",
      },
      {
        aspect: "FACE",
        qualifier: "ovalado",
        text: "el cuello redondo acompaña el rostro ovalado",
      },
    ],
    avoid: ["camisa blanca debajo"],
    image_prompt_data: {
      setting: "bar con luz cálida",
      ...identityPrompt,
      framing: "THREE_QUARTER",
    },
  },
  {
    id: "look-3",
    name: "Terracota de fin de semana",
    concept: "Color protagonista y lino para días de calor.",
    risk_level: "BOLD",
    hair: { style: "textured crop", notes: "sin producto brillante" },
    grooming: { description: "barba de pocos días prolija" },
    top: {
      category: "SHIRT",
      description: "camisa de lino cuello cubano",
      color: { name: "terracota", hex: "#B5553C" },
      fit: "relajado",
      material: "lino",
      pattern: null,
    },
    bottom: {
      category: "SHORTS",
      description: "bermuda de sastrería",
      color: { name: "crudo", hex: "#EFE8DA" },
      fit: "recto",
      material: "algodón",
      pattern: null,
    },
    layering: [],
    shoes: {
      category: "SHOES",
      description: "zapatillas blancas de cuero",
      color: { name: "blanco", hex: "#F5F5F0" },
      fit: null,
      material: "cuero",
      pattern: null,
    },
    accessories: [],
    tattoos: { visibility: "VISIBLE" },
    palette: [
      { name: "terracota", hex: "#B5553C" },
      { name: "crudo", hex: "#EFE8DA" },
    ],
    fit: { overall: "relajado", notes: ["bermuda por encima de la rodilla"] },
    reasoning: [
      { aspect: "COLOR", qualifier: "cálido", text: "la terracota realza el subtono cálido" },
      {
        aspect: "SILHOUETTE",
        qualifier: "piernas largas",
        text: "la bermuda sobre la rodilla aprovecha el largo de las piernas",
      },
      { aspect: "STYLE", qualifier: "personalidad", text: "mostrar el tatuaje suma personalidad" },
    ],
    avoid: ["medias visibles"],
    image_prompt_data: { setting: "rambla al atardecer", ...identityPrompt },
  },
];
