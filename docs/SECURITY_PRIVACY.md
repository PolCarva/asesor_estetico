# Seguridad y privacidad

## Principios

1. **Las fotos son privadas.** Solo el dueño puede verlas; nunca se hacen públicas ni se usan para entrenar modelos. El usuario puede borrarlas en cualquier momento.
2. **Nunca confiar solo en la UI.** Toda regla (sesión, Premium, propiedad de recursos) se valida en el servidor y en la base (RLS).
3. **Secretos solo en servidor/worker.** Nada con valor secreto lleva prefijo `NEXT_PUBLIC_`.
4. **Todo input externo se valida con Zod**: formularios, APIs, webhooks, respuestas de IA, páginas de tiendas y variables de entorno.

## Autenticación

- Supabase Auth, email + contraseña (mínimo 8 caracteres con letras y números, validado en servidor y en Auth).
- Sesión en cookies gestionadas por `@supabase/ssr`; `proxy.ts` valida y refresca con `getUser()` y borra la sesión si Auth la rechaza (usuario borrado, token revocado).
- `getCurrentUser()` usa `auth.getUser()` (valida contra Auth, no solo la cookie).
- Login con mensaje genérico ("Email o contraseña incorrectos"): no revela si el email existe.
- Registro exige confirmar mayoría de edad; se guarda `profiles.age_confirmed_at`.
- Redirecciones post-login solo a rutas internas (`safeNextPath`, evita open redirect).
- Rate limit por IP en login/registro (además del de Supabase Auth).

## Autorización

Helpers en `@asesor/db`:

| Helper                   | Falla con              | Uso                                                         |
| ------------------------ | ---------------------- | ----------------------------------------------------------- |
| `requireAuth()`          | `AUTH_REQUIRED` 401    | toda acción autenticada                                     |
| `requirePremium()`       | `PREMIUM_REQUIRED` 402 | shopping, carrito, chat, looks 2-3                          |
| `requireAdmin()`         | `FORBIDDEN` 403        | `/admin` (la página responde 404)                           |
| `requireResourceOwner()` | `NOT_FOUND` 404        | acceso a un recurso por id (no revela si existe: anti-IDOR) |

Y en la base, RLS en todas las tablas (detalle en `DATA_MODEL.md`). Los permisos de columna impiden, por ejemplo, que un usuario se asigne `role = 'admin'` o se active una suscripción.

### Análisis de estilo: qué es Premium

- **Free (teaser)**: el núcleo del StyleProfile en `style_profiles.profile_json`: rasgos generales (`appearance`, que desde v3 incluye silueta, proporciones y rasgos del rostro como categorías, sin medidas), colores, qué le favorece, qué evitar y dirección de estilo.
- **Premium**: la asesoría detallada en `style_advice.advice_json`: pelo (corte, largo, laterales, textura, peinado, indicaciones al peluquero), grooming (barba, cejas), proporciones, ropa y fit, materiales, calzado, accesorios (joyería, anteojos), tatuajes y consejos generales.
- Se protege en la base, no solo en la UI: la política de `style_advice` exige `current_user_is_premium()`, así que un usuario free no la lee ni con su JWT vía PostgREST (test de integración en `rls.int.test.ts`). Los looks 2-3 siguen la misma regla.
- Los perfiles v1 (solo en bases locales, anteriores al 2026-09-30) tienen todo en `profile_json`: mostrarlos según el plan es tarea de la UI.

## Service role

- `SUPABASE_SERVICE_ROLE_KEY` saltea RLS. Solo la usan el servidor Next.js (`@asesor/db/service`, marcado `server-only`) y el worker.
- Se usa después de autorizar en el servidor y solo para lo que RLS no permite: admin, webhooks, analytics, resúmenes de looks bloqueados (solo columnas no sensibles).
- `getServerEnv()` y `createAdminClient()` lanzan si se ejecutan en el navegador.

## Storage y uploads

- Buckets `user-photos` y `generated-looks` **privados**, con límite de tamaño y MIME permitidos a nivel bucket.
- Rutas `<user_id>/...`; las políticas de Storage exigen que la primera carpeta sea `auth.uid()`.
- Validación en el servidor antes de subir (`checkPhotoFile`): extensión (jpg, jpeg, png, webp), MIME declarado, **magic bytes** (tipo real del contenido), coincidencia entre ambos y tamaño máximo (10 MB). La validación del cliente es solo UX.
- Nombre de archivo generado por el servidor (UUID); nunca se usa el nombre del usuario en la ruta.
- Una foto por tipo: reemplazar borra el archivo anterior; eliminar borra archivo y fila.
- URLs firmadas de **5 minutos**, generadas en cada render, nunca guardadas ni cacheadas.
- Imágenes privadas con `<img>` directo (no `next/image`, para no pasar por el cache del optimizador).
- Imágenes generadas: la completa solo es legible si el look está desbloqueado (`can_read_generated_look`).

## APIs y webhooks

