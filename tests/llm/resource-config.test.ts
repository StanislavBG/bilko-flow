import {
  createResourceConfig,
  validateResourceConfig,
  estimateVramGb,
  ResourceConfig,
} from '../../src/llm/resource-config';

describe('createResourceConfig', () => {
  test('creates config with default batch settings', () => {
    const config = createResourceConfig();
    expect(config.batch).toBeDefined();
    expect(config.batch!.maxBatchSize).toBe(1);
    expect(config.batch!.maxConcurrency).toBe(1);
  });

  test('merges overrides with defaults', () => {
    const config = createResourceConfig({
      gpu: { deviceIds: [0], memoryLimitMb: 8192 },
      batch: { maxBatchSize: 8, maxWaitMs: 100 },
    });

    expect(config.gpu!.deviceIds).toEqual([0]);
    expect(config.gpu!.memoryLimitMb).toBe(8192);
    expect(config.batch!.maxBatchSize).toBe(8);
    expect(config.batch!.maxWaitMs).toBe(100);
    // Default maxConcurrency should be overridden to undefined since overrides didn't include it
    expect(config.batch!.maxConcurrency).toBe(1);
  });

  test('passes through all resource fields', () => {
    const config = createResourceConfig({
      cpuThreads: 8,
      contextLength: 4096,
      quantization: { method: 'gptq', bits: 4 },
      memory: { maxRamMb: 16384, mmap: true },
    });

    expect(config.cpuThreads).toBe(8);
    expect(config.contextLength).toBe(4096);
    expect(config.quantization!.method).toBe('gptq');
    expect(config.memory!.mmap).toBe(true);
  });
});

describe('validateResourceConfig', () => {
  test('valid config passes validation', () => {
    const config = createResourceConfig({
      gpu: { deviceIds: [0], memoryLimitMb: 8192 },
      memory: { maxRamMb: 16384 },
      batch: { maxBatchSize: 4, maxWaitMs: 50, maxConcurrency: 2 },
    });

    const result = validateResourceConfig(config);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('empty config is valid', () => {
    const result = validateResourceConfig({});
    expect(result.valid).toBe(true);
  });

  test('rejects negative GPU memory', () => {
    const config: ResourceConfig = { gpu: { memoryLimitMb: -1 } };
    const result = validateResourceConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('GPU memoryLimitMb must be positive');
  });

  test('rejects GPU memory fraction out of range', () => {
    const config: ResourceConfig = { gpu: { memoryFraction: 1.5 } };
    const result = validateResourceConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('memoryFraction'))).toBe(true);
  });

  test('rejects zero GPU memory fraction', () => {
    const config: ResourceConfig = { gpu: { memoryFraction: 0 } };
    const result = validateResourceConfig(config);
    expect(result.valid).toBe(false);
  });

  test('accepts valid GPU memory fraction', () => {
    const config: ResourceConfig = { gpu: { memoryFraction: 0.9 } };
    const result = validateResourceConfig(config);
    expect(result.valid).toBe(true);
  });

  test('warns when both memoryLimitMb and memoryFraction set', () => {
    const config: ResourceConfig = {
      gpu: { memoryLimitMb: 8192, memoryFraction: 0.8 },
    };
    const result = validateResourceConfig(config);
    expect(result.warnings.some(w => w.includes('memoryLimitMb') && w.includes('memoryFraction'))).toBe(true);
  });

  test('rejects tensor parallelism with fewer than 2 GPUs', () => {
    const config: ResourceConfig = {
      gpu: { tensorParallel: true, deviceIds: [0] },
    };
    const result = validateResourceConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Tensor parallelism'))).toBe(true);
  });

  test('accepts tensor parallelism with 2+ GPUs', () => {
    const config: ResourceConfig = {
      gpu: { tensorParallel: true, deviceIds: [0, 1] },
    };
    const result = validateResourceConfig(config);
    expect(result.valid).toBe(true);
  });

  test('rejects negative RAM', () => {
    const config: ResourceConfig = { memory: { maxRamMb: -100 } };
    const result = validateResourceConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Memory maxRamMb must be positive');
  });

  test('rejects batch size less than 1', () => {
    const config: ResourceConfig = { batch: { maxBatchSize: 0 } };
    const result = validateResourceConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('maxBatchSize'))).toBe(true);
  });

  test('rejects negative batch wait time', () => {
    const config: ResourceConfig = { batch: { maxWaitMs: -1 } };
    const result = validateResourceConfig(config);
    expect(result.valid).toBe(false);
  });

  test('rejects concurrency less than 1', () => {
    const config: ResourceConfig = { batch: { maxConcurrency: 0 } };
    const result = validateResourceConfig(config);
    expect(result.valid).toBe(false);
  });

  test('warns on unusual quantization bits', () => {
    const config: ResourceConfig = { quantization: { bits: 7 } };
    const result = validateResourceConfig(config);
    expect(result.warnings.some(w => w.includes('Unusual quantization bits'))).toBe(true);
  });

  test('does not warn on standard quantization bits (4, 8, 16)', () => {
    for (const bits of [4, 8, 16]) {
      const result = validateResourceConfig({ quantization: { bits } });
      expect(result.warnings.filter(w => w.includes('quantization'))).toHaveLength(0);
    }
  });

  test('rejects cpuThreads less than 1', () => {
    const config: ResourceConfig = { cpuThreads: 0 };
    const result = validateResourceConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('cpuThreads'))).toBe(true);
  });

  test('rejects contextLength less than 1', () => {
    const config: ResourceConfig = { contextLength: 0 };
    const result = validateResourceConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('contextLength'))).toBe(true);
  });
});

describe('estimateVramGb', () => {
  test('estimates VRAM for 7B FP16 model', () => {
    const vram = estimateVramGb(7, 16);
    // 7B * 2 bytes = 14GB * 1.2 overhead ~ 16.8GB
    expect(vram).toBeGreaterThan(14);
    expect(vram).toBeLessThan(20);
  });

  test('estimates VRAM for 7B Q4 model', () => {
    const vram = estimateVramGb(7, 4);
    // 7B * 0.5 bytes = 3.5GB * 1.2 ~ 4.2GB
    expect(vram).toBeGreaterThan(3);
    expect(vram).toBeLessThan(6);
  });

  test('estimates VRAM for 70B Q4 model', () => {
    const vram = estimateVramGb(70, 4);
    // 70B * 0.5 bytes = 35GB * 1.2 ~ 42GB
    expect(vram).toBeGreaterThan(35);
    expect(vram).toBeLessThan(50);
  });

  test('defaults to FP16 when no quantization specified', () => {
    const vram = estimateVramGb(7);
    expect(vram).toBe(estimateVramGb(7, 16));
  });

  test('smaller quantization reduces VRAM estimate', () => {
    const fp16 = estimateVramGb(13, 16);
    const q8 = estimateVramGb(13, 8);
    const q4 = estimateVramGb(13, 4);

    expect(fp16).toBeGreaterThan(q8);
    expect(q8).toBeGreaterThan(q4);
  });
});
