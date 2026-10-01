import { splitStyleProfile, StoredLookSpecSchema } from "@asesor/shared";
import {
  FIXTURE_LOOK_SPECS,
  FIXTURE_STYLE_PROFILE,
  FIXTURE_STYLE_PROFILE_V1,
  FIXTURE_STYLE_PROFILE_V2,
} from "@asesor/shared/fixtures";
import { afterAll, beforeAll, expect, it } from "vitest";

import { getCurrentUser, requirePremium } from "../../src/auth";
import { deleteUserPhoto, getUserPhotoSignedUrl, uploadUserPhoto } from "../../src/storage";
import { getActiveStyleProfile } from "../../src/style-profile";
import { toJson } from "../../src/types";
import { adminClient, createTestUser, deleteTestUser, describeIntegration } from "./setup";

const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);
const pngFile = (name = "foto.png") => ({
  name,
  type: "image/png",
  size: PNG.byteLength,
  bytes: PNG,
});

describeIntegration("RLS, auth y Storage", () => {
  const admin = adminClient();
  let alice: Awaited<ReturnType<typeof createTestUser>>;
  let bob: Awaited<ReturnType<typeof createTestUser>>;
  let aliceLooks: { id: string; position: number }[] = [];
  let aliceProfileId = "";
  const { core, advice } = splitStyleProfile(FIXTURE_STYLE_PROFILE);

  const givePremium = (userId: string) =>
    admin.from("subscriptions").insert({
      user_id: userId,
      provider: "MOCK",
      provider_subscription_id: `test-${userId}`,
      status: "ACTIVE",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
    });

  beforeAll(async () => {
    alice = await createTestUser("alice");
    bob = await createTestUser("bob");
    const { data: profile } = await admin
      .from("style_profiles")
      .insert({ user_id: alice.id, version: 1, active: true, profile_json: toJson(core) })
      .select("id")
      .single();
    aliceProfileId = profile!.id;
    const saved = await admin.from("style_advice").insert({
      style_profile_id: aliceProfileId,
      user_id: alice.id,
      advice_json: toJson(advice),
    });
    expect(saved.error).toBeNull();
    const { data } = await admin
      .from("looks")
      .insert(
        FIXTURE_LOOK_SPECS.map((spec, i) => ({
          user_id: alice.id,
          style_profile_id: profile!.id,
          name: spec.name,
          position: i + 1,
          spec_json: toJson(spec),
        })),
      )
      .select("id, position");
    aliceLooks = data ?? [];
  });

  afterAll(async () => {
    await deleteTestUser(alice.id);
    await deleteTestUser(bob.id);
  });

  it("crea el perfil automáticamente al registrarse", async () => {
    const { data } = await alice.client.from("profiles").select("*").single();
    expect(data).toMatchObject({
      id: alice.id,
      display_name: "Test alice",
      country_code: "UY",
      role: "user",
    });
    expect(data?.age_confirmed_at).not.toBeNull();
    expect(await getCurrentUser(alice.client)).toMatchObject({ id: alice.id });
  });

  it("cada usuario ve solo su perfil y no puede escalar privilegios", async () => {
    const { data } = await bob.client.from("profiles").select("id");
    expect(data?.map((p) => p.id)).toEqual([bob.id]);

    const roleUpdate = await bob.client.from("profiles").update({ role: "admin" }).eq("id", bob.id);
    expect(roleUpdate.error).not.toBeNull();

    const other = await bob.client
      .from("profiles")
      .update({ display_name: "pwned" })
      .eq("id", alice.id)
      .select();
    expect(other.data).toEqual([]);

    const own = await bob.client
      .from("profiles")
      .update({ display_name: "Bob" })
      .eq("id", bob.id)
      .select("display_name");
    expect(own.data?.[0]?.display_name).toBe("Bob");
  });

  it("anon no accede a ninguna tabla", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    for (const table of [
      "profiles",
      "style_profiles",
      "style_advice",
      "looks",
      "products",
      "jobs",
      "ai_usage",
      "look_products",
    ] as const) {
      const { data, error } = await anon.from(table).select("id").limit(1);
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    }
    // Cache de búsquedas (paso 05): sin `id`, se consulta por su clave.
    const cache = await anon.from("shopping_search_cache").select("key").limit(1);
    expect(cache.error).not.toBeNull();
    // Progreso de los jobs (paso 06): ni leerlo ni escribirlo.
    const progress = await anon.from("jobs").select("progress, look_id").limit(1);
    expect(progress.error !== null || (progress.data ?? []).length === 0).toBe(true);
    const rpc = await anon.rpc("update_job_progress", {
      p_job_id: crypto.randomUUID(),
      p_worker_id: "anon",
      p_progress: {},
    });
    expect(rpc.error?.code).toBe("42501");
  });

  it("asesoría: el núcleo lo ve cualquier plan; la asesoría detallada solo Premium", async () => {
    // Free, con su JWT: ve el núcleo del perfil, no la asesoría (ni por PostgREST directo).
    const free = await getActiveStyleProfile(alice.client, alice.id);
    expect(free).toEqual({ id: aliceProfileId, profile: core, advice: null });
    // D26: silueta, proporciones y rasgos del rostro son núcleo (free); las notas, Premium.
    expect(free?.profile.appearance).toMatchObject({
      face_features: FIXTURE_STYLE_PROFILE.appearance.face_features,
      body_shape: "TRAPEZOID",
      torso_legs: "LONG_LEGS",
    });
    const direct = await alice.client.from("style_advice").select("advice_json");
    expect(direct.error).toBeNull();
    expect(direct.data).toEqual([]);

    // Nadie escribe la asesoría desde el cliente (la escribe el worker con service role).
    const insert = await alice.client.from("style_advice").insert({
      style_profile_id: aliceProfileId,
      user_id: alice.id,
      advice_json: toJson(advice),
    });
    expect(insert.error).not.toBeNull();

    expect((await givePremium(alice.id)).error).toBeNull();
    const premium = await getActiveStyleProfile(alice.client, alice.id);
    expect(premium).toEqual({ id: aliceProfileId, profile: core, advice });
    expect(premium?.advice?.body_proportions.balance_notes).toEqual(
      FIXTURE_STYLE_PROFILE.body_proportions.balance_notes,
    );

    const update = await alice.client
      .from("style_advice")
      .update({ advice_json: toJson({}) })
      .eq("style_profile_id", aliceProfileId)
      .select();
    expect(update.error !== null || (update.data ?? []).length === 0).toBe(true);
    const remove = await alice.client
      .from("style_advice")
      .delete()
      .eq("style_profile_id", aliceProfileId)
      .select();
    expect(remove.error !== null || (remove.data ?? []).length === 0).toBe(true);
    const still = await admin
      .from("style_advice")
      .select("advice_json")
      .eq("style_profile_id", aliceProfileId)
      .single();
    expect(still.data?.advice_json).toEqual(advice);

    // Otro usuario no ve ni el perfil ni la asesoría ajena.
    expect(await getActiveStyleProfile(bob.client, alice.id)).toBeNull();
    const intruder = await bob.client.from("style_advice").select("style_profile_id");
    expect(intruder.data).toEqual([]);

    // La asesoría no puede apuntar a un perfil de otro usuario (FK compuesta).
    const mismatch = await admin.from("style_advice").insert({
      style_profile_id: aliceProfileId,
      user_id: bob.id,
      advice_json: toJson(advice),
    });
    expect(mismatch.error).not.toBeNull();
  });

  it("perfil v2 y looks con razones de texto guardados se siguen leyendo", async () => {
    const { schema_version, appearance, colors, strengths, avoid, style_direction } =
      FIXTURE_STYLE_PROFILE_V2;
    const { data: profile } = await admin
      .from("style_profiles")
      .insert({
        user_id: bob.id,
        version: 1,
        active: true,
        profile_json: toJson({
          schema_version,
          appearance,
          colors,
          strengths,
          avoid,
          style_direction,
        }),
      })
      .select("id")
      .single();
    const [first] = FIXTURE_LOOK_SPECS;
    const legacyLook = { ...first, reasoning: first.reasoning.map((r) => r.text) };
    const inserted = await admin.from("looks").insert({
      user_id: bob.id,
      style_profile_id: profile!.id,
      name: first.name,
      position: 1,
      spec_json: toJson(legacyLook),
    });
    expect(inserted.error).toBeNull();

    // Bob (free, su JWT): el núcleo v2 sube a v3 sin inventar silueta ni proporciones.
    const stored = await getActiveStyleProfile(bob.client, bob.id);
    expect(stored?.profile).toMatchObject({
      schema_version: 3,
      appearance: {
        ...appearance,
        face_features: [],
        body_shape: "UNKNOWN",
        torso_legs: "UNKNOWN",
      },
      style_direction,
    });
    expect(stored?.advice).toBeNull();

    // El look guardado con el formato anterior valida (no aparece bloqueado por error).
    const { data: looks } = await bob.client.from("looks").select("spec_json");
    expect(looks).toHaveLength(1);
    const spec = StoredLookSpecSchema.safeParse(looks![0]!.spec_json);
    expect(spec.success).toBe(true);
    expect(spec.data?.reasoning.map((r) => [r.aspect, r.text])).toEqual(
      first.reasoning.map((r) => ["STYLE", r.text]),
    );

    await admin.from("looks").delete().eq("user_id", bob.id);
    await admin.from("style_profiles").delete().eq("user_id", bob.id);
  });

  it("asesoría: los perfiles v1 guardados se siguen leyendo (subidos a v3)", async () => {
    await admin.from("style_profiles").insert({
      user_id: bob.id,
      version: 1,
      active: true,
      profile_json: toJson(FIXTURE_STYLE_PROFILE_V1),
    });
    const stored = await getActiveStyleProfile(bob.client, bob.id);
    expect(stored?.profile).toMatchObject({
      schema_version: 3,
      style_direction: FIXTURE_STYLE_PROFILE_V1.style_direction,
      strengths: FIXTURE_STYLE_PROFILE_V1.strengths,
    });
    expect(stored?.advice?.hair.recommended_styles).toEqual(
      FIXTURE_STYLE_PROFILE_V1.hair.recommended_styles,
    );
    expect(stored?.advice?.general_advice).toEqual([]);
    await admin.from("style_profiles").delete().eq("user_id", bob.id);
  });

  it("looks: sin Premium solo se ve el look 1; con Premium, los tres", async () => {
    // El test anterior le dio Premium a alice: se le saca para ver el caso free.
    await admin.from("subscriptions").delete().eq("user_id", alice.id);
    const free = await alice.client.from("looks").select("position").order("position");
    expect(free.data?.map((l) => l.position)).toEqual([1]);
    const intruder = await bob.client.from("looks").select("id");
    expect(intruder.data).toEqual([]);

    await expect(requirePremium(alice.client)).rejects.toMatchObject({ code: "PREMIUM_REQUIRED" });

    await givePremium(alice.id);
    const premium = await alice.client.from("looks").select("position").order("position");
    expect(premium.data?.map((l) => l.position)).toEqual([1, 2, 3]);
    await expect(requirePremium(alice.client)).resolves.toMatchObject({ id: alice.id });
  });

  it("el usuario no puede darse Premium ni escribir tablas internas", async () => {
    const sub = await bob.client
      .from("subscriptions")
      .insert({ user_id: bob.id, provider: "MOCK", status: "ACTIVE" });
    expect(sub.error).not.toBeNull();
    const usage = await bob.client
      .from("ai_usage")
      .insert({ operation: "CHAT", provider: "x", model: "x" });
    expect(usage.error).not.toBeNull();
    const events = await bob.client.from("analytics_events").select("id");
    expect(events.error !== null || events.data?.length === 0).toBe(true);
  });

  it("favoritos: no se pueden guardar looks ajenos (IDOR)", async () => {
    const lookId = aliceLooks.find((l) => l.position === 1)!.id;
    const steal = await bob.client.from("favorites").insert({ user_id: bob.id, look_id: lookId });
    expect(steal.error).not.toBeNull();
    const own = await alice.client
      .from("favorites")
      .insert({ user_id: alice.id, look_id: lookId })
      .select("id");
    expect(own.error).toBeNull();
  });

  it("Storage: sube, firma y borra fotos propias; no accede a las ajenas", async () => {
    const photo = await uploadUserPhoto(alice.client, {
      userId: alice.id,
      type: "MAIN_BODY",
      file: pngFile(),
    });
    expect(photo.storage_path.startsWith(`${alice.id}/`)).toBe(true);

    const url = await getUserPhotoSignedUrl(alice.client, { userId: alice.id, photoId: photo.id });
    expect(url).toContain("token=");

    // Reemplazar mantiene una sola foto por tipo y borra el archivo anterior.
    const replaced = await uploadUserPhoto(alice.client, {
      userId: alice.id,
      type: "MAIN_BODY",
      file: pngFile(),
    });
    const { data: rows } = await alice.client.from("user_photos").select("id");
    expect(rows?.map((r) => r.id)).toEqual([replaced.id]);
    const old = await alice.client.storage.from("user-photos").download(photo.storage_path);
    expect(old.error).not.toBeNull();

    // Bob no puede ver, firmar ni borrar la foto de Alice.
    await expect(
      getUserPhotoSignedUrl(bob.client, { userId: bob.id, photoId: replaced.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const direct = await bob.client.storage
      .from("user-photos")
      .createSignedUrl(replaced.storage_path, 60);
    expect(direct.error).not.toBeNull();
    const upload = await bob.client.storage
      .from("user-photos")
      .upload(`${alice.id}/evil.png`, PNG, { contentType: "image/png" });
    expect(upload.error).not.toBeNull();

    // Contenido que no es imagen se rechaza antes de subir.
    await expect(
      uploadUserPhoto(alice.client, {
        userId: alice.id,
        type: "FACE_DETAIL",
        file: {
          name: "x.png",
          type: "image/png",
          size: 5,
          bytes: new TextEncoder().encode("<svg>"),
        },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    await deleteUserPhoto(alice.client, { userId: alice.id, photoId: replaced.id });
    const { data: after } = await alice.client.from("user_photos").select("id");
    expect(after).toEqual([]);
  });

  it("los buckets son privados", async () => {
    const { data } = await admin.storage.listBuckets();
    const buckets = data?.filter((b) => ["user-photos", "generated-looks"].includes(b.id)) ?? [];
    expect(buckets).toHaveLength(2);
    expect(buckets.every((b) => b.public === false)).toBe(true);
  });
});
