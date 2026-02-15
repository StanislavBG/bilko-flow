/**
 * TGI Adapter — Reference implementation for Hugging Face Text Generation Inference.
 *
 * TGI (https://github.com/huggingface/text-generation-inference) serves
 * models with an OpenAI-compatible chat endpoint at /v1/chat/completions.
 *
 * Default base URL: http://localhost:8080
 *
 * Usage:
 *   import { registerTgiAdapter } from 'bilko-flow/llm/adapters/tgi';
 *   registerTgiAdapter();
 *
 *   const planner = new LLMPlanner({
 *     provider: 'tgi',
 *     model: 'tgi',  // TGI serves a single model, name is informational
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

/** Default base URL for a local TGI instance. */
export const TGI_DEFAULT_BASE_URL = 'http://localhost:8080';

/** OpenAI-compatible chat completion request. */
interface TgiChatRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: string };
}

/** OpenAI-compatible chat completion response. */
interface TgiChatResponse {
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
 * Create a TGI adapter function.
 *
 * TGI exposes an OpenAI-compatible /v1/chat/completions endpoint.
 * It also supports grammar-based constrained generation for JSON output.
 */
export function createTgiAdapter() {
  return async function tgiAdapter(options: LLMCallOptions): Promise<LLMRawResponse> {
    const baseUrl = (options.baseUrl || TGI_DEFAULT_BASE_URL).replace(/\/+$/, '');
    const url = `${baseUrl}/v1/chat/completions`;

    const messages: Array<{ role: string; content: string }> = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    for (const msg of options.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    const body: TgiChatRequest = {
      model: options.model,
      messages,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
    };

    // TGI supports response_format for JSON-constrained output
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
        `TGI connection failed (${baseUrl}): ${err instanceof Error ? err.message : 'unknown error'}. ` +
        'Ensure TGI server is running.',
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new LLMProviderError(
        `TGI returned HTTP ${res.status}: ${text.slice(0, 200)}`,
        res.status,
      );
    }

    let data: TgiChatResponse;
    try {
      data = await res.json();
    } catch {
      const text = await res.text().catch(() => '(empty body)');
      throw new LLMProviderError(
        `TGI returned non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`,
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

/** Register the TGI adapter with the LLM adapter registry. */
export function registerTgiAdapter(): void {
  registerLLMAdapter('tgi', createTgiAdapter());
}
