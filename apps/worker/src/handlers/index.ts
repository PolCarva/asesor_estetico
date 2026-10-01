import {
  analyzeStyleProfile,
  type AIResult,
  generateLookImage,
  generateLookSpecs,
  PROMPT_VERSION,
  validatePhotos,
} from "@asesor/ai";
import {
  downloadPhotoAsDataUrl,
  enqueueJob,
  getLookForUser,
  getStylePreferences,
  getUserPhotos,
  isUserPremium,
  type JobRow,
  removeGeneratedLookImage,
  saveStyleProfileWithLooks,
  updateLook,
  updatePhotoValidation,
  uploadGeneratedLookImage,
  type UserPhotoRow,
} from "@asesor/db";
import { FREE_LOOKS, StoredLookSpecSchema } from "@asesor/shared";
import { refreshStoredProduct, searchLookProducts } from "./shopping";
import {
  type HandlerRegistry,
  isFinalFailure,
  type JobContext,
  NonRetryableJobError,
  parsePayload,
} from "./types";

export * from "./shopping";
export * from "./types";

/**
 * Handlers de jobs. El pipeline de análisis es real (usa el AIProvider configurado:
 * mock u OpenRouter) y el de shopping también (`./shopping`, proveedores según
 * SHOPPING_PROVIDER). El style board sigue con un mock.
 *
 * VALIDATE_PHOTOS → ANALYZE_STYLE_PROFILE → GENERATE_LOOK (look 1; 2 y 3 si es Premium)
 */

async function recordUsage(ctx: JobContext, job: JobRow, result: AIResult<unknown>) {
  await ctx.deps.analytics.recordAIUsage({
    user_id: job.user_id,
    job_id: job.id,
    operation: result.operation,
    ...result.usage,
    duration_ms: result.timing.duration_ms,
    success: true,
    metadata: { prompt_version: PROMPT_VERSION },
  });
}

async function photosForAI(ctx: JobContext, photos: UserPhotoRow[]) {
  return Promise.all(
    photos.map(async (photo) => ({
      photo_id: photo.id,
      type: photo.type,
      url: await downloadPhotoAsDataUrl(ctx.deps.db, photo),
    })),
  );
}

/** Fotos válidas del usuario (una por tipo). Sin las dos, no se puede analizar. */
async function validPhotos(ctx: JobContext, userId: string, photoIds?: string[]) {
  const photos = (await getUserPhotos(ctx.deps.db, userId, photoIds)).filter(
    (p) => p.status === "VALID",
  );
  if (
    !photos.some((p) => p.type === "MAIN_BODY") ||
    !photos.some((p) => p.type === "FACE_DETAIL")
  ) {
    throw new NonRetryableJobError("Faltan fotos válidas de cuerpo y rostro.");
  }
  return photos;
}

async function enqueueLookGeneration(
  ctx: JobContext,
  userId: string,
  looks: Array<{ id: string; position: number }>,
) {
  const premium = await isUserPremium(ctx.deps.db, userId);
  const toGenerate = looks.filter((look) => premium || look.position <= FREE_LOOKS);
  for (const look of toGenerate) {
    await enqueueJob(ctx.deps.db, {
      type: "GENERATE_LOOK",
      payload: { user_id: userId, look_id: look.id },
      userId,
      // El look gratis primero.
      priority: look.position === 1 ? 10 : 5,
      idempotencyKey: `look:${look.id}:full`,
    });
  }
  return toGenerate.length;
}

async function generateLook(job: JobRow, ctx: JobContext, variant: "FULL" | "PREVIEW") {
  const payload = parsePayload(job, variant === "FULL" ? "GENERATE_LOOK" : "GENERATE_LOOK_PREVIEW");
  const look = await getLookForUser(ctx.deps.db, payload.look_id, payload.user_id);
  const spec = StoredLookSpecSchema.safeParse(look.spec_json);
  if (!spec.success)
    throw new NonRetryableJobError("El look guardado no cumple el schema.", { cause: spec.error });
  // La imagen completa de un look bloqueado solo se genera para usuarios Premium.
  if (
    variant === "FULL" &&
    look.position > FREE_LOOKS &&
    !(await isUserPremium(ctx.deps.db, payload.user_id))
  ) {
    throw new NonRetryableJobError("Look bloqueado: requiere Premium.");
  }

  if (variant === "FULL") await updateLook(ctx.deps.db, look.id, { status: "GENERATING" });
  try {
    const references = await photosForAI(ctx, await validPhotos(ctx, payload.user_id));
    const image = await generateLookImage(
      ctx.deps.ai,
      { look: spec.data, reference_photos: references, variant },
      { signal: ctx.signal, timeoutMs: 180_000 },
    );
    await recordUsage(ctx, job, image);

    const path = await uploadGeneratedLookImage(ctx.deps.db, {
      userId: payload.user_id,
      lookId: look.id,
      variant: variant === "FULL" ? "full" : "preview",
      mimeType: image.data.mime_type,
      bytes: Buffer.from(image.data.base64, "base64"),
    });
    const previous = variant === "FULL" ? look.image_storage_path : look.preview_storage_path;
    await updateLook(
      ctx.deps.db,
      look.id,
      variant === "FULL"
        ? { image_storage_path: path, status: "READY" }
        : { preview_storage_path: path },
    );
    if (previous) await removeGeneratedLookImage(ctx.deps.db, previous);
    return { look_id: look.id, path, width: image.data.width, height: image.data.height };
  } catch (error) {
    if (variant === "FULL" && isFinalFailure(job, error)) {
      await updateLook(ctx.deps.db, look.id, { status: "FAILED" });
    }
    throw error;
  }
}

