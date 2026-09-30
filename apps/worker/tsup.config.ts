import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node24",
  clean: true,
  sourcemap: true,
  // Bundle autocontenido: la imagen Docker no necesita node_modules.
  noExternal: [/.*/],
  // Dependencias CommonJS dentro de un bundle ESM necesitan `require`.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
