import type { ReactNode } from "react";

import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between bg-ink p-12 text-ivory lg:flex">
        <p className="font-display text-xl italic">Asesor Estético</p>
        <blockquote className="max-w-md font-display text-4xl leading-tight">
          “El estilo no es tener más ropa. Es saber qué te queda bien.”
        </blockquote>
        <p className="text-xs text-ivory/60">
          Tus fotos son privadas. Podés borrarlas cuando quieras.
        </p>
      </aside>
      <main id="contenido" className="flex flex-col px-5 py-8 sm:px-10">
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          {children}
        </div>
      </main>
    </div>
  );
}
