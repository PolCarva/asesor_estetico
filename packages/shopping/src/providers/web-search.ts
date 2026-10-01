import { z } from "zod";

import { parseExternal } from "./platforms";

export interface WebSearchHit {
  url: string;
  title: string | null;
}

export interface WebSearchResult {
  hits: WebSearchHit[];
  /** Costo informado por el proveedor (USD), si lo da. */
  costUsd: number | null;
}

/** Buscador web genérico. Se inyecta desde el worker (config y clave viven ahí). */
export interface WebSearchClient {
  readonly name: string;
  search(
    query: string,
    options: { maxResults: number; signal?: AbortSignal },
  ): Promise<WebSearchResult>;
}

const OpenRouterWebSearchResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullish(),
        message: z.object({
          content: z.string().nullish(),
          annotations: z
            .array(
              z.object({
                type: z.string(),
                url_citation: z
                  .object({ url: z.string().max(2000), title: z.string().max(500).nullish() })
                  .nullish(),
              }),
            )
            .nullish(),
        }),
      }),
    )
    .min(1),
  usage: z.object({ cost: z.number().nullish() }).nullish(),
});

/** Extrae las URLs citadas por la server tool `openrouter:web_search`. */
export function parseOpenRouterWebSearch(data: unknown): WebSearchResult {
  const parsed = parseExternal(OpenRouterWebSearchResponseSchema, data, "OpenRouter web_search");
  const choice = parsed.choices[0];
  if (choice?.finish_reason === "error") {
    throw new Error("OpenRouter web_search terminó con error");
  }
  const hits: WebSearchHit[] = [];
  for (const a of choice?.message.annotations ?? []) {
    if (a.type !== "url_citation" || !a.url_citation) continue;
    hits.push({ url: a.url_citation.url, title: a.url_citation.title ?? null });
  }
  // Algunos modelos citan poco: se suman las URLs que aparecen en el texto.
  for (const m of (choice?.message.content ?? "").matchAll(/https?:\/\/[^\s)\]>"']+/g)) {
    hits.push({ url: m[0].replace(/[.,;]+$/, ""), title: null });
  }
  return { hits, costUsd: parsed.usage?.cost ?? null };
}

export interface OpenRouterWebSearchOptions {
  apiKey: string;
  model: string;
  /** exa (default, funciona con cualquier modelo) o el motor nativo del modelo. */
  engine?: "exa" | "native";
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/**
 * Descubrimiento web con la server tool `openrouter:web_search` (~USD 0.01 por consulta).
 * Solo se usan las URLs: los precios o datos que diga el modelo nunca se muestran; toda
 * URL se descarga y valida después. Las consultas no llevan datos personales.
 */
export class OpenRouterWebSearchClient implements WebSearchClient {
  readonly name = "openrouter-web-search";
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: OpenRouterWebSearchOptions) {
    this.fetchFn = options.fetch ?? fetch;
  }

  async search(
    query: string,
    { maxResults, signal }: { maxResults: number; signal?: AbortSignal },
  ): Promise<WebSearchResult> {
    const signals = [AbortSignal.timeout(this.options.timeoutMs ?? 90_000), signal].filter(
      (s): s is AbortSignal => Boolean(s),
    );
    const res = await this.fetchFn("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        "content-type": "application/json",
      },
      signal: AbortSignal.any(signals),
      body: JSON.stringify({
        model: this.options.model,
        max_tokens: 3000,
        reasoning: { effort: "low" },
        provider: { data_collection: "deny" },
        messages: [
          {
            role: "user",
            content: `Hacé UNA sola búsqueda web: ${query}. Después listá solo las URLs de páginas de producto de tiendas online de Uruguay que encontraste, una por línea, sin comentarios.`,
          },
        ],
        tools: [
          {
            type: "openrouter:web_search",
            parameters: { engine: this.options.engine ?? "exa", max_results: maxResults },
          },
        ],
      }),
    });
    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) throw new Error(`OpenRouter web_search respondió ${res.status}`);
    return parseOpenRouterWebSearch(body);
  }
}
