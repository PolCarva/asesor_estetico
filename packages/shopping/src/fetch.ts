import type { FetchedPage, ProductFetcher } from "./types";

const PRIVATE_HOST =
  /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[.*\])$/i;

/**
 * Evita SSRF: solo http(s) y nunca hosts locales o IPs privadas. Las URLs vienen
 * de buscadores externos, así que se tratan como no confiables.
 */
export function isSafeProductUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password) return false;
  return !PRIVATE_HOST.test(url.hostname);
}

export class UnsafeUrlError extends Error {
  constructor(url: string) {
    super(`URL de producto no permitida: ${url}`);
    this.name = "UnsafeUrlError";
  }
}

/** Descarga la página de un producto validando la URL antes. */
export async function fetchProductPage(url: string, fetcher: ProductFetcher): Promise<FetchedPage> {
  if (!isSafeProductUrl(url)) throw new UnsafeUrlError(url);
  return fetcher.fetch(url);
}
