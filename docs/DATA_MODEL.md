# Modelo de datos

Fuente de verdad: `supabase/migrations/*.sql` (se aplican desde cero con `pnpm db:reset`). Los tipos TypeScript se generan con `pnpm db:types` → `packages/db/src/database.types.ts` (CI verifica que estén al día).

Convenciones:

- PK `uuid` (`gen_random_uuid()`), salvo `profiles.id` = `auth.users.id`.
- `created_at` en todas las tablas; `updated_at` (trigger `set_updated_at`) en las que se modifican.
- Enums de Postgres para estados estables; `jsonb` para estructuras de IA que todavía evolucionan (`profile_json`, `spec_json`, `metadata`), siempre validadas con Zod al leer/escribir.
- Borrar un usuario borra en cascada todos sus datos.

## Diagrama

```mermaid
erDiagram
  AUTH_USERS ||--|| PROFILES : "trigger handle_new_user"
  PROFILES ||--o{ STYLE_PROFILES : tiene
  STYLE_PROFILES ||--o| STYLE_ADVICE : "asesoría Premium"
  PROFILES ||--o{ USER_PHOTOS : sube
  PROFILES ||--o{ LOOKS : recibe
  STYLE_PROFILES ||--o{ LOOKS : genera
  LOOKS ||--o{ LOOK_PRODUCTS : sugiere
  PRODUCTS ||--o{ LOOK_PRODUCTS : aparece
  PRODUCTS ||--o{ LOOK_PRODUCTS : "referencia de más barato"
  PRODUCTS ||--o{ PRODUCT_VARIANTS : tiene
  PROFILES ||--o{ FAVORITES : guarda
  LOOKS ||--o{ FAVORITES : "favorito (look)"
  PRODUCTS ||--o{ FAVORITES : "favorito (producto)"
  PROFILES ||--o| CARTS : tiene
  CARTS ||--o{ CART_ITEMS : contiene
  PRODUCTS ||--o{ CART_ITEMS : referencia
  PRODUCT_VARIANTS ||--o{ CART_ITEMS : "talle/color"
  LOOKS ||--o{ CART_ITEMS : agrupa
  PROFILES ||--o{ SUBSCRIPTIONS : paga
  PROFILES ||--o{ CHAT_THREADS : conversa
  LOOKS ||--o{ CHAT_THREADS : "contexto opcional"
  CHAT_THREADS ||--o{ CHAT_MESSAGES : contiene
  PROFILES ||--o{ JOBS : origina
  JOBS ||--o{ AI_USAGE : consume
  PROFILES ||--o{ AI_USAGE : consume
  PROFILES ||--o{ ANALYTICS_EVENTS : emite

  PROFILES {
    uuid id PK
    text display_name
    char country_code "default UY"
    user_role role "user | admin"
    style_risk_level style_risk_level
    tattoo_preference tattoo_preference
    bool onboarding_completed
    timestamptz age_confirmed_at
    text top_size "talles del usuario (paso 07)"
    text bottom_size
    text shoe_size
    text shoe_size_system "EU | US"
  }
  STYLE_PROFILES {
    uuid id PK
    uuid user_id FK
    int version
    jsonb profile_json "StyleProfileCore (teaser, v1 legado: perfil completo)"
    bool active "uno activo por usuario"
  }
  STYLE_ADVICE {
    uuid style_profile_id PK
    uuid user_id FK
    jsonb advice_json "StyleAdvice (solo Premium)"
  }
  USER_PHOTOS {
    uuid id PK
    uuid user_id FK
    text storage_path "user_id/..."
    user_photo_type type "MAIN_BODY | FACE_DETAIL"
    user_photo_status status
    text mime_type
    int size_bytes
    jsonb metadata_json
  }
  LOOKS {
    uuid id PK
    uuid user_id FK
    uuid style_profile_id FK
    text name
    smallint position "1 gratis, 2-3 Premium"
    look_status status
    jsonb spec_json "LookSpec"
    text image_storage_path
    text preview_storage_path
  }
  PRODUCTS {
    uuid id PK
    text external_id
    text store_domain
    text url
    product_category category
    numeric price_amount "null solo en IN_STORE_ONLY"
    currency_code currency
    product_availability availability
    jsonb data_json
    timestamptz last_fetched_at
  }
  PRODUCT_VARIANTS {
    uuid id PK
    uuid product_id FK
    text size
    text color
    product_availability availability
  }
  LOOK_PRODUCTS {
    uuid id PK
    uuid look_id FK
    uuid product_id FK
    text garment_slot
    smallint rank
    numeric score
    jsonb score_breakdown
    text size_status
    text user_size
    text list "MAIN | CHEAPER"
    uuid reference_product_id FK "más barato"
    numeric max_price_amount
    currency_code max_price_currency
  }
  SHOPPING_SEARCH_CACHE {
    text key PK "hash de la prenda, sin datos del usuario"
    jsonb query_json
    uuid_array product_ids
    jsonb stats
    timestamptz expires_at
  }
  FAVORITES {
    uuid id PK
    uuid user_id FK
    uuid look_id FK "uno de los dos"
    uuid product_id FK "uno de los dos"
  }
  CARTS {
    uuid id PK
    uuid user_id FK "unique"
  }
  CART_ITEMS {
    uuid id PK
    uuid cart_id FK
    uuid product_id FK
    uuid variant_id FK
    uuid look_id FK "null: suelto o look borrado"
    text garment_slot
    smallint quantity
    numeric price_amount_snapshot "lo fija un trigger"
    currency_code currency_snapshot
    timestamptz purchased_at
  }
  SUBSCRIPTIONS {
    uuid id PK
    uuid user_id FK
    payment_provider provider
    text provider_subscription_id
    subscription_status status
    timestamptz current_period_start
    timestamptz current_period_end
  }
  PAYMENT_EVENTS {
    uuid id PK
    payment_provider provider
    text event_id "unique con provider"
    payment_event_status status
    jsonb payload
  }
  CHAT_THREADS {
    uuid id PK
    uuid user_id FK
    uuid look_id FK
    text title
  }
  CHAT_MESSAGES {
    uuid id PK
    uuid thread_id FK
    uuid user_id FK
    chat_role role
    text content
  }
  JOBS {
    uuid id PK
    job_type type
    job_status status
    jsonb payload
    jsonb result
    int attempts
    int max_attempts
    text idempotency_key
    timestamptz scheduled_at
    timestamptz locked_at
    text locked_by
    timestamptz finished_at
    text last_error
    jsonb progress
    uuid look_id "generada desde payload"
    text garment_slot "generada desde payload"
  }
  AI_USAGE {
    uuid id PK
    uuid user_id FK
    uuid job_id FK
    ai_operation operation
    text provider
    text model
    int input_tokens
    int output_tokens
    int image_count
    numeric estimated_cost_usd
    int duration_ms
    boolean success
    jsonb metadata
  }
  ANALYTICS_EVENTS {
    uuid id PK
    text name
    uuid user_id FK
    text anonymous_id
    jsonb properties
  }
```

