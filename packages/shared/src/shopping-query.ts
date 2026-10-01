import type { ProductCategory } from "./schemas/common";
import { type GarmentSlot, type LookSpec, listLookGarments } from "./schemas/look-spec";
import type { ShoppingAudience, ShoppingQuery } from "./schemas/products";
import type { StyleProfileCore } from "./schemas/style-profile";
import { sizeForCategory, type UserSizes } from "./sizes";

/**
 * Del LookSpec a búsquedas de tienda. Lógica pura: la búsqueda de las tiendas uruguayas
 * es léxica, así que se generan frases cortas en español rioplatense con sinónimos.
 */

/** Minúsculas, sin tildes ni signos: para comparar texto de tiendas y de la IA. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();
}

/** Sustantivos por categoría, del más usado en Uruguay al menos usado. */
export const CATEGORY_TERMS: Record<ProductCategory, string[]> = {
  SHIRT: ["camisa"],
  T_SHIRT: ["remera", "camiseta", "t-shirt"],
  KNITWEAR: ["buzo", "sweater", "cardigan", "suéter"],
  TOP: ["top", "musculosa", "blusa"],
  OUTERWEAR: ["campera", "chaqueta", "sobrecamisa", "abrigo"],
  BLAZER: ["blazer", "saco"],
  PANTS: ["pantalón", "chino"],
  JEANS: ["jean", "vaquero"],
  SHORTS: ["bermuda", "short"],
  SKIRT: ["pollera", "falda"],
  DRESS: ["vestido"],
  SHOES: ["championes", "zapatillas", "zapatos", "botas", "mocasines"],
  BAG: ["bolso", "mochila", "cartera"],
  BELT: ["cinto", "cinturón"],
  JEWELRY: ["collar", "pulsera", "anillo", "cadena"],
  EYEWEAR: ["lentes", "anteojos"],
  WATCH: ["reloj"],
  HAT: ["gorro", "gorra", "sombrero"],
  SCARF: ["bufanda", "pañuelo"],
  OTHER: [],
};

/**
 * Palabras que la IA a veces usa en inglés o con variantes → término de tienda. La
 * clave va normalizada (`normalizeText`) y puede tener dos palabras.
 */
const TERM_ALIASES: Record<string, string> = {
  "t shirt": "remera",
  tshirt: "remera",
  camiseta: "remera",
  sneakers: "championes",
  zapatillas: "championes",
  loafers: "mocasines",
  loafer: "mocasines",
  mocasin: "mocasines",
  "desert boots": "botas",
  "chelsea boots": "botas",
  boots: "botas",
  botines: "botas",
  overshirt: "sobrecamisa",
  hoodie: "buzo",
  canguro: "buzo",
  sueter: "sweater",
  jersey: "sweater",
  pullover: "sweater",
  chinos: "chino",
  jeans: "jean",
  falda: "pollera",
  chaqueta: "campera",
  cinturon: "cinto",
  anteojos: "lentes",
  gafas: "lentes",
};

/** Alias que igual sirven para buscar: son español y algunas tiendas solo usan esos. */
const SEARCHABLE_ALIASES = new Set([
  "camiseta",
  "zapatillas",
  "falda",
  "chaqueta",
  "anteojos",
  "botines",
  "canguro",
  "sueter",
]);

/** Grupos de sinónimos (para expandir búsquedas léxicas y para chequear pertinencia). */
export const SYNONYM_GROUPS: string[][] = [
  ["remera", "camiseta", "t-shirt"],
  ["championes", "zapatillas", "sneakers"],
  ["buzo", "sweater", "suéter", "canguro"],
  ["campera", "chaqueta", "abrigo"],
  ["pollera", "falda"],
  ["bermuda", "short"],
  ["jean", "vaquero"],
  ["cinto", "cinturón"],
  ["lentes", "anteojos"],
  ["mocasines", "mocasín", "loafers"],
  ["botas", "botines"],
  ["sobrecamisa", "overshirt"],
];

