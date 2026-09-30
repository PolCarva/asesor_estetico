import type { AIOperation } from "@asesor/shared";
import type { z } from "zod";

import { AIError, normalizeAIError } from "./errors";
import {
  AnalyzeStyleProfileInputSchema,
  AnalyzeStyleProfileOutputSchema,
  ChatWithStyleAdvisorInputSchema,
  ChatWithStyleAdvisorOutputSchema,
  GenerateLookImageInputSchema,
  GenerateLookImageOutputSchema,
  GenerateLookSpecsInputSchema,
  GenerateLookSpecsOutputSchema,
  ValidatePhotosInputSchema,
  ValidatePhotosOutputSchema,
} from "./schemas";
import type { AICallOptions, AIProvider, AIResult, ProviderResponse } from "./types";

export interface RunOptions extends AICallOptions {
  /** Corta la operación si tarda más. Default: 120 s. */
  timeoutMs?: number;
  now?: () => number;
}

async function runOperation<I extends z.ZodType, O extends z.ZodType>(
  operation: AIOperation,
  provider: AIProvider,
  schemas: { input: I; output: O },
  rawInput: z.input<I>,
  call: (input: z.infer<I>, options: AICallOptions) => Promise<ProviderResponse>,
  options: RunOptions = {},
): Promise<AIResult<z.infer<O>>> {
  const now = options.now ?? Date.now;
  const started = now();

  const withContext = (error: unknown) => {
    const normalized = normalizeAIError(error);
    normalized.operation = operation;
    normalized.provider = provider.name;
    normalized.durationMs = now() - started;
    return normalized;
  };

  const parsedInput = schemas.input.safeParse(rawInput);
  if (!parsedInput.success) {
    throw withContext(
      new AIError("INVALID_INPUT", `Input inválido para ${operation}.`, {
        cause: parsedInput.error,
      }),
    );
  }

  const timeout = AbortSignal.timeout(options.timeoutMs ?? 120_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  let response: ProviderResponse;
  try {
    response = await new Promise<ProviderResponse>((resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      if (signal.aborted) return onAbort();
      signal.addEventListener("abort", onAbort, { once: true });
      call(parsedInput.data, { signal })
        .then(resolve, reject)
        .finally(() => {
          signal.removeEventListener("abort", onAbort);
        });
    });
  } catch (error) {
    throw withContext(error);
  }

  const parsedOutput = schemas.output.safeParse(response.output);
  if (!parsedOutput.success) throw withContext(parsedOutput.error);

  return {
    operation,
    data: parsedOutput.data,
    usage: { provider: provider.name, model: response.model, ...response.usage },
    timing: { started_at: new Date(started).toISOString(), duration_ms: now() - started },
  };
}

export const validatePhotos = (
  provider: AIProvider,
  input: z.input<typeof ValidatePhotosInputSchema>,
  options?: RunOptions,
) =>
  runOperation(
    "VALIDATE_PHOTOS",
    provider,
    { input: ValidatePhotosInputSchema, output: ValidatePhotosOutputSchema },
    input,
    (i, o) => provider.validatePhotos(i, o),
    options,
  );

export const analyzeStyleProfile = (
  provider: AIProvider,
  input: z.input<typeof AnalyzeStyleProfileInputSchema>,
  options?: RunOptions,
) =>
  runOperation(
    "ANALYZE_STYLE_PROFILE",
    provider,
    { input: AnalyzeStyleProfileInputSchema, output: AnalyzeStyleProfileOutputSchema },
    input,
    (i, o) => provider.analyzeStyleProfile(i, o),
    options,
  );

export const generateLookSpecs = (
  provider: AIProvider,
  input: z.input<typeof GenerateLookSpecsInputSchema>,
  options?: RunOptions,
) =>
  runOperation(
    "GENERATE_LOOK_SPECS",
    provider,
    { input: GenerateLookSpecsInputSchema, output: GenerateLookSpecsOutputSchema },
    input,
    (i, o) => provider.generateLookSpecs(i, o),
    options,
  );

export const generateLookImage = (
  provider: AIProvider,
  input: z.input<typeof GenerateLookImageInputSchema>,
  options?: RunOptions,
) =>
  runOperation(
    "GENERATE_LOOK_IMAGE",
    provider,
    { input: GenerateLookImageInputSchema, output: GenerateLookImageOutputSchema },
    input,
    (i, o) => provider.generateLookImage(i, o),
    options,
  );

export const chatWithStyleAdvisor = (
  provider: AIProvider,
  input: z.input<typeof ChatWithStyleAdvisorInputSchema>,
  options?: RunOptions,
) =>
  runOperation(
    "CHAT",
    provider,
    { input: ChatWithStyleAdvisorInputSchema, output: ChatWithStyleAdvisorOutputSchema },
    input,
    (i, o) => provider.chatWithStyleAdvisor(i, o),
    options,
  );
