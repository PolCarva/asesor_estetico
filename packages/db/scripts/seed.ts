/**
 * Seed de desarrollo: usuarios ficticios y datos fake. Idempotente.
 * Uso: `pnpm db:seed` (o `pnpm db:reset`, que resetea la base y luego corre este script).
 * Solo corre contra Supabase local salvo que se pase SEED_ALLOW_REMOTE=true.
 */
import { getWorkerEnv } from "@asesor/config/env/worker";
import {
  AnalyticsEventNameSchema,
  LookSpecSchema,
  ProductSchema,
  splitStyleProfile,
  StyleProfileSchema,
} from "@asesor/shared";
import {
  FIXTURE_LOOK_SPECS,
  FIXTURE_PRODUCTS,
  FIXTURE_STYLE_PROFILE,
} from "@asesor/shared/fixtures";

import { createAdminClient } from "../src/clients/admin";
import { toJson, type TypedSupabaseClient } from "../src/types";

const env = getWorkerEnv();
const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) &&
  process.env.SEED_ALLOW_REMOTE !== "true"
) {
  console.error(
    `[seed] Abortado: ${url.hostname} no es local. Usá SEED_ALLOW_REMOTE=true si es intencional.`,
  );
  process.exit(1);
}

/** Contraseña de las cuentas ficticias. Solo para desarrollo local. */
const PASSWORD = process.env.SEED_USER_PASSWORD ?? "asesor-demo-2026";

const USERS = {
  premium: { email: "demo@asesor.test", displayName: "Demo Premium" },
  free: { email: "free@asesor.test", displayName: "Demo Free" },
  admin: { email: "admin@asesor.test", displayName: "Admin Demo" },
} as const;

const db = createAdminClient({
  url: env.NEXT_PUBLIC_SUPABASE_URL,
  serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
});

function must<R extends { data: unknown; error: unknown }>(
  result: R,
  what: string,
): NonNullable<R["data"]> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`[seed] ${what}: ${JSON.stringify(result.error)}`);
  }
  return result.data as NonNullable<R["data"]>;
}

async function recreateUser(client: TypedSupabaseClient, email: string, displayName: string) {
  const { data } = await client.auth.admin.listUsers({ perPage: 1000 });
  const existing = data.users.find((u) => u.email === email);
  // Borrar el usuario borra en cascada todos sus datos: el seed queda idempotente.
  if (existing) must(await client.auth.admin.deleteUser(existing.id), `borrar ${email}`);
  const created = must(
    await client.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: displayName, age_confirmed: true },
    }),
    `crear ${email}`,
  );
  if (!created.user) throw new Error(`[seed] crear ${email}: sin usuario`);
  return created.user.id;
}

async function seedProducts() {
  const ids = new Map<string, string>();
  for (const fixture of FIXTURE_PRODUCTS) {
    const product = ProductSchema.parse(fixture);
    const row = must(
      await db
        .from("products")
        .upsert(
          {
            external_id: product.id,
            store_name: product.store.name,
            store_domain: product.store.domain,
            url: product.url,
            title: product.title,
            brand: product.brand,
            category: product.category,
            description: product.description,
            image_url: product.image_url,
            price_amount: product.price.amount,
            currency: product.price.currency,
            colors: product.colors,
            materials: product.materials,
            fit: product.fit,
            availability: product.availability,
            data_json: toJson(product),
            last_fetched_at: product.fetched_at,
          },
          { onConflict: "url" },
        )
        .select("id")
        .single(),
      `producto ${product.id}`,
    );
    ids.set(product.id, row.id);
    for (const variant of product.variants) {
      must(
        await db
          .from("product_variants")
          .upsert(
            {
              product_id: row.id,
              external_id: variant.id,
              sku: variant.sku,
              size: variant.size,
              color: variant.color,
              availability: variant.availability,
              price_amount: variant.price?.amount ?? null,
              currency: variant.price?.currency ?? null,
            },
            { onConflict: "product_id,external_id" },
          )
          .select("id"),
        `variante ${variant.id}`,
      );
    }
  }
  return ids;
}

async function seedStyle(userId: string) {
  // Mismo guardado partido que el worker: núcleo en profile_json, asesoría en style_advice.
  const { core, advice } = splitStyleProfile(StyleProfileSchema.parse(FIXTURE_STYLE_PROFILE));
  const styleProfile = must(
    await db
      .from("style_profiles")
      .insert({
        user_id: userId,
        version: 1,
        profile_json: toJson(core),
        active: true,
      })
      .select("id")
      .single(),
    "style profile",
  );
  must(
    await db
      .from("style_advice")
      .insert({ style_profile_id: styleProfile.id, user_id: userId, advice_json: toJson(advice) })
      .select("style_profile_id"),
    "style advice",
  );
  const looks = must(
    await db
      .from("looks")
      .insert(
        FIXTURE_LOOK_SPECS.map((spec, i) => ({
          user_id: userId,
          style_profile_id: styleProfile.id,
          name: spec.name,
          position: i + 1,
          status: "READY" as const,
          spec_json: toJson(LookSpecSchema.parse(spec)),
        })),
      )
      .select("id, position")
      .order("position"),
    "looks",
  );
  must(
    await db.from("profiles").update({ onboarding_completed: true }).eq("id", userId).select("id"),
    "perfil",
  );
  return { styleProfileId: styleProfile.id, lookIds: looks.map((l) => l.id) };
}

