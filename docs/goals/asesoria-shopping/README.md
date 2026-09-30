# Plan: asesoramiento estético completo + shopping real Uruguay

Plan de trabajo por pasos para cumplir [`SPEC.md`](SPEC.md), el pedido original completo y la fuente de verdad del alcance. Se ejecuta **un paso por sesión** con el goal de [`GOAL.md`](GOAL.md): cada vez que se corre, toma el siguiente paso ejecutable de la tabla de abajo.

| Archivo                          | Para qué                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------- |
| [`SPEC.md`](SPEC.md)             | Pedido original. Ante cualquier duda de alcance, manda este archivo.              |
| [`GOAL.md`](GOAL.md)             | Texto para pegar en `/goal` (el mismo en cada sesión).                            |
| [`DECISIONES.md`](DECISIONES.md) | Decisiones de diseño: propuestas iniciales y lo que confirma cada paso.           |
| [`TIENDAS_UY.md`](TIENDAS_UY.md) | Relevamiento de tiendas uruguayas: plataformas, endpoints, robots.txt y bloqueos. |
| `pasos/NN-*.md`                  | Un archivo por paso: objetivo, contexto, trampas, tareas y "Hecho cuando".        |

## Prerrequisitos del usuario (completar antes de la primera corrida)

- **Fotos de prueba autorizadas** (una de cuerpo entero y una de rostro de una persona que lo autorizó, o de una persona ficticia generada con IA) **fuera del repo**, en `~/asesor-fotos-prueba/cuerpo.jpg` y `~/asesor-fotos-prueba/cara.jpg`. Las usan los pasos 01 y 12b. Si no están, esos pasos quedan ⛔.
- **Límite de gasto** configurado en la clave de OpenRouter. La IA real ya está activa en `.env` (`AI_PROVIDER=openrouter`) y la búsqueda web cuesta ~USD 0.007 por consulta.

## Protocolo de cada sesión

1. **Entorno.** Node 24: anteponé `source ~/.nvm/nvm.sh && nvm use >/dev/null &&` a cada comando que use `node`, `pnpm`, `npx` o `tsx` (el shell arranca con Node 22 y el estado no persiste entre comandos). Supabase local levantado (`pnpm db:start` si no responde).
2. **Rama.** Todo el trabajo va en `feat/asesoria-shopping`.
   - Si la rama existe y no estás en ella: `git switch feat/asesoria-shopping` (con el árbol limpio; si hay cambios sin commitear que no son tuyos, informalo y no los pises).
   - Si no existe: creala desde `main` y hacé un primer commit solo con `docs/goals/` (`docs: plan asesoria + shopping`).
   - Nunca trabajes en `main`. No hagas push ni merge.
   - Asegurate de que `.claude/` esté en `.git/info/exclude` (`grep -qx '.claude/' .git/info/exclude || echo '.claude/' >> .git/info/exclude`), así los archivos locales del panel no ensucian `git status`.
3. **Elegir el paso** (mostrá la tabla con `grep -n '^| [0-9]' docs/goals/asesoria-shopping/README.md`), en este orden:
   1. el paso en 🟡 (quedó a medias: retomalo);
   2. el primer ⛔ cuyo bloqueo ya se resolvió (comprobalo con un comando, sin imprimir secretos);
   3. el primer ⬜ con todas sus dependencias en ✅, **aunque haya un ⛔ antes**.

   Si no hay ninguno: no toques nada e informá **PLAN TERMINADO** (todo ✅) o **SIN PASO EJECUTABLE** (cada pendiente y qué lo traba).

