import type { StyleProfileCore } from "@asesor/shared";

import { PrivateImage } from "@/components/private-image";
import { StepMark } from "@/components/step-mark";
import { Pebble } from "@/components/swatches";
import { LinkButton } from "@/components/ui/button";
import {
  BODY_SHAPE_LABEL,
  CONTRAST_LABEL,
  FACE_SHAPE_LABEL,
  sentenceList,
  TORSO_LEGS_LABEL,
  UNDERTONE_LABEL,
} from "@/lib/labels";
import type { PipelineStage } from "@/lib/pipeline";

type BusyStage = Extract<PipelineStage, "VALIDATING" | "ANALYZING" | "GENERATING">;

/**
 * Etapas reales del pipeline (jobs). Sin porcentajes: el SPEC no admite progreso
 * inventado, así que la barra avanza por etapa.
 */
const STEPS: Array<{ stage: BusyStage; label: string; doing: string }> = [
  { stage: "VALIDATING", label: "Revisando tus fotos", doing: "Luz, encuadre y nitidez…" },
  { stage: "ANALYZING", label: "Rostro, color y silueta", doing: "Leyendo tus rasgos…" },
  { stage: "GENERATING", label: "Tus looks en imagen", doing: "Probándote el primero…" },
];

const MESSAGE: Record<BusyStage, string> = {
  VALIDATING: "Primero revisamos que tus fotos sirvan.",
  ANALYZING: "Estamos buscando lo que mejor te queda.",
  GENERATING: "Ya casi. Te estamos probando tu primer look.",
};

/** Hallazgo pendiente: tarjeta punteada que titila mientras la IA trabaja. */
function PendingFinding({ label }: { label: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex animate-blink flex-col gap-2 rounded-[20px] border border-dashed border-bone/20 p-4 [animation-duration:1.8s]"
    >
      <p className="font-mono text-[0.625rem] text-mist">{label}</p>
      <div className="h-2 w-4/5 rounded-full bg-bone/10" />
      <div className="h-2 w-1/2 rounded-full bg-bone/10" />
    </div>
  );
}

function Finding({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-[20px] glass-night p-4">
      <p className="font-mono text-[0.625rem] text-sage">{label}</p>
      {children}
    </div>
  );
}

/** "Ovalado, mandíbula definida, frente media" o, sin rasgos, "Ovalado, contraste alto". */
function faceFinding(appearance: StyleProfileCore["appearance"]): string {
  const shape = FACE_SHAPE_LABEL[appearance.face_shape];
  const features = sentenceList(appearance.face_features).toLowerCase();
  return `${shape}, ${features || `contraste ${CONTRAST_LABEL[appearance.contrast_level]}`}.`;
}

