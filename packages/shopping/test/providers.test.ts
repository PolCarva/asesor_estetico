import { readFileSync } from "node:fs";

import { buildShoppingQueries, EMPTY_USER_SIZES, type ShoppingQuery } from "@asesor/shared";
import { FIXTURE_LOOK_SPECS } from "@asesor/shared/fixtures";
import { describe, expect, it, vi } from "vitest";

import {
  BOT_TOKEN,
  buildUserAgent,
  canonicalizeUrl,
  CompositeSearchProvider,
  detectPlatform,
  DiscoverySearchProvider,
  HttpStatusError,
  isAllowedByRobots,
  MalformedResponseError,
  OpenRouterWebSearchClient,
  parseFenicioListing,
  parseOpenRouterWebSearch,
  parseRobots,
  parseShopifySuggest,
  parseSitemapLocs,
  parseVtexSearch,
  parseWooProducts,
  PoliteHttpClient,
  type RegisteredStore,
  RegistrySearchProvider,
  RobotsDisallowedError,
  type SearchProvider,
  SitemapIndex,
  type WebSearchClient,
} from "../src";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const json = (name: string) => JSON.parse(fixture(name)) as unknown;

/** fetch falso: responde por URL exacta o prefijo; registra cada request. */
function fakeFetch(
  routes: Record<string, { status?: number; body: string; headers?: Record<string, string> }>,
) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const key = Object.keys(routes)
      .sort((a, b) => b.length - a.length)
      .find((k) => url === k || url.startsWith(k));
    const route = key ? routes[key] : undefined;
    if (!route) return new Response("not found", { status: 404 });
    return new Response(route.body, { status: route.status ?? 200, headers: route.headers });
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const [look1] = FIXTURE_LOOK_SPECS;
const queryFor = (description: string, category: ShoppingQuery["garment"]["category"]) =>
  buildShoppingQueries(
    {
      ...look1,
      top: { ...look1.top, description, category, color: { name: "negro", hex: "#111111" } },
    },
    { sizes: EMPTY_USER_SIZES, audience: "MEN" },
  )[0]!.query;

describe("robots.txt", () => {
  const robots = parseRobots(`
User-agent: *
Disallow: /*?*q=
Disallow: /api
Allow: /api/catalog_system/pub/products/search?fq=

User-agent: OtroBot
Disallow: /

User-agent: AsesorEsteticoBot
User-agent: Tercero
Disallow: /privado
`);

  it("usa el grupo que nombra al bot y, si no hay, los de *", () => {
    expect(isAllowedByRobots(robots, BOT_TOKEN, "/catalogo?q=camisa")).toBe(true);
    expect(isAllowedByRobots(robots, BOT_TOKEN, "/privado/x")).toBe(false);
    expect(isAllowedByRobots(robots, "Anonimo", "/catalogo?q=camisa")).toBe(false);
    expect(isAllowedByRobots(robots, "Anonimo", "/catalogo")).toBe(true);
    expect(isAllowedByRobots(robots, "OtroBot", "/catalogo")).toBe(false);
  });

  it("gana la regla más larga y soporta * y $", () => {
    expect(isAllowedByRobots(robots, "x", "/api/sessions")).toBe(false);
    expect(isAllowedByRobots(robots, "x", "/api/catalog_system/pub/products/search?fq=C:/1/")).toBe(
      true,
    );
    const anchored = parseRobots("User-agent: *\nDisallow: /*.aspx$\nDisallow: /*_*");
    expect(isAllowedByRobots(anchored, "x", "/a.aspx")).toBe(false);
    expect(isAllowedByRobots(anchored, "x", "/a.aspx?x=1")).toBe(true);
    expect(isAllowedByRobots(anchored, "x", "/api/catalog_system/x")).toBe(false);
  });

  it("Disallow vacío no prohíbe nada", () => {
    expect(isAllowedByRobots(parseRobots("User-agent: *\nDisallow:"), "x", "/todo")).toBe(true);
  });
});

