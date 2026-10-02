import { sizeSystem } from "@asesor/shared";
import { Parser } from "htmlparser2";
import { z } from "zod";

import { HttpStatusError, type PoliteHttpClient, RobotsDisallowedError } from "./providers/http";
import { detectPlatform, MalformedResponseError, parseExternal } from "./providers/platforms";
import { findRegisteredStore, type StorePlatform } from "./providers/registry";
import type { FetchedPage, RawProduct, RawVariant } from "./types";

/**
 * Talles y stock por variante desde la plataforma de la tienda (no por tienda): el JSON-LD
 * casi nunca los trae. Fenicio los publica en la propia página (`#lstTalles`); VTEX,
 * Shopify y WooCommerce, en endpoints públicos que robots.txt permite. Si el adaptador
 * falla, el producto sigue con lo que dijo su página y lo que no se verificó queda UNKNOWN.
 */

export type VariantSource =
  "fenicio:html" | "vtex:catalog" | "shopify:product-js" | "woo:store-api";

export type VariantFailure =
  /** robots.txt prohíbe el endpoint (BAS, H&M fuera de `?fq=`). */
  | "blocked"
  /** 404/410, 5xx, timeout o red. */
  | "unavailable"
  /** La respuesta no tiene el formato esperado. */
  | "malformed"
  /** La página no da con qué identificar el producto en la plataforma (sin SKU ni handle). */
  | "no_id"
  /** La plataforma devolvió otro producto que el de la página. */
  | "mismatch";

export type VariantResult =
  | {
      status: "verified";
      source: VariantSource;
      variants: RawVariant[];
      /** Disponibilidad del producto según la plataforma (alguna variante disponible). */
      availability: string | null;
    }
  /** Plataforma sin adaptador, o página sin variantes (accesorio de talle único). */
  | { status: "unsupported" }
  | { status: "failed"; source: VariantSource; reason: VariantFailure };

export interface VariantInput {
  page: FetchedPage;
  raw: RawProduct;
  /** Plataforma conocida (registro o huella del buscador); si falta, se detecta en el HTML. */
  platform?: string | null;
  signal?: AbortSignal;
}

/** Completa variantes, talles y stock de un producto ya extraído. */
export interface VariantEnricher {
  enrich(input: VariantInput): Promise<VariantResult>;
}

// "Calce" no: en las tiendas de Uruguay es el fit ("Calce: Regular", "calce bajo"), y leerlo
// como talle hacía que un "Slim" pasara por talle (paso 11).
const SIZE_KEY = /tall[ae]|tamañ|tamano|size|n[uú]mero/i;
const COLOR_KEY = /colou?r/i;

const IN_STOCK = "InStock";
const OUT_OF_STOCK = "OutOfStock";

/** "Alguna variante disponible" = disponible; todas agotadas = agotado; si no, no se sabe. */
export function availabilityOfVariants(variants: RawVariant[]): string | null {
  if (variants.some((v) => v.availability === IN_STOCK)) return IN_STOCK;
  if (variants.length > 0 && variants.every((v) => v.availability === OUT_OF_STOCK)) {
    return OUT_OF_STOCK;
  }
  return null;
}

const samePath = (a: string, b: string) => {
  try {
    const clean = (u: string) => new URL(u).pathname.replace(/\/+$/, "").toLowerCase();
    return clean(a) === clean(b);
  } catch {
    return false;
  }
};

// --- Fenicio: `#lstTalles` en la página del producto ----------------------------------

/**
 * Talles de una página Fenicio: `ul#lstTalles > li[data-stock] > input[name=sku]`. La
 * etiqueta visible está en `<b>` (en Indian `data-cpre` es un código). `data-stock` del `li`
 * dice "disponible" o "agotado"; el del `input`, la cantidad. Con `data-varia="true"` el
 * precio cambia por talle y viene en `<span class="precio">` dentro del `<b>` (La Isla): no es
 * parte del talle, es el precio de la variante. Devuelve null si la página no tiene la lista.
 */
