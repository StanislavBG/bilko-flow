/**
 * LLM Integration Module — Structured JSON from LLM providers.
 *
 * Calls the configured LLM provider and parses the response as JSON.
 * No fallback, no regex repair, no silent retries. If the LLM returns
 * invalid JSON or the API key is missing/wrong, it fails immediately
 * with a clear error.
 */

import { createTypedError, TypedError, maskSecretsInMessage } from '../domain/errors';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Supported LLM provider identifiers. */
export type LLMProvider =
  | 'gemini'
  | 'openai'
  | 'claude'
  | 'ollama'
  | 'vllm'
  | 'tgi'
  | 'local-ai'
  | 'custom';

/** Configuration for an LLM chat request. */
export interface ChatOptions {
  /** The LLM provider to use. */
  provider: LLMProvider;
  /** Model identifier (e.g. "gemini-1.5-pro", "gpt-4o", "claude-sonnet-4-20250514"). */
  model: string;
  /** The prompt / messages to send. */
  messages: ChatMessage[];
  /** Optional system prompt. */
  systemPrompt?: string;
  /** API key for the provider. */
  apiKey: string;
  /** Base URL override for the provider API. */
  baseUrl?: string;
  /** Maximum tokens to generate. */
  maxTokens?: number;
  /** Temperature (0-2). */
  temperature?: number;
}

/** A single chat message. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Response from a raw LLM call. */
export interface LLMRawResponse {
  content: string;
  finishReason?: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
}

/** Configuration for response format constraint. */
export interface ResponseFormatConfig {
  type: 'json_object' | 'text';
}

/** Options for the underlying LLM call (used by adapters). */
export interface LLMCallOptions {
  provider: LLMProvider;
  model: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  apiKey: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: ResponseFormatConfig;
}

/**
 * Adapter function type for calling an LLM provider.
 * Implementations handle the HTTP call to the specific provider API.
 */
export type LLMAdapter = (options: LLMCallOptions) => Promise<LLMRawResponse>;

// ─── Error Types ────────────────────────────────────────────────────────────

/** Error thrown when LLM response cannot be parsed as valid JSON. */
export class LLMParseError extends Error {
  public readonly typedError: TypedError;
  public readonly rawResponse: string;
  public readonly attempts: number;

  constructor(message: string, rawResponse: string, attempts: number) {
    super(message);
    this.name = 'LLMParseError';
    this.rawResponse = rawResponse;
    this.attempts = attempts;
    /**
     * ═══════════════════════════════════════════════════════════════════
     * rawResponsePreview is TRUNCATED to 200 chars (v0.3.0 — RESILIENCY)
     * ═══════════════════════════════════════════════════════════════════
     *
     * The audit identified that raw LLM responses included in TypedError
     * details could leak API keys, tokens, or sensitive content when the
     * error propagates to API responses, webhook payloads, or event
     * streams. Truncating to 200 chars limits exposure while still
     * providing enough context for debugging.
     * ═══════════════════════════════════════════════════════════════════
     */
    this.typedError = createTypedError({
      code: 'PLANNER.LLM_PARSE',
      message,
      retryable: false,
      details: {
        rawResponsePreview: rawResponse.slice(0, 200),
        attempts,
      },
      suggestedFixes: [
        { type: 'CHECK_API_KEY', params: {} },
      ],
    });
  }
}

/** Error thrown when the LLM provider returns a non-200 response. */
export class LLMProviderError extends Error {
  public readonly typedError: TypedError;
  public readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'LLMProviderError';
    this.statusCode = statusCode;
    this.typedError = createTypedError({
      code: 'PLANNER.LLM_PROVIDER',
      message,
      retryable: false,
      details: { statusCode },
      suggestedFixes: [
        { type: 'CHECK_API_KEY', params: {} },
      ],
    });
  }
}

// ─── JSON Parsing ───────────────────────────────────────────────────────────

/**
 * Parse an LLM response as JSON. No regex repair, no extraction heuristics.
 * The response must be valid JSON or this throws LLMParseError.
 */
export function cleanLLMResponse(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    throw new LLMParseError(
      `LLM response is not valid JSON: ${err instanceof Error ? err.message : 'unknown error'}`,
      raw,
      1,
    );
  }
}

// ─── LLM Adapter Registry ──────────────────────────────────────────────────

const adapters = new Map<LLMProvider, LLMAdapter>();

/** Register an LLM provider adapter. */
export function registerLLMAdapter(provider: LLMProvider, adapter: LLMAdapter): void {
  adapters.set(provider, adapter);
}

/** Get the registered adapter for a provider, or throw. */
function getAdapter(provider: LLMProvider): LLMAdapter {
  const adapter = adapters.get(provider);
  if (!adapter) {
    throw new LLMProviderError(
      `No adapter registered for LLM provider: ${provider}. ` +
      `Register one with registerLLMAdapter().`,
    );
  }
  return adapter;
}

