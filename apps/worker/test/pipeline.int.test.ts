import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { MockAIProvider } from "@asesor/ai";
import { AnalyticsService, MemoryAnalyticsProvider } from "@asesor/analytics";
import {
  getActiveStyleProfile,
  type Json,
  type JobRow,
  type TypedSupabaseClient,
} from "@asesor/db";
import { createAdminClient } from "@asesor/db/admin";
import { createLogger, type JobType, StyleAdviceSchema } from "@asesor/shared";
import { MockProductFetcher, MockSearchProvider } from "@asesor/shopping";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { handlers } from "../src/handlers";
import type { JobContext } from "../src/handlers/types";

const envFile = resolve(import.meta.dirname, "../../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function reachable() {
  if (!url || !key) return false;
  try {
    return (
      await fetch(`${url}/auth/v1/health`, {
        headers: { apikey: key },
        signal: AbortSignal.timeout(2000),
      })
    ).ok;
  } catch {
    return false;
  }
}
const available = await reachable();
if (!available && process.env.CI) throw new Error("[integration] Supabase local no disponible.");
const describeIntegration = available ? describe : describe.skip;

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

function runningJob(type: JobType, userId: string, payload: NonNullable<Json>): JobRow {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    type,
    status: "RUNNING",
    user_id: userId,
    payload,
    result: null,
    priority: 0,
    attempts: 1,
    max_attempts: 3,
    idempotency_key: null,
    scheduled_at: now,
    locked_at: now,
    locked_by: "test",
    finished_at: null,
    last_error: null,
    created_at: now,
    updated_at: now,
  };
}

