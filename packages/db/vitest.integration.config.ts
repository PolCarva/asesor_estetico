import { defineConfig } from "vitest/config";

/** Tests contra el Supabase local (`pnpm db:start`). Ver test/integration/env.ts. */
export default defineConfig({
  test: {
    include: ["test/**/*.int.test.ts"],
    // Comparten la misma base: se ejecutan en serie.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
