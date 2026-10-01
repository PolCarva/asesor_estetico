import { isSafeProductUrl, UnsafeUrlError } from "./net";
import type { FetchedPage, FetchOptions, ProductFetcher } from "./types";

/** La URL no devolvió HTML (PDF, JSON, imagen…): no es una página de producto. */
export class NotHtmlError extends Error {
  constructor(
    readonly url: string,
    readonly contentType: string,
  ) {
    super(`No es HTML (${contentType || "sin content-type"}): ${url}`);
    this.name = "NotHtmlError";
  }
}

/** Descarga la página de un producto validando la URL antes. */
export async function fetchProductPage(
  url: string,
  fetcher: ProductFetcher,
  options: FetchOptions = {},
): Promise<FetchedPage> {
  if (!isSafeProductUrl(url)) throw new UnsafeUrlError(url);
  return fetcher.fetch(url, options);
}
