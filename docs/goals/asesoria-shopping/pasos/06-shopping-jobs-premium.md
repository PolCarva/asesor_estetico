# Paso 06 — Shopping: jobs reales, progreso y Premium server-side

**Orden del SPEC:** 14, 19 · **Depende de:** 05 · **SPEC:** "JOBS", "PREMIUM", "MANEJO DE ERRORES", "ANALYTICS" (`shopping_started`, `shopping_completed`)

## Objetivo

- `SEARCH_PRODUCTS` y `REFRESH_PRODUCT` reales en el worker, usando el pipeline de los pasos 03–05.
- Progreso **real por etapas**, legible por la UI y sin porcentajes falsos.
- Una server action que inicia la búsqueda de un look **verificando Premium en el servidor** (`requirePremium`), sin dejar requests HTTP abiertos esperando.

Etapas que muestra la UI (paso 07): "Buscando prendas…", "Revisando tiendas…", "Comparando opciones…", "Verificando precios y talles…" y "Ordenando las mejores coincidencias…".

## Lo que ya hay (relevamiento 2026-09-30, verificalo)

- **`jobs`.** No tiene columna de progreso. `authenticated` solo puede leer `(id, type, status, user_id, attempts, max_attempts, scheduled_at, finished_at, created_at, updated_at)` de sus propios jobs: **no** `payload`, `result` ni `last_error`.
- **`enqueue_job`.** Hace `ON CONFLICT (idempotency_key) DO NOTHING` y devuelve el job existente aunque esté COMPLETED o FAILED. Con una clave fija como `search:<lookId>`, no se podría volver a buscar nunca.
- **Reintentos y concurrencia.**
  - Espera 30 s × 2^(n−1), con 3 intentos por defecto.
  - `WorkerRunner` no tiene timeout por job: `ctx.signal` solo se dispara al apagar.
  - Todos los tipos comparten carriles (`WORKER_CONCURRENCY`, default 2), ordenados por prioridad (análisis 10, looks 10/5).
- **Handler `SEARCH_PRODUCTS`** (`apps/worker/src/handlers/index.ts`).
  - Payload: `{ user_id, look_id, slot: string ≤20, query }`.
  - Llama a `searchProducts` sin cache ni señal.
  - **No persiste nada ni chequea Premium**, y devuelve ids string.
- **Handler `REFRESH_PRODUCT`.** Ignora `product_id` y refresca `FIXTURE_PRODUCTS[0]`.
- **Encolado desde la web.** La web no encola ninguno de los dos jobs. El único patrón de encolado es `startAnalysisAction` (`apps/web/src/app/app/onboarding/actions.ts`):
  1. usuario;
  2. guardas con service role;
  3. `enqueueJob`;
  4. `trackEvent`;
  5. `revalidatePath`.
- **Chequeo Premium.** `requirePremium(client)` (`packages/db/src/auth.ts`) existe, pero la web no lo usa. El worker usa `isUserPremium(db, userId)`.
- **Rate limits.** `rateLimiters` (`apps/web/src/lib/rate-limit.ts`) solo tiene `auth`, `photoUpload`, `analytics` y `webhook`.
- **Tests de la web.** `apps/web` no tiene tests de integración, solo unit en node con claves falsas.
- **Integración en paralelo.** Turbo corre `@asesor/db#test:integration` y `@asesor/worker#test:integration` **en paralelo** contra la misma base. `jobs.int.test.ts` borra y toma jobs `REFRESH_PRODUCT`.
- **Analytics.** `shopping_started` existe en la lista del servidor, pero nadie lo emite. `shopping_completed` no existe.
- **Etapas del onboarding.** `getPipelineState` y el onboarding derivan sus etapas según qué tipo de job está activo (filtran `PIPELINE_JOBS`): no los rompas.

## Trampas

- **Cambios de tipo de job o de payload.** Tocan `JobTypeSchema`, `JobPayloadSchemas`, el enum `job_type` (migración) y `db:types`.
- **`HandlerDeps` y `JobQueue`.** Cambiarlos rompe los literales de `apps/worker/test/runner.test.ts` y `pipeline.int.test.ts`. Hacé opcionales los métodos nuevos o actualizá los tests. `runner.test.ts` usa `REFRESH_PRODUCT` con `db = {}` y espera `{ availability: 'IN_STOCK' }`.
- **Columnas nuevas en `jobs`.** Una NOT NULL rompe los literales `JobRow` de los tests: hacela nullable.
- **Función nueva `update_job_progress`.** Los default privileges le dan EXECUTE a todos. Hacé `revoke all on function … from public, anon, authenticated` y `grant execute … to service_role`.
- **El handler corre con service role**, sin RLS. Filtrá por `user_id`, verificá que el look sea del usuario y volvé a chequear Premium.
- **Reintentos lentos para algo interactivo.** Manejá las fallas parciales dentro del handler, con `maxAttempts` 1–2.
- **Búsqueda completa de un look.** Reemplaza los resultados de **todas** las prendas del look, para que no queden productos viejos (por ejemplo los ficticios del seed) en slots que no volvieron.

## Tareas

