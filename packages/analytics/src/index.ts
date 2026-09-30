// Analytics de producto y registro de uso de IA. La implementación inicial guarda
// todo en Postgres (analytics_events, ai_usage) usando el cliente service role.
import { toJson, type TypedSupabaseClient } from "@asesor/db";
import {
  type AIUsageRecord,
  AIUsageRecordSchema,
  type AnalyticsEvent,
  type AnalyticsEventName,
  AnalyticsEventSchema,
  type AnalyticsProperties,
  type Logger,
} from "@asesor/shared";

export interface AnalyticsProvider {
  track(event: AnalyticsEvent): Promise<void>;
  recordAIUsage(record: AIUsageRecord): Promise<void>;
}

/** Guarda eventos y uso de IA en Postgres. Requiere un cliente service role. */
export class DatabaseAnalyticsProvider implements AnalyticsProvider {
  constructor(private readonly client: TypedSupabaseClient) {}

  async track(event: AnalyticsEvent) {
    const { error } = await this.client.from("analytics_events").insert({
      name: event.name,
      user_id: event.user_id,
      anonymous_id: event.anonymous_id,
      path: event.path,
      properties: event.properties,
    });
    if (error) throw new Error(`analytics_events insert failed: ${error.message}`);
  }

  async recordAIUsage(record: AIUsageRecord) {
    const { error } = await this.client.from("ai_usage").insert({
      ...record,
      metadata: toJson(record.metadata),
    });
    if (error) throw new Error(`ai_usage insert failed: ${error.message}`);
  }
}

/** Guarda en memoria: útil para tests. */
export class MemoryAnalyticsProvider implements AnalyticsProvider {
  readonly events: AnalyticsEvent[] = [];
  readonly usage: AIUsageRecord[] = [];
  async track(event: AnalyticsEvent) {
    this.events.push(event);
  }
  async recordAIUsage(record: AIUsageRecord) {
    this.usage.push(record);
  }
}

export interface TrackOptions {
  userId?: string | null;
  anonymousId?: string | null;
  path?: string | null;
  properties?: AnalyticsProperties;
}

export interface AnalyticsServiceOptions {
  provider: AnalyticsProvider;
  /** Si es false, trackEvent no guarda nada (recordAIUsage sigue activo: es control de costos). */
  enabled: boolean;
  logger?: Logger;
}

/**
 * Punto único para emitir eventos. Nunca lanza: un fallo de analytics no puede
 * romper el flujo del usuario. Valida con Zod antes de guardar.
 */
export class AnalyticsService {
  constructor(private readonly options: AnalyticsServiceOptions) {}

  async trackEvent(name: AnalyticsEventName, options: TrackOptions = {}): Promise<boolean> {
    if (!this.options.enabled) return false;
    const parsed = AnalyticsEventSchema.safeParse({
      name,
      user_id: options.userId ?? null,
      anonymous_id: options.anonymousId ?? null,
      path: options.path ?? null,
      properties: options.properties ?? {},
    });
    if (!parsed.success) {
      this.options.logger?.warn("analytics: evento inválido descartado", { event: name });
      return false;
    }
    try {
      await this.options.provider.track(parsed.data);
      return true;
    } catch (error) {
      this.options.logger?.error("analytics: no se pudo guardar el evento", { event: name, error });
      return false;
    }
  }

  async recordAIUsage(record: AIUsageRecord): Promise<boolean> {
    const parsed = AIUsageRecordSchema.safeParse(record);
    if (!parsed.success) {
      this.options.logger?.warn("analytics: registro de uso de IA inválido", {
        operation: record.operation,
      });
      return false;
    }
    try {
      await this.options.provider.recordAIUsage(parsed.data);
      return true;
    } catch (error) {
      this.options.logger?.error("analytics: no se pudo guardar ai_usage", {
        operation: record.operation,
        error,
      });
      return false;
    }
  }
}
