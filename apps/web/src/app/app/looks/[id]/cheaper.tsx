"use client";

import type { LookSearchState } from "@asesor/db";
import { SHOPPING_STAGES } from "@asesor/shared";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { SHOPPING_STAGE_LABEL } from "@/lib/labels";

import { type CheaperActionState, findCheaperAlternativeAction } from "./actions";

const POLL_MS = 2500;
const initial: CheaperActionState = { status: "idle" };

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      className="inline-flex items-center gap-1 rounded-full glass px-3 py-1 text-xs text-ink transition-colors hover:bg-paper disabled:pointer-events-none disabled:opacity-50"
    >
      {pending ? "Pidiendo…" : "Buscar más barato"}
    </button>
  );
}

/**
 * "Buscar más barato" de un producto (paso 09): acción secundaria (vidrio). El servidor
 * verifica Premium y encola la búsqueda de esa sola prenda; el progreso aparece en la fila.
 */
export function CheaperButton({
  lookId,
  productId,
  disabled = false,
}: {
  lookId: string;
  productId: string;
  disabled?: boolean;
}) {
  const [state, action] = useActionState(findCheaperAlternativeAction, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="lookId" value={lookId} />
      <input type="hidden" name="productId" value={productId} />
      <Submit disabled={disabled} />
      {state.status === "error" ? (
        <span role="alert" className="text-xs text-clay-dark">
          {state.error}
        </span>
      ) : state.status === "paywall" ? (
        <span role="alert" className="text-xs text-clay-dark">
          Buscar más barato es Premium.
        </span>
      ) : null}
    </form>
  );
}

/**
 * Progreso compacto de la búsqueda de una sola prenda (las etapas del paso 07, en chico):
 * consulta el estado del job por `?slot=` y refresca la página una vez al terminar.
 */
export function CheaperProgress({
  lookId,
  slot,
  initial: initialSearch,
}: {
  lookId: string;
  slot: string;
  initial: LookSearchState | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);

  useEffect(() => {
    let done = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/looks/${lookId}/shopping?slot=${encodeURIComponent(slot)}`, {
          cache: "no-store",
        });
        if (!res.ok || done) return;
        const next = (await res.json()) as LookSearchState;
        setSearch(next);
        if (next.status !== "QUEUED" && next.status !== "RUNNING") {
          done = true;
          clearInterval(timer);
          router.refresh();
        }
      } catch {
        // Un corte de red no frena la búsqueda (corre en el worker).
      }
    }, POLL_MS);
    return () => {
      done = true;
      clearInterval(timer);
    };
  }, [lookId, slot, router]);

  const stage = search?.progress?.stage ?? null;
  const current = stage ? SHOPPING_STAGES.indexOf(stage) : -1;
  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-2 rounded-[14px] bg-night px-3 py-2.5 text-bone"
    >
      <p className="flex items-center gap-2 font-mono text-[0.625rem] tracking-[0.06em] text-peach uppercase">
        <span aria-hidden="true" className="size-1.5 animate-blink rounded-full bg-peach" />
        Buscando más barato · {stage ? SHOPPING_STAGE_LABEL[stage] : "en la fila"}
      </p>
      <div aria-hidden="true" className="mt-2 flex gap-1">
        {SHOPPING_STAGES.map((s, i) => (
          <span key={s} className="h-0.5 flex-1 overflow-hidden rounded-full bg-bone/15">
            <span
              className={`block h-full bg-[linear-gradient(90deg,#b5c29e,#f0c9a0)] ${i < current ? "w-full" : i === current ? "w-1/2 animate-blink" : "w-0"}`}
            />
          </span>
        ))}
      </div>
    </div>
  );
}
