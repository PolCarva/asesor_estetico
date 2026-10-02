# Plan de ejecución

## Milestones

| #   | Milestone                                        | Estado                                 |
| --- | ------------------------------------------------ | -------------------------------------- |
| 0   | **FOUNDATION / PROJECT SETUP**                   | ✅ Completado (2026-09-29)             |
| 1   | Onboarding real y análisis con IA                | ✅ Completado (2026-09-30)             |
| 2   | Looks con imagen realista                        | En curso: imagen del look lista        |
| 3   | Paywall y suscripción (Mercado Pago)             | Pendiente                              |
| 4   | Shopping real en tiendas de Uruguay              | ✅ Completado (2026-10-02)             |
| 5   | Favoritos, carrito y chat Premium                | Favoritos y carrito ✅; chat pendiente |
| 6   | Lanzamiento (legal, observabilidad, performance) | Pendiente                              |

## 0 · FOUNDATION / PROJECT SETUP — ✅ Completado

- [x] Monorepo pnpm + Turborepo, TypeScript strict, ESLint + Prettier compartidos.
- [x] `apps/web` (Next.js App Router + Tailwind) y `apps/worker` (Node + TypeScript).
- [x] Paquetes `ai`, `analytics`, `config`, `db`, `payments`, `shopping`, `shared`.
- [x] Documentación para agentes (`AGENTS.md`, `docs/`).
- [x] Variables de entorno validadas con Zod y separadas (public / server / worker).
- [x] Supabase local: migraciones, RLS, Storage privado, seed tipado.
- [x] Schemas del dominio (StyleProfile, LookSpec, Product, Job...).
- [x] Auth email/contraseña, rutas protegidas, perfil automático.
- [x] Subida de fotos privada con validación real de archivos.
- [x] Cola de jobs en Postgres + worker con concurrencia, reintentos y apagado limpio.
- [x] Abstracciones de IA, shopping y pagos con mocks.
- [x] Analytics, registro de uso de IA y logging estructurado.
- [x] UI shell responsive y accesible (desde 2026-10-01, sistema visual "Espejo": `DESIGN_SYSTEM.md`).
- [x] PWA instalable sin cachear datos sensibles.
- [x] Tests unitarios, de integración y E2E; CI en GitHub Actions.
- [x] Dockerfile del worker.
- [x] Admin mínimo.

Detalle del estado en `SETUP_STATUS.md`.

## 1 · Onboarding real y análisis con IA — ✅ Completado

- [x] Preferencias de estilo (nivel de riesgo, tatuajes) en `/app/onboarding`.
- [x] `startAnalysisAction`: encola `VALIDATE_PHOTOS` (uno a la vez, máximo 3 por día).
- [x] `OpenRouterProvider` real (Gemini 3.8 Flash) con JSON Schema estricto y reparación.
- [x] Handlers que escriben `user_photos.status`, `style_profiles` y `looks` (función SQL atómica).
- [x] UI de progreso con auto-refresco; motivos concretos si una foto no sirve.
- [x] Fotos reducidas en el navegador (≤2048 px, sin EXIF).
- [x] **Asesoría de imagen completa** (rama `feat/asesoria-shopping`, pasos 01, 02 y 02b): StyleProfile v3 con pelo, grooming, colores, ropa y fit, calzado, accesorios, joyería, anteojos, tatuajes y consejos; UI de consultoría con teaser free y detalle Premium (RLS), bento del perfil y detalle de cada look. Detalle en `PRODUCT_SPEC.md` y `AI_PIPELINE.md`.

## 2 · Looks con imagen realista — En curso

- [x] `generateLookImage` real (Gemini 3.1 Flash Image) con las fotos del usuario como referencia.
- [x] Imagen en `generated-looks`, servida con URLs firmadas; look 1 para free, 3 para Premium.
- [ ] Generar looks 2 y 3 al pasar a Premium.
- [ ] Regenerar un look y reintentar looks fallidos desde la UI (en el diseño, "↻ Generar otras" en `/app/looks`).
- [ ] Previews para looks bloqueados (a evaluar).

## 3 · Paywall y suscripción

- `MercadoPagoProvider` (preapproval): crear, consultar, cancelar.
- Webhook: confirmar estado con `getSubscription` antes de activar; tests con eventos grabados.
- Checkout, página de retorno, gestión de suscripción en el perfil.

## 4 · Shopping real — ✅ Completado (2026-10-02)

Rama `feat/asesoria-shopping`, pasos 03 a 09, 11, 12a y 12b; auditoría en `docs/goals/asesoria-shopping/AUDITORIA.md`.

- [x] Queries estructuradas desde el LookSpec, búsqueda por plataforma (Fenicio, VTEX, Shopify, WooCommerce) sobre un registro de tiendas, sitemaps y descubrimiento web, respetando robots.txt y sin evadir anti-bot.
- [x] Descarga segura, extracción en cascada (JSON-LD → microdata → OpenGraph → endpoints de plataforma), talles y stock, normalización y validación (Zod).
- [x] Ranking documentado (estética ≫ disponibilidad > precio), cache de pools en Postgres (24 h) y productos (8 h), `SEARCH_PRODUCTS` y `REFRESH_PRODUCT` con progreso por etapas.
- [x] Talles del usuario en el perfil, resultados por prenda (`look_products`), "Buscar más barato" y locales físicos (`IN_STORE_ONLY`).
- [x] Premium verificado en actions, `@asesor/db`, worker y RLS. Probado de punta a punta con tiendas reales (paso 12b).
- [ ] Zara, Nike y Mercado Libre: fuera de alcance mientras bloqueen bots o exijan OAuth (D7).
- [ ] Mejoras de calidad (limitaciones en `RESUMEN.md`): el ranking no ve las fotos; los términos de búsqueda son léxicos (faltan sinónimos para algunas prendas); el público solo se filtra si la página lo declara; sin fallback de navegador para tiendas que renderizan en el cliente; rate limit compartido (Postgres) antes de escalar; E2E de "más barato" con resultados.

## 5 · Favoritos, carrito y chat

- [x] Guardar looks (cualquier plan) y productos (Premium) en `/app/favorites` (pasos 10a y 10b).
- [x] Carrito externo agrupado por look: talle, comprado, quitar, cambiar por otra opción, total aproximado por moneda, revalidación al agregar y "Comprar ↗" a la tienda (pasos 10a y 10b).
- [ ] Chat Premium con `chatWithStyleAdvisor`, límites de uso y moderación.

## 6 · Lanzamiento

- Términos, privacidad, borrado de cuenta (incluye Storage), exportación de datos.
- Rate limiting compartido (Postgres), monitoreo de errores, alertas de costo de IA.
- Deploy: web (Vercel u otro) + worker (contenedor) + Supabase gestionado.
