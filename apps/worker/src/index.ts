import { hostname } from "node:os";

import { createAIProvider } from "@asesor/ai";
import { AnalyticsService, DatabaseAnalyticsProvider } from "@asesor/analytics";
import { getWorkerEnv } from "@asesor/config/env/worker";
import { createWorkerSupabaseClient } from "@asesor/db/worker";
import { createLogger } from "@asesor/shared";
import {
  createLiveShopping,
  MockProductFetcher,
  MockSearchProvider,
  OpenRouterWebSearchClient,
} from "@asesor/shopping";

import { handlers } from "./handlers";
import { createPostgresJobQueue } from "./queue";
import { WorkerRunner } from "./runner";

const env = getWorkerEnv();
const workerId = `${hostname()}:${process.pid}`;
const logger = createLogger({ service: "worker", level: env.LOG_LEVEL, bindings: { workerId } });
const db = createWorkerSupabaseClient(env);

const ai = createAIProvider(
  env.AI_PROVIDER === "openrouter"
    ? {
        provider: "openrouter",
        apiKey: env.OPENROUTER_API_KEY ?? "",
        textModel: env.OPENROUTER_TEXT_MODEL,
        imageModel: env.OPENROUTER_IMAGE_MODEL,
        imageQuality: env.AI_IMAGE_QUALITY,
      }
    : { provider: "mock" },
);
logger.info("proveedor de IA", {
  provider: ai.name,
  ...(env.AI_PROVIDER === "openrouter"
    ? // "renderModel" y no "imageModel": el logger redacta claves que contienen "image".
      {
        textModel: env.OPENROUTER_TEXT_MODEL,
        renderModel: env.OPENROUTER_IMAGE_MODEL,
        quality: env.AI_IMAGE_QUALITY,
      }
    : {}),
});

// Shopping: live por defecto (tiendas reales); mock solo en tests/E2E y nunca en producción.
const shopping =
  env.SHOPPING_PROVIDER === "mock"
    ? { searchProvider: new MockSearchProvider(), fetcher: new MockProductFetcher() }
    : createLiveShopping({
        botContact: env.SHOPPING_BOT_CONTACT,
        // Sin clave de OpenRouter no hay descubrimiento fuera del registro de tiendas.
        webSearch: env.OPENROUTER_API_KEY
          ? new OpenRouterWebSearchClient({
              apiKey: env.OPENROUTER_API_KEY,
              model: env.OPENROUTER_TEXT_MODEL,
            })
          : undefined,
        onError: (source, error) => logger.warn("fuente de shopping falló", { source, error }),
      });
logger.info("proveedor de shopping", {
  provider: env.SHOPPING_PROVIDER,
  discovery: env.SHOPPING_PROVIDER === "live" && Boolean(env.OPENROUTER_API_KEY),
});

const runner = new WorkerRunner({
  queue: createPostgresJobQueue(db, { workerId }),
  handlers,
  deps: {
    db,
    ai,
    // Uso de IA siempre se registra (control de costos); el flag de analytics es de la web.
    analytics: new AnalyticsService({
      provider: new DatabaseAnalyticsProvider(db),
      enabled: true,
      logger,
    }),
    searchProvider: shopping.searchProvider,
    fetcher: shopping.fetcher,
  },
  logger,
  concurrency: env.WORKER_CONCURRENCY,
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("señal recibida", { signal });
  await runner.stop();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (error) => logger.error("unhandledRejection", { error }));

runner.start().catch((error: unknown) => {
  logger.error("el worker terminó con error", { error });
  process.exit(1);
});
