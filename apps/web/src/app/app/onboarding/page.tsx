import type { Metadata } from "next";
import Link from "next/link";

import { AutoRefresh } from "@/components/auto-refresh";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { FormMessage } from "@/components/ui/states";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/data";
import { getPipelineState, type PipelineStage } from "@/lib/pipeline";

import { AnalysisForm } from "./analysis-form";

export const metadata: Metadata = { title: "Onboarding" };

const PROGRESS: Array<{ stage: PipelineStage; label: string }> = [
  { stage: "VALIDATING", label: "Revisando tus fotos" },
  { stage: "ANALYZING", label: "Analizando tu estilo y armando tus 3 looks" },
  { stage: "GENERATING", label: "Generando la imagen de tu look" },
];

export default async function OnboardingPage() {
  const user = await requireUser("/app/onboarding");
  const [profile, pipeline] = await Promise.all([getProfile(user.id), getPipelineState(user.id)]);
  const current = PROGRESS.findIndex((p) => p.stage === pipeline.stage);
  const invalid = pipeline.photos.filter((p) => p.status === "INVALID");

  return (
    <>
      <AutoRefresh active={pipeline.busy} />
      <PageHeader
        eyebrow="Onboarding"
        title="Empecemos por conocerte"
        description="Subí tus fotos, contanos cuánto querés cambiar y nuestro asesor arma tu perfil de estilo y tres looks pensados para vos."
      />

      {pipeline.busy ? (
        <Card aria-live="polite">
          <p className="eyebrow">En curso</p>
          <ol className="mt-5 space-y-4">
            {PROGRESS.map((step, i) => {
              const state = i < current ? "done" : i === current ? "current" : "todo";
              return (
                <li key={step.stage} className="flex items-center gap-4">
                  <span
                    aria-hidden="true"
                    className={`flex size-8 items-center justify-center rounded-full text-sm ${
                      state === "done"
                        ? "bg-moss text-ivory"
                        : state === "current"
                          ? "animate-pulse bg-ink text-ivory"
                          : "bg-sand"
                    }`}
                  >
                    {state === "done" ? "✓" : i + 1}
                  </span>
                  <span className={state === "todo" ? "text-stone" : "font-medium"}>
                    {step.label}
                  </span>
                  <span className="sr-only">
                    {state === "done"
                      ? "completado"
                      : state === "current"
                        ? "en curso"
                        : "pendiente"}
                  </span>
                </li>
              );
            })}
          </ol>
          {pipeline.stage === "GENERATING" ? (
            <div className="mt-6">
              <LinkButton href="/app/looks" variant="secondary">
                Ver mis looks
              </LinkButton>
            </div>
          ) : null}
        </Card>
      ) : (
        <div className="space-y-8">
          {pipeline.stage === "NEEDS_PHOTOS" ? (
            <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl">Primero, tus fotos</h2>
                <p className="mt-1 text-sm text-stone">
                  Necesitamos una de cuerpo entero y una de rostro.
                </p>
              </div>
              <LinkButton href="/app/onboarding/photos">Subir mis fotos</LinkButton>
            </Card>
          ) : null}

          {pipeline.stage === "PHOTOS_INVALID" ? (
            <FormMessage>
              Alguna foto no sirve para el análisis:{" "}
              {invalid.flatMap((p) => p.issues.map((i) => i.message)).join(" ")}{" "}
              <Link href="/app/onboarding/photos" className="underline underline-offset-4">
                Cambiar fotos
              </Link>
            </FormMessage>
          ) : null}
          {pipeline.stage === "FAILED" ? (
            <FormMessage>
              No pudimos completar el análisis. Probá de nuevo en unos minutos.
            </FormMessage>
          ) : null}
          {pipeline.stage === "DONE" ? (
            <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl">Tu análisis está listo</h2>
                <p className="mt-1 text-sm text-stone">
                  Ya tenés tu perfil de estilo y tus tres looks.
                </p>
              </div>
              <LinkButton href="/app/looks">Ver mis looks</LinkButton>
            </Card>
          ) : null}

          <Card>
            <AnalysisForm
              risk={profile?.style_risk_level ?? "BALANCED"}
              tattoo={profile?.tattoo_preference ?? "NEUTRAL"}
              canSubmit={pipeline.stage !== "NEEDS_PHOTOS" && pipeline.stage !== "PHOTOS_INVALID"}
              submitLabel={pipeline.hasProfile ? "Volver a analizar" : "Analizar mis fotos"}
            />
          </Card>
        </div>
      )}
    </>
  );
}
