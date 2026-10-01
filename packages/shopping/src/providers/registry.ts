import type { ShoppingAudience, Store } from "@asesor/shared";

export const STORE_PLATFORMS = ["FENICIO", "VTEX", "SHOPIFY", "WOOCOMMERCE", "MAGENTO"] as const;
export type StorePlatform = (typeof STORE_PLATFORMS)[number];

/**
 * Cómo se buscan productos en la tienda:
 * - PLATFORM: el endpoint de búsqueda de su plataforma (robots.txt lo permite);
 * - SITEMAP: índice de URLs del sitemap filtrado por términos (la búsqueda está prohibida);
 * - DISCOVERY: solo por descubrimiento web (ni búsqueda ni sitemap útiles).
 */
export type StoreSearchMode = "PLATFORM" | "SITEMAP" | "DISCOVERY";

export interface RegisteredStore extends Store {
  platform: StorePlatform;
  /** Público principal. `ALL`: se busca para cualquier query. */
  audience: ShoppingAudience | "ALL";
  search: StoreSearchMode;
  /** Fenicio: ruta del listado (`/catalogo` o `/productos`). */
  searchPath?: string;
  /** SITEMAP: índice o sitemap de productos. */
  sitemapUrl?: string;
  /** SITEMAP: filtro de los sitemaps hijos que listan productos. */
  sitemapMatch?: RegExp;
  notes?: string;
}

/**
 * Registro de tiendas uruguayas (datos, no código por tienda). Sale del relevamiento de
 * `docs/goals/asesoria-shopping/TIENDAS_UY.md`, verificado el 2026-09-30. Sumar una tienda
 * de una plataforma conocida es agregar una fila.
 */
export const STORE_REGISTRY: RegisteredStore[] = [
  {
    name: "Legacy",
    domain: "legacy.com.uy",
    platform: "FENICIO",
    audience: "MEN",
    search: "PLATFORM",
  },
  {
    name: "Hering",
    domain: "www.hering.com.uy",
    platform: "FENICIO",
    audience: "ALL",
    search: "PLATFORM",
  },
  {
    name: "Indian",
    domain: "www.indian.com.uy",
    platform: "FENICIO",
    audience: "ALL",
    search: "PLATFORM",
  },
  {
    name: "Lolita",
    domain: "lolita.com.uy",
    platform: "FENICIO",
    audience: "WOMEN",
    search: "PLATFORM",
    searchPath: "/productos",
  },
  {
    name: "La Isla",
    domain: "laisla.com.uy",
    platform: "FENICIO",
    audience: "ALL",
    search: "PLATFORM",
  },
  {
    name: "Zooko",
    domain: "www.zooko.com.uy",
    platform: "FENICIO",
    audience: "ALL",
    search: "PLATFORM",
  },
  {
    name: "Stadium",
    domain: "www.stadium.com.uy",
    platform: "FENICIO",
    audience: "ALL",
    search: "SITEMAP",
    sitemapUrl: "https://www.stadium.com.uy/sitemap/catalogo-articulos.xml",
    notes: "robots.txt prohíbe la búsqueda (/*?*q=, /buscar, /api)",
  },
  {
    name: "Adidas",
    domain: "www.adidas.com.uy",
    platform: "VTEX",
    audience: "ALL",
    search: "PLATFORM",
  },
  {
    name: "BAS",
    domain: "www.bas.com.uy",
    platform: "VTEX",
    audience: "ALL",
    search: "SITEMAP",
    sitemapUrl: "https://www.bas.com.uy/sitemap.xml",
    sitemapMatch: /\/sitemap\/product-\d+\.xml$/,
    notes: "robots.txt prohíbe /api/",
  },
  {
    name: "H&M",
    domain: "uy.hm.com",
    platform: "VTEX",
    audience: "ALL",
    search: "DISCOVERY",
    notes:
      "robots.txt prohíbe /busca/ y /*_* (la API de búsqueda por texto); el sitemap de productos solo tiene ids numéricos y las categorías se renderizan en el cliente",
  },
  {
    name: "Jack & Jones",
    domain: "jackjones.com.uy",
    platform: "SHOPIFY",
    audience: "MEN",
    search: "PLATFORM",
  },
  {
    name: "Decathlon",
    domain: "decathlon.com.uy",
    platform: "SHOPIFY",
    audience: "ALL",
    search: "PLATFORM",
  },
  {
    name: "Tiendas Montevideo",
    domain: "www.tiendasmontevideo.com.uy",
    platform: "WOOCOMMERCE",
    audience: "ALL",
    search: "PLATFORM",
  },
];

/**
 * Dominios que no se muestran como producto: bloquean requests automáticos o su
 * robots.txt lo prohíbe (ver TIENDAS_UY.md). No se intenta evadirlos.
 */
export const BLOCKED_DOMAINS = [
  "mercadolibre.com.uy",
  "zara.com",
  "nike.com.uy",
  "tiendainglesa.com.uy",
];

export function bareHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

export function isBlockedHost(host: string): boolean {
  const h = bareHost(host);
  return BLOCKED_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
}

export function findRegisteredStore(
  host: string,
  registry: RegisteredStore[] = STORE_REGISTRY,
): RegisteredStore | undefined {
  const h = bareHost(host);
  return registry.find((s) => bareHost(s.domain) === h);
}

/** ¿La tienda vende para este público? */
export function storeServesAudience(
  store: RegisteredStore,
  audience: ShoppingAudience | null,
): boolean {
  return store.audience === "ALL" || audience === null || store.audience === audience;
}
