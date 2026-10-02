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
5. **Leer:** este README completo, el archivo del paso (mostrá su "Hecho cuando" con `sed -n '/^## Hecho cuando/,$p' <archivo>`), `DECISIONES.md`, `TIENDAS_UY.md` si el paso es de shopping, `docs/DESIGN_SYSTEM.md` si el paso toca la UI, las secciones de `SPEC.md` que cita, y lo que indique de `/docs` y del código. Los datos del relevamiento son del 2026-09-30: verificalos contra el código actual, porque un paso anterior pudo cambiarlos.
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
- **UI:** si tocaste la UI, corré además `pnpm test:e2e`. Con `pnpm dev` corriendo, usá `PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm test:e2e`, porque no pueden correr dos `next dev` en el mismo directorio. Playwright levanta su propio worker con `AI_PROVIDER=mock SHOPPING_PROVIDER=mock` (paso 12a): apagá antes cualquier otro worker y revisá que no haya jobs en cola.
- **Migraciones nuevas:** `pnpm db:reset` (aplica todo desde cero + seed) y `pnpm db:types` (CI compara `packages/db/src/database.types.ts`). `db:reset` borra y recrea los usuarios del seed.
- **UI en el navegador:** verificala con el panel de Claude, en desktop y mobile, con un usuario free y uno Premium. Para `preview_start`, creá `.claude/launch.json` con `"runtimeExecutable": "bash"` y `"runtimeArgs": ["-lc", "source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm dev"]`, `"port": 3000`. `.claude/` queda excluido de git (punto 2 del protocolo).
- **Integraciones reales** (IA, tiendas): además de los tests con mocks o fixtures, cada paso que integra algo real incluye una **prueba real** documentada en el log (qué se corrió y qué devolvió).
- **Scripts de prueba real:** van en `apps/worker/scripts/`, que ya tiene `tsx` y arma las dependencias reales (proveedores, cache, cliente de búsqueda web). Se corren con `pnpm --filter @asesor/worker exec tsx --env-file-if-exists=../../.env scripts/<x>.ts`. Nunca como `*.test.ts`: `packages/shopping` no tiene config de vitest y todo `*.test.ts` entra en `test:unit`, que corre en CI sin red.

## Entorno y datos de prueba

- **IA real ya activa:** `.env` tiene `AI_PROVIDER=openrouter`, así que todo worker que levantes usa IA paga. Para pruebas de shopping sin costo de IA, usá `AI_PROVIDER=mock SHOPPING_PROVIDER=live pnpm worker:dev` (las variables exportadas ganan sobre `--env-file`). En E2E no hace falta: `playwright.config.ts` levanta el worker con `AI_PROVIDER=mock SHOPPING_PROVIDER=mock`. Costo de referencia: ~USD 0.10 por análisis free, ~0.24 Premium.
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
| 01  | [Asesoría: schema, prompt y persistencia](pasos/01-asesoria-schema-prompt.md)                      | 1–5            | —          | ✅     |
| 02  | [Asesoría: UI, Free/Premium y detalle de look](pasos/02-asesoria-ui-detalle-look.md)               | 6              | 01         | ✅     |
| 02b | [Perfil visual: los datos que pide el diseño](pasos/02b-perfil-visual-datos.md)                    | 1–6            | 01, 02     | ✅     |
| 03  | [Shopping: queries desde el LookSpec y búsqueda real](pasos/03-shopping-queries-busqueda.md)       | 7–9            | —          | ✅     |
| 04a | [Shopping: fetcher seguro, extracción y normalización](pasos/04a-fetch-extraccion.md)              | 10–11          | 03         | ✅     |
| 04b | [Shopping: adaptadores de talles/stock, validación y locales](pasos/04b-adaptadores-validacion.md) | 10–11          | 04a        | ✅     |
| 05  | [Shopping: ranking y cache persistente](pasos/05-shopping-ranking-cache.md)                        | 12–13          | 04b        | ✅     |
| 06  | [Shopping: jobs reales, progreso y Premium server-side](pasos/06-shopping-jobs-premium.md)         | 14, 19         | 05         | ✅     |
| 07  | [Talles, CTA "Encontrar este look" y progreso](pasos/07-talles-cta-progreso.md)                    | 16, 15         | 02, 06     | ✅     |
| 08  | [UI de resultados de shopping](pasos/08-resultados-ui.md)                                          | 15             | 07         | ✅     |
| 09  | ["Buscar más barato"](pasos/09-buscar-mas-barato.md)                                               | 17             | 08         | ✅     |
| 10a | [Carrito: datos y acciones](pasos/10a-carrito-backend.md)                                          | 18             | 06         | ✅     |
| 10b | [Carrito y favoritos: UI y prueba real](pasos/10b-carrito-ui.md)                                   | 18             | 08, 10a    | ✅     |
| 11  | [Auditoría: analytics, fallas parciales y seguridad](pasos/11-auditoria-analytics-errores.md)      | 20             | 09, 10b    | ✅     |
| 12a | [Tests E2E de los flujos nuevos](pasos/12a-e2e.md)                                                 | 21             | 11         | ✅     |
| 12b | [Prueba real de punta a punta (15 criterios)](pasos/12b-prueba-real.md)                            | 21             | 12a        | ⬜     |
| 13  | [Documentación, auditoría final y resumen](pasos/13-docs-auditoria-final.md)                       | 22–23          | 12b        | ⬜     |

- Los pasos 01–02 (asesoría) y 03–06 (motor de shopping) son independientes entre sí: si uno queda ⛔, se sigue con el otro.
- **UI base (2026-10-01):** la app sigue el diseño "Espejo", opción 2 (`docs/DESIGN_SYSTEM.md`). Cada paso con UI se construye sobre esas pantallas y respeta "Diferencias con el mockup" (nada de puntajes, porcentajes ni medidas inventadas). El paso 02b agrega los datos cualitativos que el diseño necesita y el análisis todavía no produce.
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

### Paso 01 — Asesoría: schema, prompt y persistencia · 2026-09-30 · ✅

- Hecho: se destrabó el bloqueo. Fotos autorizadas (persona ficticia generada con IA) convertidas de PNG a JPEG en `~/asesor-fotos-prueba/cuerpo.jpg` y `cara.jpg`. Sin cambios de código.
- Prueba real: `real-style-analysis.ts` contra OpenRouter (`google/gemini-3.8-flash`): "StyleProfile v2 validado con Zod; 3 LookSpecs validados". ANALYZE_STYLE_PROFILE 3215 in / 3716 out, USD 0.0162, 23 s; GENERATE_LOOK_SPECS 8411 in / 9481 out, USD 0.0414, 36 s; total USD 0.0576. Guardado style_profile + 3 looks; "Free (su JWT): núcleo sí, asesoría no"; "Premium (su JWT): asesoría sí, completa".
- Recomendaciones reales (revisadas como concretas y aplicables):
  - Pelo · laterales: "Rebaje progresivo con peine 3 a 4 sin rapar a piel".
  - Barba: "Barba corta de 3 a 4 mm recortada semanalmente" y "Línea de cuello despejada a dos dedos sobre la nuez".
  - Ropa · pantalones: "Straight fit con caída limpia sobre el empeine".
  - Consejo: "Ajustar el ruedo de los jeans para que caigan limpios sobre los championes blancos sin arrugarse".
- Verificación: sin cambios de código desde la sesión anterior (ver entrada ⛔).
- Commit: `feat(asesoria-shopping): paso 01 — asesoría: schema, prompt y persistencia`

### Paso 02 — Asesoría: UI, Free/Premium y detalle de look · 2026-09-30 · ✅

- Hecho:
  - `selectAdviceForPlan(profile, advice, isPremium)` + `buildAdviceSections` en `packages/shared/src/advice-view.ts` (puro, con tests). Free: dirección de estilo, 3 "te favorece", 3 "mejor evitar", hasta 6 colores y los títulos de las 6 secciones bloqueadas; la asesoría se ignora aunque venga (perfil v1). Premium: núcleo completo + secciones sin grupos vacíos; `pendingNextAnalysis` si no hay asesoría v2.
  - `getAdviceView` (web): `getActiveStyleProfile(..., { includeAdvice: plan.isPremium })`, así que para free ni se consulta `style_advice`. Sin URLs firmadas ni trabajo caro extra en el auto-refresh.
  - `StyleAdvice` (Server Component) en `/app/looks`, debajo de la grilla: ✓/× con `sr-only`, `Swatches`, indicaciones al peluquero destacadas con `CopyButton`, secciones en 2 columnas (desktop) y bloqueadas con candado + blur + CTA a `#premium` (free).
  - `/app/looks/[id]`: imagen/concepto (`LookCard`), prendas por slot (`listLookGarments`: color, fit, material, patrón), fit general y notas, pelo y grooming, "por qué te queda" y "evitá". Bloqueado → card bloqueada + `PaywallCard`; ajeno, inexistente o id inválido → 404. Lugar marcado para el CTA del paso 07. `LookCard` y `LockedLookCard` linkean al detalle (toda la card).
  - Analytics: `style_advice_viewed` en `ANALYTICS_EVENTS` y `CLIENT_ANALYTICS_EVENTS` (`plan`, `sections_visible`, `sections_locked`); el detalle emite `free_look_viewed` / `premium_look_viewed` / `locked_look_clicked` (`position`). `TrackEvent` acepta `properties`.
  - `PaywallCard`: beneficio "Asesoría de imagen completa". `docs/PRODUCT_SPEC.md`: flujo, MVP y tabla Free vs Premium (teaser vs asesoría completa).
- Campo → sección (Premium):

  | Campo del StyleProfile                                                                                                                                           | Sección                               |
  | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
  | `strengths`                                                                                                                                                      | Te favorece                           |
  | `avoid`                                                                                                                                                          | Mejor evitar                          |
  | `colors.best`, `neutrals`, `avoid`                                                                                                                               | Colores                               |
  | `style_direction.primary`, `keywords`                                                                                                                            | Título de la asesoría                 |
  | `hair.recommended_cut`, `recommended_length`, `sides`, `recommended_styles`, `texture_tips`, `styling`, `avoid`, `barber_instructions`                           | Pelo (peluquero destacado y copiable) |
  | `grooming.facial_hair.recommended/avoid`, `eyebrows`, `recommendations`, `avoid`                                                                                 | Grooming                              |
  | `clothing.recommended_categories`, `recommended_silhouettes`, `pant_cuts`, `lengths`, `layering`, `avoid`; `fits`; `materials`; `body_proportions.balance_notes` | Ropa y fit                            |
  | `shoes.recommended/avoid`, `accessories.recommended`, `jewelry`, `eyewear`, `avoid`                                                                              | Calzado y accesorios                  |
  | `tattoos.suggestions`, `placements`                                                                                                                              | Tatuajes                              |
  | `general_advice`                                                                                                                                                 | Consejos generales                    |

  No se muestran (datos de análisis, no consejos): `appearance`, `hair.color/texture/length/current_style`, `grooming.current`, `clothing.current_style`, `body_proportions.frame`, `tattoos.present/visible_areas/preference`, `colors.season`, `style_direction.risk_level/secondary`. El test "cada ítem de la asesoría aparece en alguna sección" lo cubre.

- Prueba real (navegador, dev server local):
  - Premium (`demo@asesor.test`), desktop 1280 y mobile 375: las 6 secciones, peluquero con "Copiar", sin scroll horizontal (`scrollWidth` = `innerWidth`). Detalle del look 2 desde la card: prendas, pelo, grooming, por qué y evitar.
  - Free (`free@asesor.test`), desktop y mobile: teaser (2 fortalezas, 2 evitar, 4 colores) + 6 secciones bloqueadas + CTA + paywall. Look 1 → detalle completo; looks 2 y 3 → paywall.
  - Fuga: como free, HTML y payload RSC (`RSC: 1`) de `/app/looks` y de los detalles de los looks 2–3 sin ningún texto Premium (peluquero, calzado, barba, cejas, joyería) ni del spec de los looks 2–3 del propio free (`sweater de punto fino`, `camisa de lino cuello cubano`, sus `reasoning`). Solo aparece el nombre del look bloqueado, como antes.
  - `analytics_events`: `style_advice_viewed` `{plan: FREE, sections_visible: 0, sections_locked: 6}` y `{plan: PREMIUM, sections_visible: 6}`, `premium_look_viewed` y `locked_look_clicked` `{position: 2}`. En dev cada evento sale dos veces (StrictMode), igual que `paywall_viewed`.
  - El perfil real del paso 01 no se pudo revisar: el script borra su usuario al terminar (privacidad). Queda para 12b.
- Verificación: format ✓ · lint ✓ · typecheck ✓ · test ✓ (101 unit, 21 integración ejecutados: db 18, worker 3) · build ✓ (`/app/looks/[id]` dinámica) · e2e ✓ (10, desktop + mobile, contra `pnpm dev`)
- Decisiones: D4 confirmada en UI; D5 confirmada; D20 aplicada a `style_advice_viewed` y a los eventos de look.
- Para pasos siguientes:
  - Paso 07: el CTA "Encontrar este look" va en `apps/web/src/app/app/looks/[id]/page.tsx` (comentario "Paso 07"). `getLook` en `apps/web/src/lib/data.ts` devuelve el spec solo si la RLS lo deja leer.
  - `notFound()` bajo `/app` responde 200 con la UI de 404 (streaming por `app/app/loading.tsx`); comportamiento previo, no se cambió.
  - Paso 12a: sumar E2E de asesoría (free ve bloqueadas, Premium ve peluquero) y del detalle bloqueado.
- Commit: `feat(asesoria-shopping): paso 02 — asesoría: UI, Free/Premium y detalle de look`

### Paso 03 — Shopping: queries desde el LookSpec y búsqueda real · 2026-09-30 · ✅

- Hecho:
  - `packages/shared`: `UserSizesSchema`, `sizeKindForCategory`, `sizeForCategory` (`sizes.ts`); `buildShoppingQueries`, `buildSearchTerms`, `isRelevantCandidate`, `audienceForProfile`, sinónimos y alias (`shopping-query.ts`). `ShoppingQuerySchema` + `slot`, `search_terms`, `audience`, `strict_max_price` (aditivo, con defaults).
  - `packages/shopping/src/providers`: `PoliteHttpClient` (UA identificable, robots.txt cacheado, timeout, 2 por host, tope de tamaño, anti-SSRF), `parseRobots`/`isAllowedByRobots`, `STORE_REGISTRY` (13 tiendas como datos) + `BLOCKED_DOMAINS`, adaptadores Fenicio/VTEX/Shopify/Woo con Zod, `detectPlatform`, `SitemapIndex`, `OpenRouterWebSearchClient` (`openrouter:web_search`), `RegistrySearchProvider`, `DiscoverySearchProvider`, `CompositeSearchProvider`, `HttpProductFetcher` y `createLiveShopping`. `zod` agregado a `@asesor/shopping` desde el catálogo.
  - Worker: `SHOPPING_PROVIDER=mock|live` (default `live`, `mock` prohibido en producción), `SHOPPING_BOT_CONTACT` opcional; `.env.example` y `turbo.json` (`SHOPPING_*`).
  - Script `apps/worker/scripts/real-shopping-search.ts` (`[look-N] [--no-discovery]`).
  - Docs: `SHOPPING_ENGINE.md` (búsqueda, fuentes, reglas), `ARCHITECTURE.md`, `SETUP_STATUS.md`, `TIENDAS_UY.md` (verificado en el paso 03), `DECISIONES.md` (D6, D8, D15).
- Prueba real (`real-shopping-search.ts`, público hombre, talles M/42/42):
  - Look 1 sin descubrimiento: 9 tiendas del registro en 24 s (Legacy, Hering, Indian, La Isla, Zooko, Stadium y BAS por sitemap, Jack & Jones, Decathlon), plataformas FENICIO, VTEX (BAS), SHOPIFY.
  - Look 1 con descubrimiento (5 prendas): **25 tiendas**, plataformas **FENICIO, VTEX, SHOPIFY**, **16 fuera del registro** (uniformandco.uy, minot.uy, amadeuspde.com.uy, ganbaru.com.uy, kiabi.uy, jeanvernier.com.uy, harrington.com.uy, brooksfield.com.uy, tienda.soysantander.com.uy, rusty.uy, …), USD 0.0531, 61 s. Santander se detectó como Fenicio y se buscó con el adaptador (`discovery+platform:fenicio` → "Sobrecamisa Gamuza - Camel").
  - Look 3 con descubrimiento, después del último cambio de pertinencia: **24 tiendas, 14 fuera del registro**, FENICIO/VTEX/SHOPIFY, USD 0.0317, 27 s; 2 fallas parciales toleradas (404 en páginas citadas por el buscador).
  - Pertinencia, ejemplos reales: camisa oxford → "CAMISA OXFORD LISA - Blanco" (Legacy), "Camisa Oxford - Blanca" (Amadeus, fuera del registro); pantalón chino verde → "PANTALÓN MODELO CHINO SLIM - VERDE" (Hering), "Pantalón chino slim VERDE" (Kiabi); bermuda de sastrería → "Bermuda Valentin - Crudo" (Canva Store); zapatillas blancas de cuero → "Championes Superstar" (Adidas, VTEX), "championes de hombre lotto tennis cuero blanco" (Stadium, sitemap).
  - Ruido conocido para los pasos 04–05: alguna página de categoría citada por el buscador (`uy.hm.com/hombre/pantalones/chinos`), productos de otro color (el color se puntúa en el ranking) y un "reloj despertador" de BAS para "reloj" (la categoría se valida al extraer).
