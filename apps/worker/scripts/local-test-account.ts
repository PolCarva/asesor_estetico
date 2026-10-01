/**
 * Cuenta local nueva con looks, sin gastar IA (pruebas en el navegador de los pasos 07–10b).
 * Hace lo mismo que el alta y "Analizar" en la app: crea el usuario, sube dos fotos de
 * fixture como cuerpo y rostro y encola VALIDATE_PHOTOS. El worker con `AI_PROVIDER=mock`
 * hace el resto (análisis, 3 looks e imágenes).
 *
 *   AI_PROVIDER=mock SHOPPING_PROVIDER=live pnpm worker:dev
 *   pnpm --filter @asesor/worker exec tsx --env-file-if-exists=../../.env scripts/local-test-account.ts --email nombre@asesor.test [--premium]
 *
 * La contraseña es la de las cuentas del seed (`SEED_USER_PASSWORD` o la default del
 * README). `--premium` agrega una suscripción MOCK de 30 días (no hay checkout real).
 * Solo cuentas `.test` y solo contra el Supabase local.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getWorkerEnv } from "@asesor/config/env/worker";
import { enqueueJob, type TypedSupabaseClient } from "@asesor/db";
import { createAdminClient } from "@asesor/db/admin";
import { STORAGE_BUCKETS } from "@asesor/shared";

const env = getWorkerEnv();
const args = process.argv.slice(2);
const email = args[args.indexOf("--email") + 1] ?? "";
if (!args.includes("--email") || !/^[^@\s]+@[^@\s]+\.test$/.test(email)) {
  throw new Error("Usá --email <cuenta>.test (solo cuentas locales de prueba).");
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(env.NEXT_PUBLIC_SUPABASE_URL)) {
  throw new Error("Solo contra el Supabase local.");
}
const premium = args.includes("--premium");
// Misma contraseña que las cuentas del seed (`packages/db/scripts/seed.ts`).
const password = process.env.SEED_USER_PASSWORD ?? "asesor-demo-2026";
const photo = readFileSync(resolve(import.meta.dirname, "../../web/e2e/fixtures/photo.png"));

const db = createAdminClient({
  url: env.NEXT_PUBLIC_SUPABASE_URL,
  serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
}) as TypedSupabaseClient;

const created = await db.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { display_name: email.split("@")[0], age_confirmed: true },
});
if (created.error || !created.data.user) throw created.error ?? new Error("sin usuario");
const userId = created.data.user.id;

const photos: Array<{ photo_id: string; type: "MAIN_BODY" | "FACE_DETAIL" }> = [];
for (const type of ["MAIN_BODY", "FACE_DETAIL"] as const) {
  const path = `${userId}/${type.toLowerCase()}-${crypto.randomUUID()}.png`;
  const upload = await db.storage
    .from(STORAGE_BUCKETS.userPhotos)
    .upload(path, photo, { contentType: "image/png" });
  if (upload.error) throw upload.error;
  const { data, error } = await db
    .from("user_photos")
    .insert({
      user_id: userId,
      type,
      storage_path: path,
      mime_type: "image/png",
      size_bytes: photo.byteLength,
    })
    .select("id")
    .single();
  if (error) throw error;
  photos.push({ photo_id: data.id, type });
}

if (premium) {
  const { error } = await db.from("subscriptions").insert({
    user_id: userId,
    provider: "MOCK",
    provider_subscription_id: `local-${userId}`,
    status: "ACTIVE",
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  });
  if (error) throw error;
}

const job = await enqueueJob(db, {
  type: "VALIDATE_PHOTOS",
  payload: { user_id: userId, photos },
  userId,
  priority: 10,
});
console.log(
  `Cuenta ${email} (${premium ? "Premium" : "free"}) · contraseña del seed · análisis encolado (job ${job.id}).`,
);
