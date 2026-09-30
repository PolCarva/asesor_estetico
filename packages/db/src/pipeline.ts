import {
  AppError,
  isPremiumSubscription,
  type LookSpec,
  STORAGE_BUCKETS,
  type StyleProfile,
} from "@asesor/shared";

import { getLatestSubscription } from "./auth";
import { type LookRow, toJson, type TypedSupabaseClient, type UserPhotoRow } from "./types";

/**
 * Acceso a datos del pipeline de análisis. Lo usa el worker con el cliente
 * service role, así que cada función filtra explícitamente por usuario.
 */

/** Límite para mandar una foto a la IA (los proveedores rechazan imágenes muy pesadas). */
export const MAX_AI_PHOTO_BYTES = 5 * 1024 * 1024;

export async function getUserPhotos(
  db: TypedSupabaseClient,
  userId: string,
  photoIds?: string[],
): Promise<UserPhotoRow[]> {
  let query = db.from("user_photos").select("*").eq("user_id", userId);
  if (photoIds) query = query.in("id", photoIds);
  const { data, error } = await query.order("type");
  if (error) throw new AppError("INTERNAL", "No se pudieron leer las fotos.", { cause: error });
  return data;
}

/** Descarga una foto privada y la devuelve como data URL (para enviarla a la IA). */
export async function downloadPhotoAsDataUrl(
  db: TypedSupabaseClient,
  photo: UserPhotoRow,
): Promise<string> {
  const { data, error } = await db.storage
    .from(STORAGE_BUCKETS.userPhotos)
    .download(photo.storage_path);
  if (error || !data)
    throw new AppError("INTERNAL", "No se pudo descargar la foto.", { cause: error });
  const bytes = Buffer.from(await data.arrayBuffer());
  if (bytes.byteLength > MAX_AI_PHOTO_BYTES) {
    throw new AppError("VALIDATION_FAILED", "PHOTO_TOO_LARGE_FOR_AI");
  }
  return `data:${photo.mime_type};base64,${bytes.toString("base64")}`;
}

export async function updatePhotoValidation(
  db: TypedSupabaseClient,
  photoId: string,
  update: { status: UserPhotoRow["status"]; metadata?: Record<string, unknown> },
) {
  const { error } = await db
    .from("user_photos")
    .update({
      status: update.status,
      ...(update.metadata ? { metadata_json: toJson(update.metadata) } : {}),
    })
    .eq("id", photoId);
  if (error) throw new AppError("INTERNAL", "No se pudo actualizar la foto.", { cause: error });
}

export async function getStylePreferences(db: TypedSupabaseClient, userId: string) {
  const { data, error } = await db
    .from("profiles")
    .select("style_risk_level, tattoo_preference")
    .eq("id", userId)
    .single();
  if (error) throw new AppError("NOT_FOUND", "Perfil inexistente.", { cause: error });
  return { risk_level: data.style_risk_level, tattoo_preference: data.tattoo_preference };
}

/** Guarda StyleProfile + 3 looks en una sola transacción (función SQL). */
export async function saveStyleProfileWithLooks(
  db: TypedSupabaseClient,
  input: { userId: string; profile: StyleProfile; looks: LookSpec[] },
): Promise<{ styleProfileId: string; looks: Array<{ id: string; position: number }> }> {
  const { data, error } = await db.rpc("create_style_profile_with_looks", {
    p_user_id: input.userId,
    p_profile: toJson(input.profile),
    p_looks: toJson(input.looks),
  });
  if (error || !data?.[0])
    throw new AppError("INTERNAL", "No se pudo guardar el perfil de estilo.", { cause: error });
  return {
    styleProfileId: data[0].style_profile_id,
    looks: data
      .map((row) => ({ id: row.look_id, position: row.look_position }))
      .sort((a, b) => a.position - b.position),
  };
}

export async function isUserPremium(db: TypedSupabaseClient, userId: string): Promise<boolean> {
  return isPremiumSubscription(await getLatestSubscription(db, userId));
}

export async function getLookForUser(
  db: TypedSupabaseClient,
  lookId: string,
  userId: string,
): Promise<LookRow> {
  const { data, error } = await db
    .from("looks")
    .select("*")
    .eq("id", lookId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new AppError("INTERNAL", "No se pudo leer el look.", { cause: error });
  if (!data) throw new AppError("NOT_FOUND", "Look inexistente.");
  return data;
}

export async function updateLook(
  db: TypedSupabaseClient,
  lookId: string,
  patch: Partial<Pick<LookRow, "status" | "image_storage_path" | "preview_storage_path">>,
) {
  const { error } = await db.from("looks").update(patch).eq("id", lookId);
  if (error) throw new AppError("INTERNAL", "No se pudo actualizar el look.", { cause: error });
}

const EXTENSION = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;

/** Sube una imagen generada al bucket privado generated-looks y devuelve su ruta. */
export async function uploadGeneratedLookImage(
  db: TypedSupabaseClient,
  input: {
    userId: string;
    lookId: string;
    variant: "full" | "preview";
    mimeType: keyof typeof EXTENSION;
    bytes: Uint8Array;
  },
): Promise<string> {
  const path = `${input.userId}/${input.lookId}/${input.variant}-${Date.now()}.${EXTENSION[input.mimeType]}`;
  const { error } = await db.storage
    .from(STORAGE_BUCKETS.generatedLooks)
    .upload(path, input.bytes, {
      contentType: input.mimeType,
      upsert: false,
      cacheControl: "private, max-age=0",
    });
  if (error)
    throw new AppError("INTERNAL", "No se pudo guardar la imagen generada.", { cause: error });
  return path;
}

export async function removeGeneratedLookImage(db: TypedSupabaseClient, path: string) {
  await db.storage.from(STORAGE_BUCKETS.generatedLooks).remove([path]);
}
