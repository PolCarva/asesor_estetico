# Paso 09 — "Buscar más barato"

**Orden del SPEC:** 17 · **Depende de:** 08 · **SPEC:** "BUSCAR MÁS BARATO", "JOBS", "ANALYTICS" (`cheaper_alternative_requested`) · criterio de aceptación 14

## Objetivo

Cada producto de los resultados permite "Buscar más barato". Al tocarlo, se buscan alternativas que conserven al máximo:

- la categoría;
- la silueta y el fit;
- el color;
- la textura;
- la estética de la prenda.

La restricción dura es **precio < precio actual**. **No se regenera el look** ni se vuelven a buscar las otras prendas.

## Lo que ya hay (verificalo)

- **Pasos previos.** El paso 05 agrega el filtro estricto y re-rankea sobre el pool cacheado. El paso 06 agrega el modo de una sola prenda en `SEARCH_PRODUCTS` (`slot` + `max_price` estricto) y el patrón de lógica testeable en `packages/db` (`startLookShopping`).
- **Analytics.** `cheaper_alternative_requested` ya existe en `ANALYTICS_EVENTS` y en `CLIENT_ANALYTICS_EVENTS`, pero nadie lo emite.
- **Reuso del pool.** El pool cacheado de 24 h puede tener candidatos más baratos ya extraídos. Reusarlos antes de re-scrapear es válido si cumplen la restricción.

## Trampas

- **Monedas distintas.** La restricción se evalúa en la moneda del producto de referencia. Para cruzar UYU y USD, usá la conversión aproximada **solo para filtrar**, y aclaralo en la UI si corresponde. Nunca muestres el precio convertido.
- **Productos sin precio** (paso 04b): "Buscar más barato" no aplica. Ocultá el botón.
- **No dupliques ni borres.**
  - No repitas resultados que ya están en la lista.
  - No borres el recomendado original: las alternativas baratas van como un grupo aparte ("Más baratas").
- **Idempotencia.** Si se pide varias veces por el mismo producto, no se encolan búsquedas duplicadas mientras haya una activa.
- **Premium y rate limit.** Premium se verifica en el servidor (`requirePremium`) y hay rate limit (creá `cheaperSearch` en `rateLimiters`), igual que en la búsqueda completa.

## Tareas

1. **Lógica en `packages/db`**, siguiendo el patrón del paso 06. Por ejemplo, `startCheaperSearch({ userClient, serviceClient, lookId, slot, productId, requestId })`:
   1. verifica que el look sea del usuario y que sea Premium;
   2. lee el producto y la prenda del LookSpec;
   3. arma la query de esa sola prenda, con los mismos atributos estéticos y `max_price` estricto igual al precio actual;
   4. encola `SEARCH_PRODUCTS` en modo prenda, o resuelve desde el pool cacheado si alcanza.
2. **Server action `findCheaperAlternativeAction`**, como capa fina:
   1. `requireAuth` y `requirePremium`;
   2. validación con Zod;
   3. rate limit;
   4. llamada a la lógica del punto 1;
   5. `cheaper_alternative_requested` con `look_id`, `slot`, `product_id` y `price`, emitido una sola vez: desde el servidor o desde el cliente.
3. **Persistencia.** Guardá las alternativas baratas sin pisar el ranking principal: por ejemplo, una marca en `look_products` o un grupo por slot con el origen de la búsqueda. Si hace falta, migración con revokes. Anotalo en `DECISIONES.md` (D17).
4. **UI:**
   - botón "Buscar más barato" en cada producto con precio;
   - progreso compacto para esa prenda, reusando las etapas del paso 07;
   - resultados "Más baratas que $X", ordenados por parecido (no solo por precio) y con la diferencia de precio;
   - estado honesto cuando no hay: "No encontramos opciones más baratas que conserven el estilo".
5. **Tests**, unit y de integración en `packages/db`:
   - el filtro estricto nunca devuelve un precio mayor o igual;
   - se conservan los atributos de la query;
   - no hay duplicados;
   - un usuario free queda rechazado;
   - idempotencia.
6. **Prueba real.** En un look con resultados reales, pedí "más barato" para al menos 2 prendas distintas. En el log van:
   - el precio original contra el de cada alternativa (todas menores);
   - las tiendas;
   - por qué se parecen, con el breakdown del score.

## Hecho cuando

- [ ] "Buscar más barato" funciona por producto, solo para esa prenda y sin regenerar el look.
- [ ] Todas las alternativas cumplen precio < actual (tests + prueba real).
- [ ] Se conserva la estética: el ranking sigue priorizando el parecido.
- [ ] `cheaper_alternative_requested` registrado. El servidor rechaza a un usuario free (test de integración).
- [ ] Prueba real en 2 prendas, y al menos una devuelve ≥1 alternativa real con precio < actual (evidencia en el log). Si ninguna encuentra, probá otras prendas hasta que una encuentre o documentá por qué no hay.
- [ ] `pnpm format`, `lint`, `typecheck`, `test` (con integración ejecutada), `build` y `test:e2e` en verde.
- [ ] `docs/SHOPPING_ENGINE.md` y `DECISIONES.md` actualizados.
