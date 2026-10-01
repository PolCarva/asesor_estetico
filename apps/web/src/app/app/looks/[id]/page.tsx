import type { Garment, GarmentSlot, LookReason, LookReasonAspect, LookSpec } from "@asesor/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AutoRefresh } from "@/components/auto-refresh";
import { LockedLookCard, LookCard } from "@/components/look-card";
import { PaywallCard } from "@/components/paywall-card";
import { PaletteRing, Pebble } from "@/components/swatches";
import { TrackEvent } from "@/components/track-event";
import { requireUser } from "@/lib/auth";
import { getLook, getLookSummaries, getPlan } from "@/lib/data";
import { CATEGORY_LABEL, REASON_ASPECT_LABEL, twoDigits } from "@/lib/labels";

export const metadata: Metadata = { title: "Look" };

/**
 * Piezas del look en el orden del diseño: de arriba hacia abajo y de afuera hacia
 * adentro (capas antes que la prenda de arriba). Los accesorios van al final.
 */
function lookPieces(spec: LookSpec): Array<{ slot: GarmentSlot; garment: Garment }> {
  const pieces: Array<{ slot: GarmentSlot; garment: Garment }> = [];
  spec.layering.forEach((garment, i) => pieces.push({ slot: `layering:${i}`, garment }));
  pieces.push({ slot: "top", garment: spec.top });
  if (spec.bottom) pieces.push({ slot: "bottom", garment: spec.bottom });
  pieces.push({ slot: "shoes", garment: spec.shoes });
  spec.accessories.forEach((garment, i) => pieces.push({ slot: `accessory:${i}`, garment }));
  return pieces;
}

/**
 * Dónde va cada pin sobre un render de cuerpo entero (% del ancho y del alto). Es una
 * ubicación aproximada por zona del cuerpo, no una detección: por eso solo se usa con
 * `framing: FULL_BODY` y con imagen. Capas extra y accesorios no llevan pin.
 */
const PIN_POSITION: Partial<Record<GarmentSlot | "hair", { left: number; top: number }>> = {
  hair: { left: 43, top: 9 },
  "layering:0": { left: 20, top: 28 },
  top: { left: 52, top: 38 },
  bottom: { left: 30, top: 64 },
  shoes: { left: 50, top: 88 },
};

function Pin({ n, label, at }: { n: number; label: string; at: { left: number; top: number } }) {
  return (
    <span
      className="absolute flex items-center gap-1.5 rounded-2xl glass-strong py-1 pr-2.5 pl-1 text-[0.6875rem] shadow-[0_8px_16px_-8px_rgb(0_0_0/0.35)]"
      style={{ left: `${at.left}%`, top: `${at.top}%` }}
    >
      <span className="grid size-5 place-items-center rounded-full bg-ink font-mono text-[0.625rem] text-paper">
        {n}
      </span>
      {label}
    </span>
  );
}

/** Fila de vidrio de una pieza. El lado derecho queda para el producto (pasos 07–08). */
function PieceRow({ garment }: { garment: Garment }) {
  const details = [
    CATEGORY_LABEL[garment.category],
    garment.color.name,
    garment.fit,
    garment.material,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="grid grid-cols-[3.75rem_minmax(0,1fr)] items-center gap-3.5 rounded-[20px] glass p-2.5">
      <span className="grid size-[3.75rem] place-items-center rounded-[14px] bg-sand/80">
        <Pebble hex={garment.color.hex} size="lg" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{garment.description}</p>
        <p className="mt-0.5 text-xs text-stone">{details}</p>
      </div>
      {/* Pasos 07–08: precio del producto recomendado y "Comprar ↗" a la derecha de la fila. */}
    </li>
  );
}

/** Tono de cada tarjeta "Por qué te queda bien" según su aspecto, como en el diseño. */
const NEUTRAL_TONE = {
  card: "bg-tint-stone [--topo-line:rgb(31_36_32/0.12)]",
  label: "text-bark",
};
const REASON_TONE: Record<LookReasonAspect, { card: string; label: string }> = {
  COLOR: { card: "bg-tint-clay [--topo-line:rgb(184_101_63/0.18)]", label: "text-clay-dark" },
  SILHOUETTE: { card: "bg-tint-moss [--topo-line:rgb(78_91_60/0.18)]", label: "text-moss" },
  FACE: NEUTRAL_TONE,
  HAIR: NEUTRAL_TONE,
  STYLE: NEUTRAL_TONE,
};

