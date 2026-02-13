import {
  cleanLLMResponse,
  chatJSON,
  LLMParseError,
  LLMProviderError,
  registerLLMAdapter,
  supportsJsonMode,
  LLMCallOptions,
  LLMRawResponse,
} from '../../src/llm/index';

describe('cleanLLMResponse', () => {
  test('parses valid JSON object', () => {
    const input = '{"key": "value"}';
    expect(cleanLLMResponse(input)).toEqual({ key: 'value' });
  });

  test('parses valid JSON array', () => {
    const input = '[1, 2, 3]';
    expect(cleanLLMResponse(input)).toEqual([1, 2, 3]);
  });

  test('trims whitespace before parsing', () => {
    const input = '  \n  {"key": "value"}  \n  ';
    expect(cleanLLMResponse(input)).toEqual({ key: 'value' });
  });

  test('throws LLMParseError for plain text', () => {
    expect(() => cleanLLMResponse('This is just plain text without any JSON'))
      .toThrow(LLMParseError);
  });

  test('throws LLMParseError for malformed JSON', () => {
    expect(() => cleanLLMResponse('{key: value, broken: [}'))
      .toThrow(LLMParseError);
  });

  test('throws LLMParseError for trailing commas (no repair)', () => {
    expect(() => cleanLLMResponse('{"key": "value",}'))
      .toThrow(LLMParseError);
  });

  test('throws LLMParseError for markdown-fenced JSON (no extraction)', () => {
    expect(() => cleanLLMResponse('```json\n{"key": "value"}\n```'))
      .toThrow(LLMParseError);
  });

  test('throws LLMParseError for JSON embedded in text (no extraction)', () => {
    expect(() => cleanLLMResponse('Here is the result:\n{"key": "value"}\nHope this helps!'))
      .toThrow(LLMParseError);
  });

  test('error includes raw response preview', () => {
    try {
      cleanLLMResponse('not json');
      fail('Expected LLMParseError');
    } catch (err) {
      expect(err).toBeInstanceOf(LLMParseError);
      expect((err as LLMParseError).rawResponse).toBe('not json');
    }
  });
});

describe('LLMParseError', () => {
  test('includes typed error with correct code', () => {
    const error = new LLMParseError('parse failed', 'raw text', 1);
    expect(error.name).toBe('LLMParseError');
    expect(error.typedError.code).toBe('PLANNER.LLM_PARSE');
    expect(error.typedError.retryable).toBe(false);
    expect(error.rawResponse).toBe('raw text');
    expect(error.attempts).toBe(1);
  });

  test('truncates raw response preview in typed error', () => {
    const longResponse = 'x'.repeat(1000);
    const error = new LLMParseError('parse failed', longResponse, 1);
    const preview = error.typedError.details?.rawResponsePreview as string;
    expect(preview.length).toBe(500);
  });

  test('suggests checking API key', () => {
    const error = new LLMParseError('parse failed', 'raw', 1);
    expect(error.typedError.suggestedFixes.length).toBeGreaterThan(0);
    expect(error.typedError.suggestedFixes.some(f => f.type === 'CHECK_API_KEY')).toBe(true);
  });
});

describe('LLMProviderError', () => {
  test('provider errors are not retryable', () => {
    const error = new LLMProviderError('server error', 500);
    expect(error.typedError.retryable).toBe(false);
  });

  test('401 is not retryable', () => {
    const error = new LLMProviderError('unauthorized', 401);
    expect(error.typedError.retryable).toBe(false);
  });

  test('missing status code is not retryable', () => {
    const error = new LLMProviderError('unknown error');
    expect(error.typedError.retryable).toBe(false);
  });
});

describe('supportsJsonMode', () => {
  test('gemini supports JSON mode', () => {
    expect(supportsJsonMode('gemini')).toBe(true);
  });

  test('openai supports JSON mode', () => {
    expect(supportsJsonMode('openai')).toBe(true);
  });

  test('claude does not support JSON mode', () => {
    expect(supportsJsonMode('claude')).toBe(false);
  });

  test('custom does not support JSON mode', () => {
    expect(supportsJsonMode('custom')).toBe(false);
  });
});