- Verificación: format ✓ · lint ✓ · typecheck ✓ · test ✓ (137 unit, 21 integración ejecutados: db 18, worker 3) · build ✓ (web + `@asesor/worker` bundle) · e2e — (no hay cambios de UI)
- Decisiones: D6, D8 y D15 (dominio) confirmadas; detalle y costos en `DECISIONES.md`.
- Para pasos siguientes:
  - 04a: las candidatas de Fenicio no tienen JSON-LD (microdata); `extractProduct` hoy solo lee JSON-LD, así que con `live` el worker todavía no devuelve productos. `CandidateUrl` trae `title`, `source` y `platform` para elegir extractor. Descartar páginas de categoría y 404.
  - 04a/04b: `HttpProductFetcher` ya usa `PoliteHttpClient` (robots, UA, tope de tamaño); falta lo específico de producto (content-type, límites, redirects entre dominios).
  - 05: el ranking tiene que pesar el color: los adaptadores traen el producto pertinente aunque sea de otro color.
  - 06: el job tiene que armar las queries con `buildShoppingQueries` (audience con `audienceForProfile`) y registrar el costo de descubrimiento (`onCost`, ~USD 0.01 por prenda) en `ai_usage` o similar.
  - 09: `strict_max_price` ya existe en la query.
- Commit: `feat(asesoria-shopping): paso 03 — queries desde el LookSpec y búsqueda real`

### Paso 04a — Shopping: fetcher seguro, extracción y normalización · 2026-10-01 · ✅

- Hecho:
  - **Fetcher endurecido** (`packages/shopping`):
    - `isSafeProductUrl` (`net.ts`): suma `localhost.`, `*.localhost`, `.local`/`.internal`/`.lan`/`home.arpa`, nombres de una etiqueta (servicios Docker), CGNAT, 0/8, rangos reservados en cualquier notación de IPv4, IPv4 mapeada y puertos no estándar.
    - `createSafeTransport`: `node:http(s)` con `lookup` que rechaza si alguna IP resuelta no es pública (IPv4/IPv6); el socket usa la IP validada, sin ventana de DNS rebinding. Descomprime gzip/deflate/br.
    - `PoliteHttpClient`: redirects manuales (hasta 5) revalidados por SSRF y por el robots.txt del destino; tope de 6 MB medido mientras lee (corta y cierra); timeout + `AbortSignal` del que llama; ritmo por dominio (2 simultáneos, uno cada 300 ms, `www.` = mismo dominio).
    - `HttpProductFetcher.fetch(url, { signal })` solo acepta HTML (`NotHtmlError`). `ProductFetcher.fetch` recibe `FetchOptions`.
  - **Extracción en cascada** (`html.ts` + `extract.ts`): una pasada SAX con `htmlparser2` (JSON-LD, metas, microdata anidada). JSON-LD `Product`/`ProductGroup` (`@graph`, `mainEntity`, `hasVariant`, `AggregateOffer`, un `Offer` por variante, `priceSpecification`, `ImageObject`, migas de pan), precio = menor oferta disponible, disponibilidad agregada ("alguna variante disponible"); microdata schema.org (convertida a la forma del JSON-LD); OpenGraph/`product:*` solo si la página es de producto. `RawProduct.sources` dice de qué fuente salió cada dato. Listados, categorías, no-HTML, 404 y JSON-LD roto → `null`.
  - **Normalización** (`normalize.ts` + `vocabulary.ts`): `parsePrice` (`1.890,00`, `1,890.00`, `6.390`, `1,499`, `UYU 1.690`, `4690.00`, `1490.000`; 0 → sin precio), `parseCurrency`/`currencyInText` (un `$` solo no alcanza), `inferCategory` por el primer sustantivo del título con plurales y términos de Uruguay (+ categoría declarada y migas; "pantalón de jean" → JEANS, "reloj despertador" → OTHER), `inferFit` explícito (título o descripción con contexto), `inferColors` (vocabulario en español, segmentos finales tipo Fenicio, sin nombres de fantasía), `inferMaterials`. `normalizeProductResult` devuelve el producto o el motivo (`no_title`, `no_price`, `unsupported_currency`, `invalid`).
  - **Ids**: `Product.id` = `productGroupID`/`productID` o la URL (el SKU no es único: H&M usa `"1"`); `ProductSchema.id` hasta 500. Variantes: `?variant=` de Shopify o SKU; sin ninguno se descartan (nunca el índice).
  - **Fallas y fechas**: `loadCandidate(s)` → `CandidateOutcome` por candidato; `ShoppingResult.stats` (`shared`, aditivo): `candidates`, `products`, `blocked`, `gone`, `failed`, `not_product`, `no_price`, `invalid`. `refreshProduct` → `verified | gone | failed`; solo `verified` renueva `fetched_at` (las fallas dejan `UNKNOWN` y la fecha anterior). Worker: `SEARCH_PRODUCTS` devuelve `stats` y `REFRESH_PRODUCT` el `status`.
  - **Parser**: `htmlparser2` ^12.0.0 en `catalog` (D24), `pnpm-lock.yaml` actualizado, bundle del worker 1,69 MB.
  - **Tests** (153 en `@asesor/shopping`): `net.test.ts` (22 URLs inseguras una por una, 17 IPs no públicas, DNS a IP privada, transporte real contra un servidor local), `http.test.ts` (redirect a metadata, a `localhost.` y a CGNAT, robots del destino, bucles, tamaño declarado y en streaming, timeout, `AbortSignal`, ritmo y concurrencia por dominio, solo HTML), `extract.test.ts` (fixtures reales recortados: Fenicio Legacy y Hering, VTEX Adidas y BAS, Shopify Jack & Jones y Decathlon, OpenGraph, categoría), `normalize.test.ts` (precios, moneda, 22 categorías, fit, colores, materiales, motivos, ids estables) y `shopping.test.ts` (conteos de fallas; "una falla no renueva la fecha").
  - Script `apps/worker/scripts/real-product-extraction.ts [look-N] [--discovery]`.
  - Fuera del paso pero necesario para la verificación: `enqueueJob` (`packages/db/src/jobs.ts`) ya no manda `scheduled_at` con el reloj de Node cuando no hay fecha (usa el `now()` de la base). Con unos ms de desfasaje entre la Mac y la VM de Docker, `jobs.int.test.ts` fallaba 1–2 tests por corrida (`claimNextJob` → `null` justo después de encolar); se descartó un consumidor externo encolando un job a mano (siguió `QUEUED`). Después del cambio, 3 corridas seguidas 18/18.
  - Docs: `SHOPPING_ENGINE.md` (descarga segura, cascada, normalización, fallas), `SECURITY_PRIVACY.md` (requests a tiendas), `ARCHITECTURE.md`, `SETUP_STATUS.md`, `TIENDAS_UY.md` (verificado en 04a), `DECISIONES.md` (D9 y D24).
- Prueba real (`real-product-extraction.ts`, user agent `AsesorEsteticoBot/1.0`, transporte seguro):
  - Look 1 sin descubrimiento (USD 0): **59 de 59 candidatas con producto válido** (nombre, precio, moneda e imagen), **8 tiendas en 3 plataformas**, 30 s:

    | Tienda           | Plataforma | Candidatas | Válidos | Fuente    | Ejemplo                                                       |
    | ---------------- | ---------- | ---------- | ------- | --------- | ------------------------------------------------------------- |
    | decathlon.com.uy | SHOPIFY    | 12         | 12      | jsonld    | CAMISA HOMBRE TRAVEL100 · UYU 805                             |
    | bas.com.uy       | VTEX       | 10         | 10      | jsonld    | CAMISA DE VESTIR OXFORD CUADROS CRUDO · UYU 599               |
    | indian.com.uy    | FENICIO    | 9          | 9       | microdata | Camisa Mustafa - Crudo / Natural · UYU 1699                   |
    | jackjones.com.uy | SHOPIFY    | 9          | 9       | jsonld    | CAMISA CLÁSICA REGULAR OXFORD - Crockery Stripes · UYU 1299   |
    | laisla.com.uy    | FENICIO    | 7          | 7       | microdata | Camisa Rusty Volus - Crudo · UYU 590                          |
    | legacy.com.uy    | FENICIO    | 6          | 6       | microdata | CAMISA OXFORD LISA - Rosa · UYU 2490                          |
    | hering.com.uy    | FENICIO    | 3          | 3       | microdata | PANTALÓN MODELO CHINO SLIM - VERDE · UYU 2099                 |
    | stadium.com.uy   | FENICIO    | 3          | 3       | microdata | Pantalon de Hombre Adidas Tiro26L Football - Negro · UYU 2790 |

    Normalización en vivo: "PANTALÓN MODELO CHINO SLIM - VERDE" → PANTS, fit slim, verde; "Pantalon … - Negro - Blanco" → negro/blanco; "SOBRECAMISA RELAXED TEDDY" → OUTERWEAR, fit relajado; "RELOJ DESPERTADOR MULTICOLOR" (BAS) → OTHER (el ranker lo descarta).

  - Look 3 con descubrimiento (USD 0.0217, 55 s): **55 de 60 válidos en 16 tiendas**, 6 fuera del registro (Santander, Peppos, Piece of Cake, Canva Store, New Balance UY, Less is More: todas Fenicio por `X-Powered-By: MV`). Conteos: `{"candidates":60,"products":55,"blocked":0,"gone":1,"failed":0,"not_product":3,"no_price":1,"invalid":0}`: 3 páginas de categoría citadas por el buscador (Triny, Inbox, Peppos), un 404 (Pricebox) y un producto de BAS con precio `0` en JSON-LD y OpenGraph (no se muestra). Una búsqueda de OpenRouter dio 504 y se toleró.
- Verificación: format ✓ · lint ✓ · typecheck ✓ · test ✓ (261 unit —153 de shopping—, 21 integración ejecutados: db 18, worker 3) · build ✓ (`pnpm build`; worker con `htmlparser2` en el bundle) · e2e — (sin cambios de UI)
- Decisiones: D9 confirmada para 04a; D24 nueva (parser `htmlparser2`, transporte con IP validada al conectar, ids). Detalle en `DECISIONES.md`.
- Para pasos siguientes:
  - 04b: talles y stock por variante siguen sin dato (solo `size` del JSON-LD, que casi ninguna tienda trae). Para cruzar con la plataforma ya están `RawProduct.externalId` (Shopify `productGroupID`), los ids de variante `?variant=` (Shopify) y los SKU (VTEX). Decathlon pone talle y color en el nombre de la variante ("… / XS / Rojo vino"): mejor `products.json`. Validate todavía no compara el host final (después de redirects) con la tienda. BAS: precio `0` en agotados → hoy `no_price`.
  - 05: `fetched_at` solo es nuevo en `verified`: `last_fetched_at` tiene que avanzar solo con eso. El fit del producto es canónico (`slim`, `relajado`, `recto`, `ancho`, `regular`, `oversize`, `skinny`, `boxy`) y los LookSpecs escriben cosas como "entallado sin ajustar" o "relajado": el ranking necesita sinónimos. Colores en español del vocabulario; sin dato → `[]` (hoy `listScore` da 0.5).
  - 06: `SEARCH_PRODUCTS` ya devuelve `stats`; `REFRESH_PRODUCT` devuelve `status`.
  - 08: `ShoppingResult.stats` alcanza para los mensajes honestos ("no pudimos verificar algunas tiendas").
  - Al empezar la verificación había un `pnpm --filter @asesor/worker dev` prendido desde las 08:51; se apagó según el protocolo. Volver a levantarlo con `pnpm worker:dev` si hace falta.
- Commit: `feat(asesoria-shopping): paso 04a — fetcher seguro, extracción y normalización`

### Adaptación visual — diseño "Espejo", opción 2 · 2026-10-01 · ✅ (pedido del usuario, fuera de la secuencia de pasos)

- Hecho:
  - **Sistema visual** según la opción 2 del proyecto de Claude Design (`docs/DESIGN_SYSTEM.md`):
    - tokens en `globals.css` (arena con grano, musgo, arcilla, noche/bosque, vidrio, relieve, curvas de nivel, nube de puntos, orbe, animaciones con `prefers-reduced-motion`);
    - Familjen Grotesk + Geist + Geist Mono con `next/font`;
    - primitivas reescritas: `Button` con variantes `primary` oscuro, `secondary` vidrio y `light`; `Card`; `PageHeader` con `<em>`; estados.
  - **Shell:** logo con orbe; navegación "Mis looks · Mi perfil · Guardados" en riel (desktop) y barra flotante (mobile); carrito e iniciales en el header. `/app/dashboard` redirige al paso que corresponde y la cuenta pasó a `/app/profile#cuenta`.
  - **Pantallas:**
    - `/app/onboarding/photos` (2a): huecos con guías, arrastrar o elegir archivo;
    - `/app/onboarding` (2c): fotos flotando con su estado real y preferencias;
    - `/app/onboarding` en curso (2d): `AnalysisStage` con etapas reales de los jobs, hallazgos reales en `GENERATING` y `PrivateImage` para no re-descargar fotos en cada refresco;
    - `/app/looks` (2e/2g): `LookStage` 3D o baraja, `PaletteRing`, y asesoría debajo como pide el SPEC;
    - `/app/looks/[id]` (2h): pines por zona solo en `FULL_BODY`, piezas en filas de vidrio, ficha de pelo, "Por qué te queda bien" teñido;
    - `/app/profile` (2i/2j): bento de rostro, colorimetría, estilo, silueta y claves, más la cuenta;
    - paywall, login y guardados con el mismo lenguaje.
  - **Plan:**
    - paso nuevo **02b** (datos cualitativos que el diseño pide: silueta, proporciones, rasgos, razones con aspecto; sin medidas ni puntajes);
    - secciones "Diseño" en los pasos 07, 08, 09, 10b y 12a;
    - protocolo: leer `DESIGN_SYSTEM.md` en los pasos con UI.
- Prueba real (navegador, `pnpm dev` + Supabase local, sin worker):
  - con `demo@asesor.test` (Premium, renders reales) y `free@asesor.test`, en 1280 y 390 px, sin scroll horizontal y sin errores de consola: `/app/looks`, el detalle de los looks 1 y 2, `/app/profile`, `/app/onboarding`, `/app/onboarding/photos`, `/app/favorites` y `/app/cart`;
  - en el look 1, los pines caen sobre corte, abrigo, remera, jean y calzado; en el look 2 (`framing` no `FULL_BODY`) no hay pines;
  - pantalla de análisis: se encoló a mano un job para `free@` con `scheduled_at` a un día. En `ANALYZE_STYLE_PROFILE` muestra la etapa 2 de 3 con hallazgos pendientes; en `GENERATE_LOOK`, la etapa 3 de 3 con "Ovalado, contraste alto", "Subtono cálido · Otoño Profundo" y "Smart Casual Elevado". El job se borró al terminar.
- Verificación: format ✓ · lint ✓ · typecheck ✓ · test ✓ (261 unit, 21 integración ejecutados: db 18, worker 3) · build ✓ · e2e ✓ (10, desktop + mobile, contra `pnpm dev`; smoke actualizado a la navegación nueva)
- Decisiones: D25 confirmada (sistema visual y choques resueltos a favor del SPEC) y D26 propuesta (paso 02b). Detalle en `DECISIONES.md`.
- Para pasos siguientes:
  - **02b** es el próximo ⬜ ejecutable de la tabla. Si preferís seguir con shopping (04b), el orden se puede cambiar.
  - **Nombre:** el mockup usa la marca "espejo" y la app sigue con `APP_NAME` ("Asesor Estético"). Es una decisión de producto pendiente y un solo string.
  - **No implementado del diseño:** 2b (cámara guiada), 2f (antes/después), 2k (mapa del cuerpo) y "↻ Generar otras" (milestone 2).
