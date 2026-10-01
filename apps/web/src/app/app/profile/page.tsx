import type { AdviceView, StyleAdvice as StyleAdviceData, StyleProfileCore } from "@asesor/shared";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { signOutAction } from "@/app/(auth)/actions";
import { Pebble } from "@/components/swatches";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireUser } from "@/lib/auth";
import { getPhotoUrls, getPlan, getProfile, getStyleData } from "@/lib/data";
import {
  CONTRAST_LABEL,
  FACE_SHAPE_LABEL,
  FRAME_LABEL,
  RISK_LABEL,
  TATTOO_LABEL,
  UNDERTONE_LABEL,
} from "@/lib/labels";

export const metadata: Metadata = { title: "Mi perfil" };

const tile = "flex flex-col gap-2 rounded-[30px] p-[1.375rem]";

function Label({ children, tone = "text-moss" }: { children: ReactNode; tone?: string }) {
  return (
    <p className={`font-mono text-[0.625rem] tracking-[0.08em] uppercase ${tone}`}>{children}</p>
  );
}

/** Rostro: la foto del usuario con la lectura (puntos y contorno) y su forma de rostro. */
function FaceTile({ core, photoUrl }: { core: StyleProfileCore; photoUrl: string | null }) {
  const { appearance } = core;
  const detail = [
    `Contraste ${CONTRAST_LABEL[appearance.contrast_level]}`,
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

function StyleTile({ view }: { view: AdviceView }) {
  return (
    <section aria-labelledby="tile-style" className={`${tile} glass`}>
      <Label>Tu estilo</Label>
      <h2 id="tile-style" className="mt-1.5 text-[1.75rem] leading-[1.05]">
        {view.direction.primary}
      </h2>
      {view.direction.secondary ? (
        <p className="text-[0.8125rem] text-bark">con un toque {view.direction.secondary}</p>
      ) : null}
      {view.direction.keywords.length ? (
        <ul className="mt-auto flex flex-wrap gap-1.5 pt-6">
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

/** Silueta: dato de la asesoría (Premium). Free ve la tarjeta bloqueada. */
function SilhouetteTile({ advice }: { advice: StyleAdviceData | null }) {
  if (!advice) {
    return (
      <section aria-labelledby="tile-silhouette" className={`${tile} glass`}>
        <Label>Silueta</Label>
        <h2 id="tile-silhouette" className="mt-1.5 text-[1.75rem] leading-[1.05]">
          Tus proporciones
        </h2>
        <p className="text-[0.8125rem] text-bark">
          Cómo equilibrar tu silueta con cortes, largos y capas.
        </p>
        <div className="mt-auto pt-6">
          <LinkButton href="/app/looks#premium" variant="secondary" size="sm">
            Desbloquear con Premium
          </LinkButton>
        </div>
      </section>
    );
  }
  const notes = advice.body_proportions.balance_notes.filter((n) => n.trim()).slice(0, 3);
  return (
    <section aria-labelledby="tile-silhouette" className={`${tile} glass`}>
      <Label>Silueta</Label>
      <h2 id="tile-silhouette" className="mt-1.5 text-[1.75rem] leading-[1.05]">
        {FRAME_LABEL[advice.body_proportions.frame]}
      </h2>
      {notes.length ? (
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
      ) : null}
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
  const [profile, plan, style, photoUrls] = await Promise.all([
    getProfile(user.id),
    getPlan(user.id),
    getStyleData(user.id),
    getPhotoUrls(user.id),
  ]);

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
            <StyleTile view={style.view} />
            <SilhouetteTile advice={style.advice} />
            <KeysTile view={style.view} />
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
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-line pb-3">
              <dt className="text-stone">{label}</dt>
              <dd className="text-right font-medium break-all">{value}</dd>
            </div>
          ))}
        </dl>
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
