/**
 * Error presentation layer for surfacing actionable errors to users.
 *
 * When a flow reaches "done" state despite failed media generation,
 * users see no actionable error details. This module provides a
 * mapping from TypedError codes to user-facing error presentations
 * with severity levels, user messages, retry affordances, and
 * suggested actions.
 */

import { TypedError } from './errors';

/** Severity levels for error presentation. */
export type ErrorSeverity = 'info' | 'warning' | 'error';

/**
 * User-facing error presentation.
 *
 * Maps a TypedError to a renderable error display with:
 * - Severity classification for visual treatment
 * - User-facing message (non-technical)
 * - Optional technical details (expandable)
 * - Retry affordance (can the user retry?)
 * - Suggested actions the user can take
 */
export interface ErrorPresentation {
  /** Visual severity: info (blue), warning (amber), error (red). */
  severity: ErrorSeverity;
  /** Short, user-friendly error title. */
  title: string;
  /** User-facing explanation of what went wrong. */
  userMessage: string;
  /** Optional technical details for expandable error traces. */
  technicalDetails?: string;
  /** Whether a retry button should be shown. */
  retryable: boolean;
  /** Suggested user actions (e.g., "Check your API key", "Try a smaller input"). */
  suggestedActions: string[];
  /** Original TypedError code for programmatic handling. */
  errorCode: string;
  /** Associated step ID, if applicable. */
  stepId?: string;
}

/**
 * Rule for mapping a TypedError code pattern to a presentation.
 *
 * Code patterns support prefix matching: 'STEP.HTTP' matches
 * 'STEP.HTTP.TIMEOUT', 'STEP.HTTP.CONNECT_FAILED', etc.
 */
export interface ErrorPresentationRule {
  /** Error code prefix to match against. */
  codePrefix: string;
  /** Severity to assign. */
  severity: ErrorSeverity;
  /** Template for the user-facing title. May use {stepId}. */
  titleTemplate: string;
  /** Template for the user-facing message. May use {message}, {stepId}. */
  messageTemplate: string;
  /** Whether to show retry affordance. If undefined, inherits from TypedError.retryable. */
  retryable?: boolean;
  /** Static suggested actions for this error class. */
  suggestedActions: string[];
}

/** Built-in error presentation rules, ordered from most specific to least. */
export const DEFAULT_ERROR_PRESENTATION_RULES: ErrorPresentationRule[] = [
  // Step-level errors
  {
    codePrefix: 'STEP.HTTP.TIMEOUT',
    severity: 'warning',
    titleTemplate: 'Step Timed Out',
    messageTemplate: 'Step "{stepId}" did not complete within the allowed time. This may be due to a slow external service.',
    suggestedActions: [
      'Increase the step timeout in your workflow configuration',
      'Check the external service status',
      'Try reducing the input size',
    ],
  },
  {
    codePrefix: 'STEP.EXTERNAL_API.CONFIG',
    severity: 'error',
    titleTemplate: 'Configuration Error',
    messageTemplate: '{message}',
    retryable: false,
    suggestedActions: [
      'Verify the API key or credentials',
      'Check that the resource (model, endpoint) exists',
      'Review the step configuration in your workflow',
    ],
  },
  {
    codePrefix: 'STEP.EXTERNAL_API.TRANSIENT',
    severity: 'warning',
    titleTemplate: 'Temporary Service Error',
    messageTemplate: 'An external service returned a temporary error. The system will retry automatically.',
    suggestedActions: [
      'Wait and retry the workflow',
      'Check the external service status page',
    ],
  },
  {
    codePrefix: 'STEP.NON_RETRYABLE',
    severity: 'error',
    titleTemplate: 'Step Failed',
    messageTemplate: '{message}',
    retryable: false,
    suggestedActions: [
      'Check the step configuration',
      'Verify the input data is valid',
    ],
  },
  {
    codePrefix: 'STEP.EXECUTION_ERROR',
    severity: 'error',
    titleTemplate: 'Step Execution Failed',
    messageTemplate: 'Step "{stepId}" encountered an error: {message}',
    suggestedActions: [
      'Review the step inputs',
      'Check the step handler logs',
      'Retry the workflow',
    ],
  },
  // Workflow-level errors
  {
    codePrefix: 'WORKFLOW.COMPILATION',
    severity: 'error',
    titleTemplate: 'Workflow Compilation Failed',
    messageTemplate: 'The workflow could not be compiled. Review the workflow definition for errors.',
    retryable: false,
    suggestedActions: [
      'Check the workflow definition for syntax errors',
      'Ensure all step dependencies are valid',
      'Verify all required fields are present',
    ],
  },
  {
    codePrefix: 'WORKFLOW.DETERMINISM_VIOLATION',
    severity: 'warning',
    titleTemplate: 'Determinism Violation',
    messageTemplate: '{message}',
    retryable: false,
    suggestedActions: [
      'Review the step determinism declarations',
      'Pin non-deterministic inputs (e.g., timestamps)',
    ],
  },
  // Auth/secrets errors
  {
    codePrefix: 'AUTH',
    severity: 'error',
    titleTemplate: 'Authentication Error',
    messageTemplate: '{message}',
    retryable: false,
    suggestedActions: [
      'Verify your authentication credentials',
      'Check that your account has the required permissions',
    ],
  },
  {
    codePrefix: 'SECRETS.MISSING',
    severity: 'error',
    titleTemplate: 'Missing Secret',
    messageTemplate: '{message}',
    retryable: false,
    suggestedActions: [
      'Provide the required secret value',
      'Check that the secret name matches the workflow definition',
    ],
  },
  // Rate limiting
  {
    codePrefix: 'RATE_LIMIT',
    severity: 'warning',
    titleTemplate: 'Rate Limited',
    messageTemplate: 'The request was rate limited. The system will retry after a delay.',
    suggestedActions: [
      'Wait and retry',
      'Reduce the frequency of requests',
    ],
  },
  // Validation errors
  {
    codePrefix: 'VALIDATION',
    severity: 'error',
    titleTemplate: 'Validation Error',
    messageTemplate: '{message}',
    retryable: false,
    suggestedActions: [
      'Review the input data',
      'Check the field requirements',
    ],
  },
];

