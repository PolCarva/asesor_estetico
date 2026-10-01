import { type Product, type ShoppingQuery } from "@asesor/shared";
import { FIXTURE_PRODUCTS } from "@asesor/shared/fixtures";

import type {
  CandidateUrl,
  FetchedPage,
  FetchOptions,
  ProductFetcher,
  SearchProvider,
} from "./types";

const AVAILABILITY_URL = {
  IN_STOCK: "https://schema.org/InStock",
  OUT_OF_STOCK: "https://schema.org/OutOfStock",
  IN_STORE_ONLY: "https://schema.org/InStoreOnly",
  UNKNOWN: null,
} as const;

/** Renderiza un producto como una página HTML con JSON-LD, como lo haría una tienda. */
export function renderProductPage(product: Product): string {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    productID: product.id,
    sku: product.id,
    name: product.title,
    brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
    description: product.description ?? undefined,
    image: product.image_url ?? undefined,
    category: product.category,
    color: product.colors.join(", "),
    material: product.materials.join(", "),
    offers: {
      "@type": "Offer",
      price: product.price.amount,
      priceCurrency: product.price.currency,
      availability: AVAILABILITY_URL[product.availability] ?? undefined,
    },
    hasVariant: product.variants.map((v) => ({
      "@type": "Product",
      sku: v.sku ?? v.id,
      size: v.size ?? undefined,
      color: v.color ?? undefined,
      offers: { "@type": "Offer", availability: AVAILABILITY_URL[v.availability] ?? undefined },
    })),
  };
  return `<!doctype html><html><head><title>${product.title}</title><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body></body></html>`;
}

/** Buscador falso: devuelve URLs del catálogo ficticio. No sale a internet. */
export class MockSearchProvider implements SearchProvider {
  readonly name = "mock";

  constructor(private readonly catalog: Product[] = FIXTURE_PRODUCTS) {}

  async search(_query?: ShoppingQuery): Promise<CandidateUrl[]> {
    // Devuelve todo el catálogo: filtrar y ordenar es trabajo del ranker.
    return this.catalog.map((p) => ({ url: p.url, store: p.store, source: "mock" }));
  }
}

/** Fetcher falso: sirve páginas generadas desde el catálogo ficticio. */
export class MockProductFetcher implements ProductFetcher {
  readonly name = "mock";
  private readonly pages: Map<string, Product>;

  constructor(
    catalog: Product[] = FIXTURE_PRODUCTS,
    private readonly now: () => Date = () => new Date("2026-01-01T12:00:00.000Z"),
  ) {
    this.pages = new Map(catalog.map((p) => [p.url, p]));
  }

  async fetch(url: string, _options?: FetchOptions): Promise<FetchedPage> {
    const product = this.pages.get(url);
    return {
      url,
      status: product ? 200 : 404,
      contentType: "text/html; charset=utf-8",
      body: product ? renderProductPage(product) : "<html><body>Not found</body></html>",
      fetchedAt: this.now().toISOString(),
    };
  }
}
