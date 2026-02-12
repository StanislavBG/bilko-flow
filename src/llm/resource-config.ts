/**
 * Resource Configuration — GPU, memory, and batch optimization for local models.
 *
 * Addresses the critique's "Resource Management Gap" by providing typed
 * configuration for hardware constraints, GPU allocation, and batch
 * processing parameters that open-source model deployments require.
 *
 * Usage:
 *   const config = createResourceConfig({
 *     gpu: { deviceIds: [0], memoryLimitMb: 8192 },
 *     memory: { maxRamMb: 16384 },
 *     batch: { maxBatchSize: 8, maxWaitMs: 100 },
 *   });
 *
 *   // Validate before starting a model server
 *   const result = validateResourceConfig(config);
 *   if (!result.valid) console.error(result.errors);
 */

/** GPU allocation configuration. */
export interface GpuConfig {
  /** GPU device IDs to use (e.g., [0] for single GPU, [0,1] for multi-GPU). */
  deviceIds?: number[];
  /** Maximum GPU memory per device in MB. */
  memoryLimitMb?: number;
  /** Fraction of GPU memory to use (0.0-1.0). Alternative to memoryLimitMb. */
  memoryFraction?: number;
  /** Enable tensor parallelism across multiple GPUs. */
  tensorParallel?: boolean;
}

/** System memory configuration. */
export interface MemoryConfig {
  /** Maximum system RAM in MB for model loading and KV cache. */
  maxRamMb?: number;
  /** Enable memory-mapped model loading (reduces RAM usage). */
  mmap?: boolean;
  /** Lock model weights in RAM (prevents swapping). */
  mlock?: boolean;
}

/** Batch processing configuration for throughput optimization. */
export interface BatchConfig {
  /** Maximum number of requests to batch together. */
  maxBatchSize?: number;
  /** Maximum time to wait for batch fill before processing (ms). */
  maxWaitMs?: number;
  /** Enable continuous batching (dynamic batch sizing). */
  continuousBatching?: boolean;
  /** Maximum number of concurrent requests. */
  maxConcurrency?: number;
}

/** Quantization configuration for reduced model size. */
export interface QuantizationConfig {
  /** Quantization method (e.g., 'gptq', 'awq', 'gguf'). */
  method?: string;
  /** Quantization bits (e.g., 4, 8). */
  bits?: number;
  /** Specific quantization variant (e.g., 'q4_0', 'q4_K_M'). */
  variant?: string;
}

/** Complete resource configuration for a local model deployment. */
export interface ResourceConfig {
  gpu?: GpuConfig;
  memory?: MemoryConfig;
  batch?: BatchConfig;
  quantization?: QuantizationConfig;
  /** Number of CPU threads for inference (relevant for CPU-only or hybrid). */
  cpuThreads?: number;
  /** Context window size override (tokens). */
  contextLength?: number;
}

/** Validation result for a resource configuration. */
export interface ResourceValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Create a resource config with sensible defaults. */
export function createResourceConfig(overrides?: Partial<ResourceConfig>): ResourceConfig {
  return {
    gpu: overrides?.gpu,
    memory: overrides?.memory,
    batch: {
      maxBatchSize: 1,
      maxConcurrency: 1,
      ...overrides?.batch,
    },
    quantization: overrides?.quantization,
    cpuThreads: overrides?.cpuThreads,
    contextLength: overrides?.contextLength,
  };
}

/** Validate a resource configuration for consistency. */
export function validateResourceConfig(config: ResourceConfig): ResourceValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (config.gpu) {
    if (config.gpu.memoryLimitMb !== undefined && config.gpu.memoryLimitMb <= 0) {
      errors.push('GPU memoryLimitMb must be positive');
    }
    if (config.gpu.memoryFraction !== undefined) {
      if (config.gpu.memoryFraction <= 0 || config.gpu.memoryFraction > 1) {
        errors.push('GPU memoryFraction must be between 0 (exclusive) and 1 (inclusive)');
      }
    }
    if (config.gpu.memoryLimitMb && config.gpu.memoryFraction) {
      warnings.push('Both memoryLimitMb and memoryFraction set; memoryLimitMb takes precedence in most runtimes');
    }
    if (config.gpu.tensorParallel && (!config.gpu.deviceIds || config.gpu.deviceIds.length < 2)) {
      errors.push('Tensor parallelism requires at least 2 GPU devices');
    }
  }

  if (config.memory) {
    if (config.memory.maxRamMb !== undefined && config.memory.maxRamMb <= 0) {
      errors.push('Memory maxRamMb must be positive');
    }
  }

  if (config.batch) {
    if (config.batch.maxBatchSize !== undefined && config.batch.maxBatchSize < 1) {
      errors.push('Batch maxBatchSize must be at least 1');
    }
    if (config.batch.maxWaitMs !== undefined && config.batch.maxWaitMs < 0) {
      errors.push('Batch maxWaitMs cannot be negative');
    }
    if (config.batch.maxConcurrency !== undefined && config.batch.maxConcurrency < 1) {
      errors.push('Batch maxConcurrency must be at least 1');
    }
  }

  if (config.quantization) {
    if (config.quantization.bits !== undefined && ![2, 3, 4, 5, 6, 8, 16].includes(config.quantization.bits)) {
      warnings.push(`Unusual quantization bits: ${config.quantization.bits}. Common values are 4, 8, 16.`);
    }
  }

  if (config.cpuThreads !== undefined && config.cpuThreads < 1) {
    errors.push('cpuThreads must be at least 1');
  }

  if (config.contextLength !== undefined && config.contextLength < 1) {
    errors.push('contextLength must be at least 1');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Estimate VRAM requirements for a model based on parameter count and quantization.
 *
 * This is a rough approximation. Actual VRAM depends on batch size, sequence
 * length, KV cache, and framework overhead.
 */
export function estimateVramGb(
  parametersBillion: number,
  quantizationBits: number = 16,
): number {
  // Rough formula: params * bits / 8 bytes * overhead factor
  const bytesPerParam = quantizationBits / 8;
  const modelSizeGb = (parametersBillion * 1e9 * bytesPerParam) / (1024 * 1024 * 1024);
  // ~20% overhead for KV cache and framework at batch size 1
  return Math.ceil(modelSizeGb * 1.2 * 10) / 10;
}
