import { FIXTURE_LOOK_SPECS, FIXTURE_STYLE_PROFILE } from "@asesor/shared/fixtures";
import { afterAll, beforeAll, expect, it } from "vitest";

import { getCurrentUser, requirePremium } from "../../src/auth";
import { deleteUserPhoto, getUserPhotoSignedUrl, uploadUserPhoto } from "../../src/storage";
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

  beforeAll(async () => {
    alice = await createTestUser("alice");
    bob = await createTestUser("bob");
    const { data: profile } = await admin
      .from("style_profiles")
      .insert({
        user_id: alice.id,
        version: 1,
        active: true,
        profile_json: toJson(FIXTURE_STYLE_PROFILE),
      })
      .select("id")
      .single();
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
    for (const table of ["profiles", "looks", "products", "jobs", "ai_usage"] as const) {
      const { data, error } = await anon.from(table).select("id").limit(1);
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    }
  });

  it("looks: sin Premium solo se ve el look 1; con Premium, los tres", async () => {
    const free = await alice.client.from("looks").select("position").order("position");
    expect(free.data?.map((l) => l.position)).toEqual([1]);
    const intruder = await bob.client.from("looks").select("id");
    expect(intruder.data).toEqual([]);

    await expect(requirePremium(alice.client)).rejects.toMatchObject({ code: "PREMIUM_REQUIRED" });

    await admin.from("subscriptions").insert({
      user_id: alice.id,
      provider: "MOCK",
      provider_subscription_id: `test-${alice.id}`,
      status: "ACTIVE",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
    });
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
