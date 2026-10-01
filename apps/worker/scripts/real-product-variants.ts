/**
 * Prueba real del paso 04b: candidatas reales → fetch → extracción → talles y stock de la
 * plataforma (Fenicio `#lstTalles`, API de catálogo VTEX, `.js` de Shopify, Store API de
 * WooCommerce) → normalización → Validate. Imprime los talles y el stock de cada producto y
 * una tabla por tienda con lo que quedó sin verificar y por qué.
 *
 *   pnpm --filter @asesor/worker exec tsx --env-file-if-exists=../../.env scripts/real-product-variants.ts [look-1|look-2|look-3] [--discovery] [--url <url-de-producto> ...]
 *
 * `--url` suma páginas de producto concretas (por ejemplo de una plataforma a la que el look
 * no llega). Sin `--discovery` no gasta IA.
 */
import { getWorkerEnv } from "@asesor/config/env/worker";
import { buildShoppingQueries, EMPTY_USER_SIZES, type Product } from "@asesor/shared";
import { FIXTURE_LOOK_SPECS } from "@asesor/shared/fixtures";
import {
  bareHost,
  type CandidateOutcome,
  type CandidateUrl,
  createLiveShopping,
  findRegisteredStore,
  loadCandidates,
  OpenRouterWebSearchClient,
  summarizeOutcomes,
} from "@asesor/shopping";

const env = getWorkerEnv();
const args = process.argv.slice(2);
const lookId = args.find((a) => /^look-\d$/.test(a)) ?? "look-1";
const look = FIXTURE_LOOK_SPECS.find((l) => l.id === lookId);
if (!look) throw new Error(`No existe ${lookId}`);
const discovery = args.includes("--discovery") && Boolean(env.OPENROUTER_API_KEY);
const extraUrls = args.flatMap((a, i) => (args[i - 1] === "--url" ? [a] : []));

let cost = 0;
const searchErrors: string[] = [];
const { searchProvider, fetcher, variants } = createLiveShopping({
  botContact: env.SHOPPING_BOT_CONTACT,
  webSearch:
    discovery && env.OPENROUTER_API_KEY
      ? new OpenRouterWebSearchClient({
          apiKey: env.OPENROUTER_API_KEY,
          model: env.OPENROUTER_TEXT_MODEL,
        })
      : undefined,
  onError: (source, error) =>
    searchErrors.push(`${source}: ${error instanceof Error ? error.message : String(error)}`),
  onCost: (usd) => (cost += usd),
});

const queries = buildShoppingQueries(look, {
  sizes: { ...EMPTY_USER_SIZES, top: "M", bottom: "42", shoe: "42" },
  audience: "MEN",
});

const STOCK_MARK = {
  IN_STOCK: "✓",
  OUT_OF_STOCK: "✗",
  UNKNOWN: "?",
  IN_STORE_ONLY: "local",
} as const;

const price = (p: Product) => (p.price ? `${p.price.currency} ${p.price.amount}` : "sin precio");
const sizes = (p: Product) =>
  p.variants
    .filter((v) => v.size)
    .map(
      (v) =>
        `${v.size}${v.size_label && v.size_label !== v.size ? `(${v.size_label})` : ""}${STOCK_MARK[v.availability]}`,
    )
    .join(" ") || "—";

function describe(r: CandidateOutcome): string {
  const where = r.candidate.store.domain;
  if (r.status !== "product") {
    const why = r.status === "not_product" ? "no es producto" : r.reason;
    return `  ✗ ${where} · ${why} · ${r.candidate.url}`;
  }
  const v = r.variants;
  const source =
    v.status === "verified"
      ? v.source
      : v.status === "failed"
        ? `${v.source} falló: ${v.reason}`
        : "sin adaptador/datos";
  return `  ✓ ${where} · ${r.product.title.slice(0, 60)} · ${price(r.product)} · ${r.product.availability} · talles ${sizes(r.product)} · ${source}\n      ${r.product.url}`;
}

