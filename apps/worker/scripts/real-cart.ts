/**
 * Prueba real del paso 10a: el carrito sobre productos reales de tiendas uruguayas, con la
 * revalidación de los datos viejos a cargo del worker real (REFRESH_PRODUCT).
 *
 *   AI_PROVIDER=mock SHOPPING_PROVIDER=live pnpm worker:dev     # en otra terminal
 *   pnpm --filter @asesor/worker exec tsx --env-file-if-exists=../../.env scripts/real-cart.ts [--quick] [--keep]
 *
 * 1. Cuenta local Premium nueva con los looks del fixture (sin IA).
 * 2. Búsqueda real de la camisa y el pantalón del look 1 (registro de tiendas, sin
 *    descubrimiento web: USD 0), guardada como la guarda el worker.
 * 3. "Envejece" los productos a 10 h y los agrega al carrito con el cliente del usuario (RLS):
 *    cada agregado espera la revalidación del worker (hasta 8 s).
 * 4. Cambia el talle, cambia por la alternativa, marca comprado, guarda el producto, lee el
 *    carrito agrupado y saca un ítem.
 *
 * `--quick`: un solo agregado, de un producto sin revalidación en esta hora (para probar sin
 * worker: queda `pending` a los 8 s).
 * Borra la cuenta al terminar, salvo `--keep`. Solo contra el Supabase local.
 */
import { getPublicEnv } from "@asesor/config/env/public";
import { getWorkerEnv } from "@asesor/config/env/worker";
import {
  addToCart,
  createPostgresSearchCache,
  getCartLines,
  getLookProducts,
  type LookProductResult,
  removeFromCart,
  saveFavorite,
  saveLookProducts,
  saveStyleProfileWithLooks,
  selectCartItemVariant,
  setCartItemPurchased,
  swapCartItem,
  type TypedSupabaseClient,
  waitForProductRefresh,
} from "@asesor/db";
import { createAdminClient } from "@asesor/db/admin";
import {
  audienceForProfile,
  buildCartView,
  buildShoppingQueries,
  EMPTY_USER_SIZES,
  type Money,
} from "@asesor/shared";
import { FIXTURE_LOOK_SPECS, FIXTURE_STYLE_PROFILE } from "@asesor/shared/fixtures";
import { createLiveShopping, createSafeTransport, searchProducts } from "@asesor/shopping";
import { createClient } from "@supabase/supabase-js";

const env = getWorkerEnv();
const publicEnv = getPublicEnv();
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(env.NEXT_PUBLIC_SUPABASE_URL)) {
  throw new Error("Solo contra el Supabase local.");
}
const quick = process.argv.includes("--quick");
const keep = process.argv.includes("--keep");
const admin = createAdminClient({
  url: env.NEXT_PUBLIC_SUPABASE_URL,
  serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
}) as TypedSupabaseClient;

const money = (m: Money | null | undefined) => (m ? `${m.currency} ${m.amount}` : "sin precio");
const seconds = (since: number) => `${((Date.now() - since) / 1000).toFixed(1)} s`;

// 1. Cuenta Premium nueva.
const email = `real-cart-${crypto.randomUUID().slice(0, 8)}@asesor.test`;
const password = `Pw-${crypto.randomUUID()}`;
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error || !created.data.user) throw created.error ?? new Error("sin usuario");
const userId = created.data.user.id;
const saved = await saveStyleProfileWithLooks(admin, {
  userId,
  profile: FIXTURE_STYLE_PROFILE,
  looks: FIXTURE_LOOK_SPECS,
});
await admin.from("subscriptions").insert({
  user_id: userId,
  provider: "MOCK",
  provider_subscription_id: `real-cart-${userId}`,
  status: "ACTIVE",
  current_period_start: new Date().toISOString(),
  current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
});
const client = createClient(
  publicEnv.NEXT_PUBLIC_SUPABASE_URL,
  publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
) as TypedSupabaseClient;
const signIn = await client.auth.signInWithPassword({ email, password });
if (signIn.error) throw signIn.error;
const lookId = saved.looks.find((l) => l.position === 1)!.id;
console.log(`Cuenta ${email} (Premium) · look 1 "${FIXTURE_LOOK_SPECS[0].name}"`);