- Commit: `feat(ui): sistema visual Espejo (opción 2) y plan adaptado al diseño`

### Paso 02b — Perfil visual: los datos que pide el diseño · 2026-10-01 · ✅

- Hecho:
  - **StyleProfile v3** (`packages/shared/src/schemas/style-profile.ts`): `appearance` suma `face_features` (hasta 2 rasgos de ≤60 caracteres), `body_shape` (`TRAPEZOID`, `INVERTED_TRIANGLE`, `RECTANGLE`, `TRIANGLE`, `OVAL`, `HOURGLASS`, `UNKNOWN`) y `torso_legs` (`LONG_TORSO`, `BALANCED`, `LONG_LEGS`, `UNKNOWN`).
    - `StyleProfileV2Schema` + lectura tolerante: v2 → v3 con `face_features: []` y `UNKNOWN`; v1 → v3. Sin nullables nuevos (D3).
    - `appearance` ya era núcleo, así que no hubo migración, cambio de `splitStyleProfile` ni de RLS (D26).
  - **Razones con aspecto** (`look-spec.ts`): `reasoning` = `{ aspect: COLOR|SILHOUETTE|FACE|HAIR|STYLE, qualifier, text }`. `StoredLookSpecSchema` lee los looks guardados con razones de texto (→ `STYLE` sin calificativo). Lo usan la web (`getLooks`, `getLook`) y el worker (`GENERATE_LOOK`).
  - **Prompts** `2026-10-01.1`: definición de cada silueta, "categorías para elegir ropa: nunca medidas, números, porcentajes ni comparaciones con un ideal", y razones con aspecto y calificativo (2 a 4, al menos dos aspectos).
  - **Fixtures, mock y seed** en v3 (+ `FIXTURE_STYLE_PROFILE_V2`).
  - **UI** (`docs/DESIGN_SYSTEM.md`):
    - `/app/profile`: rostro con rasgos; "Silueta" con el tipo y el dibujo de su categoría (notas Premium; free ve "Desbloquear con Premium"); "Proporciones" con escala de tres tramos sin números; "Tu estilo" pasa a banda. Los perfiles viejos se ven como antes (contextura o tarjeta bloqueada, sin proporciones).
    - Análisis en curso: hallazgo SILUETA ("Trapecio · piernas largas") y rasgos en ROSTRO.
    - `/app/looks/[id]`: etiqueta `ASPECTO · CALIFICATIVO`, arcilla para color, musgo para silueta y neutra para el resto.
  - **Tests**:
    - `shared` (60): enums cerrados, límites de rasgos, que el único número sea `schema_version` y que no haya claves de puntaje, porcentaje, ratio ni medida; lectura v3, v2 y v1; looks viejos con `StoredLookSpecSchema`.
    - `ai` (24): JSON Schema estricto v3 (enums de silueta y proporciones, 3 `anyOf`), schema de razones `["aspect","qualifier","text"]`, reparación si el modelo manda texto suelto, prompt.
    - Integración `rls.int.test.ts`: free con su JWT lee la silueta, las proporciones y los rasgos pero no las notas; Premium lee las notas; un perfil v2 y un look con razones de texto guardados se leen con el JWT del usuario.
    - Integración `pipeline.int.test.ts`: el análisis guarda v3 y `GENERATE_LOOK` genera la imagen de un look con el formato anterior.
  - **Script** `real-style-analysis.ts`: imprime el perfil visual y las razones; `--save-for <cuenta .test>`.
  - **Docs**: `AI_PIPELINE.md`, `DATA_MODEL.md`, `DESIGN_SYSTEM.md` (sin las filas resueltas de "Diferencias con el mockup"), `PRODUCT_SPEC.md`, `SECURITY_PRIVACY.md` y `DECISIONES.md` (D26 + notas).
- Prueba real (`real-style-analysis.ts --save-for estilo02b@asesor.test`, fotos autorizadas de una persona ficticia):
  - "StyleProfile v3 validado con Zod; 3 LookSpecs validados".
  - Costo: ANALYZE_STYLE_PROFILE 3461 in / 5238 out, USD 0.0220, 29 s; GENERATE_LOOK_SPECS 2091 in / 5995 out, USD 0.0238, 26 s. **Total USD 0.0458**.
  - Perfil visual: rostro `OVAL` · "Mandíbula definida | Frente equilibrada"; silueta `TRAPEZOID`; proporciones `BALANCED`. Coherente con la foto de cuerpo entero (hombros apenas más anchos que la cadera, piernas y torso parejos). La nota Premium dice "Hombros y cadera alineados…", un poco más cerca de `RECTANGLE`: diferencia de matiz, no contradicción.
  - Razones con aspecto (3 ejemplos):
    - look-1: `COLOR · otoño oscuro` — "El azul marino y el marfil generan un contraste medio que complementa tu tez clara y ojos marrones."
    - look-2: `SILHOUETTE · proporción balanceada` — "El tiro medio del pantalón chino respeta el largo simétrico entre torso y piernas."
    - look-2: `FACE · mandíbula definida` — "El cuello redondo prolijo despeja la mandíbula recortada y mantiene el rostro despejado."
  - Los 3 looks usan 2 o 3 aspectos distintos. Ningún calificativo trae números.
  - "Free (su JWT): núcleo sí (silueta TRAPEZOID, proporciones BALANCED, rasgos 2), asesoría no"; "Premium (su JWT): asesoría sí, completa". El usuario temporal se borró.
- Navegador (`pnpm dev` + Supabase local, sin worker):
  - **Perfil nuevo** (cuenta `estilo02b@asesor.test` con el análisis real). Free en 1280 y 390 px:
    - bento con "Ovalado · Mandíbula definida, frente equilibrada", "Silueta · Trapecio" con su dibujo y "Desbloquear con Premium", y "Proporciones · Equilibradas";
    - look 1 con "COLOR · OTOÑO OSCURO" (arcilla) y "SILUETA · CUERPO TRAPECIO" (musgo);
    - el payload RSC de `/app/profile` no trae las notas Premium y el del look 2 (bloqueado) no trae sus razones.
  - **Mismo perfil con Premium** (suscripción MOCK manual): las dos notas de la silueta y los looks 2 y 3 con razones de color, silueta, rostro y estilo, en desktop y mobile.
  - **Análisis en curso** (fotos de fixture y un job `GENERATE_LOOK` a futuro, sin worker): "SILUETA · Trapecio · proporciones equilibradas" y "ROSTRO · Ovalado, mandíbula definida, frente equilibrada.", en desktop y mobile.
  - **Perfiles v2 viejos:**
    - `free@`: silueta bloqueada como antes, sin proporciones; look 1 desbloqueado con razones "ESTILO".
    - `demo@` (Premium): "Contextura media" con 3 notas y el look 2 con razones "Estilo".
  - Sin scroll horizontal en 390 px (`scrollWidth` = `innerWidth`).
  - Al terminar se borraron el job, las fotos de fixture y la cuenta `estilo02b@`.
- Verificación: format ✓ · lint ✓ · typecheck ✓ · test ✓ (270 unit, 23 integración ejecutados: db 19, worker 4) · build ✓ · e2e ✓ (10, desktop + mobile, contra `pnpm dev`; la primera corrida falló en el alta del smoke por la compilación en frío del dev server después de `pnpm build`, y la segunda dio 10/10)
- Decisiones: D26 confirmada (reparto por `appearance`, sin RLS nueva). Enums en inglés, `UNKNOWN` como "no aplica" y razones viejas → `STYLE`. Detalle en `DECISIONES.md`.
- Para pasos siguientes:
  - 07–08: el detalle del look ya usa `ReasonCard`; las filas de piezas siguen con el lado derecho libre para el producto.
  - 12a: sumar E2E del bento (silueta y proporciones visibles para free, notas solo Premium) y de las etiquetas de aspecto.
  - 12b: revisar en la prueba de punta a punta que silueta, proporciones y notas Premium sean coherentes entre sí (en esta prueba, `TRAPEZOID` con una nota de "hombros y cadera alineados").
  - Nombre de la marca ("espejo" vs `APP_NAME`): sigue pendiente, como dejó la adaptación visual.
- Commit: `feat(asesoria-shopping): paso 02b — perfil visual: los datos que pide el diseño`

### Paso 04b — Shopping: adaptadores de talles/stock, validación y locales · 2026-10-01 · ✅

- Hecho:
  - **Talles y stock por plataforma** (`packages/shopping/src/variants.ts`, `PlatformVariantEnricher`), entre Extract y Normalize:
    - Fenicio: `#lstTalles` de la página, sin request extra (`<b>` como talle; `span.precio` de `data-varia` como precio de la variante).
    - VTEX: API de catálogo `?fq=skuId:<sku del JSON-LD>`.
    - Shopify: `/products/<handle>.js`.
    - WooCommerce: Store API por `slug`, más una consulta por variación (tope 12).
    - Cada respuesta se valida con Zod y se compara con la página (mismo path o handle). Si el adaptador falla (`blocked`, `unavailable`, `malformed`, `no_id`, `mismatch`), el producto sigue con lo de su página y lo demás queda sin verificar. `createLiveShopping` devuelve `variants` y el worker lo pasa a `SEARCH_PRODUCTS` y `REFRESH_PRODUCT` (también el `signal`).
  - **Talles normalizados** (`normalizeSizeLabel` en `packages/shared/src/sizes.ts`): letras (también brasileños P/G/GG/XG), números, `32/34`, `US 9`/`UK 8`, `ÚNICO`. `ProductVariant.size_label` (aditivo) guarda la etiqueta de la tienda.
  - **Validate** (`validate.ts`): `not_extracted`, `host_mismatch`, `blocked_store`, `invalid_price` y `foreign_store`. "Vende en Uruguay" = registro, `.uy`, UYU o evidencia en la página (`eligibleRegion`, `areaServed`, país del local, `og:locale`). `canonicalProductUrl`: `rel=canonical` de la misma tienda, sin tracking ni `?variant=`.
  - **`IN_STORE_ONLY`** (D10):
    - `ProductSchema.price` nullable solo en `IN_STORE_ONLY` (refine) y `Product.in_store` (dirección, localidad, teléfono, link) en `data_json`. La extracción lee `availableAtOrFrom` y `LocalBusiness`/`Store` de la página.
    - Migración `20261001000100_in_store_price.sql`: precio y moneda nullable con el check `products_price_known`, y trigger del carrito con error explícito para productos sin precio. `db:reset` + `db:types`.
    - Web: favoritos y admin de productos muestran "consultar en el local" si no hay precio. Ranking: precio neutro (0.5). Seed, mocks (`eligibleRegion: UY`, local físico) y fixture `FIXTURE_IN_STORE_PRODUCT`.
  - **Conteos**: `ShoppingStats.unverified_stock` y `unverified_sizes` (aditivos).
  - **Tests**:
    - `variants.test.ts` (20): fixtures reales de Legacy, Indian, Hering, La Isla, Adidas, H&M, Jack & Jones y Tiendas Montevideo. Cubren robots de BAS, `mismatch`, `no_id`, adaptador caído y Woo con variaciones que no responden.
    - `validate.test.ts` (17): URL canónica, host, EUR/ARS, precio 0, `.com.ar`, Zara, `not_extracted`, evidencias de Uruguay e `IN_STORE_ONLY` con y sin precio y con y sin ubicación.
    - `sizes.test.ts` (37).
    - Integración `products.int.test.ts` (4): el check de precio y el trigger del carrito.
  - **Script** `apps/worker/scripts/real-product-variants.ts [look-N] [--discovery] [--url …]`.
  - **Docs**: `SHOPPING_ENGINE.md` (adaptadores, Validate, `IN_STORE_ONLY`, tiendas bloqueadas, conteos), `DATA_MODEL.md`, `SECURITY_PRIVACY.md`, `TIENDAS_UY.md` y `DECISIONES.md` (D7, D9, D10).
- Prueba real (`real-product-variants.ts look-1 --url <Woo> --url <H&M>`, sin descubrimiento, USD 0): **61 de 61 productos válidos**, talles verificados en las 4 plataformas, 39 s:

  | Tienda                   | Plataforma  | Productos | Con talles | Stock disp / agot / ? | Fuente             | Ejemplo                                                                |
  | ------------------------ | ----------- | --------- | ---------- | --------------------- | ------------------ | ---------------------------------------------------------------------- |
  | decathlon.com.uy         | SHOPIFY     | 12        | 12         | 12 / 0 / 0            | shopify:product-js | CAMISA HOMBRE TRAVEL100 · S✓ M✓ L✓ XXL✗                                |
  | indian.com.uy            | FENICIO     | 9         | 9          | 9 / 0 / 0             | fenicio:html       | Camisa Mustafa - Crudo / Natural · S✓ M✓ L✓ XL✓ XXL(2XL)✓              |
  | jackjones.com.uy         | SHOPIFY     | 9         | 9          | 9 / 0 / 0             | shopify:product-js | CAMISA CLÁSICA REGULAR OXFORD - Crockery · L✗ S✓ M✓ XL✗ XXL✓           |
  | laisla.com.uy            | FENICIO     | 7         | 7          | 7 / 0 / 0             | fenicio:html       | Pantalon Rip Curl Classic Surf Chino - Verde · 30✓ 34✓ 36✓ 38✓ 40✓ 32✗ |
  | legacy.com.uy            | FENICIO     | 6         | 6          | 6 / 0 / 0             | fenicio:html       | CAMISA OXFORD LISA - Rosa · L✓ M✓ S✓ XL✓ XXL✓ XXXL✓                    |
  | hering.com.uy            | FENICIO     | 3         | 3          | 3 / 0 / 0             | fenicio:html       | PANTALÓN MODELO CHINO SLIM - VERDE · 48✓ 44✗ 40✗                       |
  | stadium.com.uy           | FENICIO     | 3         | 3          | 3 / 0 / 0             | fenicio:html       | Pantalon de Hombre Adidas Tiro26L · L✓ M✓                              |
  | tiendasmontevideo.com.uy | WOOCOMMERCE | 1         | 1          | 1 / 0 / 0             | woo:store-api      | Pantalón De Pijama Estampado · S, M, L, XL ✓                           |
  | uy.hm.com                | VTEX        | 1         | 1          | 1 / 0 / 0             | vtex:catalog       | Remera estampada de estilo vintage Loose · S✓ M✗ L✗ XL✗ XXL✗           |
  | bas.com.uy               | VTEX        | 10        | 0          | 0 / 10 / 0            | — (robots)         | —                                                                      |
  - Conteos: `{"candidates":61,"products":61,…,"unverified_stock":0,"unverified_sizes":9}`.
  - **Qué quedó sin verificar y por qué:** los talles de BAS (10 productos), porque robots.txt prohíbe `/api/` y su HTML FastStore no trae variantes (`vtex:catalog: blocked`). Su stock sí sale del JSON-LD: los 10 dicen `OutOfStock`, y en la página se ven los talles S–XXXL tachados en los 3 colores (contraste 1). Una búsqueda del registro (Stadium) se cortó por timeout y se toleró.
  - **Bug encontrado y corregido en vivo:** La Isla (`data-varia="true"`) mete el precio de la variante dentro del `<b>` del talle ("30 $ 2.990"). Ahora el `span.precio` se separa como precio de la variante. Se sumó el fixture real `fenicio-talles-laisla.html`.
  - **Contrastes a mano en el navegador:**
    - Jack & Jones "CAMISA CLÁSICA REGULAR OXFORD - Crockery Stripes" (`/products/12182486_4502398`): S, M y XXL activos, L y XL grises. Coincide con `L✗ S✓ M✓ XL✗ XXL✓`.
    - Indian "Pantalon Alvren - Verde Oliva": `#lstTalles` con S "disponible" y M, L y XL "agotado" (title "Agotado"), grises en pantalla. Coincide con `S✓ M✗ L✗ XL✗`.
  - **`IN_STORE_ONLY` real:** no apareció. Dos búsquedas web (USD 0.0183) dieron tiendas Shopify online (actitudguay.com.uy, dolceragazza.com.uy, que pasaron el pipeline como `IN_STOCK`) y directorios de locales sin datos de producto (smartservices.uy, guiadeo.com: "no es producto"). La ausencia queda documentada y el soporte, probado con fixtures, la alternativa que admite el paso.

