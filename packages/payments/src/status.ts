import type { SubscriptionStatus } from "@asesor/shared";

import { PaymentError } from "./types";

/** Transiciones válidas del estado de una suscripción. */
const TRANSITIONS: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  FREE: ["PENDING"],
  PENDING: ["ACTIVE", "CANCELLED", "EXPIRED"],
  ACTIVE: ["PAST_DUE", "CANCELLED", "EXPIRED"],
  PAST_DUE: ["ACTIVE", "CANCELLED", "EXPIRED"],
  CANCELLED: ["EXPIRED", "ACTIVE"],
  EXPIRED: [],
};

export function canTransition(from: SubscriptionStatus, to: SubscriptionStatus) {
  return from === to || TRANSITIONS[from].includes(to);
}

/** Aplica un cambio de estado o lanza INVALID_TRANSITION (p. ej., un webhook viejo fuera de orden). */
export function transitionSubscription(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): SubscriptionStatus {
  if (!canTransition(from, to)) {
    throw new PaymentError("INVALID_TRANSITION", `Transición inválida: ${from} → ${to}`);
  }
  return to;
}
