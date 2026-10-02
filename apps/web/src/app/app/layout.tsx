import Link from "next/link";
import type { ReactNode } from "react";

import { DesktopNav, MobileNav } from "@/components/app-nav";
import { Logo } from "@/components/logo";
import { requireUser } from "@/lib/auth";
import { getCartCount } from "@/lib/cart";
import { getProfile } from "@/lib/data";

/** Iniciales del avatar: nombre (hasta dos palabras) o, si no hay, el email. */
function initials(name: string | null | undefined, email: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const letters = words.length ? words.slice(0, 2).map((w) => w[0]) : [email?.[0] ?? "?"];
  return letters.join("").toUpperCase();
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const [profile, cartCount] = await Promise.all([getProfile(user.id), getCartCount()]);
  return (
    <div className="min-h-dvh pb-28 md:pb-0">
      <header className="sticky top-0 z-30 bg-ivory/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-7 px-5 sm:px-8">
          <Logo href="/app/dashboard" />
          <DesktopNav />
          <div className="flex-1" />
          <Link
            href="/app/cart"
            aria-label={
              cartCount > 0
                ? `Carrito, ${cartCount} ${cartCount === 1 ? "producto" : "productos"} por comprar`
                : "Carrito"
            }
            className="relative grid size-9 place-items-center rounded-full text-stone transition-colors hover:bg-sand hover:text-ink"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M5 7h14l-1.5 12h-11zM9 7a3 3 0 0 1 6 0" strokeLinejoin="round" />
            </svg>
            {cartCount > 0 ? (
              <span
                aria-hidden="true"
                className="absolute -top-0.5 -right-0.5 grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full bg-ink px-1 font-mono text-[0.625rem] leading-none text-paper"
              >
                {cartCount > 9 ? "9+" : cartCount}
              </span>
            ) : null}
          </Link>
          <Link
            href="/app/profile#cuenta"
            aria-label="Tu cuenta"
            className="grid size-[2.125rem] place-items-center rounded-full bg-sand-deep text-xs font-medium transition-colors hover:bg-line"
          >
            <span aria-hidden="true">{initials(profile?.display_name, user.email)}</span>
          </Link>
        </div>
      </header>
      <main id="contenido" className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
