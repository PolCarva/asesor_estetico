import { describe, expect, it } from "vitest";

import {
  canTransition,
  hmacSha256Hex,
  MercadoPagoProvider,
  MockPaymentProvider,
  PaymentError,
  PREMIUM_PLAN_ID,
  transitionSubscription,
  verifyMercadoPagoSignature,
} from "../src";
import { hmacSha256Hex as sign } from "../src/signature";

const USER = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-06-01T12:00:00.000Z");

describe("MockPaymentProvider", () => {
  const create = (provider: MockPaymentProvider) =>
    provider.createSubscription({
      userId: USER,
      email: "demo@example.test",
      planId: PREMIUM_PLAN_ID,
      returnUrl: "http://localhost:3000/app",
    });

  it("crea PENDING, activa al pagar y cancela", async () => {
    const provider = new MockPaymentProvider({ webhookSecret: "s", now: () => now });
    const sub = await create(provider);
    expect(sub.status).toBe("PENDING");
    const active = provider.simulatePayment(sub.providerSubscriptionId);
    expect(active.status).toBe("ACTIVE");
    expect(active.currentPeriodEnd).toBe("2026-07-01T12:00:00.000Z");
    expect((await provider.cancelSubscription(sub.providerSubscriptionId)).status).toBe(
      "CANCELLED",
    );
    await expect(provider.getSubscription("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("webhook: rechaza firmas inválidas y confirma el estado consultando al proveedor", async () => {
    const provider = new MockPaymentProvider({ webhookSecret: "s", now: () => now });
    const sub = await create(provider);
    provider.simulatePayment(sub.providerSubscriptionId);
    // El body dice cualquier cosa sobre el estado: se ignora.
    const rawBody = JSON.stringify({
      id: "evt_1",
      type: "subscription.updated",
      subscription_id: sub.providerSubscriptionId,
      status: "EXPIRED",
    });

    await expect(
      provider.handleWebhook({ rawBody, headers: { "x-mock-signature": "00" }, query: {} }),
    ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });

    const result = await provider.handleWebhook({
      rawBody,
      headers: { "x-mock-signature": provider.sign(rawBody) },
      query: {},
    });
    expect(result).toMatchObject({ eventId: "evt_1", confirmed: { status: "ACTIVE" } });
  });
});

describe("transiciones de suscripción", () => {
  it("permite solo transiciones válidas", () => {
    expect(canTransition("PENDING", "ACTIVE")).toBe(true);
    expect(canTransition("ACTIVE", "PAST_DUE")).toBe(true);
    expect(canTransition("EXPIRED", "ACTIVE")).toBe(false);
    expect(canTransition("FREE", "ACTIVE")).toBe(false);
    expect(() => transitionSubscription("EXPIRED", "ACTIVE")).toThrowError(PaymentError);
  });
});

describe("Mercado Pago", () => {
  const secret = "mp-test-secret";
  const ts = String(Math.floor(now.getTime() / 1000));
  const manifest = `id:123456;request-id:req-1;ts:${ts};`;
  const header = `ts=${ts},v1=${sign(secret, manifest)}`;

  it("verifica x-signature", () => {
    const base = { secret, requestId: "req-1", dataId: "123456", now: now.getTime() };
    expect(verifyMercadoPagoSignature({ ...base, signatureHeader: header })).toBe(true);
    expect(verifyMercadoPagoSignature({ ...base, signatureHeader: header, dataId: "999" })).toBe(
      false,
    );
    expect(
      verifyMercadoPagoSignature({
        ...base,
        signatureHeader: `ts=${ts},v1=${hmacSha256Hex("otro", manifest)}`,
      }),
    ).toBe(false);
    // Firma vieja (replay).
    expect(
      verifyMercadoPagoSignature({
        ...base,
        signatureHeader: header,
        now: now.getTime() + 10 * 60_000,
      }),
    ).toBe(false);
  });

  it("un webhook válido nunca confirma Premium sin consultar la API", async () => {
    const provider = new MercadoPagoProvider({ webhookSecret: secret, now: () => now.getTime() });
    const rawBody = JSON.stringify({
      id: 99,
      type: "subscription_preapproval",
      action: "updated",
      data: { id: "123456" },
    });
    const result = await provider.handleWebhook({
      rawBody,
      headers: { "x-signature": header, "x-request-id": "req-1" },
      query: { "data.id": "123456" },
    });
    expect(result).toEqual({
      eventId: "99",
      eventType: "subscription_preapproval.updated",
      providerSubscriptionId: "123456",
      confirmed: null,
    });
  });

  it("sin secreto configurado no procesa nada y no hace llamadas reales", async () => {
    await expect(
      new MercadoPagoProvider({}).handleWebhook({ rawBody: "{}", headers: {}, query: {} }),
    ).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    await expect(
      new MercadoPagoProvider({ accessToken: "x" }).getSubscription(),
    ).rejects.toMatchObject({ code: "NOT_IMPLEMENTED" });
  });
});
