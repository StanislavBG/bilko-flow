/**
 * Streaming Support — Token-by-token streaming for LLM responses.
 *
 * Addresses the critique's "Performance Blind Spots" by providing
 * a streaming interface for open-source models that support
 * Server-Sent Events (SSE) streaming.
 *
 * Usage:
 *   const stream = createLLMStream({
 *     provider: 'ollama',
 *     model: 'llama3',
 *     baseUrl: 'http://localhost:11434',
 *     messages: [{ role: 'user', content: 'Hello' }],
 *   });
 *
 *   for await (const chunk of stream) {
 *     process.stdout.write(chunk.content);
 *   }
 */

import { LLMProvider, ChatMessage, LLMProviderError } from './index';

/** A single chunk from a streaming LLM response. */
export interface StreamChunk {
  /** The token text for this chunk. */
  content: string;
  /** Whether this is the final chunk. */
  done: boolean;
  /** Finish reason (only on the final chunk). */
  finishReason?: string;
  /** Cumulative usage stats (only on the final chunk for some providers). */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/** Options for creating a streaming LLM request. */
export interface StreamOptions {
  provider: LLMProvider;
  model: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  apiKey: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

/** A stream adapter returns an async iterable of chunks. */
export type StreamAdapter = (options: StreamOptions) => AsyncIterable<StreamChunk>;

/** Registry of stream adapters by provider. */
const streamAdapters = new Map<LLMProvider, StreamAdapter>();

/** Register a streaming adapter for a provider. */
export function registerStreamAdapter(provider: LLMProvider, adapter: StreamAdapter): void {
  streamAdapters.set(provider, adapter);
}

/** Get a registered stream adapter. */
export function getStreamAdapter(provider: LLMProvider): StreamAdapter | undefined {
  return streamAdapters.get(provider);
}

/**
 * Create a streaming LLM request.
 *
 * Returns an async iterable that yields token chunks as they arrive.
 * Throws if no stream adapter is registered for the provider.
 */
export function createLLMStream(options: StreamOptions): AsyncIterable<StreamChunk> {
  if (!options.apiKey) {
    throw new LLMProviderError(
      `API key is required for streaming provider "${options.provider}". Provide a valid API key.`,
      401,
    );
  }
  const adapter = streamAdapters.get(options.provider);
  if (!adapter) {
    throw new LLMProviderError(
      `No streaming adapter registered for provider: ${options.provider}. ` +
      `Register one with registerStreamAdapter().`,
    );
  }
  return adapter(options);
}

/**
 * Collect a stream into a single complete response string.
 *
 * Useful when you want streaming internally (e.g., for progress updates)
 * but need the final result as a single string.
 */
export async function collectStream(stream: AsyncIterable<StreamChunk>): Promise<{
  content: string;
  finishReason?: string;
  usage?: StreamChunk['usage'];
}> {
  const parts: string[] = [];
  let finishReason: string | undefined;
  let usage: StreamChunk['usage'];

  for await (const chunk of stream) {
    parts.push(chunk.content);
    if (chunk.done) {
      finishReason = chunk.finishReason;
      usage = chunk.usage;
    }
  }

  return { content: parts.join(''), finishReason, usage };
}

/**
 * Parse a Server-Sent Events (SSE) stream into an async iterable of data strings.
 *
 * This is a utility for adapter implementations. Most OpenAI-compatible
 * servers stream responses as SSE with `data: {...}` lines.
 */
export async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncIterable<string> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        const data = trimmed.slice(6);
        if (data === '[DONE]') return;
        yield data;
      }
    }
  }

  // Process any remaining buffer
  if (buffer.trim().startsWith('data: ')) {
    const data = buffer.trim().slice(6);
    if (data !== '[DONE]') yield data;
  }
}

/**
 * Create an Ollama streaming adapter.
 *
 * Ollama streams JSON objects line-by-line from /api/chat with stream: true.
 */
export function createOllamaStreamAdapter(): StreamAdapter {
  return async function* ollamaStream(options: StreamOptions): AsyncIterable<StreamChunk> {
    const baseUrl = (options.baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
    const url = `${baseUrl}/api/chat`;

    const messages: Array<{ role: string; content: string }> = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    for (const msg of options.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.model,
          messages,
          stream: true,
          options: {
            temperature: options.temperature,
            num_predict: options.maxTokens,
          },
        }),
      });
    } catch (err) {
      throw new LLMProviderError(
        `Ollama streaming connection failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }

    if (!res.ok || !res.body) {
      throw new LLMProviderError(`Ollama returned HTTP ${res.status}`, res.status);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          yield {
            content: data.message?.content ?? '',
            done: !!data.done,
            usage: data.done
              ? {
                  promptTokens: data.prompt_eval_count,
                  completionTokens: data.eval_count,
                  totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
                }
              : undefined,
          };
        } catch {
          // Skip malformed lines
        }
      }
    }
  };
}

/**
 * Create an OpenAI-compatible streaming adapter.
 *
 * Works with vLLM, TGI, and LocalAI (all use SSE format).
 */
export function createOpenAICompatibleStreamAdapter(
  defaultBaseUrl: string,
): StreamAdapter {
  return async function* openaiCompatibleStream(options: StreamOptions): AsyncIterable<StreamChunk> {
    const baseUrl = (options.baseUrl || defaultBaseUrl).replace(/\/+$/, '');
    const url = `${baseUrl}/v1/chat/completions`;

    const messages: Array<{ role: string; content: string }> = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    for (const msg of options.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options.apiKey) {
      headers['Authorization'] = `Bearer ${options.apiKey}`;
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: options.model,
          messages,
          max_tokens: options.maxTokens,
          temperature: options.temperature,
          stream: true,
        }),
      });
    } catch (err) {
      throw new LLMProviderError(
        `Streaming connection failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }

    if (!res.ok || !res.body) {
      throw new LLMProviderError(`Server returned HTTP ${res.status}`, res.status);
    }

    for await (const data of parseSSEStream(res.body.getReader())) {
      try {
        const parsed = JSON.parse(data);
        const choice = parsed.choices?.[0];
        const delta = choice?.delta?.content ?? '';
        const finishReason = choice?.finish_reason;

        yield {
          content: delta,
          done: finishReason !== null && finishReason !== undefined,
          finishReason: finishReason ?? undefined,
          usage: parsed.usage
            ? {
                promptTokens: parsed.usage.prompt_tokens,
                completionTokens: parsed.usage.completion_tokens,
                totalTokens: parsed.usage.total_tokens,
              }
            : undefined,
        };
      } catch {
        // Skip malformed SSE data
      }
    }
  };
}
