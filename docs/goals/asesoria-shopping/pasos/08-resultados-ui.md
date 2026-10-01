# Paso 08 — UI de resultados de shopping

**Orden del SPEC:** 15 · **Depende de:** 07 · **SPEC:** "RESULTADOS", "DATOS DE CADA PRODUCTO", "LOCALES SIN ECOMMERCE", "MANEJO DE ERRORES", "UX", "ANALYTICS" (`product_viewed`, `external_product_clicked`) · criterios de aceptación 9–10, 13

## Objetivo

Mostrar los productos reales encontrados para un look, **agrupados por prenda** (TOP, BOTTOM, LAYERING, SHOES, ACCESSORIES…), con **pocas opciones buenas**: un RECOMENDADO + 2–4 ALTERNATIVAS (3–5 por prenda, nunca 50).

Cada producto muestra:

- imagen, tienda, nombre y precio con moneda;
- estado del talle del usuario: "disponible ✓", "no disponible" o "no pudimos verificar el talle";
- stock honesto (`IN_STOCK` / `OUT_OF_STOCK` / `UNKNOWN` / `IN_STORE_ONLY`) y cuándo se verificó;
- link real a la tienda.

Los locales físicos se muestran como "Disponible en tienda física", con precio si se conoce, ubicación y contacto o link.

Dejá preparados los lugares para "Agregar al carrito" (paso 10b) y "Buscar más barato" (paso 09).

## Diseño (`docs/DESIGN_SYSTEM.md`, pantalla 2h)

- **Dónde.** Los resultados viven en la lista de piezas de `/app/looks/[id]`: **una fila por prenda**, que ya agrupa por TOP, BOTTOM, CAPAS, CALZADO y ACCESORIOS como pide el SPEC. La fila del pelo queda primera, sin producto.
- **Fila.** Muestra el RECOMENDADO:
  - miniatura del producto (reemplaza el guijarro de color);
  - nombre;
  - "tienda · talle" (estado del talle en `eyebrow`);
  - precio en Familjen 20 px con su moneda;
  - chip oscuro "Comprar ↗".
- **Alternativas.** Las 2–4 se abren dentro de la misma fila ("Ver N opciones más"), así se cumplen las 3–5 opciones por prenda sin perder la lista del diseño.
- **Píldora oscura de abajo.** "Comprar el look completo · $ total" solo si todos los recomendados tienen precio y la misma moneda; si no, subtotal por moneda o sin total. Nunca la conversión aproximada del ranker (paso 10b: agregar al carrito).
- **Pie.** Nada de "tiendas asociadas" ni "comisión": no hay afiliación. Mostrá cuándo se verificaron los precios.
- **Pines.** Los pines del render siguen siendo por zona del cuerpo. No los muevas según el producto.

## Lo que ya hay (relevamiento 2026-09-30, verificalo)

- **Datos.**
  - `look_products` (RLS: solo el dueño Premium) tiene `garment_slot`, `rank`, `score` y `score_breakdown`.
  - Se cruza con `products` y `product_variants`, que cualquier usuario autenticado puede leer.
  - Los datos los persisten los pasos 05 y 06.
  - El resumen del job trae conteos de fallas y de datos sin verificar (paso 06).
- **Imágenes.** La CSP de `apps/web/next.config.ts` solo permite `img-src 'self' data: blob: <supabase>`, así que **hoy se bloquean las imágenes de las tiendas**.
- **Links externos.** Usan `rel="noopener noreferrer nofollow"`, como en `/app/cart`.
- **Analytics.** `product_viewed` y `external_product_clicked` no existen. `product_clicked` está en la lista del cliente pero nadie lo emite: decidí si se reemplaza o se depreca.
- **Datos ficticios.** `demo@asesor.test` trae `look_products` ficticios del seed (dominios `.test`). Para verificar con datos reales, usá un usuario nuevo.

## Trampas

