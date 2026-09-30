# Paso 10a — Carrito: datos y acciones

**Orden del SPEC:** 18 · **Depende de:** 06 · **SPEC:** "CARRITO", "CACHE" (revalidar antes de agregar o abrir), "PREMIUM", "ANALYTICS" (`product_added_to_cart`, `product_removed_from_cart`)

## Objetivo

El backend del carrito real, sobre las tablas existentes. **No procesa la compra**: es un agregador de productos externos. Tiene que permitir:

- agregar un producto, revalidándolo si el dato está viejo;
- elegir la variante o el talle;
- eliminar;
- cambiarlo por otra alternativa de la misma prenda;
- guardar el producto (favoritos);
- calcular un subtotal aproximado;
- agrupar por look;
- marcar como comprado.

Premium se verifica en el servidor. La UI va en el paso 10b.

## Lo que ya hay (relevamiento 2026-09-30, verificalo)

- **Tablas.** `carts (id, user_id UNIQUE)` y `cart_items`, con estas columnas: `cart_id`, `product_id`, `variant_id`, `quantity` (1..10), `price_amount_snapshot` (NOT NULL) y `currency_snapshot` (NOT NULL). El único es `UNIQUE NULLS NOT DISTINCT (cart_id, product_id, variant_id)`. **No hay** `look_id`, `garment_slot`, `purchased_at` ni "guardar para después".
- **Trigger de precio.** `set_cart_item_price_snapshot` corre **solo BEFORE INSERT** y copia precio y moneda desde `products`/`product_variants`. El cliente nunca fija el precio.
- **Grants y RLS de `carts`.** `authenticated` tiene select e insert(`user_id`). El insert exige Premium. No hay update ni delete.
- **Grants y RLS de `cart_items`.**
  - select y delete, sin gating Premium;
  - insert(`cart_id`, `product_id`, `variant_id`, `quantity`) y update(`quantity`), los dos exigiendo Premium.
- **Favoritos.** `favorites (user_id, look_id | product_id)` guarda exactamente uno de los dos. Guardar un producto exige Premium por RLS.
- **No hay server actions** de carrito ni de favoritos. `requirePremium` no se usa en la web.
- **Schemas y constantes.** `APPROX_UYU_PER_USD` vive en `packages/shopping/src/rank.ts`. `CartItemSchema`/`CartSchema` (`packages/shared/src/schemas/cart.ts`) no coinciden con la tabla.
- **Analytics.** `product_added_to_cart` y `product_removed_from_cart` no existen. `look_saved` y `product_saved` existen, pero nadie los emite.

## Trampas

- **Tipos generados.** `cart_items.Insert` exige `price_amount_snapshot`/`currency_snapshot`, pero `authenticated` no puede escribirlos. Solución: defaults en la migración o un helper tipado. Nunca aceptes precios del cliente.
- **Cambiar variante o producto.** Si lo hacés con UPDATE, el trigger tiene que correr también `BEFORE UPDATE OF product_id, variant_id`. Si no, hacelo como delete + insert.
- **Productos sin precio.** Si el paso 04b los permitió (`IN_STORE_ONLY` o "a consultar"), el trigger no puede romper con un error técnico. Decidí si se aceptan con precio nulo (fuera del total) o si se rechazan con un mensaje humano.
- **Único actual.** Impide tener el mismo producto en dos looks. Si agregás `look_id`, redefinilo.
- **Carrera al crear el carrito.** El get-or-create choca con `unique(user_id)`: usá un upsert que ignore duplicados y después un select.
- **IDOR.** El `look_id` de `cart_items` tiene que ser del usuario, en la política de insert.
- **Premium vencido.** Un usuario que dejó de ser Premium hoy solo ve el paywall en `/app/cart`, aunque la RLS le deja leer y borrar. Decidí la UX (por ejemplo, carrito en solo lectura) y anotala.
- **Monedas mixtas.** Subtotal por moneda. Un total aproximado único solo si se aclara ("aprox.").
- **Objetos nuevos** (tabla, función o trigger): hacé los revokes de los default privileges (ver README, "Entorno").

