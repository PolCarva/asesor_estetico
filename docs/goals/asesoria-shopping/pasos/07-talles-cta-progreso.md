# Paso 07 — Talles, CTA "Encontrar este look" y progreso

**Orden del SPEC:** 16 (y la entrada de 15) · **Depende de:** 02, 06 · **SPEC:** "TALLES", "PREMIUM", "JOBS", "UX", "ANALYTICS" (`size_requested`, `shopping_started`)

## Objetivo

El arranque del flujo de shopping desde el detalle de un look:

`Look → [Encontrar este look] → pedir talles si faltan → Buscar → progreso real por etapas`

- **Premium:** CTA "Encontrar este look". Si faltan talles, se piden **solo los relevantes para ese look**: remera o camisa S/M/L/XL…, pantalón 30/32/34…, calzado EU/US. Se guardan en el perfil y no se vuelven a pedir. Después se encola la búsqueda y se muestra el progreso.
- **Free:** CTA "Encontrá las prendas reales para recrear este look" → paywall. El servidor también lo rechaza (paso 06).
- Repetible con cualquiera de los 3 looks.

## Lo que ya hay (relevamiento 2026-09-30, verificalo)

- **Talles del usuario:** no hay en ninguna tabla.
- **`profiles`:** grants de UPDATE por columna (`display_name`, `style_risk_level`, `tattoo_preference`, `onboarding_completed`) y SELECT de tabla completa.
- **Del paso 03:** `UserSizesSchema` y `sizeKindForCategory`. **Reusalos, no redefinas el mapeo.**
- **Del paso 06:** `startLookShopping`, `startLookShoppingAction` y la lectura del progreso. El paso 02 crea `/app/looks/[id]`.
- **Progreso en la UI:** el patrón a copiar es `apps/web/src/app/app/onboarding/page.tsx` (lista de etapas hecho/actual/pendiente, `aria-live`, sin porcentajes) más `<AutoRefresh active intervalMs={4000}>`, que hace `router.refresh()` de toda la ruta. Realtime está deshabilitado.
- **Analytics:** `size_requested` no existe.

## Trampas

- **Columnas nuevas en `profiles`:** necesitan `grant update (…) on public.profiles to authenticated` en una migración nueva, `db:types` y un test de integración (solo el dueño, solo esas columnas).
- **`AutoRefresh` re-renderiza toda la ruta:** poné el polling en un segmento chico o cortalo cuando el job termina.
- **Calzado:** EU y US no son intercambiables. Guardá el sistema junto al número.
- **Errores:** si la action falla, mostrá un mensaje humano. Nunca `last_error`.

## Tareas

1. **Migración de talles** en `profiles`, alineada con `UserSizesSchema`: por ejemplo `top_size`, `bottom_size`, `shoe_size` y `shoe_size_system ('EU'|'US')`, con checks de largo o de valores.
   - Grants de UPDATE.
   - `db:reset` y `db:types`.
   - Test de integración: solo el dueño, sin tocar columnas no permitidas.
2. **Dominio puro** en `packages/shared`: `missingSizesForLook(look, sizes)`, sobre `sizeKindForCategory`. Tests.
3. **Guardar talles:**
   - server action con Zod, cliente del usuario y `revalidatePath`, con la lógica testeable en `packages/db` si hace falta, como en el paso 06;
   - edición de talles en `/app/profile`.
4. **CTA en `/app/looks/[id]`:**
   - Premium: botón "Encontrar este look".
   - Free: CTA con el texto del SPEC que abre o lleva al paywall (`PaywallCard`) y emite `locked_look_clicked` o `paywall_viewed` según corresponda.
5. **Formulario de talles** en línea, solo con los que faltan para ese look.
   - Emite `size_requested` con los tipos pedidos. Agregalo a `ANALYTICS_EVENTS`, y a `CLIENT_ANALYTICS_EVENTS` si se emite desde el cliente.
   - Al enviar, guarda los talles y encola (`startLookShoppingAction`) en un solo paso.
6. **Progreso:** componente con las 5 etapas del SPEC, derivadas de `jobs.progress` real (hecho/actual/pendiente), con `aria-live` y sin porcentajes. Estados terminales:
   - Completado: pasa a resultados (paso 08).
   - Completado parcial: mensaje honesto.
   - Fallido: mensaje humano y "Reintentar".

   Polling acotado mientras el job está activo.

7. **Tests:** dominio de talles, guardado de talles y grants.
8. **Verificación en el navegador** (desktop + mobile), con un usuario Premium local nuevo:
   - Sin talles: se piden solo los relevantes, se guardan, arranca la búsqueda y las etapas avanzan con el worker real (`AI_PROVIDER=mock SHOPPING_PROVIDER=live`).
   - Segunda vez: no pregunta los talles.
   - Otro look: funciona.
   - Usuario free: paywall, y el servidor no encola (verificado en `jobs`).

## Hecho cuando

- [ ] Talles persistidos en el perfil (migración, grants, tipos y test) y editables en `/app/profile`, sin duplicar el mapeo del paso 03.
- [ ] Solo se piden los talles relevantes del look, una sola vez.
- [ ] El CTA Premium encola y muestra el progreso real por etapas. El CTA free lleva al paywall sin encolar.
- [ ] `size_requested` registrado.
- [ ] Los cuatro casos verificados en el navegador (descritos en el log).
- [ ] `pnpm format`, `lint`, `typecheck`, `test` (con integración ejecutada), `build` y `test:e2e` en verde.
- [ ] `docs/DATA_MODEL.md`, `docs/PRODUCT_SPEC.md` y `DECISIONES.md` actualizados.