describe("PoliteHttpClient", () => {
  it("manda user agent identificable y respeta robots.txt", async () => {
    const { fetch, calls } = fakeFetch({
      "https://tienda.com.uy/robots.txt": { body: "User-agent: *\nDisallow: /buscar" },
      "https://tienda.com.uy/catalogo": { body: "ok" },
    });
    const http = new PoliteHttpClient({ fetch, userAgent: buildUserAgent("bot@asesor.test") });
    expect((await http.get("https://tienda.com.uy/catalogo?q=remera")).body).toBe("ok");
    await expect(http.get("https://tienda.com.uy/buscar?q=remera")).rejects.toBeInstanceOf(
      RobotsDisallowedError,
    );
    // robots.txt se descarga una sola vez.
    expect(calls.filter((c) => c.url.endsWith("/robots.txt"))).toHaveLength(1);
    const ua = calls[0]?.headers["user-agent"] ?? "";
    expect(ua).toMatch(/^AsesorEsteticoBot\/\d/);
    expect(ua).toContain("bot@asesor.test");
  });

  it("robots.txt con 5xx o caído = no se pide nada; 404 = todo permitido", async () => {
    const down = new PoliteHttpClient({
      fetch: fakeFetch({ "https://caida.com.uy/robots.txt": { status: 503, body: "" } }).fetch,
    });
    await expect(down.get("https://caida.com.uy/x")).rejects.toBeInstanceOf(RobotsDisallowedError);
    const none = new PoliteHttpClient({
      fetch: fakeFetch({ "https://libre.com.uy/x": { body: "ok" } }).fetch,
    });
    expect((await none.get("https://libre.com.uy/x")).body).toBe("ok");
  });

  it("rechaza hosts internos y respuestas no 2xx", async () => {
    const http = new PoliteHttpClient({
      fetch: fakeFetch({ "https://tienda.com.uy/x": { status: 403, body: "bloqueado" } }).fetch,
    });
    await expect(http.get("http://127.0.0.1/admin")).rejects.toThrow(/no permitida/);
    await expect(http.get("https://tienda.com.uy/x")).rejects.toBeInstanceOf(HttpStatusError);
  });
});

