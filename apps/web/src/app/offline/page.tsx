import type { Metadata } from "next";

import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "Sin conexión" };

/** Página estática que el service worker muestra sin conexión. No contiene datos del usuario. */
export default function OfflinePage() {
  return (
    <main
      id="contenido"
      className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 text-center"
    >
      <div className="mx-auto">
        <Logo />
      </div>
      <h1 className="mt-10 text-4xl">Sin conexión</h1>
      <p className="mt-3 text-stone">Revisá tu conexión a internet y volvé a intentar.</p>
    </main>
  );
}
