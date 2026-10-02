import { type MicrodataItem, type PageData, parseHtml } from "./html";
import { normalizeAvailability, parsePrice } from "./normalize";
import type { ProductAudience } from "@asesor/shared";

import type {
  ExtractSource,
  FetchedPage,
  RawField,
  RawPlace,
  RawProduct,
  RawVariant,
} from "./types";

/**
 * Extracción genérica en cascada, como pide el SPEC: 1) JSON-LD (`Product` o
 * `ProductGroup`), 2) microdata schema.org (`itemprop`, típico de Fenicio), 3) OpenGraph
 * y `product:*`. Cada dato sale de la primera fuente que lo trae y queda anotado en
 * `sources`. Nunca se completa lo que la página no dice.
 */

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const asArray = (v: unknown): unknown[] =>
  Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];

const ENTITIES: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  ntilde: "ñ",
  uuml: "ü",
  Aacute: "Á",
  Eacute: "É",
  Iacute: "Í",
  Oacute: "Ó",
  Uacute: "Ú",
  Ntilde: "Ñ",
  ordm: "º",
  deg: "°",
};

/**
 * Carácter de una entidad numérica, o null si no es un code point válido (fuera de rango o
 * mitad de un par sustituto): `String.fromCodePoint` lanza con esos y una sola página rota
 * no puede tirar abajo la búsqueda de una prenda (paso 11).
 */
function codePoint(n: number): string | null {
  if (!Number.isInteger(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return null;
  return String.fromCodePoint(n);
}

/** El JSON-LD a veces trae entidades HTML adentro de los strings (`H&amp;M`). */
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      return codePoint(parseInt(code.slice(2), 16)) ?? match;
    }
    if (code.startsWith("#")) return codePoint(Number(code.slice(1))) ?? match;
    return ENTITIES[code] ?? match;
  });
}

