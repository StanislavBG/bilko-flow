import {
  repairJSON,
  cleanLLMResponse,
  chatJSON,
  LLMParseError,
  LLMProviderError,
  registerLLMAdapter,
  supportsJsonMode,
  LLMCallOptions,
  LLMRawResponse,
} from '../../src/llm/index';

describe('repairJSON', () => {
  test('removes trailing comma before closing brace', () => {
    const input = '{"key": "value",}';
    expect(JSON.parse(repairJSON(input))).toEqual({ key: 'value' });
  });

  test('removes trailing comma before closing bracket', () => {
    const input = '["a", "b", "c",]';
    expect(JSON.parse(repairJSON(input))).toEqual(['a', 'b', 'c']);
  });

  test('removes multiple trailing commas in nested structure', () => {
    const input = '{"scenes": [{"id": 1, "text": "hello",}, {"id": 2,},],}';
    const parsed = JSON.parse(repairJSON(input));
    expect(parsed.scenes).toHaveLength(2);
    expect(parsed.scenes[0].id).toBe(1);
  });

  test('handles trailing comma with whitespace/newlines', () => {
    const input = `{
      "name": "test",
      "items": [
        "one",
        "two",
      ],
    }`;
    const parsed = JSON.parse(repairJSON(input));
    expect(parsed.name).toBe('test');
    expect(parsed.items).toEqual(['one', 'two']);
  });

  test('escapes literal newlines inside string values', () => {
    const input = '{"narration": "Line one\nLine two\nLine three"}';
    const repaired = repairJSON(input);
    const parsed = JSON.parse(repaired);
    expect(parsed.narration).toBe('Line one\nLine two\nLine three');
  });

  test('escapes literal tabs inside string values', () => {
    const input = '{"text": "col1\tcol2\tcol3"}';
    const repaired = repairJSON(input);
    const parsed = JSON.parse(repaired);
    expect(parsed.text).toBe('col1\tcol2\tcol3');
  });

  test('escapes carriage returns inside string values', () => {
    const input = '{"text": "line1\r\nline2"}';
    const repaired = repairJSON(input);
    const parsed = JSON.parse(repaired);
    expect(parsed.text).toBe('line1\r\nline2');
  });

  test('does not corrupt already-escaped sequences', () => {
    const input = '{"text": "already\\nescaped\\ttabs"}';
    const repaired = repairJSON(input);
    const parsed = JSON.parse(repaired);
    expect(parsed.text).toBe('already\nescaped\ttabs');
  });

  test('does not modify valid JSON', () => {
    const input = '{"key": "value", "num": 42, "arr": [1, 2, 3]}';
    expect(repairJSON(input)).toBe(input);
  });

  test('handles complex storyboard-like structure', () => {
    const input = `{
      "scenes": [
        {
          "id": 1,
          "title": "Opening",
          "narration": "The camera pans across\na sunlit meadow.\nBirds sing in the distance.",
          "duration": 5,
          "visualDescription": "Wide shot, golden hour",
          "audioDescription": "Ambient nature sounds",
          "cameraAngle": "wide",
          "transition": "fade-in",
        },
        {
          "id": 2,
          "title": "Rising Action",
          "narration": "A figure emerges\nfrom the treeline.",
          "duration": 3,
          "visualDescription": "Medium shot",
          "audioDescription": "Dramatic strings",
          "cameraAngle": "medium",
          "transition": "cut",
        },
        {
          "id": 3,
          "title": "Climax",
          "narration": "The moment of truth\narrives.",
          "duration": 4,
          "visualDescription": "Close-up",
          "audioDescription": "Silence, then impact",
          "cameraAngle": "close",
          "transition": "smash-cut",
        },
        {
          "id": 4,
          "title": "Resolution",
          "narration": "Peace returns\nto the meadow.",
          "duration": 6,
          "visualDescription": "Wide shot, sunset",
          "audioDescription": "Soft piano",
          "cameraAngle": "wide",
          "transition": "fade-out",
        },
      ],
    }`;
    const repaired = repairJSON(input);
    const parsed = JSON.parse(repaired);
    expect(parsed.scenes).toHaveLength(4);
    expect(parsed.scenes[0].narration).toContain('sunlit meadow');
    expect(parsed.scenes[3].transition).toBe('fade-out');
  });
});