const STOPWORDS = new Set(
  "de del la el los las con sin y o a en para por un una al tipo estilo corte look".split(" "),
);

function applyAliases(text: string): string {
  let out = ` ${normalizeText(text)} `;
  for (const [from, to] of Object.entries(TERM_ALIASES)) {
    out = out.replaceAll(` ${from} `, ` ${normalizeText(to)} `);
  }
  return out.trim().replace(/\s+/g, " ");
}

/** Sinónimos de un término (incluido el propio), normalizados. */
export function synonymsOf(term: string): string[] {
  const n = normalizeText(term);
  const group = SYNONYM_GROUPS.find((g) => g.some((t) => normalizeText(t) === n));
  return group ? [...new Set(group.map(normalizeText))] : [n];
}

/** Sustantivo principal: el de la categoría que aparece en la descripción, o el primero. */
function mainNoun(category: ProductCategory, description: string): string {
  const words = ` ${applyAliases(description)} `;
  const nouns = CATEGORY_TERMS[category].map(normalizeText);
  const found = nouns.find((n) => words.includes(` ${n} `));
  if (found) return found;
  // "OTHER" o una descripción sin el sustantivo: la primera palabra con contenido.
  const first = words
    .trim()
    .split(" ")
    .find((w) => w.length > 2 && !STOPWORDS.has(w));
  return nouns[0] ?? first ?? normalizeText(description);
}

/** Raíz corta para comparar "blancas" con "blanco". */
const stem = (w: string) => w.slice(0, 4);

function descriptors(description: string, noun: string, color: string): string[] {
  const colorStems = new Set(normalizeText(color).split(" ").map(stem));
  const nounWords = new Set(synonymsOf(noun).flatMap((s) => s.split(" ")));
  const words = applyAliases(description).split(" ");
  // "sin pinzas": se descarta lo negado, porque buscarlo trae justo lo contrario.
  const negated = new Set(words.flatMap((w, i) => (w === "sin" ? [i + 1] : [])));
  return words.filter(
    (w, i) =>
      w.length > 2 &&
      !negated.has(i) &&
      !STOPWORDS.has(w) &&
      !nounWords.has(w) &&
      !colorStems.has(stem(w)),
  );
}

export interface GarmentSearchInput {
  category: ProductCategory;
  description: string;
  color: { name: string };
  material: string | null;
}

/**
 * Términos de búsqueda de una prenda, del más específico al más general. Frases cortas:
 * las búsquedas de tienda son léxicas y fallan con frases largas.
 */
export function buildSearchTerms(garment: GarmentSearchInput, max = 6): string[] {
  const noun = mainNoun(garment.category, garment.description);
  const color = normalizeText(garment.color.name).split(" ")[0] ?? "";
  const [d1, d2] = descriptors(garment.description, noun, garment.color.name);
  const material = garment.material ? normalizeText(garment.material).split(" ")[0] : undefined;
  // Alternativas en español (las claves de TERM_ALIASES son variantes que no se buscan).
  // Otro sustantivo de la categoría solo si el principal no es de ella: unas botas no
  // se buscan como championes.
  const categoryNouns = CATEGORY_TERMS[garment.category].map(normalizeText);
  const alternatives = [
    ...synonymsOf(noun),
    ...(categoryNouns.includes(noun) ? [] : categoryNouns.slice(0, 1)),
  ].filter((s) => s !== noun && (!(s in TERM_ALIASES) || SEARCHABLE_ALIASES.has(s)));
  const candidates = [
    [noun, d1, color],
    [noun, d1],
    [noun, color],
    [noun, d1, d2],
    [noun, material],
    [noun],
    ...alternatives.slice(0, 2).map((alt) => [alt, color]),
  ];
  const terms = candidates
    .map((parts) => parts.filter((p): p is string => Boolean(p)).join(" "))
    .filter((t) => t.length > 0);
  return [...new Set(terms)].slice(0, max);
}

