# Arquitectura

## Resumen

Monorepo pnpm + Turborepo con **dos aplicaciones** y paquetes internos. No hay microservicios: la app web (Next.js) atiende a los usuarios y el worker (Node.js) procesa trabajos pesados en segundo plano. Ambos comparten Supabase (PostgreSQL, Auth y Storage).

```mermaid
flowchart LR
  subgraph Cliente
    B[Navegador / PWA]
  end
  subgraph Web["apps/web · Next.js App Router"]
    P[proxy.ts<br/>sesión + rutas protegidas]
    RSC[Server Components<br/>Server Actions<br/>Route Handlers]
  end
  subgraph Worker["apps/worker · Node.js"]
    R[WorkerRunner<br/>concurrencia configurable]
    H[Handlers por JobType]
  end
  subgraph Supabase
    PG[(PostgreSQL + RLS)]
    AU[Auth]
    ST[(Storage privado)]
  end
  B -->|cookies de sesión| P --> RSC
  RSC -->|cliente del usuario · RLS| PG
  RSC --> AU
  RSC -->|URLs firmadas| ST
  RSC -->|enqueue_job| PG
  R -->|claim_next_job · SKIP LOCKED| PG
  R --> H
  H -->|OpenRouter o mock| AI[(Proveedor IA)]
  H -->|SHOPPING_PROVIDER live o mock| SH[(Tiendas UY y búsqueda web)]
  MP[Mercado Pago] -->|webhook firmado| RSC
```

## Stack

| Capa       | Tecnología                                                     |
| ---------- | -------------------------------------------------------------- |
| Monorepo   | pnpm workspaces (catálogo de versiones) + Turborepo            |
| Web        | Next.js 16 (App Router, `proxy.ts`), React 19, Tailwind CSS v4 |
| Worker     | Node.js 24 + TypeScript, bundle con tsup                       |
| Datos      | Supabase: PostgreSQL 17, Auth, Storage                         |
| Validación | Zod 4 en todos los límites externos                            |
| Calidad    | TypeScript `strict`, ESLint 9 (flat config), Prettier          |
| Tests      | Vitest (unit + integración), Playwright (E2E)                  |
| CI         | GitHub Actions                                                 |

## Estructura

```
apps/
  web/        Next.js: UI, Server Actions, Route Handlers, proxy de sesión, admin
  worker/     Loop de jobs: toma trabajos de Postgres y ejecuta handlers
packages/
  config/     ESLint, tsconfig y variables de entorno (Zod): public / server / worker
  shared/     Dominio puro: schemas Zod, tipos, constantes, logger, rate limit, fixtures
  db/         Tipos generados, clientes Supabase, auth helpers, cola de jobs, Storage, seed, y la lógica de las actions (perfil y asesoría, talles, shopping y su progreso, carrito, guardados)
  ai/         Abstracción de IA: operaciones tipadas, OpenRouterProvider, MockAIProvider, prompts
  shopping/   Pipeline de productos: search (registro por plataforma, sitemaps, búsqueda web) → fetch seguro → extract (JSON-LD → microdata → OpenGraph, htmlparser2) → talles y stock por plataforma → normalize → validate → rank → cache
  payments/   PaymentProvider, MockPaymentProvider, esqueleto Mercado Pago, estados
  analytics/  AnalyticsService + DatabaseAnalyticsProvider, registro de uso de IA
supabase/     config.toml, migraciones y seed.sql mínimo
docs/         Esta documentación (sistema visual en DESIGN_SYSTEM.md)
```

### Dependencias entre paquetes

```
config    (sin dependencias internas: ESLint, tsconfig y env)
shared    → config (solo como devDependency: tsconfig y ESLint)
db        → shared, config (env de los clientes)
analytics → db, shared, config
ai        → shared, config
shopping  → shared, config
payments  → shared, config
web       → todos
worker    → ai, analytics, config, db, shared, shopping
```

Sin ciclos. `shared` no importa nada interno en su código ni hace I/O de red. `db` no depende de `shopping`: lo que comparten (talles, tono del color, preferencia de variante) vive en `shared`.

## Separación de capas

- **UI** (`apps/web/src/app`, `apps/web/src/components`): renderiza y llama a Server Actions / Route Handlers. No contiene reglas de negocio ni prompts. Sistema visual, componentes y mapa de pantallas en `DESIGN_SYSTEM.md`.
- **Dominio** (`packages/shared`): schemas, tipos y reglas puras (p. ej. `isPremiumSubscription`, `checkPhotoFile`, `computeRetryDelaySeconds`).
- **Integraciones** (`packages/db`, `ai`, `shopping`, `payments`, `analytics`): adaptadores a proveedores externos detrás de interfaces (`AIProvider`, `SearchProvider`, `ProductFetcher`, `PaymentProvider`, `AnalyticsProvider`).

## Paquetes internos sin build

Los paquetes exportan TypeScript directamente (`exports` → `./src/*.ts`).

