# Estado del setup

Última actualización: 2026-10-01 (paso 11 del plan `docs/goals/asesoria-shopping/`) · **Foundation completa** · **Milestone 1 (análisis con IA) completo** · Milestone 2 en curso (imagen del look lista) · **Asesoría completa, shopping real en Uruguay, carrito y guardados** (pasos 01–10b).

## Implementado

| Área          | Qué hay                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo      | pnpm workspaces + catálogo de versiones, Turborepo (cache correcta entre paquetes vía tarea `transit`)                                                                                                                                                                                                                                                                                                                                                                                         |
| Calidad       | TypeScript strict (`noUncheckedIndexedAccess`), ESLint 9 compartido, Prettier + plugin Tailwind                                                                                                                                                                                                                                                                                                                                                                                                |
| Entorno       | `.env.example`, `@asesor/config/env/{public,server,worker}` con Zod, regla ESLint contra `process.env` suelto                                                                                                                                                                                                                                                                                                                                                                                  |
| Supabase      | `config.toml`, 6 migraciones reproducibles desde cero, tipos generados (CI verifica que estén al día)                                                                                                                                                                                                                                                                                                                                                                                          |
| Base de datos | 17 tablas, enums, índices, triggers (`updated_at`, perfil al registrarse, precio del carrito), RLS en todas                                                                                                                                                                                                                                                                                                                                                                                    |
| Storage       | Buckets privados `user-photos` y `generated-looks` con políticas por carpeta de usuario                                                                                                                                                                                                                                                                                                                                                                                                        |
| Auth          | Signup / login / logout con Server Actions, sesión persistente en cookies, `proxy.ts`, confirmación por email preparada, +18                                                                                                                                                                                                                                                                                                                                                                   |
| Autorización  | `getCurrentUser`, `requireAuth`, `requirePremium`, `requireAdmin`, `requireResourceOwner` + RLS                                                                                                                                                                                                                                                                                                                                                                                                |
| Fotos         | `/app/onboarding/photos`: subir, previsualizar, reemplazar, eliminar; validación por magic bytes; URLs firmadas de 5 min                                                                                                                                                                                                                                                                                                                                                                       |
| Jobs          | Cola en Postgres (`FOR UPDATE SKIP LOCKED`, idempotencia, backoff, locks vencidos, reintento manual)                                                                                                                                                                                                                                                                                                                                                                                           |
| Worker        | Concurrencia configurable, reintentos, errores no reintentables, apagado limpio, Docker multi-stage non-root                                                                                                                                                                                                                                                                                                                                                                                   |
| IA            | 5 operaciones tipadas con output Zod, usage, timing, errores normalizados, prompts versionados                                                                                                                                                                                                                                                                                                                                                                                                 |
| Shopping      | Real en tiendas de Uruguay: registro por plataforma + sitemaps + búsqueda web → fetch (anti-SSRF con DNS y redirects, robots.txt, user agent identificable) → extract (JSON-LD → microdata → OpenGraph, público de la página) → talles y stock por plataforma → normalize → Validate → rank (8 factores, público) → cache de pools (24 h) y de productos (8 h). Jobs `SEARCH_PRODUCTS` / `REFRESH_PRODUCT`, "Buscar más barato", carrito (por look, revalidación antes de agregar) y guardados |
| Pagos         | `PaymentProvider`, máquina de estados, webhook Mercado Pago con firma HMAC + idempotencia, sin activar Premium                                                                                                                                                                                                                                                                                                                                                                                 |
| Analytics     | `AnalyticsService` + `DatabaseAnalyticsProvider`, 26 eventos (10 los puede reportar el navegador: vistas y clicks; shopping, carrito, guardados y pagos solo desde el servidor o el worker), `/api/analytics` con lista blanca, `ai_usage` (IA y búsquedas web)                                                                                                                                                                                                                                |
| Logging       | JSON estructurado con redacción de datos sensibles en web y worker                                                                                                                                                                                                                                                                                                                                                                                                                             |
| UI            | Sistema visual "Espejo" (`docs/DESIGN_SYSTEM.md`), rutas `/`, `/login`, `/signup`, `/app/{dashboard→redirect,onboarding,onboarding/photos,looks,looks/[id],favorites,cart,profile}`; nav en píldora + barra flotante en mobile; skeletons, loading, empty, error; accesibilidad básica                                                                                                                                                                                                         |
| PWA           | Manifest, íconos placeholder, theme color, viewport, service worker que no cachea datos sensibles, `/offline`                                                                                                                                                                                                                                                                                                                                                                                  |
| Seguridad     | Headers (CSP, HSTS en prod, XFO, nosniff...), rate limiting abstracto, anti open-redirect, anti-IDOR                                                                                                                                                                                                                                                                                                                                                                                           |
| Seed          | Usuarios ficticios (premium, free, admin), StyleProfile, 3 looks, productos, favoritos, carrito, suscripción, chat, jobs, uso de IA, eventos                                                                                                                                                                                                                                                                                                                                                   |
| Admin         | `/admin` (rol admin, 404 si no): Overview, Users, Jobs (con reintento), AI Usage, Analytics, Products, Subscriptions                                                                                                                                                                                                                                                                                                                                                                           |
| Tests         | 499 unitarios y 83 de integración contra Supabase local (RLS, Premium, carrito, guardados, shopping, jobs, pipeline), 24 E2E (desktop + mobile; asesoría, shopping y carrito con el worker mock); conteo de cada paso en el log de `docs/goals/asesoria-shopping/README.md`                                                                                                                                                                                                                    |
| CI            | GitHub Actions: check (format, lint, typecheck, unit, build), integración + E2E con Supabase (Playwright levanta la web y el worker mock), build de la imagen del worker                                                                                                                                                                                                                                                                                                                       |

