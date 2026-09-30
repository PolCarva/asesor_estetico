# Paso 05 — Shopping: ranking y cache persistente

**Orden del SPEC:** 12–13 · **Depende de:** 04b · **SPEC:** "RANKING", "CACHE", "TALLES" (priorizar el talle del usuario), "DATOS DE CADA PRODUCTO"

## Objetivo

1. **Ranking** que priorice "qué tan bien reproduce el outfit recomendado", no el precio.
   - Factores: categoría, similitud visual o de estilo, color, silueta o fit, material, talle disponible, stock y precio.
   - El parecido estético pesa **bastante más** que el precio, que queda como criterio secundario.
   - Prioriza productos disponibles en el talle del usuario.
   - Pesos documentados.
2. **Cache persistente** en Postgres: búsquedas 24 h, datos de producto 8 h. `products` y `product_variants` sirven como cache de productos, y los rankings se guardan en `look_products`.

## Lo que ya hay (relevamiento 2026-09-30, verificalo)

- **`rank.ts`.** `DEFAULT_RANKING_WEIGHTS`: categoría 0.25, color 0.20, visual 0.15, talle 0.10, stock 0.10, fit 0.08, material 0.07, precio 0.05.
  - `visual_similarity` es Jaccard de texto.
  - No usa `color.hex` ni `pattern`.
  - `category_match` 0 descarta el producto.
  - `max_price` solo penaliza, no filtra.
  - USD → UYU con `APPROX_UYU_PER_USD = 40`, solo para comparar.
  - Devuelve un `breakdown` por factor.
- **`search.ts`.** Cachea el resultado **ya rankeado con el talle de la query y recortado a `limit`** (`rankProducts(...).slice(0, query.limit)`). La clave es `'search:' + JSON.stringify(query)`, que incluye talle, límite y precio máximo.
- **`cache.ts`.** `CACHE_TTL_MS { search: 24h, product: 8h }`, pero solo existe `createMemoryCache`. El TTL de producto no se usa y el worker no pasa ningún cache.
- **Tablas:**
  - `products` tiene **dos** únicos: `url` y `(store_domain, external_id)`, más `last_fetched_at` con índice.
  - `product_variants` tiene único `(product_id, external_id)`, con `external_id` NOT NULL.
  - `look_products` tiene único `(look_id, garment_slot, product_id)`, sin `updated_at` ni referencia a la búsqueda.
  - Solo escribe el service role. `products` y `product_variants` los lee cualquier autenticado; `look_products`, solo el dueño Premium.
- **Persistencia.** No hay tabla de cache de búsquedas ni helpers de persistencia en `packages/db`. Solo `seed.ts` mapea Product → filas.
- **Tests.** `packages/shopping/test/shopping.test.ts` fija resultados exactos del ranking: si cambian los pesos, actualizalo con criterio.

## Trampas

- **La cache es global y el ranking es por usuario.** Si guardás el top ya rankeado con el talle de un usuario, el siguiente ve el orden del otro y un pool de 3–5, lo que además rompe "más barato" (paso 09). Guardá el **pool completo** de productos validados, sin score de usuario ni recorte, y **re-rankeá en cada pedido** con el talle y el `max_price` de ese pedido.
- **Upsert de productos.** Elegí **un** objetivo de conflicto canónico y canonicalizá las URLs, o vas a chocar con el otro único.
- **Ids.** `Product.id` (string externo) ≠ `products.id` (uuid). La capa de persistencia traduce explícitamente.
- **Tablas y funciones nuevas** (ver README, "Entorno"): los default privileges de Supabase las exponen. Hacé:
  - `enable row level security` y `revoke all … from anon, authenticated`;
  - grants mínimos;
  - agregalas al test de `anon` en `rls.int.test.ts`;
  - después, `pnpm db:reset` y `pnpm db:types`.
- **Sin datos del usuario en tablas globales.** Ni `products`, ni `product_variants`, ni la cache de búsqueda.
- **Fecha de verificación.** `last_fetched_at` solo avanza con una verificación exitosa (paso 04a).
- **Dónde van los tests.** Los de integración contra Postgres (cache, persistencia) van en `packages/db/test/integration` o `apps/worker/test/*.int.test.ts`, no en `packages/shopping`.

