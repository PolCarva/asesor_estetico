import type { LookSpec } from "@asesor/shared";

import { Swatches } from "./swatches";

const RISK_LABEL = { CONSERVATIVE: "Clásico", BALANCED: "Equilibrado", BOLD: "Audaz" } as const;

/** Placeholder visual del look mientras no hay imagen generada. */
function LookVisual({ colors, label }: { colors: string[]; label: string }) {
  const [a = "#ebe3d7", b = "#ddd3c5", c = "#9a5636"] = colors;
  return (
    <div
      role="img"
      aria-label={label}
      className="relative aspect-[3/4] overflow-hidden rounded-2xl"
      style={{ background: `linear-gradient(160deg, ${a} 0%, ${b} 55%, ${c} 100%)` }}
    >
      <div className="absolute inset-x-[30%] top-[12%] aspect-square rounded-full bg-ivory/30" />
      <div className="absolute inset-x-[22%] top-[38%] bottom-[-10%] rounded-t-[45%] bg-ivory/25" />
    </div>
  );
}

type ImageStatus = "READY" | "PENDING" | "GENERATING" | "FAILED";

export function LookCard({
  look,
  position,
  example = false,
  imageUrl = null,
  status = "READY",
}: {
  look: LookSpec;
  position: number;
  example?: boolean;
  /** URL firmada de la imagen generada; sin imagen se muestra la paleta. */
  imageUrl?: string | null;
  status?: ImageStatus;
}) {
  const generating = status === "PENDING" || status === "GENERATING";
  return (
    <article className="group">
      <div className="relative">
        {imageUrl ? (
          // <img> y no next/image: la imagen es privada (URL firmada) y no debe pasar por el cache del optimizador.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={`Vos con el look ${look.name}`}
            className="aspect-[3/4] w-full rounded-2xl object-cover"
          />
        ) : (
          <LookVisual
            colors={look.palette.map((c) => c.hex)}
            label={`Paleta del look ${look.name}`}
          />
        )}
        {!imageUrl && generating ? (
          <p
            role="status"
            className="absolute inset-x-4 bottom-4 animate-pulse rounded-full bg-ink/80 px-4 py-2 text-center text-xs text-ivory"
          >
            Generando tu imagen…
          </p>
        ) : null}
        {!imageUrl && status === "FAILED" ? (
          <p
            role="status"
            className="absolute inset-x-4 bottom-4 rounded-full bg-danger/90 px-4 py-2 text-center text-xs text-ivory"
          >
            No pudimos generar la imagen
          </p>
        ) : null}
      </div>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">
            Look {position} · {RISK_LABEL[look.risk_level]}
            {example ? " · Ejemplo" : ""}
          </p>
          <h3 className="mt-1 text-2xl">{look.name}</h3>
        </div>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-stone">{look.concept}</p>
      <div className="mt-4">
        <Swatches colors={look.palette} size="sm" />
      </div>
    </article>
  );
}

export function LockedLookCard({ name, position }: { name: string; position: number }) {
  return (
    <article aria-label={`Look ${position} bloqueado`}>
      <div className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-2xl bg-sand">
        <div className="absolute inset-0 bg-gradient-to-br from-line to-sand blur-sm" />
        <div className="relative text-center">
          <span
            className="inline-flex size-12 items-center justify-center rounded-full bg-ink text-ivory"
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </span>
          <p className="mt-3 eyebrow">Premium</p>
        </div>
      </div>
      <p className="mt-4 eyebrow">Look {position}</p>
      <h3 className="mt-1 text-2xl">{name}</h3>
      <p className="mt-2 text-sm text-stone">Desbloqueá este look con Premium.</p>
    </article>
  );
}
