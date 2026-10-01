import type { Garment, ShoppingQuery, ShoppingStage } from "@asesor/shared";
import { FIXTURE_PRODUCTS } from "@asesor/shared/fixtures";
import { describe, expect, it } from "vitest";

import {
  createMemorySearchCache,
  loadCandidates,
  MockProductFetcher,
  MockSearchProvider,
  type SearchOptions,
  searchProducts,
  type VariantEnricher,
} from "../src";

/** Etapas reales del pipeline para el progreso de los jobs (paso 06). */

const oxford: Garment = {
  category: "SHIRT",
  description: "camisa oxford",
  color: { name: "crudo", hex: "#EFE8DA" },
  fit: "regular",
  material: "algodón",
  pattern: null,
};

const query: ShoppingQuery = {
  garment: oxford,
  country_code: "UY",
  size: "M",
  max_price: null,
  limit: 5,
  slot: "top",
  search_terms: ["camisa oxford"],
  audience: "MEN",
  strict_max_price: false,
};

const fresh = () => new Date("2026-01-01T12:30:00.000Z");

function deps(stages: ShoppingStage[]) {
  return {
    searchProvider: new MockSearchProvider(),
    fetcher: new MockProductFetcher(FIXTURE_PRODUCTS, () => new Date("2026-01-01T12:00:00Z")),
    now: fresh,
    onStage: (stage: ShoppingStage) => stages.push(stage),
  };
}

describe("searchProducts: etapas", () => {
  it("en vivo pasa por las cinco etapas, en orden, una vez cada una", async () => {
    const stages: ShoppingStage[] = [];
    const result = await searchProducts(query, deps(stages));
    expect(result.source).toBe("LIVE");
    expect(stages).toEqual(["SEARCHING", "CHECKING_STORES", "COMPARING", "VERIFYING", "RANKING"]);
  });

  it("con un pool cacheado salta las tiendas: buscar, verificar frescura y ordenar", async () => {
    const cache = createMemorySearchCache(() => fresh().getTime());
    await searchProducts(query, { ...deps([]), cache });
    const stages: ShoppingStage[] = [];
    const hit = await searchProducts({ ...query, size: "L" }, { ...deps(stages), cache });
    expect(hit.source).toBe("CACHE");
    expect(stages).toEqual(["SEARCHING", "VERIFYING", "RANKING"]);
  });

  it("le pasa al buscador la señal y el costo de cada búsqueda web del pedido", async () => {
    const seen: SearchOptions[] = [];
    const costs: number[] = [];
    const controller = new AbortController();
    await searchProducts(query, {
      ...deps([]),
      searchProvider: {
        name: "con-costo",
        search: async (_q, options = {}) => {
          seen.push(options);
          options.onCost?.(0.007);
          return [];
        },
      },
      signal: controller.signal,
      onCost: (usd) => costs.push(usd),
    });
    expect(seen[0]?.signal).toBe(controller.signal);
    expect(costs).toEqual([0.007]);
  });
});

describe("searchProducts: lo que no se cachea", () => {
  it("una búsqueda cortada (timeout o apagado) falla y no guarda el pool", async () => {
    const cache = createMemorySearchCache(() => fresh().getTime());
    const controller = new AbortController();
    const pages = new MockProductFetcher();
    const search = searchProducts(query, {
      ...deps([]),
      cache,
      signal: controller.signal,
      fetcher: {
        name: "lento",
        fetch: async (url, options) => {
          controller.abort(new Error("timeout del job"));
          return pages.fetch(url, options);
        },
      },
    });
    await expect(search).rejects.toThrow("timeout del job");
    const again = await searchProducts(query, { ...deps([]), cache });
    expect(again.source).toBe("LIVE");
  });

  it("un pool vacío no se guarda: la próxima búsqueda vuelve a las tiendas", async () => {
    const cache = createMemorySearchCache(() => fresh().getTime());
    let searches = 0;
    const empty = { name: "vacío", search: async () => (searches++, []) };
    expect(
      (await searchProducts(query, { ...deps([]), searchProvider: empty, cache })).items,
    ).toEqual([]);
    await searchProducts(query, { ...deps([]), searchProvider: empty, cache });
    expect(searches).toBe(2);
  });
});

describe("loadCandidates por fases", () => {
  it("compara antes de verificar: la plataforma no se consulta para lo descartado", async () => {
    const uyu = FIXTURE_PRODUCTS[0]!;
    const eur = FIXTURE_PRODUCTS[1]!;
    const pages = new MockProductFetcher([uyu, eur]);
    const fetcher = {
      name: "con-eur",
      fetch: async (url: string) => {
        const page = await pages.fetch(url);
        // Moneda que no se vende en Uruguay: Normalize lo descarta.
        return url === eur.url ? { ...page, body: page.body.replaceAll("UYU", "EUR") } : page;
      },
    };
    const enriched: string[] = [];
    const variants: VariantEnricher = {
      enrich: async ({ page }) => {
        enriched.push(page.url);
        return { status: "unsupported" };
      },
    };
    const stages: ShoppingStage[] = [];
    const outcomes = await loadCandidates(
      [uyu, eur].map((p) => ({ url: p.url, store: p.store })),
      { fetcher, variants, onStage: (s) => stages.push(s) },
    );
    expect(outcomes.map((o) => o.status)).toEqual(["product", "discarded"]);
    expect(enriched).toEqual([uyu.url]);
    expect(stages).toEqual(["COMPARING", "VERIFYING"]);
  });
});
