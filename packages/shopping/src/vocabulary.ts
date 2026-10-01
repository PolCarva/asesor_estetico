import type { ProductCategory } from "@asesor/shared";

/**
 * Vocabulario de tiendas uruguayas para normalizar productos. Los patrones se aplican
 * sobre texto en minúsculas y sin tildes (`normalizeText`), y aceptan plurales y
 * variantes de género.
 */

/** Sustantivos de prenda. Gana el que aparece primero en el título ("Sobrecamisa jean" → abrigo). */
export const CATEGORY_PATTERNS: Array<[ProductCategory, RegExp]> = [
  [
    "OUTERWEAR",
    /\b(sobrecamisas?|overshirts?|camperas?|chaquetas?|abrigos?|tapados?|parkas?|jackets?|rompevientos?|pilotos?|chalecos?|trench|anoraks?|puffers?|cazadoras?)\b/,
  ],
  // "shirt" no cuenta dentro de "t-shirt".
  ["SHIRT", /\bcamisas?\b|(?<!\bt[- ]?)\bshirts?\b/],
  ["T_SHIRT", /\b(remeras?|camisetas?|t-?shirts?|polos?|chombas?)\b/],
  ["TOP", /\b(musculosas?|tops?|blusas?|bodys?|crop)\b/],
  [
    "KNITWEAR",
    /\b(sweaters?|sueters?|buzos?|cardigans?|pullovers?|hoodies?|canguros?|jerseys?|tejidos?)\b/,
  ],
  ["BLAZER", /\b(blazers?|sacos?|americanas?)\b/],
  ["JEANS", /\b(jeans?|vaqueros?|denim)\b/],
  ["PANTS", /\b(pantalon(es)?|chinos?|joggers?|trousers|palazzos?|calzas?|leggings?|babuchas?)\b/],
  ["SHORTS", /\b(shorts?|bermudas?)\b/],
  ["SKIRT", /\b(polleras?|faldas?|skirts?)\b/],
  ["DRESS", /\b(vestidos?|dress(es)?|enteritos?)\b/],
  [
    "SHOES",
    /\b(zapatos?|zapatillas?|champion(es)?|botas?|botin(es)?|borcegos?|borcegui(es)?|boots?|loafers?|mocasin(es)?|sandalias?|sneakers?|ojotas?|alpargatas?|nauticos?|chinelas?|pantuflas?|chatitas?)\b/,
  ],
  ["BAG", /\b(carteras?|bolsos?|mochilas?|bags?|rinoneras?|bandoleras?|morrales?)\b/],
  ["BELT", /\b(cintos?|cinturon(es)?|belts?)\b/],
  ["WATCH", /\b(relojes|reloj|watch(es)?)\b/],
  ["EYEWEAR", /\b(lentes|anteojos|gafas|sunglasses)\b/],
  ["HAT", /\b(gorros?|gorras?|sombreros?|boinas?|pilusos?|beanies?)\b/],
  ["SCARF", /\b(bufandas?|panuelos?|foulards?|scarf|scarves|pashminas?)\b/],
  [
    "JEWELRY",
    /\b(collar(es)?|cadenas?|anillos?|pulseras?|aros|caravanas?|colgantes?|dijes?|esclavas?|brazaletes?|aretes?|argollas?)\b/,
  ],
];

/** Cosas que no son ropa aunque compartan palabras ("reloj despertador", "almohadón"). */
export const NOT_APPAREL =
  /\b(despertador(es)?|almohad\w*|sabanas?|toallas?|cortinas?|mantel(es)?|mascotas?|juguetes?)\b/;

/** Fit explícito → valor canónico (en el mismo idioma que los LookSpecs). */
export const FIT_PATTERNS: Array<[string, string]> = [
  ["oversize", "over-?\\s?sized?"],
  ["skinny", "skinny|chupin"],
  ["slim", "slim|entallad[oa]s?|ajustad[oa]s?|fitted"],
  ["relajado", "relaxed|relajad[oa]s?|loose|holgad[oa]s?|baggy"],
  ["ancho", "wide(\\s?leg)?|pierna ancha|palazzo"],
  ["recto", "rect[oa]s?|straight"],
  ["regular", "regular"],
  ["boxy", "boxy"],
];