/**
 * Present a TypedError as a user-facing ErrorPresentation.
 *
 * Matches the error code against the rules (most-specific first),
 * interpolates template variables, and returns a renderable presentation.
 *
 * @param error - The TypedError to present.
 * @param rules - Optional custom rules. Defaults to DEFAULT_ERROR_PRESENTATION_RULES.
 * @returns A user-facing error presentation.
 */
export function presentError(
  error: TypedError,
  rules: ErrorPresentationRule[] = DEFAULT_ERROR_PRESENTATION_RULES,
): ErrorPresentation {
  // Find the first matching rule by code prefix
  const rule = rules.find((r) => error.code.startsWith(r.codePrefix));

  if (rule) {
    return {
      severity: rule.severity,
      title: interpolate(rule.titleTemplate, error),
      userMessage: interpolate(rule.messageTemplate, error),
      technicalDetails: formatTechnicalDetails(error),
      retryable: rule.retryable ?? error.retryable,
      suggestedActions: [
        ...rule.suggestedActions,
        ...error.suggestedFixes.map((f) => f.description ?? `Apply fix: ${f.type}`),
      ],
      errorCode: error.code,
      stepId: error.stepId,
    };
  }

  // Fallback for unmatched error codes
  return {
    severity: 'error',
    title: 'Error',
    userMessage: error.message,
    technicalDetails: formatTechnicalDetails(error),
    retryable: error.retryable,
    suggestedActions: error.suggestedFixes.map(
      (f) => f.description ?? `Apply fix: ${f.type}`,
    ),
    errorCode: error.code,
    stepId: error.stepId,
  };
}

/**
 * Map an array of TypedErrors to ErrorPresentations, deduplicating
 * by error code and keeping the highest severity for each code.
 */
export function presentErrors(
  errors: TypedError[],
  rules?: ErrorPresentationRule[],
): ErrorPresentation[] {
  const byCode = new Map<string, ErrorPresentation>();
  const severityOrder: Record<ErrorSeverity, number> = { info: 0, warning: 1, error: 2 };

  for (const error of errors) {
    const presentation = presentError(error, rules);
    const existing = byCode.get(error.code);
    if (!existing || severityOrder[presentation.severity] > severityOrder[existing.severity]) {
      byCode.set(error.code, presentation);
    }
  }

  return Array.from(byCode.values());
}

/** Get the highest severity from an array of presentations. */
export function maxSeverity(presentations: ErrorPresentation[]): ErrorSeverity {
  const severityOrder: Record<ErrorSeverity, number> = { info: 0, warning: 1, error: 2 };
  let max: ErrorSeverity = 'info';
  for (const p of presentations) {
    if (severityOrder[p.severity] > severityOrder[max]) {
      max = p.severity;
    }
  }
  return max;
}

/** Interpolate template variables like {message}, {stepId}. */
function interpolate(template: string, error: TypedError): string {
  return template
    .replace(/\{message\}/g, error.message)
    .replace(/\{stepId\}/g, error.stepId ?? 'unknown')
    .replace(/\{code\}/g, error.code);
}

/** Format technical details from a TypedError for expandable display. */
function formatTechnicalDetails(error: TypedError): string {
  const parts: string[] = [
    `Code: ${error.code}`,
    `Message: ${error.message}`,
    `Retryable: ${error.retryable}`,
  ];
  if (error.stepId) parts.push(`Step: ${error.stepId}`);
  if (error.runId) parts.push(`Run: ${error.runId}`);
  if (error.details) {
    parts.push(`Details: ${JSON.stringify(error.details, null, 2)}`);
  }
  if (error.suggestedFixes.length > 0) {
    parts.push(`Fixes: ${error.suggestedFixes.map((f) => f.type).join(', ')}`);
  }
  return parts.join('\n');
}
