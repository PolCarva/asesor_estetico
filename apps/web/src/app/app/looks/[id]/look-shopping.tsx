"use client";

import type { LookSearchState } from "@asesor/db";
import {
  SHOPPING_STAGES,
  type ShoppingSearchSummary,
  type ShoppingStage,
  type SizeKind,
  type UserSizes,
} from "@asesor/shared";
import { useRouter } from "next/navigation";
import { type ReactNode, useActionState, useEffect, useState } from "react";

import { PaywallCard } from "@/components/paywall-card";
import { SizeFields } from "@/components/size-fields";
import { StepMark } from "@/components/step-mark";
import { sendClientEvent } from "@/components/track-event";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/states";
import { SubmitButton } from "@/components/ui/submit-button";
import { SHOPPING_STAGE_LABEL } from "@/lib/labels";

import { type LookShoppingActionState, startLookShoppingAction } from "./actions";

/** Texto de la píldora para free (SPEC "PREMIUM"). */
const FREE_CTA = "Encontrá las prendas reales para recrear este look";
const POLL_MS = 2500;

const PHRASE: Record<ShoppingStage | "QUEUED", string> = {
  QUEUED: "Preparando la búsqueda.",
  SEARCHING: "Buscamos cada prenda en tiendas de Uruguay.",
  CHECKING_STORES: "Abrimos la página de cada producto.",
  COMPARING: "Dejamos afuera lo que no se parece a tu look.",
  VERIFYING: "Confirmamos precio, stock y tu talle.",
  RANKING: "Ordenamos lo que mejor reproduce el look.",
};

// Hora fija de Uruguay: el servidor y el navegador renderizan lo mismo (sin desajuste).
const TIME = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const isActive = (search: LookSearchState | null) =>
  search?.status === "QUEUED" || search?.status === "RUNNING";

/**
 * Progreso real de la búsqueda (diseño 2d, compacto): etapas hecho / actual / pendiente y
 * barra por etapas, sin porcentajes. Consulta solo el estado del job (`/api/looks/…`) y, al
 * terminar, refresca la página una vez.
 */
function ShoppingProgressPanel({ lookId, initial }: { lookId: string; initial: LookSearchState }) {
  const router = useRouter();
  const [search, setSearch] = useState(initial);

  useEffect(() => {
    let done = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/looks/${lookId}/shopping`, { cache: "no-store" });
        if (!res.ok || done) return;
        const next = (await res.json()) as LookSearchState;
        setSearch(next);
        if (!isActive(next)) {
          done = true;
          clearInterval(timer);
          router.refresh();
        }
      } catch {
        // Un corte de red no frena la búsqueda (corre en el worker): se reintenta solo.
      }
    }, POLL_MS);
    return () => {
      done = true;
      clearInterval(timer);
    };
  }, [lookId, router]);

  const progress = search.progress;
  const current = progress ? SHOPPING_STAGES.indexOf(progress.stage) : -1;
  return (
    <section
      aria-labelledby="shopping-progress-title"
      className="relative overflow-hidden rounded-[28px] bg-night p-6 text-bone sm:p-7"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-topo-night" />
      <p className="relative flex items-center gap-2 font-mono text-[0.6875rem] text-peach uppercase">
        <span aria-hidden="true" className="size-1.5 animate-blink rounded-full bg-peach" />
        {progress
          ? `Buscando · etapa ${current + 1} de ${SHOPPING_STAGES.length}`
          : "En la fila · empieza en segundos"}
      </p>
      <h2 id="shopping-progress-title" className="relative mt-3 text-[2rem] leading-none">
        Buscando tu <em className="text-peach">look</em>…
      </h2>
      <ol aria-live="polite" className="relative mt-5 flex flex-col gap-3">
        {SHOPPING_STAGES.map((stage, i) => {
          const state = i < current ? "done" : i === current ? "current" : "todo";
          return (
            <li
              key={stage}
              className={`flex items-center gap-3 ${state === "todo" ? "opacity-40" : ""}`}
            >
              <StepMark state={state} />
              <span className={`text-sm ${state === "current" ? "text-peach" : ""}`}>
                {SHOPPING_STAGE_LABEL[stage]}
                <span className="sr-only">
                  {state === "done"
                    ? " completado"
                    : state === "current"
                      ? " en curso"
                      : " pendiente"}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="relative mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
        <div className="flex items-center gap-3.5">
          <span aria-hidden="true" className="size-9 shrink-0 animate-float orb" />
          <p className="font-display text-lg text-bone/90 italic">
            {PHRASE[progress?.stage ?? "QUEUED"]}
          </p>
        </div>
        <div aria-hidden="true" className="flex flex-1 gap-1.5">
          {SHOPPING_STAGES.map((stage, i) => (
            <span key={stage} className="h-0.5 flex-1 overflow-hidden rounded-full bg-bone/12">
              <span
                className={`block h-full bg-[linear-gradient(90deg,#b5c29e,#f0c9a0)] ${i < current ? "w-full" : i === current ? "w-1/2 animate-blink" : "w-0"}`}
              />
            </span>
          ))}
        </div>
      </div>
      {progress && progress.slots_total > 0 ? (
        <p className="relative mt-4 font-mono text-[0.6875rem] tracking-[0.06em] text-mist uppercase">
          {progress.slots_done} de {progress.slots_total} prendas listas · podés salir de esta
          pantalla
        </p>
      ) : null}
    </section>
  );
}

