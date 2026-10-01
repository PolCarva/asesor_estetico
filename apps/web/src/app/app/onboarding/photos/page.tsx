import type { Metadata } from "next";

import { AutoRefresh } from "@/components/auto-refresh";
import { LinkButton } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { getPipelineState } from "@/lib/pipeline";
import { getUserPhotoSignedUrl } from "@asesor/db";
import { createServerSupabaseClient } from "@asesor/db/server";
import type { UserPhotoType } from "@asesor/shared";

import { PhotoSlot, type PhotoSlotProps } from "./photo-slot";

export const metadata: Metadata = { title: "Tus fotos" };

const SLOTS: Array<Omit<PhotoSlotProps, "photo">> = [
  {
    type: "MAIN_BODY",
    title: "Cuerpo entero",
    letter: "A",
    ratio: "3:4",
    description:
      "De pie, de frente, con luz natural y ropa que te quede bien al cuerpo. Sin filtros.",
  },
  {
    type: "FACE_DETAIL",
    title: "Rostro",
    letter: "B",
    ratio: "4:5",
    description:
      "Primer plano con buena luz, sin lentes de sol ni gorro. Pelo como lo usás siempre.",
  },
];

const TIPS = [
  ["i.", "Luz natural, de frente"],
  ["ii.", "Fondo liso"],
  ["iii.", "Ropa que te quede al cuerpo"],
  ["iv.", "Sin lentes de sol ni gorro"],
] as const;

export default async function PhotosPage() {
  const user = await requireUser("/app/onboarding/photos");
  const supabase = await createServerSupabaseClient();
  const pipeline = await getPipelineState(user.id);

  // URLs firmadas de corta duración, generadas en cada render y nunca cacheadas.
  const byType = new Map<UserPhotoType, NonNullable<PhotoSlotProps["photo"]>>();
  await Promise.all(
    pipeline.photos.map(async (photo) => {
      const url = await getUserPhotoSignedUrl(supabase, {
        userId: user.id,
        photoId: photo.id,
      }).catch(() => null);
      byType.set(photo.type, {
        id: photo.id,
        url,
        status: photo.status,
        issues: photo.issues.map((issue) => issue.message),
      });
    }),
  );
  const [body, face] = SLOTS;

  return (
    <>
      <AutoRefresh active={pipeline.stage === "VALIDATING"} />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 bg-topo-corner [mask-image:radial-gradient(ellipse_at_85%_5%,#000,transparent_75%)]"
      />
      <div>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)_minmax(0,18rem)] lg:gap-7">
          <div className="lg:pt-4">
            <p className="eyebrow">Paso 1 / 3 — Tus fotos</p>
            <h1 className="mt-5 text-5xl leading-[0.95] sm:text-6xl lg:text-[3.75rem] xl:text-[4.25rem]">
              Mostrate <br className="hidden sm:block" />
              <em className="text-moss">tal como sos.</em>
            </h1>
            <p className="mt-5 max-w-sm text-[0.9375rem] leading-relaxed text-bark">
              Con dos fotos alcanza. Leemos tu rostro, tu silueta y tu tono de piel para proponerte
              los 3 looks que mejor te quedan. Formatos JPG, PNG o WEBP de hasta 10 MB.
            </p>
            <ul className="mt-7 grid max-w-md grid-cols-2 gap-2.5">
              {TIPS.map(([mark, tip]) => (
                <li key={tip} className="rounded-2xl glass p-3.5">
                  <span aria-hidden="true" className="font-display text-2xl text-clay">
                    {mark}
                  </span>
                  <span className="mt-0.5 block text-[0.8125rem]">{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          {body ? <PhotoSlot {...body} photo={byType.get(body.type) ?? null} /> : null}

          <div className="flex flex-col gap-5">
            {face ? <PhotoSlot {...face} photo={byType.get(face.type) ?? null} /> : null}
            <p className="flex gap-2.5 px-1 text-xs leading-relaxed text-stone">
              <span aria-hidden="true" className="font-display text-lg leading-none text-moss">
                ◐
              </span>
              Tus fotos se guardan privadas: solo vos las ves y las podés borrar cuando quieras.
              Nunca entrenamos modelos con ellas.
            </p>
            <div className="lg:mt-auto">
              {byType.size === 2 ? (
                <LinkButton href="/app/onboarding" size="lg" className="w-full">
                  Analizar mis fotos
                </LinkButton>
              ) : (
                <>
                  <span
                    aria-disabled="true"
                    className="flex h-14 w-full items-center justify-center rounded-full bg-line text-[0.9375rem] font-medium text-stone"
                  >
                    Analizar mis fotos
                  </span>
                  <p className="mt-2 text-center text-xs text-stone">
                    Subí las dos fotos para seguir.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
