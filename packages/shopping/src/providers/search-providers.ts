import { audienceWord, isRelevantCandidate, type ShoppingQuery, type Store } from "@asesor/shared";

import type { CandidateUrl, SearchOptions, SearchProvider } from "../types";
import type { PoliteHttpClient } from "./http";
import { detectPlatform, PLATFORM_ADAPTERS, type StoreHit } from "./platforms";
import {
  bareHost,
  findRegisteredStore,
  isBlockedHost,
  type RegisteredStore,
  STORE_REGISTRY,
  type StorePlatform,
  storeServesAudience,
} from "./registry";
import type { SitemapIndex } from "./sitemap";
import type { WebSearchClient } from "./web-search";

/** Falla parcial de una fuente o tienda: se reporta y la búsqueda sigue. */
export type SourceErrorHandler = (source: string, error: unknown) => void;

/** Términos de la query, o la descripción de la prenda si vino sin términos. */
function termsOf(query: ShoppingQuery): string[] {
  return query.search_terms.length ? query.search_terms : [query.garment.description];
}

/** Hits pertinentes: nombran la prenda y no son de otro público (null = sin palabras). */
function relevant(hits: StoreHit[], query: ShoppingQuery): StoreHit[] {
  return hits.filter((h) => isRelevantCandidate(`${h.title ?? ""} ${h.url}`, query) !== false);
}

function toStore(store: Pick<Store, "name" | "domain">): Store {
  return { name: store.name, domain: bareHost(store.domain) };
}

export interface RegistrySearchOptions {
  http: PoliteHttpClient;
  sitemaps: SitemapIndex;
  registry?: RegisteredStore[];
  /** Candidatas por tienda. */
  perStore?: number;
  /** Cuántos términos se prueban por tienda hasta juntar `perStore`. */
  maxTermsPerStore?: number;
  onError?: SourceErrorHandler;
}

/** Busca en las tiendas del registro: endpoint de su plataforma o su sitemap. */
export class RegistrySearchProvider implements SearchProvider {
  readonly name = "registry";

  constructor(private readonly options: RegistrySearchOptions) {}

  private async searchStore(
    store: RegisteredStore,
    query: ShoppingQuery,
    signal?: AbortSignal,
  ): Promise<StoreHit[]> {
    const perStore = this.options.perStore ?? 3;
    const terms = termsOf(query).slice(0, this.options.maxTermsPerStore ?? 3);

    if (store.search === "SITEMAP" && store.sitemapUrl) {
      // Sin `signal`: el sitemap se cachea y lo comparten todos los pedidos.
      const hits = await this.options.sitemaps.search(
        store.sitemapUrl,
        terms,
        perStore * 4,
        store.sitemapMatch,
      );
      return relevant(ofStore(hits, store.domain), query).slice(0, perStore);
    }

    const adapter = store.search === "PLATFORM" ? PLATFORM_ADAPTERS[store.platform] : undefined;
    if (!adapter) return [];
    const found = new Map<string, StoreHit>();
    // Del término más específico al más general, hasta juntar suficientes.
    for (const term of terms) {
      const hits = await adapter(this.options.http, {
        domain: store.domain,
        term,
        limit: perStore * 3,
        searchPath: store.searchPath,
        signal,
      });
      for (const hit of relevant(ofStore(hits, store.domain), query)) found.set(hit.url, hit);
      if (found.size >= perStore) break;
    }
    return [...found.values()].slice(0, perStore);
  }

  async search(query: ShoppingQuery, options: SearchOptions = {}): Promise<CandidateUrl[]> {
    const stores = (this.options.registry ?? STORE_REGISTRY).filter(
      (s) => s.search !== "DISCOVERY" && storeServesAudience(s, query.audience),
    );
    const results = await Promise.allSettled(
      stores.map((s) => this.searchStore(s, query, options.signal)),
    );
    return results.flatMap((result, i) => {
      const store = stores[i];
      if (!store) return [];
      if (result.status === "rejected") {
        this.options.onError?.(`${this.name}:${store.domain}`, result.reason);
        return [];
      }
      return result.value.map((hit) => ({
        url: hit.url,
        store: toStore(store),
        title: hit.title,
        source: store.search === "SITEMAP" ? "sitemap" : `platform:${store.platform.toLowerCase()}`,
        platform: store.platform,
      }));
    });
  }
}

