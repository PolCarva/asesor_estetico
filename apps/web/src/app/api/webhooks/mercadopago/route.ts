import { getServerEnv } from "@asesor/config/env/server";
import { getServiceRoleClient } from "@asesor/db/service";
import { MercadoPagoProvider } from "@asesor/payments";
import { type NextRequest, NextResponse } from "next/server";

import { clientIp, errorResponse } from "@/lib/api";
import { processPaymentWebhook } from "@/lib/payment-webhooks";
import { enforceRateLimit, rateLimiters } from "@/lib/rate-limit";

const MAX_BODY_BYTES = 64 * 1024;

/**
 * Webhook de Mercado Pago. Verifica la firma, registra el evento de forma
 * idempotente y NO activa Premium mientras la consulta a la API de Mercado Pago
 * no esté implementada (ver MercadoPagoProvider).
 */
export async function POST(request: NextRequest) {
  try {
    await enforceRateLimit(rateLimiters.webhook, `webhook:${clientIp(request.headers)}`);
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES)
      return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });

    const env = getServerEnv();
    const outcome = await processPaymentWebhook({
      provider: new MercadoPagoProvider({
        accessToken: env.MERCADOPAGO_ACCESS_TOKEN,
        webhookSecret: env.MERCADOPAGO_WEBHOOK_SECRET,
      }),
      db: getServiceRoleClient(),
      request: {
        rawBody,
        headers: {
          "x-signature": request.headers.get("x-signature"),
          "x-request-id": request.headers.get("x-request-id"),
        },
        query: Object.fromEntries(request.nextUrl.searchParams),
      },
    });
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    return errorResponse(error);
  }
}