## Tablas

| Tabla                   | Propósito                                                                                                    | Escribe                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `profiles`              | Perfil de la app, 1:1 con `auth.users`                                                                       | Trigger + usuario (columnas limitadas)                            |
| `style_profiles`        | Versiones del StyleProfile (jsonb); una activa por usuario                                                   | Worker                                                            |
| `style_advice`          | Asesoría detallada (Premium) de cada StyleProfile, 1:1                                                       | Worker                                                            |
| `user_photos`           | Metadata de fotos; el archivo está en Storage. Una por tipo                                                  | Usuario (insert/delete)                                           |
| `looks`                 | 3 looks por StyleProfile (`position` 1..3) con `spec_json`                                                   | Worker                                                            |
| `products`              | Catálogo global normalizado de tiendas externas                                                              | Worker / servidor                                                 |
| `product_variants`      | Talles/colores con stock propio                                                                              | Worker / servidor                                                 |
| `look_products`         | Ranking de productos por prenda (`garment_slot`) de un look, con `size_status`, y las "más baratas" (`list`) | Worker (`replace_look_products`, `replace_cheaper_look_products`) |
| `shopping_search_cache` | Pools de búsqueda (24 h): uuids de productos validados de una prenda                                         | Solo service role                                                 |
| `favorites`             | Looks o productos guardados (exactamente uno)                                                                | Usuario                                                           |
| `carts`                 | Un carrito externo por usuario                                                                               | Usuario (Premium)                                                 |
| `cart_items`            | Productos del carrito por look y prenda; el precio lo fija un trigger                                        | Usuario (Premium)                                                 |
| `subscriptions`         | Estado del plan Premium por proveedor                                                                        | Servidor (tras validar el pago)                                   |
| `payment_events`        | Webhooks recibidos; `unique(provider, event_id)` = idempotencia                                              | Servidor                                                          |
| `chat_threads`          | Conversaciones con el asesor                                                                                 | Usuario (Premium)                                                 |
| `chat_messages`         | Mensajes; el usuario solo puede escribir `role = 'user'`                                                     | Usuario / servidor                                                |
| `jobs`                  | Cola de trabajos, con progreso por etapas (`progress`)                                                       | Solo service role                                                 |
| `ai_usage`              | Costo y uso de cada operación de IA                                                                          | Solo service role                                                 |
| `analytics_events`      | Eventos de producto                                                                                          | Solo service role                                                 |

