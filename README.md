# Asesor Estético

Asesor de imagen personal con IA: analiza fotos del usuario, decide cómo potenciar su imagen, genera tres versiones visuales realistas y encuentra productos reales para reproducir los looks. Web/PWA para Uruguay.

> Estado: foundation completa y **análisis + imagen del look con IA real** (OpenRouter). Pagos y tiendas siguen mockeados. Ver [`docs/SETUP_STATUS.md`](docs/SETUP_STATUS.md).

## Requisitos

- **Node.js 24** (`nvm use` lee `.nvmrc`)
- **pnpm** vía Corepack (`corepack enable`; la versión está fijada en `package.json`)
- **Docker** corriendo (Supabase local)

La CLI de Supabase se instala como dependencia del proyecto: no hace falta instalarla aparte.

## Levantar el proyecto desde cero

```bash
nvm use
corepack enable
pnpm install
pnpm db:start      # levanta Supabase local y genera .env con sus claves
pnpm db:reset      # aplica migraciones desde cero y carga el seed
pnpm dev           # http://localhost:3000
```

En otra terminal:

```bash
pnpm worker:dev    # procesa la cola de jobs
```

Verificación completa:

```bash
pnpm check
```

### IA real o mock

Por defecto `AI_PROVIDER=mock`: todo funciona sin red ni costo. Para usar IA real, en `.env`:

```bash
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=<tu clave de https://openrouter.ai/keys>
```

Reiniciá `pnpm worker:dev`. Cuesta ~USD 0.10 por análisis de un usuario free (ver [`docs/AI_PIPELINE.md`](docs/AI_PIPELINE.md)). Configurá un límite de gasto en la clave.

### Usuarios de desarrollo (seed)

`pnpm db:reset` / `pnpm db:seed` crean cuentas **ficticias** con la contraseña `asesor-demo-2026` (cambiable con `SEED_USER_PASSWORD`). Solo existen en tu Supabase local.

| Email               | Rol / plan                                            |
| ------------------- | ----------------------------------------------------- |
| `demo@asesor.test`  | Premium, con perfil, looks, favoritos, carrito y chat |
| `free@asesor.test`  | Plan gratuito con perfil y looks (ve solo el look 1)  |
| `admin@asesor.test` | Admin (accede a `/admin`)                             |

El seed se niega a correr contra un Supabase que no sea local.

### Servicios locales

| Servicio         | URL                                                       |
| ---------------- | --------------------------------------------------------- |
| App web          | http://localhost:3000                                     |
| Supabase API     | http://127.0.0.1:54321                                    |
| Supabase Studio  | http://127.0.0.1:54323                                    |
| Emails (Mailpit) | http://127.0.0.1:54324                                    |
| Postgres         | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

## Comandos

| Comando                     | Qué hace                                                |
| --------------------------- | ------------------------------------------------------- |
| `pnpm dev`                  | Web en modo desarrollo                                  |
| `pnpm worker:dev`           | Worker en modo watch                                    |
| `pnpm build`                | Build de producción (web + worker)                      |
| `pnpm lint`                 | ESLint en todo el monorepo                              |
| `pnpm typecheck`            | TypeScript strict en todo el monorepo                   |
| `pnpm test`                 | Tests unitarios + integración (requiere Supabase local) |
| `pnpm test:unit`            | Solo unitarios (no necesitan nada corriendo)            |
| `pnpm test:integration`     | Integración contra Supabase local (RLS, jobs, Storage)  |
| `pnpm test:e2e`             | Playwright (levanta la web; requiere Supabase local)    |
| `pnpm format`               | Prettier (escribe)                                      |
| `pnpm check`                | format:check + lint + typecheck + test:unit + build     |
| `pnpm db:start` / `db:stop` | Levanta / apaga Supabase local                          |
| `pnpm db:reset`             | Migraciones desde cero + seed                           |
| `pnpm db:seed`              | Solo el seed (idempotente)                              |
| `pnpm db:types`             | Regenera `packages/db/src/database.types.ts`            |
| `pnpm env:local`            | Regenera `.env` con las claves del Supabase local       |

Primera vez con E2E: `pnpm --filter @asesor/web exec playwright install chromium`.

- No corras `pnpm test:integration` con el worker prendido: el worker puede tomar los jobs de prueba.
- `pnpm test:e2e` levanta su propio `next dev` (puerto 3100). Next.js no permite dos `next dev` en el mismo directorio: si ya tenés `pnpm dev` corriendo, usá `PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm test:e2e`.
- Levantá y reseteá Supabase siempre con los scripts (`pnpm db:*`), que usan la CLI fijada en el proyecto. Mezclar con otra versión instalada globalmente puede dejar Storage con un esquema incompatible.

## Worker en Docker

```bash
docker build -f apps/worker/Dockerfile -t asesor-worker .
docker run --env-file .env -e NEXT_PUBLIC_SUPABASE_URL=http://host.docker.internal:54321 asesor-worker
```

La imagen no contiene secretos: las variables se pasan en runtime.

## Estructura

```
apps/web        Next.js (UI, Server Actions, API, admin)
apps/worker     Worker de jobs (Postgres)
packages/       ai · analytics · config · db · payments · shopping · shared
supabase/       config.toml, migraciones, seed.sql
docs/           Producto, arquitectura, datos, IA, shopping, seguridad, plan
```

## Documentación

Empezá por [`AGENTS.md`](AGENTS.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) y [`docs/EXECUTION_PLAN.md`](docs/EXECUTION_PLAN.md).