- En la web, Next.js los transpila (`transpilePackages`).
- En el worker, tsup genera un bundle autocontenido (`noExternal: [/.*/]`), así la imagen Docker no necesita `node_modules`.
- Vitest y tsx los ejecutan directamente.

## Clientes de Supabase

Cada uno en un subpath de `@asesor/db` para que el código de servidor nunca llegue al bundle del navegador:

| Subpath              | Uso                                                                                                                                                             | Credencial    | RLS         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------- |
| `@asesor/db/browser` | Componentes de cliente                                                                                                                                          | anon          | Sí          |
| `@asesor/db/server`  | RSC, Server Actions, Route Handlers                                                                                                                             | anon + sesión | Sí          |
| `@asesor/db/proxy`   | `proxy.ts` (refresco de sesión)                                                                                                                                 | anon + sesión | Sí          |
| `@asesor/db/service` | Servidor web: admin, webhooks, analytics, encolar jobs (análisis, búsquedas, revalidación) y esperar la revalidación del carrito, resúmenes de looks bloqueados | service role  | No (bypass) |
| `@asesor/db/worker`  | Worker                                                                                                                                                          | service role  | No (bypass) |
| `@asesor/db/admin`   | Base de los anteriores, seed, tests                                                                                                                             | service role  | No (bypass) |

`server` y `service` importan `server-only`. La regla por defecto es usar el cliente del usuario; service role solo cuando RLS no permite la operación (y siempre después de autorizar en el servidor).

## Variables de entorno

Centralizadas en `packages/config/src/env` y validadas con Zod. Nadie lee `process.env` directamente (regla ESLint `no-restricted-properties`, salvo configs, scripts y tests).

- `getPublicEnv()` — solo `NEXT_PUBLIC_*`, referenciadas de forma literal para que Next las incruste.
- `getServerEnv()` — públicas + secretos del servidor. Lanza si se ejecuta en el navegador.
- `getWorkerEnv()` — lo que necesita el worker: URL y service role de Supabase, concurrencia, `AI_PROVIDER` y `OPENROUTER_*` (modelos, clave), `AI_IMAGE_QUALITY`, `SHOPPING_PROVIDER` (`live` por defecto) y `SHOPPING_BOT_CONTACT`. Con `NODE_ENV=production`, `AI_PROVIDER=mock` y `SHOPPING_PROVIDER=mock` se rechazan al arrancar.

El `.env` vive en la raíz y lo comparten web (`loadEnvConfig` en `next.config.ts`) y worker (`--env-file-if-exists`).

## Autenticación y autorización

- Supabase Auth con email/contraseña. Sesión en cookies (`@supabase/ssr`), refrescada en `proxy.ts` con `getUser()` (misma validación que las páginas; si Auth rechaza la sesión, se borran las cookies para no generar loops de redirección).
- Al registrarse, el trigger `handle_new_user` crea `profiles` (con `age_confirmed_at`).
- Barreras en capas: `proxy.ts` (redirección) → `requireUser()` en cada página → helpers de `@asesor/db` (`requireAuth`, `requirePremium`, `requireAdmin`, `requireResourceOwner`) → **RLS** en Postgres.
- `/admin` exige `profiles.role = 'admin'` en el servidor; si no, responde 404.

## Jobs

Cola en PostgreSQL (sin Redis ni servicios externos). Ver `DATA_MODEL.md` y `AI_PIPELINE.md`.

| Tipo                    | Qué hace                                                                             | Estado                       |
| ----------------------- | ------------------------------------------------------------------------------------ | ---------------------------- |
| `VALIDATE_PHOTOS`       | Valida las fotos con IA y encola el análisis                                         | Real                         |
| `ANALYZE_STYLE_PROFILE` | StyleProfile + asesoría + 3 LookSpecs, guardados en una transacción                  | Real                         |
| `GENERATE_LOOK`         | Imagen del look con las fotos del usuario como referencia                            | Real                         |
| `GENERATE_LOOK_PREVIEW` | Preview de un look                                                                   | Real (sin uso en la UI)      |
| `GENERATE_STYLE_BOARD`  | Moodboard                                                                            | Mock (devuelve `mock: true`) |
| `SEARCH_PRODUCTS`       | Shopping de un look completo o de una prenda ("más barato"), con progreso por etapas | Real                         |
| `REFRESH_PRODUCT`       | Revalida un producto guardado (carrito, "Comprar ↗")                                 | Real                         |

