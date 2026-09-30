# Paso 10b — Carrito y favoritos: UI y prueba real

**Orden del SPEC:** 18 · **Depende de:** 08, 10a · **SPEC:** "CARRITO", "ANALYTICS" (`external_product_clicked`) · criterios de aceptación 11–13 y 15

## Objetivo

La UI del carrito agregador y de los favoritos, conectada a las acciones del paso 10a, más "Agregar al carrito" desde los resultados:

```
TU LOOK
Remera     Hering   $699     [Comprar ↗]
Pantalón   Legacy   $1.868   [Comprar ↗]
Championes Converse $2.590   [Comprar ↗]
TOTAL APROX: $5.157
```

"Comprar" abre la tienda original.

## Lo que ya hay (verificalo)

- **`/app/cart`.** Server Component de solo lectura: no tiene acciones, subtotal, agrupación, imagen ni talle. Al usuario free le muestra `PaywallCard`.
- **`/app/favorites`.** Solo lectura: no hay botones para agregar ni quitar en ningún lado.
- **Paso 10a.** Ya están las acciones, el view model y los eventos del servidor.
- **Paso 08.** Ya están `external_product_clicked` y la revalidación del link cuando el dato está viejo.
- **Seed.** `demo@asesor.test` trae un carrito y favoritos **ficticios** (dominios `.test`). Para la prueba real, usá un usuario nuevo.

## Tareas

1. **UI de `/app/cart`:**
   - agrupado por look: "TU LOOK" con el nombre del look;
   - por prenda: imagen, tienda, nombre, talle elegido (con selector), precio (o "a consultar") y estado;
   - "Comprar ↗" que abre la tienda original, con `rel` seguro, `external_product_clicked` y revalidación si el dato está viejo;
   - acciones: eliminar, cambiar por alternativa, guardar y comprado (tachado o en una sección aparte);
   - subtotal por look y "TOTAL APROX." por moneda;
   - un estado vacío útil;
   - la UX de un usuario con Premium vencido, según lo decidido en el paso 10a.
2. **"Agregar al carrito"** en los resultados del paso 08 (RECOMENDADO y alternativas):
   - feedback al agregar;
   - talle preseleccionado según el perfil;
   - aviso si el precio cambió al revalidar.
3. **Favoritos:**
   - botones de guardar y quitar en la card y el detalle del look, y en los productos;
   - `/app/favorites` enriquecido con imagen, link a la tienda y link al look.
4. **Verificación visual** en desktop y mobile.
5. **Prueba real** con un usuario Premium local nuevo, a partir de los resultados reales de un look:
   1. agregá **una opción real de cada prenda**;
   2. cambiá un talle;
   3. reemplazá una por su alternativa;
   4. marcá una como comprada;
   5. eliminá otra;
   6. guardá una en favoritos;
   7. mirá el total aproximado;
   8. abrí cada "Comprar ↗": tiene que llevar a la página real del producto;
   9. cerrá sesión, volvé a entrar y verificá que el carrito y los favoritos se conservan.

   Todo va descrito en el log, sin ningún producto `.test`.

## Hecho cuando

- [ ] `/app/cart` cumple todas las operaciones del SPEC desde la UI: agregar, variante, eliminar, cambiar, guardar, subtotal, agrupar por look, comprado y abrir la tienda.
- [ ] "Agregar al carrito" funciona desde los resultados y avisa si el precio cambió.
- [ ] Los favoritos de looks y productos se pueden agregar y quitar, y persisten.
- [ ] La prueba real está completa: una opción real por prenda, total aproximado, links reales y persistencia al volver a entrar (evidencia en el log).
- [ ] `pnpm format`, `lint`, `typecheck`, `test` (con la integración ejecutada), `build` y `test:e2e` en verde.
- [ ] `docs/PRODUCT_SPEC.md` y `DECISIONES.md` actualizados.
