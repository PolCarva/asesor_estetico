import type { PaymentProviderName, SubscriptionStatus } from "@asesor/shared";

export const PREMIUM_PLAN_ID = "premium_monthly";

export interface ProviderSubscription {
  providerSubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
}

export interface CreateSubscriptionInput {
  userId: string;
  email: string;
  planId: typeof PREMIUM_PLAN_ID;
  /** URL a la que vuelve el usuario después del checkout. */
  returnUrl: string;
}

export interface CreateSubscriptionResult extends ProviderSubscription {
  /** URL de checkout del proveedor (null si no hace falta redirigir). */
  checkoutUrl: string | null;
}

export interface WebhookRequest {
  rawBody: string;
  headers: Record<string, string | null | undefined>;
  query: Record<string, string | null | undefined>;
}

export interface WebhookResult {
  /** Identificador único del evento: clave de idempotencia junto con el proveedor. */
  eventId: string;
  eventType: string;
  providerSubscriptionId: string | null;
  /**
   * Estado confirmado consultando al proveedor. Solo si no es null se puede
   * actualizar la suscripción. Nunca se confía en el body del webhook.
   */
  confirmed: ProviderSubscription | null;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult>;
  getSubscription(providerSubscriptionId: string): Promise<ProviderSubscription>;
  cancelSubscription(providerSubscriptionId: string): Promise<ProviderSubscription>;
  /** Verifica la firma y devuelve el evento. Lanza PaymentError("INVALID_SIGNATURE") si no es auténtico. */
  handleWebhook(request: WebhookRequest): Promise<WebhookResult>;
}

export type PaymentErrorCode =
  | "INVALID_SIGNATURE"
  | "INVALID_PAYLOAD"
  | "NOT_FOUND"
  | "INVALID_TRANSITION"
  | "NOT_CONFIGURED"
  | "NOT_IMPLEMENTED";

export class PaymentError extends Error {
  readonly code: PaymentErrorCode;
  constructor(code: PaymentErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PaymentError";
    this.code = code;
  }
}