/** Tarjeta de una razón con su etiqueta "COLOR · CÁLIDO" (sin calificativo: solo el aspecto). */
function ReasonCard({ reason }: { reason: LookReason }) {
  const tone = REASON_TONE[reason.aspect];
  const label = [REASON_ASPECT_LABEL[reason.aspect], reason.qualifier.trim()]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className={`relative overflow-hidden rounded-[22px] p-[1.125rem] ${tone.card}`}>
      <div aria-hidden="true" className="absolute inset-0 topo-card" />
      <p className={`relative font-mono text-[0.625rem] tracking-[0.08em] uppercase ${tone.label}`}>
        {label}
      </p>
      <p className="relative mt-1.5 text-[0.8125rem] leading-relaxed text-ink">{reason.text}</p>
    </div>
  );
}

/** Último término del nombre en itálica de acento ("Smart casual *cálido*"). */
function AccentTitle({ name }: { name: string }) {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return <>{name}</>;
  return (
    <>
      {words.slice(0, -1).join(" ")} <em className="text-moss">{words.at(-1)}</em>
    </>
  );
}

export default async function LookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/app/looks/${id}`);
  const [look, plan, looks] = await Promise.all([
    getLook(user.id, id),
    getPlan(user.id),
    getLookSummaries(user.id),
  ]);
  if (!look) notFound();

  const header = (
    <div className="flex items-center gap-3 text-[0.8125rem] text-stone">
      <Link href="/app/looks" className="hover:text-ink">
        ← Mis looks
      </Link>
      <span className="flex-1" />
      <nav aria-label="Otros looks">
        <ul className="flex gap-1 rounded-2xl well p-1 font-mono text-[0.6875rem]">
          {looks.map((other) => (
            <li key={other.id}>
              <Link
                href={`/app/looks/${other.id}`}
                aria-current={other.id === look.id ? "page" : undefined}
                aria-label={`Look ${other.position}`}
                className={`block rounded-xl px-2.5 py-1 ${other.id === look.id ? "bg-cream text-ink shadow-[0_2px_6px_rgb(48_44_30/0.15)]" : "hover:text-ink"}`}
              >
                {twoDigits(other.position)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );

  if (look.locked) {
    return (
      <>
        <TrackEvent name="locked_look_clicked" properties={{ position: look.position }} />
        {header}
        <div className="mt-8 grid gap-10 md:grid-cols-2">
          <LockedLookCard name={look.name} position={look.position} featured />
          <div id="premium">
            <PaywallCard />
          </div>
        </div>
      </>
    );
  }

  const { spec } = look;
  const generating = look.status === "PENDING" || look.status === "GENERATING";
  const pieces = lookPieces(spec);
  const showPins = Boolean(look.imageUrl) && spec.image_prompt_data.framing === "FULL_BODY";
  // El pelo es la pieza 1; las prendas siguen en el orden de la lista.
  const pins = showPins
    ? [
        { n: 1, label: "Corte", at: PIN_POSITION.hair },
        ...pieces.map((piece, i) => ({
          n: i + 2,
          label: CATEGORY_LABEL[piece.garment.category],
          at: PIN_POSITION[piece.slot],
        })),
      ].filter((pin): pin is { n: number; label: string; at: { left: number; top: number } } =>
        Boolean(pin.at),
      )
    : [];

  return (
    <>
      <AutoRefresh active={generating} />
      <TrackEvent
        name={plan.isPremium ? "premium_look_viewed" : "free_look_viewed"}
        properties={{ position: look.position }}
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-9 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          {look.imageUrl ? (
            <figure className="relative aspect-[3/4] overflow-hidden rounded-[34px] shadow-[0_40px_60px_-40px_rgb(48_44_30/0.6)]">
              {/* <img>: imagen privada con URL firmada, fuera del optimizador. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={look.imageUrl}
                alt={`Vos con el look ${spec.name}`}
                className="absolute inset-0 size-full object-cover"
              />
              {pins.length ? (
                <div aria-hidden="true">
                  {pins.map((pin) => (
                    <Pin key={pin.n} n={pin.n} label={pin.label} at={pin.at} />
                  ))}
                </div>
              ) : null}
            </figure>
          ) : (
            <LookCard
              look={spec}
              position={look.position}
              imageUrl={null}
              status={look.status}
              featured
            />
          )}
        </div>

        <div className="flex flex-col gap-8 xl:grid xl:grid-cols-[minmax(0,1fr)_16rem] xl:gap-7">
          <div className="flex flex-col gap-4">
            {header}
            <div className="mt-2 flex items-center gap-3.5">
              <PaletteRing
                colors={spec.palette.map((c) => c.hex)}
                label={twoDigits(look.position)}
                size="lg"
                inner="bg-ivory"
              />
              <h1 className="text-4xl leading-none text-balance sm:text-[2.625rem]">
                <AccentTitle name={spec.name} />
              </h1>
            </div>
            <p className="text-sm leading-relaxed text-bark">{spec.concept}</p>

            <section aria-labelledby="look-pieces" className="mt-2">
              <h2 id="look-pieces" className="eyebrow">
                {pieces.length + 1} piezas
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                <li className="rounded-[20px] glass">
                  <details className="group">
                    <summary className="grid cursor-pointer list-none grid-cols-[3.75rem_minmax(0,1fr)_auto] items-center gap-3.5 p-2.5 [&::-webkit-details-marker]:hidden">
                      <span className="relative size-[3.75rem] overflow-hidden rounded-[14px] bg-sand">
                        {look.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={look.imageUrl}
                            alt=""
                            className="absolute inset-0 size-full origin-[50%_8%] scale-[2.2] object-cover object-top"
                          />
                        ) : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{spec.hair.style}</span>
                        <span className="block text-xs text-stone">Peinado y grooming</span>
                      </span>
                      <span className="rounded-2xl bg-sand px-3.5 py-2 text-xs group-open:bg-ink group-open:text-paper">
                        Ver ficha
                      </span>
                    </summary>
                    <div className="space-y-2 px-4 pt-1 pb-4 text-sm leading-relaxed text-bark">
                      {spec.hair.notes ? <p>{spec.hair.notes}</p> : null}
                      <p>
                        <span className="font-medium text-ink">Grooming: </span>
                        {spec.grooming.description}
                      </p>
                    </div>
                  </details>
                </li>
                {pieces.map(({ slot, garment }) => (
                  <PieceRow key={slot} garment={garment} />
                ))}
              </ul>
              <p className="mt-5 text-[0.8125rem] text-bark">
                <span className="font-medium text-ink">Fit: </span>
                {spec.fit.overall}
              </p>
              {spec.fit.notes.length ? (
                <ul className="mt-2 space-y-1.5 text-[0.8125rem] text-bark">
                  {spec.fit.notes.map((note) => (
                    <li key={note} className="flex gap-2.5">
                      <span aria-hidden="true" className="text-moss">
                        +
                      </span>
                      {note}
                    </li>
                  ))}
                </ul>
              ) : null}
              {/* Paso 07: CTA "Encontrar este look" (píldora oscura a lo ancho) + ♡ guardar (paso 10b). */}
            </section>
          </div>

          <aside aria-labelledby="look-why" className="flex flex-col gap-3 xl:pt-14">
            <h2 id="look-why" className="text-[1.625rem] italic">
              Por qué te queda bien
            </h2>
            {spec.reasoning.map((reason) => (
              <ReasonCard key={reason.text} reason={reason} />
            ))}
            {spec.avoid.length ? (
              <div className="mt-2 rounded-[22px] glass p-[1.125rem]">
                <p className="eyebrow">Con este look, evitá</p>
                <ul className="mt-2 space-y-1.5 text-[0.8125rem] text-bark">
                  {spec.avoid.map((item) => (
                    <li key={item} className="flex gap-2.5">
                      <span aria-hidden="true" className="text-clay-dark">
                        −
                      </span>
                      <span>
                        <span className="sr-only">Evitar: </span>
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </>
  );
}
