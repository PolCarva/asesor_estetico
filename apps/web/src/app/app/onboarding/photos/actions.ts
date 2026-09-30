"use server";

import { deleteUserPhoto, requireAuth, uploadUserPhoto } from "@asesor/db";
import { createServerSupabaseClient } from "@asesor/db/server";
import { isAppError, UserPhotoTypeSchema } from "@asesor/shared";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAnalytics } from "@/lib/analytics";
import { getLogger } from "@/lib/logger";
import { enforceRateLimit, rateLimiters } from "@/lib/rate-limit";

export type PhotoActionState = { error: string | null; ok?: boolean };

const VALIDATION_MESSAGES: Record<string, string> = {
  EMPTY: "El archivo está vacío.",
  TOO_LARGE: "La foto supera los 10 MB.",
  BAD_EXTENSION: "Usá una foto JPG, PNG o WEBP.",
  BAD_TYPE: "El archivo no es una imagen JPG, PNG o WEBP válida.",
  TYPE_MISMATCH: "El contenido del archivo no coincide con su formato.",
};

function toMessage(error: unknown): string {
  if (isAppError(error)) {
    if (error.code === "VALIDATION_FAILED")
      return VALIDATION_MESSAGES[error.message] ?? "Foto inválida.";
    if (
      error.code === "RATE_LIMITED" ||
      error.code === "AUTH_REQUIRED" ||
      error.code === "NOT_FOUND"
    )
      return error.message;
  }
  getLogger().error("error en acción de fotos", { error });
  return "No pudimos guardar la foto. Probá de nuevo.";
}

export async function uploadPhotoAction(
  _prev: PhotoActionState,
  formData: FormData,
): Promise<PhotoActionState> {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await requireAuth(supabase);
    await enforceRateLimit(rateLimiters.photoUpload, `upload:${user.id}`);

    const type = UserPhotoTypeSchema.parse(formData.get("type"));
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Elegí una foto." };

    await uploadUserPhoto(supabase, {
      userId: user.id,
      type,
      file: {
        name: file.name,
        type: file.type,
        size: file.size,
        bytes: new Uint8Array(await file.arrayBuffer()),
      },
    });
    await getAnalytics().trackEvent("photo_uploaded", { userId: user.id, properties: { type } });
    revalidatePath("/app/onboarding/photos");
    return { error: null, ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: "Tipo de foto inválido." };
    return { error: toMessage(error) };
  }
}

export async function deletePhotoAction(
  _prev: PhotoActionState,
  formData: FormData,
): Promise<PhotoActionState> {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await requireAuth(supabase);
    const photoId = z.uuid().parse(formData.get("photo_id"));
    await deleteUserPhoto(supabase, { userId: user.id, photoId });
    revalidatePath("/app/onboarding/photos");
    return { error: null, ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: "Foto inválida." };
    return { error: toMessage(error) };
  }
}