export interface DiscoverySearchOptions {
  http: PoliteHttpClient;
  webSearch: WebSearchClient;
  registry?: RegisteredStore[];
  maxResults?: number;
  /** Tiendas nuevas cuya plataforma se detecta para buscar también con su adaptador. */
  maxExpansions?: number;
  perStore?: number;
  onError?: SourceErrorHandler;
  /** Se llama con el costo de cada búsqueda web (control de costos). */
  onCost?: (usd: number) => void;
}

/**
 * Solo URLs http(s) de la propia tienda (paso 11): un listado, una API o un sitemap que apunta
 * a otro host no se descarga (de todos modos Validate lo descartaría por `host_mismatch`).
 */
function ofStore(hits: StoreHit[], domain: string): StoreHit[] {
  const host = bareHost(domain);
  return hits.filter((hit) => {
    try {
      const url = new URL(hit.url);
      return /^https?:$/.test(url.protocol) && bareHost(url.hostname) === host;
    } catch {
      return false;
    }
  });
}

/** Hosts uruguayos: `.uy` o dominios del registro (p. ej. `uy.hm.com`). */
function isUruguayanHost(host: string, registry: RegisteredStore[]): boolean {
  return /\.uy$/i.test(host) || Boolean(findRegisteredStore(host, registry));
}

/**
 * Descubrimiento abierto: búsqueda web para llegar a tiendas fuera del registro. Las URLs
 * son solo candidatas; precio, stock y datos se leen después de la página (pasos 04a/b).
 */
export class DiscoverySearchProvider implements SearchProvider {
  readonly name = "discovery";

  constructor(private readonly options: DiscoverySearchOptions) {}

  /** Texto de la búsqueda: prenda + público + país. Sin datos personales. */
  static buildQueryText(query: ShoppingQuery): string {
    const [first] = termsOf(query);
    return [first, audienceWord(query.audience), "comprar online Uruguay"]
      .filter(Boolean)
      .join(" ");
  }

  async search(query: ShoppingQuery, options: SearchOptions = {}): Promise<CandidateUrl[]> {
    const registry = this.options.registry ?? STORE_REGISTRY;
    const { hits, costUsd } = await this.options.webSearch.search(
      DiscoverySearchProvider.buildQueryText(query),
      { maxResults: this.options.maxResults ?? 10, signal: options.signal },
    );
    if (costUsd !== null) {
      this.options.onCost?.(costUsd);
      options.onCost?.(costUsd);
    }

    const candidates: CandidateUrl[] = [];
    const newHosts = new Map<string, string>();
    for (const hit of hits) {
      let url: URL;
      try {
        url = new URL(hit.url);
      } catch {
        continue;
      }
      if (!isUruguayanHost(url.hostname, registry) || isBlockedHost(url.hostname)) continue;
      if (url.pathname === "/" || url.pathname === "") continue;
      if (isRelevantCandidate(`${hit.title ?? ""} ${url.pathname}`, query) === false) continue;
      const known = findRegisteredStore(url.hostname, registry);
      // Una tienda registrada de otro público (p. ej., una tienda de mujer en una búsqueda de
      // hombre) no entra tampoco por el buscador web.
      if (known && !storeServesAudience(known, query.audience)) continue;
      candidates.push({
        url: url.toString(),
        store: toStore(known ?? { name: bareHost(url.hostname), domain: url.hostname }),
        title: hit.title,
        source: "discovery",
        platform: known?.platform ?? null,
      });
      if (!known && !newHosts.has(url.hostname)) newHosts.set(url.hostname, url.toString());
    }

    const expansions = [...newHosts.entries()].slice(0, this.options.maxExpansions ?? 2);
    const extra = await Promise.allSettled(
      expansions.map(([host, pageUrl]) => this.expand(host, pageUrl, query, options.signal)),
    );
    extra.forEach((r, i) => {
      if (r.status === "fulfilled") candidates.push(...r.value);
      else this.options.onError?.(`${this.name}:${expansions[i]?.[0]}`, r.reason);
    });
    return candidates;
  }

