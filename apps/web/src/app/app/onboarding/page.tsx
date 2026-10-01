import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { AutoRefresh } from "@/components/auto-refresh";
import { PrivateImage } from "@/components/private-image";
import { LinkButton } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/states";
import { requireUser } from "@/lib/auth";
import { getActiveStyleProfile, getPhotoUrls, getProfile } from "@/lib/data";
import { firstName } from "@/lib/labels";
import { getPipelineState, type PhotoState } from "@/lib/pipeline";

import { AnalysisForm } from "./analysis-form";
import { AnalysisStage } from "./analysis-stage";

export const metadata: Metadata = { title: "Tu análisis" };

const PHOTO_CHIP: Record<PhotoState["status"], string> = {
  UPLOADED: "Lista",
  VALIDATING: "Revisando…",
  VALID: "✓ Validada",
  INVALID: "Conviene cambiarla",
};

/** Foto flotando con su estado, como las tarjetas inclinadas del diseño (2c). */
function FloatingPhoto({
  url,
  label,
  status,
  className,
}: {
  url: string | null;
  label: string;
  status: PhotoState["status"] | null;
  className: string;
}) {
  return (
    <figure
      className={`relative overflow-hidden rounded-[26px] border-[6px] border-paper/90 bg-sand shadow-contact ${className}`}
    >
      <PrivateImage src={url} alt={`Tu foto: ${label}`} className="size-full object-cover" />
      <figcaption className="absolute bottom-3 left-3 rounded-xl glass-strong px-2.5 py-1.5 font-mono text-[0.6875rem] tracking-[0.04em] uppercase">
        {status ? `${label} · ${PHOTO_CHIP[status]}` : `${label} · Falta`}
      </figcaption>
    </figure>
  );
}

export default async function OnboardingPage() {
  const user = await requireUser("/app/onboarding");
  const [profile, pipeline, photoUrls] = await Promise.all([
    getProfile(user.id),
    getPipelineState(user.id),
    getPhotoUrls(user.id),
  ]);
  const photoOf = (type: PhotoState["type"]) => pipeline.photos.find((p) => p.type === type);
  const name = firstName(profile?.display_name);

  if (pipeline.busy) {
    const busyStage = pipeline.stage as "VALIDATING" | "ANALYZING" | "GENERATING";
    // Solo en GENERATING el perfil activo es el de este análisis (en un re-análisis, antes es el viejo).
    const styleProfile = busyStage === "GENERATING" ? await getActiveStyleProfile(user.id) : null;
    return (
      <>
        <AutoRefresh active />
        <p className="mb-5 eyebrow">Paso 2 / 3 — Tu análisis</p>
        <AnalysisStage
          stage={busyStage}
          faceUrl={photoUrls.FACE_DETAIL ?? null}
          bodyUrl={photoUrls.MAIN_BODY ?? null}
          profile={styleProfile}
        />
        <p className="mt-4 text-center text-xs text-stone">
          Tarda uno o dos minutos. Podés salir de esta pantalla: seguimos trabajando.
        </p>
      </>
    );
  }

  const invalid = pipeline.photos.filter((p) => p.status === "INVALID");
  let title: ReactNode = (
    <>
      Fotos listas{name ? "," : "."} {name ? <em>{name}.</em> : null}
    </>
  );
  let notice: ReactNode = null;
  if (pipeline.stage === "NEEDS_PHOTOS") {
    title = (
      <>
        Primero, <em>tus fotos.</em>
      </>
    );
    notice = (
      <div className="flex flex-col items-start gap-4">
        <p className="text-sm leading-relaxed text-bark">
          Necesitamos una de cuerpo entero y una de rostro.
        </p>
        <LinkButton href="/app/onboarding/photos">Subir mis fotos</LinkButton>
      </div>
    );
  } else if (pipeline.stage === "PHOTOS_INVALID") {
    title = (
      <>
        Una foto <em>no sirve.</em>
      </>
    );
    notice = (
      <FormMessage>
        {invalid.flatMap((p) => p.issues.map((i) => i.message)).join(" ")}{" "}
        <Link href="/app/onboarding/photos" className="underline underline-offset-4">
          Cambiar fotos
        </Link>
      </FormMessage>
    );
  } else if (pipeline.stage === "FAILED") {
    notice = (
      <FormMessage>No pudimos completar el análisis. Probá de nuevo en unos minutos.</FormMessage>
    );
  } else if (pipeline.stage === "DONE") {
    title = (
      <>
        Tu análisis <em>está listo.</em>
      </>
    );
    notice = (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm leading-relaxed text-bark">
          Ya tenés tu perfil de estilo y tus tres looks.
        </p>
        <LinkButton href="/app/looks">Ver mis looks</LinkButton>
      </div>
    );
  }

  const body = photoOf("MAIN_BODY");
  const face = photoOf("FACE_DETAIL");

  return (
    <div className="grid overflow-hidden rounded-[32px] shadow-[0_30px_60px_-40px_rgb(48_44_30/0.5)] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="relative flex min-h-[26rem] items-center justify-center gap-[6%] overflow-hidden bg-sand/60 px-6 py-12 sm:min-h-[34rem]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-topo" />
        <FloatingPhoto
          url={photoUrls.MAIN_BODY ?? null}
          label="Cuerpo"
          status={body?.status ?? null}
          className="relative aspect-[3/4] w-[46%] max-w-[20rem] -rotate-3"
        />
        <FloatingPhoto
          url={photoUrls.FACE_DETAIL ?? null}
          label="Rostro"
          status={face?.status ?? null}
          className="relative mt-16 aspect-[4/5] w-[38%] max-w-[16.5rem] rotate-3"
        />
      </div>

      <div className="flex flex-col gap-7 bg-paper px-6 py-8 sm:px-9 sm:py-10">
        <span aria-hidden="true" className="size-16 animate-float orb" />
        <div>
          <p className="eyebrow">Paso 2 / 3 — Tu análisis</p>
          <h1 className="mt-3 text-4xl leading-[1.02] sm:text-[2.75rem] [&_em]:text-moss">
            {title}
          </h1>
        </div>
        {notice}
        <AnalysisForm
          risk={profile?.style_risk_level ?? "BALANCED"}
          tattoo={profile?.tattoo_preference ?? "NEUTRAL"}
          canSubmit={pipeline.stage !== "NEEDS_PHOTOS" && pipeline.stage !== "PHOTOS_INVALID"}
          submitLabel={pipeline.hasProfile ? "Volver a analizar" : "Descubrir mi mejor versión"}
        />
      </div>
    </div>
  );
}
