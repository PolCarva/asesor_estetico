import { isHtmlContentType } from "../extract";
import { NotHtmlError } from "../fetch";
import type { FetchLike } from "../net";
import type { FetchedPage, FetchOptions, ProductFetcher, SearchProvider } from "../types";
import { PlatformVariantEnricher, type VariantEnricher } from "../variants";
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
 * Descarga de páginas de producto con el mismo cliente respetuoso: robots.txt, user agent
 * identificable, timeout y `AbortSignal`, tope de tamaño, ritmo por dominio y anti-SSRF en
 * cada redirect. Solo acepta HTML.
 */
export class HttpProductFetcher implements ProductFetcher {
  readonly name = "http";

  constructor(
    private readonly http: PoliteHttpClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async fetch(url: string, options: FetchOptions = {}): Promise<FetchedPage> {
    const res = await this.http.get(url, {
      accept: "text/html,application/xhtml+xml",
      signal: options.signal,
    });
    if (!isHtmlContentType(res.contentType)) throw new NotHtmlError(res.url, res.contentType);
    return {
      url: res.url,
      status: res.status,
      contentType: res.contentType,
      body: res.body,
      fetchedAt: this.now().toISOString(),
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
  /** Transporte HTTP (tests); por defecto, el seguro con IP validada al conectar. */
  fetch?: FetchLike;
}

/**
 * Proveedores reales: registro de tiendas + sitemaps + descubrimiento web, descarga de
 * páginas y talles y stock por plataforma.
 */
export function createLiveShopping(options: LiveShoppingOptions = {}): {
  http: PoliteHttpClient;
  searchProvider: SearchProvider;
  fetcher: ProductFetcher;
  variants: VariantEnricher;
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
    variants: new PlatformVariantEnricher(http),
  };
}