## Tareas

1. **Migración nueva** (no edites migraciones viejas):
   - `cart_items`: agregá `look_id` (FK a `looks`, `on delete set null`), `garment_slot` (mismo check que `look_products`) y `purchased_at`;
   - redefiní el único;
   - cambiá el trigger a `BEFORE INSERT OR UPDATE OF product_id, variant_id`, con manejo de productos sin precio;
   - grants de insert y update para las columnas nuevas;
   - IDOR de `look_id` en la política;
   - defaults, si corresponde.

   Después: `db:reset`, `db:types` y actualizá `packages/shared/src/schemas/cart.ts` para que coincida con la base.

2. **Dominio puro** en `packages/shared`:
   - view model del carrito: agrupar por look y prenda, subtotal por moneda, total aproximado, cómo cuentan los comprados y los que no tienen precio;
   - mové `APPROX_UYU_PER_USD` a constantes compartidas, si hace falta.

   Tests.

3. **Lógica testeable** en `packages/db`, con el patrón del paso 06 (cliente del usuario con RLS, más service role solo donde haga falta):
   - `addToCart(productId, variantId?, lookId, slot)`: **revalida** el producto si tiene más de 8 h (fetch con timeout corto, o `REFRESH_PRODUCT` con fallback honesto a `UNKNOWN`) y avisa si cambió el precio;
   - `removeFromCart`;
   - `selectVariant`: el trigger recalcula el precio;
   - `swapCartItem`: reemplaza por otra alternativa de la misma prenda del look;
   - `markPurchased` / `unmarkPurchased`;
   - favoritos: agregar y quitar looks y productos.
4. **Server actions** como capas finas: `apps/web/src/app/app/cart/actions.ts` y `apps/web/src/app/app/favorites/actions.ts`.
   - `requireAuth` y `requirePremium` (los favoritos de looks no exigen Premium);
   - Zod;
   - rate limit: creá `cart` en `rateLimiters`;
   - `revalidatePath`;
   - eventos del servidor: `product_added_to_cart`, `product_removed_from_cart`, `look_saved` y `product_saved`, agregados a `ANALYTICS_EVENTS`, solo servidor.

   Nada de errores técnicos al usuario.

5. **Tests de integración** en `packages/db/test/integration`:
   - un usuario free no puede crear el carrito ni agregar ítems; uno Premium sí;
   - IDOR de `cart_id` y de `look_id`;
   - se ignora el precio que manda el cliente;
   - cambiar la variante recalcula el snapshot;
   - un producto sin precio no rompe (o se rechaza con un error controlado);
   - `purchased_at` solo lo toca el dueño;
   - los favoritos de productos exigen Premium;
   - la revalidación de un producto viejo actualiza la fecha solo si se verificó.

## Hecho cuando

- [ ] La migración del carrito está aplicada desde cero, con `db:types` y `cart.ts` alineados y revokes correctos.
- [ ] Hay lógica y actions para agregar (con revalidación), variante, eliminar, cambiar por alternativa, comprado y favoritos, con Premium (`requirePremium` y RLS) en cada action de carrito y de favoritos de producto. Los favoritos de looks siguen disponibles para usuarios free.
- [ ] Un producto sin precio no rompe el carrito: queda fuera del TOTAL APROX. o se rechaza con un mensaje humano (test de integración).
- [ ] Los tests de integración del carrito y de favoritos, más los unit del view model, están en verde.
- [ ] `product_added_to_cart`, `product_removed_from_cart`, `look_saved` y `product_saved` se emiten desde el servidor.
- [ ] `pnpm format`, `lint`, `typecheck`, `test` (con la integración ejecutada) y `build` en verde.
- [ ] `docs/DATA_MODEL.md`, `docs/SHOPPING_ENGINE.md` (revalidación) y `DECISIONES.md` (D18, D19) actualizados.