4. **Marcar 🟡** en la tabla antes de empezar.
5. **Leer:** este README completo, el archivo del paso (mostrá su "Hecho cuando" con `sed -n '/^## Hecho cuando/,$p' <archivo>`), `DECISIONES.md`, `TIENDAS_UY.md` si el paso es de shopping, las secciones de `SPEC.md` que cita, y lo que indique de `/docs` y del código. Los datos del relevamiento son del 2026-09-30: verificalos contra el código actual, porque un paso anterior pudo cambiarlos.
6. **Implementar solo ese paso**, completo y con integraciones reales (mocks solo en tests). Si descubrís algo que corresponde a otro paso, anotalo en el log ("Para pasos siguientes") y no lo hagas, salvo que sea imprescindible para que este paso funcione. Tocar código de pasos anteriores está bien cuando este paso lo exige (los pasos 11, 12b y 13 existen para eso); lo que no se hace es cambiar el estado de otra fila de la tabla.
7. **Errores, tests rojos o inestables, tiendas que bloquean o dificultad NO son bloqueo:** investigá, corregí y seguí. El paso queda ⛔ **solo** por algo que únicamente el usuario puede dar:
   - una clave o secret que falta (mostrá el comando que lo prueba, sin el valor);
   - un gasto no previsto (con el monto);
   - fotos de prueba autorizadas;
   - una decisión de producto que el SPEC no resuelve (citá el SPEC y las opciones).

   Para cerrar como ⛔:
   1. Hacé todo lo que no depende de eso.
   2. Marcá ⛔ en la tabla y escribí la entrada del log con qué tiene que hacer el usuario y cómo se va a comprobar que ya está.
   3. Dejá la verificación en verde.
   4. Commiteá todo junto: `wip(asesoria-shopping): paso NN — bloqueado: <motivo>`.

   `git status --short` tiene que quedar vacío, igual que al cerrar ✅.

   Si un punto de "Hecho cuando" admite explícitamente una alternativa, usala, anotala y el paso cierra ✅.

8. **Cerrar la documentación:**
   - marcá ✅ con fecha en la tabla;
   - agregá la entrada del log;
   - confirmá en `DECISIONES.md` las decisiones tomadas;
   - actualizá los docs de `/docs` que el paso toque (regla de AGENTS.md: si cambia la arquitectura o los datos, se actualizan los docs en el mismo cambio).
9. **Verificación final**, después del último cambio de código **y** de docs (ver abajo). Cada punto de "Hecho cuando" necesita evidencia en una salida real de esta sesión. Si el paso se retomó (🟡 o ⛔ resuelto), los puntos ya cerrados en una sesión anterior se respaldan mostrando su commit (`git show --stat <hash>`) y su entrada del log, sin repetir pruebas pagas. La verificación final se corre siempre.
10. **Commit** en `feat/asesoria-shopping` con `feat(asesoria-shopping): paso NN — <título>` (o `fix`/`docs` si corresponde), terminando con la línea `Co-Authored-By` que indique la sesión. Revisá `git status` y agregá los archivos explícitamente (no `git add -A`: no commitees `.env`, `.claude/`, capturas con datos personales ni artefactos). Después del commit, `git status --short` tiene que quedar vacío.
11. **Reporte final en el chat** con el formato de `GOAL.md`. El goal se evalúa leyendo solo la conversación.

## Verificación

```bash
pgrep -fl 'tsx watch.*src/index.ts|--import tsx src/index.ts'   # si hay un worker corriendo, apagalo antes de testear (pkill -f con el mismo patrón)
source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm lint && pnpm typecheck && CI=1 pnpm test
```

