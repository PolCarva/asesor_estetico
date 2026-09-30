# Paso 02 — Asesoría: UI, Free/Premium y detalle de look

**Orden del SPEC:** 6 · **Depende de:** 01 · **SPEC:** "UI DEL ASESORAMIENTO", "ANALYTICS" (`style_advice_viewed`), criterios de aceptación 5–6

## Objetivo

1. En la pantalla de resultados (`/app/looks`), además de los 3 looks, una sección de **asesoramiento** visual, premium y fácil de escanear, como una consultoría profesional de imagen:
   - TE FAVORECE (✓) y MEJOR EVITAR (×);
   - PELO y GROOMING;
   - COLORES;
   - ROPA Y FIT;
   - CALZADO y ACCESORIOS;
   - TATUAJES;
   - consejos generales.

   Nada de bloques grandes de texto.

2. **Free/Premium:** FREE ve una parte suficiente como teaser; PREMIUM ve el análisis completo. El paso 01 ya protege en los datos la parte Premium: acá esa parte no se pide ni se manda al navegador de un usuario free.
3. **Detalle de look** en `/app/looks/[id]`: "entrar a cualquier look" (criterio 6). Es la entrada del shopping (paso 07).
4. No romper el comportamiento actual de los 3 looks.

## Lo que ya hay (relevamiento 2026-09-30, verificalo)

- **Resultados.** `apps/web/src/app/app/looks/page.tsx` muestra una grilla de `LookCard`/`LockedLookCard`, `AutoRefresh` mientras genera y `PaywallCard` para free. No tiene asesoría.
- **Cards y detalle.** `apps/web/src/components/look-card.tsx`: la card no linkea a ningún lado y **no existe `/app/looks/[id]`**. El `reasoning`, `avoid`, `fit`, `hair`, `grooming` y las prendas del LookSpec nunca se muestran.
- **Perfil.** `apps/web/src/app/app/profile/page.tsx` es el único lugar que muestra algo del perfil (`style_direction`, `colors.best`, `strengths`, `avoid`), sin gating.
- **Componentes reutilizables.**
  - `apps/web/src/components/swatches.tsx`: chips de color.
  - `apps/web/src/components/paywall-card.tsx`: paywall mock (botón deshabilitado, emite `paywall_viewed`). Sus beneficios no mencionan el análisis completo.
- **Premium en la web.** `getPlan(userId)` en `apps/web/src/lib/data.ts`. Los looks 2–3 están bloqueados por RLS (`current_user_is_premium()`).
- **Analytics.**
  - `ANALYTICS_EVENTS` y `CLIENT_ANALYTICS_EVENTS` viven en `packages/shared/src/schemas/analytics.ts`.
  - `style_advice_viewed` **no existe**.
  - `free_look_viewed`, `premium_look_viewed` y `locked_look_clicked` existen pero nadie los emite.
  - Cliente: `<TrackEvent>` / `sendClientEvent` → `/api/analytics`, que acepta solo nombres de la lista cliente.
- **Docs.** `docs/PRODUCT_SPEC.md` dice que Free tiene "StyleProfile" y "Recomendaciones generales" completos. Eso contradice el SPEC nuevo (teaser): actualizalo.

## Trampas

- `AutoRefresh` re-renderiza toda la ruta cada 4 s. Que la sección de asesoría no dispare trabajo caro de más (URLs firmadas, etc.).
- `getLooks()` usa service role para los resúmenes de looks bloqueados (solo columnas no sensibles). El detalle de un look bloqueado debe mostrar paywall, nunca su spec.
- Tests de web: vitest en entorno node, solo `src/**/*.test.ts` (sin tests de componentes `.tsx`). La lógica testeable va en funciones puras.
- Next 16: leé las docs indicadas en `apps/web/AGENTS.md` (`apps/web/node_modules/next/dist/docs/`) antes de escribir rutas nuevas.

## Tareas

1. **View model.** Función pura en `packages/shared`, por ejemplo `selectAdviceForPlan(profile, premiumAdvice | null, isPremium)`. Arma el view model con:
   - qué secciones ve free: el teaser definido en el paso 01, por ejemplo 2–3 ítems de TE FAVORECE y MEJOR EVITAR, colores principales y un tip de pelo;
   - cuáles quedan bloqueadas, con su CTA.

   Con tests unitarios.

2. **Lectura en el servidor.** La asesoría Premium se consulta solo si el usuario es Premium, con su cliente y la RLS del paso 01.
3. **Componente de asesoría.** Server Component en `apps/web/src/components/`, con **todas** las secciones de la asesoría:
   - listas cortas con ✓/×;
   - `Swatches` para los colores;
   - instrucciones para el peluquero destacadas y copiables;
   - barba y cejas, calzado, joyería y anteojos (si corresponde), ubicaciones de tatuajes y consejos generales;
   - para free, las secciones bloqueadas con blur o candado + CTA a Premium.

   Mobile first, accesible (encabezados, `aria`) y coherente con la estética editorial existente.

4. **Integración en `/app/looks`**, sin romper la grilla ni el auto-refresh. Opcional: una versión compacta en `/app/profile`.
5. **`/app/looks/[id]`:** detalle del look con:
   - imagen y concepto;
   - prendas por slot con `listLookGarments`: color, fit y material;
   - pelo y grooming del look;
   - `reasoning` y `avoid`.

   Para looks bloqueados o ajenos: paywall o 404 (RLS). `LookCard` linkea al detalle. Dejá el lugar del CTA "Encontrar este look" para el paso 07.

6. **Analytics.** Agregá `style_advice_viewed` a `ANALYTICS_EVENTS` y a `CLIENT_ANALYTICS_EVENTS`. Se emite desde el navegador al ver la sección, con propiedades planas (por ejemplo `plan`, `sections_visible`). Si es barato, emití también `free_look_viewed`, `premium_look_viewed` y `locked_look_clicked`, que ya existen.
7. **`PaywallCard`:** agregá el análisis completo a los beneficios.
8. **Docs:** `docs/PRODUCT_SPEC.md` (tabla Free vs Premium y sección de asesoría).
9. **Verificación visual** en el navegador, en desktop y mobile, con un usuario Premium y uno free:
   - la sección se escanea rápido y no hay textos enormes;
   - free ve el teaser y el CTA; Premium ve todo;
   - el detalle de look funciona para los 3 looks (Premium) y muestra paywall en los looks 2–3 (free).

   Si el paso 01 dejó un perfil real, revisalo también con esos datos.

## Hecho cuando

- [ ] `/app/looks` muestra la sección de asesoría con un teaser claro para free y, para Premium, **todos** los bloques del StyleProfile (incluidos calzado, barba y cejas, anteojos, ubicaciones de tatuajes y consejos generales). El log trae la tabla campo → sección.
- [ ] Lo Premium no llega al cliente de un usuario free: verificado inspeccionando el HTML o el payload RSC de una página como free.
- [ ] `/app/looks/[id]` existe, se llega desde la card y respeta el bloqueo de looks 2–3.
- [ ] `style_advice_viewed` se registra (visto en `analytics_events` o en `/admin/analytics`).
- [ ] Los 3 looks se comportan igual que antes: grilla, imágenes, auto-refresh y paywall.
- [ ] Verificación visual desktop + mobile, free + Premium, hecha y descrita en el log.
- [ ] `pnpm format`, `lint`, `typecheck`, `test` (con integración ejecutada), `build` y `test:e2e` en verde.
