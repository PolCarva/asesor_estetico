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
| 01  | [Asesoría: schema, prompt y persistencia](pasos/01-asesoria-schema-prompt.md)                      | 1–5            | —          | ✅     |
| 02  | [Asesoría: UI, Free/Premium y detalle de look](pasos/02-asesoria-ui-detalle-look.md)               | 6              | 01         | ✅     |
| 02b | [Perfil visual: los datos que pide el diseño](pasos/02b-perfil-visual-datos.md)                    | 1–6            | 01, 02     | ✅     |
| 03  | [Shopping: queries desde el LookSpec y búsqueda real](pasos/03-shopping-queries-busqueda.md)       | 7–9            | —          | ✅     |
| 04a | [Shopping: fetcher seguro, extracción y normalización](pasos/04a-fetch-extraccion.md)              | 10–11          | 03         | ✅     |
| 04b | [Shopping: adaptadores de talles/stock, validación y locales](pasos/04b-adaptadores-validacion.md) | 10–11          | 04a        | ✅     |
| 05  | [Shopping: ranking y cache persistente](pasos/05-shopping-ranking-cache.md)                        | 12–13          | 04b        | ✅     |
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
