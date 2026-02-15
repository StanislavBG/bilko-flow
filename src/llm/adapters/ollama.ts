/**
 * Ollama LLM Adapter — Reference implementation for the Ollama local model server.
 *
 * Ollama (https://ollama.com) runs open-source models locally and exposes an
 * OpenAI-compatible chat completion API at `/api/chat`.
 *
 * Default base URL: http://localhost:11434
 *
 * Usage:
 *   import { registerOllamaAdapter } from 'bilko-flow/llm/adapters/ollama';
 *   registerOllamaAdapter();
 *
 *   const planner = new LLMPlanner({
 *     provider: 'ollama',
 *     model: 'llama3',
 *     apiKey: '',           // Ollama doesn't require an API key
 *     baseUrl: 'http://localhost:11434',
 *   });
 */

import {
  LLMCallOptions,
  LLMRawResponse,
  LLMProviderError,
  registerLLMAdapter,
} from '../index';

/** Default base URL for a local Ollama instance. */
export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';

/** Ollama /api/chat request body. */
interface OllamaChatRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream: false;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
  format?: 'json';
}

/** Ollama /api/chat response body. */
interface OllamaChatResponse {
  model: string;
  message: { role: string; content: string };
  done: boolean;
  total_duration?: number;
  eval_count?: number;
  prompt_eval_count?: number;
}

/**
 * Create an Ollama adapter function.
 *
 * The adapter translates Bilko's LLMCallOptions into Ollama's /api/chat
 * endpoint format and parses the response back.
 */
export function createOllamaAdapter() {
  return async function ollamaAdapter(options: LLMCallOptions): Promise<LLMRawResponse> {
    const baseUrl = (options.baseUrl || OLLAMA_DEFAULT_BASE_URL).replace(/\/+$/, '');
    const url = `${baseUrl}/api/chat`;

    const messages: Array<{ role: string; content: string }> = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    for (const msg of options.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    const body: OllamaChatRequest = {
      model: options.model,
      messages,
      stream: false,
      options: {
        temperature: options.temperature,
        num_predict: options.maxTokens,
      },
    };

    // When JSON output is requested, Ollama supports a `format` field.
    if (options.responseFormat?.type === 'json_object') {
      body.format = 'json';
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new LLMProviderError(
        `Ollama connection failed (${baseUrl}): ${err instanceof Error ? err.message : 'unknown error'}. ` +
        'Ensure Ollama is running locally.',
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new LLMProviderError(
        `Ollama returned HTTP ${res.status}: ${text.slice(0, 200)}`,
        res.status,
      );
    }

    /**
     * Wrap res.json() in try-catch: if Ollama returns non-JSON (e.g., HTML
     * error page or empty body), we get a clear LLMProviderError instead
     * of an unhandled JSON.parse crash propagating to the caller.
     */
    let data: OllamaChatResponse;
    try {
      data = await res.json();
    } catch {
      const text = await res.text().catch(() => '(empty body)');
      throw new LLMProviderError(
        `Ollama returned non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`,
        res.status,
      );
    }

    return {
      content: data.message?.content ?? '',
      finishReason: data.done ? 'stop' : 'length',
      usage: {
        promptTokens: data.prompt_eval_count,
        completionTokens: data.eval_count,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
    };
  };
}

/** Register the Ollama adapter with the LLM adapter registry. */
export function registerOllamaAdapter(): void {
  registerLLMAdapter('ollama', createOllamaAdapter());
}
