import { describe, expect, it } from "vitest";

import { parseEnv } from "../src/env/parse";
import { PublicEnvSchema, ServerEnvSchema, WorkerEnvSchema } from "../src/env/schemas";
import { getServerEnv } from "../src/env/server";
import { getWorkerEnv } from "../src/env/worker";

const base = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
};

describe("env", () => {
  it("parsea variables públicas con defaults", () => {
    const env = parseEnv(PublicEnvSchema, base, "test");
    expect(env.NEXT_PUBLIC_ANALYTICS_ENABLED).toBe(false);
    expect(
      parseEnv(PublicEnvSchema, { ...base, NEXT_PUBLIC_ANALYTICS_ENABLED: "true" }, "t"),
    ).toMatchObject({ NEXT_PUBLIC_ANALYTICS_ENABLED: true });
  });

  it("trata strings vacíos como ausentes", () => {
    const env = getServerEnv({
      ...base,
      SUPABASE_SERVICE_ROLE_KEY: "srv",
      MERCADOPAGO_WEBHOOK_SECRET: "",
    });
    expect(env.MERCADOPAGO_WEBHOOK_SECRET).toBeUndefined();
    expect(env.NODE_ENV).toBe("development");
  });

  it("nombra las variables faltantes sin mostrar valores", () => {
    const secret = "super-secret-value";
    expect(() =>
      parseEnv(ServerEnvSchema, { ...base, NEXT_PUBLIC_APP_URL: secret }, "server"),
    ).toThrowError(/NEXT_PUBLIC_APP_URL, SUPABASE_SERVICE_ROLE_KEY/);
    try {
      parseEnv(ServerEnvSchema, { ...base, NEXT_PUBLIC_APP_URL: secret }, "server");
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });

  it("el esquema público no acepta secretos", () => {
    expect(Object.keys(PublicEnvSchema.shape)).toEqual(
      expect.not.arrayContaining(["SUPABASE_SERVICE_ROLE_KEY", "OPENROUTER_API_KEY"]),
    );
    expect(Object.keys(PublicEnvSchema.shape).every((k) => k.startsWith("NEXT_PUBLIC_"))).toBe(
      true,
    );
  });

  it("AI_PROVIDER=openrouter exige la API key y usa modelos por defecto", () => {
    const worker = { ...base, SUPABASE_SERVICE_ROLE_KEY: "srv" };
    expect(getWorkerEnv(worker).AI_PROVIDER).toBe("mock");
    expect(() => getWorkerEnv({ ...worker, AI_PROVIDER: "openrouter" })).toThrowError(
      /OPENROUTER_API_KEY/,
    );
    const env = getWorkerEnv({ ...worker, AI_PROVIDER: "openrouter", OPENROUTER_API_KEY: "k" });
    expect(env.OPENROUTER_TEXT_MODEL).toContain("/");
    expect(env.AI_IMAGE_QUALITY).toBe("medium");
  });

  it("valida la concurrencia del worker", () => {
    const env = getWorkerEnv({
      ...base,
      SUPABASE_SERVICE_ROLE_KEY: "srv",
      WORKER_CONCURRENCY: "4",
    });
    expect(env.WORKER_CONCURRENCY).toBe(4);
    expect(() =>
      parseEnv(
        WorkerEnvSchema,
        { ...base, SUPABASE_SERVICE_ROLE_KEY: "s", WORKER_CONCURRENCY: "0" },
        "w",
      ),
    ).toThrow();
  });
});
