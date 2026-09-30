import type { AIOperation } from "@asesor/shared";

import type {
  AnalyzeStyleProfileInput,
  ChatWithStyleAdvisorInput,
  GenerateLookImageInput,
  GenerateLookSpecsInput,
  ValidatePhotosInput,
} from "./schemas";

export interface AIUsage {
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  image_count: number;
  estimated_cost_usd: number;
}

export interface AITiming {
  started_at: string;
  duration_ms: number;
}

/** Resultado de una operación: output validado + uso + tiempos. */
export interface AIResult<T> {
  operation: AIOperation;
  data: T;
  usage: AIUsage;
  timing: AITiming;
}

/** Respuesta cruda de un proveedor, antes de validar el output. */
export interface ProviderResponse {
  output: unknown;
  model: string;
  usage: Omit<AIUsage, "provider" | "model">;
}

export interface AICallOptions {
  signal?: AbortSignal;
}

/**
 * Contrato que implementa cada proveedor (mock, OpenAI...). Los proveedores no
 * validan su output: lo hace la capa de operaciones con Zod.
 */
export interface AIProvider {
  readonly name: string;
  validatePhotos(input: ValidatePhotosInput, options?: AICallOptions): Promise<ProviderResponse>;
  analyzeStyleProfile(
    input: AnalyzeStyleProfileInput,
    options?: AICallOptions,
  ): Promise<ProviderResponse>;
  generateLookSpecs(
    input: GenerateLookSpecsInput,
    options?: AICallOptions,
  ): Promise<ProviderResponse>;
  generateLookImage(
    input: GenerateLookImageInput,
    options?: AICallOptions,
  ): Promise<ProviderResponse>;
  chatWithStyleAdvisor(
    input: ChatWithStyleAdvisorInput,
    options?: AICallOptions,
  ): Promise<ProviderResponse>;
}
