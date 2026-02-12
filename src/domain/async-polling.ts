/**
 * Async polling timeout budget configuration.
 *
 * Media generation APIs (video, image) have fundamentally different
 * timing profiles than text generation. A single video clip can take
 * 3–8 minutes; multi-clip workflows can exceed 20 minutes total.
 *
 * This module provides layered timeout budgets that replace the
 * single flat timeout with phase-specific limits:
 *   - Submission timeout: How long to wait for the initial API call.
 *   - Poll interval: How often to check for completion.
 *   - Poll budget: Total wall-clock time allowed for polling.
 *   - Download timeout: How long to wait for content download.
 *
 * An optional progress callback allows UI layers to show real-time
 * polling status without coupling to the polling implementation.
 */

/** Progress info emitted during async polling. */
export interface AsyncPollingProgress {
  /** Current phase of the operation. */
  phase: 'submitting' | 'polling' | 'downloading';
  /** Number of poll attempts so far. */
  pollCount: number;
  /** Elapsed time in milliseconds since the operation started. */
  elapsedMs: number;
  /** Remaining budget in milliseconds (poll phase only). */
  remainingBudgetMs: number;
  /** Optional status message from the API. */
  statusMessage?: string;
}

/** Callback function for progress reporting during async polling. */
export type AsyncPollingProgressCallback = (progress: AsyncPollingProgress) => void;

/**
 * Layered timeout configuration for async operations.
 *
 * Each phase has its own budget, preventing a slow submission from
 * consuming the entire timeout, and allowing generous poll budgets
 * for long-running media generation.
 */
export interface AsyncPollingConfig {
  /** Maximum time (ms) to wait for the initial submission API call. Default: 30_000 (30s). */
  submissionTimeoutMs: number;
  /** Interval (ms) between poll requests. Default: 10_000 (10s). */
  pollIntervalMs: number;
  /** Total wall-clock budget (ms) for the polling phase. Default: 480_000 (8 min). */
  pollBudgetMs: number;
  /** Maximum time (ms) to wait for content download after completion. Default: 120_000 (2 min). */
  downloadTimeoutMs: number;
  /** Optional callback invoked with progress updates during polling. */
  onProgress?: AsyncPollingProgressCallback;
}

/** Default configuration suitable for media generation workflows. */
export const DEFAULT_ASYNC_POLLING_CONFIG: Readonly<AsyncPollingConfig> = {
  submissionTimeoutMs: 30_000,
  pollIntervalMs: 10_000,
  pollBudgetMs: 480_000,
  downloadTimeoutMs: 120_000,
};

/** Preset configurations for common use cases. */
export const ASYNC_POLLING_PRESETS = {
  /** Fast text/image generation: shorter budgets. */
  fast: {
    submissionTimeoutMs: 15_000,
    pollIntervalMs: 5_000,
    pollBudgetMs: 120_000,
    downloadTimeoutMs: 60_000,
  } satisfies AsyncPollingConfig,

  /** Standard media generation (single clip, ~3–8 min). */
  standard: {
    ...DEFAULT_ASYNC_POLLING_CONFIG,
  } satisfies AsyncPollingConfig,

  /** Long-running multi-clip workflows (up to 30 min total). */
  extended: {
    submissionTimeoutMs: 60_000,
    pollIntervalMs: 15_000,
    pollBudgetMs: 1_800_000,
    downloadTimeoutMs: 300_000,
  } satisfies AsyncPollingConfig,
} as const;

/**
 * Merge a partial polling config with the defaults.
 * Allows callers to override only the fields they care about.
 */
export function mergePollingConfig(
  override?: Partial<AsyncPollingConfig>,
): AsyncPollingConfig {
  if (!override) return { ...DEFAULT_ASYNC_POLLING_CONFIG };
  return {
    ...DEFAULT_ASYNC_POLLING_CONFIG,
    ...override,
  };
}

/**
 * Result of a polled async operation.
 */
export interface AsyncPollResult<T> {
  /** Whether the operation completed successfully. */
  success: boolean;
  /** The result data if successful. */
  data?: T;
  /** Error message if the operation failed or timed out. */
  error?: string;
  /** Number of poll attempts made. */
  pollCount: number;
  /** Total elapsed time in milliseconds. */
  totalElapsedMs: number;
  /** Whether the failure was due to a timeout. */
  timedOut: boolean;
}

/**
 * Execute an async operation with layered timeout budgets.
 *
 * @param submit - Function to submit the initial request. Returns an operation ID or handle.
 * @param poll - Function to check operation status. Returns the result if done, or null if still pending.
 * @param config - Timeout budget configuration.
 * @returns The poll result with timing metadata.
 */
export async function executeWithPollingBudget<T>(
  submit: (signal: AbortSignal) => Promise<string>,
  poll: (operationId: string, signal: AbortSignal) => Promise<T | null>,
  config: AsyncPollingConfig = DEFAULT_ASYNC_POLLING_CONFIG,
): Promise<AsyncPollResult<T>> {
  const startTime = Date.now();
  let pollCount = 0;

  // Phase 1: Submit
  const submitController = new AbortController();
  const submitTimer = setTimeout(
    () => submitController.abort(),
    config.submissionTimeoutMs,
  );

  let operationId: string;
  try {
    config.onProgress?.({
      phase: 'submitting',
      pollCount: 0,
      elapsedMs: 0,
      remainingBudgetMs: config.pollBudgetMs,
    });
    operationId = await submit(submitController.signal);
  } catch (err) {
    clearTimeout(submitTimer);
    return {
      success: false,
      error: `Submission failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      pollCount: 0,
      totalElapsedMs: Date.now() - startTime,
      timedOut: submitController.signal.aborted,
    };
  } finally {
    clearTimeout(submitTimer);
  }

  // Phase 2: Poll
  const pollDeadline = Date.now() + config.pollBudgetMs;

  while (Date.now() < pollDeadline) {
    await sleep(config.pollIntervalMs);
    pollCount++;

    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, pollDeadline - Date.now());

    config.onProgress?.({
      phase: 'polling',
      pollCount,
      elapsedMs: elapsed,
      remainingBudgetMs: remaining,
    });

    const pollController = new AbortController();
    const pollTimer = setTimeout(() => pollController.abort(), config.downloadTimeoutMs);

    try {
      const result = await poll(operationId, pollController.signal);
      clearTimeout(pollTimer);

      if (result !== null) {
        config.onProgress?.({
          phase: 'downloading',
          pollCount,
          elapsedMs: Date.now() - startTime,
          remainingBudgetMs: 0,
        });

        return {
          success: true,
          data: result,
          pollCount,
          totalElapsedMs: Date.now() - startTime,
          timedOut: false,
        };
      }
    } catch (err) {
      clearTimeout(pollTimer);
      // Transient poll errors — continue polling
      continue;
    }
  }

  // Poll budget exhausted
  return {
    success: false,
    error: `Poll budget exhausted after ${pollCount} attempts (${config.pollBudgetMs}ms)`,
    pollCount,
    totalElapsedMs: Date.now() - startTime,
    timedOut: true,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
