# Pipeline de IA

## Estado

El pipeline **fotos → validación → análisis → 3 looks → imagen** funciona con IA real vía **OpenRouter** (`AI_PROVIDER=openrouter`) o con **`MockAIProvider`** (`AI_PROVIDER=mock`, default: determinístico, sin red, costo 0). Los tests usan siempre el mock o un `fetch` simulado.

| Uso                                        | Modelo por defecto (OpenRouter) | Variable                 |
| ------------------------------------------ | ------------------------------- | ------------------------ |
| Validación, análisis, looks, chat (visión) | `google/gemini-3.8-flash`       | `OPENROUTER_TEXT_MODEL`  |
| Imagen del usuario con el look             | `google/gemini-3.1-flash-image` | `OPENROUTER_IMAGE_MODEL` |
| Calidad de imagen                          | `medium` (1K, 3:4)              | `AI_IMAGE_QUALITY`       |

Por qué estos modelos (medido el 2026-09-30):

- El modelo de texto tiene que aceptar **JSON Schema estricto con schemas grandes** (StyleProfile, 3 LookSpecs). `anthropic/claude-sonnet-5.5` los rechaza ("compiled grammar is too large", máximo 16 campos con unión); Gemini 3.8 Flash los cumple y cuesta ~USD 0.003–0.016 por llamada.
- El modelo de imagen acepta las fotos del usuario como referencias y mantiene la identidad. ~USD 0.07 por imagen 1K. `google/gemini-3-pro-image` es la alternativa de mayor calidad (más cara).

Costo real medido por usuario: **~USD 0.10** (free: validación + análisis + looks + 1 imagen) y **~USD 0.24** (Premium: 3 imágenes). Se registra en `ai_usage` con el costo informado por OpenRouter.

## Flujo

```mermaid
sequenceDiagram
  participant U as Usuario
  participant W as Web (Server Action)
  participant Q as jobs (Postgres)
  participant K as Worker
  participant AI as OpenRouter
  U->>W: sube MAIN_BODY + FACE_DETAIL (reducidas a ≤2048 px en el navegador)
  U->>W: elige preferencias y "Analizar mis fotos"
  W->>Q: enqueue VALIDATE_PHOTOS (límite 3/día, uno a la vez)
  K->>Q: claim_next_job
  K->>AI: validatePhotos (fotos como data URL)
  K->>Q: user_photos.status VALID/INVALID; encola ANALYZE_STYLE_PROFILE
  K->>AI: analyzeStyleProfile → StyleProfile
  K->>AI: generateLookSpecs → 3 LookSpecs
  K->>Q: create_style_profile_with_looks (núcleo + asesoría + 3 looks, atómico); encola GENERATE_LOOK
  K->>AI: generateLookImage (look 1; 2 y 3 si es Premium)
  K->>Q: sube a generated-looks; looks.status READY
  U->>W: /app/looks (URL firmada de 5 min, auto-refresco mientras genera)
```

Detalles:

- **Disparo**: `/app/onboarding` (`startAnalysisAction`) guarda preferencias (nivel de riesgo, tatuajes) y encola `VALIDATE_PHOTOS`. No permite dos análisis simultáneos ni más de `MAX_ANALYSES_PER_DAY` (3) por día.
- **Fotos a la IA**: el worker las descarga de Storage con service role y las manda como data URL (el Storage local no es accesible desde el proveedor). Límite 5 MB por foto; el navegador ya las reduce a ≤2048 px en JPEG (y elimina EXIF/GPS).
- **Guardado atómico**: `create_style_profile_with_looks(user, profile, advice, looks)` desactiva el perfil anterior y crea en una transacción la versión nueva activa (núcleo en `style_profiles.profile_json`), su asesoría Premium (`style_advice`) y sus 3 looks. `saveStyleProfileWithLooks` parte el perfil con `splitStyleProfile`.
- **Premium**: solo se genera la imagen del look 1 para usuarios free; el handler de `GENERATE_LOOK` vuelve a verificar el plan antes de generar un look bloqueado.
- **Estados**: `user_photos.status` (UPLOADED → VALIDATING → VALID/INVALID, con motivos en `metadata_json`), `looks.status` (PENDING → GENERATING → READY/FAILED). La UI se refresca sola mientras hay trabajo en curso.