## Mockeado

| Qué                      | Mock                                                                                                                                         | Dónde                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Modelos de IA (opcional) | `MockAIProvider` con `AI_PROVIDER=mock` (default y en tests). Con `openrouter` es real                                                       | `packages/ai/src/providers/mock.ts` |
| Búsqueda de productos    | Real por defecto (`SHOPPING_PROVIDER=live`). `MockSearchProvider` (catálogo ficticio `.test`) solo con `SHOPPING_PROVIDER=mock` en tests/E2E | `packages/shopping/src/mocks.ts`    |
| Páginas de tiendas       | Real (`HttpProductFetcher`) con `live`; `MockProductFetcher` (HTML con JSON-LD) con `mock`                                                   | idem                                |
| Pagos                    | `MockPaymentProvider` (en memoria)                                                                                                           | `packages/payments/src/mock.ts`     |
| Handlers del worker      | Solo `GENERATE_STYLE_BOARD` (el análisis y el shopping, `SEARCH_PRODUCTS` y `REFRESH_PRODUCT`, son reales desde los pasos 01 y 06)           | `apps/worker/src/handlers`          |
| Contenido de la UI       | Looks de ejemplo (fixtures) cuando el usuario no tiene looks; paywall sin checkout                                                           | `apps/web`                          |

## Proveedores reales que faltan

- **IA**: ✅ conectada vía OpenRouter (Gemini 3.8 Flash para análisis, Gemini 3.1 Flash Image para imágenes). Falta el chat Premium en la UI.
- **Mercado Pago**: `createSubscription`, `getSubscription`, `cancelSubscription` (la verificación de firma del webhook ya está).
- **Email transaccional** (SMTP de Supabase en producción).
- **Hosting**: web, worker y Supabase gestionado.

## Comandos de desarrollo

```bash
pnpm install
pnpm db:start        # Supabase local + .env
pnpm db:reset        # migraciones desde cero + seed
pnpm dev             # web en http://localhost:3000
pnpm worker:dev      # worker (otra terminal)
pnpm check           # format + lint + typecheck + unit + build
pnpm test            # unit + integración
pnpm test:e2e        # Playwright
```

Detalle en `README.md`.

## Resultado de la verificación final

- `pnpm check`: ✅ 29/29 tareas (también sin cache, `--force`).
- `pnpm test`: ✅ 84 unitarios + 19 integración.
- `pnpm test:e2e`: ✅ 10/10 (desktop y mobile).
- Pipeline real con OpenRouter probado de punta a punta con fotos de una persona ficticia generada por IA: validación, análisis, 3 looks e imagen del look 1 (~USD 0.10).
- Setup desde cero en una copia limpia siguiendo el README: ✅.
- Imagen Docker del worker: ✅ build, corre como `node`, sale con código 0 ante SIGTERM.

