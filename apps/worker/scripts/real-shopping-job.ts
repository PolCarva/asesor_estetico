/**
 * Prueba real del paso 06: la búsqueda de productos de un look como job, de punta a punta,
 * contra tiendas reales. Necesita el worker prendido con shopping real y sin IA paga:
 *
 *   AI_PROVIDER=mock SHOPPING_PROVIDER=live pnpm worker:dev
 *   pnpm --filter @asesor/worker exec tsx --env-file-if-exists=../../.env scripts/real-shopping-job.ts [--keep]
 *
 * Crea dos usuarios locales nuevos (.test) con perfil y 3 looks (los datos que produce el
 * MockAIProvider): uno Premium (suscripción MOCK) y uno free. Con el JWT de cada uno llama a
 * `startLookShopping` (lo mismo que la server action) y sigue el job como la UI, con
 * `getLatestLookSearch` cada segundo, imprimiendo cada cambio de etapa. Al terminar muestra
 * el resumen, los productos reales guardados por prenda (leídos con RLS como el dueño) y el
 * costo de búsqueda web registrado en ai_usage. El free tiene que quedar rechazado sin
 * encolar. `--keep` deja el usuario Premium (para seguir en la UI).
 */
import { getPublicEnv } from "@asesor/config/env/public";
import { getWorkerEnv } from "@asesor/config/env/worker";
import {
  enqueueJob,
  getLatestLookSearch,
  getLookProducts,
  saveStyleProfileWithLooks,
  startLookShopping,
  type TypedSupabaseClient,
} from "@asesor/db";
import { createAdminClient } from "@asesor/db/admin";
import { EMPTY_USER_SIZES, type GarmentSlot, type UserSizes } from "@asesor/shared";
import { FIXTURE_LOOK_SPECS, FIXTURE_STYLE_PROFILE } from "@asesor/shared/fixtures";
import { createClient } from "@supabase/supabase-js";

const env = getWorkerEnv();
const publicEnv = getPublicEnv();
const keep = process.argv.includes("--keep");
const admin = createAdminClient({
  url: env.NEXT_PUBLIC_SUPABASE_URL,
  serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
}) as TypedSupabaseClient;

const STAGE_TEXT = {
  SEARCHING: "Buscando prendas…",
  CHECKING_STORES: "Revisando tiendas…",
  COMPARING: "Comparando opciones…",
  VERIFYING: "Verificando precios y talles…",
  RANKING: "Ordenando las mejores coincidencias…",
} as const;

async function createUser(label: string, premium: boolean) {
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@asesor.test`;
  const password = `Pw-${crypto.randomUUID()}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("sin usuario");
  const id = created.data.user.id;
  const saved = await saveStyleProfileWithLooks(admin, {
    userId: id,
    profile: FIXTURE_STYLE_PROFILE,
    looks: FIXTURE_LOOK_SPECS,
  });
  if (premium) {
    await admin.from("subscriptions").insert({
      user_id: id,
      provider: "MOCK",
      provider_subscription_id: `real-shopping-${id}`,
      status: "ACTIVE",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
  }
  const client = createClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  ) as TypedSupabaseClient;
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id, email, client, looks: saved.looks.map((l) => l.id) };
}

