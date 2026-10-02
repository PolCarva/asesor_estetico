import { AppError } from "@asesor/shared";
import { describe, expect, it } from "vitest";

import {
  getCurrentUser,
  requireAdmin,
  requireAuth,
  requirePremium,
  requireResourceOwner,
} from "../src/auth";
import type { TypedSupabaseClient } from "../src/types";

/** Cliente falso mínimo: auth.getUser() y una consulta encadenable que resuelve `rows`. */
function fakeClient(options: {
  user?: { id: string; email?: string } | null;
  rows?: Record<string, unknown>;
}) {
  const query = (table: string) => {
    const result = { data: options.rows?.[table] ?? null, error: null };
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "gt", "order", "limit"])
      chain[method] = () => chain;
    chain.maybeSingle = async () => result;
    return chain;
  };
  return {
    auth: {
      getUser: async () =>
        options.user
          ? { data: { user: options.user }, error: null }
          : { data: { user: null }, error: new Error("no session") },
    },
    from: query,
  } as unknown as TypedSupabaseClient;
}

const user = { id: "11111111-1111-4111-8111-111111111111", email: "demo@example.test" };

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toSatisfy((e) => e instanceof AppError && e.code === code);
}

describe("auth helpers", () => {
  it("getCurrentUser devuelve null sin sesión", async () => {
    expect(await getCurrentUser(fakeClient({ user: null }))).toBeNull();
    expect(await getCurrentUser(fakeClient({ user }))).toEqual(user);
  });

  it("requireAuth exige sesión", async () => {
    await expectCode(requireAuth(fakeClient({ user: null })), "AUTH_REQUIRED");
    await expect(requireAuth(fakeClient({ user }))).resolves.toEqual(user);
  });

  it("requirePremium exige suscripción vigente", async () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const active = { status: "ACTIVE", current_period_end: "2026-06-30T00:00:00Z" };
    const expired = { status: "ACTIVE", current_period_end: "2026-05-01T00:00:00Z" };
    const cancelledInPeriod = { status: "CANCELLED", current_period_end: "2026-06-10T00:00:00Z" };
    const pastDue = { status: "PAST_DUE", current_period_end: "2026-06-30T00:00:00Z" };

    await expectCode(requirePremium(fakeClient({ user }), now), "PREMIUM_REQUIRED");
    await expectCode(
      requirePremium(fakeClient({ user, rows: { subscriptions: expired } }), now),
      "PREMIUM_REQUIRED",
    );
    await expectCode(
      requirePremium(fakeClient({ user, rows: { subscriptions: pastDue } }), now),
      "PREMIUM_REQUIRED",
    );
    await expect(
      requirePremium(fakeClient({ user, rows: { subscriptions: active } }), now),
    ).resolves.toMatchObject({ id: user.id });
    await expect(
      requirePremium(fakeClient({ user, rows: { subscriptions: cancelledInPeriod } }), now),
    ).resolves.toMatchObject({ id: user.id });
  });

  it("requireAdmin exige rol admin", async () => {
    await expectCode(
      requireAdmin(fakeClient({ user, rows: { profiles: { role: "user" } } })),
      "FORBIDDEN",
    );
    await expect(
      requireAdmin(fakeClient({ user, rows: { profiles: { role: "admin" } } })),
    ).resolves.toEqual(user);
  });

  it("requireResourceOwner responde NOT_FOUND ante recursos ajenos o inexistentes", () => {
    const own = { id: "r1", user_id: user.id };
    expect(requireResourceOwner(own, user.id)).toBe(own);
    expect(() => requireResourceOwner({ id: "r2", user_id: "otro" }, user.id)).toThrowError(
      AppError,
    );
    try {
      requireResourceOwner(null, user.id);
    } catch (error) {
      expect((error as AppError).code).toBe("NOT_FOUND");
    }
  });
});
