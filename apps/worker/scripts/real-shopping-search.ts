/**
 * Prueba real del paso 03: LookSpec → ShoppingQueries → URLs candidatas de tiendas reales.
 * Usa el registro (plataformas y sitemaps) y el descubrimiento web de OpenRouter
 * (~USD 0.01 por prenda). No descarga ni valida productos: eso es del paso 04a.
 *
 *   pnpm --filter @asesor/worker exec tsx --env-file-if-exists=../../.env scripts/real-shopping-search.ts [look-1|look-2|look-3] [--no-discovery]
 */
import { getWorkerEnv } from "@asesor/config/env/worker";
import { buildShoppingQueries, EMPTY_USER_SIZES } from "@asesor/shared";
import { FIXTURE_LOOK_SPECS } from "@asesor/shared/fixtures";
import {
  createLiveShopping,
  findRegisteredStore,
  OpenRouterWebSearchClient,
  STORE_REGISTRY,
} from "@asesor/shopping";

const env = getWorkerEnv();
const lookId = process.argv.find((a) => /^look-\d$/.test(a)) ?? "look-1";
const look = FIXTURE_LOOK_SPECS.find((l) => l.id === lookId);
if (!look) throw new Error(`No existe ${lookId}`);
const discovery = !process.argv.includes("--no-discovery") && Boolean(env.OPENROUTER_API_KEY);

let cost = 0;
const errors: string[] = [];
const { searchProvider } = createLiveShopping({
  botContact: env.SHOPPING_BOT_CONTACT,
  webSearch:
    discovery && env.OPENROUTER_API_KEY
      ? new OpenRouterWebSearchClient({
          apiKey: env.OPENROUTER_API_KEY,
          model: env.OPENROUTER_TEXT_MODEL,
        })
      : undefined,
  onError: (source, error) =>
    errors.push(`${source}: ${error instanceof Error ? error.message : String(error)}`),
  onCost: (usd) => (cost += usd),
});

const queries = buildShoppingQueries(look, {
  sizes: { ...EMPTY_USER_SIZES, top: "M", bottom: "42", shoe: "42" },
  audience: "MEN",
});

const stores = new Map<string, { platform: string; registered: boolean }>();
const started = Date.now();
for (const { slot, query } of queries) {
  const t0 = Date.now();
  const candidates = await searchProvider.search(query);
  console.log(
    `\n## ${slot} · ${query.garment.description} (${query.garment.color.name}) · términos: ${query.search_terms.join(" | ")} · ${Date.now() - t0} ms`,
  );
  for (const c of candidates) {
    const registered = Boolean(findRegisteredStore(c.store.domain));
    const platform = c.platform ?? "?";
    stores.set(c.store.domain, { platform, registered });
    console.log(
      `  - [${c.source}] ${c.store.domain}${registered ? "" : " (fuera del registro)"} · ${c.title ?? "(sin título)"}\n    ${c.url}`,
    );
  }
  if (candidates.length === 0) console.log("  (sin candidatas)");
}

const platforms = new Set([...stores.values()].map((s) => s.platform).filter((p) => p !== "?"));
const outside = [...stores.entries()].filter(([, s]) => !s.registered).map(([d]) => d);
console.log(`\nResumen (${lookId}, ${((Date.now() - started) / 1000).toFixed(0)} s):`);
console.log(
  `  Tiendas con candidatas: ${stores.size} (registro: ${STORE_REGISTRY.length} tiendas)`,
);
console.log(`  Plataformas: ${[...platforms].join(", ")}`);
console.log(`  Fuera del registro: ${outside.join(", ") || "ninguna"}`);
console.log(`  Descubrimiento web: ${discovery ? `sí, USD ${cost.toFixed(4)}` : "no"}`);
if (errors.length)
  console.log(`  Fallas parciales (${errors.length}):\n    ${errors.join("\n    ")}`);
