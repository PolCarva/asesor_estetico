import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { type ShoppingProgress, splitStyleProfile } from "@asesor/shared";
import { FIXTURE_LOOK_SPECS, FIXTURE_STYLE_PROFILE } from "@asesor/shared/fixtures";
import { expect, type Page, test } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Datos de prueba de los E2E (paso 12a): usuarios nuevos por test, creados con service role
 * (la clave sale del `.env` local o del CI, nunca del código), con los looks del fixture y,
 * si hace falta, una suscripción Premium MOCK. Nada usa IA ni tiendas reales: el worker que
 * levanta `playwright.config.ts` corre con `AI_PROVIDER=mock SHOPPING_PROVIDER=mock`.
 */

const envFile = resolve(import.meta.dirname, "../../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

let client: SupabaseClient | undefined;
export function admin(): SupabaseClient {
  client ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return client;
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  /** Los 3 looks del fixture, en orden (look 1 primero). */
  looks: [string, string, string];
}

const created: string[] = [];

/** Usuario nuevo con perfil, asesoría y los 3 looks del fixture (listos, sin imagen). */
export async function createUser(
  label: string,
  { premium = false }: { premium?: boolean } = {},
): Promise<TestUser> {
  const db = admin();
  const email = `e2e-${label}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const password = `Pw-${crypto.randomUUID()}-9`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `E2E ${label}`, age_confirmed: true },
  });
  if (error || !data.user) throw error ?? new Error("sin usuario");
  const id = data.user.id;
  created.push(id);

  const { core, advice } = splitStyleProfile(FIXTURE_STYLE_PROFILE);
  const looks = await db.rpc("create_style_profile_with_looks", {
    p_user_id: id,
    p_profile: core,
    p_advice: advice,
    p_looks: FIXTURE_LOOK_SPECS,
  });
  if (looks.error) throw looks.error;
  const rows = (looks.data as Array<{ look_id: string; look_position: number }>).sort(
    (a, b) => a.look_position - b.look_position,
  );
  // Sin worker de imágenes: los looks quedan listos con la paleta en lugar del render.
  await db.from("looks").update({ status: "READY" }).eq("user_id", id);

  if (premium) {
    const sub = await db.from("subscriptions").insert({
      user_id: id,
      provider: "MOCK",
      provider_subscription_id: `e2e-${id}`,
      status: "ACTIVE",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    if (sub.error) throw sub.error;
  }
  const [first, second, third] = rows.map((r) => r.look_id);
  if (!first || !second || !third) throw new Error("el fixture tiene que crear 3 looks");
  return { id, email, password, looks: [first, second, third] };
}

/** Premium vencido: el período terminó ayer (el carrito queda en solo lectura, D18). */
export async function expirePremium(user: TestUser) {
  const { error } = await admin()
    .from("subscriptions")
    .update({
      current_period_start: new Date(Date.now() - 31 * 86_400_000).toISOString(),
      current_period_end: new Date(Date.now() - 86_400_000).toISOString(),
    })
    .eq("user_id", user.id);
  if (error) throw error;
}

/** Borra los usuarios creados por el archivo de specs (en cascada: looks, jobs, carrito…). */
export async function deleteCreatedUsers() {
  const ids = created.splice(0);
  for (const id of ids) await admin().auth.admin.deleteUser(id);
}

/**
 * Sesión del usuario en el navegador, con las cookies que arma `@supabase/ssr` (el mismo
 * formato que la app). No pasa por el formulario de login: en producción (`next start`, CI)
 * tiene un límite de 10 intentos por minuto por IP, y el login ya lo prueba `smoke.spec.ts`.
 */
export async function signIn(page: Page, user: TestUser, next = "/app/looks") {
  const jar = new Map<string, string>();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (cookies) => {
          for (const { name, value } of cookies) {
            if (value) jar.set(name, value);
            else jar.delete(name);
          }
        },
      },
    },
  );
  const { error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw error;
  expect(jar.size).toBeGreaterThan(0);

  const url = test.info().project.use.baseURL!;
  await page
    .context()
    .addCookies([...jar].map(([name, value]) => ({ name, value, url, sameSite: "Lax" as const })));
  await page.goto(next);
  await expect(page).toHaveURL(new RegExp(`${next.replace(/[/?]/g, "\\$&")}$`));
}

/** Jobs de búsqueda de productos del usuario (para verificar que el servidor no encola). */
export async function searchJobs(userId: string) {
  const { data, error } = await admin()
    .from("jobs")
    .select("id, status, garment_slot")
    .eq("user_id", userId)
    .eq("type", "SEARCH_PRODUCTS");
  if (error) throw error;
  return data ?? [];
}

/**
 * "Encontrar este look" desde el detalle: pide solo los talles que usa el look (arriba, abajo
 * y calzado; el reloj no pide talle), busca con el worker mock y espera a que termine.
 */
export async function findLook(page: Page, lookId: string) {
  await page.goto(`/app/looks/${lookId}`);
  await page.getByRole("button", { name: "Encontrar este look" }).click();
  const form = page.getByRole("form", { name: /Antes de buscar, tus/ });
  await expect(form.getByRole("group")).toHaveCount(3);
  await form
    .getByRole("group", { name: "Remera, camisa o abrigo" })
    .getByText("M", { exact: true })
    .click();
  await form
    .getByRole("group", { name: "Pantalón, bermuda o pollera" })
    .getByText("42", { exact: true })
    .click();
  await form.getByRole("group", { name: "Calzado" }).getByText("42", { exact: true }).click();
  await form.getByRole("button", { name: "Buscar las prendas" }).click();
  // El worker mock puede terminar antes de que se pinte el panel de progreso: el progreso se
  // prueba aparte, con `holdLookSearch`, sin carreras.
  await expect(page.getByText(/Búsqueda terminada/)).toBeVisible({ timeout: 30_000 });
}

/**
 * Búsqueda del look retenida en la cola: agendada a una hora de distancia, el worker no la
 * toma. El test la avanza con `setLookSearch` y la UI la sigue por polling, como con el worker.
 */
export async function holdLookSearch(user: TestUser, lookId: string): Promise<string> {
  const { data, error } = await admin()
    .from("jobs")
    .insert({
      type: "SEARCH_PRODUCTS",
      user_id: user.id,
      // `look_id` es una columna generada desde el payload; el resto del payload no se usa.
      payload: { look_id: lookId },
      scheduled_at: new Date(Date.now() + 3_600_000).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/** Estado y progreso de la búsqueda retenida (RUNNING con lock fresco: nadie la reclama). */
export async function setLookSearch(
  jobId: string,
  status: "RUNNING" | "COMPLETED",
  progress: Omit<ShoppingProgress, "updated_at">,
) {
  const now = new Date().toISOString();
  const { error } = await admin()
    .from("jobs")
    .update({
      status,
      progress: { ...progress, updated_at: now },
      locked_at: status === "RUNNING" ? now : null,
      locked_by: status === "RUNNING" ? "e2e" : null,
      finished_at: status === "COMPLETED" ? now : null,
    })
    .eq("id", jobId);
  if (error) throw error;
}

/** Fila de resultados de una prenda del look ("Recomendado · camisa oxford"). */
export function pieceRow(page: Page, description: string) {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByText(`Recomendado · ${description}`, { exact: true }) });
}