- Verificación: format ✓ · lint ✓ · typecheck ✓ · test ✓ (344 unit, 27 integración ejecutados: db 23, worker 4) · build ✓ (worker 1,72 MB) · e2e ✓ (10, desktop + mobile, contra `pnpm dev`) · db:reset ✓ · db:types ✓ · navegador: `/app/favorites` de `demo@` con "UYU 2,290".
- Decisiones: D7 confirmada (las bloqueadas no se muestran, ni como link). D9 confirmada para 04b (plataforma, no tienda; Validate). D10 decidida: precio nullable solo para `IN_STORE_ONLY`, local en `data_json`. Detalle en `DECISIONES.md`.
- Para pasos siguientes:
  - 05: el ranking compara `normalizeText(v.size)` con el talle de la query; normalizar los dos con `normalizeSizeLabel` (hoy "Medium" del usuario no coincide con "M"). Precio `null` en `rankProducts` = 0.5 provisorio. Persistir `size_label` e `in_store` (van en `data_json`); `product_variants.size` ya viene normalizado.
  - 06: el worker ya pasa `variants` y `signal`; `SEARCH_PRODUCTS` devuelve `stats` con `unverified_*`.
  - 07: normalizar los talles que carga el usuario con `normalizeSizeLabel`.
  - 08: mensaje honesto con `unverified_stock`/`unverified_sizes`; "Disponible en tienda física" con `in_store` y sin "Comprar".
  - 10a: el trigger rechaza agregar al carrito un producto sin precio (`22023`, "has no price"): no ofrecer el botón.
  - `db:reset` recreó los usuarios del seed: se perdieron los renders y el perfil real que tenían `demo@`/`free@` en la base local.
- Commit: `feat(asesoria-shopping): paso 04b — adaptadores de talles/stock, validación y locales`

### Paso 05 — Shopping: ranking y cache persistente · 2026-10-01 · ✅

- Hecho:
  - **Ranking** (`packages/shopping/src/rank.ts`):
    - Pesos (D11): categoría 0.20, color 0.20, estilo 0.18, fit 0.12, material 0.07, talle 0.10, stock 0.08, precio 0.05. Estética 0.77 contra precio 0.05, con test.
    - Estilo: cobertura de lo que pide la prenda, con sinónimos y alias, y liso contra estampado (también en inglés).
    - Color: nombre canónico o cercanía de hex en Lab; colores de fantasía, neutros.
    - Fit y material: por familias, con contradicciones (skinny contra relaxed: 0).
    - Talle con `size_status`: `sizeMatches` entiende talles combinados (`XS/S`, `32-30`, `38 (L33)`) y un talle de otro sistema queda `UNVERIFIED`.
    - Sin precio, el producto se rankea sin ese factor; `strict_max_price` filtra; diversidad leve de tiendas.
  - **Cache de pools** (D12):
    - `searchPoolKey`/`poolQueryOf`: la clave es la prenda, sin talle, precio, límite, slot ni datos del usuario.
    - `searchProducts` guarda el pool completo y re-rankea en cada pedido; en un hit revalida los productos de más de 8 h (los 404 salen).
    - `SearchCache` inyectable: `createMemorySearchCache` para tests y `createPostgresSearchCache` en `@asesor/db`.
    - `isProductStale` y los TTL en `shared`.
  - **Migración `20261001000200_shopping_cache.sql`**:
    - tabla `shopping_search_cache`, con RLS y revokes, solo service role;
    - el único `(store_domain, external_id)` pasa a índice, porque la identidad es la URL canónica;
    - `look_products.size_status`;
    - `replace_look_products()`, atómica y solo para service role.

    `db:reset` y `db:types`.

  - **Persistencia** (`packages/db/src/shopping.ts`):
    - `upsertProducts`, idempotente por URL, y `upsertVariants`, que conserva los uuid y borra solo las variantes que desaparecen;
    - `saveLookProducts` y `getLookProducts`;
    - `getProductById`/`getProductsByIds` y `markProductVerified`/`markProductUnverified`;
    - `purgeExpiredSearchCache`.
  - **Shared**: `normalizeSizeLabel` (`32-30`, `38 (L33)`), `sizeMatches`, `sizeSystem`, `SizeStatusSchema`, `RankedProduct.size_status` (aditivo), `applyTermAliases` exportado y vocabulario "charcoal"/"carbón" → gris con `COLOR_HEX`.
  - **Tests**:
    - `rank.test.ts` (10), con pools reales grabados del pipeline (`pool-remeras-negras.json`, `pool-pantalones.json`): la lisa le gana a las estampadas aunque sea más cara; relaxed le gana a skinny; el mismo pool con XS y con 4XL da órdenes distintos; talle en stock > sin dato > agotado; otro sistema de talles → `UNVERIFIED`; filtro estricto; sin precio sin factor; color por hex; regresión de títulos reales.
    - `cache.test.ts` (6): clave sin datos del usuario; miss, hit sin buscar ni descargar y vencimiento; re-ranking por talle sobre el pool; revalidación de lo de más de 8 h; cache caída → en vivo.
    - `sizes.test.ts` (+16).
    - Integración `packages/db/test/integration/shopping.int.test.ts` (6): upsert idempotente con duplicados en el lote; variantes reemplazadas conservando uuid; mismo id externo en dos URLs sin violar únicos; `last_fetched_at` solo con verificación; reemplazo atómico; RLS de `look_products` (free no, Premium dueño sí, otro no, nadie escribe ni ejecuta la función); cache Postgres (hit, vencimiento, purga, sin datos del usuario); revokes de `shopping_search_cache`.
    - `rls.int.test.ts`: `anon` no lee `look_products` ni `shopping_search_cache`.
    - Worker `shopping-cache.int.test.ts` (1): `searchProducts` con la cache Postgres (miss, hit, re-ranking por talle, vencimiento).
  - **Script** `apps/worker/scripts/real-shopping-ranking.ts`.
  - **Docs**: `SHOPPING_ENGINE.md` (pesos y justificación, `size_status`, cache, persistencia), `DATA_MODEL.md` y `DECISIONES.md` (D11, D12).
- Prueba real (`real-shopping-ranking.ts`, look 1 "Smart casual cálido" de `demo@asesor.test`, sin descubrimiento, USD 0):
  - **Corrida 1** (cache vacía, talles M/42/42): **en vivo, 221 requests HTTP, 32 s**. Pools de 16, 24, 9, 6 y 4 productos, y 19 filas guardadas en `look_products`. Top por prenda:

    | Prenda (LookSpec)                 | 1.º                                                                     | 2.º                                                                    | Por qué tiene sentido                                                                                                                                                    |
    | --------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
    | camisa oxford crudo, regular      | Indian "Camisa Xavro - Crudo / Natural" 0.847 (color 1, talle M ✓)      | J&J "Camisa slim Oxford - White" 0.842 (estilo 1, color 0.73, fit 0.4) | Gana el color exacto (crudo) sobre una oxford blanca slim. La J&J rayada ("Stripes") salió del top: estilo 0.4.                                                          |
    | pantalón chino verde oliva, recto | J&J "Pantalón chino slim Marco - Dusty Olive" 0.880 (color 1, fit 0.4)  | Hering "Pantalón recto chino - Beige" 0.801 (fit 1, color 0.31)        | El color pesa más que el fit: un chino oliva slim reproduce el look mejor que uno recto beige. Tercero, Legacy chino de gabardina verde (material 1).                    |
    | overshirt camel, regular          | J&J "Sobrecamisa Vesterbro - Forest River" 0.790 (estilo 1, material 1) | Indian "Sobrecamisa Insani - Estampado" 0.697 (estilo 0.4)             | El pool no tiene camel: gana la sobrecamisa lisa de algodón y las estampadas bajan.                                                                                      |
    | desert boots chocolate            | Decathlon "Botines de senderismo NH500" 0.800 (talle 42 ✓)              | La Isla "Botas Blundstone 562 - Brown" 0.756 (color 1, talle 42 no)    | "desert boots" = botas. Las Blundstone y Dr. Martens marrones encajan mejor en estilo, pero no tienen 42 (`NOT_OFFERED`): el talle del usuario manda, como pide el SPEC. |
    | reloj con malla de cuero marrón   | Decathlon "Reloj cronómetro W200" 0.634                                 | Decathlon "Reloj running W500S" 0.621                                  | El pool solo tiene relojes deportivos: el ranking no puede inventar uno de cuero.                                                                                        |

  - **Corrida 2** (mismos talles, misma hora): **todo `CACHE`, 0 requests HTTP, 0 s** y el mismo top que la corrida 1 (diff vacío).
  - **Corrida 3** (talles S/40/44, mismo pool): **`CACHE`, 0 requests**, con otro orden:
    - entra La Isla "Camisa Rusty Volus - Crudo" (tiene S);
    - el chino Rip Curl verde en 40 desplaza al Hering beige;
    - la sobrecamisa Vesterbro queda `OUT_OF_STOCK` en S.

    `look_products` quedó con esos 19 resultados y su `size_status`.

  - **Arreglos que salieron de la prueba real:** "Stripes"/"Checks" no contaban como estampado (una camisa rayada quedaba primera para "camisa oxford cruda") y "desert boots" no matcheaba "botas"/"botines". Se corrigieron con un test de regresión y se repitió la corrida 1 con la cache vacía.
- Verificación: format ✓ · lint ✓ · typecheck ✓ · test ✓ (376 unit, 34 integración ejecutados: db 29, worker 5) · build ✓ · db:reset ✓ · db:types ✓ · e2e — (sin cambios de UI)
- Decisiones: D11 y D12 confirmadas, con los pesos nuevos y su justificación. Identidad de producto = URL canónica. Detalle en `DECISIONES.md`.
- Para pasos siguientes:
  - 06: el handler `SEARCH_PRODUCTS` tiene que usar `createPostgresSearchCache(db)` y `saveLookProducts(db, { lookId, slot, items })`. `REFRESH_PRODUCT` sale con `getProductById` + `refreshProduct` + `markProductVerified`/`markProductUnverified`. Para "buscar más barato" (09) alcanza con el mismo pool más `strict_max_price`.
  - 08: `look_products.size_status` dice qué mostrar ("talle sin verificar", "no hay tu talle", "agotado en tu talle"). `getLookProducts` lee con RLS.
  - 08/10a: `isProductStale` (`@asesor/shared`) antes de "Comprar" o de agregar al carrito.
  - Limitaciones conocidas: el estilo es léxico (un logo que el título no nombra no cuenta como estampado: Adidas "M Lin SJ"). Embeddings de imagen siguen en "próximos pasos". Los pools dependen de lo que las tiendas tienen: con el reloj solo hubo deportivos.
  - Base local: el look 1 de `demo@` ahora tiene en `look_products` los productos reales de la prueba (antes, los ficticios del seed); `pnpm db:seed` lo restaura. Un test de integración del worker llegó a borrar los productos del seed en una corrida intermedia: se corrigió para que use URLs propias y se re-sembró.
- Commit: `feat(asesoria-shopping): paso 05 — ranking y cache persistente`

### Paso 06 — Shopping: jobs reales, progreso y Premium server-side · 2026-10-01 · ✅

- Hecho:
  - **Migración `20261001000300_shopping_jobs.sql`** (D13, D14):
    - `jobs.progress` (jsonb nullable) y `update_job_progress(job, worker, progress)`, solo `service_role` y solo el worker que tiene el job `RUNNING`;
    - `jobs.look_id` y `jobs.garment_slot`, columnas generadas desde el payload, con `grant select (progress, look_id, garment_slot)` al dueño;
    - índice único parcial `jobs_one_active_search_idx`: una búsqueda activa por (look, prenda); la del look completo no bloquea la de una prenda;
    - `ai_operation` suma `WEB_SEARCH`.

    `db:reset` y `db:types`.

  - **Shared**: payload nuevo de `SEARCH_PRODUCTS` (`user_id`, `look_id`, `sizes` con `UserSizesSchema`, `slot?` con `GarmentSlotSchema`, `max_price?` estricto que exige `slot`), `SHOPPING_STAGES` (`SEARCHING | CHECKING_STORES | COMPARING | VERIFYING | RANKING`), `ShoppingProgressSchema` (etapa, `slots_done`/`slots_total`, resumen al final; sin porcentajes) y `ShoppingSearchSummarySchema`. `shopping_completed` en `ANALYTICS_EVENTS` (solo servidor).
  - **Motor** (`packages/shopping`):
    - `searchProducts` acepta `onStage` (frontera real de cada etapa) y `onCost`. `SearchProvider.search(query, { signal, onCost })` lleva la señal a los adaptadores de plataforma, al buscador web y a la expansión de tiendas; los sitemaps compartidos no se cortan.
    - `loadCandidates` por fases: lee todas las páginas, compara (normaliza y valida sin requests) y recién después consulta la plataforma, solo para lo que pasó.
    - No se cachea una búsqueda cortada (timeout o apagado) ni un pool vacío.
  - **Worker**:
    - `JobQueue.progress` (opcional) y `ctx.reportProgress`, best-effort;
    - `handlers/shopping.ts`: `SEARCH_PRODUCTS` real (re-verifica dueño del job, dueño del look y Premium; queries con el público del perfil del look; prendas en paralelo con la cache Postgres y timeout de 4 min; `saveLookProducts` por prenda; en una búsqueda completa vacía las prendas fallidas y borra las que ya no están en el look; si fallan todas, el job falla y lo anterior queda; resumen en `result` y en el último progreso; `shopping_completed`; costo de búsqueda web en `ai_usage`);
    - `createStageTracker`: la etapa del job es la de la prenda más atrasada (nunca retrocede), escrita solo si cambia y en orden;
    - `REFRESH_PRODUCT` real: carga por uuid, re-extrae, `markProductVerified` o `markProductUnverified`; un apagado no lo marca;
    - `index.ts` conecta `createPostgresSearchCache(db)` y el modelo del buscador web.
  - **`packages/db`**: `startLookShopping` (Premium con el cliente del usuario, dueño del look por RLS, prenda del look, una búsqueda activa con chequeo previo + índice para la carrera, prioridad 8, `maxAttempts` 2, clave `search:<look>:<slot|look>:<requestId>`), `getLatestLookSearch`, `updateJobProgress`, `removeLookProductsExcept` y `getStyleProfileCore`.
  - **Web**: `startLookShoppingAction` (`app/app/looks/[id]/actions.ts`): `requirePremium` (free → estado `paywall`, sin error técnico), Zod, rate limit `shoppingSearch` (10/hora por usuario), `startLookShopping`, `shopping_started` y `revalidatePath`. `getLookShoppingState` (`lib/shopping.ts`) lee estado y progreso con el cliente del usuario. Sin UI nueva: el CTA y el progreso visual son del paso 07.
  - **Tests**:
    - `shopping/test/stages.test.ts` (6): las cinco etapas en orden en vivo, `SEARCHING → VERIFYING → RANKING` desde la cache, señal y costo al buscador, búsqueda cortada sin cachear, pool vacío sin cachear, sin consultar la plataforma para lo descartado;
    - `worker/test/shopping-job.test.ts` (4): etapa de la prenda más atrasada, orden de guardado con una falla en el medio, resumen con fallas parciales;
    - `runner.test.ts`: progreso best-effort (una falla al guardarlo no rompe el job) y el test de handlers registrados sin `REFRESH_PRODUCT` sobre `db = {}`;
    - integración `db/test/integration/shopping-jobs.int.test.ts` (5): free rechazado sin encolar; Premium encola con prioridad, intentos y `look_id`; sin dos activas; el look completo no bloquea una prenda ni otro look; 4 pedidos simultáneos = 1 job y `23505` en la base; look ajeno, inexistente, prenda que no está e ids inválidos; `update_job_progress` rechaza a otro worker y a un job en cola; `authenticated` no la ejecuta; el dueño lee su progreso pero no `payload`; otro usuario no ve el job; nadie escribe `progress` desde el cliente;
    - `rls.int.test.ts` y `jobs.int.test.ts`: `anon` y `authenticated` no ejecutan `update_job_progress`;
    - integración `worker/test/shopping.int.test.ts` (6): look completo (productos y `look_products` por prenda, reemplazo de un producto viejo y de una prenda que ya no está, progreso en orden en `jobs.progress` con el resumen, `shopping_completed`); segunda búsqueda desde la cache con una prenda que falla (queda vacía, parcial, re-ranking por talle); una prenda con precio máximo (solo esa prenda cambia); todas fallan (el job falla y nada cambia); free, look ajeno y job de otro usuario; `REFRESH_PRODUCT` verificado, 404 y producto inexistente.

    Ningún test nuevo reclama jobs de la cola: los "en curso" se insertan o marcan a mano bajo un worker de prueba.

  - **Script** `apps/worker/scripts/real-shopping-job.ts [--keep]`.
  - **Docs**: `ARCHITECTURE.md` (progreso, referencias, timeouts, flujo de la búsqueda), `DATA_MODEL.md` (jobs de shopping, índices, RLS, función), `SHOPPING_ENGINE.md` (fases, jobs, etapas, inicio y lectura, `REFRESH_PRODUCT`, qué no se cachea), `SECURITY_PRIVACY.md` (Premium en tres lugares, rate limit), `SETUP_STATUS.md` y `DECISIONES.md`.
