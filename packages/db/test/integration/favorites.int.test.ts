import { splitStyleProfile } from "@asesor/shared";
import {
  FIXTURE_LOOK_SPECS,
  FIXTURE_PRODUCTS,
  FIXTURE_STYLE_PROFILE,
} from "@asesor/shared/fixtures";
import { afterAll, beforeAll, expect, it } from "vitest";

import { removeFavorite, saveFavorite } from "../../src/favorites";
import { upsertProducts } from "../../src/shopping";
import { toJson } from "../../src/types";
import { adminClient, createTestUser, deleteTestUser, describeIntegration } from "./setup";

/**
 * Guardados (paso 10a, D19): los looks se guardan con cualquier plan; los productos son
 * Premium (en la RLS y en `saveFavorite` / `removeFavorite`). Sin duplicados ni IDOR.
 */
describeIntegration("guardados: looks para todos, productos Premium", () => {
  const admin = adminClient();
  const tag = crypto.randomUUID().slice(0, 8);
  type User = Awaited<ReturnType<typeof createTestUser>>;
  let free: User;
  let premium: User;
  let freeLooks: string[] = [];
  let premiumLooks: string[] = [];
  let productId = "";

  async function createLooks(userId: string) {
    const { core, advice } = splitStyleProfile(FIXTURE_STYLE_PROFILE);
    const { data, error } = await admin.rpc("create_style_profile_with_looks", {
      p_user_id: userId,
      p_profile: toJson(core),
      p_advice: toJson(advice),
      p_looks: toJson(FIXTURE_LOOK_SPECS),
    });
    expect(error).toBeNull();
    return data!.sort((a, b) => a.look_position - b.look_position).map((r) => r.look_id);
  }

  const favoritesOf = async (userId: string) =>
    (await admin.from("favorites").select("look_id, product_id").eq("user_id", userId)).data ?? [];

  beforeAll(async () => {
    free = await createTestUser("fav-free");
    premium = await createTestUser("fav-premium");
    freeLooks = await createLooks(free.id);
    premiumLooks = await createLooks(premium.id);
    await admin.from("subscriptions").insert({
      user_id: premium.id,
      provider: "MOCK",
      provider_subscription_id: `test-${premium.id}`,
      status: "ACTIVE",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const base = FIXTURE_PRODUCTS[0]!;
    const ids = await upsertProducts(admin, [
      { ...base, id: `${base.id}-${tag}`, url: `${base.url}-${tag}`, variants: [] },
    ]);
    productId = [...ids.values()][0]!;
  });

  afterAll(async () => {
    for (const user of [free, premium]) if (user) await deleteTestUser(user.id);
    await admin.from("products").delete().like("url", `%-${tag}`);
  });

  it("un usuario free guarda y quita su look, sin duplicar", async () => {
    const first = await saveFavorite({
      userClient: free.client,
      target: { lookId: freeLooks[0]! },
    });
    expect(first).toMatchObject({ alreadySaved: false, storeDomain: null });
    const again = await saveFavorite({
      userClient: free.client,
      target: { lookId: freeLooks[0]! },
    });
    expect(again).toEqual({ ...first, alreadySaved: true });
    expect(await favoritesOf(free.id)).toEqual([{ look_id: freeLooks[0], product_id: null }]);

    expect(
      await removeFavorite({ userClient: free.client, target: { lookId: freeLooks[0]! } }),
    ).toEqual({ removed: true });
    expect(
      await removeFavorite({ userClient: free.client, target: { lookId: freeLooks[0]! } }),
    ).toEqual({ removed: false });
  });

  it("un free no guarda un look bloqueado ni uno ajeno", async () => {
    // El look 2 es Premium: la RLS no se lo deja leer.
    await expect(
      saveFavorite({ userClient: free.client, target: { lookId: freeLooks[1]! } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      saveFavorite({ userClient: free.client, target: { lookId: premiumLooks[0]! } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Tampoco salteando la lógica (IDOR en la política de insert).
    const direct = await free.client
      .from("favorites")
      .insert({ user_id: free.id, look_id: premiumLooks[0] });
    expect(direct.error?.code).toBe("42501");
    expect(await favoritesOf(free.id)).toEqual([]);
  });

  it("los productos guardados exigen Premium", async () => {
    await expect(
      saveFavorite({ userClient: free.client, target: { productId } }),
    ).rejects.toMatchObject({ code: "PREMIUM_REQUIRED" });
    const direct = await free.client
      .from("favorites")
      .insert({ user_id: free.id, product_id: productId });
    expect(direct.error?.code).toBe("42501");
    await expect(
      removeFavorite({ userClient: free.client, target: { productId } }),
    ).rejects.toMatchObject({ code: "PREMIUM_REQUIRED" });
    expect(await favoritesOf(free.id)).toEqual([]);
  });

  it("Premium guarda y quita un producto, sin duplicar", async () => {
    const saved = await saveFavorite({ userClient: premium.client, target: { productId } });
    expect(saved).toMatchObject({
      alreadySaved: false,
      storeDomain: FIXTURE_PRODUCTS[0]!.store.domain,
    });
    expect(
      (await saveFavorite({ userClient: premium.client, target: { productId } })).alreadySaved,
    ).toBe(true);
    // Premium también guarda sus looks Premium.
    await saveFavorite({ userClient: premium.client, target: { lookId: premiumLooks[2]! } });
    expect(await favoritesOf(premium.id)).toHaveLength(2);

    expect(await removeFavorite({ userClient: premium.client, target: { productId } })).toEqual({
      removed: true,
    });
    expect(await favoritesOf(premium.id)).toEqual([{ look_id: premiumLooks[2], product_id: null }]);
  });

  it("un producto inexistente o un id inválido no se guardan", async () => {
    await expect(
      saveFavorite({ userClient: premium.client, target: { productId: crypto.randomUUID() } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      saveFavorite({ userClient: premium.client, target: { lookId: "no-es-un-uuid" } }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});