## Operaciones (`packages/ai`)

| Función                | Input                                       | Output validado                       |
| ---------------------- | ------------------------------------------- | ------------------------------------- |
| `validatePhotos`       | fotos (id, tipo, data URL o URL firmada)    | resultados por foto + `can_continue`  |
| `analyzeStyleProfile`  | fotos + preferencias (riesgo, tatuajes)     | `StyleProfile` v2 (asesoría completa) |
| `generateLookSpecs`    | `StyleProfile` + preferencias, `count: 3`   | exactamente 3 `LookSpec`              |
| `generateLookImage`    | `LookSpec` + fotos de referencia + variante | imagen base64 + dimensiones           |
| `chatWithStyleAdvisor` | perfil, looks, historial, mensaje           | respuesta + sugerencias (sin UI aún)  |

Cada operación (`runOperation`) valida el input con Zod, llama al proveedor con timeout y señal de cancelación, valida el output con Zod y devuelve `{ operation, data, usage, timing }`.

### OpenRouterProvider

- Texto/visión: `POST /api/v1/chat/completions` con `response_format: json_schema` estricto. El JSON Schema se genera desde los schemas Zod (`toStrictJsonSchema`): objetos cerrados, todo requerido, sin límites de largo/cantidad (no todos los proveedores los soportan; Zod los sigue aplicando).
- **Reparación**: si la respuesta no es JSON o no cumple el schema, se hace un segundo intento en la misma llamada devolviéndole al modelo los errores (solo rutas y reglas, nunca valores). Si tampoco, `INVALID_OUTPUT` (reintentable por el worker con backoff).
- Imágenes: `POST /api/v1/images` con `input_references` (las dos fotos), `aspect_ratio: 3:4`, `resolution: 1K`, `quality`.
- Ruteo: `provider: { data_collection: "deny", require_parameters: true }` → nunca proveedores que retengan/entrenen con datos, y solo los que soportan salida estructurada.
- Costo: `usage.cost` de OpenRouter (real), sumado entre intentos.

## StyleProfile v2: asesoría de imagen completa

`StyleProfileSchema` (`packages/shared/src/schemas/style-profile.ts`, `schema_version: 2`) es la salida de `analyzeStyleProfile`: una sola llamada de IA devuelve el perfil para los looks y la asesoría completa (D1). Todo son listas cortas y strings breves; ningún campo de puntaje.

| Bloque              | Contenido                                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `appearance`        | presentación, rango de edad, forma de rostro, tono/subtono, contraste, ojos                                                                                                                |
| `hair`              | actual (`color`, `texture`, `length`, `current_style`) + `recommended_cut`, `recommended_length`, `sides`, `texture_tips`, `styling`, `recommended_styles`, `avoid`, `barber_instructions` |
| `grooming`          | `current`, `facial_hair { recommended, avoid }`, `eyebrows`, `recommendations`, `avoid`                                                                                                    |
| `colors`            | `season`, `best`, `neutrals`, `avoid` (nombre + hex)                                                                                                                                       |
| `body_proportions`  | `frame`, `balance_notes` (solo cómo vestir)                                                                                                                                                |
| `clothing`          | `current_style`, `recommended_categories`, `recommended_silhouettes`, `pant_cuts`, `lengths`, `layering`, `avoid`                                                                          |
| `fits`, `materials` | `recommended`, `avoid`                                                                                                                                                                     |
| `shoes`             | `recommended`, `avoid`                                                                                                                                                                     |
| `accessories`       | `recommended`, `jewelry`, `eyewear` (vacío si no corresponde), `avoid`                                                                                                                     |
| `tattoos`           | `present`, `visible_areas`, `preference` + `suggestions` y `placements` opcionales (vacíos con `COVER`)                                                                                    |
| `strengths`/`avoid` | lo que le favorece y lo que conviene evitar                                                                                                                                                |
| `style_direction`   | `primary`, `secondary`, `keywords`, `risk_level`                                                                                                                                           |
| `general_advice`    | quick wins priorizados                                                                                                                                                                     |