## Riesgos conocidos

- **Rate limiting en memoria**: no se comparte entre instancias ni sobrevive reinicios. Reemplazar por Postgres antes de escalar horizontalmente.
- **CSP con `'unsafe-inline'`** en scripts (requisito de Next sin nonces). Evaluar nonces si se agregan scripts de terceros.
- **Resúmenes de looks bloqueados** se leen con service role (solo columnas no sensibles); cualquier cambio ahí debe mantener ese filtro.
- **Borrado de cuenta** borra datos en cascada pero no los archivos de Storage (pendiente: job de limpieza).
- **Regla Premium duplicada** en TypeScript (`isPremiumSubscription`) y SQL (`current_user_is_premium`): deben cambiar juntas.
- **Tests de integración** comparten la base local: no correrlos con el worker prendido.
- **Íconos y fuentes**: íconos placeholder; `next/font/google` descarga fuentes en el build (requiere red).
- **Fotos a un tercero**: con `AI_PROVIDER=openrouter` las fotos van a OpenRouter/Google (con `data_collection: deny`). Falta informarlo en la política de privacidad y pedir consentimiento.
- **Salidas del modelo**: a veces no cumplen el schema; hay reparación en la misma llamada y reintentos del job, pero cada reintento cuesta.
- **Costo**: ver "Costos" abajo. Sin tope de gasto global más allá del límite diario por usuario (configurar límite en la clave de OpenRouter).
- **Tiendas**: dependen de su HTML y sus APIs públicas; una tienda que cambia o bloquea se cae sola (fallas parciales) y el registro de tiendas necesita mantenimiento (público, plataforma, robots). El público del producto se toma de lo que declara la página: si una tienda no lo dice, queda sin dato y no se filtra.
- **Versiones recientes** (Next 16, Zod 4, TypeScript 6, pnpm 12, Vitest 5): APIs nuevas, menos ejemplos en la comunidad.
- Supabase CLI fijada en el proyecto (npm); una CLI global de otra versión sobre el mismo stack puede romper Storage.

## Costos (paso 11)

| Qué                                                             | Costo                                                                                        | De dónde sale                                                                                   |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Análisis con la asesoría completa (perfil v3 + 3 LookSpecs)     | ~USD 0.046                                                                                   | Prueba real del paso 02b: `ANALYZE_STYLE_PROFILE` USD 0.0220 + `GENERATE_LOOK_SPECS` USD 0.0238 |
| Usuario free (análisis + imagen del look 1)                     | ~USD 0.10                                                                                    | Milestone 1 (`ai_usage`)                                                                        |
| Usuario Premium (análisis + 3 imágenes)                         | ~USD 0.24                                                                                    | Milestone 1 (`ai_usage`)                                                                        |
| Búsqueda de un look en vivo (5 prendas, con descubrimiento web) | ~USD 0.04–0.055 en búsqueda web (~0.01 por prenda), 200–220 requests HTTP a tiendas, 30–60 s | Pasos 03, 05, 06 y 10b (`ai_usage` `WEB_SEARCH`: 3 búsquedas del look 1 = USD 0.134)            |
| Búsqueda de un look desde la cache (24 h)                       | USD 0, 0 requests (salvo revalidar productos de más de 8 h)                                  | Paso 05                                                                                         |
| "Buscar más barato"                                             | casi siempre USD 0 (pool cacheado); en vivo ~USD 0.01                                        | Paso 09                                                                                         |
| Revalidar un producto (carrito, "Comprar ↗")                    | USD 0; 1–3 requests, una vez por producto y hora                                             | Pasos 08 y 10a                                                                                  |

La IA del shopping no se usa (solo la búsqueda web de OpenRouter). Los límites por usuario (10 búsquedas de look por hora, 20 "más barato", 3 análisis por día) acotan el gasto máximo por usuario.

## Siguiente milestone

**Cerrar 2 · Looks con imagen realista** y luego **3 · Paywall** (ver `EXECUTION_PLAN.md`): generar los looks 2 y 3 al pasar a Premium, regenerar/reintentar looks desde la UI, y conectar Mercado Pago para que el upgrade dispare esa generación.
