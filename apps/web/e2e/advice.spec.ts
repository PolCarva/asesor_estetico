import { expect, test } from "@playwright/test";

import { createUser, deleteCreatedUsers, signIn } from "./helpers";

/**
 * Asesoría de imagen (paso 12a): qué ve cada plan en `/app/looks`, en el detalle del look y en
 * el bento del perfil.
 */

const SECTIONS = [
  "Pelo",
  "Grooming",
  "Ropa y fit",
  "Calzado y accesorios",
  "Tatuajes",
  "Consejos generales",
];

/** Una nota de "cómo equilibrar tu silueta" del fixture (asesoría Premium). */
const BALANCE_NOTE = "cortes rectos mantienen el equilibrio";

test.afterAll(deleteCreatedUsers);

test("free: ve el teaser y las secciones bloqueadas; los looks 2 y 3 muestran el paywall", async ({
  page,
}) => {
  const user = await createUser("advice-free");
  await signIn(page, user);

  const advice = page.getByRole("region", { name: /Cómo llevarlo/ });
  await expect(advice.getByRole("heading", { name: "Te favorece", exact: true })).toBeVisible();
  await expect(advice.getByRole("heading", { name: "Mejor evitar", exact: true })).toBeVisible();
  await expect(advice.getByRole("heading", { name: "Colores", exact: true })).toBeVisible();

  // Solo los títulos: el contenido de Premium no llega al navegador.
  const locked = advice.getByRole("region", { name: "Asesoría completa (Premium)" });
  for (const title of SECTIONS) {
    await expect(locked.getByText(title, { exact: true })).toBeVisible();
    await expect(advice.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
  }
  await expect(page.getByText("Para decirle al peluquero")).toHaveCount(0);
  await expect(locked.getByRole("link", { name: "Ver la asesoría completa" })).toBeVisible();

  await page.goto(`/app/looks/${user.looks[0]}`);
  await expect(page.getByRole("heading", { level: 1, name: "Smart casual cálido" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Desbloqueá tu estilo/ })).toHaveCount(0);
  // "Por qué te queda bien": la etiqueta es el aspecto y su calificativo, sin puntaje.
  await expect(page.getByText("Color · cálido", { exact: true })).toBeVisible();
  await expect(page.getByText("Silueta · trapecio", { exact: true })).toBeVisible();

  // Bento del perfil: silueta y proporciones para todos; cómo equilibrarla, solo Premium.
  await page.goto("/app/profile");
  const silhouette = page.locator("section[aria-labelledby=tile-silhouette]");
  await expect(silhouette.getByRole("link", { name: "Desbloquear con Premium" })).toBeVisible();
  await expect(page.getByText(BALANCE_NOTE)).toHaveCount(0);
  await expect(page.locator("section[aria-labelledby=tile-proportions]")).toBeVisible();

  for (const look of user.looks.slice(1)) {
    await page.goto(`/app/looks/${look}`);
    await expect(page.getByRole("heading", { name: /Desbloqueá tu estilo/ })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
  }
});

test("premium: ve todas las secciones y los 3 looks", async ({ page }) => {
  const user = await createUser("advice-premium", { premium: true });
  await signIn(page, user);

  const advice = page.getByRole("region", { name: /Cómo llevarlo/ });
  await expect(advice.getByRole("heading", { name: "Te favorece", exact: true })).toBeVisible();
  for (const title of SECTIONS) {
    await expect(advice.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  await expect(advice.getByText("Para decirle al peluquero")).toBeVisible();
  await expect(advice.getByRole("region", { name: "Asesoría completa (Premium)" })).toHaveCount(0);

  await page.goto("/app/profile");
  const silhouette = page.locator("section[aria-labelledby=tile-silhouette]");
  await expect(silhouette.getByText(BALANCE_NOTE)).toBeVisible();
  await expect(silhouette.getByRole("link", { name: "Desbloquear con Premium" })).toHaveCount(0);

  await page.goto(`/app/looks/${user.looks[1]}`);
  await expect(page.getByRole("heading", { level: 1, name: "Minimal nocturno" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Desbloqueá tu estilo/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Encontrar este look" })).toBeVisible();
});
