import { hostname } from "node:os";

import { createAIProvider } from "@asesor/ai";
import { AnalyticsService, DatabaseAnalyticsProvider } from "@asesor/analytics";
import { getWorkerEnv } from "@asesor/config/env/worker";
import { createPostgresSearchCache } from "@asesor/db";
import { createWorkerSupabaseClient } from "@asesor/db/worker";
import { createLogger } from "@asesor/shared";
import { FIXTURE_OTHER_AUDIENCE_PRODUCT, FIXTURE_PRODUCTS } from "@asesor/shared/fixtures";
import {
  createLiveShopping,
  createMemorySearchCache,
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
// El catálogo mock suma una camisa de mujer que solo lo dice en su página: el E2E verifica
// que no le aparece a un perfil masculino.
const MOCK_CATALOG = [...FIXTURE_PRODUCTS, FIXTURE_OTHER_AUDIENCE_PRODUCT];
const discovery = env.SHOPPING_PROVIDER === "live" && Boolean(env.OPENROUTER_API_KEY);
const shopping =
  env.SHOPPING_PROVIDER === "mock"
    ? {
        searchProvider: new MockSearchProvider(MOCK_CATALOG),
        // Con la hora real (el reloj fijo es para los tests unitarios): si no, cada producto
        // tendría meses y agregarlo al carrito esperaría una revalidación (paso 12a).
        fetcher: new MockProductFetcher(MOCK_CATALOG, () => new Date()),
      }
    : createLiveShopping({
        botContact: env.SHOPPING_BOT_CONTACT,
        // Sin clave de OpenRouter no hay descubrimiento fuera del registro de tiendas.
        webSearch:
          discovery && env.OPENROUTER_API_KEY
            ? new OpenRouterWebSearchClient({
                apiKey: env.OPENROUTER_API_KEY,
                model: env.OPENROUTER_TEXT_MODEL,
              })
            : undefined,
        onError: (source, error) => logger.warn("fuente de shopping falló", { source, error }),
      });
logger.info("proveedor de shopping", { provider: env.SHOPPING_PROVIDER, discovery });

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
    variants: "variants" in shopping ? shopping.variants : undefined,
    // Pools de búsqueda de 24 h en Postgres (paso 05): una prenda ya buscada no se re-scrapea.
    // Con el catálogo mock (tests y E2E), en memoria: la cache de Postgres no distingue mock de
    // live, y un pool ficticio quedaría 24 h para el worker real (o uno real llegaría al E2E).
    searchCache:
      env.SHOPPING_PROVIDER === "mock" ? createMemorySearchCache() : createPostgresSearchCache(db),
    // El costo de cada búsqueda web va a ai_usage, por job.
    webSearch: discovery
      ? { provider: "openrouter", model: `${env.OPENROUTER_TEXT_MODEL}+web_search` }
      : undefined,
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
