import type { Product, ShoppingQuery, Store } from "@asesor/shared";

/** URL candidata devuelta por un buscador (antes de visitar la página). */
export interface CandidateUrl {
  url: string;
  store: Store;
  /** Título que mostró la tienda o el buscador (solo para depurar y filtrar). */
  title?: string | null;
  /** De dónde salió: `platform:fenicio`, `sitemap`, `discovery`, `mock`… */
  source?: string;
  platform?: string | null;
}

/** Busca URLs de producto en tiendas para una prenda. */
export interface SearchProvider {
  readonly name: string;
  search(query: ShoppingQuery): Promise<CandidateUrl[]>;
}

export interface FetchedPage {
  url: string;
  status: number;
  contentType: string;
  body: string;
  fetchedAt: string;
}

export interface FetchOptions {
  signal?: AbortSignal;
}

/** Descarga la página de un producto. */
export interface ProductFetcher {
  readonly name: string;
  fetch(url: string, options?: FetchOptions): Promise<FetchedPage>;
}

/** De dónde salió un dato: la cascada prueba JSON-LD → microdata → OpenGraph. */
export type ExtractSource = "jsonld" | "microdata" | "opengraph";

export interface RawVariant {
  /** Id de la plataforma (p. ej. `?variant=` de Shopify) o SKU. Nunca un índice. */
  id: string | null;
  sku: string | null;
  size: string | null;
  color: string | null;
  availability: string | null;
  /** Tal como vino (número o texto con formato local); `normalizeProduct` lo interpreta. */
  price: number | string | null;
  currency: string | null;
}

/** Datos crudos extraídos de una página, antes de normalizar. */
export interface RawProduct {
  url: string;
  /** Id del producto en la plataforma (`productID`, `productGroupID`), si lo declara. */
  externalId: string | null;
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
  /** Fuente de cada dato que se encontró. */
  sources: Partial<Record<RawField, ExtractSource>>;
}

export type RawField = Exclude<keyof RawProduct, "url" | "variants" | "sources"> | "variants";

export interface ShoppingCache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
}

export type { Product };