// ─── Provider Support ───────────────────────────────────────────────────────

/**
 * Providers that support response_format: { type: "json_object" }.
 *
 * Ollama, vLLM, TGI, and LocalAI all support JSON-constrained output
 * through grammar-based decoding or response_format parameters,
 * addressing the critique's JSON constraint limitation.
 */
const JSON_MODE_PROVIDERS = new Set<LLMProvider>([
  'gemini',
  'openai',
  'ollama',
  'vllm',
  'tgi',
  'local-ai',
]);

/** Check if a provider supports native JSON mode. */
export function supportsJsonMode(provider: LLMProvider): boolean {
  return JSON_MODE_PROVIDERS.has(provider);
}

/** Open-source providers that support local deployment. */
export const OPEN_SOURCE_PROVIDERS = new Set<LLMProvider>([
  'ollama',
  'vllm',
  'tgi',
  'local-ai',
]);

/** Check if a provider is an open-source / local provider. */
export function isOpenSourceProvider(provider: LLMProvider): boolean {
  return OPEN_SOURCE_PROVIDERS.has(provider);
}

// ─── Core: chatJSON ─────────────────────────────────────────────────────────

/**
 * Send a chat request to an LLM and parse the response as JSON.
 *
 * Calls the provider once. If the response is not valid JSON, throws
 * LLMParseError. If the provider returns an error (bad API key, network
 * failure, etc.), throws LLMProviderError. No retries, no fallback.
 *
 * @throws LLMParseError if the response is not valid JSON
 * @throws LLMProviderError if the LLM provider returns an error
 */
export async function chatJSON<T>(options: ChatOptions): Promise<T> {
  if (!options.apiKey) {
    throw new LLMProviderError(
      `API key is required for provider "${options.provider}". Provide a valid API key.`,
      401,
    );
  }

  const adapter = getAdapter(options.provider);
  const useJsonMode = supportsJsonMode(options.provider);

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * SECRET MASKING IN LLM ERRORS (v0.3.0 — RESILIENCY ENHANCEMENT)
   * ═══════════════════════════════════════════════════════════════════════
   *
   * The architectural audit identified that LLM provider errors could
   * include the API key in error messages (e.g., when the key appears
   * in a URL or the provider echoes it back). We wrap the adapter call
   * to sanitize any error messages before they propagate.
   * ═══════════════════════════════════════════════════════════════════════
   */
  const secretsToMask = [options.apiKey];
  let response;
  try {
    response = await adapter({
      provider: options.provider,
      model: options.model,
      messages: options.messages,
      systemPrompt: options.systemPrompt,
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      responseFormat: useJsonMode ? { type: 'json_object' } : undefined,
    });
  } catch (err) {
    if (err instanceof Error) {
      err.message = maskSecretsInMessage(err.message, secretsToMask);
    }
    throw err;
  }

  const parsed = cleanLLMResponse(response.content);
  return parsed as T;
}

// ─── Typed Error Factories ──────────────────────────────────────────────────

export function llmParseError(message: string, rawPreview: string, attempts: number): TypedError {
  return createTypedError({
    code: 'PLANNER.LLM_PARSE',
    message,
    retryable: false,
    details: { rawResponsePreview: rawPreview.slice(0, 500), attempts },
    suggestedFixes: [
      { type: 'CHECK_API_KEY', params: {} },
    ],
  });
}

export function llmProviderError(message: string, statusCode?: number): TypedError {
  return createTypedError({
    code: 'PLANNER.LLM_PROVIDER',
    message,
    retryable: false,
    details: { statusCode },
    suggestedFixes: [
      { type: 'CHECK_API_KEY', params: {} },
    ],
  });
}

// ─── Re-exports: Open-Source Model Support ──────────────────────────────────

export {
  ModelRegistry,
  ModelEntry,
  ModelCapabilities,
  ModelResourceRequirements,
  ModelHealthStatus,
  ModelHealthResult,
  ModelQuery,
} from './model-registry';

export {
  ResourceConfig,
  GpuConfig,
  MemoryConfig,
  BatchConfig,
  QuantizationConfig,
  ResourceValidationResult,
  createResourceConfig,
  validateResourceConfig,
  estimateVramGb,
} from './resource-config';

export {
  StreamChunk,
  StreamOptions,
  StreamAdapter,
  registerStreamAdapter,
  getStreamAdapter,
  createLLMStream,
  collectStream,
  parseSSEStream,
  createOllamaStreamAdapter,
  createOpenAICompatibleStreamAdapter,
} from './streaming';

export {
  registerOllamaAdapter,
  registerVllmAdapter,
  registerTgiAdapter,
  registerLocalAIAdapter,
  registerAllOpenSourceAdapters,
  OLLAMA_DEFAULT_BASE_URL,
  VLLM_DEFAULT_BASE_URL,
  TGI_DEFAULT_BASE_URL,
  LOCAL_AI_DEFAULT_BASE_URL,
} from './adapters';
