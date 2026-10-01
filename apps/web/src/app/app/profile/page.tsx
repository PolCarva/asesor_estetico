import {
  type AdviceView,
  SIZE_KINDS,
  type StyleAdvice as StyleAdviceData,
  type StyleProfileCore,
} from "@asesor/shared";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { signOutAction } from "@/app/(auth)/actions";
import { Pebble } from "@/components/swatches";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireUser } from "@/lib/auth";
import { getPhotoUrls, getPlan, getProfile, getSizes, getStyleData } from "@/lib/data";
import {
  BODY_SHAPE_LABEL,
  CONTRAST_LABEL,
  FACE_SHAPE_LABEL,
  FRAME_LABEL,
  RISK_LABEL,
  sentenceList,
  SIZE_KIND_LABEL,
  sizeText,
  TATTOO_LABEL,
  TORSO_LEGS_LABEL,
  UNDERTONE_LABEL,
} from "@/lib/labels";

import { SizesForm } from "./sizes-form";

export const metadata: Metadata = { title: "Mi perfil" };

const tile = "flex flex-col gap-2 rounded-[30px] p-[1.375rem]";

function Label({ children, tone = "text-moss" }: { children: ReactNode; tone?: string }) {
  return (
    <p className={`font-mono text-[0.625rem] tracking-[0.08em] uppercase ${tone}`}>{children}</p>
  );
}

