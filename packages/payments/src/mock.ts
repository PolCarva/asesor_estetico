import { z } from "zod";

import { hmacSha256Hex, safeEqualHex } from "./signature";
import { transitionSubscription } from "./status";
import {
  type CreateSubscriptionInput,
  type CreateSubscriptionResult,
  PaymentError,
  type PaymentProvider,
  type ProviderSubscription,
  type WebhookRequest,
  type WebhookResult,
} from "./types";

const MockWebhookSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  subscription_id: z.string().min(1),
});

const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Proveedor de pagos en memoria para desarrollo y tests. Nunca cobra.
 * Firma webhooks con HMAC-SHA256 del body (header x-mock-signature).
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "MOCK" as const;
  private readonly subscriptions = new Map<string, ProviderSubscription>();
  private counter = 0;

  constructor(
    private readonly options: { webhookSecret: string; now?: () => Date } = {
      webhookSecret: "mock-webhook-secret",
    },
  ) {}

  private now() {
    return this.options.now?.() ?? new Date();
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult> {
    this.counter += 1;
    const sub: ProviderSubscription = {
      providerSubscriptionId: `mock_sub_${input.userId.slice(0, 8)}_${this.counter}`,
      status: "PENDING",
      currentPeriodStart: null,
      currentPeriodEnd: null,
    };
    this.subscriptions.set(sub.providerSubscriptionId, sub);
    return { ...sub, checkoutUrl: null };
  }

  async getSubscription(id: string): Promise<ProviderSubscription> {
    const sub = this.subscriptions.get(id);
    if (!sub) throw new PaymentError("NOT_FOUND", `Suscripción ${id} inexistente.`);
    return { ...sub };
  }

  async cancelSubscription(id: string): Promise<ProviderSubscription> {
    const sub = await this.getSubscription(id);
    const updated = { ...sub, status: transitionSubscription(sub.status, "CANCELLED") };
    this.subscriptions.set(id, updated);
    return { ...updated };
  }

  /** Simula que el usuario pagó en el checkout. Solo existe en el mock. */
  simulatePayment(id: string): ProviderSubscription {
    const sub = this.subscriptions.get(id);
    if (!sub) throw new PaymentError("NOT_FOUND", `Suscripción ${id} inexistente.`);
    const start = this.now();
    const updated: ProviderSubscription = {
      ...sub,
      status: transitionSubscription(sub.status, "ACTIVE"),
      currentPeriodStart: start.toISOString(),
      currentPeriodEnd: new Date(start.getTime() + PERIOD_MS).toISOString(),
    };
    this.subscriptions.set(id, updated);
    return { ...updated };
  }

  /** Firma un body como lo haría el proveedor (para tests y scripts locales). */
  sign(rawBody: string) {
    return hmacSha256Hex(this.options.webhookSecret, rawBody);
  }

  async handleWebhook(request: WebhookRequest): Promise<WebhookResult> {
    const signature = request.headers["x-mock-signature"] ?? "";
    if (!safeEqualHex(signature, this.sign(request.rawBody))) {
      throw new PaymentError("INVALID_SIGNATURE", "Firma inválida.");
    }
    let body: z.infer<typeof MockWebhookSchema>;
    try {
      body = MockWebhookSchema.parse(JSON.parse(request.rawBody));
    } catch (error) {
      throw new PaymentError("INVALID_PAYLOAD", "Payload inválido.", { cause: error });
    }
    // El estado se confirma consultando al "proveedor", no leyendo el body.
    const confirmed = this.subscriptions.has(body.subscription_id)
      ? await this.getSubscription(body.subscription_id)
      : null;
    return {
      eventId: body.id,
      eventType: body.type,
      providerSubscriptionId: body.subscription_id,
      confirmed,
    };
  }
}
