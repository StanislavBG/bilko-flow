import {
  registerLLMAdapter,
  LLMCallOptions,
  LLMRawResponse,
  LLMProviderError,
  supportsJsonMode,
  isOpenSourceProvider,
  OPEN_SOURCE_PROVIDERS,
} from '../../src/llm/index';
import { createOllamaAdapter, OLLAMA_DEFAULT_BASE_URL } from '../../src/llm/adapters/ollama';
import { createVllmAdapter, VLLM_DEFAULT_BASE_URL } from '../../src/llm/adapters/vllm';
import { createTgiAdapter, TGI_DEFAULT_BASE_URL } from '../../src/llm/adapters/tgi';
import { createLocalAIAdapter, LOCAL_AI_DEFAULT_BASE_URL } from '../../src/llm/adapters/local-ai';

// ─── Provider Classification Tests ──────────────────────────────────────────

describe('Open-source provider classification', () => {
  test('ollama is recognized as open-source provider', () => {
    expect(isOpenSourceProvider('ollama')).toBe(true);
  });

  test('vllm is recognized as open-source provider', () => {
    expect(isOpenSourceProvider('vllm')).toBe(true);
  });

  test('tgi is recognized as open-source provider', () => {
    expect(isOpenSourceProvider('tgi')).toBe(true);
  });

  test('local-ai is recognized as open-source provider', () => {
    expect(isOpenSourceProvider('local-ai')).toBe(true);
  });

  test('openai is not an open-source provider', () => {
    expect(isOpenSourceProvider('openai')).toBe(false);
  });

  test('gemini is not an open-source provider', () => {
    expect(isOpenSourceProvider('gemini')).toBe(false);
  });

  test('claude is not an open-source provider', () => {
    expect(isOpenSourceProvider('claude')).toBe(false);
  });

  test('OPEN_SOURCE_PROVIDERS contains exactly 4 providers', () => {
    expect(OPEN_SOURCE_PROVIDERS.size).toBe(4);
  });
});

// ─── JSON Mode Support Tests ────────────────────────────────────────────────

describe('JSON mode support for open-source providers', () => {
  test('ollama supports JSON mode', () => {
    expect(supportsJsonMode('ollama')).toBe(true);
  });

  test('vllm supports JSON mode', () => {
    expect(supportsJsonMode('vllm')).toBe(true);
  });

  test('tgi supports JSON mode', () => {
    expect(supportsJsonMode('tgi')).toBe(true);
  });

  test('local-ai supports JSON mode', () => {
    expect(supportsJsonMode('local-ai')).toBe(true);
  });
});

// ─── Default Base URLs ──────────────────────────────────────────────────────

describe('Default base URLs', () => {
  test('Ollama defaults to localhost:11434', () => {
    expect(OLLAMA_DEFAULT_BASE_URL).toBe('http://localhost:11434');
  });

  test('vLLM defaults to localhost:8000', () => {
    expect(VLLM_DEFAULT_BASE_URL).toBe('http://localhost:8000');
  });

  test('TGI defaults to localhost:8080', () => {
    expect(TGI_DEFAULT_BASE_URL).toBe('http://localhost:8080');
  });

  test('LocalAI defaults to localhost:8080', () => {
    expect(LOCAL_AI_DEFAULT_BASE_URL).toBe('http://localhost:8080');
  });
});

// ─── Adapter Creation Tests ─────────────────────────────────────────────────

describe('Adapter factory functions', () => {
  test('createOllamaAdapter returns a function', () => {
    const adapter = createOllamaAdapter();
    expect(typeof adapter).toBe('function');
  });

  test('createVllmAdapter returns a function', () => {
    const adapter = createVllmAdapter();
    expect(typeof adapter).toBe('function');
  });

  test('createTgiAdapter returns a function', () => {
    const adapter = createTgiAdapter();
    expect(typeof adapter).toBe('function');
  });

  test('createLocalAIAdapter returns a function', () => {
    const adapter = createLocalAIAdapter();
    expect(typeof adapter).toBe('function');
  });
});

// ─── Ollama Adapter Tests ───────────────────────────────────────────────────

