import { z } from "zod";

import { hmacSha256Hex, safeEqualHex } from "./signature";
import {
  PaymentError,
  type PaymentProvider,
  type ProviderSubscription,
  type WebhookRequest,
  type WebhookResult,
} from "./types";

/** Tolerancia para el timestamp firmado: evita replays de webhooks viejos. */
const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;

const MercadoPagoWebhookSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  type: z.string().min(1),
  action: z.string().optional(),
  data: z.object({ id: z.union([z.string(), z.number()]).transform(String) }),
});

export interface MercadoPagoOptions {
  accessToken?: string;
  webhookSecret?: string;
  now?: () => number;
}

/**
 * Verifica x-signature según el esquema de Mercado Pago:
 *   manifest = "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
 *   v1 = HMAC-SHA256(secret, manifest) en hex.
 * Es solo criptografía local: no hace llamadas de red.
 */
export function verifyMercadoPagoSignature(input: {
  secret: string;
  signatureHeader: string | null | undefined;
  requestId: string | null | undefined;
  dataId: string | null | undefined;
  now: number;
}): boolean {
  if (!input.signatureHeader || !input.dataId) return false;
  const parts = Object.fromEntries(
    input.signatureHeader.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const tsMs = Number(ts) < 1e12 ? Number(ts) * 1000 : Number(ts);
  if (!Number.isFinite(tsMs) || Math.abs(input.now - tsMs) > MAX_SIGNATURE_AGE_MS) return false;

  const dataId = /^[a-z0-9]+$/i.test(input.dataId) ? input.dataId.toLowerCase() : input.dataId;
  let manifest = `id:${dataId};`;
  if (input.requestId) manifest += `request-id:${input.requestId};`;
  manifest += `ts:${ts};`;
  return safeEqualHex(v1, hmacSha256Hex(input.secret, manifest));
}

/**
 * Estructura del proveedor Mercado Pago (suscripciones / preapproval).
 * Todavía NO hace llamadas a la API: createSubscription, getSubscription y
 * cancelSubscription lanzan NOT_IMPLEMENTED. handleWebhook verifica la firma pero
 * devuelve confirmed = null, así que ningún webhook puede activar Premium hasta
 * que getSubscription consulte el estado real en Mercado Pago.
 */
export class MercadoPagoProvider implements PaymentProvider {
  readonly name = "MERCADOPAGO" as const;

  constructor(private readonly options: MercadoPagoOptions) {}

  private notImplemented(): never {
    throw new PaymentError("NOT_IMPLEMENTED", "Integración con Mercado Pago pendiente.");
  }

  async createSubscription(): Promise<never> {
    return this.notImplemented();
  }

  async getSubscription(): Promise<ProviderSubscription> {
    return this.notImplemented();
  }

  async cancelSubscription(): Promise<ProviderSubscription> {
    return this.notImplemented();
  }

  async handleWebhook(request: WebhookRequest): Promise<WebhookResult> {
    const secret = this.options.webhookSecret;
    if (!secret) throw new PaymentError("NOT_CONFIGURED", "Falta MERCADOPAGO_WEBHOOK_SECRET.");

    const valid = verifyMercadoPagoSignature({
      secret,
      signatureHeader: request.headers["x-signature"],
      requestId: request.headers["x-request-id"],
      dataId: request.query["data.id"],
      now: this.options.now?.() ?? Date.now(),
    });
    if (!valid) throw new PaymentError("INVALID_SIGNATURE", "Firma de Mercado Pago inválida.");

    let body: z.infer<typeof MercadoPagoWebhookSchema>;
    try {
      body = MercadoPagoWebhookSchema.parse(JSON.parse(request.rawBody));
    } catch (error) {
      throw new PaymentError("INVALID_PAYLOAD", "Payload de Mercado Pago inválido.", {
        cause: error,
      });
    }
    if (body.data.id !== request.query["data.id"]) {
      throw new PaymentError("INVALID_PAYLOAD", "data.id no coincide con la firma.");
    }

    return {
      eventId: body.id,
      eventType: body.action ? `${body.type}.${body.action}` : body.type,
      providerSubscriptionId: body.type.includes("preapproval") ? body.data.id : null,
      // Pendiente: confirmar con getSubscription() cuando exista la integración real.
      confirmed: null,
    };
  }
}
