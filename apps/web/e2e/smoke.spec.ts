import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { expect, type Page, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const envFile = resolve(import.meta.dirname, "../../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const PHOTO = resolve(import.meta.dirname, "fixtures/photo.png");

const uniqueEmail = (label: string) => `e2e-${label}-${crypto.randomUUID()}@example.test`;
const strongPassword = () => `Pw-${crypto.randomUUID()}-9`;

async function signUp(page: Page, name: string) {
  await page.goto("/signup");
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Email").fill(uniqueEmail("user"));
  await page.getByLabel("Contraseña").fill(strongPassword());
  await page.getByLabel("Confirmo que tengo 18 años o más.").check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/app\/onboarding$/);
}

test.describe("smoke", () => {
  test("landing → signup → cuenta → fotos → logout", async ({ page }) => {
    const email = uniqueEmail("smoke");
    const password = strongPassword();

    // Landing
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Tu asesor de imagen personal con IA",
    );
    await page.getByRole("link", { name: "Descubrir mi estilo" }).click();

    // Signup
    await expect(page).toHaveURL(/\/signup$/);
    await page.getByLabel("Nombre").fill("Prueba E2E");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByLabel("Confirmo que tengo 18 años o más.").check();
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page).toHaveURL(/\/app\/onboarding$/);

    // Sin fotos, la entrada a la app lleva al primer paso
    await page.goto("/app/dashboard");
    await expect(page).toHaveURL(/\/app\/onboarding\/photos$/);

    // Cuenta del usuario autenticado (en "Mi perfil")
    await page.goto("/app/profile");
    const account = page.getByRole("region", { name: "Tu cuenta" });
    await expect(account.getByText("Prueba E2E")).toBeVisible();
    await expect(account.getByText(email)).toBeVisible();

    // Fotos: subir, ver preview guardada y eliminar
    await page.goto("/app/onboarding/photos");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mostrate tal como sos.");
    const bodySlot = page.getByRole("region", { name: "Cuerpo entero" });
    await bodySlot.locator('input[type="file"]').setInputFiles(PHOTO);
    await expect(bodySlot.getByText("Vista previa")).toBeVisible();
    await bodySlot.getByRole("button", { name: "Guardar foto" }).click();
    await expect(bodySlot.getByText("Foto guardada.")).toBeVisible();
    await expect(bodySlot.getByRole("img", { name: "Tu foto: Cuerpo entero" })).toBeVisible();
    await bodySlot.getByRole("button", { name: "Eliminar foto" }).click();
    await expect(bodySlot.getByText("Todavía no subiste esta foto")).toBeVisible();

    // Logout: vuelve a la landing y las rutas protegidas piden login
    await page.goto("/app/profile");
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/app/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fdashboard/);
  });

  test("rechaza archivos que no son imágenes permitidas", async ({ page }) => {
    await signUp(page, "Prueba");

    await page.goto("/app/onboarding/photos");
    const faceSlot = page.getByRole("region", { name: "Rostro" });
    await faceSlot
      .locator('input[type="file"]')
      .setInputFiles({ name: "notas.txt", mimeType: "text/plain", buffer: Buffer.from("hola") });
    await expect(faceSlot.getByText("Usá una foto JPG, PNG o WEBP.")).toBeVisible();
  });

  test("usuarios no admin no ven /admin", async ({ page }) => {
    await signUp(page, "No admin");

    const response = await page.goto("/admin");
    expect(response?.status()).toBe(404);
  });

  test("login con credenciales inválidas muestra un error genérico", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nadie@example.test");
    await page.getByLabel("Contraseña").fill("incorrecta-123");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Email o contraseña incorrectos." }),
    ).toBeVisible();
  });

  test("una sesión de un usuario borrado no deja al navegador en un loop", async ({ page }) => {
    const email = uniqueEmail("stale");
    await page.goto("/signup");
    await page.getByLabel("Nombre").fill("Borrado");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña").fill(strongPassword());
    await page.getByLabel("Confirmo que tengo 18 años o más.").check();
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page).toHaveURL(/\/app\/onboarding$/);

    // Simula `pnpm db:reset`: el usuario desaparece pero la cookie sigue en el navegador.
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { persistSession: false },
      },
    );
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const user = data.users.find((u) => u.email === email);
    await admin.auth.admin.deleteUser(user!.id);

    await page.goto("/app/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fdashboard/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ingresá a tu cuenta");
  });
});
