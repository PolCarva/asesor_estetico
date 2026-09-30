import type { AIUsageRecord, AnalyticsEventName } from "@asesor/shared";
import { describe, expect, it } from "vitest";

import { AnalyticsService, MemoryAnalyticsProvider } from "../src";

const usage: AIUsageRecord = {
  user_id: null,
  job_id: null,
  operation: "ANALYZE_STYLE_PROFILE",
  provider: "mock",
  model: "mock-vision-1",
  input_tokens: 10,
  output_tokens: 20,
  image_count: 0,
  estimated_cost_usd: 0,
  duration_ms: 5,
  success: true,
  metadata: {},
};

describe("AnalyticsService", () => {
  it("guarda eventos válidos", async () => {
    const provider = new MemoryAnalyticsProvider();
    const service = new AnalyticsService({ provider, enabled: true });
    expect(await service.trackEvent("landing_view", { path: "/", properties: { ref: "ig" } })).toBe(
      true,
    );
    expect(provider.events[0]).toMatchObject({ name: "landing_view", path: "/", user_id: null });
  });

  it("descarta eventos desconocidos o propiedades inválidas sin lanzar", async () => {
    const provider = new MemoryAnalyticsProvider();
    const service = new AnalyticsService({ provider, enabled: true });
    expect(await service.trackEvent("hack" as AnalyticsEventName)).toBe(false);
    expect(
      await service.trackEvent("landing_view", { properties: { nested: { a: 1 } as never } }),
    ).toBe(false);
    expect(provider.events).toHaveLength(0);
  });

  it("respeta el flag de habilitado pero siempre registra uso de IA", async () => {
    const provider = new MemoryAnalyticsProvider();
    const service = new AnalyticsService({ provider, enabled: false });
    expect(await service.trackEvent("landing_view")).toBe(false);
    expect(await service.recordAIUsage(usage)).toBe(true);
    expect(provider.usage).toHaveLength(1);
  });

  it("no rompe el flujo si el proveedor falla", async () => {
    const service = new AnalyticsService({
      enabled: true,
      provider: {
        track: async () => Promise.reject(new Error("db down")),
        recordAIUsage: async () => Promise.reject(new Error("db down")),
      },
    });
    expect(await service.trackEvent("landing_view")).toBe(false);
    expect(await service.recordAIUsage(usage)).toBe(false);
  });
});