/** Mensaje honesto del resultado (SPEC "MANEJO DE ERRORES"), sin errores técnicos. */
function outcomeLines(summary: ShoppingSearchSummary): { title: string; notes: string[] } {
  const { slots, slots_with_results: found } = summary;
  const title =
    found === 0
      ? "No encontramos opciones para este look en las tiendas que revisamos."
      : found === slots
        ? `Encontramos opciones para tus ${slots} prendas.`
        : `Encontramos opciones para ${found} de ${slots} prendas.`;
  const notes: string[] = [];
  if (found > 0 && found < slots) {
    notes.push("Para algunas prendas no encontramos nada parecido en las tiendas que revisamos.");
  }
  if (summary.unverified_stock > 0) {
    notes.push(
      "Encontramos opciones similares, pero no pudimos verificar el stock de algunas prendas.",
    );
  }
  if (summary.unverified_sizes > 0) {
    notes.push("En algunas opciones no pudimos confirmar si está tu talle.");
  }
  return { title, notes };
}

function SearchOutcome({ search }: { search: LookSearchState }) {
  if (search.status === "FAILED") {
    return (
      <div role="status" className="rounded-[22px] glass p-5">
        <p className="eyebrow text-clay-dark">Búsqueda sin terminar</p>
        <p className="mt-2 text-sm text-ink">
          No pudimos buscar las prendas esta vez. Probá de nuevo en un rato.
        </p>
      </div>
    );
  }
  const summary = search.progress?.summary;
  if (!summary) return null;
  const { title, notes } = outcomeLines(summary);
  const at = search.finishedAt ? TIME.format(new Date(search.finishedAt)) : null;
  return (
    <div role="status" className="rounded-[22px] glass p-5">
      <p className="eyebrow">Búsqueda terminada{at ? ` · ${at}` : ""}</p>
      <p className="mt-2 text-sm font-medium text-ink">{title}</p>
      {notes.length ? (
        <ul className="mt-2 space-y-1.5 text-[0.8125rem] text-bark">
          {notes.map((note) => (
            <li key={note} className="flex gap-2.5">
              <span aria-hidden="true" className="text-clay-dark">
                ·
              </span>
              {note}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const initialState: LookShoppingActionState = { status: "idle" };

/**
 * "Encontrar este look" en el detalle del look (pasos 07): Premium pide los talles que
 * falten (solo los relevantes, una sola vez) y encola la búsqueda; free ve el paywall sin
 * llegar al servidor (que igual lo rechaza). Repetible con cualquier look.
 */
export function LookShopping({
  lookId,
  isPremium,
  missing,
  sizes,
  search,
  aside = null,
  secondary = false,
}: {
  lookId: string;
  isPremium: boolean;
  missing: SizeKind[];
  sizes: UserSizes;
  search: LookSearchState | null;
  /** Va a la derecha de la píldora (el ♡ de guardar el look, paso 10b). */
  aside?: ReactNode;
  /** Con resultados, la píldora oscura es "Agregar el look al carrito" y esta pasa a vidrio. */
  secondary?: boolean;
}) {
  const [state, action] = useActionState(startLookShoppingAction, initialState);
  const [askSizes, setAskSizes] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  if (search && isActive(search)) {
    return <ShoppingProgressPanel key={search.jobId} lookId={lookId} initial={search} />;
  }

  const paywall = showPaywall || state.status === "paywall";
  const sizesOpen = (askSizes || state.status === "needs_sizes") && missing.length > 0;
  const retry = search?.status === "FAILED";
  const label = retry
    ? "Reintentar la búsqueda"
    : search
      ? "Buscar de nuevo"
      : "Encontrar este look";

  const openSizes = () => {
    setAskSizes(true);
    sendClientEvent("size_requested", { kinds: missing.join(","), count: missing.length });
  };

  const variant = secondary ? "secondary" : "primary";
  const withAside = (pill: ReactNode) =>
    aside ? (
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">{pill}</div>
        {aside}
      </div>
    ) : (
      pill
    );

  return (
    <div className="flex flex-col gap-3">
      {search ? <SearchOutcome search={search} /> : null}

      {!isPremium ? (
        withAside(
          <Button
            variant="primary"
            size="lg-wrap"
            className="w-full"
            aria-expanded={paywall}
            aria-controls="look-paywall"
            onClick={() => setShowPaywall(true)}
          >
            {FREE_CTA}
          </Button>,
        )
      ) : sizesOpen ? (
        <form action={action} className="flex flex-col gap-3" aria-labelledby="sizes-title">
          <input type="hidden" name="lookId" value={lookId} />
          <div>
            <h2 id="sizes-title" className="text-xl">
              Antes de buscar, tus <em className="text-moss">talles</em>
            </h2>
            <p className="mt-1 text-[0.8125rem] text-bark">
              Solo los que usa este look. Los guardamos en tu perfil para no volver a preguntarlos.
            </p>
          </div>
          <SizeFields kinds={missing} sizes={sizes} />
          <SubmitButton pendingLabel="Guardando y buscando…" size="lg" className="w-full">
            Buscar las prendas
          </SubmitButton>
        </form>
      ) : missing.length > 0 ? (
        withAside(
          <Button variant={variant} size="lg" className="w-full" onClick={openSizes}>
            {label}
          </Button>,
        )
      ) : (
        withAside(
          <form action={action}>
            <input type="hidden" name="lookId" value={lookId} />
            <SubmitButton
              pendingLabel="Iniciando la búsqueda…"
              size="lg"
              variant={variant}
              className="w-full"
            >
              {label}
            </SubmitButton>
          </form>,
        )
      )}

      {state.status === "error" ? <FormMessage>{state.error}</FormMessage> : null}
      {paywall ? (
        <div id="look-paywall">
          <PaywallCard />
        </div>
      ) : null}
    </div>
  );
}
