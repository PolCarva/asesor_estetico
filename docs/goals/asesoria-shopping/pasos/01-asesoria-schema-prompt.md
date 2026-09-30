# Paso 01 — Asesoría: schema, prompt y persistencia

**Orden del SPEC:** 1–5 · **Depende de:** — · **SPEC:** "COMPLETAR EL ASESORAMIENTO ESTÉTICO", "ESTRUCTURA DEL ANÁLISIS", "UI DEL ASESORAMIENTO" (la división Free/Premium)

## Objetivo

Que el análisis devuelva, además de los 3 looks, un **asesoramiento de imagen completo y estructurado**. Tiene que cubrir:

- qué le favorece y qué evitar;
- pelo: corte, largo, laterales, textura, peinado e instrucciones para el peluquero;
- grooming: barba o vello facial, cejas;
- colores que favorecen y colores a evitar;
- ropa y fit: fits, siluetas, cortes de pantalón, largos, layering, materiales y texturas;
- calzado;
- accesorios: joyería, y anteojos si corresponde;
- tatuajes opcionales, con ubicaciones;
- consejos generales.

Todo validado con Zod y persistido. La parte Premium queda protegida **a nivel de datos**: un usuario free no la puede leer, ni con su JWT vía PostgREST, igual que hoy pasa con los looks 2–3. La UI queda para el paso 02.

Reglas de contenido:

- Sin puntuaciones de atractivo ni análisis médico.
- Solo styling realista, con cambios que el usuario pueda aplicar en la vida real.
- Recomendaciones claras, concretas, breves y aplicables.
- La idea es "la mejor versión estética de esta misma persona", sin cambiar estructura facial, altura, cuerpo, musculatura ni rasgos fundamentales.

## Lo que ya hay (relevamiento 2026-09-30, verificalo)

- **Schema actual.** `packages/shared/src/schemas/style-profile.ts` define `StyleProfileSchema` v1 (`schema_version: z.literal(1)`). Ya tiene:
  - `hair {color, texture, length, current_style, recommended_styles}` y `grooming {current, recommendations}`;
  - `colors {season, best, neutrals, avoid}`, `fits {recommended, avoid}` y `materials {recommended, avoid}`;
  - `shoes {recommended}`, `accessories {recommended}` y `tattoos {present, visible_areas, preference}`;
  - `strengths`, `avoid`, `style_direction`, `appearance`, `body_proportions` y `clothing`.
- **Lo que le falta:**
  - pelo: `hair.avoid`, corte recomendado, laterales, peinado y `barber_instructions`;
  - grooming: barba o vello facial, cejas y `grooming.avoid`;
  - ropa: siluetas, cortes de pantalón, largos, layering y `clothing.avoid`;
  - calzado y accesorios: `shoes.avoid`, joyería, anteojos y `accessories.avoid`;
  - tatuajes: sugerencias y ubicaciones;
  - general: `general_advice`.
- **Prompt.** `packages/ai/src/prompts/index.ts`: `ANALYZE_STYLE_PROFILE_PROMPT` **no menciona pelo ni grooming**. `SHARED_RULES` prohíbe cambios corporales e inferir salud, pero **no** menciona puntuaciones de atractivo. `PROMPT_VERSION = '2026-09-30.1'` se guarda en `ai_usage.metadata`.
- **Proveedor OpenRouter.** `packages/ai/src/providers/openrouter.ts` usa JSON Schema estricto: `toStrictJsonSchema` quita `maxItems`/`maxLength` y fuerza todo `required`. Tiene `max_tokens` 8000 y 1 intento de reparación. El mensaje de usuario trae hardcodeado `'schema_version: 1.'`.
- **Tamaño del schema.** El schema estricto actual de StyleProfile pesa ~4.4 KB, con 56 propiedades y 3 `anyOf`. Gemini 3.8 Flash lo acepta. Claude Sonnet rechazó schemas grandes ("compiled grammar is too large").
- **Guardado.** `create_style_profile_with_looks` (`supabase/migrations/20260930000100_style_pipeline.sql`) guarda `profile_json` tal cual, como jsonb. Es atómico y exige exactamente 3 looks.
- **RLS.** La política de `style_profiles` es `select own`, **sin chequeo Premium**: un usuario free puede leer todo `profile_json`. En cambio, `looks` usa `position = 1 or current_user_is_premium()`.
- **Lectura en la web.** `getActiveStyleProfile()` en `apps/web/src/lib/data.ts` hace `safeParse` y devuelve `null` si falla.
- **Fixture.** `FIXTURE_STYLE_PROFILE` (`packages/shared/src/fixtures/style.ts`) alimenta el mock, el seed y los tests.

