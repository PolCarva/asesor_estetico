/**
 * Prueba real del análisis de estilo con OpenRouter (IA paga). No es un test: no corre en CI.
 *
 * Análisis completo (necesita las fotos autorizadas, ver docs/goals/asesoria-shopping/README.md):
 *   pnpm --filter @asesor/worker exec tsx --env-file-if-exists=../../.env scripts/real-style-analysis.ts
 *   Analiza ~/asesor-fotos-prueba/cuerpo.jpg y cara.jpg, genera los 3 LookSpecs, guarda todo
 *   para un usuario local nuevo, comprueba que la asesoría detallada solo la lee con Premium y
 *   borra el usuario. Costo de referencia: ~USD 0.06 (sin imágenes).
 *
 *   --save-for <email>: además guarda el resultado como perfil activo de esa cuenta local
 *   existente (solo dominios .test, por ejemplo una cuenta de prueba creada en la app), para
 *   revisarlo en el navegador. Los looks quedan sin imagen.
 *
 * Solo el schema (sin fotos ni base):
 *   ... scripts/real-style-analysis.ts --schema-check
 *   Comprueba que el proveedor acepta el JSON Schema estricto del StyleProfile y que la respuesta
 *   valida con Zod. El contenido no es un análisis real: el modelo no recibe fotos.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  analyzeStyleProfile,
  type AIResult,
  generateLookSpecs,
  OpenRouterProvider,
} from "@asesor/ai";
import { getPublicEnv } from "@asesor/config/env/public";
import { getWorkerEnv } from "@asesor/config/env/worker";
import {
  getActiveStyleProfile,
  MAX_AI_PHOTO_BYTES,
  saveStyleProfileWithLooks,
  type TypedSupabaseClient,
} from "@asesor/db";
import { createAdminClient } from "@asesor/db/admin";
import {
  type LookSpec,
  splitStyleProfile,
  type StyleProfile,
  StyleProfileSchema,
} from "@asesor/shared";
import { createClient } from "@supabase/supabase-js";

const PHOTOS_DIR = join(homedir(), "asesor-fotos-prueba");
const PHOTOS = [
  { file: "cuerpo.jpg", type: "MAIN_BODY" },
  { file: "cara.jpg", type: "FACE_DETAIL" },
] as const;
const preferences = { risk_level: "BALANCED", tattoo_preference: "NEUTRAL" } as const;

const env = getWorkerEnv();
if (!env.OPENROUTER_API_KEY) {
  console.error("Falta OPENROUTER_API_KEY en .env.");
  process.exit(2);
}
const provider = new OpenRouterProvider({
  apiKey: env.OPENROUTER_API_KEY,
  textModel: env.OPENROUTER_TEXT_MODEL,
  imageModel: env.OPENROUTER_IMAGE_MODEL,
  imageQuality: env.AI_IMAGE_QUALITY,
});

/** Solo recomendaciones: nada que describa a la persona (apariencia, rasgos). */
function printAdvice(profile: StyleProfile) {
  console.log("Recomendaciones (muestra):");
  const lines = {
    "pelo · corte": profile.hair.recommended_cut,
    "pelo · laterales": profile.hair.sides,
    "pelo · peluquero": profile.hair.barber_instructions,
    "barba · recomendado": profile.grooming.facial_hair.recommended.join(" | "),
    cejas: profile.grooming.eyebrows.join(" | "),
    "ropa · pantalones": profile.clothing.pant_cuts.join(" | "),
    "ropa · layering": profile.clothing.layering.join(" | "),
    "calzado · evitar": profile.shoes.avoid.join(" | "),
    joyería: profile.accessories.jewelry.join(" | "),
    anteojos: profile.accessories.eyewear.join(" | ") || "(no aplica)",
    "tatuajes · ubicaciones": profile.tattoos.placements.join(" | ") || "(no aplica)",
    consejos: profile.general_advice.join(" | "),
  };
  for (const [label, value] of Object.entries(lines)) console.log(`  - ${label}: ${value}`);
}

/**
 * Perfil visual (silueta, proporciones, rasgos). Describe a la persona: se imprime porque la
 * prueba usa fotos de una persona que lo autorizó o ficticia, nunca de un usuario real.
 */
function printVisualProfile(profile: StyleProfile) {
  const { appearance } = profile;
  console.log("Perfil visual (fotos de prueba autorizadas):");
  console.log(`  - rostro: ${appearance.face_shape} · ${appearance.face_features.join(" | ")}`);
  console.log(`  - silueta: ${appearance.body_shape} · proporciones: ${appearance.torso_legs}`);
  console.log(`  - notas (Premium): ${profile.body_proportions.balance_notes.join(" | ")}`);
}

function printReasons(looks: LookSpec[]) {
  console.log("Por qué te queda bien (aspecto · calificativo — texto):");
  for (const look of looks) {
    console.log(`  ${look.id} "${look.name}":`);
    for (const r of look.reasoning)
      console.log(`    - ${r.aspect} · ${r.qualifier || "(sin calificativo)"} — ${r.text}`);
  }
}

