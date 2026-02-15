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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SECRET MASKING — prevents API keys and tokens from leaking into error
 * messages, logs, or typed error payloads sent to consumers.
 *
 * ## WHY THIS EXISTS
 *
 * The architectural audit identified that LLM adapter error messages could
 * include raw API keys when reporting connection failures (e.g., the key
 * appearing in a URL or error string). Since TypedError payloads are
 * serialized to JSON and returned in API responses, webhook payloads, and
 * event streams, unmasked secrets would propagate to any system consuming
 * bilko-flow's error output.
 *
 * ## HOW IT WORKS
 *
 * `maskSecret()` replaces all but the last 4 characters of a secret with
 * asterisks. Secrets shorter than 8 characters are fully masked.
 *
 * `maskSecretsInMessage()` scans a message string for any of the provided
 * secret values and replaces them with masked versions. This is called
 * before constructing TypedError instances in LLM adapters and anywhere
 * else that error messages might contain secrets.
 *
 * ## USAGE
 *
 * ```ts
 * import { maskSecret, maskSecretsInMessage } from '../domain/errors';
 *
 * // Direct masking:
 * maskSecret('sk-abc123def456');  // → '**********f456'
 *
 * // Message scanning:
 * const safeMsg = maskSecretsInMessage(
 *   `Connection failed for key sk-abc123def456`,
 *   ['sk-abc123def456'],
 * );
 * // → 'Connection failed for key **********f456'
 * ```
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Mask a secret value, preserving only the last 4 characters for
 * identification. Secrets shorter than 8 characters are fully masked.
 *
 * @param secret - The raw secret value to mask.
 * @returns A masked string safe for inclusion in error messages and logs.
 */
export function maskSecret(secret: string): string {
  if (!secret || secret.length < 8) return '****';
  return '*'.repeat(secret.length - 4) + secret.slice(-4);
}

/**
 * Scan an error message for any of the provided secret values and replace
 * each occurrence with its masked equivalent. Returns the message unchanged
 * if no secrets are found (or the secrets array is empty).
 *
 * @param message - The raw error message that may contain secrets.
 * @param secrets - Array of secret values to scan for and mask.
 * @returns A sanitized message safe for inclusion in typed errors.
 */
export function maskSecretsInMessage(message: string, secrets: string[]): string {
  let result = message;
  for (const secret of secrets) {
    if (secret && secret.length > 0) {
      // Use split/join instead of regex to avoid special character issues
      result = result.split(secret).join(maskSecret(secret));
    }
  }
  return result;
}

// --- RUN error factory functions (v0.3.0 — completes error taxonomy) ---

export function runNotFoundError(runId: string): TypedError {
  return createTypedError({
    code: 'RUN.NOT_FOUND',
    message: `Run not found: ${runId}`,
    runId,
    retryable: false,
  });
}

export function runCanceledError(runId: string, reason?: string): TypedError {
  return createTypedError({
    code: 'RUN.CANCELED',
    message: reason ? `Run canceled: ${reason}` : 'Run canceled',
    runId,
    retryable: false,
    details: reason ? { reason } : undefined,
  });
}

export function runTimeoutError(runId: string, timeoutMs: number): TypedError {
  return createTypedError({
    code: 'RUN.TIMEOUT',
    message: `Run exceeded timeout of ${timeoutMs}ms`,
    runId,
    retryable: true,
    details: { timeoutMs },
    suggestedFixes: [
      { type: 'INCREASE_TIMEOUT', params: { timeoutMs: timeoutMs * 2 } },
    ],
  });
}

export function runInvalidStateTransition(runId: string, from: string, to: string): TypedError {
  return createTypedError({
    code: 'RUN.INVALID_STATE_TRANSITION',
    message: `Cannot transition run from "${from}" to "${to}"`,
    runId,
    retryable: false,
    details: { from, to },
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
