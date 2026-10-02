import { afterAll, beforeAll, expect, it } from "vitest";

import { getLatestSubscription, getPremiumSubscription, requirePremium } from "../../src/auth";
import { isUserPremium } from "../../src/pipeline";
import { adminClient, createTestUser, deleteTestUser, describeIntegration } from "./setup";

/**
 * La regla Premium vive en dos lugares (paso 11): `getPremiumSubscription` / `requirePremium` /
 * `isUserPremium` en TypeScript y `current_user_is_premium()` en SQL (RLS). Con varias
 * suscripciones tienen que responder lo mismo.
 */
describeIntegration("Premium: la misma respuesta en TypeScript y en la RLS", () => {
  const admin = adminClient();
  const day = 86_400_000;
  type User = Awaited<ReturnType<typeof createTestUser>>;
  let mixed: User;
  let lapsed: User;

  async function subscription(userId: string, status: string, endsInDays: number, n: number) {
    const { error } = await admin.from("subscriptions").insert({
      user_id: userId,
      provider: "MOCK",
      provider_subscription_id: `test-${userId}-${n}`,
      status: status as "ACTIVE",
      current_period_start: new Date(Date.now() - 30 * day).toISOString(),
      current_period_end: new Date(Date.now() + endsInDays * day).toISOString(),
    });
    expect(error).toBeNull();
  }
  const sqlPremium = async (user: User) => {
    const { data, error } = await user.client.rpc("current_user_is_premium");
    expect(error).toBeNull();
    return data;
  };

  beforeAll(async () => {
    mixed = await createTestUser("premium-mixed");
    lapsed = await createTestUser("premium-lapsed");
    // La más reciente por fin de período está EXPIRED, pero otra ACTIVE sigue vigente.
    await subscription(mixed.id, "ACTIVE", 10, 1);
    await subscription(mixed.id, "EXPIRED", 20, 2);
    // Ninguna vigente: una vencida y otra cancelada que ya terminó.
    await subscription(lapsed.id, "ACTIVE", -1, 1);
    await subscription(lapsed.id, "CANCELLED", -2, 2);
  });

  afterAll(async () => {
    for (const user of [mixed, lapsed]) if (user) await deleteTestUser(user.id);
  });

  it("con una suscripción vigente entre varias, es Premium en los dos lados", async () => {
    expect((await getLatestSubscription(admin, mixed.id))?.status).toBe("EXPIRED");
    expect((await getPremiumSubscription(admin, mixed.id))?.status).toBe("ACTIVE");
    await expect(requirePremium(mixed.client)).resolves.toMatchObject({ id: mixed.id });
    expect(await isUserPremium(admin, mixed.id)).toBe(true);
    expect(await sqlPremium(mixed)).toBe(true);
  });

  it("sin ninguna vigente, no es Premium en ningún lado", async () => {
    expect(await getPremiumSubscription(admin, lapsed.id)).toBeNull();
    await expect(requirePremium(lapsed.client)).rejects.toMatchObject({
      code: "PREMIUM_REQUIRED",
    });
    expect(await isUserPremium(admin, lapsed.id)).toBe(false);
    expect(await sqlPremium(lapsed)).toBe(false);
  });
});