describe('cleanLLMResponse', () => {
  test('parses clean JSON directly', () => {
    const input = '{"key": "value"}';
    expect(cleanLLMResponse(input)).toEqual({ key: 'value' });
  });

  test('parses JSON array', () => {
    const input = '[1, 2, 3]';
    expect(cleanLLMResponse(input)).toEqual([1, 2, 3]);
  });

  test('strips markdown code fences (```json)', () => {
    const input = '```json\n{"key": "value"}\n```';
    expect(cleanLLMResponse(input)).toEqual({ key: 'value' });
  });

  test('strips markdown code fences (``` without language)', () => {
    const input = '```\n{"key": "value"}\n```';
    expect(cleanLLMResponse(input)).toEqual({ key: 'value' });
  });

  test('extracts JSON from surrounding text', () => {
    const input = 'Here is the result:\n\n{"key": "value"}\n\nI hope this helps!';
    expect(cleanLLMResponse(input)).toEqual({ key: 'value' });
  });

  test('extracts JSON array from surrounding text', () => {
    const input = 'The items are:\n[{"id": 1}, {"id": 2}]\nEnd.';
    expect(cleanLLMResponse(input)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  test('applies repair for trailing commas', () => {
    const input = '{"key": "value",}';
    expect(cleanLLMResponse(input)).toEqual({ key: 'value' });
  });

  test('applies repair for newlines in strings', () => {
    const input = '{"text": "line1\nline2"}';
    const result = cleanLLMResponse(input) as any;
    expect(result.text).toBe('line1\nline2');
  });

  test('handles fenced JSON with trailing commas', () => {
    const input = '```json\n{"items": ["a", "b",],}\n```';
    expect(cleanLLMResponse(input)).toEqual({ items: ['a', 'b'] });
  });

  test('throws LLMParseError for non-JSON content', () => {
    expect(() => cleanLLMResponse('This is just plain text without any JSON'))
      .toThrow(LLMParseError);
  });

  test('throws LLMParseError for severely malformed JSON', () => {
    expect(() => cleanLLMResponse('{key: value, broken: [}'))
      .toThrow(LLMParseError);
  });

  test('handles deeply nested JSON with issues', () => {
    const input = `{
      "workflow": {
        "steps": [
          {
            "id": "step_1",
            "inputs": {
              "nested": {
                "deep": "value with\nnewline",
              },
            },
          },
        ],
      },
    }`;
    const result = cleanLLMResponse(input) as any;
    expect(result.workflow.steps[0].id).toBe('step_1');
    expect(result.workflow.steps[0].inputs.nested.deep).toBe('value with\nnewline');
  });

  test('handles JSON preceded by explanation and followed by notes', () => {
    const input = `I'll create a workflow for you.

Here's the workflow configuration:

{
  "name": "Data Pipeline",
  "steps": [
    {"id": "fetch", "type": "http.request"},
    {"id": "transform", "type": "transform.map"}
  ]
}

Note: You may need to adjust the timeout values based on your API response times.`;

    const result = cleanLLMResponse(input) as any;
    expect(result.name).toBe('Data Pipeline');
    expect(result.steps).toHaveLength(2);
  });
});

describe('LLMParseError', () => {
  test('includes typed error with correct code', () => {
    const error = new LLMParseError('parse failed', 'raw text', 3);
    expect(error.name).toBe('LLMParseError');
    expect(error.typedError.code).toBe('PLANNER.LLM_PARSE');
    expect(error.typedError.retryable).toBe(true);
    expect(error.rawResponse).toBe('raw text');
    expect(error.attempts).toBe(3);
  });

  test('truncates raw response preview in typed error', () => {
    const longResponse = 'x'.repeat(1000);
    const error = new LLMParseError('parse failed', longResponse, 1);
    const preview = error.typedError.details?.rawResponsePreview as string;
    expect(preview.length).toBe(500);
  });

  test('includes suggested fixes', () => {
    const error = new LLMParseError('parse failed', 'raw', 1);
    expect(error.typedError.suggestedFixes.length).toBeGreaterThan(0);
    expect(error.typedError.suggestedFixes.some(f => f.type === 'RETRY_WITH_SIMPLER_PROMPT')).toBe(true);
  });
});

describe('LLMProviderError', () => {
  test('5xx status codes are retryable', () => {
    const error = new LLMProviderError('server error', 500);
    expect(error.typedError.retryable).toBe(true);
  });

  test('429 (rate limit) is retryable', () => {
    const error = new LLMProviderError('rate limited', 429);
    expect(error.typedError.retryable).toBe(true);
  });

  test('4xx (non-429) status codes are not retryable', () => {
    const error = new LLMProviderError('bad request', 400);
    expect(error.typedError.retryable).toBe(false);
  });

  test('missing status code defaults to retryable', () => {
    const error = new LLMProviderError('unknown error');
    expect(error.typedError.retryable).toBe(true);
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
    // Register a mock adapter for testing
    registerLLMAdapter('custom', async (options: LLMCallOptions): Promise<LLMRawResponse> => {
      // Default mock: return whatever the last user message says to return
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

  test('handles JSON with trailing commas via repair', async () => {
    const result = await chatJSON<{ key: string }>({
      provider: 'custom',
      model: 'test',
      messages: [{ role: 'user', content: '{"key": "value",}' }],
      apiKey: 'test-key',
    });

    expect(result).toEqual({ key: 'value' });
  });

  test('retries on parse failure with corrective prompt', async () => {
    let callCount = 0;
    registerLLMAdapter('custom', async (options: LLMCallOptions): Promise<LLMRawResponse> => {
      callCount++;
      if (callCount === 1) {
        return { content: 'This is not JSON at all', finishReason: 'stop' };
      }
      // Second call should have the corrective message appended
      expect(options.messages.length).toBeGreaterThan(1);
      return { content: '{"recovered": true}', finishReason: 'stop' };
    });

    const result = await chatJSON<{ recovered: boolean }>({
      provider: 'custom',
      model: 'test',
      messages: [{ role: 'user', content: 'generate json' }],
      apiKey: 'test-key',
      maxRetries: 2,
      backoffBaseMs: 10, // Fast for testing
    });

    expect(result).toEqual({ recovered: true });
    expect(callCount).toBe(2);
  });

  test('throws LLMParseError after all retries exhausted', async () => {
    registerLLMAdapter('custom', async (): Promise<LLMRawResponse> => {
      return { content: 'never valid json !!!', finishReason: 'stop' };
    });

    await expect(
      chatJSON({
        provider: 'custom',
        model: 'test',
        messages: [{ role: 'user', content: 'generate json' }],
        apiKey: 'test-key',
        maxRetries: 2,
        backoffBaseMs: 10,
      }),
    ).rejects.toThrow(LLMParseError);
  });

  test('throws LLMProviderError on non-retryable provider error', async () => {
    registerLLMAdapter('custom', async (): Promise<LLMRawResponse> => {
      throw new LLMProviderError('Invalid API key', 401);
    });

    await expect(
      chatJSON({
        provider: 'custom',
        model: 'test',
        messages: [{ role: 'user', content: '{}' }],
        apiKey: 'bad-key',
        maxRetries: 2,
        backoffBaseMs: 10,
      }),
    ).rejects.toThrow(LLMProviderError);
  });

  test('retries on retryable provider error (5xx)', async () => {
    let callCount = 0;
    registerLLMAdapter('custom', async (): Promise<LLMRawResponse> => {
      callCount++;
      if (callCount === 1) {
        throw new LLMProviderError('Server error', 500);
      }
      return { content: '{"success": true}', finishReason: 'stop' };
    });

    const result = await chatJSON<{ success: boolean }>({
      provider: 'custom',
      model: 'test',
      messages: [{ role: 'user', content: '{}' }],
      apiKey: 'test-key',
      maxRetries: 3,
      backoffBaseMs: 10,
    });

    expect(result).toEqual({ success: true });
    expect(callCount).toBe(2);
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
    // 'openai' adapter is not registered in these tests
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