/** Palabras que indican el público en títulos y URLs de tienda. */
const AUDIENCE_WORDS: Record<ShoppingAudience, string[]> = {
  MEN: ["hombre", "hombres", "masculino", "men", "man", "caballero", "varon"],
  WOMEN: ["mujer", "mujeres", "femenino", "women", "woman", "dama", "damas"],
};
const KIDS_WORDS = [
  "nino",
  "nina",
  "ninos",
  "ninas",
  "kids",
  "bebe",
  "bebes",
  "infantil",
  "junior",
];

export function audienceWord(audience: ShoppingAudience | null): string | null {
  return audience === "MEN" ? "hombre" : audience === "WOMEN" ? "mujer" : null;
}

/** Público de las búsquedas: sale de la presentación del perfil; andrógino = sin filtro. */
export function audienceForProfile(
  profile: Pick<StyleProfileCore, "appearance">,
): ShoppingAudience | null {
  const p = profile.appearance.presentation;
  return p === "MASCULINE" ? "MEN" : p === "FEMININE" ? "WOMEN" : null;
}

/**
 * ¿Un resultado de tienda (título, URL o slug) es pertinente para la query? Tiene que
 * nombrar la prenda (o un sinónimo) y no ser del otro público ni de niños. Si el texto
 * no tiene palabras (URL con solo un id), no se puede juzgar: devuelve `null`.
 */
export function isRelevantCandidate(text: string, query: ShoppingQuery): boolean | null {
  // Sin esquema ni host: el dominio no describe la prenda.
  const path = text.replace(/https?:\/\/[^/\s]+/g, " ");
  const words = ` ${applyAliases(path.replace(/[_/.-]+/g, " "))} `;
  if (!/[a-z]{3,}/.test(words)) return null;
  const has = (w: string) => words.includes(` ${normalizeText(w)} `);
  const hasPrefix = (w: string) => words.includes(` ${normalizeText(w)}`);

  if (KIDS_WORDS.some(has)) return false;
  if (query.audience) {
    const other = query.audience === "MEN" ? "WOMEN" : "MEN";
    if (AUDIENCE_WORDS[other].some(has) && !AUDIENCE_WORDS[query.audience].some(has)) {
      return false;
    }
  }
  // El sustantivo de la prenda (o un sinónimo): unas botas no aceptan championes. Sin
  // términos, cualquier sustantivo de la categoría.
  const noun = query.search_terms[0]?.split(" ")[0];
  const nouns = new Set(
    noun ? synonymsOf(noun) : CATEGORY_TERMS[query.garment.category].flatMap(synonymsOf),
  );
  // Prefijo: "remeras", "camisas", "championes" en plural o con sufijos de la tienda.
  return [...nouns].some((n) => {
    const head = n.split(" ")[0] ?? "";
    return head.length >= 3 && hasPrefix(head);
  });
}

export interface BuildShoppingQueriesOptions {
  sizes: UserSizes;
  audience: ShoppingAudience | null;
  /** Opciones por prenda (3–5 según el SPEC). */
  limit?: number;
}

/** Una query por prenda del look, con slot, términos, talle y público. */
export function buildShoppingQueries(
  look: LookSpec,
  { sizes, audience, limit = 4 }: BuildShoppingQueriesOptions,
): Array<{ slot: GarmentSlot; query: ShoppingQuery }> {
  const clamped = Math.min(Math.max(limit, 3), 5);
  return listLookGarments(look).map(({ slot, garment }) => ({
    slot,
    query: {
      garment,
      country_code: "UY",
      size: sizeForCategory(sizes, garment.category),
      max_price: null,
      limit: clamped,
      slot,
      search_terms: buildSearchTerms(garment),
      audience,
      strict_max_price: false,
    },
  }));
}
