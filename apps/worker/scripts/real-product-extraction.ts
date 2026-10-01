/**
 * Prueba real del paso 04a: candidatas reales del paso 03 → fetch seguro → extracción en
 * cascada (JSON-LD → microdata → OpenGraph) → normalización. Imprime una tabla por tienda
 * y verifica productos válidos (nombre, precio, moneda e imagen) de ≥5 tiendas en ≥3
 * plataformas. `--discovery` suma la búsqueda web (~USD 0.01 por prenda).
 *
 *   pnpm --filter @asesor/worker exec tsx --env-file-if-exists=../../.env scripts/real-product-extraction.ts [look-1|look-2|look-3] [--discovery]
 */
import { getWorkerEnv } from "@asesor/config/env/worker";
import { buildShoppingQueries, EMPTY_USER_SIZES } from "@asesor/shared";
import { FIXTURE_LOOK_SPECS } from "@asesor/shared/fixtures";
import {
  type CandidateOutcome,
  createLiveShopping,
  findRegisteredStore,
  loadCandidates,
  OpenRouterWebSearchClient,
  summarizeOutcomes,
} from "@asesor/shopping";

const env = getWorkerEnv();
const lookId = process.argv.find((a) => /^look-\d$/.test(a)) ?? "look-1";
const look = FIXTURE_LOOK_SPECS.find((l) => l.id === lookId);
if (!look) throw new Error(`No existe ${lookId}`);
const discovery = process.argv.includes("--discovery") && Boolean(env.OPENROUTER_API_KEY);

let cost = 0;
const searchErrors: string[] = [];
const { searchProvider, fetcher } = createLiveShopping({
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

const outcomes: CandidateOutcome[] = [];
const started = Date.now();
for (const { slot, query } of queries) {
  const t0 = Date.now();
  const candidates = await searchProvider.search(query);
  const results = await loadCandidates(candidates, { fetcher, concurrency: 4 });
  outcomes.push(...results);
  const stats = summarizeOutcomes(results);
  console.log(
    `\n## ${slot} · ${query.garment.description} · ${candidates.length} candidatas → ${stats.products} productos · ${((Date.now() - t0) / 1000).toFixed(0)} s`,
  );
  for (const r of results) {
    const where = `${r.candidate.store.domain}`;
    if (r.status === "product") {
      const p = r.product;
      const sources = [...new Set(Object.values(r.sources))].join("+");
      console.log(
        `  ✓ ${where} · ${p.title} · ${p.price.currency} ${p.price.amount} · ${p.availability} · ${p.category}${p.fit ? ` · fit ${p.fit}` : ""}${p.colors.length ? ` · ${p.colors.join("/")}` : ""} · img ${p.image_url ? "sí" : "no"} · ${sources}`,
      );
    } else {
      const why = r.status === "not_product" ? "no es producto" : r.reason;
      console.log(`  ✗ ${where} · ${why} · ${r.candidate.url}`);
    }
  }
}

interface StoreRow {
  platform: string;
  candidates: number;
  valid: number;
  complete: number;
  failures: Map<string, number>;
  example?: string;
  sources: Set<string>;
}
const stores = new Map<string, StoreRow>();
for (const r of outcomes) {
  const domain = r.candidate.store.domain;
  // Sin plataforma conocida (descubrimiento sin huella) no cuenta para el criterio.
  const platform = r.candidate.platform ?? findRegisteredStore(domain)?.platform ?? "?";
  const row: StoreRow = stores.get(domain) ?? {
    platform,
    candidates: 0,
    valid: 0,
    complete: 0,
    failures: new Map(),
    sources: new Set(),
  };
  row.candidates++;
  if (r.status === "product") {
    row.valid++;
    const p = r.product;
    // "Válido" para el paso: nombre, precio, moneda e imagen.
    if (p.title && p.price.amount > 0 && p.image_url) {
      row.complete++;
      row.example ??= `${p.title.slice(0, 48)} · ${p.price.currency} ${p.price.amount}`;
    }
    for (const s of Object.values(r.sources)) row.sources.add(s);
  } else {
    const why = r.status === "not_product" ? "no_producto" : r.reason;
    row.failures.set(why, (row.failures.get(why) ?? 0) + 1);
  }
  stores.set(domain, row);
}

const rows = [...stores.entries()].sort((a, b) => b[1].complete - a[1].complete);
console.log(`\n### Resumen por tienda (${lookId})\n`);
console.log("| Tienda | Plataforma | Candidatas | Válidos | Fuentes | Fallas | Ejemplo |");
console.log("| --- | --- | --- | --- | --- | --- | --- |");
for (const [domain, row] of rows) {
  const failures = [...row.failures].map(([k, v]) => `${k} ${v}`).join(", ") || "—";
  console.log(
    `| ${domain} | ${row.platform} | ${row.candidates} | ${row.complete} | ${[...row.sources].join("+") || "—"} | ${failures} | ${row.example ?? "—"} |`,
  );
}

const okStores = rows.filter(([, r]) => r.complete > 0);
const okPlatforms = new Set(okStores.map(([, r]) => r.platform).filter((p) => p !== "?"));
const total = summarizeOutcomes(outcomes);
console.log(`\nConteos: ${JSON.stringify(total)}`);
console.log(
  `Tiendas con ≥1 producto válido: ${okStores.length} · plataformas: ${[...okPlatforms].join(", ")}`,
);
console.log(
  `Descubrimiento web: ${discovery ? `sí, USD ${cost.toFixed(4)}` : "no"} · ${((Date.now() - started) / 1000).toFixed(0)} s`,
);
if (searchErrors.length)
  console.log(`Fallas de búsqueda (${searchErrors.length}):\n  ${searchErrors.join("\n  ")}`);
const passed = okStores.length >= 5 && okPlatforms.size >= 3;
console.log(
  passed
    ? "OK: ≥5 tiendas en ≥3 plataformas."
    : "NO ALCANZA: hacen falta ≥5 tiendas en ≥3 plataformas.",
);
process.exitCode = passed ? 0 : 1;
