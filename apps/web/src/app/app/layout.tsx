import type { ReactNode } from "react";

import { signOutAction } from "@/app/(auth)/actions";
import { DesktopNav, MobileNav } from "@/components/app-nav";
import { Logo } from "@/components/logo";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return (
    <div className="min-h-dvh pb-24 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-line bg-ivory/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Logo href="/app/dashboard" />
          <DesktopNav />
          <form action={signOutAction}>
            <button type="submit" className="text-sm text-stone hover:text-ink">
              Salir
            </button>
          </form>
        </div>
      </header>
      <main id="contenido" className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
