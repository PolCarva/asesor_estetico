import type { AdviceGroup, AdviceSection, AdviceView } from "@asesor/shared";

import { CopyButton } from "./copy-button";
import { Swatches } from "./swatches";
import { TrackEvent } from "./track-event";
import { LinkButton } from "./ui/button";

const MARK = { do: "✓", avoid: "×", info: "·" } as const;
const MARK_CLASS = {
  do: "bg-moss/10 text-moss",
  avoid: "bg-danger/10 text-danger",
  info: "bg-sand text-stone",
} as const;
const MARK_LABEL = { do: "Te favorece", avoid: "Evitar", info: "Dato" } as const;

function ItemList({ items, tone }: { items: string[]; tone: AdviceGroup["tone"] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-sm leading-snug">
          <span
            className={`mt-px inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-medium ${MARK_CLASS[tone]}`}
          >
            <span aria-hidden="true">{MARK[tone]}</span>
            <span className="sr-only">{MARK_LABEL[tone]}:</span>
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Section({ section }: { section: AdviceSection }) {
  const headingId = `advice-${section.id}`;
  return (
    <section
      aria-labelledby={headingId}
      className="break-inside-avoid rounded-3xl border border-line bg-paper p-6"
    >
      <h3 id={headingId} className="text-2xl">
        {section.title}
      </h3>
      {section.highlight ? (
        <div className="mt-4 rounded-2xl bg-sand/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="eyebrow">{section.highlight.label}</p>
            <CopyButton text={section.highlight.text} />
          </div>
          <p className="mt-2 text-sm leading-relaxed">{section.highlight.text}</p>
        </div>
      ) : null}
      <div className="mt-5 space-y-5">
        {section.groups.map((group) => (
          <div key={group.label}>
            <h4 className="mb-2 font-sans text-xs font-medium text-stone">{group.label}</h4>
            <ItemList items={group.items} tone={group.tone} />
          </div>
        ))}
      </div>
    </section>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/** Secciones Premium bloqueadas: solo títulos y líneas de relleno, sin datos reales. */
function LockedSections({ locked }: { locked: AdviceView["locked"] }) {
  return (
    <section
      aria-labelledby="advice-locked"
      className="relative overflow-hidden rounded-3xl border border-line bg-paper p-6"
    >
      <h3 id="advice-locked" className="sr-only">
        Asesoría completa (Premium)
      </h3>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {locked.map((s) => (
          <li key={s.id} className="rounded-2xl bg-sand/60 p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <LockIcon />
              {s.title}
            </p>
            <div className="mt-3 space-y-2 blur-[3px]" aria-hidden="true">
              <div className="h-2 w-11/12 rounded-full bg-line" />
              <div className="h-2 w-8/12 rounded-full bg-line" />
              <div className="h-2 w-10/12 rounded-full bg-line" />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md text-sm text-stone">
          Corte e indicaciones para tu peluquero, barba y cejas, ropa y fit, calzado, accesorios,
          tatuajes y un plan de por dónde empezar.
        </p>
        <LinkButton href="#premium" variant="accent" size="sm">
          Ver la asesoría completa
        </LinkButton>
      </div>
    </section>
  );
}

/** Asesoría de imagen: teaser para free, completa para Premium. Server Component. */
export function StyleAdvice({ view }: { view: AdviceView }) {
  const isPremium = view.plan === "PREMIUM";
  return (
    <section aria-labelledby="advice-title" className="mt-16">
      <TrackEvent
        name="style_advice_viewed"
        properties={{
          plan: view.plan,
          sections_visible: view.sections.length,
          sections_locked: view.locked.length,
        }}
      />
      <p className="eyebrow">Tu asesoría de imagen</p>
      <h2 id="advice-title" className="mt-2 text-4xl">
        {view.direction.primary}
      </h2>
      {view.direction.keywords.length ? (
        <p className="mt-3 text-sm text-stone">{view.direction.keywords.join(" · ")}</p>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section
          aria-labelledby="advice-favors"
          className="rounded-3xl border border-line bg-paper p-6"
        >
          <h3 id="advice-favors" className="eyebrow">
            Te favorece
          </h3>
          <div className="mt-4">
            <ItemList items={view.favors} tone="do" />
          </div>
        </section>
        <section
          aria-labelledby="advice-avoid"
          className="rounded-3xl border border-line bg-paper p-6"
        >
          <h3 id="advice-avoid" className="eyebrow">
            Mejor evitar
          </h3>
          <div className="mt-4">
            <ItemList items={view.avoid} tone="avoid" />
          </div>
        </section>
        <section
          aria-labelledby="advice-colors"
          className="rounded-3xl border border-line bg-paper p-6"
        >
          <h3 id="advice-colors" className="eyebrow">
            Colores
          </h3>
          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-2 font-sans text-xs font-medium text-stone">Tus mejores colores</p>
              <Swatches colors={view.colors.best} />
            </div>
            {view.colors.neutrals.length ? (
              <div>
                <p className="mb-2 font-sans text-xs font-medium text-stone">Neutros</p>
                <Swatches colors={view.colors.neutrals} />
              </div>
            ) : null}
            {view.colors.avoid.length ? (
              <div>
                <p className="mb-2 font-sans text-xs font-medium text-stone">Mejor evitar</p>
                <Swatches colors={view.colors.avoid} />
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {isPremium && view.sections.length ? (
        <div className="mt-6 gap-6 md:columns-2 [&>*]:mb-6">
          {view.sections.map((section) => (
            <Section key={section.id} section={section} />
          ))}
        </div>
      ) : null}
      {isPremium && view.pendingNextAnalysis ? (
        <p className="mt-6 rounded-2xl bg-sand/60 p-4 text-sm text-stone">
          La asesoría detallada (corte, barba, ropa, calzado y más) aparece en tu próximo análisis.
        </p>
      ) : null}
      {view.locked.length ? (
        <div className="mt-6">
          <LockedSections locked={view.locked} />
        </div>
      ) : null}
    </section>
  );
}
