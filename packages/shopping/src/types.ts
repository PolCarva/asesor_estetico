import type {
  Product,
  ShoppingAudience,
  ShoppingQuery,
  ShoppingStats,
  Store,
} from "@asesor/shared";

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

/**
 * De dónde salió un dato: la cascada prueba JSON-LD → microdata → OpenGraph, y los talles y
 * el stock pueden venir de la plataforma de la tienda (`platform`, paso 04b).
 */
export type ExtractSource = "jsonld" | "microdata" | "opengraph" | "platform";

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

/** Lugar físico que declara la página (`availableAtOrFrom`, `LocalBusiness`, `Store`). */
export interface RawPlace {
  name: string | null;
  address: string | null;
  locality: string | null;
  /** País de la dirección, como venga (`UY`, `Uruguay`). */
  country: string | null;
  phone: string | null;
  url: string | null;
}

/** Datos crudos extraídos de una página, antes de normalizar. */
export interface RawProduct {
  url: string;
  /** `<link rel="canonical">` absoluto, si la página lo declara. */
  canonicalUrl: string | null;
  /** Id del producto en la plataforma (`productID`, `productGroupID`), si lo declara. */
  externalId: string | null;
  /** SKU del producto (JSON-LD `sku`): la API de VTEX lo busca por ahí. */
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
  /**
   * Regiones donde la página dice que vende (`eligibleRegion`, `areaServed`, país de la
   * dirección del local, `og:locale`): evidencia para Validate de que vende en Uruguay.
   */
  regions: string[];
  /** Local físico declarado (para `IN_STORE_ONLY`). */
  inStore: RawPlace | null;
  /** Fuente de cada dato que se encontró. */
  sources: Partial<Record<RawField, ExtractSource>>;
}

export type RawField =
  | Exclude<
      keyof RawProduct,
      "url" | "canonicalUrl" | "variants" | "regions" | "inStore" | "sources"
    >
  | "variants";

/**
 * Lo que identifica un pool de búsqueda: la prenda y dónde se busca. Sin talle, precio
 * máximo, límite ni nada del usuario: el mismo pool sirve para cualquier pedido.
 */
export interface PoolQuery {
  /** Versión del pipeline: subirla invalida los pools viejos (`POOL_VERSION`). */
  v: number;
  country_code: string;
  audience: ShoppingAudience | null;
  search_terms: string[];
  garment: {
    category: string;
    description: string;
    color: { name: string; hex: string };
    fit: string | null;
    material: string | null;
    pattern: string | null;
  };
}

/** Pool cacheado: todos los productos validados de una búsqueda, sin ranking. */
export interface CachedPool {
  products: Product[];
  stats: ShoppingStats;
  /** Cuándo se hizo la búsqueda en vivo. */
  cachedAt: string;
}

/** Producto revalidado por frescura: solo `verified` cuenta como verificación nueva. */
export interface RefreshedProduct {
  product: Product;
  verified: boolean;
}

/**
 * Cache de búsquedas por pool (24 h). En el worker es Postgres (`@asesor/db`,
 * `createPostgresSearchCache`); en tests y desarrollo, memoria (`createMemorySearchCache`).
 */
export interface SearchCache {
  /** El pool vigente para la clave, o null si no hay o venció. */
  getPool(key: string): Promise<CachedPool | null>;
  savePool(
    key: string,
    entry: { query: PoolQuery; products: Product[]; stats: ShoppingStats },
    ttlMs: number,
  ): Promise<void>;
  /** Guarda productos revalidados porque estaban viejos (más de 8 h). */
  updateProducts?(products: RefreshedProduct[]): Promise<void>;
}

export type { Product };
