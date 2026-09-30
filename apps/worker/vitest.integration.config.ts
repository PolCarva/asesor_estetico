import { defineConfig } from "vitest/config";

/** Pipeline completo contra el Supabase local, con MockAIProvider (sin costo). */
export default defineConfig({
  test: {
    include: ["test/**/*.int.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