- **Imágenes externas.** Tres caminos:
  - A: ampliar `img-src` a `https:`.
  - B: un proxy de imágenes propio. Cuidado con SSRF, tamaño y cache.
  - `next/image` con `remotePatterns` no escala a tiendas descubiertas dinámicamente.

  Decidí (D16), anotalo y revisá `docs/SECURITY_PRIVACY.md`.

- **Monedas.** Hay precios en UYU y en USD. Mostrá cada uno en su moneda real y nunca la conversión aproximada del ranker como precio. Si no hay precio, "precio a consultar".
- **Errores.** Nunca muestres errores técnicos. Mensajes de parcialidad honestos, por ejemplo: "Encontramos opciones similares, pero no pudimos verificar el stock de algunas prendas".
- **Prendas sin resultados.** Decilo ("No encontramos opciones para esta prenda todavía"), no la ocultes en silencio.
- **Polling.** Cuando ya hay resultados, el detalle del look no debe hacer polling caro.

## Tareas

1. **Lectura en el servidor.** Traé los resultados de un look con el cliente del usuario: `look_products` + `products` + `variants`, agrupados por slot, ordenados por rank y con el talle del usuario resuelto por prenda.
   - Armá una función pura de view model, en `packages/shared` o `apps/web/src/lib`.
   - Tests: agrupación, recomendado vs. alternativas, estado del talle, sin precio y mensajes de parcialidad.
2. **UI** en `/app/looks/[id]` o en una subruta de resultados:
   - secciones por prenda, con la descripción de la prenda del look;
   - card RECOMENDADO destacada y alternativas compactas;
   - badges de stock y talle, fecha de verificación y card de tienda física;
   - mensajes de parcialidad;
   - "Volver a buscar" si los resultados están viejos.

   Mobile first, accesible y con el sistema visual de `docs/DESIGN_SYSTEM.md` (ver "Diseño" arriba).

3. **"Ver en la tienda ↗".**
   - `rel` seguro.
   - Emite `external_product_clicked` desde un componente cliente, con `product_id`, `store_domain`, `look_id` y `slot`. Agregalo a `ANALYTICS_EVENTS` y a `CLIENT_ANALYTICS_EVENTS`.
   - Si el dato tiene más de 8 h, revalidá antes de abrir: por ejemplo, una ruta de redirección que refresca o encola `REFRESH_PRODUCT` y después redirige. La revalidación que exige el carrito es del paso 10a.
4. **`product_viewed`** al mostrar o abrir un producto, sin inundar: una vez por producto y sesión, o al expandir.
5. **Imágenes:** aplicá la CSP o el proxy según la decisión.
6. **Solo Premium**, para la página y para la lectura, además de la RLS. Free ve el CTA y el paywall (paso 07).
7. **Verificación en el navegador** con resultados **reales**:
   - Setup: usuario Premium local nuevo, worker con `SHOPPING_PROVIDER=live`, desktop y mobile, al menos 2 de los 3 looks.
   - Las imágenes cargan.
   - Los precios y las tiendas son correctos.
   - Los links abren la página real del producto.
   - En una muestra de 3 productos, los talles y el stock coinciden con la tienda (revisado a mano).
   - No aparece ningún producto de dominio `.test`.

## Hecho cuando

- [ ] Resultados agrupados por prenda, con 3–5 opciones: recomendado + alternativas.
- [ ] Cada producto muestra imagen, tienda, precio con moneda (o "a consultar"), estado de talle y stock honesto, fecha de verificación y link real.
- [ ] Tiendas físicas (`IN_STORE_ONLY`) y mensajes de parcialidad se ven bien, con datos reales o con test o fixture si no hubo casos reales.
- [ ] `product_viewed` y `external_product_clicked` registrados. El link revalida si el dato está viejo.
- [ ] Verificación con datos reales en 2 looks, muestra de 3 productos contrastada con la tienda y sin productos `.test` (en el log).
- [ ] `pnpm format`, `lint`, `typecheck`, `test` (con integración ejecutada), `build` y `test:e2e` en verde.
- [ ] `docs/PRODUCT_SPEC.md`, `docs/SECURITY_PRIVACY.md` (si cambia la CSP) y `DECISIONES.md` actualizados.