const outcomes: CandidateOutcome[] = [];
const started = Date.now();
for (const { slot, query } of queries) {
  const candidates = await searchProvider.search(query);
  const results = await loadCandidates(candidates, { fetcher, variants, concurrency: 4 });
  outcomes.push(...results);
  console.log(`\n## ${slot} · ${query.garment.description} · ${candidates.length} candidatas`);
  for (const r of results) console.log(describe(r));
}

if (extraUrls.length) {
  const extra: CandidateUrl[] = extraUrls.map((url) => {
    const host = new URL(url).hostname;
    const known = findRegisteredStore(host);
    return {
      url,
      store: { name: known?.name ?? bareHost(host), domain: bareHost(host) },
      platform: known?.platform ?? null,
      source: "manual",
    };
  });
  const results = await loadCandidates(extra, { fetcher, variants, concurrency: 2 });
  outcomes.push(...results);
  console.log("\n## URLs agregadas a mano");
  for (const r of results) console.log(describe(r));
}

interface StoreRow {
  platform: string;
  products: number;
  withSizes: number;
  inStock: number;
  outOfStock: number;
  unknown: number;
  sources: Set<string>;
  unverified: Map<string, number>;
  example?: string;
}
const stores = new Map<string, StoreRow>();
for (const r of outcomes) {
  if (r.status !== "product") continue;
  const domain = r.candidate.store.domain;
  const row: StoreRow = stores.get(domain) ?? {
    platform: r.candidate.platform ?? findRegisteredStore(domain)?.platform ?? "?",
    products: 0,
    withSizes: 0,
    inStock: 0,
    outOfStock: 0,
    unknown: 0,
    sources: new Set(),
    unverified: new Map(),
  };
  const p = r.product;
  row.products++;
  if (p.variants.some((v) => v.size)) row.withSizes++;
  if (p.availability === "IN_STOCK") row.inStock++;
  else if (p.availability === "OUT_OF_STOCK") row.outOfStock++;
  else row.unknown++;
  const v = r.variants;
  if (v.status === "verified") {
    row.sources.add(v.source);
    if (p.variants.some((x) => x.size) && !row.example) {
      row.example = `${p.title.slice(0, 40)} · ${sizes(p)}`;
    }
  } else {
    const why =
      v.status === "failed"
        ? `${v.source}: ${v.reason}`
        : "sin adaptador o sin talles en la página";
    row.unverified.set(why, (row.unverified.get(why) ?? 0) + 1);
  }
  stores.set(domain, row);
}

console.log(`\n### Talles y stock por tienda (${lookId})\n`);
console.log(
  "| Tienda | Plataforma | Productos | Con talles | Stock disp / agot / ? | Fuente | Sin verificar (motivo) | Ejemplo |",
);
console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
for (const [domain, row] of [...stores.entries()].sort((a, b) => b[1].withSizes - a[1].withSizes)) {
  const unverified = [...row.unverified].map(([k, n]) => `${k} (${n})`).join(", ") || "—";
  console.log(
    `| ${domain} | ${row.platform} | ${row.products} | ${row.withSizes} | ${row.inStock} / ${row.outOfStock} / ${row.unknown} | ${[...row.sources].join(", ") || "—"} | ${unverified} | ${row.example ?? "—"} |`,
  );
}

const total = summarizeOutcomes(outcomes);
const platforms = new Set(
  outcomes.flatMap((r) =>
    r.status === "product" &&
    r.variants.status === "verified" &&
    r.product.variants.some((v) => v.size)
      ? [r.variants.source.split(":")[0]]
      : [],
  ),
);
console.log(`\nConteos: ${JSON.stringify(total)}`);
console.log(`Plataformas con talles verificados: ${[...platforms].join(", ")}`);
console.log(
  `Descubrimiento web: ${discovery ? `sí, USD ${cost.toFixed(4)}` : "no"} · ${((Date.now() - started) / 1000).toFixed(0)} s`,
);
if (searchErrors.length)
  console.log(`Fallas de búsqueda (${searchErrors.length}):\n  ${searchErrors.join("\n  ")}`);
