/**
 * Step runner — executes individual steps within a workflow run.
 *
 * Step execution is policy-driven: retries, timeouts, and backoff
 * are applied according to the compiled step policy.
 */

import { StepRunStatus, StepRunResult } from '../domain/run';
import { TypedError, createTypedError, stepTimeoutError } from '../domain/errors';
import { CompiledStep } from '../dsl/compiler';

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

/** Input field constraint for a step handler. */
export interface InputFieldContract {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  /** Static allowed values, or a function that resolves them at validation time. */
  oneOf?: readonly string[] | (() => string[]);
  /** Human-readable description of this field. */
  description?: string;
}

/** Result of a step handler's validate hook. */
export interface StepValidationResult {
  valid: boolean;
  errors: string[];
}

/** Step handler interface — pluggable step implementations. */
export interface StepHandler {
  type: string;

  /**
   * Declare the expected shape of step inputs.
   * Used during compilation to catch configuration errors early.
   */
  inputContract?: Record<string, InputFieldContract>;

  /**
   * Pre-flight validation called during workflow compilation.
   * Validates step inputs against runtime constraints (e.g., model availability).
   * Return errors to block compilation; return valid to allow execution.
   */
  validate?(step: CompiledStep): StepValidationResult | Promise<StepValidationResult>;

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

/** Get a registered handler by type. Returns undefined if not registered. */
export function getStepHandler(type: string): StepHandler | undefined {
  return stepHandlers.get(type);
}

/** Get all registered step handlers. */
export function getRegisteredHandlers(): Map<string, StepHandler> {
  return stepHandlers;
}


/** Execute a single step with retry and timeout policy. */
export async function executeStep(
  step: CompiledStep,
  context: StepExecutionContext,
): Promise<StepRunResult> {
  const startedAt = new Date().toISOString();
  const handler = stepHandlers.get(step.type);
  if (!handler) {
    return {
      stepId: step.id,
      status: StepRunStatus.Failed,
      startedAt,
      completedAt: new Date().toISOString(),
      error: createTypedError({
        code: 'STEP.NO_HANDLER',
        message: `No handler registered for step type "${step.type}". Register a handler with registerStepHandler() before executing this workflow.`,
        stepId: step.id,
        retryable: false,
        suggestedFixes: [
          { type: 'REGISTER_HANDLER', params: { stepType: step.type }, description: `Register a step handler for "${step.type}"` },
        ],
      }),
      attempts: 0,
      durationMs: 0,
    };
  }

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
      // Non-retryable errors (e.g., 404 model not found, 400 bad config)
      // should fail immediately without exhausting retry attempts.
      if (err instanceof NonRetryableStepError) {
        return {
          stepId: step.id,
          status: StepRunStatus.Failed,
          startedAt,
          completedAt: new Date().toISOString(),
          error: createTypedError({
            code: 'STEP.NON_RETRYABLE',
            message: err.message,
            stepId: step.id,
            retryable: false,
            details: { attempt, statusCode: err.statusCode },
            suggestedFixes: [
              { type: 'FIX_CONFIGURATION', params: {}, description: 'Fix the step configuration (e.g., model name, API key)' },
            ],
          }),
          attempts: attempt,
          durationMs: Date.now() - new Date(startedAt).getTime(),
        };
      }

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

/**
 * Error that step handlers throw to indicate the failure is non-retryable.
 *
 * Use this for configuration errors (wrong model name, invalid API key, 404s)
 * that will never succeed regardless of how many times we retry.
 * The step runner will immediately fail the step without exhausting retry attempts.
 */
export class NonRetryableStepError extends Error {
  public readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'NonRetryableStepError';
    this.statusCode = statusCode;
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