export const handlers: HandlerRegistry = {
  async VALIDATE_PHOTOS(job, ctx) {
    const payload = parsePayload(job, "VALIDATE_PHOTOS");
    const ids = payload.photos.map((p) => p.photo_id);
    const photos = await getUserPhotos(ctx.deps.db, payload.user_id, ids);
    if (photos.length !== ids.length)
      throw new NonRetryableJobError("Las fotos ya no existen (¿se reemplazaron?).");

    for (const photo of photos)
      await updatePhotoValidation(ctx.deps.db, photo.id, { status: "VALIDATING" });
    try {
      const result = await validatePhotos(
        ctx.deps.ai,
        { photos: await photosForAI(ctx, photos) },
        { signal: ctx.signal },
      );
      await recordUsage(ctx, job, result);

      for (const r of result.data.results) {
        await updatePhotoValidation(ctx.deps.db, r.photo_id, {
          status: r.valid ? "VALID" : "INVALID",
          metadata: {
            issues: r.issues,
            quality_score: r.quality_score,
            validated_at: new Date().toISOString(),
          },
        });
      }

      if (!result.data.can_continue) {
        await ctx.deps.analytics.trackEvent("photo_validation_failed", {
          userId: payload.user_id,
          properties: {
            issues: result.data.results.flatMap((r) => r.issues.map((i) => i.code)).join(","),
          },
        });
        return { can_continue: false };
      }

      await enqueueJob(ctx.deps.db, {
        type: "ANALYZE_STYLE_PROFILE",
        payload: { user_id: payload.user_id, photo_ids: ids },
        userId: payload.user_id,
        priority: 10,
        idempotencyKey: `analyze:${job.id}`,
      });
      return { can_continue: true };
    } catch (error) {
      // Si no habrá otro intento, las fotos no pueden quedar "validando" para siempre.
      if (isFinalFailure(job, error)) {
        for (const photo of photos) {
          await updatePhotoValidation(ctx.deps.db, photo.id, {
            status: "INVALID",
            metadata: {
              issues: [
                {
                  code: "LOW_QUALITY",
                  severity: "BLOCKING",
                  message: "No pudimos procesar la foto. Probá subirla de nuevo.",
                },
              ],
            },
          });
        }
      } else {
        for (const photo of photos)
          await updatePhotoValidation(ctx.deps.db, photo.id, { status: "UPLOADED" });
      }
      throw error;
    }
  },

  async ANALYZE_STYLE_PROFILE(job, ctx) {
    const payload = parsePayload(job, "ANALYZE_STYLE_PROFILE");
    const photos = await photosForAI(
      ctx,
      await validPhotos(ctx, payload.user_id, payload.photo_ids),
    );
    const preferences = await getStylePreferences(ctx.deps.db, payload.user_id);

    const profile = await analyzeStyleProfile(
      ctx.deps.ai,
      { photos, preferences, country_code: "UY" },
      { signal: ctx.signal },
    );
    await recordUsage(ctx, job, profile);
    const specs = await generateLookSpecs(
      ctx.deps.ai,
      { style_profile: profile.data, preferences, count: 3 },
      { signal: ctx.signal },
    );
    await recordUsage(ctx, job, specs);

    const saved = await saveStyleProfileWithLooks(ctx.deps.db, {
      userId: payload.user_id,
      profile: profile.data,
      looks: specs.data.looks,
    });
    const generating = await enqueueLookGeneration(ctx, payload.user_id, saved.looks);
    await ctx.deps.analytics.trackEvent("analysis_completed", { userId: payload.user_id });
    return { style_profile_id: saved.styleProfileId, looks: saved.looks.length, generating };
  },

  GENERATE_LOOK: (job, ctx) => generateLook(job, ctx, "FULL"),
  GENERATE_LOOK_PREVIEW: (job, ctx) => generateLook(job, ctx, "PREVIEW"),

  async GENERATE_STYLE_BOARD(job) {
    const payload = parsePayload(job, "GENERATE_STYLE_BOARD");
    return { style_profile_id: payload.style_profile_id, mock: true };
  },

  SEARCH_PRODUCTS: searchLookProducts,
  REFRESH_PRODUCT: refreshStoredProduct,
};
