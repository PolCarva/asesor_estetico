/** Reglas comunes a todas las configs de ESLint del monorepo. */
export const sharedRules = {
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    // La configuración se lee solo a través de @asesor/config/env/* (validada con Zod).
    "no-restricted-properties": [
      "error",
      {
        object: "process",
        property: "env",
        message:
          "Usá getPublicEnv/getServerEnv/getWorkerEnv de @asesor/config en lugar de process.env.",
      },
    ],
  },
};

/** Archivos donde leer process.env directamente es legítimo (configs, scripts, tests). */
export const envAccessAllowed = {
  files: [
    "**/*.config.{js,mjs,ts}",
    "**/scripts/**",
    "**/test/**",
    "**/e2e/**",
    "**/*.test.ts",
    "**/src/env/**",
  ],
  rules: { "no-restricted-properties": "off" },
};