export function parseFenicioSizes(html: string): RawVariant[] | null {
  let inList = false;
  let found = false;
  let depth = 0;
  let item: {
    li: Record<string, string>;
    input: Record<string, string> | null;
    label: string[];
    price: string[];
  } | null = null;
  let inLabel = false;
  /** Profundidad dentro de `span.precio` (0 = afuera). */
  let inPrice = 0;
  const variants: RawVariant[] = [];

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        if (!inList) {
          if (name === "ul" && attribs.id === "lstTalles") {
            inList = true;
            found = true;
            depth = 1;
          }
          return;
        }
        depth++;
        if (inPrice > 0) inPrice++;
        if (name === "li") item = { li: attribs, input: null, label: [], price: [] };
        else if (name === "input" && attribs.name === "sku" && item) item.input = attribs;
        else if (name === "b" && item) inLabel = true;
        else if (name === "span" && inLabel && /\bprecio\b/.test(attribs.class ?? "")) {
          inPrice = 1;
        }
      },
      ontext(text) {
        if (!inLabel || !item) return;
        if (inPrice > 0) item.price.push(text);
        else item.label.push(text);
      },
      onclosetag(name) {
        if (!inList) return;
        depth--;
        if (inPrice > 0) inPrice--;
        if (name === "b") inLabel = false;
        if (name === "li" && item) {
          const { li, input, label, price } = item;
          item = null;
          if (!input) return;
          const sku = input.value?.trim() || null;
          // Sin etiqueta visible, `data-cpre` solo si parece un talle (en Indian es un código).
          const code = input["data-cpre"]?.trim() ?? "";
          const size =
            label.join("").trim() || (code && sizeSystem(code) !== "OTHER" ? code : null);
          const quantity = Number(input["data-stock"]);
          const state = li["data-stock"]?.toLowerCase();
          const availability =
            state === "disponible"
              ? IN_STOCK
              : state === "agotado" || "disabled" in input
                ? OUT_OF_STOCK
                : Number.isFinite(quantity) && input["data-stock"] !== undefined
                  ? quantity > 0
                    ? IN_STOCK
                    : OUT_OF_STOCK
                  : null;
          variants.push({
            id: sku,
            sku,
            size,
            color: null,
            availability,
            price: price.join("").trim() || null,
            currency: null,
          });
        }
        if (depth === 0) inList = false;
      },
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true },
  );
  parser.write(html);
  parser.end();
  return found ? variants : null;
}

// --- VTEX: API de catálogo por SKU ----------------------------------------------------

const VtexOfferSchema = z.object({
  Price: z.number().nullish(),
  AvailableQuantity: z.number().nullish(),
  IsAvailable: z.boolean().nullish(),
});

const VtexItemSchema = z
  .object({
    itemId: z.string().min(1).max(60),
    variations: z.array(z.string().max(60)).nullish(),
    sellers: z.array(z.object({ commertialOffer: VtexOfferSchema })).max(20),
  })
  .catchall(z.unknown());

const VtexCatalogSchema = z.array(
  z.object({
    productId: z.string().min(1).max(60),
    link: z.url({ protocol: /^https?$/ }),
    items: z.array(VtexItemSchema).max(200),
  }),
);