- Route Handlers validan body con Zod, limitan tamaño y aplican rate limit.
- `/api/analytics`: solo eventos de una lista blanca y propiedades planas y cortas.
- `/api/webhooks/mercadopago`:
  - verifica `x-signature` (HMAC-SHA256 del manifest `id;request-id;ts`) con comparación en tiempo constante y ventana de 5 minutos contra replays;
  - idempotencia con `payment_events unique(provider, event_id)`;
  - **no activa Premium** con el contenido del webhook: solo se actualiza una suscripción si el proveedor confirma el estado consultando su API (hoy no implementado → el evento queda `IGNORED`).
- Errores de API: respuesta con código estable (`AUTH_REQUIRED`, `NOT_FOUND`...) sin detalles internos.

## Requests a tiendas (SSRF)

El worker descarga URLs que vienen de terceros (búsqueda web, sitemaps). Todo pasa por `PoliteHttpClient` (`packages/shopping`):

- validación por nombre (`isSafeProductUrl`): solo http(s) al puerto estándar, sin credenciales, sin IPs privadas o reservadas en ninguna notación, sin `localhost`/`localhost.`/`*.localhost`, `.internal`, `.local` ni nombres de una etiqueta (servicios de Docker);
- validación por IP al conectar (`createSafeTransport`): el `lookup` del socket rechaza si alguna IP resuelta no es pública, así que un DNS que apunta a la red interna (o que cambia entre chequeo y conexión) no llega;
- redirects manuales, revalidados uno por uno (y por el robots.txt de su origen);
- timeout, tope de tamaño medido mientras se lee y ritmo por dominio.

De las respuestas solo se usan los datos de producto extraídos (validados con Zod); el HTML crudo no se guarda. Detalle en [`SHOPPING_ENGINE.md`](SHOPPING_ENGINE.md#descarga-segura-paso-04a).

## Rate limiting

Interfaz `RateLimiter` (`@asesor/shared`) con implementación en memoria. Límites actuales: auth 10/min por IP en producción (200/min en desarrollo, para los E2E), subida de fotos 20/hora por usuario, analytics 60/min por IP, webhooks 120/min por IP. Pendiente: implementación compartida en Postgres para múltiples instancias y límites para endpoints de IA/shopping cuando existan.

## Headers de seguridad

Configurados en `next.config.ts` para todas las rutas: `Content-Security-Policy` (orígenes propios + Supabase, `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restrictiva, `Cross-Origin-Opener-Policy`, `Strict-Transport-Security` en producción. `/app`, `/admin` y `/api` con `Cache-Control: private, no-store`. Sin header `X-Powered-By`.

## Logging

Logger JSON con redacción automática de claves sensibles (contraseñas, tokens, cookies, `authorization`, API keys, firmas, URLs firmadas, payloads, imágenes, emails) y truncado de strings largos. No se loguean fotos, tokens ni payloads de webhooks.

## PWA

El service worker nunca cachea páginas autenticadas, `/api`, fotos, URLs firmadas ni requests a Supabase. Solo assets estáticos versionados, íconos y la página `/offline`.

## Procesamiento de fotos por terceros (IA)

Con `AI_PROVIDER=openrouter`, el worker envía las fotos (como data URL, sin nombre ni email) a OpenRouter, que las enruta al proveedor del modelo (Google).

- Todas las llamadas usan `provider: { data_collection: "deny" }`: OpenRouter solo enruta a proveedores que no retienen datos ni entrenan con ellos.
- Las fotos se reducen en el navegador (≤2048 px) y se re-codifican a JPEG, lo que elimina metadatos EXIF (ubicación GPS, dispositivo).
- Las respuestas del modelo nunca se loguean; los errores de validación solo incluyen rutas y reglas del schema, no valores.
- `OPENROUTER_API_KEY` solo vive en el worker. Configurar un límite de gasto en la clave de OpenRouter.
- Control de costos: un análisis a la vez y máximo 3 por usuario por día; `ai_usage` registra el costo real de cada llamada.
- Pendiente antes de producción: informar este procesamiento en la política de privacidad y pedir consentimiento explícito al subir fotos.

## Privacidad

- Datos mínimos: nombre para mostrar, email, fotos, preferencias de estilo.
- Borrar la cuenta borra en cascada todos los datos de la base (pendiente: borrar también los objetos de Storage con un job).
- Contenido de IA: sin juicios sobre el cuerpo; validación de posible menor de edad en `validatePhotos`.
- Pendiente antes de producción: términos, política de privacidad, retención de fotos, exportación de datos y acuerdo de no-entrenamiento con el proveedor de IA.

## Checklist para cada cambio

- ¿Toca datos de usuarios? → RLS + test de integración.
- ¿Nuevo endpoint? → Zod, `requireAuth`/`requirePremium`, rate limit si es caro, sin datos sensibles en logs.
- ¿Nueva variable de entorno? → schema en `packages/config/src/env`, `.env.example`, y nunca `NEXT_PUBLIC_` si es secreta.
