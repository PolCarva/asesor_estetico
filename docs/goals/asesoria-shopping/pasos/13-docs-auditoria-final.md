# Paso 13 — Documentación, auditoría final y resumen

**Orden del SPEC:** 22–23 · **Depende de:** 12b · **SPEC:** "ANTES DE FINALIZAR", "REGLAS", "CRITERIOS DE ACEPTACIÓN"

## Objetivo

Dejar la documentación al día, auditar el resultado contra **todo** `SPEC.md`, cerrar lo que falte y entregar el resumen final pedido.

## Tareas

1. **Docs** (reflejando el estado real del código; si docs y código difieren, investigá cuál es el real y corregí):
   - `docs/PRODUCT_SPEC.md`: asesoría, Free vs Premium, flujo de shopping, carrito.
   - `docs/AI_PIPELINE.md`: StyleProfile v2, prompt, costos.
   - `docs/SHOPPING_ENGINE.md`: pipeline real, tiendas, extracción, ranking con pesos, cache, jobs, fallas parciales.
   - `docs/DATA_MODEL.md`: tablas y columnas nuevas, grants, funciones.
   - `docs/EXECUTION_PLAN.md`: milestones 4 y 5 según lo hecho, y qué queda.
   - `docs/SETUP_STATUS.md`: qué está implementado y qué sigue mockeado (con `SHOPPING_PROVIDER` y su protección en producción), proveedores reales, cantidad de tests, riesgos y costos.
   - `docs/ARCHITECTURE.md` y `docs/SECURITY_PRIVACY.md` si cambiaron, y `README.md` raíz si cambian comandos o variables.
2. **Auditoría final contra `SPEC.md`:** recorré cada sección y cada viñeta (asesoría, estructura, UI, tiendas, pipeline, datos del producto, estados, talles, ranking, resultados, más barato, carrito, cache, Premium, jobs, UX, locales sin ecommerce, analytics, errores, reglas). Marcá cada una como cumplida, cumplida con limitación o no cumplida, con dónde se ve en el código. Lo no cumplido se arregla ahora. Si no se puede (por ejemplo, depende de una clave o de un tercero), va a limitaciones con el motivo. Guardá la tabla en `docs/goals/asesoria-shopping/AUDITORIA.md`.
3. Revisá `DECISIONES.md`: no deben quedar propuestas sin confirmar. D21 (el cambio de orden respecto del SPEC) va en `AUDITORIA.md` como "cumplido con cambio justificado".
4. **Verificación completa**, sin cache de turbo si hay dudas (`--force`):

   ```bash
   source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm lint && pnpm typecheck && CI=1 pnpm test && pnpm build && pnpm test:e2e
   ```

   Más `pnpm db:reset` y `pnpm db:types` sin diferencias.

5. **Resumen final** en `docs/goals/asesoria-shopping/RESUMEN.md` y en el mensaje final, con los 11 puntos del SPEC:
   1. Qué implementaste.
   2. Cambios en StyleProfile.
   3. Cómo funciona ahora la asesoría.
   4. Cómo funciona el shopping.
   5. Tiendas reales con las que se probó.
   6. Estrategia de extracción.
   7. Ranking utilizado.
   8. Funcionamiento del carrito.
   9. Limitaciones conocidas.
   10. Resultado de tests y build.
   11. Qué falta para considerar completa la funcionalidad primaria del MVP.
6. Marcá el plan como terminado en `README.md` (todos ✅) y commiteá. **No** hagas merge a `main` ni push: el usuario revisa la rama.

## Hecho cuando

- [ ] Los 6 docs del SPEC (y los que correspondan) reflejan el estado real.
- [ ] `AUDITORIA.md` con cada requisito del SPEC y su estado. No quedan "no cumplido" sin motivo externo.
- [ ] Verificación completa en verde (format, lint, typecheck, test, build, e2e, `db:types` sin diferencias).
- [ ] `RESUMEN.md` con los 11 puntos, también pegado en el mensaje final.
- [ ] Commit final en `feat/asesoria-shopping`.
