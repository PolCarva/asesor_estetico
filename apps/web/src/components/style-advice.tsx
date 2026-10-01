import type { AdviceGroup, AdviceSection, AdviceView } from "@asesor/shared";

import { CopyButton } from "./copy-button";
import { Swatches } from "./swatches";
import { TrackEvent } from "./track-event";
import { LinkButton } from "./ui/button";

const MARK = { do: "+", avoid: "−", info: "·" } as const;
const MARK_CLASS = { do: "text-moss", avoid: "text-clay-dark", info: "text-stone" } as const;
const MARK_LABEL = { do: "Te favorece", avoid: "Evitar", info: "Dato" } as const;

function ItemList({ items, tone }: { items: string[]; tone: AdviceGroup["tone"] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5 text-sm leading-snug">
          <span className={`w-2.5 shrink-0 font-medium ${MARK_CLASS[tone]}`}>
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
      id={section.id === "hair" ? "pelo" : undefined}
      aria-labelledby={headingId}
      className="break-inside-avoid rounded-[28px] glass p-6"
    >
      <h3 id={headingId} className="text-[1.625rem] leading-none">
        {section.title}
      </h3>
      {section.highlight ? (
        <div className="relative mt-5 overflow-hidden rounded-[22px] bg-tint-moss p-4 [--topo-line:rgb(78_91_60/0.16)]">
          <div aria-hidden="true" className="absolute inset-0 topo-card" />
          <div className="relative flex items-center justify-between gap-3">
            <p className="font-mono text-[0.625rem] tracking-[0.08em] text-moss uppercase">
              {section.highlight.label}
            </p>
            <CopyButton text={section.highlight.text} />
          </div>
          <p className="relative mt-2 text-sm leading-relaxed">{section.highlight.text}</p>
        </div>
      ) : null}
      <div className="mt-5 space-y-5">
        {section.groups.map((group) => (
          <div key={group.label}>
            <h4 className="mb-2 eyebrow">{group.label}</h4>
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
    <section aria-labelledby="advice-locked" className="rounded-[28px] glass p-6">
      <h3 id="advice-locked" className="sr-only">
        Asesoría completa (Premium)
      </h3>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {locked.map((s) => (
          <li key={s.id} className="rounded-[20px] well p-4">
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
        <p className="max-w-md text-sm text-bark">
          Corte e indicaciones para tu peluquero, barba y cejas, ropa y fit, calzado, accesorios,
          tatuajes y un plan de por dónde empezar.
        </p>
        <LinkButton href="#premium" size="sm">
          Ver la asesoría completa
        </LinkButton>
      </div>
    </section>
  );
}

/** Tarjeta corta de la fila de arriba (te favorece / mejor evitar). */
function KeyList({
  id,
  title,
  items,
  tone,
}: {
  id: string;
  title: string;
  items: string[];
  tone: AdviceGroup["tone"];
}) {
  return (
    <section aria-labelledby={id} className="rounded-[28px] glass p-6">
      <h3 id={id} className="eyebrow">
        {title}
      </h3>
      <div className="mt-4">
        <ItemList items={items} tone={tone} />
      </div>
    </section>
  );
}

/**
 * Asesoría de imagen en la pantalla de resultados, debajo de los looks (SPEC, "UI DEL
 * ASESORAMIENTO"): te favorece, mejor evitar y colores para todos; secciones completas
 * para Premium y bloqueadas para free.
 */
export function StyleAdvice({ view }: { view: AdviceView }) {
  const isPremium = view.plan === "PREMIUM";
  return (
    <section aria-labelledby="advice-title" className="mt-20">
      <TrackEvent
        name="style_advice_viewed"
        properties={{
          plan: view.plan,
          sections_visible: view.sections.length,
          sections_locked: view.locked.length,
        }}
      />
      <p className="eyebrow">Tu asesoría de imagen</p>
      <h2 id="advice-title" className="mt-3 text-4xl leading-none sm:text-5xl">
        Cómo llevarlo <em className="text-moss">a tu día.</em>
      </h2>
      <p className="mt-3 text-sm text-bark">
        {view.direction.primary}
        {view.direction.keywords.length ? ` · ${view.direction.keywords.join(" · ")}` : ""}
      </p>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <KeyList id="advice-favors" title="Te favorece" items={view.favors} tone="do" />
        <KeyList id="advice-avoid" title="Mejor evitar" items={view.avoid} tone="avoid" />
        <section
          aria-labelledby="advice-colors"
          className="relative overflow-hidden rounded-[28px] bg-tint-clay p-6 [--topo-line:rgb(184_101_63/0.14)]"
        >
          <div aria-hidden="true" className="absolute inset-0 topo-card" />
          <h3 id="advice-colors" className="relative eyebrow text-clay-dark">
            Colores
          </h3>
          <div className="relative mt-4 space-y-4">
            <div>
              <p className="mb-2 text-xs font-medium text-bark">Tus mejores colores</p>
              <Swatches colors={view.colors.best} />
            </div>
            {view.colors.neutrals.length ? (
              <div>
                <p className="mb-2 text-xs font-medium text-bark">Neutros</p>
                <Swatches colors={view.colors.neutrals} />
              </div>
            ) : null}
            {view.colors.avoid.length ? (
              <div>
                <p className="mb-2 text-xs font-medium text-bark">Mejor evitar</p>
                <Swatches colors={view.colors.avoid} />
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {isPremium && view.sections.length ? (
        <div className="mt-4 gap-4 md:columns-2 [&>*]:mb-4">
          {view.sections.map((section) => (
            <Section key={section.id} section={section} />
          ))}
        </div>
      ) : null}
      {isPremium && view.pendingNextAnalysis ? (
        <p className="mt-4 rounded-[22px] glass p-4 text-sm text-bark">
          La asesoría detallada (corte, barba, ropa, calzado y más) aparece en tu próximo análisis.
        </p>
      ) : null}
      {view.locked.length ? (
        <div className="mt-4">
          <LockedSections locked={view.locked} />
        </div>
      ) : null}
    </section>
  );
}
