import {
  AppError,
  checkPhotoFile,
  SIGNED_URL_TTL_SECONDS,
  STORAGE_BUCKETS,
  type UserPhotoType,
} from "@asesor/shared";

import { requireResourceOwner } from "./auth";
import type { TypedSupabaseClient, UserPhotoRow } from "./types";

/**
 * Fotos del usuario en el bucket privado user-photos. Estas funciones reciben el
 * cliente del usuario (RLS + políticas de Storage aplican) y además verifican
 * la propiedad explícitamente.
 */

export interface UploadUserPhotoInput {
  userId: string;
  type: UserPhotoType;
  file: { name: string; type: string; size: number; bytes: Uint8Array };
}

export function buildUserPhotoPath(userId: string, type: UserPhotoType, extension: string) {
  return `${userId}/${type.toLowerCase()}-${crypto.randomUUID()}.${extension}`;
}

/** Sube (o reemplaza) la foto de un tipo. Valida tamaño, extensión y contenido real. */
export async function uploadUserPhoto(
  client: TypedSupabaseClient,
  input: UploadUserPhotoInput,
): Promise<UserPhotoRow> {
  const check = checkPhotoFile({
    name: input.file.name,
    size: input.file.size,
    declaredType: input.file.type,
    head: input.file.bytes.subarray(0, 16),
  });
  if (!check.ok) throw new AppError("VALIDATION_FAILED", check.reason);

  const path = buildUserPhotoPath(input.userId, input.type, check.extension);
  const bucket = client.storage.from(STORAGE_BUCKETS.userPhotos);

  const upload = await bucket.upload(path, input.file.bytes, {
    contentType: check.mimeType,
    upsert: false,
    cacheControl: "private, max-age=0",
  });
  if (upload.error)
    throw new AppError("INTERNAL", "No se pudo subir la foto.", { cause: upload.error });

  const { data: previous } = await client
    .from("user_photos")
    .select("*")
    .eq("user_id", input.userId)
    .eq("type", input.type)
    .maybeSingle();

  if (previous) {
    const { error } = await client.from("user_photos").delete().eq("id", previous.id);
    if (error) {
      await bucket.remove([path]);
      throw new AppError("INTERNAL", "No se pudo reemplazar la foto.", { cause: error });
    }
  }

  const { data, error } = await client
    .from("user_photos")
    .insert({
      user_id: input.userId,
      type: input.type,
      storage_path: path,
      mime_type: check.mimeType,
      size_bytes: input.file.size,
      metadata_json: {},
    })
    .select("*")
    .single();

  if (error || !data) {
    await bucket.remove([path]);
    throw new AppError("INTERNAL", "No se pudo guardar la foto.", { cause: error });
  }

  if (previous) await bucket.remove([previous.storage_path]);
  return data;
}

async function getOwnedPhoto(client: TypedSupabaseClient, userId: string, photoId: string) {
  const { data, error } = await client
    .from("user_photos")
    .select("*")
    .eq("id", photoId)
    .maybeSingle();
  if (error) throw new AppError("INTERNAL", "No se pudo leer la foto.", { cause: error });
  return requireResourceOwner(data, userId);
}

export async function deleteUserPhoto(
  client: TypedSupabaseClient,
  input: { userId: string; photoId: string },
): Promise<void> {
  const photo = await getOwnedPhoto(client, input.userId, input.photoId);
  const removed = await client.storage
    .from(STORAGE_BUCKETS.userPhotos)
    .remove([photo.storage_path]);
  if (removed.error)
    throw new AppError("INTERNAL", "No se pudo borrar la foto.", { cause: removed.error });
  const { error } = await client.from("user_photos").delete().eq("id", photo.id);
  if (error) throw new AppError("INTERNAL", "No se pudo borrar la foto.", { cause: error });
}

/** URL firmada de corta duración. Nunca se cachea ni se guarda. */
export async function getUserPhotoSignedUrl(
  client: TypedSupabaseClient,
  input: { userId: string; photoId: string; expiresInSeconds?: number },
): Promise<string> {
  const photo = await getOwnedPhoto(client, input.userId, input.photoId);
  const { data, error } = await client.storage
    .from(STORAGE_BUCKETS.userPhotos)
    .createSignedUrl(photo.storage_path, input.expiresInSeconds ?? SIGNED_URL_TTL_SECONDS);
  if (error || !data) throw new AppError("INTERNAL", "No se pudo firmar la URL.", { cause: error });
  return data.signedUrl;
}
