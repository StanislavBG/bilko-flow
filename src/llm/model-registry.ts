/**
 * Model Registry — Discovery, versioning, and lifecycle management for LLM models.
 *
 * Addresses the critique's "Model Registry Absence" by providing:
 * - Model registration with capability metadata
 * - Health check / availability probing
 * - Version tracking and capability querying
 * - Provider-aware model discovery
 *
 * Usage:
 *   const registry = new ModelRegistry();
 *   registry.register({
 *     id: 'llama3-8b',
 *     provider: 'ollama',
 *     name: 'Llama 3 8B',
 *     version: '3.0',
 *     capabilities: { chat: true, json: true, streaming: true },
 *     contextWindow: 8192,
 *     baseUrl: 'http://localhost:11434',
 *   });
 *
 *   const models = registry.listByProvider('ollama');
 *   const model = registry.get('llama3-8b');
 *   const healthy = await registry.checkHealth('llama3-8b');
 */

import { LLMProvider } from './index';

/** Model capability flags. */
export interface ModelCapabilities {
  /** Supports multi-turn chat. */
  chat: boolean;
  /** Supports structured JSON output (native or grammar-constrained). */
  json: boolean;
  /** Supports streaming token output. */
  streaming: boolean;
  /** Supports function/tool calling. */
  functionCalling?: boolean;
  /** Supports vision/image inputs. */
  vision?: boolean;
  /** Supports code generation. */
  code?: boolean;
}

/** Resource requirements for running a model. */
export interface ModelResourceRequirements {
  /** Minimum GPU VRAM in GB. */
  minGpuMemoryGb?: number;
  /** Minimum system RAM in GB. */
  minRamGb?: number;
  /** Recommended GPU type(s). */
  recommendedGpu?: string[];
  /** Whether the model can run on CPU only. */
  cpuCompatible?: boolean;
  /** Quantization level if applicable (e.g., 'q4_0', 'q8_0', 'fp16'). */
  quantization?: string;
}

/** Health status of a model endpoint. */
export enum ModelHealthStatus {
  Healthy = 'healthy',
  Degraded = 'degraded',
  Unreachable = 'unreachable',
  Unknown = 'unknown',
}

/** Result of a model health check. */
export interface ModelHealthResult {
  modelId: string;
  status: ModelHealthStatus;
  latencyMs?: number;
  checkedAt: string;
  error?: string;
}

/** A registered model entry. */
export interface ModelEntry {
  /** Unique identifier for this model within the registry. */
  id: string;
  /** LLM provider that serves this model. */
  provider: LLMProvider;
  /** Human-readable model name. */
  name: string;
  /** Model version string. */
  version: string;
  /** Capability flags. */
  capabilities: ModelCapabilities;
  /** Context window size in tokens. */
  contextWindow: number;
  /** Base URL for the model's serving endpoint. */
  baseUrl?: string;
  /** Resource requirements for running this model. */
  resources?: ModelResourceRequirements;
  /** Optional tags for categorization. */
  tags?: string[];
  /** When this model was registered. */
  registeredAt?: string;
}

/** Filter criteria for querying models. */
export interface ModelQuery {
  provider?: LLMProvider;
  capabilities?: Partial<ModelCapabilities>;
  minContextWindow?: number;
  tags?: string[];
}

/**
 * In-memory model registry for discovering and managing available models.
 *
 * This is designed as a lightweight, embeddable registry. For production
 * deployments with many models, back this with a persistent store.
 */
export class ModelRegistry {
  private models = new Map<string, ModelEntry>();
  private healthCache = new Map<string, ModelHealthResult>();

  /** Register a model. Overwrites any existing entry with the same ID. */
  register(entry: ModelEntry): void {
    this.models.set(entry.id, {
      ...entry,
      registeredAt: entry.registeredAt ?? new Date().toISOString(),
    });
  }