- Prueba real (`real-shopping-job.ts` con el worker en `AI_PROVIDER=mock SHOPPING_PROVIDER=live`, descubrimiento web activo, usuarios locales nuevos `real-shopping-premium-*@asesor.test` y `real-shopping-free-*@asesor.test` con los looks del MockAIProvider):
  - **Corrida 1** (look 1 "Smart casual cálido", M/42/42, cache vacía): encolado con `startLookShopping` y seguido como la UI (`getLatestLookSearch` con el JWT del usuario, cada 1 s):

    | Tiempo | Estado del job                                                   |
    | ------ | ---------------------------------------------------------------- |
    | +0 s   | QUEUED, sin progreso                                             |
    | +1 s   | RUNNING · SEARCHING "Buscando prendas…" · 0/5 prendas            |
    | +18 s  | CHECKING_STORES "Revisando tiendas…" · 1/5                       |
    | +32 s  | VERIFYING "Verificando precios y talles…" · 3/5                  |
    | +43 s  | COMPLETED · RANKING "Ordenando las mejores coincidencias…" · 5/5 |

    (COMPARING duró menos que el intervalo de lectura: es puro.) Resumen: `{"mode":"LOOK","slots":5,"slots_with_results":5,"failed_slots":[],"candidates":89,"products":80,"saved":20,"unverified_stock":0,"unverified_sizes":2,"partial":false,"cache_hits":0}`. Worker: 42 s. `ai_usage`: `WEB_SEARCH`, 5 búsquedas, **USD 0.0546**.

    Productos reales guardados (1.º por prenda, leídos con RLS como el dueño Premium):

    | Prenda      | Producto                                                          | Precio    | Talle          |
    | ----------- | ----------------------------------------------------------------- | --------- | -------------- |
    | top         | Indian "Camisa Xavro - Crudo / Natural"                           | UYU 1399  | AVAILABLE      |
    | bottom      | Jack & Jones "PANTALÓN CHINO SLIM TIRO MEDIO MARCO - Dusty Olive" | UYU 1299  | AVAILABLE      |
    | layering:0  | guapa.com.uy "SOBRECAMISA ANTONIO - CAMEL"                        | UYU 1498  | AVAILABLE      |
    | shoes       | Decathlon "BOTINES DE SENDERISMO IMPERMEABLES HOMBRE NH500 MID"   | UYU 2813  | AVAILABLE      |
    | accessory:0 | diego.com.uy "Reloj pulsera de hombre malla cuero sintético"      | UYU 249.9 | NOT_APPLICABLE |

    Tiendas fuera del registro por descubrimiento: guapa.com.uy, diego.com.uy, pacampania.com.uy, jeanvernier.com.uy, amadeuspde.com.uy, rusty.uy.

  - **Corrida 2** (mismo look, S/40/44, dos pedidos a la vez): "mismo job", uno con `alreadyRunning`. `cache_hits: 5`, 0 búsquedas web, 85 ms en el worker. Talles contrastados en la base: la Xavro y la sobrecamisa tienen S, el NH500 tiene 44 y el chino de J&J usa `42/30`.
  - **Segunda ejecución del script** (otro usuario nuevo): la corrida 1 salió entera de la cache (el pool es de la prenda, no del usuario; USD 0). **Corrida 3**, modo una prenda (`top`, máximo UYU 1500 estricto): `{"mode":"SLOT","slots":1,"saved":4,"cache_hits":1,…}`; salen la J&J slim (UYU 1699) y la Amadeus (UYU 3290) y entran Kiabi (UYU 1199) y Minot "CAMISA MARU CRUDO" (UYU 800); las otras prendas no cambian. **`REFRESH_PRODUCT`** de la Xavro: `{"status":"verified","availability":"IN_STOCK"}`, `last_fetched_at` 17:35:41 → 17:37:11.
  - **Usuario free**: `startLookShopping` → `PREMIUM_REQUIRED`; "jobs del usuario free: 0".
  - Todos los jobs `COMPLETED` en el primer intento, sin `last_error`. Los usuarios de prueba se borraron al terminar.
- Verificación: format ✓ · lint ✓ · typecheck ✓ · test ✓ (387 unit, 45 integración ejecutados: db 34, worker 11; db antes que worker por `^test:integration`, D23) · build ✓ (worker 1,75 MB) · db:reset ✓ · db:types ✓ (regenerado sin diferencias) · e2e — (sin cambios de UI)
- Decisiones: D13, D14 y D22 confirmadas; D20 (shopping) y D21 (Premium con los jobs) confirmadas. Detalle en `DECISIONES.md`.
- Para pasos siguientes:
  - 07: el CTA llama a `startLookShoppingAction({ lookId, sizes, requestId })` (devuelve `queued`, `already_running`, `paywall` o `error` con texto humano). El progreso sale de `getLookShoppingState(lookId)`: `progress.stage` (los textos del SPEC están en la tabla de `SHOPPING_ENGINE.md`), `slots_done`/`slots_total` y, al terminar, `progress.summary` (`partial`, `failed_slots`, `unverified_stock`, `unverified_sizes`) para el mensaje honesto. `progress` es `null` mientras el job está en cola. Los talles hoy van en el pedido: guardarlos en el perfil y mandarlos desde ahí. La etapa COMPARING dura milisegundos: la UI no debería depender de verla.
  - 08: leer resultados con `getLookProducts` (RLS) y `look_products.size_status`; una prenda con `failed_slots` o sin productos lleva un mensaje propio.
  - 09: el modo de una prenda (`slot` + `max_price`) hoy **reemplaza** el ranking de esa prenda. Para "más baratas" hace falta guardarlas aparte (D17) y pasar `slot`/`maxPrice` a `startLookShopping`.
  - 10a: `REFRESH_PRODUCT` ya es real (`{ product_id }` → `{ status, availability }`); encolarlo o llamar a `refreshProduct` antes de agregar al carrito si `isProductStale`.
  - 11: rate limit en memoria (una instancia), como el resto.
- Commit: `feat(asesoria-shopping): paso 06 — jobs reales, progreso y Premium server-side`

### Paso 07 — Talles, CTA "Encontrar este look" y progreso · 2026-10-01 · ✅

- Hecho:
  - **Talles en el perfil** (D15): migración `20261001000400_profile_sizes.sql` con `profiles.top_size`, `bottom_size`, `shoe_size` (text nullable, 1–10) y `shoe_size_system` (`EU`|`US`, default `EU`) + `grant update` por columna. `db:reset` y `db:types`.
  - **Dominio** (`shared/sizes.ts`): `missingSizesForLook(look, sizes)` sobre `sizeKindForCategory` (sin duplicar el mapeo), `SIZE_KINDS`, `SIZE_OPTIONS` (en forma canónica) e `isSizeOption`. **Corrección:** `sizeForCategory` manda el calzado de EE. UU. como `US 9.5` (antes un 9 US se comparaba como un 9 europeo). `size_requested` en `ANALYTICS_EVENTS` y `CLIENT_ANALYTICS_EVENTS`.
  - **`packages/db`**: `getUserSizes` / `saveUserSizes` (cliente del usuario; valida contra las opciones; calzado siempre con sistema). `startLookShopping` exige los talles relevantes del look o de la prenda (`VALIDATION_FAILED` + `MISSING_SIZES`).
  - **Web**:
    - `startLookShoppingAction` pasó a ser una action de formulario: Premium (`paywall` si no), Zod, guarda los talles que trae el formulario, lee los del perfil, rate limit, `startLookShopping`, `shopping_started`; estados `queued`, `already_running`, `paywall`, `needs_sizes` y `error` con texto humano;
    - `saveSizesAction` y "Editar mis talles" en `/app/profile#cuenta`, con las filas de talles en "Tu cuenta";
    - `LookShopping` en `/app/looks/[id]` (debajo de las piezas): CTA Premium "Encontrar este look"; si faltan talles, formulario en línea solo con esos (filas de vidrio, píldoras, EU/US) y "Buscar las prendas", que guarda y encola en un paso; panel `night` con las 5 etapas del SPEC (✓ / actual / pendiente), barra por etapas, orbe y "N de M prendas listas"; resultado honesto con la hora; "Buscar de nuevo" / "Reintentar la búsqueda"; free: "Encontrá las prendas reales para recrear este look" abre el `PaywallCard`;
    - polling acotado: `GET /api/looks/[id]/shopping` cada 2,5 s solo mientras el job está activo, y un `router.refresh()` al terminar (no `AutoRefresh` de toda la ruta);
    - `SizeFields`, `StepMark` (extraído de `AnalysisStage`), `Button` `size="lg-wrap"`, etiquetas de talles y etapas en `lib/labels.ts`.
  - **Tests**:
    - `shared/test/sizes.test.ts` (+4): talles relevantes y en orden, look sin pantalón, calzado US en la query, opciones canónicas;
    - `web/src/lib/sizes-form.test.ts` (2);
    - integración `db/test/integration/profile-sizes.int.test.ts` (3): el dueño guarda de a uno y borra con null; opciones y sistema inválidos (helper y checks `23514`); otro usuario no los cambia (0 filas / `NOT_FOUND`); `role` y `country_code` siguen con `42501`;
    - `shopping-jobs.int.test.ts` (+1): sin los talles relevantes no se encola (`MISSING_SIZES`); en el modo de una prenda solo cuentan los de esa prenda.
  - **Script** `apps/worker/scripts/local-test-account.ts --email <x>.test [--premium]`: cuenta local nueva con fotos de fixture y el análisis encolado (el worker con `AI_PROVIDER=mock` genera perfil, looks e imágenes). Contraseña: la del seed.
  - **Docs**: `DATA_MODEL.md` (talles, grants), `PRODUCT_SPEC.md` (flujo de shopping), `SHOPPING_ENGINE.md` y `ARCHITECTURE.md` (action de formulario, `MISSING_SIZES`, polling), `DESIGN_SYSTEM.md` (componentes, 2h, botón `lg-wrap`), `SECURITY_PRIVACY.md` y `DECISIONES.md` (D15 + notas).
- Navegador (`pnpm dev` + worker `AI_PROVIDER=mock SHOPPING_PROVIDER=live`, cuentas nuevas `estilo07@asesor.test` Premium y `estilo07-free@asesor.test` free creadas con el script):
  1. **Sin talles** (look 1 "Smart casual cálido", 1280 px): "Encontrar este look" abrió el formulario con **solo** "Remera, camisa o abrigo", "Pantalón" y "Calzado" (el reloj no pide). Con M / 42 / 42 EU, "Buscar las prendas" guardó (`profiles`: M, 42, 42, EU) y encoló. Panel: "En la fila" → "etapa 1 de 5" → "etapa 2 de 5" con 0→3 de 5 prendas → "Búsqueda terminada · Encontramos opciones para tus 5 prendas. · En algunas opciones no pudimos confirmar si está tu talle." Job `COMPLETED`, 5 prendas con resultados, talles en el payload. Eventos: `size_requested {"kinds":"top,bottom,shoe","count":3}`, `shopping_started {"mode":"LOOK"}`, `shopping_completed` (saved 20, 5 búsquedas web).
  2. **Segunda vez** (mismo look, "Buscar de nuevo"): no pidió talles; salió de la cache (`cache_hits` 5, 0,32 s en el worker).
  3. **Otro look** (look 2 "Minimal nocturno"): "Encontrar este look" fue directo a buscar (sin formulario). Panel: "En la fila" → etapa 1 → 2 → 4 → 5 (3 de 3 prendas) → "Encontramos opciones para tus 3 prendas.", 40 s en vivo.
  4. **Usuario free** (look 1): la píldora "Encontrá las prendas reales para recrear este look" abrió "Desbloqueá tu estilo completo" en línea (`paywall_viewed`); la cuenta tiene **0** jobs `SEARCH_PRODUCTS`.

  También:
  - **Perfil:** "Editar mis talles" pasó el calzado de 42 EU a 9.5 US, después a 44 EU y a 10 US ("Talles guardados.", fila "Calzado 10 US"). Ahí apareció un bug, corregido: después de guardar, el selector EU/US quedaba en EU con la lista de US (React reinicia el formulario después de la action). El selector pasó a no controlado, lee el sistema después del reinicio y el formulario remonta los campos con los talles nuevos. Reprobado: toggle, lista y número coinciden.
  - **Mobile (390 px):** free con el CTA en dos líneas (`lg-wrap`) y el paywall; Premium con el look 3 pidiendo **solo** "Pantalón" (borrado a mano para la prueba), y el panel de progreso hasta "Búsqueda terminada · 15:18 · … tus 3 prendas". Sin scroll horizontal (`scrollWidth` 390) ni errores de consola.
  - **Calzado US real:** con 10 US, los 4 championes del look 3 (talles 39–47) quedaron `UNVERIFIED`, no "no hay tu talle".

- Verificación: format ✓ · lint ✓ · typecheck ✓ · test ✓ (393 unit, 49 integración ejecutados: db 38, worker 11) · build ✓ (`/api/looks/[id]/shopping` dinámica) · e2e ✓ (10, desktop + mobile, contra `pnpm dev`) · db:reset ✓ · db:types ✓ (regenerado sin diferencias)
- Decisiones: D15 confirmada (columnas en `profiles`, opciones cerradas, calzado con sistema, talles obligatorios para buscar). Detalle en `DECISIONES.md`.
- Para pasos siguientes:
  - 08: los resultados van en el lado derecho de cada `PieceRow` y en la tarjeta del resultado (`LookShopping`); leerlos con `getLookProducts` cuando `search.status === "COMPLETED"`. `look_products.size_status` + `progress.summary.failed_slots` para los mensajes por prenda. Imágenes de tiendas: CSP (D16).
  - 09: `startLookShopping` con `slot` exige solo el talle de esa prenda; el formulario de talles (`SizeFields`) se puede reusar con `kinds` de una prenda.
  - 12a: E2E del formulario de talles (solo los relevantes, una vez), del paywall free y del panel de progreso (con `SHOPPING_PROVIDER=mock`). El polling usa `GET /api/looks/[id]/shopping`.
  - Las cuentas `estilo07@asesor.test` (Premium, con búsquedas reales en los 3 looks) y `estilo07-free@asesor.test` quedan en la base local para el paso 08; `pnpm db:reset` las borra.
  - En desarrollo, `TrackEvent` y `PaywallCard` emiten dos veces por el doble efecto de `StrictMode` (no pasa en producción).
- Commit: `feat(asesoria-shopping): paso 07 — talles, CTA "Encontrar este look" y progreso`

### Paso 08 — UI de resultados de shopping · 2026-10-01 · ✅

- Hecho:
  - **View model** `apps/web/src/lib/look-results.ts` (puro, 9 tests): por prenda del look, RECOMENDADO + alternativas (las 3–5 opciones guardadas); precio en su moneda real (`$ 1.399`, `US$ 79`, o "Precio a consultar"); talle ("Talle M ✓", "Talle 42 agotado", "No hay talle 42", "Talle sin verificar"); stock honesto; "verificado hace X" y aviso de más de 8 h; prendas `empty` / `failed`; total por moneda sin convertir.
  - **UI** en `/app/looks/[id]` (diseño 2h):
    - cada fila de pieza muestra el RECOMENDADO (foto, "RECOMENDADO · prenda", nombre, tienda, talle · stock · verificación, precio en Familjen y chip "Comprar ↗");
    - "Ver N opciones más" abre las alternativas compactas en la misma fila;
    - local físico con "Disponible en tienda física", dirección, teléfono, "Consultar en el local" y "Ver local ↗";
    - prenda sin opciones: "No encontramos opciones para esta prenda todavía." (o "No pudimos revisar las tiendas…" si falló);
    - tarjeta con el total de los recomendados por moneda y la fecha de verificación;
    - lugares marcados para "Buscar más barato" (09) y "Agregar al carrito" (10b).

    Sin polling con resultados. Solo Premium lee (además de la RLS).

  - **Imágenes (D16):** `img-src https:` en la CSP, `<img>` con `referrerPolicy="no-referrer"`, `loading="lazy"` y respaldo de color (`ProductThumb`).
  - **"Comprar ↗":** `GET /api/products/[id]/open`, con sesión. Redirige (303) a la URL guardada del producto; si tiene más de 8 h y el usuario es Premium, antes encola `REFRESH_PRODUCT` (una vez por producto y hora). Sin open redirect.
  - **Analytics:** `product_viewed` (una vez por producto y sesión; alternativas al abrirlas) y `external_product_clicked` (`product_id`, `store_domain`, `look_id`, `slot`, `rank`) en `ANALYTICS_EVENTS` y `CLIENT_ANALYTICS_EVENTS`; `product_clicked`, que nadie emitía, se reemplazó.
  - **Talle de la búsqueda:** migración `20261001000500_look_products_user_size.sql` (`look_products.user_size` + `replace_look_products` lo guarda). `saveLookProducts({ …, userSize })` y `getLookProducts` → `userSize`; el worker pasa el talle de la query. Si el perfil cambió después, la UI lo avisa. `db:reset` y `db:types`.
  - **Tests:** `look-results.test.ts` (9); integración: `shopping.int.test.ts` de db (`userSize` guardado y leído) y del worker (cada prenda guarda su talle).
  - **Docs:** `PRODUCT_SPEC.md`, `SECURITY_PRIVACY.md` (CSP y links de productos), `DATA_MODEL.md`, `SHOPPING_ENGINE.md`, `ARCHITECTURE.md`, `DESIGN_SYSTEM.md` y `DECISIONES.md` (D16 + notas).
