import { z } from "zod";

import type { PoliteHttpClient } from "./http";
import type { StorePlatform } from "./registry";

/** Resultado crudo de la búsqueda de una tienda (antes de filtrar por pertinencia). */
export interface StoreHit {
  url: string;
  title: string | null;
}

export interface PlatformSearchInput {
  /** Host de la tienda, p. ej. `legacy.com.uy`. */
  domain: string;
  term: string;
  limit: number;
  /** Fenicio: ruta del listado. */
  searchPath?: string;
}

export type PlatformAdapter = (
  http: PoliteHttpClient,
  input: PlatformSearchInput,
) => Promise<StoreHit[]>;

export class MalformedResponseError extends Error {
  constructor(source: string, cause: unknown) {
    super(`Respuesta inesperada de ${source}`, { cause });
    this.name = "MalformedResponseError";
  }
}

/** Valida datos externos con Zod; un formato inesperado es una falla de esa tienda. */
export function parseExternal<T>(schema: z.ZodType<T>, data: unknown, source: string): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new MalformedResponseError(source, result.error);
  return result.data;
}

function parseJson(body: string, source: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch (error) {
    throw new MalformedResponseError(source, error);
  }
}

const httpUrl = z.url({ protocol: /^https?$/ });

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

// --- Fenicio: listado HTML `/catalogo?q=` --------------------------------------------

const FenicioHitsSchema = z.array(
  z.object({ url: httpUrl, title: z.string().max(300).nullable() }),
);

/**
 * Items del listado de Fenicio: `<div class='it …'><div class='cnt'><a class="img"
 * href="…" title="…">`. El título puede faltar (se usa el slug).
 */
export function parseFenicioListing(html: string, domain: string): StoreHit[] {
  const hits: StoreHit[] = [];
  for (const match of html.matchAll(/<a\s[^>]*class="img"[^>]*>/g)) {
    const tag = match[0];
    const href = /href="([^"]+)"/.exec(tag)?.[1];
    if (!href) continue;
    const title = /title="([^"]*)"/.exec(tag)?.[1];
    hits.push({
      url: new URL(decodeEntities(href), `https://${domain}`).toString(),
      title: title ? decodeEntities(title) : null,
    });
  }
  return parseExternal(FenicioHitsSchema, hits, `Fenicio ${domain}`);
}

export const searchFenicio: PlatformAdapter = async (http, { domain, term, limit, searchPath }) => {
  const url = `https://${domain}${searchPath ?? "/catalogo"}?q=${encodeURIComponent(term)}`;
  const res = await http.get(url, { accept: "text/html" });
  return parseFenicioListing(res.body, domain).slice(0, limit);
};

// --- VTEX: API de catálogo -------------------------------------------------------------

const VtexSearchSchema = z.array(
  z.object({
    productName: z.string().min(1).max(300),
    link: httpUrl,
    brand: z.string().nullish(),
  }),
);

export function parseVtexSearch(data: unknown, domain: string): StoreHit[] {
  return parseExternal(VtexSearchSchema, data, `VTEX ${domain}`).map((p) => ({
    url: p.link,
    title: p.productName,
  }));
}

export const searchVtex: PlatformAdapter = async (http, { domain, term, limit }) => {
  const url = `https://${domain}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(term)}&_from=0&_to=${limit - 1}`;
  const res = await http.get(url, { accept: "application/json" });
  return parseVtexSearch(parseJson(res.body, `VTEX ${domain}`), domain);
};

// --- Shopify: predictive search `suggest.json` ------------------------------------------

const ShopifySuggestSchema = z.object({
  resources: z.object({
    results: z.object({
      products: z.array(
        z.object({
          title: z.string().min(1).max(300),
          url: z.string().min(1).max(500),
          available: z.boolean().nullish(),
        }),
      ),
    }),
  }),
});

export function parseShopifySuggest(data: unknown, domain: string): StoreHit[] {
  const parsed = parseExternal(ShopifySuggestSchema, data, `Shopify ${domain}`);
  return parsed.resources.results.products.map((p) => {
    // La URL viene relativa y con parámetros de tracking (`?_pos=…`).
    const url = new URL(p.url, `https://${domain}`);
    url.search = "";
    return { url: url.toString(), title: p.title };
  });
}

export const searchShopify: PlatformAdapter = async (http, { domain, term, limit }) => {
  const url = `https://${domain}/search/suggest.json?q=${encodeURIComponent(term)}&resources%5Btype%5D=product&resources%5Blimit%5D=${Math.min(limit, 10)}`;
  const res = await http.get(url, { accept: "application/json" });
  return parseShopifySuggest(parseJson(res.body, `Shopify ${domain}`), domain);
};

// --- WooCommerce: Store API ------------------------------------------------------------

const WooProductsSchema = z.array(
  z.object({
    name: z.string().min(1).max(300),
    permalink: httpUrl,
    is_in_stock: z.boolean().nullish(),
  }),
);

export function parseWooProducts(data: unknown, domain: string): StoreHit[] {
  return parseExternal(WooProductsSchema, data, `WooCommerce ${domain}`).map((p) => ({
    url: p.permalink,
    title: decodeEntities(p.name),
  }));
}

export const searchWoo: PlatformAdapter = async (http, { domain, term, limit }) => {
  const url = `https://${domain}/wp-json/wc/store/v1/products?search=${encodeURIComponent(term)}&per_page=${limit}`;
  const res = await http.get(url, { accept: "application/json" });
  return parseWooProducts(parseJson(res.body, `WooCommerce ${domain}`), domain);
};

/** Adaptador de búsqueda por plataforma. Magento queda fuera (poca ropa, robots `/*?`). */
export const PLATFORM_ADAPTERS: Partial<Record<StorePlatform, PlatformAdapter>> = {
  FENICIO: searchFenicio,
  VTEX: searchVtex,
  SHOPIFY: searchShopify,
  WOOCOMMERCE: searchWoo,
};

/**
 * Detecta la plataforma de una tienda desconocida por su huella en headers y HTML, para
 * reusar los adaptadores con tiendas halladas por descubrimiento web.
 */
export function detectPlatform(headers: Headers, html: string): StorePlatform | null {
  if (/f\.fcdn\.app/.test(html) || headers.get("x-powered-by") === "MV") return "FENICIO";
  if (/vtexassets\.com|vteximg\.com|vtex\.com\.br/.test(html)) return "VTEX";
  if (/cdn\.shopify\.com|Shopify\.shop/.test(html) || headers.has("x-shopid")) return "SHOPIFY";
  if (/wp-content\/plugins\/woocommerce|woocommerce/i.test(html) && /wp-content/.test(html)) {
    return "WOOCOMMERCE";
  }
  if (/Magento|mage\/cookies/.test(html)) return "MAGENTO";
  return null;
}
