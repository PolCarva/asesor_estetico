import { ALLOWED_PHOTO_EXTENSIONS, ALLOWED_PHOTO_MIME_TYPES, MAX_PHOTO_BYTES } from "./constants";
import type { PhotoMimeType } from "./schemas/photos";

/**
 * Detecta el tipo real de imagen por sus magic bytes. No se confía en el
 * Content-Type ni en la extensión que manda el cliente.
 */
export function sniffImageMimeType(bytes: Uint8Array): PhotoMimeType | null {
  const b = (i: number) => bytes[i];
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (
    b(0) === 0x89 &&
    b(1) === 0x50 &&
    b(2) === 0x4e &&
    b(3) === 0x47 &&
    b(4) === 0x0d &&
    b(5) === 0x0a &&
    b(6) === 0x1a &&
    b(7) === 0x0a
  ) {
    return "image/png";
  }
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...Array.from(bytes.subarray(start, end)));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export type PhotoFileCheck =
  | { ok: true; mimeType: PhotoMimeType; extension: "jpg" | "png" | "webp" }
  | { ok: false; reason: "EMPTY" | "TOO_LARGE" | "BAD_EXTENSION" | "BAD_TYPE" | "TYPE_MISMATCH" };

const EXTENSION_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const satisfies Record<PhotoMimeType, string>;

/** Valida nombre, tamaño, MIME declarado y contenido real de una foto subida. */
export function checkPhotoFile(input: {
  name: string;
  size: number;
  declaredType: string;
  head: Uint8Array;
}): PhotoFileCheck {
  if (input.size <= 0) return { ok: false, reason: "EMPTY" };
  if (input.size > MAX_PHOTO_BYTES) return { ok: false, reason: "TOO_LARGE" };

  const ext = input.name.split(".").pop()?.toLowerCase() ?? "";
  if (!(ALLOWED_PHOTO_EXTENSIONS as readonly string[]).includes(ext)) {
    return { ok: false, reason: "BAD_EXTENSION" };
  }
  if (!(ALLOWED_PHOTO_MIME_TYPES as readonly string[]).includes(input.declaredType)) {
    return { ok: false, reason: "BAD_TYPE" };
  }
  const sniffed = sniffImageMimeType(input.head);
  if (!sniffed) return { ok: false, reason: "BAD_TYPE" };
  if (sniffed !== input.declaredType) return { ok: false, reason: "TYPE_MISMATCH" };

  return { ok: true, mimeType: sniffed, extension: EXTENSION_BY_MIME[sniffed] };
}