describe('chatJSON', () => {
  beforeEach(() => {
    registerLLMAdapter('custom', async (options: LLMCallOptions): Promise<LLMRawResponse> => {
      const lastMsg = options.messages[options.messages.length - 1];
      return { content: lastMsg.content, finishReason: 'stop' };
    });
  });

  test('parses valid JSON response from LLM', async () => {
    const result = await chatJSON<{ key: string }>({
      provider: 'custom',
      model: 'test',
      messages: [{ role: 'user', content: '{"key": "value"}' }],
      apiKey: 'test-key',
    });

    expect(result).toEqual({ key: 'value' });
  });

  test('throws LLMParseError on invalid JSON (no retry)', async () => {
    registerLLMAdapter('custom', async (): Promise<LLMRawResponse> => {
      return { content: 'not valid json', finishReason: 'stop' };
    });

    await expect(
      chatJSON({
        provider: 'custom',
        model: 'test',
        messages: [{ role: 'user', content: 'generate json' }],
        apiKey: 'test-key',
      }),
    ).rejects.toThrow(LLMParseError);
  });

  test('calls adapter exactly once (no retries)', async () => {
    let callCount = 0;
    registerLLMAdapter('custom', async (): Promise<LLMRawResponse> => {
      callCount++;
      return { content: 'not json', finishReason: 'stop' };
    });

    await expect(
      chatJSON({
        provider: 'custom',
        model: 'test',
        messages: [{ role: 'user', content: 'generate' }],
        apiKey: 'test-key',
      }),
    ).rejects.toThrow(LLMParseError);

    expect(callCount).toBe(1);
  });

  test('throws LLMProviderError immediately on provider error', async () => {
    registerLLMAdapter('custom', async (): Promise<LLMRawResponse> => {
      throw new LLMProviderError('Invalid API key', 401);
    });

    await expect(
      chatJSON({
        provider: 'custom',
        model: 'test',
        messages: [{ role: 'user', content: '{}' }],
        apiKey: 'bad-key',
      }),
    ).rejects.toThrow(LLMProviderError);
  });

  test('throws LLMProviderError when apiKey is empty', async () => {
    await expect(
      chatJSON({
        provider: 'custom',
        model: 'test',
        messages: [{ role: 'user', content: '{}' }],
        apiKey: '',
      }),
    ).rejects.toThrow(LLMProviderError);
  });

  test('sends response_format for supported providers', async () => {
    let capturedOptions: LLMCallOptions | undefined;
    registerLLMAdapter('gemini', async (options: LLMCallOptions): Promise<LLMRawResponse> => {
      capturedOptions = options;
      return { content: '{"result": true}', finishReason: 'stop' };
    });

    await chatJSON({
      provider: 'gemini',
      model: 'gemini-1.5-pro',
      messages: [{ role: 'user', content: 'generate' }],
      apiKey: 'test-key',
    });

    expect(capturedOptions?.responseFormat).toEqual({ type: 'json_object' });
  });

  test('does not send response_format for unsupported providers', async () => {
    let capturedOptions: LLMCallOptions | undefined;
    registerLLMAdapter('claude', async (options: LLMCallOptions): Promise<LLMRawResponse> => {
      capturedOptions = options;
      return { content: '{"result": true}', finishReason: 'stop' };
    });

    await chatJSON({
      provider: 'claude',
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'generate' }],
      apiKey: 'test-key',
    });

    expect(capturedOptions?.responseFormat).toBeUndefined();
  });

  test('throws when no adapter is registered for provider', async () => {
    await expect(
      chatJSON({
        provider: 'openai',
        model: 'gpt-4',
        messages: [{ role: 'user', content: '{}' }],
        apiKey: 'test-key',
      }),
    ).rejects.toThrow('No adapter registered');
  });
});
