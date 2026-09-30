# Paso 04a — Shopping: fetcher seguro, extracción y normalización

**Orden del SPEC:** 10–11 · **Depende de:** 03 · **SPEC:** "PIPELINE DE SHOPPING", "DATOS DE CADA PRODUCTO", "MANEJO DE ERRORES" · **Leer también:** [`TIENDAS_UY.md`](../TIENDAS_UY.md)

## Objetivo

De URL candidata a **producto normalizado**, con la parte genérica que sirve para cualquier tienda:

`Candidate URL → Fetch (seguro) → Extract (JSON-LD → microdata → OpenGraph) → Normalize`

Los adaptadores de plataforma para talles y stock, la etapa Validate y los locales físicos van en el paso 04b.

Orden de extracción que pide el SPEC:

1. JSON-LD / datos estructurados.
2. Metadata / HTML.
3. Endpoints accesibles del ecommerce (paso 04b).
4. Parsing específico, solo cuando haga falta.
5. Navegador / Playwright, solo como último recurso.

**Nunca inventar precio, stock ni talle.**

## Lo que ya hay (relevamiento 2026-09-30, verificalo)

- **`fetch.ts`.** `isSafeProductUrl` (anti-SSRF por regex de hostname) y `fetchProductPage`.
  - **No bloquea** `localhost.` (con punto final), `*.localhost`, 100.64.0.0/10 ni 0.x.x.x.
  - No resuelve DNS, no revalida redirecciones y no tiene límites de tamaño ni de tiempo.
  - `ProductFetcher.fetch(url)` no recibe `AbortSignal`.
- **`extract.ts`.** Solo lee JSON-LD con `@type: 'Product'`:
  - no toma `ProductGroup` ni lee imágenes `ImageObject`;
  - usa `offers[0]`, pero en Shopify hay un Offer por variante;
  - no tiene fallback a microdata ni a OpenGraph.

  **Las tiendas Fenicio (Legacy, Hering, Indian, Stadium…) solo exponen microdata:** hoy daría `null` en todas.

- **`normalize.ts`.** Descarta el producto si no hay título ni precio, o si la moneda no es UYU/USD. `fit` siempre `null`.
  - `inferCategory` usa regex en singular: "Championes negros", "Remeras básicas", "Pantalones sastreros", "Polo tejido", "Cadena plateada" y "Musculosa" terminan en `OTHER`, y el ranker los descarta.
  - `asNumber` falla con `1.890,00` y con `6.390`.
- **Ids.** `ProductSchema.id` es un string (`externalId ?? url`), **no** el uuid de la base. `normalize` inventa ids de variante por índice (`${id}#${i}`), inestables.
- **`refreshProduct`.** Ante una falla devuelve `availability: 'UNKNOWN'` con `fetched_at = now`: una verificación fallida parece dato fresco.
- **Dependencias.** `packages/shopping` no tiene parser de HTML.

## Trampas

- **Anti-SSRF.** Las URLs vienen de terceros (búsqueda web). Revalidá **cada redirección**, resolvé DNS y rechazá IPs privadas, y limitá tamaño y tiempo. Un test por caso.
- **Parser de HTML.** Microdata y OpenGraph piden un parser. Si agregás uno:
  - que sea uno solo, JS puro y chico;
  - por `catalog` de `pnpm-workspace.yaml`, justificado en `DECISIONES.md`;
  - con `pnpm-lock.yaml` commiteado;
  - verificando `pnpm --filter @asesor/worker build` (bundle tsup `noExternal`).
- **Playwright.** Hoy es solo dependencia de desarrollo (E2E), y meterlo en la imagen del worker es pesado. Lo esperable: fuera del MVP, documentado como fallback futuro, y **nunca** para evadir anti-bot.
- **Fixtures reales.** Van recortados y sin datos personales.

## Tareas

1. **Fetcher HTTP real** (`ProductFetcher`) en `packages/shopping`, con:
   - `AbortSignal` y timeout;
   - tamaño máximo;
   - user agent identificable;
   - redirecciones manuales revalidadas;
   - chequeo de IP privada después de resolver DNS;
   - rate limit y concurrencia por dominio;
   - robots.txt (reusá lo del paso 03).

   Endurecé `isSafeProductUrl` con los casos faltantes.

2. **Extracción en cascada**, pura y testeable:
   1. JSON-LD `Product`/`ProductGroup` (`hasVariant`), con `ImageObject` y la disponibilidad agregada entre offers ("alguna variante disponible").
   2. Microdata schema.org (`itemprop`).
   3. OpenGraph / `product:price:*`.

   La salida es un `RawProduct` con la fuente de cada dato.

3. **Normalización:**
   - Precios con formato local (`1.890,00`, `6.390`, `UYU 1.690`, microdata `content`).
   - Categorías con plurales y términos de Uruguay: championes, remeras, pantalones, buzo, campera, pollera, musculosa, bermuda, cadena, anillo, lentes…
   - `fit` inferido del título o la descripción cuando está explícito: relaxed, slim, oversize, regular, recto, wide…
   - Colores y materiales.
   - Ids de variante estables (SKU o id de la plataforma, nunca el índice).
   - `fetched_at` / `last_verified_at` honestos: una falla no cuenta como verificación.
4. **Tolerancia a fallas:** tienda que bloquea, producto que desapareció (404/410), HTML que cambió o extracción que falla. Cada candidato falla solo, y el resultado lleva conteos (candidatos, fallidos, sin precio, etc.).
5. **Tests con fixtures reales grabados** (HTML recortado) de:
   - una tienda Fenicio (microdata);
   - una VTEX (JSON-LD);
   - una Shopify con `ProductGroup` o multi-offer.

   Casos de precio local, categoría en plural, fit, ids estables, "falla no renueva la fecha" y SSRF (redirección a IP privada, `localhost.`, CGNAT).

6. **Prueba real:** script de desarrollo (`apps/worker/scripts/`) que tome candidatas reales del paso 03 y extraiga productos. Debe dar ≥1 producto válido de **al menos 5 tiendas en ≥3 plataformas**, con nombre, precio, moneda e imagen. Pegá la tabla resumen en el log.
7. **Docs:** `docs/SHOPPING_ENGINE.md` (fetcher, SSRF, cascada, normalización) y `TIENDAS_UY.md`.

## Hecho cuando

- [ ] Fetcher real endurecido (SSRF con DNS y redirecciones, timeouts, tamaño, robots, rate limit), con tests por caso.
- [ ] Extracción JSON-LD, microdata y OpenGraph con fixtures reales de ≥3 plataformas.
- [ ] Normalización de precios locales, categorías de Uruguay, fit e ids estables, con tests. Una falla de verificación no renueva la fecha (test).
- [ ] Prueba real: productos válidos de ≥5 tiendas en ≥3 plataformas (evidencia en el log).
- [ ] Si se agregó un parser: justificado y `pnpm --filter @asesor/worker build` en verde.
- [ ] `pnpm format`, `lint`, `typecheck`, `test` (con integración ejecutada) y `build` en verde.
- [ ] Docs y `DECISIONES.md` actualizados.
