import { PREMIUM_PRICE_USD } from "@asesor/shared";

import { TrackEvent } from "./track-event";
import { Button } from "./ui/button";

const BENEFITS = [
  "Los 3 looks con imagen realista",
  "Shopping en tiendas de Uruguay",
  "Favoritos y carrito",
  "Chat con tu asesor",
];

/** Paywall mock: el checkout real (Mercado Pago) se conecta en un milestone futuro. */
export function PaywallCard() {
  return (
    <aside className="rounded-3xl bg-ink p-8 text-ivory" aria-labelledby="paywall-title">
      <TrackEvent name="paywall_viewed" />
      <p className="text-[0.7rem] font-medium tracking-[0.18em] text-ivory/60 uppercase">Premium</p>
      <h2 id="paywall-title" className="mt-3 text-3xl">
        Desbloqueá tu estilo completo
      </h2>
      <p className="mt-4 font-display text-5xl">
        USD {PREMIUM_PRICE_USD.toFixed(2)}
        <span className="font-sans text-base text-ivory/60"> / mes</span>
      </p>
      <ul className="mt-6 space-y-2 text-sm text-ivory/80">
        {BENEFITS.map((benefit) => (
          <li key={benefit} className="flex gap-3">
            <span aria-hidden="true">—</span>
            {benefit}
          </li>
        ))}
      </ul>
      <Button variant="accent" className="mt-8 w-full" disabled aria-describedby="paywall-soon">
        Suscribirme
      </Button>
      <p id="paywall-soon" className="mt-3 text-center text-xs text-ivory/60">
        Checkout disponible próximamente.
      </p>
    </aside>
  );
}
