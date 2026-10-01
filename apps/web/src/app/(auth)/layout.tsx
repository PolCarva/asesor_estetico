import type { ReactNode } from "react";

import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-night p-12 text-bone lg:flex">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-topo-night" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 size-[36rem] -translate-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(199_130_90/0.2),transparent)]"
        />
        <div className="relative">
          <Logo tone="bone" />
        </div>
        <div className="relative">
          <span aria-hidden="true" className="mb-8 block size-16 animate-float orb" />
          <blockquote className="max-w-md font-display text-4xl leading-tight font-medium">
            El estilo no es tener más ropa. Es saber{" "}
            <em className="text-peach">qué te queda bien.</em>
          </blockquote>
        </div>
        <p className="relative text-xs text-bone/60">
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