## Talles del usuario

Migración `20261001000400_profile_sizes.sql` (paso 07, D15): `profiles.top_size`, `bottom_size` y `shoe_size` (text, null = todavía no lo cargó, 1–10 caracteres) y `shoe_size_system` (`EU` | `US`, default `EU`; el número de calzado siempre va con su sistema). Alineados con `UserSizesSchema` de `@asesor/shared`.

- **Quién los escribe:** el usuario, con su cliente: `grant update (top_size, bottom_size, shoe_size, shoe_size_system)` y la política "profiles: update own". `saveUserSizes` (`@asesor/db`) valida contra las opciones que se ofrecen (`SIZE_OPTIONS`, en forma canónica de `normalizeSizeLabel`) y la base con los checks.
- **Cuándo se piden:** antes de la primera búsqueda de un look, solo los relevantes (`missingSizesForLook`, sobre `sizeKindForCategory`). Se editan en `/app/profile#cuenta`.
- **Cómo se usan:** `getUserSizes` los lee y la búsqueda los manda en el payload de `SEARCH_PRODUCTS`. El calzado de EE. UU. viaja como `US 9.5` (`sizeForCategory`): contra talles europeos queda `UNVERIFIED`, sin conversión inventada.

## StyleProfile guardado

El análisis (`StyleProfile` v3, ver `AI_PIPELINE.md`) se guarda partido para que la parte Premium quede protegida por RLS (D4):

- `style_profiles.profile_json`: núcleo teaser (`StyleProfileCoreSchema`: `schema_version: 3`, `appearance`, `colors`, `strengths`, `avoid`, `style_direction`). Lo lee cualquier plan. Desde v3, `appearance` incluye la silueta (`body_shape`), las proporciones (`torso_legs`) y los rasgos del rostro (`face_features`): las etiquetas son visibles para free y las notas para equilibrar la silueta (`body_proportions.balance_notes`) siguen en la asesoría Premium (D26). No hizo falta migración: el reparto es por claves de primer nivel.
- `style_advice.advice_json`: asesoría detallada (`StyleAdviceSchema`: pelo, grooming, proporciones, ropa y fit, materiales, calzado, accesorios, tatuajes, `general_advice`). PK = `style_profile_id`; FK compuesta `(style_profile_id, user_id)` → `style_profiles (id, user_id)`, así nunca apunta al perfil de otro usuario. RLS: `select` solo propio y con `current_user_is_premium()`; nadie escribe desde el cliente.
- Perfiles v2 (2026-09-30 a 2026-10-01): mismo reparto, sin perfil visual. `parseStoredStyleProfile` los sube a v3 con `face_features: []` y silueta y proporciones `UNKNOWN`.
- Perfiles v1 (anteriores al 2026-09-30): el perfil completo quedó en `profile_json` y no tienen fila en `style_advice`. `parseStoredStyleProfile` los sube a v3 con la asesoría nueva vacía. Solo existen en bases locales (no hay producción).
- `looks.spec_json` anteriores al 2026-10-01 tienen `reasoning` como lista de strings; `StoredLookSpecSchema` los lee como razones de aspecto `STYLE` (ver `AI_PIPELINE.md`).

## Productos de tiendas

`products` guarda el `Product` normalizado (`packages/shared`); `data_json` tiene el objeto completo, con las variantes y `in_store`.