  /** Detecta la plataforma de una tienda nueva y busca en ella con su adaptador. */
  private async expand(host: string, pageUrl: string, query: ShoppingQuery, signal?: AbortSignal) {
    const page = await this.options.http.get(pageUrl, { accept: "text/html", signal });
    const platform: StorePlatform | null = detectPlatform(page.headers, page.body);
    const adapter = platform ? PLATFORM_ADAPTERS[platform] : undefined;
    if (!platform || !adapter) return [];
    const perStore = this.options.perStore ?? 3;
    const [term] = termsOf(query);
    const hits = relevant(
      ofStore(
        await adapter(this.options.http, {
          domain: host,
          term: term ?? "",
          limit: perStore * 3,
          signal,
        }),
        host,
      ),
      query,
    ).slice(0, perStore);
    return hits.map((hit): CandidateUrl => ({
      url: hit.url,
      store: toStore({ name: bareHost(host), domain: host }),
      title: hit.title,
      source: `discovery+platform:${platform.toLowerCase()}`,
      platform,
    }));
  }
}

/** URL canónica para deduplicar: sin fragmento, sin query, host en minúsculas, sin `/` final. */
export function canonicalizeUrl(raw: string): string {
  const url = new URL(raw);
  url.hash = "";
  url.search = "";
  url.hostname = url.hostname.toLowerCase();
  const out = url.toString();
  return out.endsWith("/") && url.pathname !== "/" ? out.slice(0, -1) : out;
}

export interface CompositeSearchOptions {
  /** Máximo de candidatas por tienda (la variedad importa más que la cantidad). */
  perStore?: number;
  /** Máximo total de candidatas por query. */
  maxTotal?: number;
  onError?: SourceErrorHandler;
}

/**
 * Combina fuentes (registro, descubrimiento, …): tolera fallas parciales, deduplica por URL
 * canónica, acota por tienda e intercala tiendas para que ninguna acapare el resultado.
 */
export class CompositeSearchProvider implements SearchProvider {
  readonly name = "composite";

  constructor(
    private readonly sources: SearchProvider[],
    private readonly options: CompositeSearchOptions = {},
  ) {}

  async search(query: ShoppingQuery, options: SearchOptions = {}): Promise<CandidateUrl[]> {
    const results = await Promise.allSettled(this.sources.map((s) => s.search(query, options)));
    const byStore = new Map<string, CandidateUrl[]>();
    const seen = new Set<string>();
    const perStore = this.options.perStore ?? 3;

    results.forEach((result, i) => {
      if (result.status === "rejected") {
        this.options.onError?.(this.sources[i]?.name ?? "fuente", result.reason);
        return;
      }
      for (const candidate of result.value) {
        let canonical: string;
        try {
          canonical = canonicalizeUrl(candidate.url);
        } catch {
          continue;
        }
        if (seen.has(canonical)) continue;
        seen.add(canonical);
        const key = bareHost(candidate.store.domain);
        const list = byStore.get(key) ?? [];
        if (list.length < perStore) list.push({ ...candidate, url: canonical });
        byStore.set(key, list);
      }
    });

    // Intercalado: la primera de cada tienda, después la segunda, etc.
    const lists = [...byStore.values()];
    const out: CandidateUrl[] = [];
    for (let round = 0; round < perStore; round++) {
      for (const list of lists) {
        const c = list[round];
        if (c) out.push(c);
      }
    }
    return out.slice(0, this.options.maxTotal ?? 30);
  }
}