/** Sigue el job como la UI (cliente del usuario, RLS) hasta que termina. */
async function follow(
  client: TypedSupabaseClient,
  lookId: string,
  label: string,
  slot?: GarmentSlot,
) {
  const started = Date.now();
  let last = "";
  for (;;) {
    const state = await getLatestLookSearch(client, lookId, { slot });
    const p = state?.progress;
    const line = `${state?.status} · ${p ? `${p.stage} "${STAGE_TEXT[p.stage]}" · ${p.slots_done}/${p.slots_total} prendas` : "sin progreso todavía"}`;
    if (line !== last) {
      console.log(`  [${label} +${((Date.now() - started) / 1000).toFixed(1)} s] ${line}`);
      last = line;
    }
    if (state?.status === "COMPLETED" || state?.status === "FAILED") return state;
    if (Date.now() - started > 6 * 60_000) throw new Error("La búsqueda no terminó en 6 minutos.");
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function printResults(client: TypedSupabaseClient, lookId: string, top = 3) {
  const rows = await getLookProducts(client, lookId);
  const bySlot = new Map<string, typeof rows>();
  for (const row of rows) bySlot.set(row.slot, [...(bySlot.get(row.slot) ?? []), row]);
  for (const [slot, list] of bySlot) {
    console.log(`  ${slot} (${list.length} guardados)`);
    for (const r of list.slice(0, top)) {
      const p = r.product.product;
      const price = p.price ? `${p.price.currency} ${p.price.amount}` : "sin precio";
      console.log(
        `    ${r.rank}. ${r.score.toFixed(3)} · ${p.store.domain} · ${p.title.slice(0, 60)} · ${price} · stock ${p.availability} · talle ${r.sizeStatus}`,
      );
    }
  }
  return rows;
}

const premium = await createUser("real-shopping-premium", true);
const free = await createUser("real-shopping-free", false);
console.log(`Premium: ${premium.email} · free: ${free.email}`);
const look1 = premium.looks[0]!;
const sizesM: UserSizes = { ...EMPTY_USER_SIZES, top: "M", bottom: "42", shoe: "42" };
const sizesS: UserSizes = { ...EMPTY_USER_SIZES, top: "S", bottom: "40", shoe: "44" };

try {
  // 1. Look completo en vivo.
  console.log(`\n# Corrida 1 · look 1 "${FIXTURE_LOOK_SPECS[0].name}" · talles M/42/42`);
  const run1 = await startLookShopping({
    userClient: premium.client,
    serviceClient: admin,
    lookId: look1,
    sizes: sizesM,
    requestId: crypto.randomUUID(),
  });
  console.log(
    `  encolado: job ${run1.jobId} · modo ${run1.mode} · ya activa: ${run1.alreadyRunning}`,
  );
  const done1 = await follow(premium.client, look1, "1");
  console.log(`  resumen: ${JSON.stringify(done1.progress?.summary)}`);
  await printResults(premium.client, look1);

  // 2. Mismo look, otros talles: pools de la cache. Dos pedidos simultáneos = un solo job.
  console.log(`\n# Corrida 2 · mismo look · talles S/40/44 · dos pedidos a la vez`);
  const [a, b] = await Promise.all(
    [0, 1].map(() =>
      startLookShopping({
        userClient: premium.client,
        serviceClient: admin,
        lookId: look1,
        sizes: sizesS,
        requestId: crypto.randomUUID(),
      }),
    ),
  );
  console.log(
    `  pedidos: ${a!.jobId === b!.jobId ? "mismo job" : "JOBS DISTINTOS (mal)"} ${a!.jobId} · ya activa: ${a!.alreadyRunning}/${b!.alreadyRunning}`,
  );
  const done2 = await follow(premium.client, look1, "2");
  console.log(`  resumen: ${JSON.stringify(done2.progress?.summary)}`);
  await printResults(premium.client, look1, 2);

  // 3. Una sola prenda con precio máximo estricto (modo del paso 09): solo esa prenda.
  console.log(`\n# Corrida 3 · solo "top" · precio máximo estricto UYU 1500`);
  const run3 = await startLookShopping({
    userClient: premium.client,
    serviceClient: admin,
    lookId: look1,
    sizes: sizesM,
    slot: "top",
    maxPrice: { amount: 1500, currency: "UYU" },
    requestId: crypto.randomUUID(),
  });
  console.log(`  encolado: job ${run3.jobId} · modo ${run3.mode}`);
  const done3 = await follow(premium.client, look1, "3", "top");
  console.log(`  resumen: ${JSON.stringify(done3.progress?.summary)}`);
  const rows3 = await printResults(premium.client, look1, 4);

  // 4. REFRESH_PRODUCT de un producto guardado: re-extrae precio, stock y variantes.
  const target = rows3.find((r) => r.slot === "top")!.product;
  const before = await admin
    .from("products")
    .select("last_fetched_at")
    .eq("id", target.id)
    .single();
  const refresh = await enqueueJob(admin, {
    type: "REFRESH_PRODUCT",
    payload: { product_id: target.id },
    maxAttempts: 1,
  });
  console.log(`\n# REFRESH_PRODUCT · ${target.product.store.domain} · ${target.product.title}`);
  let refreshed;
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const { data } = await admin
      .from("jobs")
      .select("status, result, last_error")
      .eq("id", refresh.id)
      .single();
    if (data?.status === "COMPLETED" || data?.status === "FAILED") {
      refreshed = data;
      break;
    }
  }
  const after = await admin.from("products").select("last_fetched_at").eq("id", target.id).single();
  console.log(
    `  ${refreshed?.status} · ${JSON.stringify(refreshed?.result)} · last_fetched_at ${before.data?.last_fetched_at} → ${after.data?.last_fetched_at}`,
  );
  await admin.from("jobs").delete().eq("id", refresh.id);

  // 5. Usuario free: rechazado sin encolar.
  console.log(`\n# Usuario free`);
  try {
    await startLookShopping({
      userClient: free.client,
      serviceClient: admin,
      lookId: free.looks[0]!,
      sizes: sizesM,
      requestId: crypto.randomUUID(),
    });
    console.log("  ENCOLÓ (mal)");
  } catch (error) {
    console.log(`  rechazado: ${(error as { code?: string }).code}`);
  }
  const { count } = await admin
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", free.id);
  console.log(`  jobs del usuario free: ${count}`);

  // Lo que quedó en la base para el Premium (service role).
  const { data: jobs } = await admin
    .from("jobs")
    .select("id, status, attempts, last_error, result")
    .eq("user_id", premium.id)
    .eq("type", "SEARCH_PRODUCTS")
    .order("created_at");
  console.log(`\n# Jobs del Premium`);
  for (const j of jobs ?? []) {
    console.log(`  ${j.id} · ${j.status} · intentos ${j.attempts} · error ${j.last_error ?? "—"}`);
  }
  const { data: usage } = await admin
    .from("ai_usage")
    .select("operation, provider, model, estimated_cost_usd, metadata")
    .eq("user_id", premium.id);
  const usd = (usage ?? []).reduce((n, u) => n + Number(u.estimated_cost_usd), 0);
  console.log(
    `  ai_usage: ${JSON.stringify(usage?.map((u) => [u.operation, u.model, Number(u.estimated_cost_usd), u.metadata]))} · total USD ${usd.toFixed(4)}`,
  );
} finally {
  await admin.auth.admin.deleteUser(free.id);
  if (!keep) await admin.auth.admin.deleteUser(premium.id);
  else console.log(`\nSe conserva ${premium.email} (--keep).`);
}
