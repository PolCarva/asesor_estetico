#!/usr/bin/env node
// Crea .env a partir de .env.example y completa las claves del Supabase local
// (`supabase status`). No pisa valores que ya estén cargados en .env.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const envPath = resolve(root, ".env");
const examplePath = resolve(root, ".env.example");

let status;
try {
  const bin = resolve(root, "node_modules/.bin/supabase");
  const output = execFileSync(existsSync(bin) ? bin : "supabase", ["status", "-o", "json"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  status = JSON.parse(output.slice(output.indexOf("{")));
} catch {
  console.error("[env] No se pudo leer `supabase status`. Corré `pnpm db:start` primero.");
  process.exit(1);
}

const fromSupabase = {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
};

const current = existsSync(envPath)
  ? readFileSync(envPath, "utf8")
  : readFileSync(examplePath, "utf8");
const lines = current.split("\n").map((line) => {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (!match) return line;
  const [, key, value] = match;
  if (key in fromSupabase && !value) return `${key}=${fromSupabase[key]}`;
  return line;
});

writeFileSync(envPath, lines.join("\n"), { mode: 0o600 });
console.log("[env] .env listo con las claves del Supabase local.");
