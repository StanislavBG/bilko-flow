import {
  StreamChunk,
  StreamAdapter,
  registerStreamAdapter,
  getStreamAdapter,
  createLLMStream,
  collectStream,
} from '../../src/llm/streaming';
import { LLMProviderError } from '../../src/llm/index';

// ─── Mock stream adapter ────────────────────────────────────────────────────

function createMockStreamAdapter(chunks: StreamChunk[]): StreamAdapter {
  return async function* mockStream() {
    for (const chunk of chunks) {
      yield chunk;
    }
  };
}

describe('Stream adapter registry', () => {
  test('registers and retrieves a stream adapter', () => {
    const adapter = createMockStreamAdapter([]);
    registerStreamAdapter('ollama', adapter);

    const retrieved = getStreamAdapter('ollama');
    expect(retrieved).toBe(adapter);
  });

  test('returns undefined for unregistered provider', () => {
    expect(getStreamAdapter('custom')).toBeUndefined();
  });
});

describe('createLLMStream', () => {
  test('returns async iterable when adapter is registered', () => {
    const chunks: StreamChunk[] = [
      { content: 'Hello', done: false },
      { content: ' world', done: true, finishReason: 'stop' },
    ];
    registerStreamAdapter('ollama', createMockStreamAdapter(chunks));

    const stream = createLLMStream({
      provider: 'ollama',
      model: 'llama3',
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(stream).toBeDefined();
    expect(Symbol.asyncIterator in Object(stream)).toBe(true);
  });

  test('throws LLMProviderError when no adapter registered', () => {
    expect(() =>
      createLLMStream({
        provider: 'custom',
        model: 'test',
        messages: [{ role: 'user', content: 'test' }],
      }),
    ).toThrow(LLMProviderError);
  });

  test('yields chunks from the adapter', async () => {
    const expectedChunks: StreamChunk[] = [
      { content: 'The ', done: false },
      { content: 'answer ', done: false },
      { content: 'is 42.', done: true, finishReason: 'stop' },
    ];
    registerStreamAdapter('ollama', createMockStreamAdapter(expectedChunks));

    const stream = createLLMStream({
      provider: 'ollama',
      model: 'llama3',
      messages: [{ role: 'user', content: 'What is the answer?' }],
    });

    const collected: StreamChunk[] = [];
    for await (const chunk of stream) {
      collected.push(chunk);
    }

    expect(collected).toHaveLength(3);
    expect(collected[0].content).toBe('The ');
    expect(collected[2].done).toBe(true);
    expect(collected[2].finishReason).toBe('stop');
  });
});

describe('collectStream', () => {
  test('collects all chunks into a single string', async () => {
    const chunks: StreamChunk[] = [
      { content: 'Hello', done: false },
      { content: ' ', done: false },
      { content: 'world', done: true, finishReason: 'stop' },
    ];
    const adapter = createMockStreamAdapter(chunks);
    const stream = adapter({
      provider: 'ollama',
      model: 'test',
      messages: [],
    });

    const result = await collectStream(stream);
    expect(result.content).toBe('Hello world');
    expect(result.finishReason).toBe('stop');
  });

  test('captures usage from final chunk', async () => {
    const chunks: StreamChunk[] = [
      { content: 'test', done: false },
      {
        content: '',
        done: true,
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      },
    ];
    const adapter = createMockStreamAdapter(chunks);
    const stream = adapter({
      provider: 'ollama',
      model: 'test',
      messages: [],
    });

    const result = await collectStream(stream);
    expect(result.usage).toBeDefined();
    expect(result.usage!.totalTokens).toBe(15);
  });

  test('handles empty stream', async () => {
    const adapter = createMockStreamAdapter([]);
    const stream = adapter({
      provider: 'ollama',
      model: 'test',
      messages: [],
    });

    const result = await collectStream(stream);
    expect(result.content).toBe('');
    expect(result.finishReason).toBeUndefined();
  });

  test('handles single-chunk stream', async () => {
    const chunks: StreamChunk[] = [
      { content: 'Complete response', done: true, finishReason: 'stop' },
    ];
    const adapter = createMockStreamAdapter(chunks);
    const stream = adapter({
      provider: 'ollama',
      model: 'test',
      messages: [],
    });

    const result = await collectStream(stream);
    expect(result.content).toBe('Complete response');
  });
});
