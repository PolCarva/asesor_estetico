# Paso 02b — Perfil visual: los datos que pide el diseño

**Orden del SPEC:** 1–6 (estructura del análisis y su UI) · **Depende de:** 01, 02 · **SPEC:** "ANÁLISIS ESTÉTICO", "ESTRUCTURA DEL ANÁLISIS", "UI DEL ASESORAMIENTO" · **Diseño:** `docs/DESIGN_SYSTEM.md` (pantallas 2d, 2h, 2i y 2j)

## Objetivo

Que el análisis devuelva los datos **cualitativos** que el diseño "Espejo" muestra y hoy no existen, y que la UI los use:

- **Silueta:** tipo de silueta para vestirse, por ejemplo "trapecio invertido", "rectángulo", "triángulo", "óvalo" o "reloj de arena". Lo muestran la tarjeta "Silueta" de `/app/profile` y la tarjeta de hallazgos del análisis.
- **Proporciones:** relación torso/piernas como etiqueta ("piernas largas", "equilibradas", "torso largo"). Va en la tarjeta "Proporciones".
- **Rasgos del rostro:** una o dos frases cortas que acompañen la forma de rostro, por ejemplo "mandíbula definida, frente media".
- **"Por qué te queda bien" por aspecto:** cada razón de un look con su aspecto (`COLOR`, `SILUETA`, `ROSTRO`, `PELO`, `ESTILO`) y un calificativo breve, para las etiquetas del diseño ("COLOR · CÁLIDO", "SILUETA · TRAPECIO").

**Fuera de alcance, por el SPEC:** medidas en centímetros, porcentajes, ratios, cantidad de "puntos" leídos y cualquier puntaje (de atractivo o de "match"). El diseño los muestra, pero la IA no mide nada desde una foto: serían números inventados. Ver "Diferencias con el mockup" en `docs/DESIGN_SYSTEM.md`.

## Lo que ya hay (2026-10-01, verificalo)

- **`StyleProfileSchema` v2.** `appearance.face_shape` (enum), `skin_undertone`, `contrast_level`, `colors.season` (string nullable) y `body_proportions { frame, balance_notes }`. `body_proportions` es parte de la asesoría Premium (`style_advice`), no del núcleo.
- **`LookSpec.reasoning`.** Es `shortList(5)` de strings, sin aspecto.
- **UI.**
  - `/app/profile`, en `apps/web/src/app/app/profile/page.tsx`, arma el bento con datos reales: la tarjeta "Silueta" usa `FRAME_LABEL` y `balance_notes` (Premium), y el usuario free ve la tarjeta bloqueada.
  - En `/app/looks/[id]`, las tarjetas "Por qué te queda bien" van numeradas.
  - `AnalysisStage` muestra los hallazgos ROSTRO, COLOR y ESTILO.
- **Lectura tolerante.** `parseStoredStyleProfile` acepta v1 y v2 (D2). `LookSpecSchema.safeParse` en `apps/web/src/lib/data.ts`: si un spec guardado no valida, el look se muestra **bloqueado**.

## Trampas

- **Looks guardados.** Si `reasoning` pasa de `string[]` a objetos sin lectura tolerante, todos los looks existentes dejan de validar y aparecen bloqueados. Hace falta una de dos:
  - un schema que acepte las dos formas, normalizando el string a `{ aspect: "ESTILO", … }`;
  - o un campo nuevo aditivo (`reasoning_tagged`), manteniendo `reasoning`.
- **Versión del perfil.** Los campos nuevos obligatorios en el StyleProfile exigen `schema_version: 3` y subir v1/v2 con valores neutros (D2, D3: vacíos en lugar de `nullable`). Medí de nuevo el tamaño del JSON Schema estricto (paso 01).
- **Free vs Premium.** Decidí si silueta y proporciones van al núcleo (visibles para free, como la forma de rostro) o a la asesoría (Premium). La propuesta D26 dice que la etiqueta va al núcleo y las notas siguen en Premium. Confirmalo o cambialo en `DECISIONES.md`.
- **Prompt.** La regla "sin puntuaciones de atractivo ni análisis médico" y "no inferir etnia, salud ni orientación" sigue vigente. La silueta se describe para vestirse, nunca como juicio del cuerpo.

## Tareas

1. **Schema** en `packages/shared`:
   - campos nuevos con enums cerrados;
   - lectura tolerante para perfiles y looks guardados;
   - fixture, mock y seed actualizados;
   - tests de schema y de lectura vieja.
2. **Prompt** de `ANALYZE_STYLE_PROFILE` y de `GENERATE_LOOK_SPECS`:
   - las instrucciones de los campos nuevos;
   - subir `PROMPT_VERSION`;
   - test del JSON Schema enviado.
3. **Persistencia.** Si cambia el reparto núcleo/asesoría, actualizá `splitStyleProfile`, la función SQL y la RLS.
   - Tests de integración: free no lee lo Premium.
   - `db:reset` y `db:types` si hay migración.
4. **UI**, según `docs/DESIGN_SYSTEM.md`:
   - **Bento de `/app/profile`:**
     - "Silueta" con el tipo y "Proporciones" con la etiqueta, sin barras de medidas;
     - el rostro con sus rasgos;
     - la barra torso/piernas del diseño **solo** si se representa como etiqueta (por ejemplo, tres segmentos sin porcentajes).
   - **Hallazgos del análisis:** sumar SILUETA.
   - **"Por qué te queda bien":** etiqueta `ASPECTO · CALIFICATIVO` y tono por aspecto (COLOR = arcilla, SILUETA = musgo, ROSTRO/PELO/ESTILO = neutro).
5. **Prueba real** con las fotos autorizadas de `~/asesor-fotos-prueba/` (~USD 0.06, con `apps/worker/scripts/real-style-analysis.ts` extendido):
   - el perfil valida;
   - los campos nuevos son coherentes con las fotos;
   - las razones traen aspecto.

   Documentá 3 ejemplos en el log.

6. **Verificación en el navegador:** desktop y mobile, free y Premium, con un perfil v2 viejo (lectura tolerante) y con uno nuevo.

## Hecho cuando

- [ ] El StyleProfile nuevo trae silueta, proporciones y rasgos del rostro; los LookSpecs traen razones con aspecto. Todo validado con Zod y sin medidas, porcentajes ni puntajes (test).
- [ ] Los perfiles y looks guardados antes de este paso se siguen leyendo, sin looks bloqueados por error (test).
- [ ] El reparto free/Premium de los campos nuevos está decidido (D26) y, si cambia la RLS, probado con integración.
- [ ] El bento de `/app/profile`, los hallazgos del análisis y "Por qué te queda bien" usan los datos nuevos, verificados en el navegador (desktop + mobile, free + Premium).
- [ ] Prueba real con las fotos autorizadas documentada en el log, con costo.
- [ ] `pnpm format`, `lint`, `typecheck`, `test` (con integración ejecutada), `build` y `test:e2e` en verde.
- [ ] `docs/AI_PIPELINE.md`, `docs/DATA_MODEL.md`, `docs/DESIGN_SYSTEM.md` (sacar las filas resueltas de "Diferencias con el mockup") y `DECISIONES.md` actualizados.
