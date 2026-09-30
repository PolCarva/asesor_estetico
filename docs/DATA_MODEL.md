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
  PROFILES ||--o{ USER_PHOTOS : sube
  PROFILES ||--o{ LOOKS : recibe
  STYLE_PROFILES ||--o{ LOOKS : genera
  LOOKS ||--o{ LOOK_PRODUCTS : sugiere
  PRODUCTS ||--o{ LOOK_PRODUCTS : aparece
  PRODUCTS ||--o{ PRODUCT_VARIANTS : tiene
  PROFILES ||--o{ FAVORITES : guarda
  LOOKS ||--o{ FAVORITES : "favorito (look)"
  PRODUCTS ||--o{ FAVORITES : "favorito (producto)"
  PROFILES ||--o| CARTS : tiene
  CARTS ||--o{ CART_ITEMS : contiene
  PRODUCTS ||--o{ CART_ITEMS : referencia
  PRODUCT_VARIANTS ||--o{ CART_ITEMS : "talle/color"
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
  }
  STYLE_PROFILES {
    uuid id PK
    uuid user_id FK
    int version
    jsonb profile_json "StyleProfile"
    bool active "uno activo por usuario"
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
    numeric price_amount
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
    smallint quantity
    numeric price_amount_snapshot "lo fija un trigger"
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

| Tabla              | Propósito                                                            | Escribe                                |
| ------------------ | -------------------------------------------------------------------- | -------------------------------------- |
| `profiles`         | Perfil de la app, 1:1 con `auth.users`                               | Trigger + usuario (columnas limitadas) |
| `style_profiles`   | Versiones del StyleProfile (jsonb); una activa por usuario           | Worker                                 |
| `user_photos`      | Metadata de fotos; el archivo está en Storage. Una por tipo          | Usuario (insert/delete)                |
| `looks`            | 3 looks por StyleProfile (`position` 1..3) con `spec_json`           | Worker                                 |
| `products`         | Catálogo global normalizado de tiendas externas                      | Worker / servidor                      |
| `product_variants` | Talles/colores con stock propio                                      | Worker / servidor                      |
| `look_products`    | Ranking de productos por prenda (`garment_slot`) de un look          | Worker                                 |
| `favorites`        | Looks o productos guardados (exactamente uno)                        | Usuario                                |
| `carts`            | Un carrito externo por usuario                                       | Usuario (Premium)                      |
| `cart_items`       | Productos del carrito; el precio lo fija un trigger desde `products` | Usuario (Premium)                      |
| `subscriptions`    | Estado del plan Premium por proveedor                                | Servidor (tras validar el pago)        |
| `payment_events`   | Webhooks recibidos; `unique(provider, event_id)` = idempotencia      | Servidor                               |
| `chat_threads`     | Conversaciones con el asesor                                         | Usuario (Premium)                      |
| `chat_messages`    | Mensajes; el usuario solo puede escribir `role = 'user'`             | Usuario / servidor                     |
| `jobs`             | Cola de trabajos                                                     | Solo service role                      |
| `ai_usage`         | Costo y uso de cada operación de IA                                  | Solo service role                      |
| `analytics_events` | Eventos de producto                                                  | Solo service role                      |

## Índices principales

- `jobs_queue_idx (priority desc, scheduled_at) where status = 'QUEUED'` — índice parcial para `claim_next_job`.
- `jobs_running_idx (locked_at) where status = 'RUNNING'` — recuperación de locks vencidos.
- `style_profiles_one_active_per_user` — índice único parcial.
- Índices en todas las FKs usadas en filtros o joins (`looks.user_id`, `favorites.*`, `cart_items.*`, `chat_*`, `ai_usage.*`...).
- `analytics_events (name, created_at desc)`, `ai_usage (created_at desc)` para el admin.

## Row Level Security

RLS habilitado en **todas** las tablas. Resumen (ver `20260929000300_rls_policies.sql`):

- `anon`: sin acceso a ninguna tabla.
- `authenticated`: solo sus filas (`user_id = auth.uid()`), y solo las columnas con `GRANT` explícito. Por ejemplo, en `profiles` puede cambiar `display_name`, `style_risk_level`, `tattoo_preference` y `onboarding_completed`, pero **no** `role` ni `country_code`.
- Premium reforzado en datos: `looks` con `position > 1`, `look_products`, `carts`, `cart_items`, `chat_*` y favoritos de productos requieren `current_user_is_premium()`.
- IDOR: los inserts que referencian otros recursos (favoritos, hilos de chat, ítems del carrito) verifican que el recurso sea del usuario.
- `jobs`: el usuario puede **leer** el estado de sus jobs (columnas no sensibles); nunca crear ni modificar.
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

| Función                          | Quién la ejecuta | Qué hace                                         |
| -------------------------------- | ---------------- | ------------------------------------------------ |
| `handle_new_user()`              | Trigger          | Crea `profiles` al registrarse                   |
| `set_cart_item_price_snapshot()` | Trigger          | Fija precio y moneda del ítem desde el catálogo  |
| `current_user_is_premium()`      | RLS              | Regla Premium                                    |
| `current_user_is_admin()`        | RLS / servidor   | Rol admin                                        |
| `can_read_generated_look(name)`  | Política Storage | Imagen generada visible según look y plan        |
| `enqueue_job(...)`               | service_role     | Encola (idempotente con `idempotency_key`)       |
| `claim_next_job(...)`            | service_role     | Toma el próximo job con `FOR UPDATE SKIP LOCKED` |
| `complete_job(...)`              | service_role     | Marca COMPLETED (solo el worker que lo tomó)     |
| `fail_job(...)`                  | service_role     | Reintenta con delay o marca FAILED               |
| `retry_job(id)`                  | service_role     | Reintento manual de un FAILED                    |
| `admin_overview_metrics()`       | service_role     | Métricas del overview de `/admin`                |
| `admin_event_counts(days)`       | service_role     | Conteo de eventos para `/admin/analytics`        |