/** Colores → nombre canónico en español (el que usan los LookSpecs). */
export const COLOR_PATTERNS: Array<[string, RegExp]> = [
  ["azul marino", /\b(azul marino|marino|navy)\b/],
  ["celeste", /\b(celestes?|light blue|sky blue)\b/],
  ["azul", /\b(azul(es)?|blue|indigo|denim)\b/],
  ["negro", /\b(negr[oa]s?|black)\b/],
  ["blanco", /\b(blanc[oa]s?|white)\b/],
  ["crudo", /\b(crud[oa]s?|ecru|off[- ]?white|cream|hueso|marfil)\b/],
  ["beige", /\b(beige|nude)\b/],
  ["arena", /\b(arena|sand)\b/],
  ["camel", /\bcamel\b/],
  ["caqui", /\b(caqui|khaki|kaki)\b/],
  ["marrón", /\b(marron(es)?|brown|chocolate|cafe|tabaco|cognac)\b/],
  ["verde oliva", /\b(verde oliva|oliva|olive|militar)\b/],
  ["verde", /\b(verdes?|green)\b/],
  ["gris", /\b(gris(es)?|grey|gray|melange|grafito|plomo|antracita|charcoal|carbon)\b/],
  ["bordó", /\b(bordo|bordeaux|burgundy|vino|borravino)\b/],
  ["rojo", /\b(roj[oa]s?|red)\b/],
  ["rosa", /\b(rosas?|rosad[oa]s?|pink|fucsia)\b/],
  ["amarillo", /\b(amarill[oa]s?|yellow)\b/],
  ["mostaza", /\bmostaza\b/],
  ["naranja", /\b(naranjas?|orange)\b/],
  ["terracota", /\b(terracota|ladrillo)\b/],
  ["violeta", /\b(violetas?|purple|morad[oa]s?|lila|lilac)\b/],
  ["turquesa", /\b(turquesas?|turquoise)\b/],
  ["dorado", /\b(dorad[oa]s?|gold)\b/],
  ["plateado", /\b(platead[oa]s?|silver)\b/],
];

/**
 * Hex aproximado de cada color canónico, para medir cercanía con el color de la prenda del
 * LookSpec (que trae hex). Solo se usa para comparar; nunca se muestra.
 */
export const COLOR_HEX: Record<string, string> = {
  "azul marino": "#1F2A44",
  celeste: "#8EC5E8",
  azul: "#2F5DA8",
  negro: "#111111",
  blanco: "#F7F7F5",
  crudo: "#EFE8DA",
  beige: "#D8C3A5",
  arena: "#D2B48C",
  camel: "#C19A6B",
  caqui: "#A69C6B",
  marrón: "#6F4E37",
  "verde oliva": "#6B6B3A",
  verde: "#3E7B4F",
  gris: "#808080",
  bordó: "#6D1A2B",
  rojo: "#C0392B",
  rosa: "#E8A0B4",
  amarillo: "#F2C94C",
  mostaza: "#D4A017",
  naranja: "#E67E22",
  terracota: "#B5553C",
  violeta: "#7D5BA6",
  turquesa: "#40B5AD",
  dorado: "#C9A44C",
  plateado: "#C0C0C0",
};

/** Materiales → nombre canónico. `titleOnly`: muy ambiguo en descripciones ("combinalo con un jean"). */
export const MATERIAL_PATTERNS: Array<[string, RegExp, { titleOnly?: boolean }?]> = [
  ["algodón", /\b(algodon|cotton)\b/],
  ["lino", /\b(lino|linen)\b/],
  ["lana", /\b(lana|wool|merino)\b/],
  ["cashmere", /\b(cashmere|cachemir[ae]?)\b/],
  ["cuero sintético", /\b(eco\s?-?cuero|cuero (ecologico|sintetico|vegano)|simil cuero)\b/],
  ["cuero", /\b(cuero|leather)\b/],
  ["gamuza", /\b(gamuza|suede)\b/],
  ["seda", /\b(seda|silk)\b/],
  ["poliéster", /\b(poliester|polyester)\b/],
  ["viscosa", /\b(viscosa|viscose|rayon)\b/],
  ["elastano", /\b(elastano|elastane|spandex|lycra)\b/],
  ["nylon", /\b(nylon|nailon|poliamida|polyamide)\b/],
  ["denim", /\b(denim|jeans?)\b/, { titleOnly: true }],
  ["pana", /\b(pana|corderoy|corduroy)\b/],
  ["gabardina", /\bgabardina\b/],
  ["franela", /\b(franela|flannel)\b/],
  ["lyocell", /\b(lyocell|tencel)\b/],
  ["acrílico", /\b(acrilico|acrylic)\b/],
  ["tweed", /\btweed\b/],
  ["terciopelo", /\b(terciopelo|velvet)\b/],
  ["lona", /\b(lona|canvas)\b/],
  ["piqué", /\bpique\b/],
];
