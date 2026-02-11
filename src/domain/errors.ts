/**
 * Typed error model for machine-actionable error handling.
 *
 * Errors are returned as typed responses rather than thrown exceptions,
 * enabling cloud agents to parse failures and apply remediation steps.
 */

/** Top-level error domain namespaces. */
export type ErrorDomain =
  | 'STEP'
  | 'RUN'
  | 'WORKFLOW'
  | 'SECRETS'
  | 'AUTH'
  | 'RATE_LIMIT'
  | 'NETWORK'
  | 'VALIDATION'
  | 'PLANNER'
  | 'ACCOUNT'
  | 'SYSTEM';

/** Typed suggested fix that agents can apply. */
export interface SuggestedFix {
  type: string;
  params: Record<string, unknown>;
  description?: string;
}

/** Feedback channel information. */
export interface FeedbackChannel {
  channel: 'api' | 'webhook' | 'event-stream';
  event?: string;
}

/** The core typed error structure returned in API responses and events. */
export interface TypedError {
  /** Namespaced error code (e.g., "STEP.HTTP.TIMEOUT"). */
  code: string;
  /** Human-readable error message. */
  message: string;
  /** Associated step if applicable. */
  stepId?: string;
  /** Associated run if applicable. */
  runId?: string;
  /** Whether the same operation is expected to succeed without changes. */
  retryable: boolean;
  /** Structured detail payload. */
  details?: Record<string, unknown>;
  /** Machine-actionable remediation suggestions. */
  suggestedFixes: SuggestedFix[];
  /** Feedback delivery metadata. */
  feedback?: FeedbackChannel;
}

/** Create a typed error with defaults. */
export function createTypedError(params: {
  code: string;
  message: string;
  stepId?: string;
  runId?: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
  suggestedFixes?: SuggestedFix[];
  feedback?: FeedbackChannel;
}): TypedError {
  return {
    code: params.code,
    message: params.message,
    stepId: params.stepId,
    runId: params.runId,
    retryable: params.retryable ?? false,
    details: params.details,
    suggestedFixes: params.suggestedFixes ?? [],
    feedback: params.feedback,
  };
}

// --- Common error factory functions ---

export function validationError(message: string, details?: Record<string, unknown>, fixes?: SuggestedFix[]): TypedError {
  return createTypedError({
    code: 'VALIDATION.SCHEMA',
    message,
    retryable: false,
    details,
    suggestedFixes: fixes,
  });
}

export function authError(message: string): TypedError {
  return createTypedError({
    code: 'AUTH.FORBIDDEN',
    message,
    retryable: false,
  });
}

export function notFoundError(resourceType: string, resourceId: string): TypedError {
  return createTypedError({
    code: 'VALIDATION.NOT_FOUND',
    message: `${resourceType} not found: ${resourceId}`,
    retryable: false,
  });
}

export function stepTimeoutError(stepId: string, timeoutMs: number, attempt: number): TypedError {
  return createTypedError({
    code: 'STEP.HTTP.TIMEOUT',
    message: 'Request timed out',
    stepId,
    retryable: true,
    details: { timeoutMs, attempt },
    suggestedFixes: [
      { type: 'INCREASE_TIMEOUT', params: { timeoutMs: timeoutMs * 1.5 } },
      { type: 'REDUCE_SCOPE', params: {} },
    ],
    feedback: { channel: 'webhook', event: 'run.failed' },
  });
}

export function secretMissingError(secretKey: string): TypedError {
  return createTypedError({
    code: 'SECRETS.MISSING',
    message: `Required secret not found: ${secretKey}`,
    retryable: false,
    suggestedFixes: [
      { type: 'PROVIDE_SECRET', params: { key: secretKey }, description: `Provide value for secret "${secretKey}"` },
    ],
  });
}

export function rateLimitError(retryAfterMs?: number): TypedError {
  return createTypedError({
    code: 'RATE_LIMIT.EXCEEDED',
    message: 'Rate limit exceeded',
    retryable: true,
    details: retryAfterMs ? { retryAfterMs } : undefined,
    suggestedFixes: [
      { type: 'WAIT_AND_RETRY', params: { delayMs: retryAfterMs ?? 1000 } },
    ],
  });
}

export function workflowCompilationError(message: string, fixes?: SuggestedFix[]): TypedError {
  return createTypedError({
    code: 'WORKFLOW.COMPILATION',
    message,
    retryable: false,
    suggestedFixes: fixes,
  });
}

export function determinismViolationError(message: string, stepId?: string, fixes?: SuggestedFix[]): TypedError {
  return createTypedError({
    code: 'WORKFLOW.DETERMINISM_VIOLATION',
    message,
    stepId,
    retryable: false,
    suggestedFixes: fixes,
  });
}

/**
 * Create a typed error for an external API call failure, with retryability
 * determined by HTTP status code.
 *
 * - 400, 401, 403, 404: Non-retryable configuration errors (bad model name,
 *   wrong API key, resource doesn't exist). Fix the config and re-deploy.
 * - 429: Rate limited — retryable after backoff.
 * - 500, 502, 503, 504: Transient server errors — retryable.
 * - Everything else: Non-retryable by default.
 */
export function stepExternalApiError(
  stepId: string,
  message: string,
  statusCode: number,
  details?: Record<string, unknown>,
): TypedError {
  const retryable = statusCode === 429 || statusCode >= 500;
  const fixes: SuggestedFix[] = [];

  if (statusCode === 404) {
    fixes.push({ type: 'FIX_RESOURCE_NOT_FOUND', params: { statusCode }, description: 'The requested resource (e.g., model) does not exist. Verify the identifier.' });
  } else if (statusCode === 401 || statusCode === 403) {
    fixes.push({ type: 'CHECK_API_KEY', params: { statusCode }, description: 'Authentication failed. Verify the API key has the required permissions.' });
  } else if (statusCode === 429) {
    fixes.push({ type: 'WAIT_AND_RETRY', params: { delayMs: 2000 }, description: 'Rate limit exceeded. Retry after backoff.' });
  } else if (statusCode >= 500) {
    fixes.push({ type: 'WAIT_AND_RETRY', params: { delayMs: 5000 }, description: 'Transient server error. Retry after backoff.' });
  }

  return createTypedError({
    code: retryable ? 'STEP.EXTERNAL_API.TRANSIENT' : 'STEP.EXTERNAL_API.CONFIG',
    message,
    stepId,
    retryable,
    details: { statusCode, ...details },
    suggestedFixes: fixes,
  });
}

/** API error response wrapper. */
export interface ApiErrorResponse {
  error: TypedError;
}

/** Construct an API error response. */
export function apiError(error: TypedError): ApiErrorResponse {
  return { error };
}
