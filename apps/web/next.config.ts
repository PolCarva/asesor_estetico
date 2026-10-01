import { resolve } from "node:path";

import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// El .env vive en la raíz del monorepo (compartido con el worker). forceReload: Next ya
// cargó (y cacheó) el env de apps/web, que no tiene archivos .env propios.
loadEnvConfig(
  resolve(import.meta.dirname, "../.."),
  process.env.NODE_ENV !== "production",
  undefined,
  true,
);

const isDev = process.env.NODE_ENV !== "production";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/**
 * CSP sin nonces: Next.js necesita 'unsafe-inline' para sus scripts de hidratación.
 * Se restringen orígenes, frames, formularios y objetos.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Fotos de productos de las tiendas (D16): cualquier origen https; las <img> van con
  // referrerPolicy="no-referrer" y solo con URLs https de páginas de producto validadas.
  `img-src 'self' data: blob: ${supabaseUrl} https:`,
  "font-src 'self'",
  `connect-src 'self' ${supabaseUrl}${isDev ? " ws:" : ""}`,
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "worker-src 'self'",
  "manifest-src 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isDev
    ? []
    : [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      ]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Los paquetes internos exportan TypeScript sin compilar; Next los transpila.
  transpilePackages: [
    "@asesor/ai",
    "@asesor/analytics",
    "@asesor/config",
    "@asesor/db",
    "@asesor/payments",
    "@asesor/shared",
    "@asesor/shopping",
  ],
  experimental: {
    // Fotos de hasta 10 MB + overhead de multipart.
    serverActions: { bodySizeLimit: "11mb" },
  },
  async redirects() {
    // Atajo: /dashboard lleva al dashboard real (las rutas de usuario viven bajo /app).
    return [{ source: "/dashboard", destination: "/app/dashboard", permanent: false }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // El service worker nunca se cachea: siempre se usa la última versión.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        // Páginas y APIs autenticadas: nunca en caches compartidos ni del navegador.
        source: "/(app|admin|api)/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

export default nextConfig;