async function main() {
  const productIds = await seedProducts();
  const productId = (key: string) => {
    const id = productIds.get(key);
    if (!id) throw new Error(`[seed] producto ${key} no existe`);
    return id;
  };

  const premiumId = await recreateUser(db, USERS.premium.email, USERS.premium.displayName);
  const freeId = await recreateUser(db, USERS.free.email, USERS.free.displayName);
  const adminId = await recreateUser(db, USERS.admin.email, USERS.admin.displayName);

  must(
    await db.from("profiles").update({ role: "admin" }).eq("id", adminId).select("id"),
    "rol admin",
  );

  const premium = await seedStyle(premiumId);
  await seedStyle(freeId);
  const [look1, look2] = premium.lookIds;
  if (!look1 || !look2) throw new Error("[seed] faltan looks");

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  must(
    await db
      .from("subscriptions")
      .insert({
        user_id: premiumId,
        provider: "MOCK",
        provider_subscription_id: `mock_sub_${premiumId.slice(0, 8)}`,
        status: "ACTIVE",
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
      })
      .select("id"),
    "suscripción",
  );

  must(
    await db
      .from("look_products")
      .insert([
        {
          look_id: look1,
          product_id: productId("mock-oxford-crudo"),
          garment_slot: "top",
          rank: 1,
          score: 0.92,
        },
        {
          look_id: look1,
          product_id: productId("mock-oxford-blanca"),
          garment_slot: "top",
          rank: 2,
          score: 0.71,
        },
        {
          look_id: look1,
          product_id: productId("mock-chino-oliva"),
          garment_slot: "bottom",
          rank: 1,
          score: 0.9,
        },
        {
          look_id: look1,
          product_id: productId("mock-overshirt-camel"),
          garment_slot: "layering:0",
          rank: 1,
          score: 0.84,
        },
        {
          look_id: look1,
          product_id: productId("mock-desert-boots"),
          garment_slot: "shoes",
          rank: 1,
          score: 0.8,
        },
      ])
      .select("id"),
    "look_products",
  );

  must(
    await db
      .from("favorites")
      .insert([
        { user_id: premiumId, look_id: look1 },
        { user_id: premiumId, product_id: productId("mock-chino-oliva") },
      ])
      .select("id"),
    "favoritos",
  );

  const cart = must(
    await db.from("carts").insert({ user_id: premiumId }).select("id").single(),
    "carrito",
  );
  must(
    await db
      .from("cart_items")
      .insert([
        {
          cart_id: cart.id,
          product_id: productId("mock-oxford-crudo"),
          quantity: 1,
          price_amount_snapshot: 0,
          currency_snapshot: "UYU",
        },
        {
          cart_id: cart.id,
          product_id: productId("mock-desert-boots"),
          quantity: 1,
          price_amount_snapshot: 0,
          currency_snapshot: "UYU",
        },
      ])
      .select("id"),
    "items del carrito",
  );

  const thread = must(
    await db
      .from("chat_threads")
      .insert({ user_id: premiumId, look_id: look2, title: "Look para un casamiento" })
      .select("id")
      .single(),
    "chat",
  );
  must(
    await db
      .from("chat_messages")
      .insert([
        {
          thread_id: thread.id,
          user_id: premiumId,
          role: "user",
          content: "¿Puedo usar el look 2 en un casamiento de día?",
        },
        {
          thread_id: thread.id,
          user_id: premiumId,
          role: "assistant",
          content: "Sí: cambiá el sweater por una camisa crudo y sumá un blazer gris topo.",
        },
      ])
      .select("id"),
    "mensajes",
  );

  // Historial para el panel de admin. En inserts múltiples PostgREST completa las
  // columnas faltantes con null (no con el default): cada fila lleva todas las columnas.
  must(
    await db
      .from("jobs")
      .insert([
        {
          type: "ANALYZE_STYLE_PROFILE",
          status: "COMPLETED",
          user_id: premiumId,
          attempts: 1,
          finished_at: now.toISOString(),
          payload: {},
        },
        {
          type: "GENERATE_LOOK",
          status: "FAILED",
          user_id: freeId,
          attempts: 3,
          finished_at: now.toISOString(),
          last_error: "mock: fallo simulado",
          payload: {},
        },
      ])
      .select("id"),
    "jobs",
  );
  must(
    await db
      .from("ai_usage")
      .insert([
        {
          user_id: premiumId,
          operation: "ANALYZE_STYLE_PROFILE",
          provider: "mock",
          model: "mock-vision-1",
          input_tokens: 1200,
          output_tokens: 800,
          image_count: 0,
          estimated_cost_usd: 0.012,
          duration_ms: 40,
        },
        {
          user_id: premiumId,
          operation: "GENERATE_LOOK_IMAGE",
          provider: "mock",
          model: "mock-image-1",
          input_tokens: 300,
          output_tokens: 0,
          image_count: 3,
          estimated_cost_usd: 0.12,
          duration_ms: 90,
        },
      ])
      .select("id"),
    "ai_usage",
  );
  const events = [
    "landing_view",
    "signup_started",
    "signup_completed",
    "analysis_completed",
    "paywall_viewed",
    "checkout_started",
    "subscription_started",
  ].map((name) => ({
    name: AnalyticsEventNameSchema.parse(name),
    user_id: premiumId,
    properties: { seed: true },
  }));
  must(await db.from("analytics_events").insert(events).select("id"), "analytics");

  console.log("[seed] Listo. Usuarios ficticios:");
  for (const user of Object.values(USERS)) console.log(`  - ${user.email}`);
  console.log("[seed] Contraseña: SEED_USER_PASSWORD o la default documentada en README.md.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
