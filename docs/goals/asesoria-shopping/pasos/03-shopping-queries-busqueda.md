# Paso 03 — Shopping: queries desde el LookSpec y búsqueda real

**Orden del SPEC:** 7–9 · **Depende de:** — · **SPEC:** "SHOPPING REAL EN URUGUAY", "TIENDAS", "PIPELINE DE SHOPPING", "TALLES" · **Leer también:** [`TIENDAS_UY.md`](../TIENDAS_UY.md)

## Objetivo

Del LookSpec a **URLs candidatas reales** en tiendas uruguayas:

`LookSpec → prendas necesarias → ShoppingQueries estructurados → Search → Candidate URLs`

La búsqueda tiene que ser:

- **real:** sin mocks, salvo en tests;
- **genérica y extensible:** nada de scrapers a mano para 20 tiendas;
- **abierta:** que no dependa solo de una lista fija de tiendas, así llega a boutiques, tiendas independientes y otros ecommerce uruguayos.

## Lo que ya hay (relevamiento 2026-09-30, verificalo)

- **Pipeline.** `packages/shopping` (`types.ts`, `search.ts`, `fetch.ts`, `extract.ts`, `normalize.ts`, `rank.ts`, `cache.ts`, `mocks.ts`) tiene el pipeline genérico cableado, pero solo contra mocks:
  - `MockSearchProvider` devuelve todo el catálogo ficticio sin mirar la query;
  - `MockProductFetcher` sirve páginas de ese catálogo.
- **Interfaces:** `SearchProvider { name; search(query: ShoppingQuery): Promise<CandidateUrl[]> }` y `CandidateUrl { url; store }`.
- **Query.** `ShoppingQuerySchema` (`packages/shared/src/schemas/products.ts`) es `{ garment: Garment, country_code: 'UY', size: string | null, max_price: Money | null, limit: 1..20 }`. No tiene términos de búsqueda, público (hombre/mujer), exclusiones ni precio máximo estricto.
- **Prendas del look.** `listLookGarments(look)` (`packages/shared/src/schemas/look-spec.ts`) devuelve `{ slot, garment }` con los slots `top`, `bottom`, `layering:0..2`, `shoes` y `accessory:0..4`. **No existe un mapper de LookSpec a ShoppingQuery.**
- **Garment.** `Garment = { category: ProductCategory, description ≤160, color {name, hex}, fit, material, pattern }`. `ProductCategory` tiene 20 valores y está duplicado en Zod y en un enum de Postgres.
- **Worker.** `apps/worker/src/index.ts` instancia los mocks hardcodeados, sin variable de entorno que los cambie. `AI_PROVIDER` tiene default `mock` (`packages/config/src/env/schemas.ts`).
- **Dependencias.** `packages/shopping` depende solo de `@asesor/shared` (no tiene `zod` directo), no tiene config de vitest y no puede leer env: la configuración se inyecta desde el worker.
- **Talles.** No hay talles del usuario en ningún lado (los agrega el paso 07).
- **Tiendas bloqueadas.** Mercado Libre, Zara y Nike bloquean requests automáticos. Stadium y H&M prohíben por robots su búsqueda y su API (ver `TIENDAS_UY.md`).

## Trampas

- **Capas.** `packages/shared` es dominio puro, sin red ni SDKs: el mapper, los sinónimos y los talles van ahí. Los proveedores de búsqueda van en `packages/shopping`.
- **Público.** Una "remera negra" de mujer no sirve para un look masculino. Usá `StyleProfile.appearance.presentation` o lo que corresponda, sin inferir datos sensibles.
- **Reglas de las tiendas.** Respetá robots.txt y los términos de cada una, con user agent identificable. No evadas protecciones anti-bot.
- **Privacidad.** Nada de datos personales ni fotos en consultas a terceros (`docs/SECURITY_PRIVACY.md`).
- **Cambios compartidos.** `GarmentSchema` se comparte con el payload `SEARCH_PRODUCTS` y con el ranker: cambios aditivos, y actualizá los tests.
- **Mocks fuera de producción.** Si `SHOPPING_PROVIDER` copia el default `mock` de `AI_PROVIDER`, un worker sin la variable serviría el catálogo ficticio como si fuera real. En producción, `mock` no puede estar permitido.
- **Scripts y tests.**
  - Los scripts de prueba real van en `apps/worker/scripts/`, que tiene `tsx` y arma los proveedores reales (ver README, "Verificación").
  - Nunca como `*.test.ts`: sin config, vitest los mete en `test:unit`, que corre en CI sin red.
  - Los tests con red real no van en la suite.

## Tareas