describe("adaptadores de plataforma (respuestas reales grabadas)", () => {
  it("Fenicio: links y títulos del listado; sin título usa null", () => {
    const hits = parseFenicioListing(fixture("fenicio-legacy-camisa.html"), "legacy.com.uy");
    expect(hits.length).toBe(3);
    expect(hits[0]).toEqual({
      url: expect.stringMatching(/^https:\/\/legacy\.com\.uy\/catalogo\/camisa-/),
      title: expect.stringMatching(/CAMISA/),
    });
    expect(hits.at(-1)).toEqual({
      url: "https://legacy.com.uy/catalogo/camisa-sin-titulo_X1_AZUL",
      title: null,
    });
  });

  it("VTEX, Shopify y WooCommerce", () => {
    const vtex = parseVtexSearch(json("vtex-adidas-remera.json"), "www.adidas.com.uy");
    expect(vtex[0]?.url).toMatch(/^https:\/\/www\.adidas\.com\.uy\/.+\/p$/);
    expect(vtex[0]?.title).toMatch(/Remera/);

    const shopify = parseShopifySuggest(json("shopify-jackjones-camisa.json"), "jackjones.com.uy");
    expect(shopify[0]?.url).toMatch(/^https:\/\/jackjones\.com\.uy\/products\/[^?]+$/);
    expect(shopify[0]?.title).toMatch(/CAMISA/);

    const woo = parseWooProducts(json("woo-tiendasmontevideo-camisa.json"), "x");
    expect(woo[0]?.url).toMatch(/^https:\/\/www\.tiendasmontevideo\.com\.uy\/product\//);
  });

  it("respuestas malformadas se rechazan con Zod", () => {
    expect(() => parseVtexSearch({ error: "x" }, "d")).toThrow(MalformedResponseError);
    expect(() => parseVtexSearch([{ productName: "x", link: "javascript:alert(1)" }], "d")).toThrow(
      MalformedResponseError,
    );
    expect(() => parseShopifySuggest({ resources: {} }, "d")).toThrow(MalformedResponseError);
    expect(() => parseWooProducts([{ name: "x" }], "d")).toThrow(MalformedResponseError);
    expect(() => parseOpenRouterWebSearch({ choices: [] })).toThrow(MalformedResponseError);
  });

  it("detecta la plataforma por huella", () => {
    const h = new Headers();
    expect(detectPlatform(h, '<link href="https://f.fcdn.app/assets/x.css">')).toBe("FENICIO");
    expect(detectPlatform(new Headers({ "x-powered-by": "MV" }), "")).toBe("FENICIO");
    expect(detectPlatform(h, '<img src="https://tienda.vtexassets.com/a.jpg">')).toBe("VTEX");
    expect(detectPlatform(h, '<script src="//cdn.shopify.com/s/x.js">')).toBe("SHOPIFY");
    expect(detectPlatform(h, '<link href="/wp-content/plugins/woocommerce/x.css">')).toBe(
      "WOOCOMMERCE",
    );
    expect(detectPlatform(h, "<html>nada</html>")).toBeNull();
  });
});

describe("sitemap", () => {
  const routes = {
    "https://www.stadium.com.uy/robots.txt": { body: "User-agent: *\nDisallow: /*?*q=" },
    "https://www.stadium.com.uy/sitemap.xml": { body: fixture("sitemap-stadium-index.xml") },
    "https://www.stadium.com.uy/sitemap/catalogo-articulos.xml": {
      body: fixture("sitemap-stadium-articulos.xml"),
    },
  };

  it("lee urlset e índice, sin las URLs de imágenes", () => {
    const set = parseSitemapLocs(fixture("sitemap-stadium-articulos.xml"));
    expect(set.isIndex).toBe(false);
    expect(set.locs).toHaveLength(5);
    expect(set.locs.every((l) => l.includes("/productos/"))).toBe(true);
    expect(parseSitemapLocs(fixture("sitemap-stadium-index.xml")).isIndex).toBe(true);
  });

  it("una remera negra de hombre trae remeras, no medias ni productos de mujer", async () => {
    const http = new PoliteHttpClient({ fetch: fakeFetch(routes).fetch });
    const stadium: RegisteredStore = {
      name: "Stadium",
      domain: "www.stadium.com.uy",
      platform: "FENICIO",
      audience: "ALL",
      search: "SITEMAP",
      sitemapUrl: "https://www.stadium.com.uy/sitemap.xml",
    };
    const provider = new RegistrySearchProvider({
      http,
      sitemaps: new SitemapIndex(http),
      registry: [stadium],
    });
    const remeras = await provider.search(queryFor("remera lisa", "T_SHIRT"));
    expect(remeras.length).toBe(2);
    expect(remeras.every((c) => c.url.includes("/remera-de-hombre"))).toBe(true);
    expect(remeras.every((c) => c.source === "sitemap")).toBe(true);

    const championes = await provider.search(queryFor("zapatillas urbanas", "SHOES"));
    expect(championes.map((c) => c.url)).toEqual([
      "https://www.stadium.com.uy/productos/championes-de-hombre-adidas-galaxy-8-m-negro_009.IH9812_01000",
    ]);
  });
});

describe("registro de tiendas", () => {
  const registry: RegisteredStore[] = [
    {
      name: "Legacy",
      domain: "legacy.com.uy",
      platform: "FENICIO",
      audience: "MEN",
      search: "PLATFORM",
    },
    {
      name: "Lolita",
      domain: "lolita.com.uy",
      platform: "FENICIO",
      audience: "WOMEN",
      search: "PLATFORM",
    },
    {
      name: "Caída",
      domain: "caida.com.uy",
      platform: "VTEX",
      audience: "ALL",
      search: "PLATFORM",
    },
  ];

  it("busca por plataforma, salta tiendas de otro público y tolera una caída", async () => {
    const { fetch, calls } = fakeFetch({
      "https://legacy.com.uy/robots.txt": { body: "User-agent: *\nAllow: /" },
      "https://legacy.com.uy/catalogo?q=": { body: fixture("fenicio-legacy-camisa.html") },
      "https://caida.com.uy/robots.txt": { body: "" },
      "https://caida.com.uy/api/": { status: 500, body: "error" },
    });
    const http = new PoliteHttpClient({ fetch });
    const errors: string[] = [];
    const provider = new RegistrySearchProvider({
      http,
      sitemaps: new SitemapIndex(http),
      registry,
      onError: (source) => errors.push(source),
    });
    const result = await provider.search(queryFor("camisa oxford", "SHIRT"));
    expect(result.length).toBe(3);
    expect(result.every((c) => c.store.domain === "legacy.com.uy")).toBe(true);
    expect(calls.some((c) => c.url.includes("lolita"))).toBe(false);
    expect(errors).toEqual(["registry:caida.com.uy"]);
  });
});

describe("descubrimiento web", () => {
  const webSearch = (urls: string[]): WebSearchClient => ({
    name: "fake",
    search: vi.fn(async () => ({ hits: urls.map((url) => ({ url, title: null })), costUsd: 0.01 })),
  });

  it("solo tiendas uruguayas, sin bloqueadas ni home, y detecta plataforma de las nuevas", async () => {
    const { fetch } = fakeFetch({
      "https://nueva.com.uy/robots.txt": { body: "User-agent: *\nAllow: /" },
      "https://nueva.com.uy/catalogo/camisa-oxford-blanca_1": {
        body: '<html><link href="https://f.fcdn.app/a.css"></html>',
      },
      "https://nueva.com.uy/catalogo?q=": {
        body: '<a class="img" href="/catalogo/camisa-oxford-celeste_2" title="Camisa Oxford Celeste">',
      },
    });
    const costs: number[] = [];
    const provider = new DiscoverySearchProvider({
      http: new PoliteHttpClient({ fetch }),
      webSearch: webSearch([
        "https://nueva.com.uy/catalogo/camisa-oxford-blanca_1",
        "https://www.tienda.com.ar/camisa-oxford",
        "https://articulo.mercadolibre.com.uy/MLU-1-camisa-oxford",
        "https://legacy.com.uy/",
        "https://otra.uy/productos/camisa-mujer-oxford",
        "https://legacy.com.uy/catalogo/camisa-oxford-lisa-blanco_L207732_BLANCO",
      ]),
      onCost: (usd) => costs.push(usd),
    });
    const result = await provider.search(queryFor("camisa oxford", "SHIRT"));
    expect(result.map((c) => c.url)).toEqual([
      "https://nueva.com.uy/catalogo/camisa-oxford-blanca_1",
      "https://legacy.com.uy/catalogo/camisa-oxford-lisa-blanco_L207732_BLANCO",
      "https://nueva.com.uy/catalogo/camisa-oxford-celeste_2",
    ]);
    expect(result[1]?.store).toEqual({ name: "Legacy", domain: "legacy.com.uy" });
    expect(result[2]).toMatchObject({ source: "discovery+platform:fenicio", platform: "FENICIO" });
    expect(costs).toEqual([0.01]);
  });

  it("la consulta web no lleva datos personales", () => {
    const text = DiscoverySearchProvider.buildQueryText(queryFor("camisa oxford", "SHIRT"));
    expect(text).toBe("camisa oxford negro hombre comprar online Uruguay");
  });

  it("OpenRouter: pide la server tool y lee las citas (respuesta real grabada)", async () => {
    const { fetch, calls } = fakeFetch({
      "https://openrouter.ai/api/v1/chat/completions": {
        body: fixture("openrouter-web-search.json"),
      },
    });
    const client = new OpenRouterWebSearchClient({ apiKey: "k", model: "m", fetch });
    const result = await client.search("camisa oxford celeste hombre comprar online Uruguay", {
      maxResults: 8,
    });
    expect(result.hits.some((h) => h.url.includes("legacy.com.uy/catalogo/"))).toBe(true);
    expect(result.costUsd).toBeGreaterThan(0);
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)) as {
      tools: Array<{ type: string; parameters: { max_results: number } }>;
      provider: { data_collection: string };
    };
    expect(body.tools[0]).toMatchObject({
      type: "openrouter:web_search",
      parameters: { max_results: 8 },
    });
    expect(body.provider.data_collection).toBe("deny");
    expect(calls).toHaveLength(1);
  });

  it("OpenRouter: finish_reason error es una falla", () => {
    expect(() =>
      parseOpenRouterWebSearch({
        choices: [{ finish_reason: "error", message: { content: null } }],
      }),
    ).toThrow(/error/);
  });
});

