import type { Product, Store } from "@asesor/shared";

import {
  bareHost,
  findRegisteredStore,
  isBlockedHost,
  type RegisteredStore,
  STORE_REGISTRY,
} from "./providers/registry";
import type { FetchedPage, RawProduct } from "./types";

/**
 * Etapa Validate del pipeline (SPEC: "producto real, de una tienda que vende en Uruguay,
 * con datos coherentes"). Corre después de normalizar y antes de rankear.
 */

/** Parámetros que no identifican al producto: tracking, búsqueda interna y variante elegida. */
const NOISE_PARAM =
  /^(utm_[a-z_]+|fbclid|gclid|gbraid|wbraid|dclid|msclkid|mc_cid|mc_eid|_ga|_gl|_pos|_psq|_psid|_sid|_ss|_v|srsltid|ref|ref_src|variant|skuid|idsku)$/i;

const isHttp = (url: URL) => url.protocol === "https:" || url.protocol === "http:";

/**
 * URL canónica del producto: la `<link rel="canonical">` de la página si es de la misma
 * tienda, sin fragmento, sin parámetros de tracking ni de variante, con el host en
 * minúsculas y sin `/` final.
 */
export function canonicalProductUrl(pageUrl: string, canonical: string | null = null): string {
  let url = new URL(pageUrl);
  if (canonical) {
    try {
      const declared = new URL(canonical, pageUrl);
      const sameStore = bareHost(declared.hostname) === bareHost(url.hostname);
      // Algunas tiendas VTEX apuntan a rutas internas (`/_v/segment/...`): no sirven.
      if (
        isHttp(declared) &&
        sameStore &&
        declared.pathname !== "/" &&
        !declared.pathname.startsWith("/_v/")
      ) {
        url = declared;
      }
    } catch {
      // Canonical roto: queda la URL descargada.
    }
  }
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  for (const key of [...url.searchParams.keys()]) {
    if (NOISE_PARAM.test(key)) url.searchParams.delete(key);
  }
  const out = url.toString();
  return out.endsWith("/") && url.pathname !== "/" ? out.slice(0, -1) : out;
}

const URUGUAY = /^(uy|ury|uruguay)$/i;

/**
 * ¿La tienda vende en Uruguay? Alcanza con una evidencia: está en el registro, su dominio
 * es `.uy`, cobra en pesos uruguayos o la página lo declara (`eligibleRegion`, `areaServed`,
 * país del local, `og:locale` `es_UY`).
 */
export function sellsInUruguay(
  host: string,
  product: Pick<Product, "price">,
  raw: Pick<RawProduct, "regions">,
  registry: RegisteredStore[] = STORE_REGISTRY,
): boolean {
  return (
    Boolean(findRegisteredStore(host, registry)) ||
    /\.uy$/i.test(host) ||
    product.price?.currency === "UYU" ||
    raw.regions.some((r) => URUGUAY.test(r.trim()))
  );
}

export type ValidationFailure =
  /** El título o el precio no salen de la página descargada (nunca de un snippet de búsqueda). */
  | "not_extracted"
  /** La página (después de redirects) es de otro dominio que la tienda. */
  | "host_mismatch"
  /** Tienda que bloquea requests automáticos o prohíbe el scraping (D7). */
  | "blocked_store"
  /** Tienda de otro país (`zara.com/es`, `.com.ar` sin evidencia de vender en Uruguay). */
  | "foreign_store"
  /** Precio ≤ 0, o sin precio fuera de un local físico. */
  | "invalid_price";

export interface ValidationContext {
  store: Store;
  page: FetchedPage;
  raw: RawProduct;
  registry?: RegisteredStore[];
}

export type ValidationResult = { ok: true } | { ok: false; reason: ValidationFailure };

export function validateProduct(product: Product, ctx: ValidationContext): ValidationResult {
  const inStoreOnly = product.availability === "IN_STORE_ONLY";
  if (!ctx.raw.sources.title || (!ctx.raw.sources.price && !inStoreOnly)) {
    return { ok: false, reason: "not_extracted" };
  }

  const store = bareHost(ctx.store.domain);
  const hosts = [ctx.page.url, product.url].map((u) => bareHost(new URL(u).hostname));
  if (hosts.some((h) => h !== store)) return { ok: false, reason: "host_mismatch" };
  if (isBlockedHost(store)) return { ok: false, reason: "blocked_store" };

  if (product.price === null ? !inStoreOnly : product.price.amount <= 0) {
    return { ok: false, reason: "invalid_price" };
  }
  if (!sellsInUruguay(store, product, ctx.raw, ctx.registry)) {
    return { ok: false, reason: "foreign_store" };
  }
  return { ok: true };
}