## Trampas

- **Filas viejas:** si subís `schema_version` a 2 sin lectura tolerante, todo perfil v1 guardado pasa a `null`: el dashboard muestra "Pendiente" y el perfil desaparece. Hace falta un `parseStoredStyleProfile()` en `packages/shared` que acepte v1 (lo sube a v2 con asesoría vacía) y v2, y usarlo en todas las lecturas.
- **No toques `LookSpecSchema` ni `GarmentSchema`:** el SPEC pide no romper los 3 looks, y `Garment` alimenta el shopping. `getLooks()` trata como bloqueado un look que no parsea.
- **Gramática del schema estricto:**
  - Cada `.nullable()` se convierte en un `anyOf` y agranda la gramática. Preferí arrays y strings no-nullable (vacío = "no aplica").
  - Los límites (`maxItems`, largo) no llegan al modelo. Ponelos en el texto del prompt, o vas a gastar reintentos en `INVALID_OUTPUT`.
  - Cuidá `max_tokens`: una salida más grande puede truncarse.
- **Tablas y funciones nuevas:** los default privileges de Supabase las exponen. Hacé los `revoke` explícitos (ver README, "Entorno").
- **Tests que dependen del fixture:**
  - `packages/shared/test/schemas.test.ts` hace `parse` → `toEqual` del fixture: nada de `.default()` ni transforms que cambien la salida.
  - `packages/ai/test/ai.test.ts`: el chat espera "smart casual" y la reparación usa `strengths` ×20.
  - `packages/db/scripts/seed.ts` hace un `parse` estricto: si falla, `pnpm db:reset` se rompe.
  - `packages/db/test/integration/rls.int.test.ts`.
  - `apps/worker/test/pipeline.int.test.ts` espera exactamente las operaciones `[VALIDATE_PHOTOS, ANALYZE_STYLE_PROFILE, GENERATE_LOOK_SPECS, GENERATE_LOOK_IMAGE]` en `ai_usage`.
- **Operación de IA separada** (por ejemplo `generateStyleAdvice`): solo si el schema único no entra en la gramática o en los tokens. Cuesta más: enum `AIOperation`, `AIProvider`, mock, OpenRouter, test de integración y docs.
- **Tokens de entrada:** `ChatWithStyleAdvisorInputSchema` y `GenerateLookSpecsInputSchema` embeben `StyleProfileSchema`, así que un perfil más grande suma tokens de entrada a esas llamadas.

## Tareas

1. Leé `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/AI_PIPELINE.md`, `docs/DATA_MODEL.md`, `docs/PRODUCT_SPEC.md`, `docs/SECURITY_PRIVACY.md` y los archivos de arriba.
2. **Diseñá la extensión** del StyleProfile, coherente con los nombres existentes. Conservá `colors.best/avoid`, `fits`, `materials`, `strengths` y `avoid`, que ya usan la UI, el chat y los tests. Guía, no obligatoria:
   - `hair`: `recommended_cut`, `length`/`sides` (recomendado), `styling`, `recommended_styles`, `avoid`, `barber_instructions`.
   - `grooming`: `facial_hair` (recomendado + evitar; vacío si no aplica), `eyebrows`, `recommendations`, `avoid`.
   - `clothing`: `recommended_silhouettes`, `pant_cuts`, `lengths`, `layering`, `avoid`, además de los `fits`/`materials` existentes.
   - `shoes.avoid`; `accessories`: `jewelry`, `eyewear` (vacío si no corresponde), `avoid`.
   - `tattoos`: `suggestions` y `placements`, opcionales, respetando `tattoo_preference` (vacío si el usuario no quiere).
   - `general_advice`: quick wins priorizados.
   - Listas cortas (3–6 ítems), frases breves y concretas. **Ningún campo de puntaje.**
