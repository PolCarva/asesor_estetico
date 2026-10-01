import { normalizeText } from "@asesor/shared";
import { z } from "zod";

import type { PoliteHttpClient } from "./http";
import { parseExternal, type StoreHit } from "./platforms";

const LocsSchema = z.array(z.url({ protocol: /^https?$/ })).max(200_000);

/** `<loc>` de un sitemap (urlset o sitemapindex). */
export function parseSitemapLocs(xml: string): { isIndex: boolean; locs: string[] } {
  const isIndex = /<sitemapindex[\s>]/.test(xml);
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
    .map((m) => m[1]?.replace(/&amp;/g, "&") ?? "")
    // Los sitemaps de producto traen también `<image:loc>`; esos no son páginas.
    .filter((loc) => loc.length > 0);
  const imageLocs = new Set(
    [...xml.matchAll(/<image:loc>\s*([^<\s]+)\s*<\/image:loc>/g)].map((m) => m[1]),
  );
  return {
    isIndex,
    locs: parseExternal(
      LocsSchema,
      locs.filter((l) => !imageLocs.has(l)),
      "sitemap",
    ),
  };
}

/** Palabras del slug de una URL de producto. */
export function slugWords(url: string): string {
  const path = new URL(url).pathname;
  return normalizeText(decodeURIComponent(path).replace(/[_/-]+/g, " "));
}

/**
 * Puntaje de una URL del sitemap para un término: cuántas palabras del término aparecen
 * en el slug (por prefijo, para plurales). 0 si falta la primera (el sustantivo).
 */
export function scoreSlug(words: string, term: string): number {
  const slug = ` ${words} `;
  const tokens = normalizeText(term).split(" ").filter(Boolean);
  const [noun, ...rest] = tokens;
  if (!noun || !slug.includes(` ${noun.slice(0, Math.max(3, noun.length - 1))}`)) return 0;
  return 1 + rest.filter((t) => slug.includes(` ${t.slice(0, Math.max(3, t.length - 1))}`)).length;
}

export interface SitemapIndexOptions {
  /** Cuánto se guarda el índice de una tienda. */
  ttlMs?: number;
  /** Máximo de sitemaps hijos que se descargan por tienda. */
  maxChildSitemaps?: number;
  now?: () => number;
}

/**
 * Índice de URLs de producto por tienda, armado desde su sitemap y cacheado en memoria.
 * Para tiendas cuyo robots.txt prohíbe la búsqueda pero publica el sitemap.
 */
export class SitemapIndex {
  private readonly cache = new Map<string, { at: number; urls: Promise<string[]> }>();
  private readonly ttlMs: number;
  private readonly maxChildren: number;
  private readonly now: () => number;

  constructor(
    private readonly http: PoliteHttpClient,
    options: SitemapIndexOptions = {},
  ) {
    this.ttlMs = options.ttlMs ?? 12 * 60 * 60 * 1000;
    this.maxChildren = options.maxChildSitemaps ?? 20;
    this.now = options.now ?? Date.now;
  }

  urlsFor(sitemapUrl: string, childMatch?: RegExp): Promise<string[]> {
    const cached = this.cache.get(sitemapUrl);
    if (cached && this.now() - cached.at < this.ttlMs) return cached.urls;
    const urls = this.load(sitemapUrl, childMatch);
    this.cache.set(sitemapUrl, { at: this.now(), urls });
    // Si falla, no se cachea el error.
    urls.catch(() => this.cache.delete(sitemapUrl));
    return urls;
  }

  private async load(sitemapUrl: string, childMatch?: RegExp): Promise<string[]> {
    const root = parseSitemapLocs(
      (await this.http.get(sitemapUrl, { accept: "application/xml" })).body,
    );
    if (!root.isIndex) return root.locs;
    const children = root.locs
      .filter((loc) => (childMatch ? childMatch.test(loc) : /product|articulo/i.test(loc)))
      .slice(0, this.maxChildren);
    const parts = await Promise.allSettled(
      children.map(async (child) => {
        const res = await this.http.get(child, { accept: "application/xml" });
        return parseSitemapLocs(res.body).locs;
      }),
    );
    return parts.flatMap((p) => (p.status === "fulfilled" ? p.value : []));
  }

  /** Mejores URLs para los términos (el primero es el más específico). */
  async search(
    sitemapUrl: string,
    terms: string[],
    limit: number,
    childMatch?: RegExp,
  ): Promise<StoreHit[]> {
    const urls = await this.urlsFor(sitemapUrl, childMatch);
    const scored: Array<{ url: string; score: number }> = [];
    for (const url of urls) {
      const words = slugWords(url);
      const score = Math.max(0, ...terms.map((t, i) => scoreSlug(words, t) - i * 0.1));
      if (score > 0) scored.push({ url, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(({ url }) => ({ url, title: slugWords(url) }));
  }
}
