# Estado del setup

Última actualización: 2026-09-30 · **Foundation completa** · **Milestone 1 (análisis con IA) completo** · Milestone 2 en curso (imagen del look lista).

## Implementado

| Área          | Qué hay                                                                                                                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo      | pnpm workspaces + catálogo de versiones, Turborepo (cache correcta entre paquetes vía tarea `transit`)                                                                                                   |
| Calidad       | TypeScript strict (`noUncheckedIndexedAccess`), ESLint 9 compartido, Prettier + plugin Tailwind                                                                                                          |
| Entorno       | `.env.example`, `@asesor/config/env/{public,server,worker}` con Zod, regla ESLint contra `process.env` suelto                                                                                            |
| Supabase      | `config.toml`, 6 migraciones reproducibles desde cero, tipos generados (CI verifica que estén al día)                                                                                                    |
| Base de datos | 17 tablas, enums, índices, triggers (`updated_at`, perfil al registrarse, precio del carrito), RLS en todas                                                                                              |
| Storage       | Buckets privados `user-photos` y `generated-looks` con políticas por carpeta de usuario                                                                                                                  |
| Auth          | Signup / login / logout con Server Actions, sesión persistente en cookies, `proxy.ts`, confirmación por email preparada, +18                                                                             |
| Autorización  | `getCurrentUser`, `requireAuth`, `requirePremium`, `requireAdmin`, `requireResourceOwner` + RLS                                                                                                          |
| Fotos         | `/app/onboarding/photos`: subir, previsualizar, reemplazar, eliminar; validación por magic bytes; URLs firmadas de 5 min                                                                                 |
| Jobs          | Cola en Postgres (`FOR UPDATE SKIP LOCKED`, idempotencia, backoff, locks vencidos, reintento manual)                                                                                                     |
| Worker        | Concurrencia configurable, reintentos, errores no reintentables, apagado limpio, Docker multi-stage non-root                                                                                             |
| IA            | 5 operaciones tipadas con output Zod, usage, timing, errores normalizados, prompts versionados                                                                                                           |
| Shopping      | Pipeline search → fetch (anti-SSRF) → extract (JSON-LD) → normalize → rank (8 factores) → cache                                                                                                          |
| Pagos         | `PaymentProvider`, máquina de estados, webhook Mercado Pago con firma HMAC + idempotencia, sin activar Premium                                                                                           |
| Analytics     | `AnalyticsService` + `DatabaseAnalyticsProvider`, 20 eventos, `/api/analytics` con lista blanca, `ai_usage`                                                                                              |
| Logging       | JSON estructurado con redacción de datos sensibles en web y worker                                                                                                                                       |
| UI            | Estética editorial, rutas `/`, `/login`, `/signup`, `/app/{dashboard,onboarding,onboarding/photos,looks,favorites,cart,profile}`; nav responsive; skeletons, loading, empty, error; accesibilidad básica |
| PWA           | Manifest, íconos placeholder, theme color, viewport, service worker que no cachea datos sensibles, `/offline`                                                                                            |
| Seguridad     | Headers (CSP, HSTS en prod, XFO, nosniff...), rate limiting abstracto, anti open-redirect, anti-IDOR                                                                                                     |
| Seed          | Usuarios ficticios (premium, free, admin), StyleProfile, 3 looks, productos, favoritos, carrito, suscripción, chat, jobs, uso de IA, eventos                                                             |
| Admin         | `/admin` (rol admin, 404 si no): Overview, Users, Jobs (con reintento), AI Usage, Analytics, Products, Subscriptions                                                                                     |
| Tests         | 84 unitarios, 19 de integración contra Supabase local (incluye el pipeline de análisis completo con el mock), 10 E2E (desktop + mobile)                                                                  |
| CI            | GitHub Actions: check (format, lint, typecheck, unit, build), integración + E2E con Supabase, build de la imagen del worker                                                                              |

## Mockeado

| Qué                      | Mock                                                                                                                                         | Dónde                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Modelos de IA (opcional) | `MockAIProvider` con `AI_PROVIDER=mock` (default y en tests). Con `openrouter` es real                                                       | `packages/ai/src/providers/mock.ts` |
| Búsqueda de productos    | Real por defecto (`SHOPPING_PROVIDER=live`). `MockSearchProvider` (catálogo ficticio `.test`) solo con `SHOPPING_PROVIDER=mock` en tests/E2E | `packages/shopping/src/mocks.ts`    |
| Páginas de tiendas       | Real (`HttpProductFetcher`) con `live`; `MockProductFetcher` (HTML con JSON-LD) con `mock`                                                   | idem                                |
| Pagos                    | `MockPaymentProvider` (en memoria)                                                                                                           | `packages/payments/src/mock.ts`     |
| Handlers del worker      | Solo `SEARCH_PRODUCTS`, `REFRESH_PRODUCT` y `GENERATE_STYLE_BOARD` (el pipeline de análisis es real)                                         | `apps/worker/src/handlers`          |
| Contenido de la UI       | Looks de ejemplo (fixtures) cuando el usuario no tiene looks; paywall sin checkout                                                           | `apps/web`                          |

## Proveedores reales que faltan

- **IA**: ✅ conectada vía OpenRouter (Gemini 3.8 Flash para análisis, Gemini 3.1 Flash Image para imágenes). Falta el chat Premium en la UI.
- **Mercado Pago**: `createSubscription`, `getSubscription`, `cancelSubscription` (la verificación de firma del webhook ya está).
- **Búsqueda y scraping** de tiendas de Uruguay.
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
- **Costo**: ~USD 0.10 por usuario free y ~0.24 por Premium; sin tope de gasto global más allá del límite diario por usuario (configurar límite en la clave de OpenRouter).
- **Versiones recientes** (Next 16, Zod 4, TypeScript 6, pnpm 12, Vitest 5): APIs nuevas, menos ejemplos en la comunidad.
- Supabase CLI fijada en el proyecto (npm); una CLI global de otra versión sobre el mismo stack puede romper Storage.

## Siguiente milestone

**Cerrar 2 · Looks con imagen realista** y luego **3 · Paywall** (ver `EXECUTION_PLAN.md`): generar los looks 2 y 3 al pasar a Premium, regenerar/reintentar looks desde la UI, y conectar Mercado Pago para que el upgrade dispare esa generación.