- **"No aplica"** = lista o string vacío, nunca `null` (cada `.nullable()` suma un `anyOf` a la gramática, D3). Los límites de cantidad y largo están en el texto del prompt, porque `toStrictJsonSchema` los saca.
- **Tamaño del JSON Schema estricto** (medido con `toStrictJsonSchema`): v1 4384 bytes, 56 propiedades, 3 `anyOf` → v2 5956 bytes, 80 propiedades, 3 `anyOf`. Gemini 3.8 Flash lo acepta (prueba real del 2026-09-30: 2815 tokens de salida, USD 0.011, con `max_tokens` 8000).
- **Guardado partido** (D4): `splitStyleProfile` separa el núcleo teaser (`schema_version`, `appearance`, `colors`, `strengths`, `avoid`, `style_direction` → `style_profiles.profile_json`) de la asesoría (`StyleAdviceSchema`, el resto → `style_advice.advice_json`, solo Premium por RLS). `mergeStyleProfile` los vuelve a unir.
- **Lectura tolerante**: `parseStoredStyleProfile(profile_json, advice_json)` acepta v2 y v1 (lo sube a v2 con los campos nuevos vacíos). `getActiveStyleProfile(db, userId)` de `@asesor/db` la usa: con el cliente del usuario, `advice` es `null` para free.
- **Prueba real**: `apps/worker/scripts/real-style-analysis.ts` (análisis con las fotos autorizadas, guardado y lectura free/Premium) o `--schema-check` (solo aceptación del schema, sin fotos).

## Errores normalizados

`AIError` con `code` y `retryable`:

| Código             | Reintentable | Ejemplo                                      |
| ------------------ | ------------ | -------------------------------------------- |
| `INVALID_INPUT`    | No           | input inválido, HTTP 400/404/413/422         |
| `INVALID_OUTPUT`   | Sí           | JSON inválido o fuera de schema tras reparar |
| `CONTENT_REJECTED` | No           | rechazo/moderación, HTTP 403                 |
| `AUTH_OR_BILLING`  | No           | clave inválida o sin crédito (401/402)       |
| `PROVIDER_ERROR`   | Sí           | 5xx, error de red                            |
| `RATE_LIMITED`     | Sí           | 429                                          |
| `TIMEOUT`          | Sí           | timeout o cancelación                        |
| `NOT_IMPLEMENTED`  | No           | reservado                                    |

El worker reintenta con backoff exponencial (3 intentos). Si el último falla: fotos → `INVALID` con mensaje, look → `FAILED`.

## Prompts

`packages/ai/src/prompts`: reglas comunes (español rioplatense, respeto; "mejor versión estética de esta misma persona": **nunca** cambiar estructura facial, altura, cuerpo, peso, musculatura ni rasgos fundamentales; **sin puntuaciones de atractivo** ni análisis médico; no inferir etnia/salud/orientación; recomendaciones concretas, breves y aplicables; solo JSON) y un prompt por operación. `ANALYZE_STYLE_PROFILE_PROMPT` recorre cada bloque del StyleProfile con sus límites (ítems ≤120 caracteres, cantidad máxima por lista, `barber_instructions` ≤400). `buildLookImagePrompt()` arma el prompt de imagen en inglés desde el LookSpec, exigiendo preservar identidad y proporciones. `PROMPT_VERSION` (hoy `2026-09-30.2`) se guarda en `ai_usage.metadata`.

## Pendiente

- Generar looks 2 y 3 cuando un usuario free pasa a Premium (hoy se generan solo al analizar siendo Premium).
- Regenerar un look puntual desde la UI (`look_regenerated`) y reintentar looks `FAILED`.
- Chat Premium (la operación existe, falta UI y persistencia).
- Previews borrosas de looks bloqueados (evaluar costo y fuga de valor).
- Tests de contrato con respuestas grabadas del proveedor real.
