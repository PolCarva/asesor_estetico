import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
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
    description:
      "De pie, de frente, con luz natural y ropa que te quede bien al cuerpo. Sin filtros.",
  },
  {
    type: "FACE_DETAIL",
    title: "Rostro",
    description:
      "Primer plano con buena luz, sin anteojos de sol ni gorro. Pelo como lo usás siempre.",
  },
];

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

  return (
    <>
      <PageHeader
        eyebrow="Paso 1 de 4"
        title="Tus fotos"
        description="Necesitamos dos fotos para analizar tu imagen. Formatos JPG, PNG o WEBP de hasta 10 MB. Solo vos podés verlas."
      />
      <AutoRefresh active={pipeline.stage === "VALIDATING"} />
      <div className="grid gap-6 md:grid-cols-2">
        {SLOTS.map((slot) => (
          <PhotoSlot key={slot.type} {...slot} photo={byType.get(slot.type) ?? null} />
        ))}
      </div>
      {byType.size === 2 ? (
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <LinkButton href="/app/onboarding" size="lg">
            Continuar al análisis
          </LinkButton>
          <p className="text-sm text-stone">Siguiente paso: tus preferencias de estilo.</p>
        </div>
      ) : null}
    </>
  );
}