describeIntegration("pipeline de análisis (MockAIProvider + Supabase local)", () => {
  const db = createAdminClient({ url: url!, serviceRoleKey: key! }) as TypedSupabaseClient;
  const usage = new MemoryAnalyticsProvider();
  const ctx: JobContext = {
    logger: createLogger({ service: "test", write: () => {} }),
    signal: new AbortController().signal,
    deps: {
      db,
      ai: new MockAIProvider(),
      analytics: new AnalyticsService({ provider: usage, enabled: true }),
      searchProvider: new MockSearchProvider(),
      fetcher: new MockProductFetcher(),
    },
  };
  let userId = "";
  const photoIds: string[] = [];
  const createdJobs: string[] = [];

  /** Toma de la tabla el job encolado por idempotency key y lo ejecuta como lo haría el runner. */
  async function runQueued(type: JobType, idempotencyKey: string) {
    const { data } = await db
      .from("jobs")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .single();
    expect(data?.type).toBe(type);
    createdJobs.push(data!.id);
    const running: JobRow = { ...data!, status: "RUNNING", attempts: 1 };
    return handlers[type]!(running, ctx);
  }

  beforeAll(async () => {
    const { data } = await db.auth.admin.createUser({
      email: `pipeline-${crypto.randomUUID()}@example.test`,
      password: `Pw-${crypto.randomUUID()}-1`,
      email_confirm: true,
    });
    userId = data.user!.id;
    for (const type of ["MAIN_BODY", "FACE_DETAIL"] as const) {
      const path = `${userId}/${type.toLowerCase()}-${crypto.randomUUID()}.png`;
      await db.storage.from("user-photos").upload(path, PNG, { contentType: "image/png" });
      const { data: row } = await db
        .from("user_photos")
        .insert({
          user_id: userId,
          type,
          storage_path: path,
          mime_type: "image/png",
          size_bytes: PNG.byteLength,
        })
        .select("id")
        .single();
      photoIds.push(row!.id);
    }
  });

  afterAll(async () => {
    if (createdJobs.length) await db.from("jobs").delete().in("id", createdJobs);
    if (userId) await db.auth.admin.deleteUser(userId);
  });

  it("fotos → validación → análisis → looks → imagen del look gratis", async () => {
    const validateJob = runningJob("VALIDATE_PHOTOS", userId, {
      user_id: userId,
      photos: [
        { photo_id: photoIds[0]!, type: "MAIN_BODY" },
        { photo_id: photoIds[1]!, type: "FACE_DETAIL" },
      ],
    });
    expect(await handlers.VALIDATE_PHOTOS!(validateJob, ctx)).toEqual({ can_continue: true });
    const { data: photos } = await db.from("user_photos").select("status").eq("user_id", userId);
    expect(photos?.map((p) => p.status)).toEqual(["VALID", "VALID"]);

    const analysis = await runQueued("ANALYZE_STYLE_PROFILE", `analyze:${validateJob.id}`);
    expect(analysis).toMatchObject({ looks: 3, generating: 1 });

    const { data: profile } = await db
      .from("style_profiles")
      .select("id, version, active, profile_json")
      .eq("user_id", userId)
      .single();
    expect(profile).toMatchObject({ version: 1, active: true });
    // Guardado partido: núcleo en profile_json, asesoría detallada (Premium) en style_advice.
    expect(Object.keys(profile!.profile_json as object).sort()).toEqual(
      ["appearance", "avoid", "colors", "schema_version", "strengths", "style_direction"].sort(),
    );
    const { data: advice } = await db
      .from("style_advice")
      .select("user_id, advice_json")
      .eq("style_profile_id", profile!.id)
      .single();
    expect(advice?.user_id).toBe(userId);
    expect(StyleAdviceSchema.parse(advice?.advice_json).hair.barber_instructions).not.toBe("");
    const stored = await getActiveStyleProfile(db, userId);
    expect(stored?.profile.schema_version).toBe(3);
    expect(stored?.profile.appearance.body_shape).not.toBe("UNKNOWN");
    expect(stored?.advice?.general_advice.length).toBeGreaterThan(0);
    const { data: looks } = await db
      .from("looks")
      .select("id, position, status")
      .eq("user_id", userId)
      .order("position");
    expect(looks?.map((l) => l.status)).toEqual(["PENDING", "PENDING", "PENDING"]);

    // Usuario free: solo se encoló la imagen del look 1.
    const { data: lookJobs } = await db
      .from("jobs")
      .select("idempotency_key")
      .eq("user_id", userId)
      .eq("type", "GENERATE_LOOK");
    expect(lookJobs?.map((j) => j.idempotency_key)).toEqual([`look:${looks![0]!.id}:full`]);

    const image = await runQueued("GENERATE_LOOK", `look:${looks![0]!.id}:full`);
    expect(image).toMatchObject({ look_id: looks![0]!.id, width: 1, height: 1 });
    const { data: look1 } = await db
      .from("looks")
      .select("status, image_storage_path")
      .eq("id", looks![0]!.id)
      .single();
    expect(look1?.status).toBe("READY");
    expect(look1?.image_storage_path?.startsWith(`${userId}/${looks![0]!.id}/full-`)).toBe(true);
    const { data: file } = await db.storage
      .from("generated-looks")
      .download(look1!.image_storage_path!);
    expect(file?.size).toBe(PNG.byteLength);

    expect(usage.usage.map((u) => u.operation)).toEqual([
      "VALIDATE_PHOTOS",
      "ANALYZE_STYLE_PROFILE",
      "GENERATE_LOOK_SPECS",
      "GENERATE_LOOK_IMAGE",
    ]);
    expect(usage.events.map((e) => e.name)).toContain("analysis_completed");
  });

  it("genera la imagen de un look guardado con razones de texto (formato anterior)", async () => {
    const { data: look1 } = await db
      .from("looks")
      .select("id, spec_json")
      .eq("user_id", userId)
      .eq("position", 1)
      .single();
    const spec = look1!.spec_json as { reasoning: Array<{ text: string }> };
    const legacy = { ...spec, reasoning: spec.reasoning.map((r) => r.text) };
    await db.from("looks").update({ spec_json: legacy }).eq("id", look1!.id);

    const job = runningJob("GENERATE_LOOK", userId, { user_id: userId, look_id: look1!.id });
    await expect(handlers.GENERATE_LOOK!(job, ctx)).resolves.toMatchObject({
      look_id: look1!.id,
    });
  });

  it("no genera la imagen de un look bloqueado para un usuario free", async () => {
    const { data: look2 } = await db
      .from("looks")
      .select("id")
      .eq("user_id", userId)
      .eq("position", 2)
      .single();
    const job = runningJob("GENERATE_LOOK", userId, { user_id: userId, look_id: look2!.id });
    await expect(handlers.GENERATE_LOOK!(job, ctx)).rejects.toThrow(/Premium/);
  });

  it("marca las fotos inválidas y corta el pipeline si la validación falla", async () => {
    const blurry = new MockAIProvider();
    blurry.validatePhotos = async (input) => ({
      output: {
        results: input.photos.map((p) => ({
          photo_id: p.photo_id,
          type: p.type,
          valid: false,
          issues: [{ code: "TOO_DARK", severity: "BLOCKING", message: "Muy oscura." }],
          quality_score: 0.1,
        })),
        can_continue: false,
      },
      model: "mock",
      usage: { input_tokens: 0, output_tokens: 0, image_count: 0, estimated_cost_usd: 0 },
    });
    const job = runningJob("VALIDATE_PHOTOS", userId, {
      user_id: userId,
      photos: [{ photo_id: photoIds[0]!, type: "MAIN_BODY" }],
    });
    const result = await handlers.VALIDATE_PHOTOS!(job, {
      ...ctx,
      deps: { ...ctx.deps, ai: blurry },
    });
    expect(result).toEqual({ can_continue: false });
    const { data: photo } = await db
      .from("user_photos")
      .select("status, metadata_json")
      .eq("id", photoIds[0]!)
      .single();
    expect(photo?.status).toBe("INVALID");
    expect(JSON.stringify(photo?.metadata_json)).toContain("TOO_DARK");
    const { count } = await db
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("idempotency_key", `analyze:${job.id}`);
    expect(count).toBe(0);
  });
});
