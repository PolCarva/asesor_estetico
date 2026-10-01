import { PREMIUM_PRICE_USD } from "@asesor/shared";

import { TrackEvent } from "./track-event";
import { Button } from "./ui/button";

const BENEFITS = [
  "Los 3 looks con imagen realista",
  "Asesoría de imagen completa: pelo, barba, ropa, calzado y más",
  "Shopping en tiendas de Uruguay",
  "Guardados y carrito",
  "Chat con tu asesor",
];

/** Paywall mock: el checkout real (Mercado Pago) se conecta en un milestone futuro. */
export function PaywallCard() {
  return (
    <aside
      className="relative overflow-hidden rounded-[30px] bg-forest p-8 text-bone"
      aria-labelledby="paywall-title"
    >
      <TrackEvent name="paywall_viewed" />
      <span aria-hidden="true" className="absolute -top-10 -right-10 size-32 orb opacity-90" />
      <p className="relative font-mono text-[0.625rem] tracking-[0.08em] text-sage uppercase">
        Premium
      </p>
      <h2 id="paywall-title" className="relative mt-3 text-3xl leading-tight">
        Desbloqueá tu estilo <em className="text-peach">completo</em>
      </h2>
      <p className="relative mt-4 font-display text-5xl font-medium">
        USD {PREMIUM_PRICE_USD.toFixed(2)}
        <span className="font-sans text-base font-normal text-bone/60"> / mes</span>
      </p>
      <ul className="relative mt-6 space-y-2 text-sm text-bone/85">
        {BENEFITS.map((benefit) => (
          <li key={benefit} className="flex gap-3">
            <span aria-hidden="true" className="text-sage">
              +
            </span>
            {benefit}
          </li>
        ))}
      </ul>
      <Button
        variant="light"
        size="lg"
        className="relative mt-8 w-full"
        disabled
        aria-describedby="paywall-soon"
      >
        Suscribirme
      </Button>
      <p id="paywall-soon" className="relative mt-3 text-center text-xs text-bone/60">
        Checkout disponible próximamente.
      </p>
    </aside>
  );
}
