import { SHOPPING_STAGES } from "@asesor/shared";
import { FIXTURE_OTHER_AUDIENCE_PRODUCT } from "@asesor/shared/fixtures";
import { expect, test } from "@playwright/test";

import {
  createUser,
  deleteCreatedUsers,
  findLook,
  holdLookSearch,
  pieceRow,
  searchJobs,
  setLookSearch,
  signIn,
} from "./helpers";

/**
 * Shopping del look (paso 12a) con el catálogo mock del worker: talles, resultados por prenda,
 * "Buscar más barato", el progreso por etapas y el paywall de free (sin job en la base).
 */

/** De mujer y más barata que la cruda; el título no lo dice, solo los datos de su página. */
const WOMEN_SHIRT = FIXTURE_OTHER_AUDIENCE_PRODUCT.title;

test.afterAll(deleteCreatedUsers);

test("premium: talles → resultados por prenda → buscar más barato", async ({ page }) => {
  const user = await createUser("shop-premium", { premium: true });
  await signIn(page, user, `/app/looks/${user.looks[0]}`);
  await findLook(page, user.looks[0]);

  // Overshirt, camisa, chino y botas tienen opciones en el catálogo; el reloj no.
  await expect(page.getByText("Encontramos opciones para 4 de 5 prendas.")).toBeVisible();
  for (const piece of ["overshirt", "camisa oxford", "pantalón chino", "desert boots"]) {
    await expect(pieceRow(page, piece)).toHaveCount(1);
  }
  await expect(page.getByText("No encontramos opciones para esta prenda todavía.")).toBeVisible();

  // Los talles quedaron en el perfil: no se vuelven a pedir.
  await expect(page.getByRole("form", { name: /Antes de buscar, tus/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Buscar de nuevo" })).toBeVisible();

  // Recomendado con su link por el servidor y las alternativas dentro de la misma fila.
  const shirt = pieceRow(page, "camisa oxford");
  await expect(shirt.getByText("Camisa oxford cruda")).toBeVisible();
  await expect(shirt.getByText("$ 1.890").first()).toBeVisible();
  await expect(shirt.getByRole("link", { name: /^Comprar ↗/ })).toHaveAttribute(
    "href",
    /^\/api\/products\/[0-9a-f-]{36}\/open/,
  );
  await shirt.getByText("Ver 1 opción más").click();
  await expect(shirt.getByText("Camisa oxford blanca slim")).toBeVisible();
  // Local físico: se consulta en el local, con lo que publica la tienda.
  const overshirt = pieceRow(page, "overshirt");
  await expect(overshirt.getByText("Disponible en tienda física").first()).toBeVisible();
  await expect(overshirt.getByRole("link", { name: /^Ver local ↗/ })).toBeVisible();
  await expect(
    page.getByText(/Recomendados: US\$\s79 \(1 prenda\) \+ \$\s7\.670 \(3 prendas\)/),
  ).toBeVisible();

  // La camisa de mujer del catálogo mock (solo lo dice su página) no le aparece a este perfil.
  await expect(page.getByText(WOMEN_SHIRT)).toHaveCount(0);

  // Más barato: la blanca ya está entre las opciones y la de mujer no cuenta, así que el
  // mensaje es el honesto.
  await shirt.getByRole("button", { name: "Buscar más barato" }).first().click();
  await expect(
    shirt.getByText("No encontramos opciones más baratas que conserven el estilo."),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(WOMEN_SHIRT)).toHaveCount(0);

  // Otro look con las mismas clases de prenda: busca directo, sin pedir talles otra vez.
  await page.goto(`/app/looks/${user.looks[1]}`);
  await page.getByRole("button", { name: "Encontrar este look" }).click();
  await expect(page.getByText(/Búsqueda terminada/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("form", { name: /Antes de buscar, tus/ })).toHaveCount(0);
});

test("premium: el progreso avanza por etapas y termina en el resultado", async ({ page }) => {
  const user = await createUser("shop-progress", { premium: true });
  const job = await holdLookSearch(user, user.looks[0]);
  await signIn(page, user, `/app/looks/${user.looks[0]}`);

  const progress = page.getByRole("region", { name: /Buscando tu look/ });
  await expect(progress.getByText("En la fila · empieza en segundos")).toBeVisible();
  const stages = progress.getByRole("listitem");
  await expect(stages).toHaveCount(SHOPPING_STAGES.length);
  await expect(stages.filter({ hasText: "pendiente" })).toHaveCount(SHOPPING_STAGES.length);

  await setLookSearch(job, "RUNNING", {
    stage: "VERIFYING",
    slots_total: 5,
    slots_done: 3,
    summary: null,
  });
  const current = SHOPPING_STAGES.indexOf("VERIFYING");
  await expect(
    progress.getByText(`Buscando · etapa ${current + 1} de ${SHOPPING_STAGES.length}`),
  ).toBeVisible();
  await expect(stages.filter({ hasText: "completado" })).toHaveCount(current);
  await expect(stages.filter({ hasText: "en curso" })).toHaveCount(1);
  await expect(progress.getByText(/3 de 5 prendas listas/)).toBeVisible();

  await setLookSearch(job, "COMPLETED", {
    stage: "RANKING",
    slots_total: 5,
    slots_done: 5,
    summary: {
      mode: "LOOK",
      slots: 5,
      slots_with_results: 0,
      failed_slots: [],
      candidates: 12,
      products: 0,
      saved: 0,
      unverified_stock: 0,
      unverified_sizes: 0,
      partial: true,
      cache_hits: 0,
    },
  });
  await expect(page.getByText(/Búsqueda terminada/)).toBeVisible();
  await expect(
    page.getByText("No encontramos opciones para este look en las tiendas que revisamos."),
  ).toBeVisible();
  await expect(progress).toHaveCount(0);
});

test("free: el CTA abre el paywall y no se encola ninguna búsqueda", async ({ page }) => {
  const user = await createUser("shop-free");
  await signIn(page, user, `/app/looks/${user.looks[0]}`);

  const cta = page.getByRole("button", {
    name: "Encontrá las prendas reales para recrear este look",
  });
  await cta.click();
  await expect(cta).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("heading", { name: /Desbloqueá tu estilo/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Encontrar este look" })).toHaveCount(0);
  expect(await searchJobs(user.id)).toEqual([]);
});
