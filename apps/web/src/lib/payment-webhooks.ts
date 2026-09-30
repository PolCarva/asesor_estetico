import "server-only";

import { type Json, toJson, type TypedSupabaseClient } from "@asesor/db";
import {
  PaymentError,
  type PaymentProvider,
  transitionSubscription,
  type WebhookRequest,
} from "@asesor/payments";

import { getLogger } from "./logger";

export interface WebhookOutcome {
  status: number;
  body: Record<string, unknown>;
}

const ERROR_STATUS: Partial<Record<PaymentError["code"], number>> = {
  INVALID_SIGNATURE: 401,
  INVALID_PAYLOAD: 400,
  NOT_CONFIGURED: 503,
};

/**
 * Procesa un webhook de pagos:
 * 1. el proveedor verifica la firma (si no, 401);
 * 2. idempotencia: payment_events tiene unique(provider, event_id); un evento repetido no se reprocesa;
 * 3. solo se toca la suscripción si el proveedor CONFIRMÓ el estado consultando su API.
 *    Nunca se activa Premium a partir del body del webhook.
 */
export async function processPaymentWebhook(input: {
  provider: PaymentProvider;
  db: TypedSupabaseClient;
  request: WebhookRequest;
}): Promise<WebhookOutcome> {
  const logger = getLogger().child({ provider: input.provider.name });

  let event;
  try {
    event = await input.provider.handleWebhook(input.request);
  } catch (error) {
    if (error instanceof PaymentError && ERROR_STATUS[error.code]) {
      logger.warn("webhook rechazado", { code: error.code });
      return { status: ERROR_STATUS[error.code]!, body: { error: error.code } };
    }
    throw error;
  }

  // La firma ya fue verificada: el body es JSON válido del proveedor.
  let payload: NonNullable<Json>;
  try {
    payload = toJson(JSON.parse(input.request.rawBody) ?? {});
  } catch {
    payload = {};
  }

  const { data: inserted, error } = await input.db
    .from("payment_events")
    .upsert(
      {
        provider: input.provider.name,
        event_id: event.eventId,
        event_type: event.eventType,
        payload,
      },
      { onConflict: "provider,event_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(`payment_events: ${error.message}`);

  const eventRow = inserted?.[0];
  if (!eventRow) {
    logger.info("webhook duplicado ignorado", { eventId: event.eventId });
    return { status: 200, body: { received: true, duplicate: true } };
  }

  const finish = async (status: "PROCESSED" | "IGNORED" | "FAILED", note: string | null) => {
    await input.db
      .from("payment_events")
      .update({ status, error: note, processed_at: new Date().toISOString() })
      .eq("id", eventRow.id);
    return { status: 200, body: { received: true, status } };
  };

  if (!event.confirmed) {
    return finish("IGNORED", "Estado no confirmado por el proveedor.");
  }

  const { data: subscription } = await input.db
    .from("subscriptions")
    .select("id, status")
    .eq("provider", input.provider.name)
    .eq("provider_subscription_id", event.confirmed.providerSubscriptionId)
    .maybeSingle();
  if (!subscription) return finish("IGNORED", "Suscripción desconocida.");

  try {
    const status = transitionSubscription(subscription.status, event.confirmed.status);
    const { error: updateError } = await input.db
      .from("subscriptions")
      .update({
        status,
        current_period_start: event.confirmed.currentPeriodStart,
        current_period_end: event.confirmed.currentPeriodEnd,
      })
      .eq("id", subscription.id);
    if (updateError) throw new Error(updateError.message);
    return finish("PROCESSED", null);
  } catch (err) {
    logger.error("no se pudo aplicar el webhook", { eventId: event.eventId, error: err });
    return finish("FAILED", err instanceof Error ? err.message.slice(0, 500) : "error");
  }
}