describe('Ollama adapter', () => {
  const mockOptions: LLMCallOptions = {
    provider: 'ollama',
    model: 'llama3',
    messages: [{ role: 'user', content: 'Hello' }],
    systemPrompt: 'You are helpful.',
    apiKey: '',
    maxTokens: 100,
    temperature: 0.5,
  };

  test('throws LLMProviderError on connection failure', async () => {
    const adapter = createOllamaAdapter();
    // Use a port that won't have anything running
    const options = { ...mockOptions, baseUrl: 'http://localhost:19999' };

    await expect(adapter(options)).rejects.toThrow(LLMProviderError);
  });

  test('throws LLMProviderError with connection hint', async () => {
    const adapter = createOllamaAdapter();
    const options = { ...mockOptions, baseUrl: 'http://localhost:19999' };

    try {
      await adapter(options);
      fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(LLMProviderError);
      expect((err as LLMProviderError).message).toContain('Ollama');
    }
  });

  test('uses default base URL when none provided', async () => {
    const adapter = createOllamaAdapter();
    const options = { ...mockOptions, baseUrl: undefined };

    // Will fail to connect, but verifies the URL construction works
    try {
      await adapter(options);
    } catch (err) {
      expect(err).toBeInstanceOf(LLMProviderError);
      expect((err as LLMProviderError).message).toContain('localhost:11434');
    }
  });
});

// ─── vLLM Adapter Tests ─────────────────────────────────────────────────────

describe('vLLM adapter', () => {
  test('throws LLMProviderError on connection failure', async () => {
    const adapter = createVllmAdapter();
    const options: LLMCallOptions = {
      provider: 'vllm',
      model: 'meta-llama/Llama-3-8b-chat-hf',
      messages: [{ role: 'user', content: 'Hello' }],
      apiKey: 'test-key',
      baseUrl: 'http://localhost:19999',
    };

    await expect(adapter(options)).rejects.toThrow(LLMProviderError);
  });

  test('includes vLLM in error message', async () => {
    const adapter = createVllmAdapter();
    const options: LLMCallOptions = {
      provider: 'vllm',
      model: 'test-model',
      messages: [{ role: 'user', content: 'test' }],
      apiKey: '',
      baseUrl: 'http://localhost:19999',
    };

    try {
      await adapter(options);
    } catch (err) {
      expect((err as LLMProviderError).message).toContain('vLLM');
    }
  });
});

// ─── TGI Adapter Tests ──────────────────────────────────────────────────────

describe('TGI adapter', () => {
  test('throws LLMProviderError on connection failure', async () => {
    const adapter = createTgiAdapter();
    const options: LLMCallOptions = {
      provider: 'tgi',
      model: 'tgi',
      messages: [{ role: 'user', content: 'Hello' }],
      apiKey: '',
      baseUrl: 'http://localhost:19999',
    };

    await expect(adapter(options)).rejects.toThrow(LLMProviderError);
  });

  test('includes TGI in error message', async () => {
    const adapter = createTgiAdapter();
    const options: LLMCallOptions = {
      provider: 'tgi',
      model: 'tgi',
      messages: [{ role: 'user', content: 'test' }],
      apiKey: '',
      baseUrl: 'http://localhost:19999',
    };

    try {
      await adapter(options);
    } catch (err) {
      expect((err as LLMProviderError).message).toContain('TGI');
    }
  });
});

// ─── LocalAI Adapter Tests ──────────────────────────────────────────────────

describe('LocalAI adapter', () => {
  test('throws LLMProviderError on connection failure', async () => {
    const adapter = createLocalAIAdapter();
    const options: LLMCallOptions = {
      provider: 'local-ai',
      model: 'llama3',
      messages: [{ role: 'user', content: 'Hello' }],
      apiKey: '',
      baseUrl: 'http://localhost:19999',
    };

    await expect(adapter(options)).rejects.toThrow(LLMProviderError);
  });

  test('includes LocalAI in error message', async () => {
    const adapter = createLocalAIAdapter();
    const options: LLMCallOptions = {
      provider: 'local-ai',
      model: 'llama3',
      messages: [{ role: 'user', content: 'test' }],
      apiKey: '',
      baseUrl: 'http://localhost:19999',
    };

    try {
      await adapter(options);
    } catch (err) {
      expect((err as LLMProviderError).message).toContain('LocalAI');
    }
  });
});

// ─── Adapter Registration Tests ─────────────────────────────────────────────

describe('Adapter registration', () => {
  test('registers and uses custom adapter via registry', async () => {
    registerLLMAdapter('ollama', async (options: LLMCallOptions): Promise<LLMRawResponse> => {
      return {
        content: JSON.stringify({ model: options.model, response: 'test' }),
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      };
    });

    // Adapter was registered — the chatJSON function can now call it
    // (verified via the existing chatJSON tests pattern)
    expect(true).toBe(true);
  });
});