- `enqueue_job` (con clave de idempotencia opcional), `claim_next_job` (`FOR UPDATE SKIP LOCKED`, recupera locks vencidos), `complete_job`, `fail_job` (backoff exponencial, errores no reintentables), `retry_job` (manual).
- Solo `service_role` puede ejecutarlas.
- `WorkerRunner`: N carriles (`WORKER_CONCURRENCY`), polling con espera, apagado limpio con SIGTERM/SIGINT (deja de tomar jobs, espera los activos, aborta los que exceden el timeout y quedan reintentables).
- **Progreso** (paso 06, D14): `jobs.progress` (jsonb, nullable) lo escribe solo el worker que tiene el job, con `update_job_progress(job_id, worker_id, progress)` (solo `service_role`; falla si el job no está `RUNNING` bajo ese worker). Los handlers lo reportan con `ctx.reportProgress(...)`, que es best-effort: un error al guardarlo se loguea y el job sigue. El dueño lo lee con su cliente (grant por columna + RLS "jobs: select own"); nunca `payload`, `result` ni `last_error`.
- **Referencias legibles**: `jobs.look_id` y `jobs.garment_slot` son columnas generadas desde el payload (validado con Zod al encolar), para que la UI encuentre la búsqueda de un look sin abrir `payload`.
- **Timeouts por job**: los handlers de shopping combinan `ctx.signal` (apagado) con `AbortSignal.timeout(...)` (4 min la búsqueda de un look, 1 min `REFRESH_PRODUCT`).

### Búsqueda de productos (paso 06)

```
Detalle del look: "Encontrar este look" (pide los talles que falten, paso 07)
  → server action startLookShoppingAction (requirePremium · Zod · guarda talles · rate limit · shopping_started)
  → startLookShopping (@asesor/db: Premium, dueño del look, talles relevantes, una búsqueda activa
     por (look, prenda), enqueue)
  → SEARCH_PRODUCTS (worker: dueño y Premium otra vez, prendas en paralelo con cache de pools,
     progreso por etapas, persistencia, resumen, shopping_completed)
  → el panel de progreso consulta GET /api/looks/[id]/shopping (getLatestLookSearch con el cliente
     del usuario) hasta COMPLETED/FAILED y refresca la página una vez
```

- Premium se verifica en tres lugares: la server action (`requirePremium`), `startLookShopping` y el worker (`isUserPremium`, porque la suscripción pudo vencer entre el encolado y la ejecución).
- La web nunca espera la búsqueda: encola y devuelve el id del job (SPEC "JOBS": sin requests HTTP abiertos).
- Detalle del pipeline, etapas y fallas parciales en `SHOPPING_ENGINE.md`.

### Carrito (paso 10a)

```
"+ Agregar al carrito" en los resultados del look o en guardados (paso 10b)
  → server action addToCartAction (requirePremium · Zod · rate limit cart · product_added_to_cart)
  → addToCart (@asesor/db, cliente del usuario: Premium, el producto es un resultado de esa prenda
     del look, talle del usuario)
     → si el dato tiene más de 8 h: waitForProductRefresh → REFRESH_PRODUCT en el worker
        (espera hasta 8 s; si no llega, sigue con el último dato y lo dice)
  → insert en cart_items: el trigger fija el precio desde el catálogo
```

- La única espera de la web sobre un job es esta revalidación, acotada a 8 s: la web nunca descarga páginas de tiendas.
- "Agregar el look al carrito" (`addLookToCartAction` → `addLookToCart`) agrega en paralelo el recomendado de las prendas que no tienen nada en el carrito; las revalidaciones corren juntas en el worker.
- Las demás acciones (talle, cambiar por otra alternativa, sacar, comprado, guardados) son escrituras directas con RLS. Detalle en `DATA_MODEL.md` ("Carrito y guardados") y `SHOPPING_ENGINE.md`.

## PWA

- `app/manifest.ts`, íconos placeholder (`scripts/generate-icons.mjs`), `viewport`/`themeColor` en el layout.
- `public/sw.js`: solo cachea `/_next/static`, íconos y `/offline`. Nunca cachea páginas autenticadas, `/api`, fotos, URLs firmadas ni requests a otros orígenes. Se registra solo en producción.

## Observabilidad

- Logger JSON estructurado (`createLogger` en `@asesor/shared`) en web y worker. Redacta claves sensibles (tokens, cookies, contraseñas, firmas, URLs firmadas, payloads, emails, imágenes) y trunca strings largos.
- `ai_usage` registra cada operación de IA (tokens, imágenes, costo estimado, duración, éxito), también el costo de las búsquedas web del descubrimiento de tiendas (`WEB_SEARCH`, una fila por job).
- `analytics_events` guarda eventos de producto; el navegador solo puede emitir una lista blanca vía `/api/analytics`.

## Decisiones

- **Sin ORM.** Tipos generados por Supabase (`pnpm db:types`) + supabase-js. Menos capas, RLS nativo.
- **Seed en TypeScript** (`packages/db/scripts/seed.ts`) en lugar de SQL: usa la API de Auth, valida con los mismos schemas Zod y reutiliza los fixtures.
- **Rate limiting en memoria** detrás de una interfaz (`RateLimiter`). Alcanza para una instancia; con varias, reemplazar por una implementación en Postgres.
- **CSP sin nonces** (Next necesita `'unsafe-inline'` para hidratar). Se restringen orígenes, frames, formularios y objetos. Las fotos de productos vienen de las tiendas (`img-src https:`, D16; ver `SECURITY_PRIVACY.md`).
- **Imágenes privadas con `<img>`**, no `next/image`, para que no pasen por el cache del optimizador.