- Verificación con datos reales (cuenta `estilo07@asesor.test`, Premium, worker `AI_PROVIDER=mock SHOPPING_PROVIDER=live`; búsquedas de los looks 1 y 2 relanzadas desde la UI con M / 42 / 42 EU):
  - **Datos:** en los dos looks, 4 opciones por prenda (recomendado + 3), todas con foto `https` y `user_size` guardado; **0 productos `.test`**.
  - **Look 1:** 5 prendas, total "$ 7.258,90" = 1.498 + 1.399 + 1.299 + 2.813 + 249,90.
  - **Look 2:** Sweater De Punto Azul $ 1.299 · Pantalón de vestir Gris $ 2.199 · Mocasines Freeway Logan X6 $ 2.590; total "$ 6.088".
  - **Fotos:** forzando la carga en el navegador integrado (su panel oculto frena `lazy`), cargaron 20 de 20 (fcdn.app, Shopify, WooCommerce, Decathlon). Con Playwright (Chromium real, 1280 y 390 px) cargan la del render y las de los recomendados; las alternativas, al abrirlas. Sin errores de consola y sin scroll horizontal.
  - **Muestra contrastada con la tienda (3 productos):**

    | Producto (app)                                              | En la app                               | En la tienda                                                           |
    | ----------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------- |
    | Jean Vernier "Sweater De Punto Azul" (Woo)                  | $ 1.299 · Talle M ✓ · L/M/S/XL ✓, XXL ✗ | $ 1.299 (antes $ 1.899); variaciones `l/m/s/xl: stock`, `xxl: agotado` |
    | Stadium "Mocasines … Logan X6 - Marrón Chocolate" (Fenicio) | $ 2.590 · Talle 42 ✓ · 39–46 ✓          | $ 2.590 (más precios con tarjeta); talles 39–46 disponibles            |
    | Decathlon "Botas De Nieve … NH100 MID" (Shopify)            | $ 1.690 · solo 42 en stock              | `products.js`: $ 1.690; 42 disponible, 39–41 y 43–46 agotados          |

  - **Links:** "Comprar ↗" pasó por `/api/products/[id]/open` y abrió la página real (jeanvernier.com.uy, stadium.com.uy, decathlon.com.uy). Con el mocasín envejecido a 10 h: la fila mostró "verificado hace 10 h" y el aviso de más de 8 h; al abrirlo se encoló `REFRESH_PRODUCT` → `COMPLETED {"status":"verified"}` y `last_fetched_at` pasó de 08:37 a 18:38 ("verificado hace 4 min" después).
  - **Eventos:** `product_viewed` 14 veces para 14 productos distintos (sin repetidos) y `external_product_clicked` con producto, tienda, look, prenda y rank.
  - **Tienda física y prenda vacía** (sin casos reales: fixture `FIXTURE_IN_STORE_PRODUCT` puesto a mano en el reloj del look 1 y la sobrecamisa vaciada): "Sombrero panamá natural · Disponible en tienda física · Precio a consultar · Ver local ↗ · Calle Ficticia 1234, Montevideo · Tel. …"; "No encontramos opciones para esta prenda todavía."; el total pasó a "Recomendados con precio (3 de 4)… $ 5.511". Después se restauró con una búsqueda nueva (5 × 4 opciones, 0 `.test`).
  - **Dos problemas encontrados y corregidos en el navegador:**
    - con el perfil cambiado a US 10, el calzado mostraba "Talle US 10 ✓" sobre un estado calculado para 42 EU (→ `user_size`);
    - el total decía "cada moneda por separado" con una sola moneda (→ texto para "faltan precios").
  - **Nota de la prueba:** con el panel del navegador integrado oculto, forzar `loading="eager"` por JS antes de hidratar generó avisos de hidratación en `ProductThumb`. Una carga limpia no da ninguno (overlay sin issues, 0 errores de consola en Playwright).
- Verificación: format ✓ · lint ✓ · typecheck ✓ · test ✓ (402 unit, 49 integración ejecutados: db 38, worker 11) · build ✓ (`/api/products/[id]/open` dinámica) · e2e ✓ (10, desktop + mobile, contra `pnpm dev`) · db:reset ✓ · db:types ✓ (regenerado sin diferencias)
- Decisiones: D16 decidida (`img-src https:` sin proxy) y D20 confirmada para los eventos de producto. Talle de la búsqueda en `look_products.user_size`. Detalle en `DECISIONES.md`.
- Para pasos siguientes:
  - 09: "Buscar más barato" va en la fila de cada producto (comentario en `PieceResultsRow`). El modo de una prenda de `startLookShopping` reemplaza el ranking de esa prenda: hay que guardar las alternativas baratas aparte (D17) y mostrarlas en la misma fila.
  - 10a/10b: "Agregar al carrito" en la fila (comentario). La píldora "Comprar el look completo" reemplaza la tarjeta del total cuando exista el carrito, con total por moneda. Antes de agregar, revalidar si `stale` (el view model ya lo trae por producto).
  - 11: las fotos de Shopify y Fenicio vienen en 1920 px para miniaturas de 60 px; achicarlas por parámetro de la plataforma (`width=` en Shopify, segmento de tamaño en fcdn) mejora la carga.
  - 12a: E2E de resultados con `SHOPPING_PROVIDER=mock` (recomendado + alternativas, local físico, prenda vacía, link por `/api/products/[id]/open`).
  - `pnpm db:reset` de la verificación final borró las cuentas `estilo07@asesor.test` y `estilo07-free@asesor.test`; para recrearlas: `scripts/local-test-account.ts`.
- Commit: `feat(asesoria-shopping): paso 08 — UI de resultados de shopping`

### Paso 09 — "Buscar más barato" · 2026-10-01 · ✅

- Hecho:
  - **Persistencia aparte (D17):** migración `20261001000600_cheaper_alternatives.sql`.
    - `look_products.list` (`MAIN` | `CHEAPER`), `reference_product_id` y `max_price_amount` / `max_price_currency`, con un check de coherencia;
    - `replace_cheaper_look_products(...)`, solo service role: reemplaza las más baratas de una prenda, sin tocar ni repetir el ranking principal y renumerando el rank.

    `db:reset` y `db:types`. Los embeds desde `look_products` pasan a `products!look_products_product_id_fkey`, porque ahora hay dos FKs.

  - **Filtro:** precio **menor** estricto (`<`, antes `<=`) en `rankProducts`; entre monedas compara con la conversión aproximada solo para filtrar. `SearchProductsPayloadSchema.reference_product_id` (requiere `max_price`).
  - **`packages/db`:**
    - `startCheaperSearch`: Premium; el producto tiene que ser un resultado del look (RLS) y tener precio, si no `NO_PRICE`; encola el modo de una prenda con el precio como tope y el producto de referencia;
    - `saveCheaperProducts`;
    - `getLookProducts` devuelve `list` y `cheaperThan`;
    - `getSlotSearches`.
  - **Worker:** con `reference_product_id`, valida que sea un resultado de esa prenda, pide hasta 20 y saca el ranking principal y la referencia. Guarda las 4 mejores como `CHEAPER` (`CHEAPER_LIMIT`) y no toca el ranking. `shopping_completed` lleva `cheaper: true`.
  - **Web:**
    - `findCheaperAlternativeAction`: `requirePremium` (si no, `paywall`), Zod, rate limit `cheaperSearch` 20/hora, `startCheaperSearch` y `cheaper_alternative_requested` (`look_id`, `slot`, `product_id`, `price`, `currency`) una vez y desde el servidor;
    - `GET /api/looks/[id]/shopping?slot=`;
    - "Buscar más barato" (vidrio) en cada producto con precio (oculto sin precio), progreso compacto en la fila (`CheaperProgress`) y el grupo "Más baratas que $ X · frente a <producto>", con "$ N menos" o la aclaración de otra moneda;
    - estados honestos: "No encontramos opciones más baratas que conserven el estilo." y "No pudimos buscar más barato ahora";
    - view model: lista principal y más baratas separadas, y el estado de la búsqueda de la prenda (las viejas no cuentan si el look se volvió a buscar).
  - **Tests:**
    - `rank.test.ts` (+1, pool real): estrictamente menor, igual afuera, USD convertido solo para filtrar, orden por parecido;
    - `look-results.test.ts` (+2): grupo aparte, diferencia, otra moneda, total intacto; estados `running` / `empty` / `failed` / `none`;
    - integración db `shopping-jobs.int.test.ts` (+2):
      - `startCheaperSearch` encola la prenda con el precio como tope y la referencia;
      - es idempotente, incluso desde otro producto de la prenda;
      - un producto sin precio da `NO_PRICE`; uno ajeno o inexistente, `NOT_FOUND`;
      - un usuario free da `PREMIUM_REQUIRED` sin jobs;
      - las más baratas no repiten el ranking, se reemplazan y una búsqueda nueva de la prenda las descarta;
      - nadie ejecuta la función desde el cliente;
    - integración worker (+1): solo guarda la de $ 590 frente a la de referencia de $ 990 (la de $ 990 y la de $ 1.200 quedan afuera) y el ranking principal queda igual.
  - **Docs:** `SHOPPING_ENGINE.md`, `DATA_MODEL.md`, `PRODUCT_SPEC.md`, `SECURITY_PRIVACY.md`, `DESIGN_SYSTEM.md` y `DECISIONES.md` (D17 + notas).
- Prueba real (cuenta nueva `estilo09@asesor.test`, Premium, talles M / 42 / 42 EU, worker `AI_PROVIDER=mock SHOPPING_PROVIDER=live`). Búsqueda del look 1 "Smart casual cálido" desde la UI: 5 prendas × 4 resultados reales. "Buscar más barato" desde la UI en dos prendas:
  - **Camisa** (recomendada: Indian "Camisa Xavro - Crudo / Natural", **$ 1.399**). Panel "BUSCANDO MÁS BARATO · EN LA FILA" y después "Más baratas que $ 1.399 · frente a Camisa Xavro":

    | #   | Tienda           | Producto                                         | Precio  | Menos | Por qué se parece (breakdown)                               |
    | --- | ---------------- | ------------------------------------------------ | ------- | ----- | ----------------------------------------------------------- |
    | 1   | minot.uy         | CAMISA MARU CRUDO                                | $ 800   | $ 599 | categoría 1 · color 1 (crudo) · estilo 0,625 · talle M ✓    |
    | 2   | indian.com.uy    | Camisa Finae - Crudo / Natural                   | $ 1.299 | $ 100 | categoría 1 · color 1 · estilo 0,625 · talle M ✓            |
    | 3   | jackjones.com.uy | CAMISA CLÁSICA REGULAR OXFORD - Crockery Stripes | $ 1.299 | $ 100 | fit 1 (regular) · material 1 (oxford) · estilo 0,4 (rayada) |
    | 4   | decathlon.com.uy | CAMISA HOMBRE TRAVEL100                          | $ 805   | $ 594 | material 1 · estilo 0,625 · color 0,36                      |

    La Kiabi de $ 1.199, que ya estaba en el ranking principal, no se repitió.

  - **Sobrecamisa** (recomendada: guapa.com.uy "SOBRECAMISA ANTONIO - CAMEL", **$ 1.498**):

    | #   | Tienda           | Producto                                          | Precio | Menos   | Breakdown                                              |
    | --- | ---------------- | ------------------------------------------------- | ------ | ------- | ------------------------------------------------------ |
    | 1   | jackjones.com.uy | SOBRECAMISA RELAXED TEDDY LEECKER - Antique White | $ 999  | $ 499   | estilo 1 · categoría 1 · talle M ✓ · color 0,23        |
    | 2   | indian.com.uy    | Sobrecamisa Insani - Estampado 1                  | $ 399  | $ 1.099 | estilo 0,4 (estampada) · color 0,5                     |
    | 3   | indian.com.uy    | Sobrecamisa Fradel - Estampado 1                  | $ 399  | $ 1.099 | estilo 0,4 · color 0,5                                 |
    | 4   | bas.com.uy       | SOBRECAMISA SHERPA MARRÓN                         | $ 899  | $ 599   | estilo 1 · color 0,40 · talle sin verificar, sin stock |

    El orden es por parecido, no por precio: las de $ 399 (estampadas) quedan debajo de la lisa de $ 999.

  - **Base:**
    - "0 de 8" alternativas con precio ≥ tope;
    - el ranking principal sigue con 20 filas `MAIN`;
    - las dos búsquedas salieron del pool cacheado (`cache_hits` 1) en 0,48 s y 0,42 s;
    - `cheaper_alternative_requested` quedó registrado dos veces (`top` $ 1.399 y `layering:0` $ 1.498).
  - **Sin resultados** (reloj recomendado, diego.com.uy, $ 249,90): "No encontramos opciones más baratas que conserven el estilo." Lo único más barato del pool era "RELOJ DESPERTADOR MULTICOLOR" ($ 99), que el ranking descarta por categoría.
  - **Vista:** Playwright (Chromium real, 1280 y 390 px) sin errores de consola ni scroll horizontal.
- Verificación: format ✓ · lint ✓ · typecheck ✓ · test ✓ (405 unit, 52 integración ejecutados: db 40, worker 12) · build ✓ · e2e ✓ (10, desktop + mobile, contra `pnpm dev`) · db:reset ✓ · db:types ✓ (regenerado sin diferencias)
- Decisiones: D17 confirmada (lista `CHEAPER` en `look_products`, pool cacheado vía job, precio menor estricto, orden por parecido, sin duplicados). Detalle en `DECISIONES.md`.
- Para pasos siguientes:
  - 10a/10b: "Agregar al carrito" también para las más baratas (son productos como los demás; vienen en `getLookProducts` con `list: "CHEAPER"`).
  - 11: si el pool no tiene nada más barato, hoy no se busca en vivo con más candidatos (anotado en `SHOPPING_ENGINE.md`, "Próximos pasos"). Auditar que `cheaper_alternative_requested` siga saliendo solo del servidor.
  - 12a: E2E de "Buscar más barato" con `SHOPPING_PROVIDER=mock` (grupo aparte, sin duplicados, empty).
  - El `db:reset` de la verificación final borró `estilo09@asesor.test`; para recrearla: `scripts/local-test-account.ts --email … --premium`.
- Commit: `feat(asesoria-shopping): paso 09 — "Buscar más barato"`

### Paso 10a — Carrito: datos y acciones · 2026-10-01 · ✅

