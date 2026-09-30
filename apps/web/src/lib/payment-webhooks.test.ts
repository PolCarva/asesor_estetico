import type { TypedSupabaseClient } from "@asesor/db";
import { MockPaymentProvider, PREMIUM_PLAN_ID } from "@asesor/payments";
import { describe, expect, it } from "vitest";

import { processPaymentWebhook } from "./payment-webhooks";

/** DB falsa con lo mínimo que usa el procesador: payment_events y subscriptions. */
function fakeDb(subscription: { id: string; status: string } | null) {
  const events = new Map<string, { id: string; status: string }>();
  const subscriptionUpdates: Record<string, unknown>[] = [];

  const from = (table: string) => {
    if (table === "payment_events") {
      return {
        upsert: (row: { provider: string; event_id: string }) => ({
          select: async () => {
            const key = `${row.provider}:${row.event_id}`;
            if (events.has(key)) return { data: [], error: null };
            const created = { id: crypto.randomUUID(), status: "RECEIVED" };
            events.set(key, created);
            return { data: [{ id: created.id }], error: null };
          },
        }),
        update: (values: { status: string }) => ({
          eq: async (_col: string, id: string) => {
            for (const e of events.values()) if (e.id === id) e.status = values.status;
            return { error: null };
          },
        }),
      };
    }
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: subscription, error: null }),
      update: (values: Record<string, unknown>) => ({
        eq: async () => {
          subscriptionUpdates.push(values);
          return { error: null };
        },
      }),
    };
    return chain;
  };
  return { db: { from } as unknown as TypedSupabaseClient, events, subscriptionUpdates };
}

async function setup() {
  const provider = new MockPaymentProvider({ webhookSecret: "secret" });
  const sub = await provider.createSubscription({
    userId: crypto.randomUUID(),
    email: "a@example.test",
    planId: PREMIUM_PLAN_ID,
    returnUrl: "http://localhost",
  });
  const rawBody = JSON.stringify({
    id: "evt_1",
    type: "subscription.updated",
    subscription_id: sub.providerSubscriptionId,
  });
  const request = { rawBody, headers: { "x-mock-signature": provider.sign(rawBody) }, query: {} };
  return { provider, sub, request };
}

describe("processPaymentWebhook", () => {
  it("rechaza firmas inválidas con 401", async () => {
    const { provider, request } = await setup();
    const { db } = fakeDb(null);
    const outcome = await processPaymentWebhook({
      provider,
      db,
      request: { ...request, headers: { "x-mock-signature": "bad" } },
    });
    expect(outcome.status).toBe(401);
  });

  it("es idempotente: el mismo evento se procesa una sola vez", async () => {
    const { provider, sub, request } = await setup();
    provider.simulatePayment(sub.providerSubscriptionId);
    const { db, subscriptionUpdates } = fakeDb({ id: "s1", status: "PENDING" });
    const first = await processPaymentWebhook({ provider, db, request });
    const second = await processPaymentWebhook({ provider, db, request });
    expect(first.body).toMatchObject({ status: "PROCESSED" });
    expect(second.body).toMatchObject({ duplicate: true });
    expect(subscriptionUpdates).toHaveLength(1);
    expect(subscriptionUpdates[0]).toMatchObject({ status: "ACTIVE" });
  });

  it("no toca la suscripción si el proveedor no confirma el estado", async () => {
    const { provider, request } = await setup();
    const rawBody = JSON.stringify({
      id: "evt_2",
      type: "subscription.updated",
      subscription_id: "desconocida",
    });
    const { db, subscriptionUpdates, events } = fakeDb({ id: "s1", status: "PENDING" });
    const outcome = await processPaymentWebhook({
      provider,
      db,
      request: { ...request, rawBody, headers: { "x-mock-signature": provider.sign(rawBody) } },
    });
    expect(outcome.body).toMatchObject({ status: "IGNORED" });
    expect(subscriptionUpdates).toHaveLength(0);
    expect([...events.values()][0]?.status).toBe("IGNORED");
  });
});
