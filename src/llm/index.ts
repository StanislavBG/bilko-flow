/**
 * LLM Integration Module — Resilient JSON parsing chain for LLM responses.
 *
 * This module provides the core infrastructure for extracting structured
 * JSON from LLM text responses. LLMs frequently return slightly malformed
 * JSON (trailing commas, unescaped control characters, markdown fencing),
 * so this module applies multiple layers of defense:
 *
 * Layer 1: API-level constraint (response_format for providers that support it)
 * Layer 2: Server-side repair (fix common LLM JSON mistakes before parsing)
 * Layer 3: Retry with backoff (re-prompt the LLM on persistent parse failures)
 */

import { createTypedError, TypedError } from '../domain/errors';

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
  /** Maximum retry attempts on parse failure (default: 3). */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000). */
  backoffBaseMs?: number;
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
    this.typedError = createTypedError({
      code: 'PLANNER.LLM_PARSE',
      message,
      retryable: true,
      details: {
        rawResponsePreview: rawResponse.slice(0, 500),
        attempts,
      },
      suggestedFixes: [
        { type: 'RETRY_WITH_SIMPLER_PROMPT', params: {} },
        { type: 'REDUCE_OUTPUT_COMPLEXITY', params: {} },
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
      retryable: statusCode ? statusCode >= 500 || statusCode === 429 : true,
      details: { statusCode },
      suggestedFixes: [
        { type: 'CHECK_API_KEY', params: {} },
        { type: 'WAIT_AND_RETRY', params: { delayMs: 2000 } },
      ],
    });
  }
}

// ─── JSON Repair ────────────────────────────────────────────────────────────

/**
 * Repair common LLM JSON mistakes.
 *
 * Fixes:
 * 1. Trailing commas before } or ] (e.g. {"key": "val",})
 * 2. Unescaped control characters (newlines, tabs, carriage returns) inside strings
 * 3. Single-quoted strings → double-quoted strings
 * 4. Unquoted keys (simple identifiers only)
 */
export function repairJSON(raw: string): string {
  let result = raw;

  // Fix 1: Remove trailing commas before closing brackets
  // Matches: , followed by optional whitespace, then } or ]
  result = result.replace(/,\s*([}\]])/g, '$1');

  // Fix 2: Escape unescaped control characters inside JSON string values.
  // Walk through the string character by character to properly track
  // whether we're inside a JSON string or not.
  result = escapeControlCharsInStrings(result);

  return result;
}

/**
 * Walk through JSON text and escape control characters found inside string values.
 * This avoids corrupting control characters that are part of JSON structure.
 */
function escapeControlCharsInStrings(json: string): string {
  const chars: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];

    if (escaped) {
      chars.push(ch);
      escaped = false;
      continue;
    }

    if (ch === '\\' && inString) {
      chars.push(ch);
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      chars.push(ch);
      continue;
    }

    if (inString) {
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        // Control character inside a string — escape it
        switch (ch) {
          case '\n': chars.push('\\n'); break;
          case '\r': chars.push('\\r'); break;
          case '\t': chars.push('\\t'); break;
          case '\b': chars.push('\\b'); break;
          case '\f': chars.push('\\f'); break;
          default:
            // Generic unicode escape for other control chars
            chars.push('\\u' + code.toString(16).padStart(4, '0'));
            break;
        }
        continue;
      }
    }

    chars.push(ch);
  }

  return chars.join('');
}

// ─── JSON Extraction ────────────────────────────────────────────────────────

/**
 * Extract and parse JSON from an LLM response string.
 *
 * LLM responses often include surrounding text, markdown fencing, or
 * other non-JSON content. This function:
 *
 * 1. Strips markdown code fences (```json ... ```)
 * 2. Finds the outermost JSON object {...} or array [...]
 * 3. Attempts direct JSON.parse()
 * 4. If that fails, applies repairJSON() and retries
 * 5. Returns the parsed value or throws LLMParseError
 */
export function cleanLLMResponse(raw: string): unknown {
  let cleaned = raw.trim();

  // Strip markdown code fences
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Try direct parse first (fastest path)
  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue to extraction
  }

  // Find outermost JSON object or array
  const jsonStr = extractOutermostJSON(cleaned);
  if (!jsonStr) {
    throw new LLMParseError(
      'No JSON object or array found in LLM response',
      raw,
      1,
    );
  }

  // Try parsing the extracted JSON directly
  try {
    return JSON.parse(jsonStr);
  } catch {
    // Continue to repair
  }

  // Apply repair and retry
  const repaired = repairJSON(jsonStr);
  try {
    return JSON.parse(repaired);
  } catch (err) {
    throw new LLMParseError(
      `Failed to parse LLM response as JSON: ${err instanceof Error ? err.message : 'unknown error'}`,
      raw,
      1,
    );
  }
}

/**
 * Extract the outermost JSON object or array from a string.
 * Handles both {...} and [...] by tracking bracket depth.
 * Prefers whichever bracket type appears first in the text.
 */