1. Leé `docs/SHOPPING_ENGINE.md`, `docs/ARCHITECTURE.md`, `packages/shopping` completo con sus tests, y `TIENDAS_UY.md`.
2. **Estrategia de búsqueda:** anotala en `DECISIONES.md` (D6).
   - **Registro de tiendas** extensible como datos, no como código por tienda: dominio, plataforma, foco o público, qué permite robots (`allowSearchEndpoint`, `allowApi`, sitemap). Arrancá con las del relevamiento.
   - **Adaptadores de búsqueda por plataforma**, no por tienda: Fenicio (`/catalogo?q=`), VTEX (API de catálogo), Shopify (`suggest.json`/`products.json`) y WooCommerce (Store API). Cada tienda del registro usa el de su plataforma, solo donde robots lo permite.
   - **Tiendas con la búsqueda prohibida por robots** (Stadium, H&M, BAS): cubrilas vía sitemap en este paso (índice de URLs de producto filtrado por términos, respetando robots). Si no se puede, documentá el motivo en `TIENDAS_UY.md`.
   - **Descubrimiento abierto** con la server tool `openrouter:web_search`: la clave de OpenRouter ya está en `.env` y cuesta ~USD 0.007 por búsqueda. Las URLs de tiendas uruguayas fuera del registro pasan igual por fetch, extracción y validación (paso 04a/b). Se detecta la plataforma por huella (Fenicio `X-Powered-By: MV`/`f.fcdn.app`, VTEX `vtexassets`, Shopify `cdn.shopify`, Woo `wp-content`) para reusar los adaptadores.
   - **`SearchProvider` compuesto**: combina las fuentes, deduplica URLs canonicalizadas, acota resultados por tienda y tolera fallas parciales (una tienda caída no rompe la búsqueda).
3. **Talles (dominio puro)** en `packages/shared`:
   - `UserSizesSchema` (`top`, `bottom`, `shoe`, `shoe_size_system: 'EU' | 'US'`);
   - `sizeKindForCategory(category)`: camisas, remeras, buzos, camperas y blazers → top; pantalones, jeans, shorts y polleras → bottom; calzado → shoe; accesorios → ninguno.

   Los reusan los pasos 06 y 07: no los dupliques después.

4. **Mapper puro** `buildShoppingQueries(look, { sizes, audience, limit })` en `packages/shared`, sobre `listLookGarments`. Genera una query por prenda con:
   - slot y categoría;
   - términos en español rioplatense (descripción, color, material, fit);
   - sinónimos (remera/camiseta, championes/zapatillas, buzo/sweater, campera/chaqueta, pollera/falda…);
   - talle según `sizeKindForCategory`;
   - límite de 3–5 opciones.

   Extendé `ShoppingQuerySchema` de forma aditiva: términos, público y precio máximo estricto (para el paso 09).

5. **Proveedores reales** en `packages/shopping` (por ejemplo `src/providers/`): adaptadores de plataforma, sitemap, descubrimiento web y compuesto. Con timeouts, `AbortSignal`, concurrencia por dominio, user agent identificable y respeto de robots.txt (robots cacheado). **Toda respuesta externa se valida con Zod**; si hace falta, agregá `zod` desde el catálogo. El cliente de `openrouter:web_search` va detrás de una interfaz inyectada desde el worker: no importes `@asesor/ai` desde `shopping` sin justificarlo.
6. **Selección por entorno:** `SHOPPING_PROVIDER=mock|live` en `WorkerEnvSchema`, `.env.example` y `turbo.json` (`globalPassThroughEnv`).
   - Default `live`: un `pnpm worker:dev` normal nunca sirve productos ficticios.
   - Con `NODE_ENV=production`, el schema rechaza `mock` (refine + test).
   - Los tests y el E2E fijan `mock` explícitamente.
   - En `.env.example`, `live`.
7. **Tests** (con fixtures grabados de respuestas reales, recortados):
   - mapper: cada slot, sinónimos, talles por categoría, looks sin `bottom` o con accesorios;
   - adaptadores;
   - sitemap;
   - compuesto con fallas parciales;
   - robots;
   - respuestas externas malformadas rechazadas por Zod.
8. **Prueba real:** un script de desarrollo que tome un LookSpec (del fixture o real), arme las queries y liste las URLs candidatas reales. Tiene que devolver candidatas pertinentes (una remera negra trae remeras, no medias) de:
   - **al menos 4 tiendas uruguayas distintas** en **al menos 3 plataformas**;
   - **al menos 1 tienda uruguaya fuera del registro**, vía descubrimiento web.

   Pegá un resumen en el log.

9. **Docs:** `docs/SHOPPING_ENGINE.md` (estrategia, registro, adaptadores, sitemap, descubrimiento, robots) y `TIENDAS_UY.md` con lo que verifiques.

## Hecho cuando

- [ ] `buildShoppingQueries`, `UserSizesSchema` y `sizeKindForCategory` existen con tests y cubren todas las prendas del LookSpec.
- [ ] Hay proveedores reales genéricos por plataforma, con Stadium y H&M cubiertos vía sitemap o el motivo documentado en `TIENDAS_UY.md`.
- [ ] El descubrimiento fuera del registro funciona con la clave de OpenRouter existente. Si `openrouter:web_search` no se puede usar y hace falta otra clave, el paso queda ⛔ (no ✅).
- [ ] La prueba real devuelve candidatas pertinentes de ≥4 tiendas y ≥3 plataformas, más ≥1 tienda fuera del registro (evidencia en el log).
- [ ] Toda respuesta externa pasa por Zod, con un test de respuesta malformada.
- [ ] `SHOPPING_PROVIDER` selecciona mock o live, con default `live`; en producción rechaza `mock` (test). Los tests fijan `mock`.
- [ ] robots.txt respetado, user agent identificable y fallas parciales toleradas (con tests).
- [ ] `pnpm format`, `lint`, `typecheck`, `test` (con integración ejecutada) y `build` en verde.
- [ ] Docs y `DECISIONES.md` actualizados.
