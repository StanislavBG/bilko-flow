/**
 * Step runner — executes individual steps within a workflow run.
 *
 * Step execution is policy-driven: retries, timeouts, and backoff
 * are applied according to the compiled step policy.
 */

import { StepRunStatus, StepRunResult } from '../domain/run';
import { TypedError, createTypedError, stepTimeoutError } from '../domain/errors';
import { CompiledStep } from '../dsl/compiler';
import { logger } from '../logger';

/** Step execution context provided by the engine. */
export interface StepExecutionContext {
  runId: string;
  accountId: string;
  projectId: string;
  environmentId: string;
  /** Resolved secret values available to the step. */
  secrets: Record<string, string>;
  /** Outputs from upstream steps. */
  upstreamOutputs: Record<string, Record<string, unknown>>;
  /** Cancellation signal. */
  canceled: boolean;
}

/** Step handler interface — pluggable step implementations. */
export interface StepHandler {
  type: string;
  execute(
    step: CompiledStep,
    context: StepExecutionContext,
  ): Promise<{ outputs: Record<string, unknown> }>;
}

/** Registry of step handlers by type. */
const stepHandlers = new Map<string, StepHandler>();

/** Register a step handler. */
export function registerStepHandler(handler: StepHandler): void {
  stepHandlers.set(handler.type, handler);
}

/** Default step handler that returns mock outputs for development. */
function getDefaultHandler(stepType: string): StepHandler {
  return {
    type: stepType,
    async execute(step: CompiledStep, _context: StepExecutionContext) {
      // Reference implementation: simulate step execution
      return {
        outputs: {
          _mock: true,
          _stepType: step.type,
          _stepId: step.id,
          _message: `Default handler for ${step.type}: step executed successfully`,
        },
      };
    },
  };
}

/**
 * Validate determinism declarations against step type heuristics.
 * Logs warnings when a step is declared pure but uses types that
 * typically involve external APIs or nondeterminism.
 */
function validateDeterminismDeclarations(step: CompiledStep): void {
  const externalTypes = ['http.request', 'http.search', 'ai.summarize', 'ai.generate-text', 'ai.generate-image', 'ai.generate-video', 'social.post', 'notification.send'];
  const isExternalType = externalTypes.includes(step.type);

  if (step.determinism?.pureFunction && isExternalType) {
    logger.warn('Determinism declaration conflict', {
      stepId: step.id,
      stepType: step.type,
      issue: `Step declared as pureFunction but type "${step.type}" typically involves external APIs`,
      recommendation: 'Set pureFunction: false and usesExternalApis: true, or use determinism grade Replayable/BestEffort',
    });
  }

  if (step.determinism && !step.determinism.usesExternalApis && isExternalType) {
    logger.warn('Determinism declaration conflict', {
      stepId: step.id,
      stepType: step.type,
      issue: `Step declares usesExternalApis: false but type "${step.type}" implies external API usage`,
    });
  }
}

/** Execute a single step with retry and timeout policy. */
export async function executeStep(
  step: CompiledStep,
  context: StepExecutionContext,
): Promise<StepRunResult> {
  const startedAt = new Date().toISOString();
  const handler = stepHandlers.get(step.type) ?? getDefaultHandler(step.type);

  // Validate determinism declarations before execution
  validateDeterminismDeclarations(step);

  let lastError: TypedError | undefined;

  for (let attempt = 1; attempt <= step.policy.maxAttempts; attempt++) {
    if (context.canceled) {
      return {
        stepId: step.id,
        status: StepRunStatus.Canceled,
        startedAt,
        completedAt: new Date().toISOString(),
        attempts: attempt,
      };
    }

    try {
      const result = await executeWithTimeout(
        () => handler.execute(step, context),
        step.policy.timeoutMs,
      );

      const completedAt = new Date().toISOString();
      return {
        stepId: step.id,
        status: StepRunStatus.Succeeded,
        startedAt,
        completedAt,
        outputs: result.outputs,
        attempts: attempt,
        durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      };
    } catch (err) {
      const isTimeout = err instanceof TimeoutError;
      lastError = isTimeout
        ? stepTimeoutError(step.id, step.policy.timeoutMs, attempt)
        : createTypedError({
            code: 'STEP.EXECUTION_ERROR',
            message: err instanceof Error ? err.message : 'Unknown step execution error',
            stepId: step.id,
            retryable: attempt < step.policy.maxAttempts,
            details: { attempt, maxAttempts: step.policy.maxAttempts },
          });

      // Apply backoff before retry (except on last attempt)
      if (attempt < step.policy.maxAttempts) {
        const delay = computeBackoff(step.policy.backoffStrategy, step.policy.backoffBaseMs, attempt);
        await sleep(delay);
      }
    }
  }

  return {
    stepId: step.id,
    status: StepRunStatus.Failed,
    startedAt,
    completedAt: new Date().toISOString(),
    error: lastError,
    attempts: step.policy.maxAttempts,
    durationMs: Date.now() - new Date(startedAt).getTime(),
  };
}

/** Execute a function with a timeout. */
async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(timeoutMs)), timeoutMs);
    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

class TimeoutError extends Error {
  constructor(public timeoutMs: number) {
    super(`Step execution timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

/** Compute backoff delay based on strategy. */
function computeBackoff(
  strategy: 'fixed' | 'exponential',
  baseMs: number,
  attempt: number,
): number {
  if (strategy === 'fixed') return baseMs;
  return baseMs * Math.pow(2, attempt - 1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