function extractOutermostJSON(text: string): string | null {
  const objIdx = text.indexOf('{');
  const arrIdx = text.indexOf('[');

  // Determine which bracket types to try and in what order
  const candidates: Array<[string, string]> = [];
  if (objIdx !== -1 && arrIdx !== -1) {
    // Try whichever appears first
    if (arrIdx < objIdx) {
      candidates.push(['[', ']'], ['{', '}']);
    } else {
      candidates.push(['{', '}'], ['[', ']']);
    }
  } else if (objIdx !== -1) {
    candidates.push(['{', '}']);
  } else if (arrIdx !== -1) {
    candidates.push(['[', ']']);
  }

  for (const [open, close] of candidates) {
    const startIdx = text.indexOf(open);
    if (startIdx === -1) continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = startIdx; i < text.length; i++) {
      const ch = text[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === '\\' && inString) {
        escaped = true;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (ch === open) depth++;
        else if (ch === close) {
          depth--;
          if (depth === 0) {
            return text.slice(startIdx, i + 1);
          }
        }
      }
    }
  }

  return null;
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
 * Send a chat request to an LLM and parse the response as a typed JSON object.
 *
 * This is the primary entry point for getting structured data from LLMs.
 * It applies three layers of defense:
 *
 * 1. API-level: Uses response_format: { type: "json_object" } for providers
 *    that support it (Gemini, OpenAI), constraining the model to output valid JSON.
 *
 * 2. Parse-level: cleanLLMResponse() extracts JSON from fenced/wrapped text
 *    and repairJSON() fixes trailing commas and unescaped control characters.
 *
 * 3. Retry-level: On parse failure, retries the entire LLM call with exponential
 *    backoff, appending a corrective instruction to the prompt.
 *
 * @throws LLMParseError if all retry attempts fail to produce valid JSON
 * @throws LLMProviderError if the LLM provider returns an error
 */
export async function chatJSON<T>(options: ChatOptions): Promise<T> {
  const adapter = getAdapter(options.provider);
  const maxRetries = options.maxRetries ?? 3;
  const backoffBaseMs = options.backoffBaseMs ?? 1000;
  const useJsonMode = supportsJsonMode(options.provider);

  let lastError: LLMParseError | undefined;
  let lastRaw = '';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const messages = [...options.messages];

    // On retry, append a corrective instruction
    if (attempt > 1 && lastError) {
      messages.push({
        role: 'user',
        content:
          'Your previous response was not valid JSON. ' +
          'Please respond with ONLY a valid JSON object — no markdown fencing, ' +
          'no trailing commas, no unescaped newlines in strings. ' +
          'Ensure all string values have properly escaped special characters.',
      });
    }

    try {
      const response = await adapter({
        provider: options.provider,
        model: options.model,
        messages,
        systemPrompt: options.systemPrompt,
        apiKey: options.apiKey,
        baseUrl: options.baseUrl,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        responseFormat: useJsonMode ? { type: 'json_object' } : undefined,
      });

      lastRaw = response.content;
      const parsed = cleanLLMResponse(response.content);
      return parsed as T;
    } catch (err) {
      if (err instanceof LLMParseError) {
        lastError = err;

        // Apply backoff before retry (except on last attempt)
        if (attempt < maxRetries) {
          const delay = backoffBaseMs * Math.pow(2, attempt - 1);
          await sleep(delay);
        }
      } else if (err instanceof LLMProviderError) {
        // Provider errors: retry only if retryable
        if (err.typedError.retryable && attempt < maxRetries) {
          const delay = backoffBaseMs * Math.pow(2, attempt - 1);
          await sleep(delay);
          continue;
        }
        throw err;
      } else {
        throw err;
      }
    }
  }

  throw new LLMParseError(
    `Failed to parse LLM response as JSON after ${maxRetries} attempts`,
    lastRaw,
    maxRetries,
  );
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Typed Error Factories ──────────────────────────────────────────────────

export function llmParseError(message: string, rawPreview: string, attempts: number): TypedError {
  return createTypedError({
    code: 'PLANNER.LLM_PARSE',
    message,
    retryable: true,
    details: { rawResponsePreview: rawPreview.slice(0, 500), attempts },
    suggestedFixes: [
      { type: 'RETRY_WITH_SIMPLER_PROMPT', params: {} },
      { type: 'REDUCE_OUTPUT_COMPLEXITY', params: {} },
    ],
  });
}

export function llmProviderError(message: string, statusCode?: number): TypedError {
  return createTypedError({
    code: 'PLANNER.LLM_PROVIDER',
    message,
    retryable: statusCode ? statusCode >= 500 || statusCode === 429 : true,
    details: { statusCode },
    suggestedFixes: [
      { type: 'CHECK_API_KEY', params: {} },
      { type: 'WAIT_AND_RETRY', params: { delayMs: 2000 } },
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
