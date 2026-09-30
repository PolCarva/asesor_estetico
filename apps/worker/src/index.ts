import { hostname } from "node:os";

import { createAIProvider } from "@asesor/ai";
import { AnalyticsService, DatabaseAnalyticsProvider } from "@asesor/analytics";
import { getWorkerEnv } from "@asesor/config/env/worker";
import { createWorkerSupabaseClient } from "@asesor/db/worker";
import { createLogger } from "@asesor/shared";
import { MockProductFetcher, MockSearchProvider } from "@asesor/shopping";

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
    searchProvider: new MockSearchProvider(),
    fetcher: new MockProductFetcher(),
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
