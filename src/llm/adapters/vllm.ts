/**
 * vLLM Adapter — Reference implementation for the vLLM inference server.
 *
 * vLLM (https://github.com/vllm-project/vllm) is a high-throughput
 * inference engine that exposes an OpenAI-compatible API.
 *
 * Default base URL: http://localhost:8000
 *
 * Usage:
 *   import { registerVllmAdapter } from 'bilko-flow/llm/adapters/vllm';
 *   registerVllmAdapter();
 *
 *   const planner = new LLMPlanner({
 *     provider: 'vllm',
 *     model: 'meta-llama/Llama-3-8b-chat-hf',
 *     apiKey: 'token-abc123',  // or '' if no auth configured
 *     baseUrl: 'http://localhost:8000',
 *   });
 */

import {
  LLMCallOptions,
  LLMRawResponse,
  LLMProviderError,
  registerLLMAdapter,
} from '../index';

/** Default base URL for a local vLLM server. */
export const VLLM_DEFAULT_BASE_URL = 'http://localhost:8000';

/** OpenAI-compatible chat completion request. */
interface OpenAIChatRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: string };
}

/** OpenAI-compatible chat completion response. */
interface OpenAIChatResponse {
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
 * Create a vLLM adapter function.
 *
 * vLLM exposes an OpenAI-compatible /v1/chat/completions endpoint,
 * so this adapter uses the standard OpenAI request format.
 */
export function createVllmAdapter() {
  return async function vllmAdapter(options: LLMCallOptions): Promise<LLMRawResponse> {
    const baseUrl = (options.baseUrl || VLLM_DEFAULT_BASE_URL).replace(/\/+$/, '');
    const url = `${baseUrl}/v1/chat/completions`;

    const messages: Array<{ role: string; content: string }> = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    for (const msg of options.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    const body: OpenAIChatRequest = {
      model: options.model,
      messages,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
    };

    // vLLM supports guided decoding via response_format
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
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      throw new LLMProviderError(
        `vLLM connection failed (${baseUrl}): ${err instanceof Error ? err.message : 'unknown error'}. ` +
        'Ensure vLLM server is running.',
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new LLMProviderError(
        `vLLM returned HTTP ${res.status}: ${text.slice(0, 200)}`,
        res.status,
      );
    }

    let data: OpenAIChatResponse;
    try {
      data = await res.json();
    } catch {
      const text = await res.text().catch(() => '(empty body)');
      throw new LLMProviderError(
        `vLLM returned non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`,
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

/** Register the vLLM adapter with the LLM adapter registry. */
export function registerVllmAdapter(): void {
  registerLLMAdapter('vllm', createVllmAdapter());
}
