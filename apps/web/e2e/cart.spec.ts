import { expect, type Page, test } from "@playwright/test";

import {
  createUser,
  deleteCreatedUsers,
  expirePremium,
  findLook,
  pieceRow,
  signIn,
} from "./helpers";

/**
 * Carrito y guardados (paso 12a): agregar una opción de cada prenda, talle, comprado, quitar,
 * cambiar por otra opción, total aproximado, link externo seguro, que todo siga ahí al
 * recargar y el solo lectura de un Premium vencido; free ve el paywall.
 */

test.afterAll(deleteCreatedUsers);

const cartLink = (page: Page, name: string) =>
  page.getByRole("link", { name, exact: true }).first();
const removeButton = (page: Page, title: string) =>
  page.getByRole("button", { name: `Quitar ${title} del carrito` });
const cartRow = (page: Page, title: string) =>
  page.getByRole("listitem").filter({ has: page.getByText(title, { exact: true }) });

test("premium: arma el carrito del look, lo edita y persiste al recargar", async ({ page }) => {
  const user = await createUser("cart", { premium: true });
  await signIn(page, user, `/app/looks/${user.looks[0]}`);
  await findLook(page, user.looks[0]);

  // Una prenda suelta y después el resto del look con un solo botón.
  const shirt = pieceRow(page, "camisa oxford");
  await shirt.getByRole("button", { name: "+ Agregar al carrito" }).first().click();
  await expect(shirt.getByRole("link", { name: "En el carrito ✓" }).first()).toBeVisible();
  await expect(cartLink(page, "Carrito, 1 producto por comprar")).toBeVisible();

  await page.getByRole("button", { name: /^Agregar el look al carrito/ }).click();
  await expect(
    page.getByRole("link", { name: "El look está en tu carrito · Ver carrito" }),
  ).toBeVisible();
  await expect(cartLink(page, "Carrito, 4 productos por comprar")).toBeVisible();

  // Guardados: el look y un producto. El ♡ cambia al instante; se espera a que el servidor
  // confirme (el botón se vuelve a habilitar) antes de salir de la página.
  await page.getByRole("button", { name: "Guardar el look Smart casual cálido" }).click();
  await expect(
    page.getByRole("button", { name: "Quitar el look Smart casual cálido de guardados" }),
  ).toBeEnabled();
  const boots = pieceRow(page, "desert boots");
  await boots.getByRole("button", { name: "Guardar Desert boots de gamuza chocolate" }).click();
  await expect(
    boots.getByRole("button", { name: "Quitar Desert boots de gamuza chocolate de guardados" }),
  ).toBeEnabled();

  await page.goto("/app/cart");
  const group = page.getByRole("region", { name: "Smart casual cálido" });
  await expect(group.getByText("Tu look · 01")).toBeVisible();
  for (const title of [
    "Overshirt de lana camel",
    "Camisa oxford cruda",
    "Pantalón chino verde oliva",
    "Desert boots de gamuza chocolate",
  ]) {
    await expect(cartRow(page, title)).toHaveCount(1);
  }

  // Pesos y dólares por separado, con el aproximado convertido aparte.
  const total = page.getByRole("complementary", { name: "Total" });
  await expect(total.getByText(/^\$\s7\.670 \+ US\$\s79$/)).toBeVisible();
  await expect(total.getByText(/^≈ \$\s[\d.]+ en total/)).toBeVisible();
  await expect(total.getByText("4 productos por comprar")).toBeVisible();

  // El link a la tienda pasa por el servidor y no filtra referer ni da autoridad a la tienda.
  const buy = cartRow(page, "Camisa oxford cruda").getByRole("link", { name: /Comprar/ });
  await expect(buy).toHaveAttribute("rel", "noopener noreferrer nofollow");
  await expect(buy).toHaveAttribute("target", "_blank");
  await expect(buy).toHaveAttribute("href", /^\/api\/products\/[0-9a-f-]{36}\/open/);

  // Talle, comprado y quitar.
  const size = page.getByRole("combobox", { name: "Talle de Camisa oxford cruda" });
  await expect(size.locator("option:checked")).toHaveText("M · crudo");
  await size.selectOption({ label: "L · crudo · agotado" });
  await expect(cartRow(page, "Camisa oxford cruda").getByText(/· Talle L · crudo$/)).toBeVisible();

  await cartRow(page, "Camisa oxford cruda").getByRole("button", { name: "Ya lo compré" }).click();
  await expect(
    cartRow(page, "Camisa oxford cruda").getByRole("button", { name: "Comprado ✓ · deshacer" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(total.getByText(/^Ya comprado \(1\)/)).toBeVisible();

  await removeButton(page, "Pantalón chino verde oliva").click();
  await expect(cartRow(page, "Pantalón chino verde oliva")).toHaveCount(0);
  await expect(cartLink(page, "Carrito, 2 productos por comprar")).toBeVisible();

  // Cambiar por otra opción de la misma prenda del look.
  const bootsLine = cartRow(page, "Desert boots de gamuza chocolate");
  await bootsLine.getByText("Cambiar por otra opción (1)").click();
  await bootsLine.getByRole("button", { name: "Elegir esta" }).click();
  // Las botas pasan a ser la alternativa de la línea nueva: se mira qué se puede quitar.
  await expect(removeButton(page, "Zapatillas urbanas negras")).toBeVisible();
  await expect(removeButton(page, "Desert boots de gamuza chocolate")).toHaveCount(0);

  // Todo sigue igual después de recargar.
  await page.reload();
  await expect(cartRow(page, "Pantalón chino verde oliva")).toHaveCount(0);
  // Comprado: el talle queda fijo (sin selector) y se ve el elegido.
  await expect(cartRow(page, "Camisa oxford cruda").getByText(/· Talle L · crudo$/)).toBeVisible();
  await expect(
    cartRow(page, "Camisa oxford cruda").getByRole("button", { name: "Comprado ✓ · deshacer" }),
  ).toBeVisible();
  await expect(removeButton(page, "Zapatillas urbanas negras")).toBeVisible();
  await expect(removeButton(page, "Desert boots de gamuza chocolate")).toHaveCount(0);
  await expect(total.getByText("2 productos por comprar")).toBeVisible();

  await page.goto("/app/favorites");
  await expect(page.getByRole("heading", { name: "Looks · 1" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Productos · 1" })).toBeVisible();
  await expect(page.getByText("Desert boots de gamuza chocolate")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Quitar el look Smart casual cálido de guardados" }),
  ).toBeVisible();

  // Premium vencido: el carrito queda guardado en solo lectura, con las tiendas a mano.
  await expirePremium(user);
  await page.goto("/app/cart");
  await expect(page.getByText(/Tu Premium no está activo/)).toBeVisible();
  await expect(
    cartRow(page, "Camisa oxford cruda").getByRole("link", { name: /Comprar/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Quitar .* del carrito$/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Comprado ✓ · deshacer" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Desbloqueá tu estilo/ })).toBeVisible();
});

test("free: el carrito muestra el paywall", async ({ page }) => {
  const user = await createUser("cart-free");
  await signIn(page, user, "/app/cart");
  await expect(page.getByRole("heading", { name: /Desbloqueá tu estilo/ })).toBeVisible();
  await expect(page.getByText("Tu carrito está vacío")).toHaveCount(0);
});