- Hecho:
  - **Migración `20261001000700_cart.sql`** (D18):
    - `cart_items.look_id` (FK, `on delete set null`), `garment_slot` (mismo check que `look_products`) y `purchased_at`, con el check `cart_items_look_slot` (con look, la prenda es obligatoria);
    - el único `(cart_id, product_id, variant_id)` pasó a dos índices parciales (`cart_items_look_item_key` por look y prenda, `cart_items_loose_item_key` para los sueltos); los ítems de looks borrados quedan sin único para que borrar looks nunca choque;
    - trigger de precio `before insert or update of product_id, variant_id`: sin precio rechaza al agregar (`22023`) y, al cambiar solo el talle, conserva el último precio;
    - defaults en el precio (el trigger los pisa) para que el tipo generado no los exija; grants de insert (`look_id`, `garment_slot`) y update (`product_id`, `variant_id`, `purchased_at`); políticas de insert y update con IDOR del look; revoke de la función.

    `db:reset` y `db:types`. `cart.ts` (`CartItemSchema`) alineado con la tabla; seed con look y prenda en los ítems.

  - **Dominio** (`packages/shared`): `buildCartView` (`cart-view.ts`: grupos por look en orden de posición y sueltos al final, prendas en el orden del look, precio actual del catálogo con aviso de cambio, subtotal por moneda en centésimos, comprados aparte, sin precio fuera del total, total "aprox." en pesos solo con monedas mezcladas, datos de más de 8 h marcados), `pickVariantForSize` (`sizes.ts`), `APPROX_UYU_PER_USD` movido a `constants.ts` y `product_added_to_cart` / `product_removed_from_cart` en `ANALYTICS_EVENTS` (solo servidor).
  - **`packages/db`**:
    - `cart.ts`: `addToCart` (Premium, resultado de esa prenda del look, revalidación si `isProductStale`, talle de la búsqueda, sin duplicar, avisa cambio de precio, `NO_PRICE` / `PRODUCT_GONE` / `VARIANT_GONE`), `selectCartItemVariant`, `swapCartItem` (otra alternativa de la misma prenda, principal o "más baratas"; junta si ya estaba), `removeFromCart`, `setCartItemPurchased`, `getOrCreateCart` (upsert que ignora el duplicado) y `getCartLines`;
    - `favorites.ts`: `saveFavorite` / `removeFavorite` (looks con cualquier plan, productos Premium, idempotentes);
    - `shopping-jobs.ts`: `enqueueProductRefresh` (prioridad 9, una por producto y hora; ahora también la usa "Comprar ↗") y `waitForProductRefresh` (espera hasta 8 s al worker; `verified`, `gone`, `failed` o `pending`).
  - **Web**: `app/app/cart/actions.ts` (`addToCartAction`, `removeFromCartAction`, `selectCartItemVariantAction`, `swapCartItemAction`, `setCartItemPurchasedAction`) y `app/app/favorites/actions.ts` (`saveFavoriteAction`, `removeFavoriteAction`): `requirePremium` (looks guardados: `requireAuth`), Zod, rate limit `cart` (60/min), `revalidatePath`, eventos desde el servidor y mensajes humanos; avisos de precio y verificación en `lib/cart-notices.ts`. Sin UI nueva (paso 10b).
  - **Tests**:
    - unit `shared`: `cart-view.test.ts` (10: ejemplo del SPEC $ 5.157, grupos, comprados, sin precio, monedas mezcladas, coma flotante, cambio de precio, datos viejos, vacío, orden), `pickVariantForSize` (3), `CartSchema` contra la tabla y eventos del carrito fuera de `CLIENT_ANALYTICS_EVENTS`;
    - unit `web`: `cart-notices.test.ts` (4) y `cart/actions.test.ts` (13: paywall sin tocar la lógica, eventos con sus propiedades, una sola vez, revalidación con service role, mensajes humanos, nunca el error técnico, favoritos de looks para free y de productos Premium);
    - integración `cart.int.test.ts` (22): free no crea carrito ni agrega (ni con un carrito creado por fuera); Premium agrega con el talle de su búsqueda, sin duplicar, el mismo producto en dos looks; dos pedidos simultáneos = 1 carrito y 1 ítem; IDOR de `cart_id` y de `look_id` (`42501`) y producto que no es de esa prenda; otro usuario no ve, no borra ni marca; precio del cliente rechazado (`42501` en insert y update); cambiar el talle recalcula (1.890 → 2.090) y valida la variante (también el trigger); `ALREADY_IN_CART`; local físico sin precio → `NO_PRICE` sin fila; un producto que se queda sin precio sale del total y cambiar el talle conserva el último precio; cambiar por otra alternativa (y juntar); suelto sin alternativas; comprado y su total; Premium vencido en solo lectura; revalidación `verified` (precio y fecha nuevos), `failed` (fecha intacta, `UNKNOWN`), `verified` sobre dato viejo → `unverified`, `pending`, `gone`; `waitForProductRefresh` (encola con prioridad 9 y clave por hora, espera al "worker", job fallido); lectura agrupada; borrar los 3 looks con el mismo producto deja 3 ítems sueltos;
    - integración `favorites.int.test.ts` (5): free guarda y quita su look sin duplicar; no guarda su look 2 ni uno ajeno (ni por PostgREST); productos Premium al guardar y al quitar; inexistente o id inválido.
  - **Script** `apps/worker/scripts/real-cart.ts [--quick] [--keep]`.
  - **Docs**: `DATA_MODEL.md` ("Carrito y guardados"), `SHOPPING_ENGINE.md` ("Revalidación antes de agregar al carrito"), `ARCHITECTURE.md` (flujo del carrito), `SECURITY_PRIVACY.md` (Premium, solo lectura, rate limit) y `DECISIONES.md` (D18, D19, D20).
- Prueba real (`real-cart.ts`, cuenta Premium nueva, búsqueda de registro sin descubrimiento web: USD 0; worker `AI_PROVIDER=mock SHOPPING_PROVIDER=live`):
  - Búsqueda real de la camisa y el pantalón del look 1 (8,6 s y 10,3 s, en vivo); productos envejecidos a 10 h antes de agregarlos.
  - **Con worker**, cada agregado esperó la revalidación real: Indian "Camisa Xavro - Crudo / Natural" `REFRESH_PRODUCT → verified en 2.1 s` · UYU 1399 · talle M · IN_STOCK · `last_fetched_at` 14:18 → 00:18 (UTC); Jack & Jones "PANTALÓN CHINO SLIM TIRO MEDIO MARCO - Dusty Olive" `verified en 1.8 s` · UYU 1299 · talle `42/30` · IN_STOCK.
  - Talle S de la camisa: UYU 1399, en stock. Cambio por la alternativa J&J "CAMISA SLIM MANGA LARGA OXFORD - White" (revalidada en 1,8 s): mismo ítem, UYU 1699, talle M. Pantalón marcado como comprado y camisa original guardada.
  - Carrito agrupado: "Look 1 · Smart casual cálido" con la camisa (pendiente) y el pantalón (comprado); "TOTAL APROX. pendiente: UYU 1699 · comprado: UYU 1299 · sin precio: 0". Al sacar el pantalón quedó 1 ítem.
  - **Contraste con las tiendas:** `products/12174308_3378286.js` de Jack & Jones: $ 1.299, `42-30` disponible y `42-32` no (el carrito eligió 42/30); página de Indian: microdata $ 1.399 y talles S, M, L, XL sin agotados.
  - **Sin worker** (`--quick`, Legacy "CAMISA OXFORD LISA - Blanco"): `REFRESH_PRODUCT → pending en 8.0 s`, agregado con UYU 2490, stock `UNKNOWN` y la fecha sin cambios; el job quedó `QUEUED`. Al prender el worker terminó `{"status":"verified"}` y el producto pasó a `last_fetched_at` 00:19:51.
  - **Bug encontrado y corregido en vivo:** una segunda corrida en la misma hora reusó el job ya terminado y `addToCart` informó `verified` sobre un producto envejecido a mano. Ahora un `verified` solo cuenta si el producto quedó con menos de 8 h (test de integración nuevo).
- Verificación: format ✓ · lint ✓ · typecheck ✓ · test ✓ (436 unit, 79 integración ejecutados: db 67, worker 12) · build ✓ (`/app/cart`, `/app/favorites`; worker 1,76 MB) · db:reset ✓ · db:types ✓ (regenerado sin diferencias) · e2e — (sin cambios de UI: las actions todavía no tienen pantalla)
- Decisiones: D18 y D19 confirmadas; D20 confirmada para el carrito. Producto sin precio: se rechaza con mensaje humano. Revalidación con `REFRESH_PRODUCT` y espera de 8 s. Premium vencido: solo lectura. Detalle en `DECISIONES.md`.
- Para pasos siguientes:
  - **10b:** `/app/cart` con `getCartLines` + `buildCartView` (grupos por look, "TOTAL APROX." por moneda, comprados, sin precio, "dato viejo"). Las actions devuelven `CartActionState` (`done` con `message` y `notices`, `paywall`, `error`). Agregar puede tardar hasta 8 s si el dato es viejo: el botón necesita un estado de espera ("Verificando precio y stock…"). "Agregar al carrito" va en `PieceResultsRow` (comentario del paso 08), también para las "más baratas"; "Comprar el look completo" puede llamar a `addToCartAction` por prenda (las revalidaciones corren en paralelo en el worker, 2 carriles). Premium vencido: mostrar el carrito en solo lectura con el paywall. "Comprar ↗" del carrito por `/api/products/[id]/open`. La cantidad no se usa (siempre 1; el grant existe). Guardar look (cualquier plan) en el detalle y guardar producto (Premium) en los resultados.
  - **11:** `cheaper_alternative_requested` sigue en `CLIENT_ANALYTICS_EVENTS` (el paso 09 lo emite desde el servidor): el cliente también podría mandarlo. Auditarlo junto con los demás. El rate limit `cart` es en memoria, como el resto.
  - **12a:** E2E del carrito con `SHOPPING_PROVIDER=mock` (agregar, talle, cambiar por alternativa, comprado, sacar, total; free con paywall).
- Commit: `feat(asesoria-shopping): paso 10a — carrito: datos y acciones`

### Paso 10b — Carrito y favoritos: UI y prueba real · 2026-10-01 · ✅

- Hecho:
  - **`/app/cart`** (`app/app/cart/page.tsx` + `cart-item-controls.tsx`):
    - agrupado por look ("TU LOOK · 01" con el nombre, link al look y subtotal de lo pendiente); por producto: miniatura, prenda del look, nombre, "tienda · talle · color", stock, "verificado hace X", precio en Familjen (o "Precio a consultar") y "Comprar ↗" (`/api/products/[id]/open`, `external_product_clicked`, revalida si el dato es viejo);
    - acciones: talle (selector con color y agotados, ordenado con `compareSizes`), "Ya lo compré" (tachado, fuera de lo pendiente), ♡, "Quitar" y "Cambiar por otra opción" (las opciones de la misma prenda del look, principal y "más baratas");
    - tarjeta "TOTAL APROX." por moneda, lo comprado aparte, productos sin precio fuera del total y total "aprox." en pesos con monedas mezcladas;
    - vacío con el orbe; free sin carrito: paywall; Premium vencido: solo lectura con aviso y paywall.
  - **Resultados del look:** "+ Agregar al carrito" en el recomendado, las alternativas y las "más baratas" (`AddToCartButton`: "Verificando precio y stock…" mientras revalida, "Agregado al carrito. Ver carrito", avisos honestos y "En el carrito ✓"); la píldora oscura "Agregar el look al carrito · $ total" con el ♡ grande a la derecha ("Buscar de nuevo" pasa a vidrio); contador de productos por comprar en el ícono del header.
  - **Guardados:** `FavoriteButton` (♡) en las cards de `/app/looks`, en el detalle del look y en cada producto (resultados, carrito y guardados); `/app/favorites` con los looks (render y link) y los productos (foto, tienda, stock, precio, "Comprar ↗", "Ver en el look" y "+ Agregar al carrito").
  - **Datos** (`@asesor/db`, cambios sobre 10a): `addLookToCart` (completa las prendas vacías, en paralelo; `present` y `skipped`); talle del perfil antes que el de la búsqueda; `listedPrice` y variante (talle y color) en el resultado; variantes con color en `getCartLines`. Web: `addLookToCartAction`, `lookCartSummary`, aviso de talle con otro precio, `lib/cart.ts` (contador, carrito del look, guardados, página del carrito y de guardados) y `revalidatePath("/app", "layout")`.
  - **Corrección del motor de shopping** (encontrada en la prueba real, a pedido del usuario): **se estaba recomendando ropa de mujer a un perfil de hombre** ("Camisa Xavro", de Indian). Indian estaba en el registro como `ALL` y es una tienda de mujer ("Indian | Tienda de Ropa para Mujer"): pasó a `WOMEN`. Además, el descubrimiento web ahora respeta el público de las tiendas registradas (una URL de Indian hallada por el buscador entraba igual). `POOL_VERSION` 3.
  - **Tests:** unit `compareSizes` (shared), `cart-notices` (talle con otro precio, resumen del look), actions (`addLookToCartAction`, revalidación de `/app`), regresión de Indian y de descubrimiento con una tienda de mujer (shopping); integración del carrito: talle del perfil sobre el de la búsqueda con `listedPrice` y variante, variantes con color en las líneas y `addLookToCart` (prenda ocupada, prenda vacía, local sin precio, sin duplicar con otro talle, look ajeno y free).
  - **Docs:** `PRODUCT_SPEC.md` (agregar al carrito, carrito y guardados), `DESIGN_SYSTEM.md` (componentes, 2h, carrito y guardados; sin la fila "♡ Guardar" pendiente), `SHOPPING_ENGINE.md` (público de tiendas, talle y color, look completo), `ARCHITECTURE.md`, `TIENDAS_UY.md` (público de cada tienda) y `DECISIONES.md`.
- Prueba real (cuenta nueva `estilo10b@asesor.test`, Premium, talles M / 42 / 42 EU, worker `AI_PROVIDER=mock SHOPPING_PROVIDER=live`; tres búsquedas del look 1 "Smart casual cálido" desde la UI, USD 0,134 en búsqueda web; navegador integrado en 800 y 375 px):
  1. **Una opción real de cada prenda, desde los resultados:** camisa (Indian "Camisa Xavro", después reemplazada, ver abajo), pantalón (Jack & Jones "PANTALÓN CHINO SLIM TIRO MEDIO MARCO - Dusty Olive", $ 1.299, talle 42/30), sobrecamisa (rusty.uy "SOBRECAMISA FITZ RUSTY - Camel", $ 1.790, desde "Ver 3 opciones más"), calzado (Decathlon NH500) y reloj (diego.com.uy, $ 249,90). Contador del header 1 → 5. Durante la espera se vio "Verificando precio y stock…".
     - **Aviso de revalidación:** con la camisa envejecida a 10 h, la primera vez el job de esa hora ya existía (del paso 10a) y quedó "No pudimos verificar el stock con la tienda: confirmalo antes de comprar." (correcto: el dato seguía viejo). Una revalidación nueva la devolvió a $ 1.399; el carrito mostró "Cambió el precio desde que lo agregaste: antes $ 1.599" (precio viejo simulado) hasta que se cambió el talle.
     - **Hallazgo:** el NH500 tiene el 42 en tres colores; canela ($ 2.813, el precio mostrado) está agotado y azul/negro cuestan $ 4.090. Se agregaba a $ 4.090 sin aviso: ahora la UI lo dice y el carrito muestra "Talle 42 · azul".
  2. **Cambiar talle:** camisa M → L desde el selector; el precio quedó en el real ($ 1.399) y desapareció el aviso.
  3. **Cambiar por alternativa:** NH500 (azul, $ 4.090) → Decathlon "Botas De Nieve … NH100 MID" (talle 42 · negro, $ 1.690); el NH500 pasó a la lista de opciones. Después, la camisa de Indian → Jack & Jones "CAMISA SLIM MANGA LARGA OXFORD - White" (talle M del perfil, blanco, $ 1.699).
  4. **Comprado:** el reloj quedó tachado con "Comprado ✓ · deshacer"; el contador bajó a 4.
  5. **Eliminar:** la sobrecamisa Rusty (total $ 6.178 → $ 4.388).
  6. **Guardados:** pantalón (♡ en el resultado), look 2 desde `/app/looks` y look 1 desde el ♡ del detalle; quitar el look 2 desde Guardados.
  7. **"Agregar el look al carrito":** sumó la sobrecamisa recomendada (Guapa "SOBRECAMISA ANTONIO - CAMEL", $ 1.498, `"seccion":"Hombre"`). Bug encontrado: sumó además otra camisa en M y el NH500 (prendas que ya tenían algo); corregido para completar solo prendas vacías, y se quitaron las dos desde el carrito.
  8. **Total aprox. final:** camisa J&J $ 1.699 + pantalón $ 1.299 + sobrecamisa $ 1.498 + botas $ 1.690 = **"TOTAL APROX. $ 6.186"**, "4 productos por comprar", "Ya comprado (1): $ 249,90".
  9. **Comprar ↗ (cada uno lleva a la página real):** indian.com.uy/catalogo/camisa-xavro-crudo-natural_01352477_103 (microdata $ 1.399, talles S–XL), jackjones.com.uy/products/12174308_3378286, guapa.com.uy/catalogo/sobrecamisa-antonio-camel_MA65005_43, decathlon.com.uy/products/botas-de-nieve-y-apreski-impermeables-hombre-quechua-nh100-1, diego.com.uy/…/reloj-pulsera-de-hombre-jwq86053/ y jackjones.com.uy/products/12192150_3651656 (la camisa nueva).
  10. **Persistencia:** cerrar sesión (el carrito redirige a `/login`) y volver a entrar: el carrito con los mismos productos, talles, comprado y total, y Guardados con el look 1 y el pantalón.
  - **Público corregido, verificado en vivo:** después del cambio, una búsqueda nueva del look (pools invalidados, en vivo, 73 productos) no trae ningún producto de Indian (`0` en `look_products` de la cuenta); el top de camisas es J&J, Amadeus, Kiabi y Uniform & Co.
  - **Eventos de la cuenta:** `product_added_to_cart` 10 (`add`, `look`, `swap`), `product_removed_from_cart` 5 (`remove`, `swap`), `look_saved` 2, `product_saved` 1, `external_product_clicked` 8.
  - **Free y vencido:** `free@` guardó su look 1 (el ♡ no aparece en los bloqueados) y ve el paywall en el carrito; `demo@` con la suscripción vencida a mano ve su carrito en solo lectura (aviso, "Comprar ↗", total y paywall, sin acciones) y se restauró.
  - **Mobile (375 px):** sin scroll horizontal (`scrollWidth` 375), filas apiladas, total al pie y la píldora del look en dos líneas con el ♡.
  - Ningún producto `.test` en la prueba (los `.test` del seed solo aparecen en el carrito de `demo@`).