function printUsage(results: Array<AIResult<unknown>>) {
  for (const r of results)
    console.log(
      `  ${r.operation}: ${r.usage.model} · ${r.usage.input_tokens} in / ${r.usage.output_tokens} out · USD ${r.usage.estimated_cost_usd.toFixed(4)} · ${r.timing.duration_ms} ms`,
    );
  const total = results.reduce((sum, r) => sum + r.usage.estimated_cost_usd, 0);
  console.log(`  Total: USD ${total.toFixed(4)}`);
}

async function schemaCheck() {
  const started = Date.now();
  // Sin fotos: se llama al proveedor directo (la operación exige al menos una foto).
  const response = await provider.analyzeStyleProfile({
    photos: [],
    preferences,
    country_code: "UY",
  });
  const profile = StyleProfileSchema.parse(response.output);
  console.log(
    `Schema v${profile.schema_version} aceptado por ${response.model}; la respuesta valida con StyleProfileSchema.`,
  );
  console.log(
    `  ${response.usage.input_tokens} in / ${response.usage.output_tokens} out · USD ${response.usage.estimated_cost_usd.toFixed(4)} · ${Date.now() - started} ms`,
  );
  printAdvice(profile);
}

async function fullAnalysis() {
  const photos = PHOTOS.map(({ file, type }) => {
    const path = join(PHOTOS_DIR, file);
    if (!existsSync(path)) {
      console.error(`Falta ${path}: la prueba real necesita las fotos de prueba autorizadas.`);
      process.exit(2);
    }
    if (statSync(path).size > MAX_AI_PHOTO_BYTES) {
      console.error(`${path} pesa más de ${MAX_AI_PHOTO_BYTES} bytes: achicala.`);
      process.exit(2);
    }
    const base64 = readFileSync(path).toString("base64");
    return { photo_id: crypto.randomUUID(), type, url: `data:image/jpeg;base64,${base64}` };
  });

  const profile = await analyzeStyleProfile(provider, { photos, preferences, country_code: "UY" });
  const specs = await generateLookSpecs(provider, {
    style_profile: profile.data,
    preferences,
    count: 3,
  });
  console.log(
    `StyleProfile v${profile.data.schema_version} validado con Zod; 3 LookSpecs validados.`,
  );
  printUsage([profile, specs]);
  printVisualProfile(profile.data);
  printReasons(specs.data.looks);
  printAdvice(profile.data);

  // Guardado real en Supabase local para un usuario nuevo, y lectura con su JWT.
  const publicEnv = getPublicEnv();
  const admin = createAdminClient({
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const email = `real-analysis-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const password = `Pw-${crypto.randomUUID()}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("sin usuario");
  const userId = created.data.user.id;
  try {
    const saved = await saveStyleProfileWithLooks(admin, {
      userId,
      profile: profile.data,
      looks: specs.data.looks,
    });
    const user = createClient(
      publicEnv.NEXT_PUBLIC_SUPABASE_URL,
      publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    ) as TypedSupabaseClient;
    const signIn = await user.auth.signInWithPassword({ email, password });
    if (signIn.error) throw signIn.error;

    const free = await getActiveStyleProfile(user, userId);
    await admin.from("subscriptions").insert({
      user_id: userId,
      provider: "MOCK",
      provider_subscription_id: `real-analysis-${userId}`,
      status: "ACTIVE",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const premium = await getActiveStyleProfile(user, userId);
    const { advice } = splitStyleProfile(profile.data);
    console.log(`Guardado: style_profile ${saved.styleProfileId}, ${saved.looks.length} looks.`);
    const visual = free?.profile.appearance;
    console.log(
      `  Free (su JWT): núcleo ${free ? "sí" : "no"} (silueta ${visual?.body_shape}, proporciones ${visual?.torso_legs}, rasgos ${visual?.face_features.length}), asesoría ${free?.advice ? "SÍ (mal)" : "no"}`,
    );
    console.log(
      `  Premium (su JWT): asesoría ${JSON.stringify(premium?.advice) === JSON.stringify(advice) ? "sí, completa" : "NO (mal)"}`,
    );
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }

  const saveFor = process.argv[process.argv.indexOf("--save-for") + 1];
  if (process.argv.includes("--save-for")) {
    if (!saveFor?.endsWith(".test"))
      throw new Error("--save-for solo acepta cuentas .test locales.");
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const account = data.users.find((u) => u.email === saveFor);
    if (!account) throw new Error(`No existe la cuenta local ${saveFor}.`);
    const saved = await saveStyleProfileWithLooks(admin, {
      userId: account.id,
      profile: profile.data,
      looks: specs.data.looks,
    });
    console.log(`Guardado también para ${saveFor}: style_profile ${saved.styleProfileId}.`);
  }
}

await (process.argv.includes("--schema-check") ? schemaCheck() : fullAnalysis());