- **Integración:** `pnpm test` corre unit + integración y necesita Supabase local arriba y **ningún worker corriendo**. Un worker vivo toma los jobs de los tests y, con `AI_PROVIDER=openrouter`, gasta IA real. Sin Supabase, la integración se saltea en silencio; con `CI=1` falla, que es lo que queremos. Confirmá en la salida la cantidad de tests de integración ejecutados.
- **Build:** si tocaste algo que afecta el build (web, worker, config, dependencias o env), corré también `pnpm build`.
- **UI:** si tocaste la UI, corré además `pnpm test:e2e`. Con `pnpm dev` corriendo, usá `PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm test:e2e`, porque no pueden correr dos `next dev` en el mismo directorio.
- **Migraciones nuevas:** `pnpm db:reset` (aplica todo desde cero + seed) y `pnpm db:types` (CI compara `packages/db/src/database.types.ts`). `db:reset` borra y recrea los usuarios del seed.
- **UI en el navegador:** verificala con el panel de Claude, en desktop y mobile, con un usuario free y uno Premium. Para `preview_start`, creá `.claude/launch.json` con `"runtimeExecutable": "bash"` y `"runtimeArgs": ["-lc", "source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm dev"]`, `"port": 3000`. `.claude/` queda excluido de git (punto 2 del protocolo).
- **Integraciones reales** (IA, tiendas): además de los tests con mocks o fixtures, cada paso que integra algo real incluye una **prueba real** documentada en el log (qué se corrió y qué devolvió).
- **Scripts de prueba real:** van en `apps/worker/scripts/`, que ya tiene `tsx` y arma las dependencias reales (proveedores, cache, cliente de búsqueda web). Se corren con `pnpm --filter @asesor/worker exec tsx --env-file-if-exists=../../.env scripts/<x>.ts`. Nunca como `*.test.ts`: `packages/shopping` no tiene config de vitest y todo `*.test.ts` entra en `test:unit`, que corre en CI sin red.

## Entorno y datos de prueba

