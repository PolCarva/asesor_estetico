import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import { defineConfig, globalIgnores } from "eslint/config";

import { envAccessAllowed, sharedRules } from "./shared-rules.js";

/** Config para apps Next.js. */
export default defineConfig([
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
  ]),
  nextVitals,
  nextTs,
  sharedRules,
  envAccessAllowed,
  prettier,
]);
