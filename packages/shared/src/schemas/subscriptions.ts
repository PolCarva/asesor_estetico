import { z } from "zod";

export const SubscriptionStatusSchema = z.enum([
  "FREE",
  "PENDING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELLED",
  "EXPIRED",
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

export const PaymentProviderNameSchema = z.enum(["MOCK", "MERCADOPAGO"]);
export type PaymentProviderName = z.infer<typeof PaymentProviderNameSchema>;

export const SubscriptionSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  provider: PaymentProviderNameSchema,
  provider_subscription_id: z.string().nullable(),
  status: SubscriptionStatusSchema,
  current_period_start: z.string().nullable(),
  current_period_end: z.string().nullable(),
});
export type Subscription = z.infer<typeof SubscriptionSchema>;

type PremiumCheck = Pick<Subscription, "status" | "current_period_end">;

/**
 * Regla única de acceso Premium. La función SQL public.is_premium() replica
 * esta misma regla para RLS: si cambia una, cambiar la otra.
 * - ACTIVE con período vigente.
 * - CANCELLED conserva el acceso hasta el fin del período pagado.
 */
export function isPremiumSubscription(sub: PremiumCheck | null | undefined, now = new Date()) {
  if (!sub?.current_period_end) return false;
  if (sub.status !== "ACTIVE" && sub.status !== "CANCELLED") return false;
  return new Date(sub.current_period_end).getTime() > now.getTime();
}