const firstOf = (value: unknown): string | null => {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

/**
 * Variantes del producto de la página en la respuesta de la API de catálogo de VTEX. La
 * clave del talle varía (`Talla`, `Talla Hombre`, `TALLE`); `AvailableQuantity` viene
 * topeado, así que solo dice si hay o no. La API no trae moneda: se usa la de la página.
 */
export function parseVtexCatalog(data: unknown, pageUrl: string): RawVariant[] {
  const products = parseExternal(VtexCatalogSchema, data, "VTEX catálogo");
  const product = products.find((p) => samePath(p.link, pageUrl));
  if (!product) throw new MismatchError("VTEX");
  return product.items.map((item) => {
    const keys = item.variations ?? [];
    const sizeKey = keys.find((k) => SIZE_KEY.test(k));
    const colorKey = keys.find((k) => COLOR_KEY.test(k));
    const offer = item.sellers[0]?.commertialOffer;
    const available =
      offer?.IsAvailable ?? (offer?.AvailableQuantity == null ? null : offer.AvailableQuantity > 0);
    return {
      id: item.itemId,
      sku: item.itemId,
      size: sizeKey ? firstOf(item[sizeKey]) : null,
      color: colorKey ? firstOf(item[colorKey]) : null,
      availability: available === null ? null : available ? IN_STOCK : OUT_OF_STOCK,
      price: offer?.Price && offer.Price > 0 ? offer.Price : null,
      currency: null,
    };
  });
}

/** SKU numérico de la página (JSON-LD `sku` o el de una oferta): `"00029253"` → `29253`. */
function vtexSkuId(raw: RawProduct): string | null {
  const candidates = [raw.sku, ...raw.variants.map((v) => v.sku)];
  const sku = candidates.find((s): s is string => Boolean(s && /^\d{1,12}$/.test(s)));
  return sku ? String(Number(sku)) : null;
}

// --- Shopify: `/products/<handle>.js` --------------------------------------------------

const ShopifyProductSchema = z.object({
  handle: z.string().min(1).max(300),
  options: z.array(z.union([z.string(), z.object({ name: z.string() })])).max(3),
  variants: z
    .array(
      z.object({
        id: z.number(),
        sku: z.string().nullish(),
        option1: z.string().nullish(),
        option2: z.string().nullish(),
        option3: z.string().nullish(),
        available: z.boolean().nullish(),
        /** Centésimos en `.js` (149900 = 1499). */
        price: z.number().nullish(),
      }),
    )
    .max(250),
});

/** Handle de la URL de un producto Shopify (`/products/<handle>` o `/collections/x/products/<handle>`). */
export function shopifyHandle(url: string): string | null {
  try {
    return /\/products\/([^/?#]+)/.exec(new URL(url).pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function parseShopifyProduct(data: unknown, handle: string): RawVariant[] {
  const product = parseExternal(ShopifyProductSchema, data, "Shopify producto");
  if (product.handle !== decodeURIComponent(handle)) throw new MismatchError("Shopify");
  const names = product.options.map((o) => (typeof o === "string" ? o : o.name));
  const sizeIndex = names.findIndex((n) => SIZE_KEY.test(n));
  const colorIndex = names.findIndex((n) => COLOR_KEY.test(n));
  return product.variants.map((v) => {
    const option = (i: number) => (i < 0 ? null : ([v.option1, v.option2, v.option3][i] ?? null));
    return {
      id: String(v.id),
      sku: v.sku || null,
      size: option(sizeIndex),
      color: option(colorIndex),
      availability: v.available == null ? null : v.available ? IN_STOCK : OUT_OF_STOCK,
      price: v.price && v.price > 0 ? v.price / 100 : null,
      currency: null,
    };
  });
}

// --- WooCommerce: Store API -------------------------------------------------------------

const WooPricesSchema = z.object({
  price: z.string().max(20),
  currency_code: z.string().max(10),
  currency_minor_unit: z.number().int().min(0).max(4),
});

const WooProductSchema = z.object({
  id: z.number(),
  permalink: z.url({ protocol: /^https?$/ }),
  is_in_stock: z.boolean().nullish(),
  attributes: z
    .array(
      z.object({
        name: z.string().max(80),
        taxonomy: z.string().max(80).nullish(),
        terms: z.array(z.object({ name: z.string().max(80), slug: z.string().max(120) })).max(100),
      }),
    )
    .max(20),
  variations: z
    .array(
      z.object({
        id: z.number(),
        attributes: z.array(z.object({ name: z.string().max(80), value: z.string().max(120) })),
      }),
    )
    .max(200),
  prices: WooPricesSchema.nullish(),
});

const WooVariationSchema = z.object({
  id: z.number(),
  is_in_stock: z.boolean().nullish(),
  prices: WooPricesSchema.nullish(),
});

/** Precio de la Store API en unidades menores: `"31900"` con 2 decimales → 319. */
export function wooPrice(prices: z.infer<typeof WooPricesSchema> | null | undefined) {
  if (!prices) return { price: null, currency: null };
  const amount = Number(prices.price) / 10 ** prices.currency_minor_unit;
  return {
    price: Number.isFinite(amount) && amount > 0 ? amount : null,
    currency: prices.currency_code,
  };
}

/** Slug de la URL de un producto WooCommerce (`/product/<slug>/`). */
export function wooSlug(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return parts.at(-1) ?? null;
  } catch {
    return null;
  }
}

// --- Enriquecedor ----------------------------------------------------------------------

class MismatchError extends Error {
  constructor(platform: string) {
    super(`${platform} devolvió otro producto que el de la página`);
    this.name = "MismatchError";
  }
}

function classify(error: unknown): VariantFailure {
  if (error instanceof RobotsDisallowedError) return "blocked";
  if (error instanceof HttpStatusError && [401, 403, 429].includes(error.status)) return "blocked";
  if (error instanceof MismatchError) return "mismatch";
  if (error instanceof MalformedResponseError || error instanceof SyntaxError) return "malformed";
  return "unavailable";
}

function parseJson(body: string, source: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch (error) {
    throw new MalformedResponseError(source, error);
  }
}

export interface PlatformVariantOptions {
  /** WooCommerce: variaciones que se consultan una por una (las demás quedan UNKNOWN). */
  maxWooVariations?: number;
}

/** Variantes por plataforma con el cliente respetuoso (robots, ritmo por dominio, SSRF). */
export class PlatformVariantEnricher implements VariantEnricher {
  constructor(
    private readonly http: PoliteHttpClient,
    private readonly options: PlatformVariantOptions = {},
  ) {}

  /** Plataforma de la página: la que traía el candidato, la del registro o su huella. */
  static platformOf(input: Pick<VariantInput, "page" | "platform">): StorePlatform | null {
    const known = input.platform ?? findRegisteredStore(new URL(input.page.url).hostname)?.platform;
    if (known) return known as StorePlatform;
    return detectPlatform(new Headers(), input.page.body);
  }

  async enrich(input: VariantInput): Promise<VariantResult> {
    const platform = PlatformVariantEnricher.platformOf(input);
    switch (platform) {
      case "FENICIO":
        return this.fenicio(input);
      case "VTEX":
        return this.attempt("vtex:catalog", () => this.vtex(input));
      case "SHOPIFY":
        return this.attempt("shopify:product-js", () => this.shopify(input));
      case "WOOCOMMERCE":
        return this.attempt("woo:store-api", () => this.woo(input));
      default:
        return { status: "unsupported" };
    }
  }

  private async attempt(
    source: VariantSource,
    run: () => Promise<RawVariant[] | VariantResult>,
  ): Promise<VariantResult> {
    try {
      const result = await run();
      if (!Array.isArray(result)) return result;
      return {
        status: "verified",
        source,
        variants: result,
        availability: availabilityOfVariants(result),
      };
    } catch (error) {
      return { status: "failed", source, reason: classify(error) };
    }
  }

  private fenicio({ page }: VariantInput): VariantResult {
    const variants = parseFenicioSizes(page.body);
    if (!variants || variants.length === 0) return { status: "unsupported" };
    return {
      status: "verified",
      source: "fenicio:html",
      variants,
      availability: availabilityOfVariants(variants),
    };
  }

  private async vtex({ page, raw, signal }: VariantInput) {
    const skuId = vtexSkuId(raw);
    if (!skuId) return { status: "failed", source: "vtex:catalog", reason: "no_id" } as const;
    const host = new URL(page.url).host;
    const res = await this.http.get(
      `https://${host}/api/catalog_system/pub/products/search?fq=skuId:${skuId}`,
      { accept: "application/json", signal },
    );
    return parseVtexCatalog(parseJson(res.body, `VTEX ${host}`), page.url);
  }

  private async shopify({ page, signal }: VariantInput) {
    const handle = shopifyHandle(page.url);
    if (!handle)
      return { status: "failed", source: "shopify:product-js", reason: "no_id" } as const;
    const host = new URL(page.url).host;
    const res = await this.http.get(`https://${host}/products/${handle}.js`, {
      accept: "application/json, text/javascript",
      signal,
    });
    return parseShopifyProduct(parseJson(res.body, `Shopify ${host}`), handle);
  }

  private async woo({ page, signal }: VariantInput): Promise<RawVariant[] | VariantResult> {
    const slug = wooSlug(page.url);
    if (!slug) return { status: "failed", source: "woo:store-api", reason: "no_id" };
    const host = new URL(page.url).host;
    const api = `https://${host}/wp-json/wc/store/v1/products`;
    const res = await this.http.get(`${api}?slug=${encodeURIComponent(slug)}`, {
      accept: "application/json",
      signal,
    });
    const found = parseExternal(
      z.array(WooProductSchema),
      parseJson(res.body, `WooCommerce ${host}`),
      `WooCommerce ${host}`,
    ).find((p) => samePath(p.permalink, page.url));
    if (!found) throw new MismatchError("WooCommerce");

    const labelOf = (attribute: string, value: string) => {
      const attr = found.attributes.find((a) => a.name === attribute);
      return attr?.terms.find((t) => t.slug === value)?.name ?? value;
    };
    const keyOf = (pattern: RegExp) =>
      found.attributes.find((a) => pattern.test(a.name) || pattern.test(a.taxonomy ?? ""))?.name;
    const sizeKey = keyOf(SIZE_KEY);
    const colorKey = keyOf(COLOR_KEY);

    // Producto simple: sin variaciones, solo la disponibilidad del producto.
    if (found.variations.length === 0) {
      return {
        status: "verified",
        source: "woo:store-api",
        variants: [],
        availability:
          found.is_in_stock == null ? null : found.is_in_stock ? IN_STOCK : OUT_OF_STOCK,
      };
    }

    const limit = this.options.maxWooVariations ?? 12;
    const variants: RawVariant[] = [];
    for (const [i, variation] of found.variations.entries()) {
      const value = (key: string | undefined) => {
        const attr = key ? variation.attributes.find((a) => a.name === key) : undefined;
        return attr && key ? labelOf(key, attr.value) : null;
      };
      let availability: string | null = null;
      let price: number | null = null;
      let currency: string | null = null;
      if (i < limit) {
        // Una variación que no responde queda UNKNOWN; las demás siguen.
        try {
          const detail = await this.http.get(`${api}/${variation.id}`, {
            accept: "application/json",
            signal,
          });
          const parsed = parseExternal(
            WooVariationSchema,
            parseJson(detail.body, `WooCommerce ${host}`),
            `WooCommerce ${host}`,
          );
          if (parsed.is_in_stock != null)
            availability = parsed.is_in_stock ? IN_STOCK : OUT_OF_STOCK;
          ({ price, currency } = wooPrice(parsed.prices));
        } catch (error) {
          if (error instanceof RobotsDisallowedError) throw error;
        }
      }
      variants.push({
        id: String(variation.id),
        sku: null,
        size: value(sizeKey),
        color: value(colorKey),
        availability,
        price,
        currency,
      });
    }
    return variants;
  }
}

/** Incorpora al producto crudo las variantes verificadas por la plataforma. */
export function applyVariants(raw: RawProduct, result: VariantResult): RawProduct {
  if (result.status !== "verified") return raw;
  return {
    ...raw,
    variants: result.variants,
    // La plataforma es más precisa que la página; si no dice nada, queda lo de la página.
    availability: result.availability ?? raw.availability,
    sources: {
      ...raw.sources,
      variants: "platform",
      ...(result.availability ? { availability: "platform" as const } : {}),
    },
  };
}