- **Precio** (migración `20261001000100_in_store_price.sql`, D10): `price_amount` y `currency` pueden ser `null` solo en un local físico que no publica el precio. El check `products_price_known` exige que vayan juntos y que, si faltan, `availability = 'IN_STORE_ONLY'`.
- **Local físico**: ubicación y contacto (`in_store`: dirección, localidad, teléfono, link) van en `data_json`, sin columnas nuevas.
- **Público** (paso 11): `audience` (`MEN`, `WOMEN`, `UNISEX` o null), el que declara la página del producto, va en `data_json` (sin columna: lo usa el ranking al leer el pool). Los productos guardados antes lo leen como null.
- **Variantes** (`product_variants`): `size` es el talle normalizado (`M`, `42`, `US 9`, `ÚNICO`). La etiqueta de la tienda (`size_label`) queda en `data_json`.
- **Carrito**: un producto sin precio (local físico) no entra al carrito (ver "Carrito y guardados").
- **Identidad y cache** (migración `20261001000200_shopping_cache.sql`, paso 05): el upsert es por `url` (canónica). El único `(store_domain, external_id)` pasó a ser un índice común, porque un handle renombrado o un id externo que cambia entre corridas chocaba con el único de `url`. `products` y `product_variants` son la cache persistente de productos (frescura de 8 h con `last_fetched_at`, que solo avanza con una verificación exitosa).
- **Pools de búsqueda** (`shopping_search_cache`): `key` (sha256 de la prenda, sin talle, precio máximo, límite ni datos del usuario), `query_json`, `product_ids uuid[]`, `stats`, `expires_at` (24 h, con índice para purgar). RLS habilitada y sin grants para `anon` ni `authenticated`: solo el worker.
- **Resultados por look** (`look_products`): `size_status` (`AVAILABLE`, `OUT_OF_STOCK`, `NOT_OFFERED`, `UNVERIFIED`, `NOT_REQUESTED`, `NOT_APPLICABLE`; null en filas anteriores) para mostrar "talle sin verificar" con honestidad, y `user_size` (migración `20261001000500`, paso 08): el talle del usuario con el que se rankeó, al que se refiere `size_status` (si después cambia sus talles, la UI no muestra un estado de otro talle). El ranking de una prenda se reemplaza entero y de forma atómica con `replace_look_products`. Lo lee solo el dueño Premium.
- **"Más baratas"** (migración `20261001000600_cheaper_alternatives.sql`, paso 09, D17): `look_products.list` (`MAIN` | `CHEAPER`), `reference_product_id` (FK a `products`) y `max_price_amount` / `max_price_currency` (el precio del producto de referencia: tope estricto). Un check exige que las filas `CHEAPER` tengan referencia y tope, y las `MAIN` no. `replace_cheaper_look_products(look, slot, referencia, tope, moneda, items)` (solo service role) reemplaza las más baratas de una prenda sin tocar el ranking principal y sin repetir sus productos. `replace_look_products` borra las dos listas de la prenda. Con dos FKs a `products`, los embeds de PostgREST desde `look_products` usan `products!look_products_product_id_fkey`.

## Carrito y guardados

Migración `20261001000700_cart.sql` (paso 10a, D18). El carrito no procesa la compra: agrupa productos externos por look y prenda.

- **Un carrito por usuario** (`carts.user_id` único). `getOrCreateCart` lo crea con un upsert que ignora el duplicado y después lo lee, así dos pedidos simultáneos no chocan.
- **`cart_items`** suma `look_id` (FK a `looks`, `on delete set null`), `garment_slot` (mismo formato que `look_products`) y `purchased_at` (comprado en la tienda; null = pendiente). Check `cart_items_look_slot`: con look, la prenda es obligatoria. Sin look hay dos casos: un producto suelto (sin prenda) o un ítem cuyo look se borró (queda en el carrito, con la prenda como referencia).
- **Únicos** (reemplazan a `unique (cart_id, product_id, variant_id)`, que impedía el mismo producto en dos looks): `cart_items_look_item_key (cart_id, look_id, garment_slot, product_id, variant_id) nulls not distinct where look_id is not null` y `cart_items_loose_item_key (cart_id, product_id, variant_id) nulls not distinct where look_id is null and garment_slot is null`. Los ítems de looks borrados no tienen único: si no, borrar un look con el mismo producto que otro look ya borrado chocaría al poner `look_id` en null.
- **Precio**: `set_cart_item_price_snapshot()` corre `before insert or update of product_id, variant_id`. Toma el precio de la variante o, si no tiene, el del producto. Un producto sin precio se rechaza al agregarlo con `22023` (la app lo traduce a un mensaje humano). Al cambiar solo el talle de un producto que se quedó sin precio, o cuando la base borra una variante que la tienda dejó de publicar (`variant_id` → null), conserva el último precio conocido: el carrito no se rompe. `price_amount_snapshot` y `currency_snapshot` tienen defaults solo para que el tipo generado no los exija; el trigger siempre los pisa.
- **Permisos por columna**: insert de `cart_id`, `product_id`, `variant_id`, `quantity`, `look_id` y `garment_slot`; update de `quantity`, `product_id` (cambiar por otra alternativa), `variant_id` y `purchased_at`. Precio y moneda nunca (un insert o update que los mande falla con `42501`).
- **RLS**: leer y borrar, solo lo propio; agregar y modificar, propio y Premium, y el `look_id` tiene que ser del usuario (IDOR). Un usuario que dejó de ser Premium conserva la lectura: la app le muestra el carrito en solo lectura.
- **Guardados** (`favorites`, D19): sin cambios de esquema. Looks propios con cualquier plan; productos solo Premium (RLS y `saveFavorite`).
- **Lógica** (`@asesor/db`, D22): `addToCart`, `selectCartItemVariant`, `swapCartItem`, `removeFromCart`, `setCartItemPurchased`, `getCartLines`, `saveFavorite` y `removeFavorite`, con el cliente del usuario. El view model (`buildCartView`, `@asesor/shared`) agrupa y calcula los subtotales.

