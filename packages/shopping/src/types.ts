import type { Product, ShoppingQuery, Store } from "@asesor/shared";

/** URL candidata devuelta por un buscador (antes de visitar la página). */
export interface CandidateUrl {
  url: string;
  store: Store;
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

/** Descarga la página de un producto. */
export interface ProductFetcher {
  readonly name: string;
  fetch(url: string): Promise<FetchedPage>;
}

/** Datos crudos extraídos de una página, antes de normalizar. */
export interface RawProduct {
  url: string;
  externalId: string | null;
  title: string | null;
  brand: string | null;
  description: string | null;
  imageUrl: string | null;
  price: number | null;
  currency: string | null;
  availability: string | null;
  color: string | null;
  material: string | null;
  category: string | null;
  variants: Array<{
    id: string | null;
    sku: string | null;
    size: string | null;
    color: string | null;
    availability: string | null;
    price: number | null;
  }>;
}

export interface ShoppingCache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
}

export type { Product };