/** Texto limpio: sin etiquetas, entidades ni espacios de más. */
function text(v: unknown): string | null {
  if (typeof v === "number") return String(v);
  if (typeof v !== "string") return null;
  const clean = decodeEntities(v.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  return clean || null;
}

const firstText = (v: unknown): string | null => {
  for (const item of asArray(v)) {
    const t = isObject(item) ? text(item.name) : text(item);
    if (t) return t;
  }
  return null;
};

function absoluteUrl(raw: string | null, base: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim(), base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function imageOf(value: unknown, base: string): string | null {
  for (const item of asArray(value)) {
    const raw = isObject(item) ? (text(item.url) ?? text(item.contentUrl)) : text(item);
    const url = absoluteUrl(raw, base);
    if (url) return url;
  }
  return null;
}

const typesOf = (node: Json): string[] =>
  asArray(node["@type"])
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.replace(/^https?:\/\/schema\.org\//i, ""));

const isProductNode = (node: Json) =>
  typesOf(node).some((t) => t === "Product" || t === "ProductGroup" || t === "IndividualProduct");

/** Partes de un producto que puede dar una fuente. */
interface Part {
  externalId: string | null;
  sku: string | null;
  title: string | null;
  brand: string | null;
  description: string | null;
  imageUrl: string | null;
  price: number | string | null;
  currency: string | null;
  availability: string | null;
  color: string | null;
  material: string | null;
  category: string | null;
  variants: RawVariant[];
  regions: string[];
  inStore: RawPlace | null;
}

interface Offer {
  price: number | string | null;
  currency: string | null;
  availability: string | null;
  sku: string | null;
  url: string | null;
  /** `eligibleRegion` / `areaServed`. */
  regions: string[];
  /** `availableAtOrFrom`: el local donde está. */
  place: unknown;
}

/** Regiones como texto: `"UY"`, `{ name: "Uruguay" }`, `{ addressCountry: "UY" }`. */
function regionsOf(value: unknown): string[] {
  return asArray(value).flatMap((item) => {
    const region = isObject(item)
      ? (text(item.name) ?? countryOf(item.addressCountry) ?? text(item.identifier))
      : text(item);
    return region ? [region] : [];
  });
}

const countryOf = (value: unknown): string | null =>
  isObject(value) ? text(value.name) : text(value);

/** Lugar físico (Place, Store, LocalBusiness): dirección, teléfono y link, si los declara. */
function readPlace(value: unknown, base: string): RawPlace | null {
  const node = asArray(value).find(isObject);
  if (!node) return null;
  const rawAddress = asArray(node.address)[0];
  const address = isObject(rawAddress) ? rawAddress : null;
  const place: RawPlace = {
    name: text(node.name),
    address: address ? text(address.streetAddress) : text(rawAddress),
    locality: address ? (text(address.addressLocality) ?? text(address.addressRegion)) : null,
    country: address ? countryOf(address.addressCountry) : null,
    phone: text(node.telephone),
    url: absoluteUrl(text(node.url), base),
  };
  return place.address || place.phone ? place : null;
}

function readOffers(value: unknown): Offer[] {
  return asArray(value)
    .filter(isObject)
    .flatMap((offer): Offer[] => {
      const currency = text(offer.priceCurrency);
      if (typesOf(offer).includes("AggregateOffer")) {
        const inner = readOffers(offer.offers).map((o) => ({
          ...o,
          currency: o.currency ?? currency,
        }));
        if (inner.length > 0) return inner;
        const price = (offer.lowPrice ?? offer.price ?? null) as number | string | null;
        return [
          {
            price,
            currency,
            availability: text(offer.availability),
            sku: null,
            url: null,
            regions: regionsOf(offer.eligibleRegion ?? offer.areaServed),
            place: offer.availableAtOrFrom,
          },
        ];
      }
      const spec = asArray(offer.priceSpecification).find(isObject);
      const price = (offer.price ?? spec?.price ?? offer.lowPrice ?? null) as
        number | string | null;
      return [
        {
          price: typeof price === "number" || typeof price === "string" ? price : null,
          currency: currency ?? (spec ? text(spec.priceCurrency) : null),
          availability: text(offer.availability),
          sku: text(offer.sku),
          url: text(offer.url),
          regions: regionsOf(offer.eligibleRegion ?? offer.areaServed),
          place: offer.availableAtOrFrom,
        },
      ];
    });
}

/** Precio del producto: el menor entre las ofertas disponibles (o entre todas, si ninguna lo está). */
function pickOffer(offers: Offer[]): Offer | null {
  const priced = offers
    .map((offer) => ({ offer, amount: parsePrice(offer.price) }))
    .filter((o): o is { offer: Offer; amount: number } => o.amount !== null);
  const inStock = priced.filter((o) => normalizeAvailability(o.offer.availability) === "IN_STOCK");
  const pool = inStock.length > 0 ? inStock : priced;
  if (pool.length === 0) return offers[0] ?? null;
  return pool.reduce((best, o) => (o.amount < best.amount ? o : best)).offer;
}

/** "Alguna variante disponible" = disponible; todas agotadas = agotado; si no, no se sabe. */
function aggregateAvailability(values: Array<string | null>): string | null {
  const states = values.map(normalizeAvailability);
  if (states.includes("IN_STOCK")) return "InStock";
  if (states.length > 0 && states.every((s) => s === "OUT_OF_STOCK")) return "OutOfStock";
  if (states.includes("IN_STORE_ONLY")) return "InStoreOnly";
  return null;
}

/** Id de variante de la plataforma en la URL (`?variant=123` de Shopify). */
function variantParam(raw: string | null, base: string): string | null {
  if (!raw) return null;
  try {
    return new URL(raw, base).searchParams.get("variant");
  } catch {
    return null;
  }
}

function readProductNode(node: Json, base: string): Part {
  const isGroup = typesOf(node).includes("ProductGroup");
  const variantNodes = asArray(node.hasVariant).filter(isObject);
  const ownOffers = readOffers(node.offers);
  const variantOffers = variantNodes.flatMap((v) => readOffers(v.offers));
  const offers = ownOffers.length > 0 ? ownOffers : variantOffers;
  const chosen = pickOffer(offers);

  let variants: RawVariant[] = [];
  if (variantNodes.length > 0) {
    variants = variantNodes.map((v) => {
      const offer = pickOffer(readOffers(v.offers));
      const sku = text(v.sku);
      return {
        id: variantParam(text(v["@id"]), base) ?? variantParam(offer?.url ?? null, base) ?? sku,
        sku,
        size: firstText(v.size),
        color: firstText(v.color),
        availability: offer?.availability ?? null,
        price: offer?.price ?? null,
        currency: offer?.currency ?? null,
      };
    });
  } else if (ownOffers.length > 1) {
    // Shopify y VTEX: un Offer por variante.
    variants = ownOffers.map((o) => ({
      id: variantParam(o.url, base) ?? o.sku,
      sku: o.sku,
      size: null,
      color: null,
      availability: o.availability,
      price: o.price,
      currency: o.currency,
    }));
  }

  return {
    externalId: text(node.productGroupID) ?? text(node.productID),
    sku: text(node.sku),
    title: text(node.name),
    brand: firstText(node.brand),
    description: text(node.description),
    imageUrl:
      imageOf(node.image, base) ??
      (isGroup
        ? imageOf(
            variantNodes.map((v) => v.image),
            base,
          )
        : null),
    price: chosen?.price ?? null,
    currency: chosen?.currency ?? offers.find((o) => o.currency)?.currency ?? null,
    availability: aggregateAvailability(offers.map((o) => o.availability)),
    color: asArray(node.color).map(text).filter(Boolean).join(", ") || null,
    material: asArray(node.material).map(text).filter(Boolean).join(", ") || null,
    category: firstText(node.category),
    variants,
    regions: [...new Set(offers.flatMap((o) => o.regions))],
    inStore: offers.map((o) => readPlace(o.place, base)).find(Boolean) ?? null,
  };
}

const PLACE_TYPE = /^(LocalBusiness|Store|[A-Za-z]+Store|Organization|Place)$/;

/** Nodos JSON-LD de primer nivel (con `@graph` aplanado). */
function topNodes(blocks: unknown[]): Json[] {
  return blocks
    .flatMap((b) => asArray(isObject(b) && b["@graph"] ? b["@graph"] : b))
    .filter(isObject);
}

/** Locales que declara la página (JSON-LD o microdata `LocalBusiness`, `Store`…). */
function pagePlace(data: PageData, base: string): RawPlace | null {
  const nodes = [
    ...topNodes(data.jsonLd),
    ...allItems(data.items).map((item) => microdataToJson(item)),
  ].filter((node) => typesOf(node).some((t) => PLACE_TYPE.test(t)));
  for (const node of nodes) {
    const place = readPlace(node, base);
    if (place) return place;
  }
  return null;
}

/** Nodos de producto del JSON-LD (en `@graph`, arrays o `mainEntity`), sin entrar en listas. */
function productNodes(value: unknown, depth = 0): Json[] {
  if (depth > 4) return [];
  if (Array.isArray(value)) return value.flatMap((v) => productNodes(v, depth + 1));
  if (!isObject(value)) return [];
  if (isProductNode(value)) return [value];
  if (typesOf(value).some((t) => t === "ItemList" || t === "BreadcrumbList")) return [];
  return [value["@graph"], value.mainEntity].flatMap((v) => productNodes(v, depth + 1));
}

function breadcrumbNames(blocks: unknown[]): string[] {
  const names = blocks
    .flatMap((b) => asArray(isObject(b) && b["@graph"] ? b["@graph"] : b))
    .filter((b): b is Json => isObject(b) && typesOf(b).includes("BreadcrumbList"))
    .flatMap((b) => asArray(b.itemListElement).filter(isObject))
    .map((item) => text(item.name) ?? (isObject(item.item) ? text(item.item.name) : null));
  // La última miga es el propio producto.
  return [...new Set(names.slice(0, -1).filter((n): n is string => Boolean(n)))];
}

function fromJsonLd(data: PageData, base: string): Part | null {
  const nodes = data.jsonLd.flatMap((b) => productNodes(b));
  // Tres o más productos distintos: es un listado, no la página de un producto.
  if (new Set(nodes.map((n) => text(n.name))).size >= 3) return null;
  const node = nodes.find((n) => typesOf(n).includes("ProductGroup")) ?? nodes[0];
  if (!node) return null;
  const part = readProductNode(node, base);
  const crumbs = breadcrumbNames(data.jsonLd);
  const category = [part.category, ...crumbs].filter(Boolean);
  return { ...part, category: category.length > 0 ? [...new Set(category)].join(" / ") : null };
}

/** Item de microdata → objeto con forma de JSON-LD, para leerlo con la misma lógica. */
function microdataToJson(item: MicrodataItem, depth = 0): Json {
  const node: Json = {
    "@type": item.types.map((t) => t.replace(/^https?:\/\/schema\.org\//i, "")),
  };
  for (const [name, values] of item.props) {
    const converted = values.map((v) =>
      typeof v === "string" ? v : depth < 4 ? microdataToJson(v, depth + 1) : null,
    );
    node[name] = converted.length === 1 ? converted[0] : converted;
  }
  return node;
}

function allItems(items: MicrodataItem[], depth = 0): MicrodataItem[] {
  if (depth > 4) return [];
  return items.flatMap((item) => [
    item,
    ...allItems(
      [...item.props.values()].flat().filter((v): v is MicrodataItem => typeof v !== "string"),
      depth + 1,
    ),
  ]);
}

function fromMicrodata(data: PageData, base: string): Part | null {
  const item = allItems(data.items)
    .map((i) => microdataToJson(i))
    .find(isProductNode);
  return item ? readProductNode(item, base) : null;
}

function fromOpenGraph(data: PageData, base: string): Part | null {
  const get = (...keys: string[]) => {
    for (const key of keys) {
      const value = data.meta.get(key)?.find((v) => v.trim());
      if (value) return value.trim();
    }
    return null;
  };
  const type = get("og:type")?.toLowerCase() ?? "";
  const price = get("product:price:amount", "og:price:amount");
  // Sin og:type de producto ni precio, OpenGraph describe otra cosa (home, categoría).
  if (!type.includes("product") && price === null) return null;
  const site = get("og:site_name");
  let title = get("og:title");
  if (title && site) title = title.replace(new RegExp(`\\s*[—|–-]\\s*${escapeRegExp(site)}$`), "");
  return {
    externalId: null,
    title,
    brand: get("product:brand", "og:brand"),
    description: get("og:description"),
    imageUrl: absoluteUrl(get("og:image:secure_url", "og:image", "og:image:url"), base),
    price,
    currency: get("product:price:currency", "og:price:currency"),
    availability: get("product:availability", "og:availability"),
    color: get("product:color"),
    material: get("product:material"),
    category: data.meta.get("product:category")?.join(" / ") ?? null,
    variants: [],
    sku: get("product:retailer_item_id"),
    regions: [],
    inStore: null,
  };
}

// --- Público ---------------------------------------------------------------------------

const AUDIENCE_WORDS: Array<[Exclude<ProductAudience, "UNISEX">, RegExp]> = [
  ["MEN", /\b(hombres?|caballeros?|masculinos?|varon(es)?|male|men)\b/],
  ["WOMEN", /\b(mujer(es)?|damas?|femeninos?|female|women)\b/],
];

const plain = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/**
 * Público que nombra un texto: uno solo de los dos, o "unisex" dicho explícitamente. Si nombra
 * a los dos (una tienda "de hombre y de mujer"), no dice nada del producto: null.
 */
function audienceIn(texts: string[]): ProductAudience | null {
  const t = plain(texts.join(" · "));
  if (/\bunisex\b/.test(t)) return "UNISEX";
  const found = AUDIENCE_WORDS.filter(([, re]) => re.test(t)).map(([audience]) => audience);
  return found.length === 1 ? found[0]! : null;
}

/** Valores de unas claves en cualquier nivel de un JSON (`gender`, `suggestedGender`). */
function valuesOf(value: unknown, keys: string[], depth = 0): string[] {
  if (depth > 6) return [];
  if (Array.isArray(value)) return value.flatMap((v) => valuesOf(v, keys, depth + 1));
  if (!isObject(value)) return [];
  return Object.entries(value).flatMap(([key, v]) =>
    keys.includes(key) ? asArray(v).flatMap((x) => text(x) ?? []) : valuesOf(v, keys, depth + 1),
  );
}

/** "Sección" del producto en las tiendas Fenicio (`"carac":{"seccion":"Hombre"}` en la página). */
const FENICIO_SECTION = /"seccion"\s*:\s*"([^"]{2,40})"/;

/**
 * Público que declara la página (paso 11): primero el del producto (schema.org `gender` o
 * `audience.suggestedGender`, la sección de Fenicio y las migas de pan) y, si no dice nada, el
 * de la tienda (`Organization`/`WebSite`/`Store`: "Tienda de Ropa para Mujer"). No se deduce
 * de la foto ni del nombre de la prenda: si la página no lo dice, queda null.
 */
function pageAudience(data: PageData, body: string): ProductAudience | null {
  const nodes = [...topNodes(data.jsonLd), ...allItems(data.items).map((i) => microdataToJson(i))];
  const crumbs = [
    ...breadcrumbNames(data.jsonLd),
    // Migas en microdata (`data-vocabulary.org/Breadcrumb` o `ListItem`).
    ...nodes
      .filter((n) => typesOf(n).some((t) => /Breadcrumb|ListItem/.test(t)))
      .flatMap((n) => [text(n.title), text(n.name)].filter((x): x is string => Boolean(x))),
  ];
  const product = audienceIn([
    ...valuesOf(data.jsonLd, ["gender", "suggestedGender"]),
    ...nodes.flatMap((n) => valuesOf(n, ["gender", "suggestedGender"])),
    FENICIO_SECTION.exec(body)?.[1] ?? "",
    ...crumbs,
  ]);
  if (product) return product;
  const store = nodes
    .filter((n) =>
      typesOf(n).some((t) => /^(Organization|WebSite|OnlineStore|ClothingStore|Store)$/.test(t)),
    )
    .flatMap((n) => [text(n.name), text(n.alternateName), text(n.description)])
    .filter((x): x is string => Boolean(x));
  // A nivel tienda, "unisex" no dice nada del producto.
  const declared = audienceIn(store);
  return declared === "UNISEX" ? null : declared;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const SIMPLE_FIELDS = [
  "externalId",
  "sku",
  "title",
  "brand",
  "description",
  "imageUrl",
  "color",
  "material",
  "category",
] as const;

export function isHtmlContentType(contentType: string): boolean {
  return /text\/html|application\/xhtml\+xml/i.test(contentType);
}

/**
 * Extrae un producto de una página. Devuelve null si no es una página de producto
 * (respuesta de error, listado, home o HTML sin datos de producto).
 */
export function extractProduct(page: FetchedPage): RawProduct | null {
  if (page.status < 200 || page.status >= 300 || !isHtmlContentType(page.contentType)) return null;
  const data = parseHtml(page.body);
  const parts = (
    [
      ["jsonld", fromJsonLd(data, page.url)],
      ["microdata", fromMicrodata(data, page.url)],
      ["opengraph", fromOpenGraph(data, page.url)],
    ] as Array<[ExtractSource, Part | null]>
  ).filter((p): p is [ExtractSource, Part] => p[1] !== null);
  if (parts.length === 0) return null;

  const place = parts.map(([, part]) => part.inStore).find(Boolean) ?? pagePlace(data, page.url);
  // `og:locale` "es_UY" también dice dónde vende.
  const locales = (data.meta.get("og:locale") ?? []).map((l) => l.split(/[_-]/)[1] ?? "");
  const raw: RawProduct = {
    url: page.url,
    canonicalUrl: absoluteUrl(data.canonical, page.url),
    externalId: null,
    sku: null,
    title: null,
    brand: null,
    description: null,
    imageUrl: null,
    price: null,
    currency: null,
    availability: null,
    color: null,
    material: null,
    category: null,
    variants: [],
    regions: [
      ...new Set(
        [...parts.flatMap(([, part]) => part.regions), place?.country, ...locales].filter(
          (r): r is string => Boolean(r),
        ),
      ),
    ],
    inStore: place,
    audience: pageAudience(data, page.body),
    sources: {},
  };
  const take = (field: RawField, source: ExtractSource) => {
    raw.sources[field] = source;
  };
  for (const field of SIMPLE_FIELDS) {
    const hit = parts.find(([, part]) => part[field]);
    if (hit) {
      raw[field] = hit[1][field];
      take(field, hit[0]);
    }
  }
  // Precio y moneda salen juntos de la primera fuente con precio legible.
  const priced = parts.find(([, part]) => parsePrice(part.price) !== null);
  if (priced) {
    raw.price = priced[1].price;
    take("price", priced[0]);
    const currency = [priced, ...parts].find(([, part]) => part.currency);
    if (currency) {
      raw.currency = currency[1].currency;
      take("currency", currency[0]);
    }
  }
  const availability = [...(priced ? [priced] : []), ...parts].find(([, p]) => p.availability);
  if (availability) {
    raw.availability = availability[1].availability;
    take("availability", availability[0]);
  }
  const withVariants = parts.find(([, part]) => part.variants.length > 0);
  if (withVariants) {
    raw.variants = withVariants[1].variants;
    take("variants", withVariants[0]);
  }
  return raw;
}
