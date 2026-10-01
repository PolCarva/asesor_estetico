import { afterAll, beforeAll, expect, it } from "vitest";

import { claimNextJob, completeJob, enqueueJob, failJob, retryJob } from "../../src/jobs";
import { adminClient, createTestUser, deleteTestUser, describeIntegration } from "./setup";

/**
 * Usa el tipo REFRESH_PRODUCT con product_id aleatorios. No correr con el worker
 * local prendido: podría tomar estos jobs.
 */
describeIntegration("cola de jobs (Postgres)", () => {
  const db = adminClient();
  const created: string[] = [];
  const types = ["REFRESH_PRODUCT" as const];
  const payload = () => ({ product_id: crypto.randomUUID() });

  const enqueue = async (extra: { maxAttempts?: number; idempotencyKey?: string } = {}) => {
    const job = await enqueueJob(db, {
      type: "REFRESH_PRODUCT",
      payload: payload(),
      priority: 100,
      ...extra,
    });
    created.push(job.id);
    return job;
  };

  beforeAll(async () => {
    // Limpia restos de corridas anteriores que hayan quedado en la cola.
    await db
      .from("jobs")
      .delete()
      .eq("type", "REFRESH_PRODUCT")
      .in("status", ["QUEUED", "RUNNING"]);
  });

  afterAll(async () => {
    if (created.length) await db.from("jobs").delete().in("id", created);
  });

  it("encola, toma y completa un job", async () => {
    const job = await enqueue();
    expect(job.status).toBe("QUEUED");
    const claimed = await claimNextJob(db, { workerId: "w1", types });
    expect(claimed?.id).toBe(job.id);
    expect(claimed).toMatchObject({ status: "RUNNING", attempts: 1, locked_by: "w1" });

    // Otro worker no puede completarlo.
    await expect(completeJob(db, { jobId: job.id, workerId: "w2" })).rejects.toMatchObject({
      code: "CONFLICT",
    });

    const done = await completeJob(db, { jobId: job.id, workerId: "w1", result: { ok: true } });
    expect(done).toMatchObject({ status: "COMPLETED", locked_by: null, result: { ok: true } });
    expect(done.finished_at).not.toBeNull();
  });

  it("no entrega el mismo job a dos workers concurrentes (SKIP LOCKED)", async () => {
    const jobs = await Promise.all([enqueue(), enqueue(), enqueue()]);
    const claims = await Promise.all(
      Array.from({ length: 6 }, (_, i) => claimNextJob(db, { workerId: `w${i}`, types })),
    );
    const ids = claims.filter((c) => c !== null).map((c) => c.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(new Set(ids)).toEqual(new Set(jobs.map((j) => j.id)));
    for (const claim of claims)
      if (claim) await completeJob(db, { jobId: claim.id, workerId: claim.locked_by! });
  });

  it("reintenta con backoff y falla definitivamente al agotar intentos", async () => {
    const job = await enqueue({ maxAttempts: 2 });
    const first = await claimNextJob(db, { workerId: "w1", types });
    const retried = await failJob(db, {
      job: first!,
      workerId: "w1",
      error: "boom",
      retryDelaySeconds: 0,
    });
    expect(retried).toMatchObject({ status: "QUEUED", attempts: 1, last_error: "boom" });

    const second = await claimNextJob(db, { workerId: "w1", types });
    expect(second).toMatchObject({ id: job.id, attempts: 2 });
    const failed = await failJob(db, { job: second!, workerId: "w1", error: "boom again" });
    expect(failed).toMatchObject({ status: "FAILED", attempts: 2 });

    const manual = await retryJob(db, job.id);
    expect(manual).toMatchObject({ status: "QUEUED", attempts: 0 });
    const third = await claimNextJob(db, { workerId: "w1", types });
    await completeJob(db, { jobId: third!.id, workerId: "w1" });
  });

  it("un error no reintentable falla de inmediato", async () => {
    await enqueue({ maxAttempts: 5 });
    const claimed = await claimNextJob(db, { workerId: "w1", types });
    const failed = await failJob(db, {
      job: claimed!,
      workerId: "w1",
      error: "payload inválido",
      retryable: false,
    });
    expect(failed).toMatchObject({ status: "FAILED", attempts: 1 });
  });

  it("respeta scheduled_at: un job con delay no se toma antes de tiempo", async () => {
    const job = await enqueue();
    const claimed = await claimNextJob(db, { workerId: "w1", types });
    await failJob(db, { job: claimed!, workerId: "w1", error: "later", retryDelaySeconds: 3600 });
    expect(await claimNextJob(db, { workerId: "w1", types })).toBeNull();
    await db.from("jobs").delete().eq("id", job.id);
  });

  it("idempotency key devuelve el job existente", async () => {
    const key = `test-${crypto.randomUUID()}`;
    const a = await enqueue({ idempotencyKey: key });
    const b = await enqueue({ idempotencyKey: key });
    expect(b.id).toBe(a.id);
    const claimed = await claimNextJob(db, { workerId: "w1", types });
    await completeJob(db, { jobId: claimed!.id, workerId: "w1" });
  });

  it("valida el payload antes de encolar", async () => {
    await expect(
      enqueueJob(db, { type: "REFRESH_PRODUCT", payload: { product_id: "no-uuid" } }),
    ).rejects.toThrow();
  });

  it("los clientes autenticados no pueden ejecutar funciones de la cola ni escribir jobs", async () => {
    const user = await createTestUser("jobs");
    try {
      const rpc = await user.client.rpc("claim_next_job", { p_worker_id: "hacker" });
      expect(rpc.error).not.toBeNull();
      const progress = await user.client.rpc("update_job_progress", {
        p_job_id: crypto.randomUUID(),
        p_worker_id: "hacker",
        p_progress: {},
      });
      expect(progress.error?.code).toBe("42501");
      const insert = await user.client
        .from("jobs")
        .insert({ type: "GENERATE_LOOK", user_id: user.id });
      expect(insert.error).not.toBeNull();
    } finally {
      await deleteTestUser(user.id);
    }
  });
});
