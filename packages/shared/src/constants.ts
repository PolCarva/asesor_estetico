export const APP_NAME = "Asesor Estético";

/** País del MVP. */
export const DEFAULT_COUNTRY_CODE = "UY";

/** Plan Premium: precio mensual en USD. */
export const PREMIUM_PRICE_USD = 4.99;

/** Cantidad de looks que genera cada análisis y cuántos son gratis. */
export const LOOKS_PER_PROFILE = 3;
export const FREE_LOOKS = 1;

/** Análisis con IA por usuario cada 24 h (control de costos). */
export const MAX_ANALYSES_PER_DAY = 3;

/** Las fotos se reducen en el navegador a este lado máximo antes de subirlas. */
export const PHOTO_MAX_DIMENSION = 2048;

/** Fotos del usuario. */
export const ALLOWED_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ALLOWED_PHOTO_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** Duración de las URLs firmadas de Storage, en segundos. */
export const SIGNED_URL_TTL_SECONDS = 60 * 5;

/** Nombres de los buckets privados de Storage. */
export const STORAGE_BUCKETS = {
  userPhotos: "user-photos",
  generatedLooks: "generated-looks",
} as const;
