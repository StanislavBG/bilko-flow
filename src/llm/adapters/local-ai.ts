/**
 * LocalAI Adapter — Reference implementation for the LocalAI inference server.
 *
 * LocalAI (https://localai.io) provides an OpenAI-compatible API for
 * running open-source models locally with support for multiple backends
 * (llama.cpp, transformers, etc.).
 *
 * Default base URL: http://localhost:8080
 *
 * Usage:
 *   import { registerLocalAIAdapter } from 'bilko-flow/llm/adapters/local-ai';
 *   registerLocalAIAdapter();
 *
 *   const planner = new LLMPlanner({
 *     provider: 'local-ai',
 *     model: 'llama3',
 *     apiKey: '',
 *     baseUrl: 'http://localhost:8080',
 *   });
 */

import {
  LLMCallOptions,
  LLMRawResponse,
  LLMProviderError,
  registerLLMAdapter,
} from '../index';

/** Default base URL for a local LocalAI instance. */
export const LOCAL_AI_DEFAULT_BASE_URL = 'http://localhost:8080';

/** OpenAI-compatible chat completion request. */
interface LocalAIChatRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: string };
}

/** OpenAI-compatible chat completion response. */
interface LocalAIChatResponse {
  id: string;
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Create a LocalAI adapter function.
 *
 * LocalAI exposes a fully OpenAI-compatible API at /v1/chat/completions.
 * It supports JSON grammar constraints via response_format.
 */
export function createLocalAIAdapter() {
  return async function localAIAdapter(options: LLMCallOptions): Promise<LLMRawResponse> {
    const baseUrl = (options.baseUrl || LOCAL_AI_DEFAULT_BASE_URL).replace(/\/+$/, '');
    const url = `${baseUrl}/v1/chat/completions`;

    const messages: Array<{ role: string; content: string }> = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    for (const msg of options.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    const body: LocalAIChatRequest = {
      model: options.model,
      messages,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
    };

    if (options.responseFormat?.type === 'json_object') {
      body.response_format = { type: 'json_object' };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (options.apiKey) {
      headers['Authorization'] = `Bearer ${options.apiKey}`;
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new LLMProviderError(
        `LocalAI connection failed (${baseUrl}): ${err instanceof Error ? err.message : 'unknown error'}. ` +
        'Ensure LocalAI server is running.',
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new LLMProviderError(
        `LocalAI returned HTTP ${res.status}: ${text.slice(0, 200)}`,
        res.status,
      );
    }

    let data: LocalAIChatResponse;
    try {
      data = await res.json();
    } catch {
      const text = await res.text().catch(() => '(empty body)');
      throw new LLMProviderError(
        `LocalAI returned non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`,
        res.status,
      );
    }
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content ?? '',
      finishReason: choice?.finish_reason ?? 'stop',
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  };
}

/** Register the LocalAI adapter with the LLM adapter registry. */
export function registerLocalAIAdapter(): void {
  registerLLMAdapter('local-ai', createLocalAIAdapter());
}