## Jobs de shopping

Migración `20261001000300_shopping_jobs.sql` (paso 06, D13 y D14):

- **`progress`** (jsonb, nullable): `ShoppingProgress` de `@asesor/shared` (`stage` del enum `SEARCHING | CHECKING_STORES | COMPARING | VERIFYING | RANKING`, `slots_total`, `slots_done`, `updated_at` y, en el último, `summary`). Sin porcentajes. Lo escribe solo `update_job_progress` (service role, y solo el worker que tiene el job `RUNNING`).
- **`look_id` y `garment_slot`**: columnas generadas (`payload ->> 'look_id'` / `'slot'`). No se insertan: salen del payload, que ya se validó con Zod. Sirven para que la UI encuentre la búsqueda de un look sin leer `payload`.
- **Una búsqueda activa por (look, prenda)**: índice único parcial `jobs_one_active_search_idx (look_id, coalesce(garment_slot, '*')) where type = 'SEARCH_PRODUCTS' and status in ('QUEUED', 'RUNNING')`. La del look completo (`garment_slot` null) no bloquea la de una prenda; dos pedidos simultáneos no encolan dos (el segundo falla con `23505` y `startLookShopping` devuelve el activo).
- **Lectura del dueño**: `grant select (progress, look_id, garment_slot)` a `authenticated`, con la política "jobs: select own". `payload`, `result` y `last_error` siguen ocultos.
- **`result`** de `SEARCH_PRODUCTS`: `ShoppingSearchSummary` (prendas con resultados, fallidas, candidatos, productos, guardados, stock y talle sin verificar, parcial, hits de cache). El mismo resumen va en el último `progress.summary`, que es lo que lee la UI.
- **Payload de `SEARCH_PRODUCTS`**: `{ user_id, look_id, sizes (UserSizes), slot?, max_price?, reference_product_id? }`. Sin `slot` busca el look completo y reemplaza todas sus prendas; `max_price` es estricto y solo va con `slot`; `reference_product_id` marca "Buscar más barato" (exige `max_price`) y el resultado va a la lista `CHEAPER`.
- **`ai_operation`** suma `WEB_SEARCH`: el costo de las búsquedas web del descubrimiento de tiendas, una fila de `ai_usage` por job.

## Índices principales

- `jobs_queue_idx (priority desc, scheduled_at) where status = 'QUEUED'` — índice parcial para `claim_next_job`.
- `jobs_running_idx (locked_at) where status = 'RUNNING'` — recuperación de locks vencidos.
- `jobs_look_id_idx (look_id, created_at desc)` — última búsqueda de un look; `jobs_one_active_search_idx` — una búsqueda activa por (look, prenda).
- `style_profiles_one_active_per_user` — índice único parcial.
- Índices en todas las FKs usadas en filtros o joins (`looks.user_id`, `favorites.*`, `cart_items.*`, `chat_*`, `ai_usage.*`...).
- `analytics_events (name, created_at desc)`, `ai_usage (created_at desc)` para el admin.

## Row Level Security

RLS habilitado en **todas** las tablas. Resumen (ver `20260929000300_rls_policies.sql`):