describe("CompositeSearchProvider", () => {
  const store = (domain: string) => ({ name: domain, domain });
  const source = (name: string, urls: string[]): SearchProvider => ({
    name,
    search: async () => urls.map((url) => ({ url, store: store(new URL(url).hostname) })),
  });
  const failing: SearchProvider = {
    name: "rota",
    search: async () => {
      throw new Error("caída");
    },
  };

  it("tolera fallas, deduplica por URL canónica, acota por tienda e intercala", async () => {
    const errors: string[] = [];
    const composite = new CompositeSearchProvider(
      [
        source("a", [
          "https://a.uy/p/1?_pos=1",
          "https://a.uy/p/2",
          "https://a.uy/p/3",
          "https://a.uy/p/4",
        ]),
        failing,
        source("b", ["https://b.uy/p/1#x", "https://a.uy/p/1", "https://b.uy/p/2/"]),
      ],
      { perStore: 3, onError: (s) => errors.push(s) },
    );
    const urls = (await composite.search(queryFor("camisa", "SHIRT"))).map((c) => c.url);
    expect(urls).toEqual([
      "https://a.uy/p/1",
      "https://b.uy/p/1",
      "https://a.uy/p/2",
      "https://b.uy/p/2",
      "https://a.uy/p/3",
    ]);
    expect(errors).toEqual(["rota"]);
  });

  it("canonicalizeUrl", () => {
    expect(canonicalizeUrl("https://Tienda.UY/Products/X/?variant=1#top")).toBe(
      "https://tienda.uy/Products/X",
    );
  });
});