/** "Trapecio · piernas largas". Vacío si el perfil no trae silueta ni proporciones. */
function silhouetteFinding(appearance: StyleProfileCore["appearance"]): string {
  const { body_shape: shape, torso_legs: torsoLegs } = appearance;
  const text = [
    shape !== "UNKNOWN" ? BODY_SHAPE_LABEL[shape].toLowerCase() : null,
    torsoLegs === "BALANCED"
      ? "proporciones equilibradas"
      : torsoLegs !== "UNKNOWN"
        ? TORSO_LEGS_LABEL[torsoLegs].toLowerCase()
        : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Pantalla del análisis en curso ("escaneo nocturno" del diseño 2d). Las etapas salen de
 * los jobs; los hallazgos, del perfil recién guardado (solo en GENERATING, cuando el
 * perfil activo ya es el de este análisis). Antes, quedan como tarjetas pendientes.
 */
export function AnalysisStage({
  stage,
  faceUrl,
  bodyUrl,
  profile,
}: {
  stage: BusyStage;
  faceUrl: string | null;
  bodyUrl: string | null;
  profile: StyleProfileCore | null;
}) {
  const current = STEPS.findIndex((s) => s.stage === stage);
  const findings = stage === "GENERATING" ? profile : null;
  const silhouette = findings ? silhouetteFinding(findings.appearance) : "";

  return (
    <section
      aria-labelledby="analysis-title"
      className="relative overflow-hidden rounded-[32px] bg-night text-bone"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-topo-night" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[52%] left-1/2 size-[38rem] -translate-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(199_130_90/0.22),transparent)]"
      />

      <div className="relative flex items-center justify-end px-6 pt-6 sm:px-8">
        <p className="flex items-center gap-2 font-mono text-[0.6875rem] text-peach uppercase">
          <span aria-hidden="true" className="size-1.5 animate-blink rounded-full bg-peach" />
          Analizando · etapa {current + 1} de {STEPS.length}
        </p>
      </div>

      <div className="relative grid gap-10 px-6 pt-6 pb-8 sm:px-8 lg:grid-cols-[14rem_minmax(0,1fr)_16rem] lg:gap-8">
        <div className="flex flex-col gap-6">
          <h2 id="analysis-title" className="text-[2.75rem] leading-none">
            Conociéndote<em className="text-peach">…</em>
          </h2>
          <ol aria-live="polite" className="flex flex-col gap-4">
            {STEPS.map((step, i) => {
              const state = i < current ? "done" : i === current ? "current" : "todo";
              const detail =
                state === "current"
                  ? step.doing
                  : state === "done" && step.stage === "ANALYZING" && findings
                    ? `Subtono ${UNDERTONE_LABEL[findings.appearance.skin_undertone]}`
                    : state === "done"
                      ? "Listo"
                      : null;
              return (
                <li
                  key={step.stage}
                  className={`flex items-center gap-3 ${state === "todo" ? "opacity-40" : ""}`}
                >
                  <StepMark state={state} />
                  <span>
                    <span className={`block text-sm ${state === "current" ? "text-peach" : ""}`}>
                      {step.label}
                    </span>
                    {detail ? <span className="block text-xs text-mist">{detail}</span> : null}
                    <span className="sr-only">
                      {state === "done"
                        ? "completado"
                        : state === "current"
                          ? "en curso"
                          : "pendiente"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div aria-hidden="true" className="flex items-start justify-center gap-5 sm:gap-8">
          <div className="w-1/2 max-w-[18.75rem]">
            <div className="relative aspect-[300/380] overflow-hidden rounded-[150px_150px_40px_40px] bg-forest shadow-[0_40px_80px_-30px_rgb(0_0_0/0.7)]">
              <PrivateImage
                src={faceUrl}
                alt=""
                className="absolute inset-0 size-full object-cover"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(23_27_21/0.15),rgb(23_27_21/0.55))]" />
              <div className="absolute inset-0 animate-dots dot-cloud [mask-image:radial-gradient(ellipse_36%_38%_at_50%_46%,#000_35%,transparent_75%)] [--dot:#f0c9a0]" />
              <div className="absolute inset-x-0 h-28 animate-scan bg-[linear-gradient(180deg,transparent,rgb(240_201_160/0.28)_92%,#f0c9a0)] motion-reduce:hidden" />
              <div className="absolute top-[46%] left-1/2 aspect-[4/5] w-2/3 [transform:translate(-50%,-50%)] animate-breath rounded-[50%] border border-peach/70" />
              <div className="absolute top-[46%] left-1/2 aspect-[4/5] w-4/5 [transform:translate(-50%,-50%)] animate-breath rounded-[50%] border border-peach/35 [animation-delay:0.7s]" />
            </div>
            <p className="mt-3 font-mono text-[0.6875rem] text-mist">ROSTRO</p>
          </div>
          <div className="relative w-[38%] max-w-[15rem] pt-4 [perspective:800px]">
            <div className="absolute -inset-x-10 -bottom-6 h-40 origin-bottom [transform:rotateX(74deg)] bg-[repeating-radial-gradient(ellipse_50%_50%_at_50%_50%,transparent_0_18px,rgb(240_201_160/0.35)_18px_19px)] [mask-image:radial-gradient(closest-side,#000,transparent)]" />
            <div className="relative aspect-[240/520] overflow-hidden rounded-3xl bg-forest">
              <PrivateImage
                src={bodyUrl}
                alt=""
                className="absolute inset-0 size-full object-cover"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(23_27_21/0.3),rgb(23_27_21/0.65))]" />
              <div className="absolute inset-0 dot-cloud [mask-image:linear-gradient(180deg,#000_0,#000_40%,transparent_60%)] [background-size:7px_7px] opacity-45 [--dot:#f0c9a0]" />
              <div className="absolute inset-x-0 h-24 animate-scan bg-[linear-gradient(180deg,transparent,rgb(240_201_160/0.28)_92%,#f0c9a0)] [animation-duration:2.6s] motion-reduce:hidden" />
            </div>
            <p className="mt-3 text-right font-mono text-[0.6875rem] text-sage">CUERPO</p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <p className="font-mono text-[0.6875rem] tracking-[0.08em] text-mist">
            LO QUE VAMOS VIENDO
          </p>
          {findings ? (
            <>
              <Finding label="ROSTRO">
                <p className="text-sm leading-snug">{faceFinding(findings.appearance)}</p>
              </Finding>
              <Finding label="COLOR">
                <p className="text-sm leading-snug">
                  Subtono {UNDERTONE_LABEL[findings.appearance.skin_undertone]}
                  {findings.colors.season ? ` · ${findings.colors.season}` : ""}.
                </p>
                <div className="flex gap-1.5">
                  {findings.colors.best.slice(0, 5).map((c, i) => (
                    <Pebble key={c.hex} hex={c.hex} size="md" index={i} />
                  ))}
                </div>
              </Finding>
              {silhouette ? (
                <Finding label="SILUETA">
                  <p className="text-sm leading-snug">{silhouette}</p>
                </Finding>
              ) : null}
              <Finding label="ESTILO">
                <p className="text-sm leading-snug">{findings.style_direction.primary}</p>
              </Finding>
            </>
          ) : (
            <>
              <PendingFinding label="ROSTRO" />
              <PendingFinding label="COLOR" />
              <PendingFinding label="SILUETA" />
              <PendingFinding label="ESTILO" />
            </>
          )}
        </div>
      </div>

      <div className="relative flex flex-col gap-4 px-6 pb-7 sm:flex-row sm:items-center sm:gap-5 sm:px-8">
        <div className="flex items-center gap-4">
          <span aria-hidden="true" className="size-11 shrink-0 animate-float orb" />
          <p className="font-display text-lg text-bone/90 italic sm:text-xl">{MESSAGE[stage]}</p>
        </div>
        <div aria-hidden="true" className="flex flex-1 gap-1.5">
          {STEPS.map((step, i) => (
            <span key={step.stage} className="h-0.5 flex-1 overflow-hidden rounded-full bg-bone/12">
              <span
                className={`block h-full bg-[linear-gradient(90deg,#b5c29e,#f0c9a0)] ${i < current ? "w-full" : i === current ? "w-1/2 animate-blink" : "w-0"}`}
              />
            </span>
          ))}
        </div>
        {stage === "GENERATING" ? (
          <LinkButton href="/app/looks" variant="light" size="sm">
            Ver mis looks
          </LinkButton>
        ) : null}
      </div>
    </section>
  );
}