- `anon`: sin acceso a ninguna tabla.
- `authenticated`: solo sus filas (`user_id = auth.uid()`), y solo las columnas con `GRANT` explícito. Excepción: el catálogo (`products`, `product_variants`) lo puede leer cualquier usuario con sesión (datos públicos de tiendas). Por ejemplo, en `profiles` puede cambiar `display_name`, `style_risk_level`, `tattoo_preference`, `onboarding_completed` y sus talles (`top_size`, `bottom_size`, `shoe_size`, `shoe_size_system`), pero **no** `role` ni `country_code`.
- Premium reforzado en datos: leer `looks` con `position > 1`, `style_advice` y `look_products`, y **crear o modificar** carritos, ítems, `chat_*` y favoritos de productos requieren `current_user_is_premium()`. Leer el carrito propio y borrar ítems o guardados propios no lo piden (un Premium vencido conserva su carrito en solo lectura; la app igual bloquea el borrado sin Premium, decisión del paso 11).
- IDOR: los inserts que referencian otros recursos (favoritos, hilos de chat, ítems del carrito y su look) verifican que el recurso sea del usuario.
- `jobs`: el usuario puede **leer** el estado y el progreso de sus jobs (columnas no sensibles: también `progress`, `look_id` y `garment_slot`); nunca crear ni modificar, ni leer `payload`, `result` o `last_error`.
- `ai_usage`, `analytics_events`, `payment_events`: sin acceso desde el cliente.
- `service_role` tiene acceso completo (lo usan servidor y worker).

`current_user_is_premium()` replica `isPremiumSubscription()` de `@asesor/shared`: `ACTIVE` o `CANCELLED` con `current_period_end > now()`. Si cambia una, hay que cambiar la otra.

## Storage

| Bucket            | Público | Límite | MIME            | Escribe          | Lee                                                      |
| ----------------- | ------- | ------ | --------------- | ---------------- | -------------------------------------------------------- |
| `user-photos`     | No      | 10 MB  | jpeg, png, webp | Dueño            | Dueño                                                    |
| `generated-looks` | No      | 15 MB  | jpeg, png, webp | Worker (service) | Dueño; imagen completa solo si el look está desbloqueado |

Rutas: `<user_id>/<...>`. Las políticas comparan la primera carpeta con `auth.uid()`. El acceso es siempre con URLs firmadas de 5 minutos.

## Funciones SQL

| Función                                                         | Quién la ejecuta | Qué hace                                                                                                                         |
| --------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `handle_new_user()`                                             | Trigger          | Crea `profiles` al registrarse                                                                                                   |
| `set_updated_at()`                                              | Trigger          | Mantiene `updated_at` en las tablas que lo tienen                                                                                |
| `create_style_profile_with_looks(user, profile, advice, looks)` | service_role     | Guarda núcleo, asesoría (`style_advice`) y los 3 looks en una transacción; desactiva el perfil anterior                          |
| `set_cart_item_price_snapshot()`                                | Trigger          | Fija el precio del ítem al agregar y al cambiar producto o talle; sin precio, rechaza (o conserva el último al cambiar el talle) |
| `replace_look_products(look, slot, items)`                      | service_role     | Reemplaza el ranking de una prenda de un look en una transacción                                                                 |
| `current_user_is_premium()`                                     | RLS              | Regla Premium                                                                                                                    |
| `can_read_generated_look(name)`                                 | Política Storage | Imagen generada visible según look y plan                                                                                        |
| `enqueue_job(...)`                                              | service_role     | Encola (idempotente con `idempotency_key`)                                                                                       |
| `claim_next_job(...)`                                           | service_role     | Toma el próximo job con `FOR UPDATE SKIP LOCKED`                                                                                 |
| `complete_job(...)`                                             | service_role     | Marca COMPLETED (solo el worker que lo tomó)                                                                                     |
| `fail_job(...)`                                                 | service_role     | Reintenta con delay o marca FAILED                                                                                               |
| `retry_job(id)`                                                 | service_role     | Reintento manual de un FAILED                                                                                                    |
| `update_job_progress(job, worker, prog)`                        | service_role     | Guarda el progreso (solo el worker que tiene el job en curso)                                                                    |
| `replace_cheaper_look_products(...)`                            | service_role     | Reemplaza las "más baratas" de una prenda, sin tocar ni repetir el ranking                                                       |
| `admin_overview_metrics()`                                      | service_role     | Métricas del overview de `/admin`                                                                                                |
| `admin_event_counts(days)`                                      | service_role     | Conteo de eventos para `/admin/analytics`                                                                                        |