## Tareas

1. **Ranking:**
   - Revisá los factores.
   - Sumá silueta o fit (con el `fit` inferido en el paso 04a), `pattern`, cercanía de color por `hex` cuando el producto tenga color, y material.
   - Similitud de estilo mejor que Jaccard, si es barato: términos del LookSpec, sinónimos y penalización de palabras que contradicen (estampado vs liso, skinny vs relaxed).
   - Talle: puntaje alto si hay variante del talle del usuario en stock; "talle sin verificar" cuando no se sabe.
   - Stock: `IN_STOCK` > `IN_STORE_ONLY` > `UNKNOWN` > `OUT_OF_STOCK`.
   - Precio como criterio secundario, más un filtro estricto opcional (`price < max`) para el paso 09.
   - Productos sin precio (si el paso 04b los permite): se rankean sin factor de precio.
   - Diversidad de tiendas en el top, si mejora los resultados.

   Documentá los pesos finales con su justificación en `docs/SHOPPING_ENGINE.md` (tabla) y en `DECISIONES.md` (D11).

2. **Cache Postgres** (migración nueva):
   - Tabla de búsquedas cacheadas: la clave es la query normalizada **sin** talle, límite ni precio máximo; el valor es el **pool completo** de ids de producto validados; `expires_at` a 24 h. Solo service role.
   - Re-ranking por pedido después del hit.
   - Frescura de producto con `products.last_fetched_at` y 8 h.
   - Un `ShoppingCache` en Postgres, o una capa equivalente que se inyecte desde el worker.
   - Limpieza de expirados.
3. **Persistencia** en `packages/db` (por ejemplo `src/shopping.ts`):
   - `upsertProducts` → mapa de clave externa a uuid;
   - `upsertVariants`;
   - `replaceLookProducts(lookId, slot, ranked)` con rank, score y breakdown;
   - `getProductById`, `markProductVerified` y lectura de resultados por look.

   Decidí si `look_products` necesita columnas extra (por ejemplo `updated_at`, `search_id` o flag de talle verificado): migración + `db:types`.

4. **Revalidación:** helper "¿está viejo?" (más de 8 h), que usarán el carrito y el botón "Comprar" (pasos 08 y 10a).
5. **Tests:**
   - ranking con casos de fixtures reales: la remera negra lisa le gana a la estampada aunque sea más cara, y el pantalón relaxed le gana al skinny;
   - **el mismo hit de cache con dos talles distintos produce órdenes distintos**, y un producto con variante del talle del usuario en stock le gana a uno equivalente sin ese talle;
   - cache: hit, miss y expiración;
   - persistencia: upsert idempotente sin violar únicos, y RLS de las tablas nuevas.
6. **Prueba real:** corré el pipeline (pasos 03, 04a/b y ranking) para un look, guardalo en la base local y mostrá el top 3–5 por prenda con score y breakdown. Justificá en el log que el orden tiene sentido estético. Volvé a correrlo y mostrá que usa la cache, sin re-scrapear.

## Hecho cuando

- [ ] Pesos nuevos documentados (tabla + justificación), con estética ≫ precio.
- [ ] Ranking con tests de casos reales, incluida la prioridad del talle del usuario sobre el mismo pool cacheado.
- [ ] Cache Postgres de búsquedas (24 h, pool sin datos de usuario) y frescura de productos (8 h), con tests de integración.
- [ ] Persistencia idempotente de products, variants y look_products, con tests de integración y RLS (incluidos los revokes de las tablas nuevas).
- [ ] Prueba real con el top por prenda y una segunda corrida desde la cache (evidencia en el log).
- [ ] Migraciones aplicadas desde cero (`db:reset`) y `db:types` al día.
- [ ] `pnpm format`, `lint`, `typecheck`, `test` (con integración ejecutada) y `build` en verde.
- [ ] `docs/SHOPPING_ENGINE.md`, `docs/DATA_MODEL.md` y `DECISIONES.md` actualizados.
