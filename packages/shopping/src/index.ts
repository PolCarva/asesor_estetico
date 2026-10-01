// Motor de shopping: busca productos reales para las prendas de un look.
// Proveedores reales en `providers/` (registro de tiendas, sitemaps, descubrimiento web);
// los mocks quedan para tests y E2E (SHOPPING_PROVIDER=mock).
export * from "./cache";
export * from "./extract";
export * from "./fetch";
export * from "./mocks";
export * from "./normalize";
export * from "./providers/http";
export * from "./providers/live";
export * from "./providers/platforms";
export * from "./providers/registry";
export * from "./providers/robots";
export * from "./providers/search-providers";
export * from "./providers/sitemap";
export * from "./providers/web-search";
export * from "./rank";
export * from "./search";
export * from "./types";
