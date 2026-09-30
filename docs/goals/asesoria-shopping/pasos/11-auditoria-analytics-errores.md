# Paso 11 — Auditoría: analytics, fallas parciales y seguridad

**Orden del SPEC:** 20 (+ "MANEJO DE ERRORES" y "REGLAS") · **Depende de:** 09, 10b · **SPEC:** "ANALYTICS", "MANEJO DE ERRORES", "PREMIUM", "REGLAS"

## Objetivo

Antes del E2E final, verificar de forma sistemática que lo construido en los pasos 01–10b cumple las reglas transversales, y corregir lo que falte.

## Tareas

1. **Analytics.** Armá una tabla por evento: dónde se emite (cliente o servidor), con qué propiedades y cómo se verificó. Los nueve eventos:
   - `style_advice_viewed`
   - `shopping_started`
   - `shopping_completed`
   - `product_viewed`
   - `product_added_to_cart`
   - `product_removed_from_cart`
   - `cheaper_alternative_requested`
   - `external_product_clicked`
   - `size_requested`

   Para todos, además:
   - Están en `ANALYTICS_EVENTS`.
   - En `CLIENT_ANALYTICS_EVENTS` solo van los de vista o click. Los de carrito y compra se emiten desde el servidor, para que no se puedan falsificar.
   - Las propiedades son planas, así no se descartan en silencio.
   - Se ven en `/admin/analytics`.
   - Hay tests de whitelist.

   Decidí qué pasa con `product_clicked` (lo reemplaza `external_product_clicked`) y actualizá el conteo de eventos en `docs/SETUP_STATUS.md`.

2. **Fallas parciales.** Un test por cada caso del SPEC:
   - una tienda bloquea (403 o anti-bot);
   - un producto desapareció (404/410);
   - cambió el HTML (sin datos estructurados);
   - no hay talle;
   - falla una extracción;
   - falla un candidato;
   - timeout.

   Revisá además que ningún texto técnico (stack, `last_error`, códigos) llegue a la UI, y que los mensajes sean honestos. Ejemplo: "Encontramos opciones similares, pero no pudimos verificar el stock de algunas prendas".

3. **Nunca inventar.** Revisá cada camino que produce precio, stock, talle o disponibilidad: extracción, normalización, refresh, cache y UI. Lo no verificado queda `UNKNOWN` o "sin verificar", y un fallo de verificación no renueva `last_fetched_at`. Con tests.
4. **Premium en el servidor.** Listá cada entrada de shopping, carrito y favoritos de producto (server actions, rutas, handlers del worker, RLS) y confirmá dónde se aplica `requirePremium`, `isUserPremium` o la política. Probalo con un usuario free llamando las funciones de `packages/db` o las actions directamente, no solo desde la UI.
5. **Mocks fuera de producción.** Con `NODE_ENV=production`, `SHOPPING_PROVIDER=mock` se rechaza (test del paso 03), y ningún código de producción importa fixtures sin necesidad. Evaluá si `packages/shopping/src/index.ts` debe dejar de exportar los mocks en el bundle del worker.
6. **Validación externa.** Toda respuesta externa (búsqueda web, APIs de plataforma, páginas, robots) pasa por Zod: revisalo y agregá tests donde falten.
7. **Seguridad y privacidad**, con evidencia:
   - SSRF: tests de las URLs de descubrimiento, de las redirecciones y del proxy de imágenes, si existe.
   - robots.txt y user agent.
   - Rate limit: un test por cada action nueva.
   - Secretos solo en el servidor: buscá en `apps/web/.next` después de `pnpm build` y confirmá que no aparece ninguna clave ni nombre de variable privada nuevo.
   - Las consultas a terceros no llevan datos personales: revisá el payload real.
   - Links con `rel` seguro.
   - CSP.

   Actualizá `docs/SECURITY_PRIVACY.md`.

8. **Costos.** Estimá el costo por búsqueda de look (búsqueda web, IA si se usa, requests) y por análisis con la asesoría nueva. Anotalo en `docs/SETUP_STATUS.md`, en riesgos o costos.
9. **Correcciones.** Corregí todo lo que encuentres, con tests. Si algo es grande, anotalo como limitación para el paso 13 y el resumen.

## Hecho cuando

- [ ] La tabla de los 9 eventos está verificada (en el log o en `DECISIONES.md`), con whitelist y tests.
- [ ] Hay un test por cada falla parcial del SPEC y ningún texto técnico llega a la UI.
- [ ] Las auditorías de "nunca inventar", Premium en el servidor, mocks fuera de producción y validación Zod externa están hechas, con los hallazgos corregidos.
- [ ] La auditoría de seguridad tiene evidencia: búsqueda en el build sin secretos, tests de rate limit y SSRF, y el payload a terceros sin datos personales.
- [ ] `docs/SECURITY_PRIVACY.md` y `docs/SETUP_STATUS.md` están actualizados.
- [ ] `pnpm format`, `lint`, `typecheck`, `test` (con integración ejecutada) y `build` en verde.
