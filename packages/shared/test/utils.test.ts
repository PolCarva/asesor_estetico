import { describe, expect, it } from "vitest";

import { AppError, createLogger, createMemoryRateLimiter, redact, REDACTED } from "../src";

describe("logger", () => {
  it("escribe JSON y redacta claves sensibles", () => {
    const lines: string[] = [];
    const logger = createLogger({ service: "test", write: (line) => lines.push(line) });
    logger.info("hola", {
      userId: "u1",
      access_token: "abc",
      headers: { authorization: "Bearer x", cookie: "sb=1" },
      signedUrl: "https://x.test/signed?token=1",
      payload: { photo: "base64..." },
    });
    const entry = JSON.parse(lines[0]!);
    expect(entry).toMatchObject({ level: "info", service: "test", msg: "hola", userId: "u1" });
    expect(entry.access_token).toBe(REDACTED);
    expect(entry.headers.authorization).toBe(REDACTED);
    expect(entry.headers.cookie).toBe(REDACTED);
    expect(entry.signedUrl).toBe(REDACTED);
    expect(entry.payload).toBe(REDACTED);
  });

  it("respeta el nivel mínimo y los bindings del child", () => {
    const lines: string[] = [];
    const logger = createLogger({ service: "t", level: "warn", write: (l) => lines.push(l) }).child(
      { jobId: "j1" },
    );
    logger.info("no");
    logger.error("sí", { error: new Error("boom") });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      jobId: "j1",
      error: { name: "Error", message: "boom" },
    });
  });

  it("trunca strings largos", () => {
    expect((redact("x".repeat(1000)) as string).length).toBeLessThan(600);
  });
});

describe("rate limiter en memoria", () => {
  it("limita por ventana y se reinicia", async () => {
    let t = 0;
    const limiter = createMemoryRateLimiter({ limit: 2, windowMs: 1000 }, () => t);
    expect((await limiter.consume("u")).allowed).toBe(true);
    expect((await limiter.consume("u")).allowed).toBe(true);
    expect((await limiter.consume("u")).allowed).toBe(false);
    expect((await limiter.consume("otro")).allowed).toBe(true);
    t = 1001;
    expect((await limiter.consume("u")).allowed).toBe(true);
  });
});

describe("AppError", () => {
  it("mapea códigos a HTTP", () => {
    expect(new AppError("AUTH_REQUIRED").httpStatus).toBe(401);
    expect(new AppError("NOT_FOUND").httpStatus).toBe(404);
    expect(new AppError("PREMIUM_REQUIRED").httpStatus).toBe(402);
  });
});
