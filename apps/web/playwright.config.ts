import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
// PLAYWRIGHT_BASE_URL permite correr contra un `pnpm dev` ya levantado
// (Next.js no admite dos `next dev` en el mismo directorio).
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseURL ?? `http://localhost:${PORT}`;

/**
 * E2E contra la app real y el Supabase local (`pnpm db:start`).
 * En CI usa el build de producción (`next start`); en local, `next dev`.
 *
 * Los flujos con jobs (análisis, búsqueda de productos, "más barato", revalidación) necesitan
 * el worker: se levanta acá, siempre con IA y tiendas mock (sin red ni costo, aunque `.env`
 * diga `AI_PROVIDER=openrouter`). Antes de correr el E2E en local, apagá cualquier otro worker:
 * dos workers se reparten la cola y uno con IA real cobraría (paso 12a).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Los flujos de shopping y carrito son largos y comparten un solo servidor y un worker:
  // dos navegadores a la vez, con margen por test.
  workers: 2,
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  // `next dev` compila cada ruta la primera vez y las acciones de carrito pueden esperar la
  // revalidación de un producto (hasta 8 s): 5 s no alcanzan con varios tests en paralelo.
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    locale: "es-UY",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      name: "web",
      command: process.env.CI
        ? `pnpm exec next start --port ${PORT}`
        : `pnpm exec next dev --port ${PORT}`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      name: "worker",
      // Mismo arranque que `pnpm worker:dev`, sin `--watch`. Las variables exportadas ganan
      // sobre `--env-file`: la IA y las tiendas quedan en mock.
      command:
        "pnpm --filter @asesor/worker exec node --env-file-if-exists=../../.env --import tsx src/index.ts",
      env: {
        ...(process.env as Record<string, string>),
        AI_PROVIDER: "mock",
        SHOPPING_PROVIDER: "mock",
        WORKER_CONCURRENCY: "4",
      },
      wait: { stdout: /worker iniciado/ },
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      timeout: 60_000,
    },
  ],
});
