import "server-only";

import { createServerSupabaseClient } from "@asesor/db/server";
import { PhotoValidationResultSchema, type UserPhotoType } from "@asesor/shared";
import { z } from "zod";

export type PipelineStage =
  | "NEEDS_PHOTOS"
  | "READY"
  | "VALIDATING"
  | "PHOTOS_INVALID"
  | "ANALYZING"
  | "GENERATING"
  | "DONE"
  | "FAILED";

const IssuesSchema = z.object({ issues: PhotoValidationResultSchema.shape.issues });

export interface PhotoState {
  id: string;
  type: UserPhotoType;
  status: "UPLOADED" | "VALIDATING" | "VALID" | "INVALID";
  issues: Array<{ code: string; severity: "BLOCKING" | "WARNING"; message: string }>;
}

const PIPELINE_JOBS = ["VALIDATE_PHOTOS", "ANALYZE_STYLE_PROFILE", "GENERATE_LOOK"] as const;

/**
 * Estado del análisis del usuario, derivado de sus fotos, jobs y perfil activo.
 * Todo con el cliente del usuario (RLS: jobs expone solo columnas no sensibles).
 */
export async function getPipelineState(userId: string) {
  const supabase = await createServerSupabaseClient();
  const [{ data: photoRows }, { data: jobs }, { data: profile }] = await Promise.all([
    supabase.from("user_photos").select("id, type, status, metadata_json").eq("user_id", userId),
    supabase
      .from("jobs")
      .select("id, type, status, created_at")
      .eq("user_id", userId)
      .in("type", [...PIPELINE_JOBS])
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("style_profiles")
      .select("created_at")
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle(),
  ]);

  const photos: PhotoState[] = (photoRows ?? []).map((row) => {
    const parsed = IssuesSchema.safeParse(row.metadata_json);
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      issues: parsed.success ? parsed.data.issues : [],
    };
  });

  const active = (type: (typeof PIPELINE_JOBS)[number]) =>
    (jobs ?? []).some((j) => j.type === type && (j.status === "QUEUED" || j.status === "RUNNING"));
  const latest = (type: (typeof PIPELINE_JOBS)[number]) =>
    (jobs ?? []).find((j) => j.type === type);
  const newerThanProfile = (createdAt: string | undefined) =>
    Boolean(createdAt) && (!profile || new Date(createdAt!) > new Date(profile.created_at));

  let stage: PipelineStage;
  if (active("VALIDATE_PHOTOS")) stage = "VALIDATING";
  else if (active("ANALYZE_STYLE_PROFILE")) stage = "ANALYZING";
  else if (photos.length < 2) stage = "NEEDS_PHOTOS";
  else if (photos.some((p) => p.status === "INVALID")) stage = "PHOTOS_INVALID";
  else if (
    (latest("ANALYZE_STYLE_PROFILE")?.status === "FAILED" &&
      newerThanProfile(latest("ANALYZE_STYLE_PROFILE")?.created_at)) ||
    (latest("VALIDATE_PHOTOS")?.status === "FAILED" &&
      newerThanProfile(latest("VALIDATE_PHOTOS")?.created_at))
  )
    stage = "FAILED";
  else if (active("GENERATE_LOOK")) stage = "GENERATING";
  else stage = profile ? "DONE" : "READY";

  return {
    stage,
    photos,
    hasProfile: Boolean(profile),
    busy: ["VALIDATING", "ANALYZING", "GENERATING"].includes(stage),
  };
}
