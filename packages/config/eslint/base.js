import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

import { envAccessAllowed, sharedRules } from "./shared-rules.js";

/** Config base para paquetes TypeScript (librerías y Node). */
export default defineConfig([
  globalIgnores(["dist/**", "coverage/**"]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.node,
    },
  },
  sharedRules,
  envAccessAllowed,
  prettier,
]);