/** Rostro: la foto del usuario con la lectura (puntos y contorno), su forma y sus rasgos. */
function FaceTile({ core, photoUrl }: { core: StyleProfileCore; photoUrl: string | null }) {
  const { appearance } = core;
  const features = sentenceList(appearance.face_features);
  const detail = [
    features || null,
    `${features ? "contraste" : "Contraste"} ${CONTRAST_LABEL[appearance.contrast_level]}`,
    appearance.eye_color ? `ojos ${appearance.eye_color}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <section
      aria-labelledby="tile-face"
      className="relative aspect-[4/5] overflow-hidden rounded-[30px] bg-sand shadow-[0_30px_50px_-34px_rgb(48_44_30/0.6)] md:row-span-2 md:aspect-auto md:min-h-[34rem]"
    >
      {photoUrl ? (
        // <img>: foto privada con URL firmada, fuera del optimizador.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt="Tu foto de rostro"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-topo" />
      )}
      <div aria-hidden="true">
        <div className="absolute inset-0 dot-cloud [mask-image:radial-gradient(ellipse_34%_32%_at_50%_44%,#000_30%,transparent_72%)] [background-size:9px_9px] opacity-70" />
        <div className="absolute top-[44%] left-1/2 h-[46%] w-[58%] -translate-1/2 rounded-[46%_46%_40%_40%] border-[1.5px] border-paper/90" />
        <div className="absolute top-[44%] left-1/2 h-[54%] w-[68%] -translate-1/2 rounded-[46%_46%_40%_40%] border border-paper/45" />
      </div>
      <div className="absolute inset-x-4 bottom-4 rounded-[22px] glass-strong p-[1.125rem]">
        <Label>Forma de rostro</Label>
        <h2 id="tile-face" className="mt-1.5 text-[2rem] leading-none">
          {FACE_SHAPE_LABEL[appearance.face_shape]}
        </h2>
        <p className="mt-1.5 text-[0.8125rem] text-bark">{detail}</p>
      </div>
    </section>
  );
}

function ColorTile({ core, view }: { core: StyleProfileCore; view: AdviceView }) {
  const undertone = UNDERTONE_LABEL[core.appearance.skin_undertone];
  return (
    <section
      aria-labelledby="tile-color"
      className={`${tile} relative overflow-hidden bg-tint-clay [--topo-line:rgb(184_101_63/0.14)]`}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[repeating-radial-gradient(ellipse_at_100%_0%,transparent_0_16px,var(--topo-line)_16px_17px)]"
      />
      <div className="relative">
        <Label tone="text-clay-dark">Colorimetría</Label>
        <h2 id="tile-color" className="mt-1.5 text-[2rem] leading-none">
          {core.colors.season ?? `Paleta ${undertone}`}
        </h2>
        <p className="mt-1.5 text-xs text-bark">
          Subtono {undertone} · contraste {CONTRAST_LABEL[core.appearance.contrast_level]}
        </p>
      </div>
      <ul
        aria-label="Tus mejores colores"
        className="relative mt-auto flex flex-wrap items-end gap-2 pt-6"
      >
        {view.colors.best.slice(0, 5).map((color, i) => (
          <li key={color.hex}>
            <Pebble hex={color.hex} size="lg" index={i} />
            <span className="sr-only">{color.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Estilo. `wide`: banda a lo ancho debajo del bento (cuando hay tarjeta de proporciones). */
function StyleTile({ view, wide }: { view: AdviceView; wide: boolean }) {
  return (
    <section
      aria-labelledby="tile-style"
      className={`${tile} glass ${wide ? "md:col-span-2 lg:col-span-3 lg:flex-row lg:items-end lg:justify-between lg:gap-8" : ""}`}
    >
      <div>
        <Label>Tu estilo</Label>
        <h2 id="tile-style" className="mt-1.5 text-[1.75rem] leading-[1.05]">
          {view.direction.primary}
        </h2>
        {view.direction.secondary ? (
          <p className="mt-1 text-[0.8125rem] text-bark">con un toque {view.direction.secondary}</p>
        ) : null}
      </div>
      {view.direction.keywords.length ? (
        <ul
          className={`mt-auto flex flex-wrap gap-1.5 pt-6 ${wide ? "lg:justify-end lg:pt-0" : ""}`}
        >
          {view.direction.keywords.map((keyword) => (
            <li key={keyword} className="rounded-full well px-2.5 py-1 text-xs text-bark">
              {keyword}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

type KnownBodyShape = keyof typeof BODY_SHAPE_LABEL;

/**
 * Contorno de hombros, cintura y cadera de cada silueta (viewBox 60×80). Es el dibujo de la
 * categoría, no una medida de la persona.
 */
const SHAPE_WIDTHS: Record<KnownBodyShape, [number, number, number]> = {
  TRAPEZOID: [44, 32, 34],
  INVERTED_TRIANGLE: [50, 28, 28],
  RECTANGLE: [38, 36, 38],
  TRIANGLE: [32, 34, 46],
  OVAL: [36, 46, 38],
  HOURGLASS: [42, 26, 42],
};

function ShapeGlyph({ shape }: { shape: KnownBodyShape }) {
  const [shoulders, waist, hips] = SHAPE_WIDTHS[shape];
  const x = (width: number, side: -1 | 1) => 30 + (side * width) / 2;
  const outline = `M${x(shoulders, -1)} 10 L${x(shoulders, 1)} 10 L${x(waist, 1)} 44 L${x(hips, 1)} 70 L${x(hips, -1)} 70 L${x(waist, -1)} 44 Z`;
  return (
    <svg aria-hidden="true" viewBox="0 0 60 80" className="h-24 w-[4.5rem] shrink-0">
      {[10, 44, 70].map((y) => (
        <line key={y} x1="2" x2="58" y1={y} y2={y} className="stroke-line" strokeDasharray="2 3" />
      ))}
      <path
        d={outline}
        className="fill-tint-moss stroke-moss"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Silueta: la etiqueta es del núcleo (cualquier plan, D26) y las notas para equilibrarla son
 * de la asesoría (Premium). Los perfiles anteriores a v3 no tienen silueta (`UNKNOWN`): ahí
 * se muestra la contextura (Premium) o la tarjeta bloqueada (free), como antes.
 */
function SilhouetteTile({
  core,
  advice,
}: {
  core: StyleProfileCore;
  advice: StyleAdviceData | null;
}) {
  const shape = core.appearance.body_shape;
  const notes = advice?.body_proportions.balance_notes.filter((n) => n.trim()).slice(0, 3) ?? [];
  const title =
    shape !== "UNKNOWN"
      ? BODY_SHAPE_LABEL[shape]
      : advice
        ? FRAME_LABEL[advice.body_proportions.frame]
        : "Tus proporciones";
  return (
    <section aria-labelledby="tile-silhouette" className={`${tile} glass`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label>Silueta</Label>
          <h2 id="tile-silhouette" className="mt-1.5 text-[1.75rem] leading-[1.05]">
            {title}
          </h2>
          {!advice && shape === "UNKNOWN" ? (
            <p className="mt-1.5 text-[0.8125rem] text-bark">
              Cómo equilibrar tu silueta con cortes, largos y capas.
            </p>
          ) : null}
        </div>
        {shape !== "UNKNOWN" ? <ShapeGlyph shape={shape} /> : null}
      </div>
      {advice ? (
        notes.length ? (
          <ul className="mt-auto space-y-1.5 pt-6 text-[0.8125rem] text-bark">
            {notes.map((note) => (
              <li key={note} className="flex gap-2.5">
                <span aria-hidden="true" className="text-moss">
                  +
                </span>
                {note}
              </li>
            ))}
          </ul>
        ) : null
      ) : (
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-6">
          {shape !== "UNKNOWN" ? (
            <p className="text-[0.8125rem] text-bark">Cómo equilibrarla con cortes y largos:</p>
          ) : null}
          <LinkButton href="/app/looks#premium" variant="secondary" size="sm">
            Desbloquear con Premium
          </LinkButton>
        </div>
      )}
    </section>
  );
}

const TORSO_LEGS_SCALE = Object.entries(TORSO_LEGS_LABEL) as Array<
  [keyof typeof TORSO_LEGS_LABEL, string]
>;

/**
 * Proporciones torso/piernas como etiqueta: una escala de tres tramos con el que corresponde
 * marcado, sin porcentajes (la IA no mide desde una foto).
 */
function ProportionsTile({ value }: { value: keyof typeof TORSO_LEGS_LABEL }) {
  return (
    <section aria-labelledby="tile-proportions" className={`${tile} glass`}>
      <Label>Proporciones</Label>
      <h2 id="tile-proportions" className="mt-1.5 text-[1.75rem] leading-[1.05]">
        {TORSO_LEGS_LABEL[value]}
      </h2>
      <div aria-hidden="true" className="mt-auto pt-8">
        <div className="flex h-[22px] gap-1 overflow-hidden rounded-full well p-1">
          {TORSO_LEGS_SCALE.map(([key]) => (
            <span
              key={key}
              className={`flex-1 rounded-full ${key === value ? "bg-[linear-gradient(90deg,var(--color-copper),var(--color-clay))]" : ""}`}
            />
          ))}
        </div>
        <div className="mt-2 flex font-mono text-[0.625rem] tracking-[0.08em] uppercase">
          {TORSO_LEGS_SCALE.map(([key, label]) => (
            <span
              key={key}
              className={`flex-1 text-center first:text-left last:text-right ${key === value ? "text-clay-dark" : "text-stone"}`}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function KeysTile({ view }: { view: AdviceView }) {
  return (
    <section
      aria-labelledby="tile-keys"
      className={`${tile} relative overflow-hidden bg-forest text-bone`}
    >
      <span aria-hidden="true" className="absolute -right-7 -bottom-7 size-24 orb opacity-90" />
      <h2
        id="tile-keys"
        className="relative font-mono text-[0.625rem] tracking-[0.08em] text-sage uppercase"
      >
        Tus claves
      </h2>
      <ul className="relative mt-1 space-y-2 pb-12 text-[0.8125rem] leading-snug">
        {view.favors.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden="true">+</span>
            <span>
              <span className="sr-only">Te favorece: </span>
              {item}
            </span>
          </li>
        ))}
        {view.avoid.map((item) => (
          <li key={item} className="flex gap-2 text-mist">
            <span aria-hidden="true">−</span>
            <span>
              <span className="sr-only">Mejor evitar: </span>
              {item}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function ProfilePage() {
  const user = await requireUser("/app/profile");
  const [profile, plan, style, photoUrls, sizes] = await Promise.all([
    getProfile(user.id),
    getPlan(user.id),
    getStyleData(user.id),
    getPhotoUrls(user.id),
    getSizes(user.id),
  ]);
  const torsoLegs = style?.core.appearance.torso_legs ?? "UNKNOWN";

  return (
    <>
      <header className="mb-8">
        <p className="eyebrow">Mi perfil</p>
        <h1 className="mt-3 text-[2.5rem] leading-[1.02] sm:text-5xl lg:text-[3.125rem]">
          Lo que hace <em className="text-moss">única</em> tu imagen.
        </h1>
      </header>

      {style ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[1.05fr_1fr_1fr]">
            <FaceTile core={style.core} photoUrl={photoUrls.FACE_DETAIL ?? null} />
            <ColorTile core={style.core} view={style.view} />
            <SilhouetteTile core={style.core} advice={style.advice} />
            {torsoLegs !== "UNKNOWN" ? <ProportionsTile value={torsoLegs} /> : null}
            <KeysTile view={style.view} />
            <StyleTile view={style.view} wide={torsoLegs !== "UNKNOWN"} />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <LinkButton href="/app/looks#advice-title">Ver tu asesoría y tus looks</LinkButton>
          </div>
        </>
      ) : (
        <EmptyState
          title="Todavía no hay análisis"
          description="Tu perfil aparece acá cuando termine el análisis de tus fotos."
          action={<LinkButton href="/app/onboarding">Empezar mi análisis</LinkButton>}
        />
      )}

      <section
        id="cuenta"
        aria-labelledby="account-title"
        className="mt-16 scroll-mt-24 rounded-[30px] glass p-6 sm:p-8"
      >
        <h2 id="account-title" className="text-3xl">
          Tu cuenta
        </h2>
        <dl className="mt-6 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          {[
            ["Nombre", profile?.display_name ?? "—"],
            ["Email", user.email ?? "—"],
            ["País", profile?.country_code ?? "UY"],
            ["Plan", plan.isPremium ? "Premium" : "Gratuito"],
            ["Nivel de cambio", profile ? RISK_LABEL[profile.style_risk_level] : "—"],
            ["Tatuajes", profile ? TATTOO_LABEL[profile.tattoo_preference] : "—"],
            ...SIZE_KINDS.map((kind) => [
              SIZE_KIND_LABEL[kind],
              sizeText(sizes, kind) ?? "Sin cargar",
            ]),
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-line pb-3">
              <dt className="text-stone">{label}</dt>
              <dd className="text-right font-medium break-all">{value}</dd>
            </div>
          ))}
        </dl>
        <SizesForm sizes={sizes} />
        <div className="mt-6 flex flex-wrap gap-3">
          <LinkButton href="/app/onboarding/photos" variant="secondary" size="sm">
            Mis fotos
          </LinkButton>
          <form action={signOutAction}>
            <SubmitButton variant="primary" size="sm" pendingLabel="Saliendo…">
              Cerrar sesión
            </SubmitButton>
          </form>
        </div>
        <p className="mt-6 max-w-xl text-xs leading-relaxed text-stone">
          Tus fotos se guardan en almacenamiento privado, solo vos podés verlas y podés borrarlas en
          cualquier momento desde “Mis fotos”. No se usan para entrenar modelos.
        </p>
      </section>
    </>
  );
}
