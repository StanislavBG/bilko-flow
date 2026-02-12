import {
  DEFAULT_ASYNC_POLLING_CONFIG,
  ASYNC_POLLING_PRESETS,
  mergePollingConfig,
  executeWithPollingBudget,
  AsyncPollingConfig,
  AsyncPollingProgress,
} from '../../src/domain/async-polling';

describe('DEFAULT_ASYNC_POLLING_CONFIG', () => {
  it('has sensible defaults for media generation', () => {
    expect(DEFAULT_ASYNC_POLLING_CONFIG.submissionTimeoutMs).toBe(30_000);
    expect(DEFAULT_ASYNC_POLLING_CONFIG.pollIntervalMs).toBe(10_000);
    expect(DEFAULT_ASYNC_POLLING_CONFIG.pollBudgetMs).toBe(480_000);
    expect(DEFAULT_ASYNC_POLLING_CONFIG.downloadTimeoutMs).toBe(120_000);
  });
});

describe('ASYNC_POLLING_PRESETS', () => {
  it('has fast preset with shorter budgets', () => {
    expect(ASYNC_POLLING_PRESETS.fast.pollBudgetMs).toBeLessThan(
      ASYNC_POLLING_PRESETS.standard.pollBudgetMs,
    );
  });

  it('has extended preset with longer budgets', () => {
    expect(ASYNC_POLLING_PRESETS.extended.pollBudgetMs).toBeGreaterThan(
      ASYNC_POLLING_PRESETS.standard.pollBudgetMs,
    );
  });
});

describe('mergePollingConfig', () => {
  it('returns defaults when no override is provided', () => {
    const config = mergePollingConfig();
    expect(config).toEqual(DEFAULT_ASYNC_POLLING_CONFIG);
  });

  it('merges partial overrides', () => {
    const config = mergePollingConfig({ pollIntervalMs: 5_000 });
    expect(config.pollIntervalMs).toBe(5_000);
    expect(config.submissionTimeoutMs).toBe(30_000); // kept default
    expect(config.pollBudgetMs).toBe(480_000); // kept default
  });

  it('returns a new object (not a reference to defaults)', () => {
    const config = mergePollingConfig();
    expect(config).not.toBe(DEFAULT_ASYNC_POLLING_CONFIG);
  });
});

describe('executeWithPollingBudget', () => {
  it('returns success when poll resolves immediately', async () => {
    const submit = jest.fn().mockResolvedValue('op-123');
    const poll = jest.fn().mockResolvedValue({ videoUrl: 'https://example.com/video.mp4' });

    const config: AsyncPollingConfig = {
      submissionTimeoutMs: 5_000,
      pollIntervalMs: 10, // tiny interval for test speed
      pollBudgetMs: 5_000,
      downloadTimeoutMs: 5_000,
    };

    const result = await executeWithPollingBudget(submit, poll, config);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ videoUrl: 'https://example.com/video.mp4' });
    expect(result.pollCount).toBe(1);
    expect(result.timedOut).toBe(false);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('polls multiple times until success', async () => {
    const submit = jest.fn().mockResolvedValue('op-456');
    let callCount = 0;
    const poll = jest.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 3) return null; // still pending
      return { result: 'done' };
    });

    const config: AsyncPollingConfig = {
      submissionTimeoutMs: 5_000,
      pollIntervalMs: 10,
      pollBudgetMs: 5_000,
      downloadTimeoutMs: 5_000,
    };

    const result = await executeWithPollingBudget(submit, poll, config);

    expect(result.success).toBe(true);
    expect(result.pollCount).toBe(3);
    expect(result.data).toEqual({ result: 'done' });
  });

  it('returns failure when submission fails', async () => {
    const submit = jest.fn().mockRejectedValue(new Error('Network error'));
    const poll = jest.fn();

    const config: AsyncPollingConfig = {
      submissionTimeoutMs: 5_000,
      pollIntervalMs: 10,
      pollBudgetMs: 5_000,
      downloadTimeoutMs: 5_000,
    };

    const result = await executeWithPollingBudget(submit, poll, config);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Submission failed');
    expect(result.pollCount).toBe(0);
    expect(poll).not.toHaveBeenCalled();
  });

  it('times out when poll budget is exhausted', async () => {
    const submit = jest.fn().mockResolvedValue('op-789');
    const poll = jest.fn().mockResolvedValue(null); // always pending

    const config: AsyncPollingConfig = {
      submissionTimeoutMs: 5_000,
      pollIntervalMs: 10,
      pollBudgetMs: 50, // very short budget
      downloadTimeoutMs: 5_000,
    };

    const result = await executeWithPollingBudget(submit, poll, config);

    expect(result.success).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.error).toContain('Poll budget exhausted');
  });

  it('invokes progress callback during polling', async () => {
    const progressUpdates: AsyncPollingProgress[] = [];
    const submit = jest.fn().mockResolvedValue('op-progress');
    let callCount = 0;
    const poll = jest.fn().mockImplementation(async () => {
      callCount++;
      return callCount >= 2 ? { done: true } : null;
    });

    const config: AsyncPollingConfig = {
      submissionTimeoutMs: 5_000,
      pollIntervalMs: 10,
      pollBudgetMs: 5_000,
      downloadTimeoutMs: 5_000,
      onProgress: (progress) => progressUpdates.push(progress),
    };

    await executeWithPollingBudget(submit, poll, config);

    expect(progressUpdates.length).toBeGreaterThanOrEqual(2);
    expect(progressUpdates[0].phase).toBe('submitting');
    expect(progressUpdates.some(p => p.phase === 'polling')).toBe(true);
  });
});
