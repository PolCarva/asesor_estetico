import { FIXTURE_IN_STORE_PRODUCT } from "@asesor/shared/fixtures";
import { afterAll, beforeAll, expect, it } from "vitest";

import { toJson } from "../../src/types";
import { adminClient, createTestUser, deleteTestUser, describeIntegration } from "./setup";

/**
 * Precio de los productos (paso 04b, D10): solo un local físico (`IN_STORE_ONLY`) puede no
 * publicar precio, y un producto sin precio no entra al carrito.
 */
describeIntegration("products: precio opcional solo en locales físicos", () => {
  const admin = adminClient();
  const created: string[] = [];
  let user: Awaited<ReturnType<typeof createTestUser>>;

  const row = (overrides: Record<string, unknown>) => ({
    external_id: `test-${crypto.randomUUID()}`,
    store_name: FIXTURE_IN_STORE_PRODUCT.store.name,
    store_domain: FIXTURE_IN_STORE_PRODUCT.store.domain,
    url: `https://sombrereria.ficticia.test/p/${crypto.randomUUID()}`,
    title: FIXTURE_IN_STORE_PRODUCT.title,
    category: FIXTURE_IN_STORE_PRODUCT.category,
    availability: "IN_STORE_ONLY" as const,
    price_amount: null,
    currency: null,
    data_json: toJson(FIXTURE_IN_STORE_PRODUCT),
    ...overrides,
  });

  async function insert(overrides: Record<string, unknown>) {
    const { data, error } = await admin
      .from("products")
      .insert(row(overrides))
      .select("id")
      .single();
    if (data) created.push(data.id);
    return { data, error };
  }

  beforeAll(async () => {
    user = await createTestUser("in-store");
  });

  afterAll(async () => {
    if (created.length) await admin.from("products").delete().in("id", created);
    await deleteTestUser(user.id);
  });

  it("un local físico puede no tener precio ni moneda", async () => {
    const { error } = await insert({});
    expect(error).toBeNull();
  });

  it("un producto online sin precio se rechaza (nunca se inventa)", async () => {
    for (const availability of ["IN_STOCK", "OUT_OF_STOCK", "UNKNOWN"]) {
      const { error } = await insert({ availability });
      expect(error?.message).toMatch(/products_price_known/);
    }
  });

  it("precio y moneda van juntos", async () => {
    expect((await insert({ price_amount: 2490 })).error?.message).toMatch(/products_price_known/);
    expect((await insert({ currency: "UYU" })).error?.message).toMatch(/products_price_known/);
    expect((await insert({ price_amount: 2490, currency: "UYU" })).error).toBeNull();
  });

  it("el carrito no acepta un producto sin precio (error explícito del trigger)", async () => {
    const product = await insert({});
    await admin.from("subscriptions").insert({
      user_id: user.id,
      provider: "MOCK",
      provider_subscription_id: `test-${user.id}`,
      status: "ACTIVE",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const { data: cart } = await admin
      .from("carts")
      .insert({ user_id: user.id })
      .select("id")
      .single();
    // El precio del ítem lo fija el trigger (el cliente no puede escribirlo), por eso no va
    // en el insert.
    const { error } = await user.client
      .from("cart_items")
      .insert({ cart_id: cart!.id, product_id: product.data!.id, quantity: 1 });
    expect(error?.message).toMatch(/has no price/);
  });
});
