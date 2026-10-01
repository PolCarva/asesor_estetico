/**
 * Prueba real del paso 05: pipeline completo de un look (queries → búsqueda → fetch →
 * extracción → talles/stock → Validate → ranking) con la cache de pools en Postgres, y el
 * ranking guardado en `look_products` del look 1 de una cuenta local. Imprime el top 5 por
 * prenda con score y breakdown, y cuántos requests HTTP hizo: una segunda corrida dentro de
 * las 24 h sale de la cache sin re-scrapear (0 requests si los productos tienen < 8 h).
 *
 *   pnpm --filter @asesor/worker exec tsx --env-file-if-exists=../../.env scripts/real-shopping-ranking.ts [--account demo@asesor.test] [--top M] [--bottom 42] [--shoe 42]
 *
 * Sin descubrimiento web (no gasta IA). Usa el LookSpec guardado del look 1 de la cuenta.
 */
import { getWorkerEnv } from "@asesor/config/env/worker";
import { createPostgresSearchCache, saveLookProducts, type TypedSupabaseClient } from "@asesor/db";
import { createAdminClient } from "@asesor/db/admin";
import {
  audienceForProfile,
  buildShoppingQueries,
  EMPTY_USER_SIZES,
  parseStoredStyleProfile,
  StoredLookSpecSchema,
} from "@asesor/shared";
import {
  createLiveShopping,
  createSafeTransport,
  type FetchLike,
  searchProducts,
} from "@asesor/shopping";

const env = getWorkerEnv();
const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const account = arg("account", "demo@asesor.test");
if (!account.endsWith(".test")) throw new Error("--account solo acepta cuentas .test locales.");
const sizes = {
  ...EMPTY_USER_SIZES,
  top: arg("top", "M"),
  bottom: arg("bottom", "42"),
  shoe: arg("shoe", "42"),
};

const db = createAdminClient({
  url: env.NEXT_PUBLIC_SUPABASE_URL,
  serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
}) as TypedSupabaseClient;

// Look 1 del perfil activo de la cuenta.
const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
const user = users.users.find((u) => u.email === account);
if (!user) throw new Error(`No existe la cuenta local ${account}.`);
const { data: look } = await db
  .from("looks")
  .select("id, spec_json, style_profiles!inner(active, profile_json)")
  .eq("user_id", user.id)
  .eq("position", 1)
  .eq("style_profiles.active", true)
  .single();
if (!look) throw new Error("La cuenta no tiene look 1.");
const spec = StoredLookSpecSchema.parse(look.spec_json);
const stored = parseStoredStyleProfile(look.style_profiles.profile_json);
if (!stored) throw new Error("El perfil activo no es válido.");

// Transporte seguro que cuenta los requests (páginas, APIs de plataforma y robots.txt).
let requests = 0;
const safe = createSafeTransport();
const counting: FetchLike = (url, init) => {
  requests++;
  return safe(url, init);
};
const { searchProvider, fetcher, variants } = createLiveShopping({
  botContact: env.SHOPPING_BOT_CONTACT,
  fetch: counting,
});
const cache = createPostgresSearchCache(db);

const queries = buildShoppingQueries(spec, {
  sizes,
  audience: audienceForProfile(stored.profile),
});

const started = Date.now();
console.log(
  `Look "${spec.name}" de ${account} · talles ${sizes.top}/${sizes.bottom}/${sizes.shoe}`,
);
for (const { slot, query } of queries) {
  const before = requests;
  const t0 = Date.now();
  const result = await searchProducts(query, { searchProvider, fetcher, variants, cache });
  const saved = await saveLookProducts(db, { lookId: look.id, slot, items: result.items });
  console.log(
    `\n## ${slot} · ${query.garment.description} (${query.garment.color.name}${query.garment.fit ? `, ${query.garment.fit}` : ""}) · ${result.source} · pool ${result.stats.products} · ${requests - before} requests · ${((Date.now() - t0) / 1000).toFixed(1)} s · guardados ${saved}`,
  );
  for (const [i, item] of result.items.slice(0, 5).entries()) {
    const p = item.product;
    const b = item.breakdown;
    console.log(
      `  ${i + 1}. ${item.score.toFixed(3)} · ${p.store.domain} · ${p.title.slice(0, 55)} · ${p.price ? `${p.price.currency} ${p.price.amount}` : "sin precio"} · talle ${item.size_status}`,
    );
    console.log(
      `     cat ${b.category_match} · estilo ${b.visual_similarity} · color ${b.color_match} (${p.colors.join("/") || "—"}) · fit ${b.fit_match} (${p.fit ?? "—"}) · material ${b.material_match} · talle ${b.size_available} · stock ${b.stock} · precio ${b.price}`,
    );
  }
}
console.log(`\nTotal: ${requests} requests HTTP · ${((Date.now() - started) / 1000).toFixed(0)} s`);
