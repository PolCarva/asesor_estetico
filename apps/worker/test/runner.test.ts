import { MockAIProvider } from "@asesor/ai";
import { AnalyticsService, MemoryAnalyticsProvider } from "@asesor/analytics";
import type { Json, JobRow, TypedSupabaseClient } from "@asesor/db";
import { createLogger, type JobType } from "@asesor/shared";
import { MockProductFetcher, MockSearchProvider } from "@asesor/shopping";
import { describe, expect, it } from "vitest";

import { handlers } from "../src/handlers";
import { type HandlerRegistry, NonRetryableJobError } from "../src/handlers/types";
import type { JobQueue } from "../src/queue";
import { WorkerRunner } from "../src/runner";

const USER = "11111111-1111-4111-8111-111111111111";
const LOOK = "22222222-2222-4222-8222-222222222222";

function job(type: JobType, payload: NonNullable<Json>, overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: crypto.randomUUID(),
    type,
    status: "QUEUED",
    user_id: USER,
    payload,
    result: null,
    priority: 0,
    attempts: 0,
    max_attempts: 3,
    idempotency_key: null,
    scheduled_at: new Date().toISOString(),
    locked_at: null,
    locked_by: null,
    finished_at: null,
    last_error: null,
    progress: null,
    look_id: null,
    garment_slot: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/** Cola en memoria con la misma semántica de reintentos que la de Postgres. */
function memoryQueue(initial: JobRow[]) {
  const pending = [...initial];
  const completed: Array<{ job: JobRow; result: Json | undefined }> = [];
  const failed: Array<{ job: JobRow; error: string; retryable: boolean }> = [];
  const queue: JobQueue = {
    async claim() {
      const next = pending.shift();
      return next ? { ...next, status: "RUNNING", attempts: next.attempts + 1 } : null;
    },
    async complete(j, result) {
      completed.push({ job: j, result });
    },
    async fail(j, error, { retryable }) {
      failed.push({ job: j, error, retryable });
      if (retryable && j.attempts < j.max_attempts) pending.push({ ...j, status: "QUEUED" });
    },
  };
  return { queue, pending, completed, failed };
}

const silent = createLogger({ service: "test", write: () => {} });

function deps(analytics = new MemoryAnalyticsProvider()) {
  return {
    analytics,
    deps: {
      // Los tests del runner no tocan la base: el pipeline se prueba en pipeline.int.test.ts.
      db: {} as TypedSupabaseClient,
      ai: new MockAIProvider(),
      analytics: new AnalyticsService({ provider: analytics, enabled: true }),
      searchProvider: new MockSearchProvider(),
      fetcher: new MockProductFetcher(),
    },
  };
}

async function runUntilIdle(runner: WorkerRunner, isDone: () => boolean) {
  const started = runner.start();
  for (let i = 0; i < 200 && !isDone(); i++) await new Promise((r) => setTimeout(r, 5));
  await runner.stop();
  await started;
}

describe("WorkerRunner", () => {
  it("procesa jobs con los handlers registrados", async () => {
    // REFRESH_PRODUCT y SEARCH_PRODUCTS usan la base: se prueban en shopping.int.test.ts.
    const { queue, completed } = memoryQueue([
      job("GENERATE_STYLE_BOARD", { user_id: USER, style_profile_id: LOOK }),
      job("GENERATE_STYLE_BOARD", { user_id: USER, style_profile_id: USER }),
    ]);
    const runner = new WorkerRunner({
      queue,
      handlers,
      deps: deps().deps,
      logger: silent,
      concurrency: 2,
      pollIntervalMs: 5,
    });
    await runUntilIdle(runner, () => completed.length === 2);
    expect(completed.map((c) => c.result)).toEqual(
      expect.arrayContaining([
        { style_profile_id: LOOK, mock: true },
        { style_profile_id: USER, mock: true },
      ]),
    );
  });

  it("respeta la concurrencia configurada", async () => {
    let active = 0;
    let maxActive = 0;
    const slow: HandlerRegistry = {
      REFRESH_PRODUCT: async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 20));
        active--;
        return { ok: true };
      },
    };
    const { queue, completed } = memoryQueue(
      Array.from({ length: 6 }, () => job("REFRESH_PRODUCT", {})),
    );
    const runner = new WorkerRunner({
      queue,
      handlers: slow,
      deps: deps().deps,
      logger: silent,
      concurrency: 3,
      pollIntervalMs: 5,
    });
    await runUntilIdle(runner, () => completed.length === 6);
    expect(maxActive).toBe(3);
  });

  it("reintenta errores transitorios y no reintenta los definitivos", async () => {
    let calls = 0;
    const flaky: HandlerRegistry = {
      REFRESH_PRODUCT: async () => {
        calls++;
        if (calls < 2) throw new Error("tienda caída");
        return { ok: true };
      },
      GENERATE_LOOK: async () => {
        throw new NonRetryableJobError("look inexistente");
      },
    };
    const { queue, completed, failed } = memoryQueue([
      job("REFRESH_PRODUCT", {}),
      job("GENERATE_LOOK", {}),
    ]);
    const runner = new WorkerRunner({
      queue,
      handlers: flaky,
      deps: deps().deps,
      logger: silent,
      concurrency: 1,
      pollIntervalMs: 5,
    });
    await runUntilIdle(runner, () => completed.length === 1 && failed.length === 2);
    expect(completed[0]?.job.attempts).toBe(2);
    expect(failed.find((f) => f.job.type === "REFRESH_PRODUCT")).toMatchObject({ retryable: true });
    expect(failed.find((f) => f.job.type === "GENERATE_LOOK")).toMatchObject({
      retryable: false,
      error: expect.stringContaining("look inexistente"),
    });
  });

  it("falla sin reintento si el payload es inválido o no hay handler", async () => {
    const { queue, failed } = memoryQueue([job("GENERATE_LOOK", { look_id: "x" })]);
    const runner = new WorkerRunner({
      queue,
      handlers: { GENERATE_LOOK: handlers.GENERATE_LOOK },
      deps: deps().deps,
      logger: silent,
      concurrency: 1,
      pollIntervalMs: 5,
    });
    await runUntilIdle(runner, () => failed.length === 1);
    expect(failed[0]).toMatchObject({ retryable: false });

    const other = memoryQueue([job("GENERATE_STYLE_BOARD", {})]);
    const runner2 = new WorkerRunner({
      queue: other.queue,
      handlers: {},
      deps: deps().deps,
      logger: silent,
      concurrency: 1,
      pollIntervalMs: 5,
    });
    await runUntilIdle(runner2, () => other.failed.length === 1);
    expect(other.failed[0]?.error).toContain("Sin handler");
  });

  it("el progreso es best-effort: se guarda en la cola y una falla al guardarlo no rompe el job", async () => {
    const saved: unknown[] = [];
    const { queue, completed, failed } = memoryQueue([job("REFRESH_PRODUCT", {})]);
    let calls = 0;
    queue.progress = async (_job, progress) => {
      if (++calls === 2) throw new Error("base caída");
      saved.push(progress);
    };
    const reporting: HandlerRegistry = {
      REFRESH_PRODUCT: async (_job, ctx) => {
        await ctx.reportProgress({ stage: "SEARCHING" });
        await ctx.reportProgress({ stage: "CHECKING_STORES" });
        await ctx.reportProgress({ stage: "RANKING" });
        return { ok: true };
      },
    };
    const runner = new WorkerRunner({
      queue,
      handlers: reporting,
      deps: deps().deps,
      logger: silent,
      concurrency: 1,
      pollIntervalMs: 5,
    });
    await runUntilIdle(runner, () => completed.length === 1);
    expect(saved).toEqual([{ stage: "SEARCHING" }, { stage: "RANKING" }]);
    expect(failed).toEqual([]);
  });

  it("apagado limpio: espera el job en curso antes de terminar", async () => {
    let finished = false;
    const slow: HandlerRegistry = {
      REFRESH_PRODUCT: async () => {
        await new Promise((r) => setTimeout(r, 50));
        finished = true;
        return { ok: true };
      },
    };
    const { queue, completed } = memoryQueue([job("REFRESH_PRODUCT", {})]);
    const runner = new WorkerRunner({
      queue,
      handlers: slow,
      deps: deps().deps,
      logger: silent,
      concurrency: 1,
      pollIntervalMs: 5,
    });
    const started = runner.start();
    await new Promise((r) => setTimeout(r, 10));
    expect(runner.activeJobs).toBe(1);
    await runner.stop();
    await started;
    expect(finished).toBe(true);
    expect(completed).toHaveLength(1);
  });

  it("aborta jobs que exceden el timeout de apagado y los deja reintentables", async () => {
    const stuck: HandlerRegistry = {
      REFRESH_PRODUCT: (_job, ctx) =>
        new Promise((_, reject) =>
          ctx.signal.addEventListener("abort", () => reject(ctx.signal.reason)),
        ),
    };
    const { queue, failed } = memoryQueue([job("REFRESH_PRODUCT", {})]);
    const runner = new WorkerRunner({
      queue,
      handlers: stuck,
      deps: deps().deps,
      logger: silent,
      concurrency: 1,
      pollIntervalMs: 5,
      shutdownTimeoutMs: 20,
    });
    const started = runner.start();
    await new Promise((r) => setTimeout(r, 10));
    await runner.stop();
    await started;
    expect(failed[0]).toMatchObject({
      retryable: true,
      error: expect.stringContaining("worker shutdown"),
    });
  });
});
