import {
  ModelRegistry,
  ModelEntry,
  ModelHealthStatus,
  ModelHealthResult,
} from '../../src/llm/model-registry';

function createTestModel(overrides?: Partial<ModelEntry>): ModelEntry {
  return {
    id: 'test-model',
    provider: 'ollama',
    name: 'Test Model',
    version: '1.0',
    capabilities: { chat: true, json: true, streaming: true },
    contextWindow: 8192,
    baseUrl: 'http://localhost:11434',
    ...overrides,
  };
}

describe('ModelRegistry', () => {
  let registry: ModelRegistry;

  beforeEach(() => {
    registry = new ModelRegistry();
  });

  describe('register and get', () => {
    test('registers a model and retrieves it by ID', () => {
      const model = createTestModel({ id: 'llama3-8b' });
      registry.register(model);

      const retrieved = registry.get('llama3-8b');
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe('llama3-8b');
      expect(retrieved!.name).toBe('Test Model');
    });

    test('sets registeredAt timestamp on register', () => {
      const model = createTestModel({ id: 'ts-test' });
      registry.register(model);

      const retrieved = registry.get('ts-test');
      expect(retrieved!.registeredAt).toBeDefined();
      expect(new Date(retrieved!.registeredAt!).getTime()).toBeGreaterThan(0);
    });

    test('preserves provided registeredAt timestamp', () => {
      const model = createTestModel({
        id: 'ts-test',
        registeredAt: '2024-01-01T00:00:00Z',
      });
      registry.register(model);

      expect(registry.get('ts-test')!.registeredAt).toBe('2024-01-01T00:00:00Z');
    });

    test('overwrites existing model with same ID', () => {
      registry.register(createTestModel({ id: 'model-1', name: 'Original' }));
      registry.register(createTestModel({ id: 'model-1', name: 'Updated' }));

      expect(registry.get('model-1')!.name).toBe('Updated');
    });

    test('returns undefined for unknown model ID', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('has', () => {
    test('returns true for registered model', () => {
      registry.register(createTestModel({ id: 'exists' }));
      expect(registry.has('exists')).toBe(true);
    });

    test('returns false for unregistered model', () => {
      expect(registry.has('missing')).toBe(false);
    });
  });

  describe('unregister', () => {
    test('removes a model from the registry', () => {
      registry.register(createTestModel({ id: 'to-remove' }));
      expect(registry.has('to-remove')).toBe(true);

      const removed = registry.unregister('to-remove');
      expect(removed).toBe(true);
      expect(registry.has('to-remove')).toBe(false);
    });

    test('returns false when model does not exist', () => {
      expect(registry.unregister('nonexistent')).toBe(false);
    });
  });

  describe('listAll', () => {
    test('returns empty array when no models registered', () => {
      expect(registry.listAll()).toEqual([]);
    });

    test('returns all registered models', () => {
      registry.register(createTestModel({ id: 'model-1' }));
      registry.register(createTestModel({ id: 'model-2' }));
      registry.register(createTestModel({ id: 'model-3' }));

      const all = registry.listAll();
      expect(all).toHaveLength(3);
      expect(all.map(m => m.id).sort()).toEqual(['model-1', 'model-2', 'model-3']);
    });
  });

  describe('listByProvider', () => {
    test('filters models by provider', () => {
      registry.register(createTestModel({ id: 'ollama-1', provider: 'ollama' }));
      registry.register(createTestModel({ id: 'ollama-2', provider: 'ollama' }));
      registry.register(createTestModel({ id: 'vllm-1', provider: 'vllm' }));

      const ollamaModels = registry.listByProvider('ollama');
      expect(ollamaModels).toHaveLength(2);
      expect(ollamaModels.every(m => m.provider === 'ollama')).toBe(true);
    });

    test('returns empty array for provider with no models', () => {
      registry.register(createTestModel({ id: 'ollama-1', provider: 'ollama' }));
      expect(registry.listByProvider('vllm')).toEqual([]);
    });
  });

  describe('query', () => {
    beforeEach(() => {
      registry.register(createTestModel({
        id: 'llama3-8b',
        provider: 'ollama',
        capabilities: { chat: true, json: true, streaming: true, vision: false },
        contextWindow: 8192,
        tags: ['open-source', 'general'],
      }));
      registry.register(createTestModel({
        id: 'llava-7b',
        provider: 'ollama',
        capabilities: { chat: true, json: false, streaming: true, vision: true },
        contextWindow: 4096,
        tags: ['open-source', 'vision'],
      }));
      registry.register(createTestModel({
        id: 'codellama-34b',
        provider: 'vllm',
        capabilities: { chat: true, json: true, streaming: true, code: true },
        contextWindow: 16384,
        tags: ['open-source', 'code'],
      }));
    });

    test('filters by provider', () => {
      const results = registry.query({ provider: 'ollama' });
      expect(results).toHaveLength(2);
    });

    test('filters by capability', () => {
      const results = registry.query({ capabilities: { json: true } });
      expect(results).toHaveLength(2);
      expect(results.every(m => m.capabilities.json)).toBe(true);
    });

    test('filters by minimum context window', () => {
      const results = registry.query({ minContextWindow: 8192 });
      expect(results).toHaveLength(2);
    });

    test('filters by tags', () => {
      const results = registry.query({ tags: ['code'] });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('codellama-34b');
    });

    test('applies multiple filters with AND logic', () => {
      const results = registry.query({
        provider: 'ollama',
        capabilities: { json: true },
      });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('llama3-8b');
    });

    test('returns empty array when no models match', () => {
      const results = registry.query({ provider: 'tgi' });
      expect(results).toEqual([]);
    });
  });

  describe('checkHealth', () => {
    test('returns Unknown for unregistered model', async () => {
      const result = await registry.checkHealth('nonexistent');
      expect(result.status).toBe(ModelHealthStatus.Unknown);
      expect(result.error).toContain('not found');
    });

    test('returns Unknown when no baseUrl configured', async () => {
      registry.register(createTestModel({ id: 'no-url', baseUrl: undefined }));
      const result = await registry.checkHealth('no-url');
      expect(result.status).toBe(ModelHealthStatus.Unknown);
      expect(result.error).toContain('No baseUrl');
    });

    test('returns Unreachable when server is not running', async () => {
      registry.register(createTestModel({
        id: 'unreachable',
        baseUrl: 'http://localhost:19999',
      }));
      const result = await registry.checkHealth('unreachable');
      expect(result.status).toBe(ModelHealthStatus.Unreachable);
      expect(result.modelId).toBe('unreachable');
      expect(result.checkedAt).toBeDefined();
    });

    test('uses custom probe function when provided', async () => {
      registry.register(createTestModel({ id: 'custom-probe' }));

      const customProbe = async (model: ModelEntry): Promise<ModelHealthResult> => ({
        modelId: model.id,
        status: ModelHealthStatus.Healthy,
        latencyMs: 42,
        checkedAt: new Date().toISOString(),
      });

      const result = await registry.checkHealth('custom-probe', customProbe);
      expect(result.status).toBe(ModelHealthStatus.Healthy);
      expect(result.latencyMs).toBe(42);
    });

    test('caches health results', async () => {
      registry.register(createTestModel({
        id: 'cached',
        baseUrl: 'http://localhost:19999',
      }));

      await registry.checkHealth('cached');
      const cached = registry.getCachedHealth('cached');
      expect(cached).toBeDefined();
      expect(cached!.modelId).toBe('cached');
    });

    test('returns undefined for unchecked model cache', () => {
      expect(registry.getCachedHealth('never-checked')).toBeUndefined();
    });
  });
});
