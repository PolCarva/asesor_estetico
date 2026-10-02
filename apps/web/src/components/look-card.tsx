import type { LookSpec } from "@asesor/shared";
import Link from "next/link";
import type { ReactNode } from "react";

import { RISK_LABEL, twoDigits } from "@/lib/labels";

import { PaletteRing } from "./swatches";

/** Placeholder del look mientras no hay imagen generada: la paleta como luz de estudio. */
function LookVisual({ colors, label }: { colors: string[]; label: string }) {
  const [a = "#e6dfd1", b = "#dcd4c4", c = "#b8653f"] = colors;
  return (
    <div
      role="img"
      aria-label={label}
      className="absolute inset-0"
      style={{ background: `linear-gradient(165deg, ${a} 0%, ${b} 55%, ${c} 100%)` }}
    >
      <div className="absolute inset-0 bg-topo opacity-60" />
      <div className="absolute inset-x-[32%] top-[12%] aspect-square rounded-full bg-paper/30" />
      <div className="absolute inset-x-[24%] top-[36%] bottom-[-8%] rounded-t-[45%] bg-paper/25" />
    </div>
  );
}

type ImageStatus = "READY" | "PENDING" | "GENERATING" | "FAILED";

/** Marco de la tarjeta: foto con esquinas grandes y sombra de contacto. */
function frameClass(featured: boolean) {
  return featured
    ? "relative aspect-[3/4] overflow-hidden rounded-[34px] bg-sand shadow-[0_50px_70px_-36px_rgb(48_44_30/0.65),0_0_0_6px_rgb(250_247_241/0.9)]"
    : "relative aspect-[3/4] overflow-hidden rounded-[30px] bg-sand shadow-contact";
}

/**
 * Un look como en el escenario de resultados: render (o la paleta), etiqueta de vidrio con
 * número, nombre y anillo de colores. `featured` es la tarjeta central (look 01).
 */
export function LookCard({
  look,
  position,
  example = false,
  imageUrl = null,
  status = "READY",
  href,
  featured = false,
  action = null,
}: {
  look: LookSpec;
  position: number;
  example?: boolean;
  /** Arriba a la derecha, por encima del link de la card (el ♡ de guardar, paso 10b). */
  action?: ReactNode;
  /** URL firmada de la imagen generada; sin imagen se muestra la paleta. */
  imageUrl?: string | null;
  status?: ImageStatus;
  /** Detalle del look. Sin href (ejemplos) la card no linkea. */
  href?: string;
  featured?: boolean;
}) {
  const generating = status === "PENDING" || status === "GENERATING";
  const meta = [twoDigits(position), RISK_LABEL[look.risk_level], example ? "Ejemplo" : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <article className="group relative">
      <div className={frameClass(featured)}>
        {imageUrl ? (
          // <img> y no next/image: la imagen es privada (URL firmada) y no debe pasar por el cache del optimizador.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={`Vos con el look ${look.name}`}
            className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        ) : (
          <LookVisual
            colors={look.palette.map((c) => c.hex)}
            label={`Paleta del look ${look.name}`}
          />
        )}

        {featured && !generating && status !== "FAILED" ? (
          <p className="absolute top-4 left-4 rounded-[14px] bg-ink px-3 py-1.5 font-mono text-[0.6875rem] text-paper">
            ✦ PARA EMPEZAR
          </p>
        ) : null}
        {!imageUrl && generating ? (
          <p
            role="status"
            className="absolute top-4 left-4 animate-pulse rounded-[14px] glass-strong px-3 py-1.5 font-mono text-[0.6875rem]"
          >
            GENERANDO TU IMAGEN…
          </p>
        ) : null}
        {!imageUrl && status === "FAILED" ? (
          <p
            role="status"
            className="absolute top-4 left-4 rounded-[14px] bg-danger px-3 py-1.5 font-mono text-[0.6875rem] text-paper"
          >
            NO PUDIMOS GENERAR LA IMAGEN
          </p>
        ) : null}

        {action ? <div className="absolute top-3.5 right-3.5 z-10">{action}</div> : null}

        <div
          className={`absolute flex flex-col gap-2.5 glass-strong ${featured ? "inset-x-4 bottom-4 rounded-[22px] p-4" : "inset-x-3.5 bottom-3.5 rounded-[20px] p-3.5"}`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[0.625rem] tracking-[0.04em] text-stone uppercase">
                {meta}
              </p>
              <h3
                className={`mt-0.5 leading-none ${featured ? "text-[1.625rem] sm:text-[1.875rem]" : "text-2xl"}`}
              >
                {href ? (
                  // El link cubre toda la card (after:absolute sobre el article relativo).
                  <Link href={href} className="after:absolute after:inset-0 hover:text-moss">
                    {look.name}
                  </Link>
                ) : (
                  look.name
                )}
              </h3>
            </div>
            <PaletteRing
              colors={look.palette.map((c) => c.hex)}
              label={twoDigits(position)}
              size={featured ? "md" : "sm"}
            />
          </div>
          {featured ? (
            <p className="line-clamp-2 text-[0.8125rem] leading-snug text-bark">{look.concept}</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function LockIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
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

/** Look bloqueado (free): solo el nombre, sin render ni datos del spec. */
export function LockedLookCard({
  name,
  position,
  href,
  featured = false,
}: {
  name: string;
  position: number;
  href?: string;
  featured?: boolean;
}) {
  return (
    <article aria-label={`Look ${position} bloqueado`} className="relative">
      <div className={frameClass(featured)}>
        <div className="absolute inset-0 bg-[linear-gradient(165deg,#e6dfd1,#dcd4c4_55%,#c7825a)] opacity-70 blur-md" />
        <div className="absolute inset-0 bg-topo" />
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-3">
            <span className="grid size-14 place-items-center rounded-full raised-dark">
              <LockIcon />
            </span>
            <span className="font-mono text-[0.6875rem] tracking-[0.08em] text-bark">PREMIUM</span>
          </div>
        </div>
        <div className="absolute inset-x-3.5 bottom-3.5 rounded-[20px] glass-strong p-3.5">
          <p className="font-mono text-[0.625rem] tracking-[0.04em] text-stone uppercase">
            {twoDigits(position)} · Premium
          </p>
          <h3 className="mt-0.5 text-2xl leading-none">
            {href ? (
              <Link href={href} className="after:absolute after:inset-0 hover:text-moss">
                {name}
              </Link>
            ) : (
              name
            )}
          </h3>
          <p className="mt-1.5 text-[0.8125rem] text-bark">Desbloqueá este look con Premium.</p>
        </div>
      </div>
    </article>
  );
}