- Verificación: format ✓ · lint ✓ · typecheck ✓ · test ✓ (443 unit, 81 integración ejecutados: db 69, worker 12) · build ✓ (`/app/cart`, `/app/favorites`; worker 1,76 MB) · e2e ✓ (10, desktop + mobile, contra `pnpm dev`)
- Decisiones: D18 y D19 confirmadas en la UI; talle según el perfil, aviso de talle con otro precio, "agregar el look" completa prendas vacías y corrección del público de las tiendas. Detalle en `DECISIONES.md`.
- Para pasos siguientes:
  - **11:** filtro genérico de público para tiendas descubiertas fuera del registro (`"carac":{"seccion":"Hombre"}` de Fenicio, migas `Mujer`/`Hombre`, Organization "para mujer"). Revisar el `size_status` cuando el talle existe en varios colores con distinto stock y precio (NH500: "Talle 42 ✓ en stock" se mostraba con el precio de un color agotado en 42). `cheaper_alternative_requested` sigue en `CLIENT_ANALYTICS_EVENTS`.
  - **12a:** E2E del carrito y de Guardados con `SHOPPING_PROVIDER=mock` (agregar desde resultados y el look completo, talle, cambiar, comprado, quitar, total, ♡ en cards y detalle, free con paywall y solo lectura).
  - **12b:** la cuenta `estilo10b@asesor.test` queda en la base local con el carrito y los guardados de esta prueba (`pnpm db:reset` la borra). El seed de `demo@` toma `look_id` en el próximo `db:seed`.
- Commit: `feat(asesoria-shopping): paso 10b — carrito y favoritos: UI y prueba real`

### Paso 11 — Auditoría: analytics, fallas parciales y seguridad · 2026-10-01 · ✅

- Hecho (tres relevamientos en paralelo —analytics, Premium y validación externa— y correcciones con tests):
  - **Analytics** (tabla de los 9 eventos en `DECISIONES.md`, D20): todos en `ANALYTICS_EVENTS`, con propiedades planas y visibles en `/admin/analytics`. `cheaper_alternative_requested` salió de `CLIENT_ANALYTICS_EVENTS` (el navegador podía falsificarlo): ahora el cliente solo reporta vistas y clicks (10 eventos). Tests: `/api/analytics` (acepta una vista con el usuario de la sesión; rechaza con 400 los 7 eventos de servidor más `subscription_started`, propiedades anidadas o largas y JSON roto; 413 por tamaño) y las actions del look (`shopping_started`, `cheaper_alternative_requested`). `product_clicked` ya no existe en código ni SQL. `SETUP_STATUS.md`: 26 eventos.
  - **Fallas parciales** (`packages/shopping/test/partial-failures.test.ts`, un test por caso del SPEC): bloqueo (403, 429, desafío anti-bot con 200 y con 503), desapareció (404 y 410 por `HttpStatusError`), HTML que cambió, sin talle, extracción que falla, candidato que falla y timeout. **Bug corregido:** una entidad HTML fuera de rango (`&#x110000;`) hacía lanzar a `String.fromCodePoint` y caía la búsqueda de toda la prenda (y el `REFRESH_PRODUCT`); ahora queda como texto, y cualquier excepción de la extracción es `not_product` de ese candidato (verificado: el test falla con el código viejo). Sin textos técnicos en la UI: el error boundary es genérico, las actions traducen a mensajes humanos y solo `/admin/jobs` (admin) muestra `last_error`.
  - **Nunca inventar** (corregido con tests):
    - una revalidación fallida deja `UNKNOWN` también el stock de cada talle (`Product`, `data_json` y `product_variants`), además del producto;
    - una variante con moneda no soportada (ARS) queda sin precio en lugar de heredar UYU;
    - "Calce" ya no es clave de talle (es el fit en Uruguay) y el `data-cpre` de Fenicio solo se usa como talle si parece uno;
    - **precio en el talle del usuario** (`priceForSize`): resultados (marca "en tu talle"), total del look y `listedPrice` del carrito; resuelve el NH500 del 10b.
  - **Público del producto según su página** (pendiente del 10b, pedido del usuario): `Product.audience` desde schema.org, la `seccion` de Fenicio, las migas o la `Organization` de la tienda; `rankProducts` descarta el otro público (también en tiendas descubiertas). Legacy pasó a `ALL`. `POOL_VERSION` 4.
  - **Premium en el servidor:** inventario completo de actions, rutas, funciones de `@asesor/db`, worker y RLS (todas las escrituras con Premium). Corregido: la regla de TypeScript miraba solo la suscripción más reciente y podía contradecir a `current_user_is_premium()`; `getPremiumSubscription` la replica (integración `premium.int.test.ts`: con una ACTIVE vigente y una EXPIRED más nueva, Premium en los dos lados; sin ninguna vigente, en ninguno). Decisiones documentadas: catálogo legible con sesión, borrado propio sin Premium en la RLS, progreso de jobs propios sin Premium.
  - **Mocks fuera de producción:** `AI_PROVIDER=mock` también se rechaza con `NODE_ENV=production` (antes solo `SHOPPING_PROVIDER`), con test. Los mocks siguen exportados (tests y E2E); la guarda está en el arranque.
  - **Validación externa:** APIs de plataforma, búsqueda web y sitemaps con Zod (`parseExternal`); HTML de producto leído a mano y validado con `ProductSchema`; pools releídos con Zod. **SSRF:** los listados, APIs y sitemaps solo aportan URLs http(s) de la propia tienda (`ofStore`, test con un link a otro host y a `169.254.169.254`).
  - **Rate limit:** test en cada action nueva (8 de carrito y guardados, búsqueda del look y "más barato": con el límite agotado no tocan la base) y `productOpen` (120/min) nuevo en "Comprar ↗", con test de la ruta (sin sesión → login, sin open redirect aunque venga `?url=`, 404 para ids raros o URLs no http, revalida solo para Premium).
  - **Docs:** `SECURITY_PRIVACY.md` (auditoría de Premium, terceros, rate limits, SSRF), `SETUP_STATUS.md` (shopping real, 26 eventos, tests, costos, riesgos), `SHOPPING_ENGINE.md` (público, nunca inventar, fallas), `DATA_MODEL.md`, `TIENDAS_UY.md` y `DECISIONES.md`.
- Evidencia:
  - **Secretos en el build** (`pnpm build`, búsqueda en `apps/web/.next`): en `static` (cliente, 45 archivos) 0 nombres y 0 valores de `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY` y demás privadas; en `server` aparecen los nombres (schemas de env) y 0 valores.
  - **Payload a terceros** (consultas reales de búsqueda web para los 11 garments de los looks de ejemplo): "camisa oxford crudo hombre comprar online Uruguay", "botas chocolate hombre comprar online Uruguay"…; user agent `AsesorEsteticoBot/1.0 (asesor de imagen, busca productos en tiendas de Uruguay; <contacto>)`. Sin nombre, email, id, talles ni fotos.
  - **Headers:** CSP (`default-src 'self'`, `img-src … https:`, `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`; `'unsafe-eval'` y `ws:` solo en desarrollo), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP. Los dos `target="_blank"` de la app llevan `rel="noopener noreferrer nofollow"`.
  - **`/admin/analytics`** (navegador, admin del seed): `style_advice_viewed` 16, `product_added_to_cart` 10, `product_viewed` 9, `external_product_clicked` 9, `product_removed_from_cart` 5, `shopping_started` 3, `shopping_completed` 3, `look_saved` 3, `size_requested` 1, `product_saved` 1.
  - **Prueba real del público** (`real-shopping-ranking.ts --account estilo10b@asesor.test`, registro, USD 0, 197 requests, 36 s): de 50 productos, 12 de hombre, 5 de mujer (Legacy "PANTALÓN DE GABARDINA SKINNY - VERDE" con `"seccion":"Mujer"`; BAS sobrecamisas y camisa con miga `MUJER`) y 33 sin dato; en `look_products` del look quedaron 18 (2 de hombre, 16 sin dato, **0 de mujer**).
- Verificación: format ✓ · lint ✓ · typecheck ✓ · test ✓ (498 unit, 83 integración ejecutados: db 71, worker 12) · build ✓ · e2e ✓ (10, desktop + mobile, contra `pnpm dev`)
- Decisiones: D20 confirmada con la tabla de eventos; público por página, precio por talle, regla Premium única, guardas de mocks y decisiones de alcance en `DECISIONES.md`.
- Para pasos siguientes:
  - **12a:** E2E de carrito, guardados, "en tu talle", paywall free y solo lectura vencida, con `SHOPPING_PROVIDER=mock`; un producto mock con `audience` de otro público para ver que no aparece.
  - **12b:** revisar en la prueba de punta a punta que no haya productos del otro público y que el precio "en tu talle" coincida con la tienda.
  - **13 (limitaciones):** rate limit en memoria (una instancia); el público solo se filtra si la página lo declara; tiendas descubiertas sin señal pueden traer ropa del otro público si el título no lo dice; las fotos de producto se cargan desde la tienda (ve la IP del usuario); el catálogo es legible con sesión.
- Commit: `feat(asesoria-shopping): paso 11 — auditoría: analytics, fallas parciales y seguridad`

### Paso 12a — Tests E2E de los flujos nuevos · 2026-10-02 · ✅

- Hecho:
  - **Worker en E2E:** `playwright.config.ts` lo levanta como segundo `webServer` (espera "worker iniciado", se apaga con SIGTERM) con `AI_PROVIDER=mock SHOPPING_PROVIDER=mock WORKER_CONCURRENCY=4`, aunque `.env` diga `openrouter`. Mismo arranque en local y en CI. Documentado en el `README.md` raíz y en "Verificación" (apagar antes cualquier otro worker).
  - **Datos** (`apps/web/e2e/helpers.ts`): cada test crea su usuario con service role, con perfil, asesoría y los 3 looks del fixture (`create_style_profile_with_looks`), y Premium con una suscripción MOCK; se borran al terminar cada archivo. La sesión se arma con `@supabase/ssr` (mismo formato de cookies que la app), sin pasar por el formulario. Otros helpers: `findLook` (talles → búsqueda → "Búsqueda terminada"), `holdLookSearch` / `setLookSearch` (búsqueda retenida en la cola y avanzada desde el test), `expirePremium`, `searchJobs`, `pieceRow`.
  - **Specs nuevas** (12 tests, ×2 proyectos):
    - `advice.spec.ts`: free ve "Te favorece", "Mejor evitar", colores y las 6 secciones solo como títulos bloqueados con "Ver la asesoría completa" (sin el texto del peluquero); el look 1 abre con las etiquetas de aspecto ("Color · cálido", "Silueta · trapecio"); los looks 2 y 3 muestran el paywall; en el perfil, silueta con "Desbloquear con Premium" y sin notas. Premium ve las 6 secciones, "Para decirle al peluquero", las notas de la silueta y el look 2 sin paywall.
    - `shopping.spec.ts`: Premium: el formulario pide solo los 3 talles del look (el reloj no), busca con el catálogo mock, "Encontramos opciones para 4 de 5 prendas.", una fila por prenda con el recomendado (link por `/api/products/…/open`), alternativas ("Ver 1 opción más"), local físico, la prenda vacía y el total por moneda; la camisa de mujer del catálogo no aparece; "Buscar más barato" da el mensaje honesto; otro look busca sin volver a pedir talles. Progreso: etapas pendientes → "etapa 4 de 5" con 3 completadas, 1 en curso y "3 de 5 prendas listas" → resultado. Free: el CTA abre el paywall y no hay job en la base.
    - `cart.spec.ts`: agregar una prenda suelta y el resto con "Agregar el look al carrito" (badge 1 → 4), ♡ del look y de un producto, el grupo "Tu look · 01", total "$ 7.670 + US$ 79" con el aproximado aparte, link "Comprar ↗" con `rel="noopener noreferrer nofollow"` y `target="_blank"`, talle M → L, "Ya lo compré", quitar, cambiar por otra opción; todo igual al recargar, guardados en `/app/favorites`; con el Premium vencido, solo lectura (sin quitar ni marcar, con las tiendas a mano). Free: el carrito muestra el paywall.
  - **Worker mock:** cache de pools en memoria (la de Postgres serviría el catálogo ficticio 24 h a un worker real), páginas con la hora real (con el reloj fijo cada producto tenía 9 meses y agregarlo al carrito esperaba una revalidación) y una camisa de mujer que solo lo dice en su página (`FIXTURE_OTHER_AUDIENCE_PRODUCT`; el render mock publica `audience.suggestedGender`), con test unitario (sin público entra; con perfil de hombre, no).
  - **CI:** las claves ficticias pasaron al job `check`; en el de integración pisaban al `.env` del Supabase local, así que la integración y el E2E de CI nunca habrían usado las claves reales (el único run, en `main`, cayó antes por el rate limit de Docker Hub).
  - **Playwright:** 2 navegadores a la vez, 60 s por test, 10 s por espera.
- Evidencia:
  - **Carrera encontrada:** con el worker mock la búsqueda a veces terminaba antes de que se pintara el panel de progreso (falló en mobile); por eso el progreso se prueba con una búsqueda retenida (`scheduled_at` a una hora).
  - **Carga:** con 4 navegadores y `--repeat-each=2`, `next dev` dejó páginas en "Cargando" más de 10 s y fallaron también tests del smoke; con 2 navegadores, 48/48 en 2,5 min.
  - **Modo CI** (`pnpm build` + `CI=1 pnpm test:e2e`, `next start` en el 3100): primero 4 fallas porque el login por formulario tiene 10 intentos/min por IP en producción; con la sesión por cookies, 24/24 en 44 s.
  - **Base local después de las corridas:** 0 jobs en cola; los usuarios de las specs nuevas se borran (los 84 `e2e-smoke-*` / `e2e-user-*` que quedan son del `smoke.spec.ts`, que no limpia).
- Verificación: format ✓ · lint ✓ · typecheck ✓ · test ✓ (499 unit, 83 integración ejecutados: db 71, worker 12) · build ✓ · e2e ✓ (24, desktop + mobile: contra `pnpm dev` con `--repeat-each=2` 48/48, y con `CI=1` contra `next start` 24/24)
- Decisiones: worker como `webServer`, datos por service role, sesión con `@supabase/ssr`, progreso con búsqueda retenida, worker mock con hora real, cache en memoria y producto de otro público, y claves ficticias solo en `check`, en `DECISIONES.md`.
- Para pasos siguientes:
  - **12b:** apagar el worker del E2E antes de la prueba real (Playwright lo apaga solo al terminar) y usar un usuario nuevo, no los `e2e-*`.
  - **13 (limitaciones):** "Buscar más barato" con resultados no tiene E2E (el catálogo mock no tiene una opción más barata que no esté ya entre las del look; lo cubren integración y unit); "en tu talle" tampoco (el mock no tiene precios por talle); `smoke.spec.ts` deja sus usuarios en la base local; la primera corrida real del job de integración en CI va a ser la del PR.
- Commit: `feat(asesoria-shopping): paso 12a — tests E2E de los flujos nuevos`
