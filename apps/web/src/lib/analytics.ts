import "server-only";

import { AnalyticsService, DatabaseAnalyticsProvider } from "@asesor/analytics";
import { getPublicEnv } from "@asesor/config/env/public";
import { getServiceRoleClient } from "@asesor/db/service";

import { getLogger } from "./logger";

let service: AnalyticsService | undefined;

/** AnalyticsService del servidor. Escribe con service role; nunca lanza. */
export function getAnalytics(): AnalyticsService {
  service ??= new AnalyticsService({
    provider: new DatabaseAnalyticsProvider(getServiceRoleClient()),
    enabled: getPublicEnv().NEXT_PUBLIC_ANALYTICS_ENABLED,
    logger: getLogger(),
  });
  return service;
}
