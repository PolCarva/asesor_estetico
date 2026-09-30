import "server-only";

import { getServerEnv } from "@asesor/config/env/server";
import { createLogger, type Logger } from "@asesor/shared";

let logger: Logger | undefined;

/** Logger estructurado del servidor web. Redacta secretos, tokens y payloads. */
export function getLogger(): Logger {
  logger ??= createLogger({ service: "web", level: getServerEnv().LOG_LEVEL });
  return logger;
}
