import Link from "next/link";

import { LookCard } from "@/components/look-card";
import { Logo } from "@/components/logo";
import { TrackEvent } from "@/components/track-event";
import { LinkButton } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";
import { PREMIUM_PRICE_USD } from "@asesor/shared";
import { FIXTURE_LOOK_SPECS } from "@asesor/shared/fixtures";

const STEPS = [
  {
    title: "Subí tus fotos",
    text: "Una de cuerpo entero y una de rostro. Quedan privadas y las podés borrar cuando quieras.",
  },
  {
    title: "Descubrí tu estilo",
    text: "Analizamos tus colores, proporciones y rasgos para armar tu perfil de estilo.",
  },
  {
    title: "Visualizá tus looks",
    text: "Tres propuestas realistas, con vos como protagonista, y dónde conseguir cada prenda en Uruguay.",
  },
];

export default async function HomePage() {
  const user = await getSessionUser();
  const ctaHref = user ? "/app/dashboard" : "/signup";

  return (
    <div className="min-h-dvh">
      <TrackEvent name="landing_view" />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <Logo />
        <nav aria-label="Cuenta" className="flex items-center gap-2">
          {user ? (
            <LinkButton href="/app/dashboard" variant="secondary" size="sm">
              Mi espacio
            </LinkButton>
          ) : (
            <>
              <Link href="/login" className="px-3 text-sm text-stone hover:text-ink">
                Ingresar
              </Link>
              <LinkButton href="/signup" variant="primary" size="sm">
                Crear cuenta
              </LinkButton>
            </>
          )}
        </nav>
      </header>

      <main id="contenido">
        <section className="mx-auto grid max-w-6xl gap-12 px-5 pt-10 pb-20 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pt-16">
          <div>
            <p className="eyebrow">Asesoría de imagen · Uruguay</p>
            <h1 className="mt-5 text-5xl leading-[1.02] sm:text-6xl lg:text-7xl">
              Tu asesor de imagen <em className="text-clay">personal</em> con IA
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-stone">
              Subí tus fotos. Descubrí cómo potenciar tu imagen. Visualizá tus looks y encontrá cómo
              llevarlos a la realidad.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <LinkButton href={ctaHref} variant="primary" size="lg">
                Descubrir mi estilo
              </LinkButton>
              <p className="text-sm text-stone">Tu primer look es gratis.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4" aria-label="Ejemplos de looks">
            {FIXTURE_LOOK_SPECS.slice(0, 2).map((look, i) => (
              <div key={look.id} className={i === 1 ? "mt-12" : ""}>
                <LookCard look={look} position={i + 1} example />
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-line bg-paper">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <p className="eyebrow">Cómo funciona</p>
            <ol className="mt-8 grid gap-10 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title}>
                  <span className="font-display text-5xl text-clay">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h2 className="mt-4 text-2xl">{step.title}</h2>
                  <p className="mt-2 leading-relaxed text-stone">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <div className="grid gap-10 md:grid-cols-2 md:items-center">
            <h2 className="text-4xl leading-tight sm:text-5xl">
              No es un probador virtual. Es criterio de estilo.
            </h2>
            <div className="space-y-4 leading-relaxed text-stone">
              <p>
                Decidimos qué te favorece —colores, cortes, calce, pelo y grooming— y te mostramos
                el resultado sobre vos. Después buscamos prendas reales en tiendas locales para que
                puedas llevarlo a tu día a día.
              </p>
              <p>
                Premium: USD {PREMIUM_PRICE_USD.toFixed(2)} por mes. Los tres looks, shopping,
                carrito y chat con tu asesor.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line text-stone">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-xs sm:flex-row sm:justify-between sm:px-8">
          <p>
            Solo para mayores de 18 años. Tus fotos son privadas y no se usan para entrenar modelos.
          </p>
          <p>© {new Date().getFullYear()} Asesor Estético</p>
        </div>
      </footer>
    </div>
  );
}