  /** Remove a model from the registry. */
  unregister(modelId: string): boolean {
    this.healthCache.delete(modelId);
    return this.models.delete(modelId);
  }

  /** Get a model by ID. */
  get(modelId: string): ModelEntry | undefined {
    return this.models.get(modelId);
  }

  /** Check if a model is registered. */
  has(modelId: string): boolean {
    return this.models.has(modelId);
  }

  /** List all registered models. */
  listAll(): ModelEntry[] {
    return Array.from(this.models.values());
  }

  /** List models by provider. */
  listByProvider(provider: LLMProvider): ModelEntry[] {
    return this.listAll().filter((m) => m.provider === provider);
  }

  /**
   * Query models by criteria.
   *
   * All filter fields are ANDed together. Capability flags use AND logic
   * (all requested capabilities must be present).
   */
  query(filter: ModelQuery): ModelEntry[] {
    return this.listAll().filter((model) => {
      if (filter.provider && model.provider !== filter.provider) return false;
      if (filter.minContextWindow && model.contextWindow < filter.minContextWindow) return false;

      if (filter.capabilities) {
        for (const [key, value] of Object.entries(filter.capabilities)) {
          if (value !== undefined && (model.capabilities as any)[key] !== value) return false;
        }
      }

      if (filter.tags && filter.tags.length > 0) {
        if (!model.tags || !filter.tags.every((t) => model.tags!.includes(t))) return false;
      }

      return true;
    });
  }

  /**
   * Probe a model endpoint for health.
   *
   * For Ollama, hits /api/tags. For OpenAI-compatible servers (vLLM, TGI,
   * LocalAI), hits /v1/models. Falls back to /health.
   *
   * Provide a custom `probeFn` to override the default HTTP probe.
   */
  async checkHealth(
    modelId: string,
    probeFn?: (model: ModelEntry) => Promise<ModelHealthResult>,
  ): Promise<ModelHealthResult> {
    const model = this.models.get(modelId);
    if (!model) {
      return {
        modelId,
        status: ModelHealthStatus.Unknown,
        checkedAt: new Date().toISOString(),
        error: `Model "${modelId}" not found in registry`,
      };
    }

    if (probeFn) {
      const result = await probeFn(model);
      this.healthCache.set(modelId, result);
      return result;
    }

    return this.defaultHealthProbe(model);
  }

  /** Get the most recent cached health result for a model. */
  getCachedHealth(modelId: string): ModelHealthResult | undefined {
    return this.healthCache.get(modelId);
  }

  /** Default HTTP health probe. */
  private async defaultHealthProbe(model: ModelEntry): Promise<ModelHealthResult> {
    const baseUrl = (model.baseUrl || '').replace(/\/+$/, '');
    if (!baseUrl) {
      const result: ModelHealthResult = {
        modelId: model.id,
        status: ModelHealthStatus.Unknown,
        checkedAt: new Date().toISOString(),
        error: 'No baseUrl configured',
      };
      this.healthCache.set(model.id, result);
      return result;
    }

    // Try provider-appropriate health endpoints
    const healthUrls =
      model.provider === 'ollama'
        ? [`${baseUrl}/api/tags`]
        : [`${baseUrl}/v1/models`, `${baseUrl}/health`];

    const start = Date.now();
    for (const url of healthUrls) {
      try {
        const res = await fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        const latencyMs = Date.now() - start;

        const result: ModelHealthResult = {
          modelId: model.id,
          status: res.ok ? ModelHealthStatus.Healthy : ModelHealthStatus.Degraded,
          latencyMs,
          checkedAt: new Date().toISOString(),
        };
        this.healthCache.set(model.id, result);
        return result;
      } catch {
        // Try next URL
      }
    }

    const result: ModelHealthResult = {
      modelId: model.id,
      status: ModelHealthStatus.Unreachable,
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
      error: `All health endpoints unreachable for ${baseUrl}`,
    };
    this.healthCache.set(model.id, result);
    return result;
  }
}
