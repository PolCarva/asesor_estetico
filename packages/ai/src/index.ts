// Abstracción de IA: operaciones tipadas con output validado por Zod, uso, tiempos
// y errores normalizados. Los proveedores concretos se inyectan.
import { MockAIProvider } from "./providers/mock";
import { OpenRouterProvider, type OpenRouterProviderOptions } from "./providers/openrouter";
import type { AIProvider } from "./types";

export * from "./errors";
export * from "./json-schema";
export * from "./operations";
export * from "./prompts";
export * from "./providers/image-size";
export * from "./providers/mock";
export * from "./providers/openrouter";
export * from "./schemas";
export * from "./types";

export type AIProviderConfig =
  { provider: "mock" } | ({ provider: "openrouter" } & OpenRouterProviderOptions);

/** Crea el proveedor configurado. `mock` no hace red ni cuesta dinero. */
export function createAIProvider(config: AIProviderConfig): AIProvider {
  return config.provider === "openrouter" ? new OpenRouterProvider(config) : new MockAIProvider();
}