try {
  // 2. Búsqueda real de dos prendas (registro, sin descubrimiento), guardada como el worker.
  const sizes = { ...EMPTY_USER_SIZES, top: "M", bottom: "42" };
  const { searchProvider, fetcher, variants } = createLiveShopping({
    botContact: env.SHOPPING_BOT_CONTACT,
    fetch: createSafeTransport(),
  });
  const cache = createPostgresSearchCache(admin);
  const queries = buildShoppingQueries(FIXTURE_LOOK_SPECS[0], {
    sizes,
    audience: audienceForProfile(FIXTURE_STYLE_PROFILE),
  }).filter((q) => q.slot === "top" || q.slot === "bottom");
  for (const { slot, query } of queries) {
    const t0 = Date.now();
    const result = await searchProducts(query, { searchProvider, fetcher, variants, cache });
    await saveLookProducts(admin, { lookId, slot, items: result.items, userSize: query.size });
    console.log(
      `Búsqueda ${slot} "${query.garment.description}" · ${result.source} · ${result.items.length} resultados · ${seconds(t0)}`,
    );
  }

  // Resultados como los ve el usuario (RLS).
  const results = await getLookProducts(client, lookId);
  const bySlot = (slot: string) => results.filter((r) => r.slot === slot && r.list === "MAIN");
  const [shirt, alternative] = bySlot("top");
  const [pants] = bySlot("bottom");
  if (!shirt || !alternative || !pants)
    throw new Error("La búsqueda no trajo suficientes resultados.");
  const describe = (r: LookProductResult) =>
    `${r.product.product.store.domain} "${r.product.product.title}" · ${money(r.product.product.price)}`;

  // 3. Datos de más de 8 h: agregarlos espera la revalidación del worker.
  for (const r of [shirt, alternative, pants, ...bySlot("top").slice(2)]) {
    await admin
      .from("products")
      .update({ last_fetched_at: new Date(Date.now() - 10 * 3_600_000).toISOString() })
      .eq("id", r.product.id);
  }
  const lastFetched = async (id: string) =>
    (await admin.from("products").select("last_fetched_at").eq("id", id).single()).data!
      .last_fetched_at;
  const revalidate = async (productId: string) => {
    const t0 = Date.now();
    const outcome = await waitForProductRefresh(admin, productId);
    console.log(`    REFRESH_PRODUCT → ${outcome} en ${seconds(t0)}`);
    return outcome;
  };
  const sizeOf = async (variantId: string | null) =>
    variantId
      ? (await admin.from("product_variants").select("size").eq("id", variantId).single()).data
          ?.size
      : "—";

  async function add(r: LookProductResult) {
    const before = await lastFetched(r.product.id);
    console.log(`\nAgregar ${r.slot}: ${describe(r)}`);
    console.log(`    ${r.product.product.url}`);
    const result = await addToCart({
      userClient: client,
      productId: r.product.id,
      lookId,
      slot: r.slot,
      revalidate,
    });
    console.log(
      `    → ${result.alreadyInCart ? "ya estaba" : "agregado"} · revalidación ${result.revalidation} · precio ${money(result.price)}${result.priceChange ? ` (antes ${money(result.priceChange.from)})` : ""} · talle ${await sizeOf(result.variantId)} · stock ${result.availability}`,
    );
    console.log(`    last_fetched_at ${before} → ${await lastFetched(r.product.id)}`);
    return result;
  }

  if (quick) {
    // Sin worker: un producto que todavía no tiene revalidación en esta hora.
    await add(bySlot("top").at(-1)!);
  }
  const shirtItem = quick ? null : await add(shirt);
  if (shirtItem) {
    const pantsItem = await add(pants);

    // 4. Talle, alternativa, comprado, guardado, lectura agrupada y quitar.
    const { data: shirtVariants } = await admin
      .from("product_variants")
      .select("id, size, price_amount, currency")
      .eq("product_id", shirt.product.id);
    const otherSize = (shirtVariants ?? []).find((v) => v.id !== shirtItem.variantId);
    if (otherSize) {
      const changed = await selectCartItemVariant({
        userClient: client,
        itemId: shirtItem.itemId,
        variantId: otherSize.id,
      });
      console.log(
        `\nTalle ${otherSize.size}: precio ${money(changed.price)} · stock ${changed.availability}`,
      );
    }
    console.log(`\nCambiar la camisa por la alternativa: ${describe(alternative)}`);
    const swapped = await swapCartItem({
      userClient: client,
      itemId: shirtItem.itemId,
      productId: alternative.product.id,
      revalidate,
    });
    console.log(
      `    → mismo ítem ${swapped.itemId === shirtItem.itemId} · revalidación ${swapped.revalidation} · precio ${money(swapped.price)} · talle ${await sizeOf(swapped.variantId)} · stock ${swapped.availability}`,
    );
    const purchased = await setCartItemPurchased({
      userClient: client,
      itemId: pantsItem.itemId,
      purchased: true,
    });
    console.log(`Pantalón marcado como comprado: ${purchased.purchasedAt}`);
    const favorite = await saveFavorite({
      userClient: client,
      target: { productId: shirt.product.id },
    });
    console.log(`Camisa original guardada: ${favorite.alreadySaved ? "ya estaba" : "sí"}`);

    const view = buildCartView(await getCartLines(client));
    console.log("\nCarrito agrupado:");
    for (const group of view.groups) {
      console.log(`  ${group.look ? `Look ${group.look.position} · ${group.look.name}` : "Otros"}`);
      for (const line of group.lines) {
        console.log(
          `    ${line.slot} · ${line.storeName} · ${line.title} · talle ${line.variant?.size ?? "—"} · ${money(line.unitPrice)}${line.purchased ? " · comprado" : ""}${line.stale ? " · dato viejo" : ""}`,
        );
      }
      console.log(`    subtotal pendiente: ${group.subtotals.map(money).join(" + ") || "—"}`);
    }
    console.log(
      `  TOTAL APROX. pendiente: ${view.totals.pending.map(money).join(" + ") || "—"} · comprado: ${view.totals.purchased.map(money).join(" + ") || "—"} · sin precio: ${view.totals.withoutPrice}`,
    );

    await removeFromCart({ userClient: client, itemId: pantsItem.itemId });
    console.log(
      `\nPantalón sacado del carrito · quedan ${(await getCartLines(client)).length} ítems`,
    );
  }
} finally {
  if (keep) {
    console.log(`\n--keep: la cuenta ${email} queda en la base local.`);
  } else {
    await admin.auth.admin.deleteUser(userId);
    console.log(`\nCuenta ${email} borrada.`);
  }
}