- **IA real ya activa:** `.env` tiene `AI_PROVIDER=openrouter`, así que todo worker que levantes usa IA paga. Para pruebas de shopping sin costo de IA, usá `AI_PROVIDER=mock SHOPPING_PROVIDER=live pnpm worker:dev` (las variables exportadas ganan sobre `--env-file`). En E2E, exportá `AI_PROVIDER=mock SHOPPING_PROVIDER=mock`. Costo de referencia: ~USD 0.10 por análisis free, ~0.24 Premium.
- **Usuarios del seed** (`pnpm db:seed`, contraseña en el `README.md` raíz o en `SEED_USER_PASSWORD`): `demo@asesor.test` (Premium, suscripción MOCK de 30 días), `free@asesor.test` y `admin@asesor.test`. Se borran y recrean en cada seed o reset. `demo@asesor.test` trae productos, carrito y favoritos **ficticios** (dominios `.test`): para las pruebas con datos reales usá un usuario nuevo.
- **Usuario nuevo con looks, sin gastar IA** (pasos 06–10b): registralo en la app y analizá con el worker en `AI_PROVIDER=mock`. El mock acepta cualquier imagen válida, por ejemplo `apps/web/e2e/fixtures/photo.png`; verificalo. Las fotos autorizadas solo hacen falta con IA real (pasos 01 y 12b).
- **Hacer Premium a otro usuario local** (Mercado Pago sigue mockeado, no hay checkout real), con service role o desde Supabase Studio (http://localhost:54323):

  ```sql
  insert into public.subscriptions (user_id, provider, provider_subscription_id, status, current_period_start, current_period_end)
  values ('<uuid>', 'MOCK', 'mock_manual_<algo>', 'ACTIVE', now(), now() + interval '30 days');
  ```

- **App completa:** `pnpm dev` (web) + `pnpm worker:dev` (worker, en otra terminal o en segundo plano). Apagá el worker antes de `pnpm test`.
- **Next 16:** antes de escribir código de Next, leé lo que indica `apps/web/AGENTS.md`. Las docs están en `apps/web/node_modules/next/dist/docs/`.
- **La regla Premium vive en dos lugares:** `isPremiumSubscription` (TS) y `current_user_is_premium()` (SQL). Si cambia una, cambia la otra.
- **Tablas y funciones nuevas SÍ quedan expuestas:** los default privileges de Supabase dan ALL a `anon` y `authenticated` sobre tablas nuevas, y EXECUTE sobre funciones nuevas. En cada migración:
  1. `alter table public.<t> enable row level security;`
  2. `revoke all on public.<t> from anon, authenticated;`
  3. solo los grants necesarios (por columna si corresponde).

  Para funciones: `revoke all on function public.<f>(…) from public, anon, authenticated;` + `grant execute … to service_role` (o a `authenticated` si corresponde). `service_role` ya tiene acceso por default. Agregá la tabla a la lista de `anon` en `packages/db/test/integration/rls.int.test.ts`, más un test de que `authenticated` no puede escribir lo que no debe.

- **Variables de entorno nuevas:** van en el schema de `packages/config/src/env/schemas.ts`, en `.env.example` y en `globalPassThroughEnv` de `turbo.json` (modo estricto de turbo).
- **Dependencias nuevas:** solo con justificación (AGENTS.md), vía `catalog` de `pnpm-workspace.yaml`, con `pnpm-lock.yaml` commiteado. Si la usa el worker, verificá `pnpm --filter @asesor/worker build` (bundle tsup `noExternal`).
- **CSP:** `apps/web/next.config.ts` solo permite imágenes de `self` y de Supabase. Las fotos de productos de tiendas necesitan ampliar `img-src` o un proxy (paso 08).
- **Logger:** redacta las claves que contienen `image`, `payload`, etc. Usá nombres neutros en los campos de log.

## Estados

⬜ pendiente · 🟡 en curso · ✅ hecho · ⛔ bloqueado (necesita al usuario)

## Progreso

| #   | Paso                                                                                               | Orden del SPEC | Depende de | Estado |
| --- | -------------------------------------------------------------------------------------------------- | -------------- | ---------- | ------ |
| 01  | [Asesoría: schema, prompt y persistencia](pasos/01-asesoria-schema-prompt.md)                      | 1–5            | —          | ⛔     |
| 02  | [Asesoría: UI, Free/Premium y detalle de look](pasos/02-asesoria-ui-detalle-look.md)               | 6              | 01         | ⬜     |
| 03  | [Shopping: queries desde el LookSpec y búsqueda real](pasos/03-shopping-queries-busqueda.md)       | 7–9            | —          | ⬜     |
| 04a | [Shopping: fetcher seguro, extracción y normalización](pasos/04a-fetch-extraccion.md)              | 10–11          | 03         | ⬜     |
| 04b | [Shopping: adaptadores de talles/stock, validación y locales](pasos/04b-adaptadores-validacion.md) | 10–11          | 04a        | ⬜     |
| 05  | [Shopping: ranking y cache persistente](pasos/05-shopping-ranking-cache.md)                        | 12–13          | 04b        | ⬜     |
| 06  | [Shopping: jobs reales, progreso y Premium server-side](pasos/06-shopping-jobs-premium.md)         | 14, 19         | 05         | ⬜     |
| 07  | [Talles, CTA "Encontrar este look" y progreso](pasos/07-talles-cta-progreso.md)                    | 16, 15         | 02, 06     | ⬜     |
| 08  | [UI de resultados de shopping](pasos/08-resultados-ui.md)                                          | 15             | 07         | ⬜     |
| 09  | ["Buscar más barato"](pasos/09-buscar-mas-barato.md)                                               | 17             | 08         | ⬜     |
| 10a | [Carrito: datos y acciones](pasos/10a-carrito-backend.md)                                          | 18             | 06         | ⬜     |
| 10b | [Carrito y favoritos: UI y prueba real](pasos/10b-carrito-ui.md)                                   | 18             | 08, 10a    | ⬜     |
| 11  | [Auditoría: analytics, fallas parciales y seguridad](pasos/11-auditoria-analytics-errores.md)      | 20             | 09, 10b    | ⬜     |
| 12a | [Tests E2E de los flujos nuevos](pasos/12a-e2e.md)                                                 | 21             | 11         | ⬜     |
| 12b | [Prueba real de punta a punta (15 criterios)](pasos/12b-prueba-real.md)                            | 21             | 12a        | ⬜     |
| 13  | [Documentación, auditoría final y resumen](pasos/13-docs-auditoria-final.md)                       | 22–23          | 12b        | ⬜     |

- Los pasos 01–02 (asesoría) y 03–06 (motor de shopping) son independientes entre sí: si uno queda ⛔, se sigue con el otro.
- El orden cambia respecto del listado del SPEC, a propósito (ver D21 en `DECISIONES.md`):
  - Premium (SPEC 19) va con los jobs, para que el shopping nunca exista sin chequeo en el servidor.
  - Talles (SPEC 16) va antes de la UI de resultados (SPEC 15), porque el flujo UX del SPEC pide los talles antes de buscar.
  - Analytics (20) y testing (21) se hacen en cada paso y se auditan en los pasos 11, 12a y 12b.

## Log

<!-- Una entrada por sesión, la más nueva abajo. Formato:

### Paso NN — <título> · <AAAA-MM-DD> · ✅ | ⛔ | 🟡
- Hecho: …
- Prueba real: … (qué se corrió contra servicios reales y qué devolvió)
- Verificación: format ✓ · lint ✓ · typecheck ✓ · test ✓ (N unit, M integración ejecutados) · build ✓/— · e2e ✓/—
- Decisiones: … (también en DECISIONES.md)
- Para pasos siguientes: …
- Commit: `feat(asesoria-shopping): paso NN — <título>` (el hash va en el reporte del chat)
-->

### Paso 01 — Asesoría: schema, prompt y persistencia · 2026-09-30 · ⛔

- Hecho:
  - `StyleProfileSchema` v2 (`packages/shared/src/schemas/style-profile.ts`) con la asesoría completa: pelo (corte, largo, laterales, textura, peinado, evitar, indicaciones al peluquero), grooming (barba, cejas, evitar), ropa (siluetas, cortes de pantalón, largos, layering, evitar), calzado y accesorios con `avoid`, joyería, anteojos, tatuajes (sugerencias y ubicaciones) y `general_advice`. Sin nullables nuevos ni campos de puntaje.
  - `splitStyleProfile`/`mergeStyleProfile`, `StyleProfileCoreSchema` (teaser) y `StyleAdviceSchema` (Premium); `StyleProfileV1Schema`, `upgradeStyleProfileV1` y `parseStoredStyleProfile` (acepta v1 y v2).
  - Migración `20260930000200_style_advice.sql`: tabla `style_advice` (RLS solo propio + Premium, revokes explícitos, FK compuesta al perfil del mismo usuario) y `create_style_profile_with_looks` de 4 argumentos (guarda núcleo + asesoría + 3 looks en una transacción; se borró la de 3). `db:reset` + `db:types`.
  - `@asesor/db`: `saveStyleProfileWithLooks` parte el perfil; `getActiveStyleProfile(db, userId)` nuevo (lectura tolerante, `advice` null para free). La web lo usa en `getActiveStyleProfile`.
  - Prompt: reglas "mejor versión de esta misma persona", sin puntuaciones de atractivo, sin análisis médico, recomendaciones concretas y aplicables; bloque por bloque con límites. `PROMPT_VERSION` `2026-09-30.2`; el mensaje de usuario manda `schema_version: 2`.
  - Fixture v2 completo (+ `FIXTURE_STYLE_PROFILE_V1`), mock (tatuajes vacíos con `COVER`) y seed (núcleo + `style_advice`).
  - Tests: schema (temas, límites, sin puntajes, split), `parseStoredStyleProfile` (v1, v2, sin asesoría, inválido), OpenRouter con fake fetch (schema estricto v2, `schema_version: 2`), prompt, RLS de `style_advice` (free con JWT no lee, Premium sí, otro usuario no, anon no, nadie escribe, FK compuesta), lectura v1 contra la base y pipeline (3 looks + asesoría guardada).
  - `turbo.json`: `test:integration` depende de `^test:integration` (db → worker en serie).
  - Script de prueba real `apps/worker/scripts/real-style-analysis.ts` (análisis con las fotos, 3 LookSpecs, guardado para un usuario local nuevo y lectura free/Premium con su JWT; `--schema-check` sin fotos).
  - Docs: `AI_PIPELINE.md`, `DATA_MODEL.md`, `SECURITY_PRIVACY.md`; decisiones D1–D4 y D23 en `DECISIONES.md`.
- Prueba real:
  - `real-style-analysis.ts --schema-check` contra OpenRouter: `google/gemini-3.8-flash` aceptó el JSON Schema estricto v2 (5956 bytes, 80 propiedades, 3 `anyOf`) y la respuesta validó con `StyleProfileSchema`: 1049 tokens in / 2815 out, USD 0.0112, 20 s. Sin fotos: el contenido no es un análisis de una persona real, solo prueba la gramática y el tamaño de salida.
  - **Bloqueado:** el análisis real con fotos no se pudo correr. `ls ~/asesor-fotos-prueba/` → "No such file or directory"; el script sale con "Falta /Users/pablocarvalho/asesor-fotos-prueba/cuerpo.jpg".
- Qué tiene que hacer el usuario: poner las fotos de prueba autorizadas (una persona que lo autorizó o una persona ficticia generada con IA), en JPEG y de hasta 5 MB cada una, en `~/asesor-fotos-prueba/cuerpo.jpg` (cuerpo entero) y `~/asesor-fotos-prueba/cara.jpg` (rostro).
- Cómo se comprueba: `ls -la ~/asesor-fotos-prueba/cuerpo.jpg ~/asesor-fotos-prueba/cara.jpg` lista los dos archivos. La sesión que retome el paso corre `pnpm --filter @asesor/worker exec tsx --env-file-if-exists=../../.env scripts/real-style-analysis.ts` (~USD 0.05) y cierra con ✅ si imprime "StyleProfile v2 validado con Zod", el costo, "Free (su JWT): … asesoría no" y "Premium (su JWT): asesoría sí, completa". Después cita 3–5 recomendaciones reales en el log, revisadas como concretas y aplicables.
- Verificación: format ✓ · lint ✓ · typecheck ✓ · test ✓ (94 unit, 21 integración ejecutados: db 18, worker 3) · build ✓ · e2e ✓ (10, desktop + mobile, contra `pnpm dev`) · db:reset ✓ · db:types ✓ · navegador: con `free@asesor.test`, `/app/profile` muestra el núcleo v2 ("smart casual cálido", colores, fortalezas, mejor evitar) y `/app/dashboard` marca "Análisis de estilo · Listo"
- Decisiones: D1, D2, D3, D23 confirmadas; D4 confirmada en datos, con un ajuste: los bloques v1 que la UI no mostraba (pelo, grooming, proporciones, ropa, fits, materiales, calzado, accesorios, tatuajes) también son Premium. Mediciones en `DECISIONES.md`.
- Para pasos siguientes:
  - Paso 02: la UI usa `getActiveStyleProfile` de `@asesor/db` (`profile` + `advice`). `advice` puede venir no-null para un free con perfil v1 (se lee de `profile_json`): `selectAdviceForPlan` tiene que filtrar por plan igual. Premium con perfil v1 ve la asesoría nueva vacía: mostrar "aparece en tu próximo análisis".
  - Chat (sin UI todavía): necesita el perfil completo; leerlo con service role y `mergeStyleProfile`, o `upgradeStyleProfileV1` para v1.
  - `getActiveStyleProfile` de la web ahora lanza `AppError` si la consulta falla (antes devolvía null).
  - Otra sesión de Claude ("Configuración inicial del monorepo") tenía la app corriendo en este mismo directorio y relanzaba el worker: en una corrida de `pnpm test` ese worker tomó jobs de `jobs.int.test.ts` (2 fallos; aislado, 18/18 tres veces). Esa sesión cambió el script `dev` del worker a `node --watch --import tsx` (commit aparte `chore(worker)`, aprobado por el usuario), así que el `pgrep` de la verificación ahora busca los dos patrones. Antes de testear, confirmar que no haya otra sesión con el worker prendido.
- Commit: `wip(asesoria-shopping): paso 01 — bloqueado: fotos de prueba autorizadas`