3. **División Free/Premium en los datos.** Definí qué es teaser, visible para free, y qué es Premium. Propuesta:
   - Free: el núcleo que ya existe (`appearance`, `colors`, `strengths`, `avoid`, `style_direction`).
   - Premium: los bloques detallados nuevos.

   Persistí lo Premium donde la RLS lo proteja, por ejemplo una tabla `style_advice` 1:1 con `style_profiles` y una política `select own and current_user_is_premium()`. El worker la escribe de forma atómica junto con el perfil y los looks: migración nueva que reemplace `create_style_profile_with_looks` o función nueva. Después `db:reset`, `db:types` y test de integración: free no la lee, Premium sí, anon no. Anotá la división en `DECISIONES.md` (D4).

4. **Versionado:** `schema_version` 2 + `parseStoredStyleProfile()` tolerante con v1. Usalo en `getActiveStyleProfile` y en cualquier otra lectura de `profile_json` (web, worker, chat). La lectura de la asesoría Premium tolera que no exista (perfiles viejos).
5. **Prompt.** Actualizá `ANALYZE_STYLE_PROFILE_PROMPT` y `SHARED_RULES`:
   - que cubra cada bloque, con los límites explícitos;
   - las reglas "sin puntuaciones de atractivo, sin análisis médico, sin cambiar estructura facial, altura, cuerpo, musculatura ni rasgos fundamentales; recomendaciones concretas, breves y aplicables".

   Subí `PROMPT_VERSION` y el `'schema_version: …'` hardcodeado.

6. **Medición.** Medí `toStrictJsonSchema(...)` antes y después (tamaño, propiedades, `anyOf`) y anotalo en `DECISIONES.md`.
7. **Fixture.** Actualizá `FIXTURE_STYLE_PROFILE` (y la asesoría Premium del fixture) con valores realistas para todos los campos nuevos, así el mock y el seed ya muestran la asesoría completa.
8. **Tests:**
   - schema: bloques nuevos, límites, v1 → v2;
   - `parseStoredStyleProfile`;
   - que OpenRouter manda el schema nuevo estricto (fake fetch);
   - RLS de la parte Premium;
   - lo que se rompa del listado de trampas.
9. **Prueba real.** Con IA real, corré al menos un análisis con las fotos de prueba de `~/asesor-fotos-prueba/` (README, "Prerrequisitos"). Puede ser por el flujo de la app, con un usuario local nuevo y el worker, o con un script que llame `analyzeStyleProfile`. Verificá que el output valida contra el schema nuevo y que se guardó bien (free/Premium). Anotá el costo y los tokens. Si no hay fotos de prueba o `OPENROUTER_API_KEY`, el paso queda ⛔ por ese motivo, después de dejar todo lo demás hecho y commiteado.
10. **Tests de integración en serie** (D23): en `turbo.json`, hacé que `test:integration` de worker dependa del de db (por ejemplo `"dependsOn": ["transit", "^test:integration"]`), así no corren en paralelo contra la misma base. Leé antes las docs de turbo instalado, como indica AGENTS.md.
11. **Docs:** `docs/AI_PIPELINE.md` (schema, prompt, versión, medición), `docs/DATA_MODEL.md` (forma y versión de `profile_json`, tabla o columna Premium) y `docs/SECURITY_PRIVACY.md` (qué parte del análisis es Premium y cómo se protege).

## Hecho cuando

- [ ] El StyleProfile (con su parte Premium) cubre todos los temas de la lista del SPEC, con datos estructurados (listas y campos), no texto libre, y sin campos de puntaje.
- [ ] El prompt dice explícitamente: sin puntuaciones de atractivo, sin análisis médico, sin cambiar rasgos fundamentales, y recomendaciones concretas y aplicables. `PROMPT_VERSION` subido y límites en el texto.
- [ ] La parte Premium no es legible por un usuario free (test de integración con su JWT) y sí por uno Premium.
- [ ] Los perfiles v1 guardados se siguen leyendo (test).
- [ ] Fixture, mock y seed actualizados, y `pnpm db:reset` funciona. `db:types` al día.
- [ ] Un análisis real con OpenRouter valida contra el schema nuevo. El log trae el costo y cita 3–5 recomendaciones reales, revisadas como concretas y aplicables.
- [ ] Los 3 looks siguen generándose igual (test de integración del pipeline en verde).
- [ ] `pnpm format`, `lint`, `typecheck`, `test` (con integración ejecutada) y `build` en verde.
- [ ] Docs actualizados y decisiones en `DECISIONES.md`.
