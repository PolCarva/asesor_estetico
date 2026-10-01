import type { FetchedPage, ProductFetcher, SearchProvider } from "../types";
import { buildUserAgent, PoliteHttpClient } from "./http";
import {
  CompositeSearchProvider,
  DiscoverySearchProvider,
  RegistrySearchProvider,
  type SourceErrorHandler,
} from "./search-providers";
import { SitemapIndex } from "./sitemap";
import type { WebSearchClient } from "./web-search";

/**
 * Descarga de páginas de producto con el mismo cliente respetuoso (robots, user agent,
 * timeout, tope de tamaño). La extracción y validación completas son del paso 04a.
 */
export class HttpProductFetcher implements ProductFetcher {
  readonly name = "http";

  constructor(private readonly http: PoliteHttpClient) {}

  async fetch(url: string): Promise<FetchedPage> {
    const res = await this.http.get(url, { accept: "text/html" });
    return {
      url: res.url,
      status: res.status,
      contentType: res.contentType,
      body: res.body,
      fetchedAt: new Date().toISOString(),
    };
  }
}

export interface LiveShoppingOptions {
  /** Contacto para el user agent (URL o email). */
  botContact?: string;
  /** Sin buscador web no hay descubrimiento fuera del registro. */
  webSearch?: WebSearchClient;
  onError?: SourceErrorHandler;
  onCost?: (usd: number) => void;
  fetch?: typeof fetch;
}

/** Proveedores reales: registro de tiendas + sitemaps + descubrimiento web. */
export function createLiveShopping(options: LiveShoppingOptions = {}): {
  http: PoliteHttpClient;
  searchProvider: SearchProvider;
  fetcher: ProductFetcher;
} {
  const http = new PoliteHttpClient({
    userAgent: buildUserAgent(options.botContact),
    fetch: options.fetch,
  });
  const sources: SearchProvider[] = [
    new RegistrySearchProvider({
      http,
      sitemaps: new SitemapIndex(http),
      onError: options.onError,
    }),
  ];
  if (options.webSearch) {
    sources.push(
      new DiscoverySearchProvider({
        http,
        webSearch: options.webSearch,
        onError: options.onError,
        onCost: options.onCost,
      }),
    );
  }
  return {
    http,
    searchProvider: new CompositeSearchProvider(sources, { onError: options.onError }),
    fetcher: new HttpProductFetcher(http),
  };
}
