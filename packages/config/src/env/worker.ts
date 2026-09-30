import { type EnvSource, parseEnv } from "./parse";
import { type WorkerEnv, WorkerEnvSchema } from "./schemas";
import { assertServerRuntime } from "./server";

export type { WorkerEnv };

/** Variables privadas del worker. */
export function getWorkerEnv(source: EnvSource = process.env): WorkerEnv {
  assertServerRuntime("worker");
  return parseEnv(WorkerEnvSchema, source, "worker");
}
