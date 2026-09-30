import type { FetchedPage, RawProduct } from "./types";

type Json = Record<string, unknown>;

const asString = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;
const asNumber = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : null;
};
const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);
const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function readJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const pattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      blocks.push(JSON.parse(match[1] ?? ""));
    } catch {
      // JSON-LD roto: se ignora ese bloque.
    }
  }
  return blocks;
}

function findProductNode(value: unknown): Json | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findProductNode(item);
      if (found) return found;
    }
    return null;
  }
  if (!isObject(value)) return null;
  const type = value["@type"];
  if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) return value;
  if (value["@graph"]) return findProductNode(value["@graph"]);
  return null;
}

function readOffer(offers: unknown) {
  const offer = first(isObject(offers) && Array.isArray(offers.offers) ? offers.offers : offers);
  if (!isObject(offer)) return { price: null, currency: null, availability: null };
  return {
    price: asNumber(offer.price ?? offer.lowPrice),
    currency: asString(offer.priceCurrency),
    availability: asString(offer.availability),
  };
}

/**
 * Extrae un producto de una página usando JSON-LD (schema.org/Product), que es el
 * formato estándar de la mayoría de las tiendas. Devuelve null si no hay producto.
 * Extractores específicos por tienda se agregarán cuando haya scraping real.
 */
export function extractProduct(page: FetchedPage): RawProduct | null {
  if (page.status < 200 || page.status >= 300 || !page.contentType.includes("html")) return null;
  const node = readJsonLdBlocks(page.body).map(findProductNode).find(Boolean) ?? null;
  if (!node) return null;

  const offer = readOffer(node.offers);
  const variantsSource = Array.isArray(node.hasVariant) ? node.hasVariant : [];
  const brand = first(node.brand);

  return {
    url: page.url,
    externalId: asString(node.sku) ?? asString(node.productID) ?? null,
    title: asString(node.name),
    brand: isObject(brand) ? asString(brand.name) : asString(brand),
    description: asString(node.description),
    imageUrl: asString(first(node.image)),
    price: offer.price,
    currency: offer.currency,
    availability: offer.availability,
    color: asString(node.color),
    material: asString(node.material),
    category: asString(node.category),
    variants: variantsSource.filter(isObject).map((variant) => {
      const vOffer = readOffer(variant.offers);
      return {
        id: asString(variant.sku) ?? asString(variant["@id"]),
        sku: asString(variant.sku),
        size: asString(variant.size),
        color: asString(variant.color),
        availability: vOffer.availability,
        price: vOffer.price,
      };
    }),
  };
}