1. **Progreso**:
   1. Migración con `jobs.progress jsonb` nullable y `grant select (progress)` a `authenticated`.
   2. Función `update_job_progress(job_id, worker_id, progress)`, solo para service role. Actualiza solo si el job está RUNNING y lo tiene ese worker.
   3. Si la UI necesita encontrar el job de un look, una columna de referencia legible (por ejemplo `look_id` o `subject_id`) con su grant, en lugar de abrir `payload`.
   4. Wrapper `updateJobProgress` en `packages/db`.
   5. Etapas como enum en `packages/shared` (por ejemplo `SEARCHING | CHECKING_STORES | COMPARING | VERIFYING | RANKING`). Los textos en español van en la web.
2. **Worker**:
   - `progress` opcional en `JobQueue`.
   - `ctx.reportProgress(stage)` best-effort: los errores solo se loguean.
   - `onStage` opcional en `searchProducts`, llamado en cada frontera real del pipeline.
   - Timeout por job o por fetch, con `AbortSignal.any([ctx.signal, AbortSignal.timeout(ms)])`.
3. **`SEARCH_PRODUCTS` real**: un job por look, con reparto interno por prenda, más un **modo de una sola prenda** para "Buscar más barato" (paso 09).
   - Payload: `user_id`, `look_id`, talles (con `UserSizesSchema` del paso 03), `slot` opcional validado con `GarmentSlotSchema`, y `max_price` estricto opcional.
   - Verifica que el look sea del usuario y que el usuario sea Premium.
   - Pipeline: `buildShoppingQueries` → búsqueda con cache y re-ranking → persistencia (products, variants y look_products).
   - Reporta las etapas y tolera fallas parciales.
   - En `result` guarda un resumen chico: prendas con resultados, candidatos, fallidos, stock o talle sin verificar, y un flag de parcial.
   - Emite `shopping_completed` (agregalo a `ANALYTICS_EVENTS`, solo servidor) con propiedades planas.
4. **`REFRESH_PRODUCT` real**:
   - carga el producto por uuid y lo re-extrae;
   - actualiza precio, disponibilidad y variantes;
   - mueve `last_fetched_at` solo si verificó.

   Ajustá `runner.test.ts`.

5. **Proveedores**: en `apps/worker/src/index.ts`, elegilos según `SHOPPING_PROVIDER` (paso 03) y conectá la cache Postgres (paso 05).
6. **Lógica testeable fuera de la web**: la lógica de iniciar la búsqueda va en `packages/db`, por ejemplo `startLookShopping({ userClient, serviceClient, lookId, sizes, requestId })`. Hace:
   - dueño del look;
   - Premium;
   - una sola búsqueda activa por (look, prenda): la del look completo no bloquea el modo de una prenda que usa el paso 09;
   - encolado con prioridad explícita, `maxAttempts` 1–2 y clave de idempotencia con id de pedido (no fija).

   Se prueba con integración en `packages/db/test/integration` (`createTestUser`). Este patrón lo reusan los pasos 07, 09 y 10a.

7. **Server action `startLookShoppingAction(lookId)`**, una capa fina en la web:
   1. `requireAuth` + `requirePremium`. Si falla, devuelve un estado de paywall, sin error técnico.
   2. Valida con Zod.
   3. Rate limit: creá `shoppingSearch` en `rateLimiters` y usalo con `enforceRateLimit`.
   4. `startLookShopping`.
   5. `trackEvent('shopping_started')`.
   6. `revalidatePath`.

   Sumá un helper para leer el estado y el progreso del último job de un look.

8. **Tests**:
   - Unit: etapas en orden, fallas parciales y resumen.
   - Integración: el handler con mocks persiste products y look_products, reemplaza todos los slots y escribe el progreso.
   - `update_job_progress` rechaza a otro worker, y `authenticated` no puede ejecutarla.
   - El dueño lee su progreso pero no el de otros.
   - `startLookShopping`: free rechazado, Premium encola, no hay dos búsquedas activas.
   - Si el paso 01 no serializó la integración en `turbo.json` (D23), hacelo acá. Ningún test nuevo toma jobs por tipo de forma global.
9. **Prueba real**:
   - Worker con `AI_PROVIDER=mock SHOPPING_PROVIDER=live` y un usuario Premium local **nuevo** (no el del seed).
   - Encolá la búsqueda de un look con la action o con un script que llame a `startLookShopping`.
   - Mostrá en el log las etapas registradas, el resumen y los productos reales persistidos por prenda.
   - Probá también con un usuario free: rechazado sin encolar.

## Hecho cuando

- [ ] `SEARCH_PRODUCTS` (look completo y modo una prenda) y `REFRESH_PRODUCT` son reales, con persistencia, cache y tolerancia a fallas parciales.
- [ ] El progreso por etapas queda guardado y lo lee solo el dueño (RLS/grant), sin porcentajes. `update_job_progress` solo la ejecuta el service role.
- [ ] Premium se verifica en la server action (`requirePremium`), en `startLookShopping` **y** en el worker. Los tests de integración cubren `startLookShopping` y el handler.
- [ ] `shopping_started` y `shopping_completed` quedan registrados.
- [ ] La integración de db y worker no corre en paralelo (D23). Los tests nuevos y los existentes (runner, pipeline, jobs) quedan en verde.
- [ ] Prueba real con productos reales persistidos por prenda y rechazo de un usuario free (evidencia en el log).
- [ ] `pnpm format`, `lint`, `typecheck`, `test` (con la integración ejecutada) y `build` en verde. `db:types` al día.
- [ ] `docs/ARCHITECTURE.md` (jobs, progreso), `docs/DATA_MODEL.md`, `docs/SHOPPING_ENGINE.md` y `DECISIONES.md` actualizados.
