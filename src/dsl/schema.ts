/**
 * DSL JSON Schema definitions for workflow validation.
 *
 * The canonical, versioned schema is the source of truth for validation,
 * versioning, determinism declarations, testing, and execution.
 */

/** Step types recognized by the schema. */
export const VALID_STEP_TYPES = [
  'http.search',
  'http.request',
  'transform.filter',
  'transform.map',
  'transform.reduce',
  'ai.summarize',
  'ai.generate-text',
  'ai.generate-image',
  'ai.generate-video',
  'social.post',
  'notification.send',
  'custom',
] as const;

/** Determinism grade values. */
export const VALID_DETERMINISM_GRADES = ['pure', 'replayable', 'best-effort'] as const;

/** Time source kinds. */
export const VALID_TIME_SOURCE_KINDS = ['pinned-run-time', 'wall-clock'] as const;

/** External dependency kinds. */
export const VALID_EXTERNAL_DEPENDENCY_KINDS = [
  'http-api',
  'database',
  'message-queue',
  'file-system',
  'other',
] as const;

/** Evidence capture strategies. */
export const VALID_EVIDENCE_CAPTURE = ['full-response', 'response-hash', 'none'] as const;

/** Required fields for a workflow DSL document. */
export const REQUIRED_WORKFLOW_FIELDS = [
  'name',
  'accountId',
  'projectId',
  'environmentId',
  'determinism',
  'entryStepId',
  'steps',
] as const;

/** Required fields for a step. */
export const REQUIRED_STEP_FIELDS = [
  'id',
  'name',
  'type',
  'dependsOn',
  'inputs',
  'policy',
] as const;

/** Required fields for step policy. */
export const REQUIRED_POLICY_FIELDS = ['timeoutMs', 'maxAttempts'] as const;

/** Validation constraints. */
export const SCHEMA_CONSTRAINTS = {
  /** Maximum number of steps per workflow. */
  maxSteps: 200,
  /** Maximum step name length. */
  maxStepNameLength: 256,
  /** Maximum workflow name length. */
  maxWorkflowNameLength: 256,
  /** Minimum timeout in milliseconds. */
  minTimeoutMs: 1000,
  /** Maximum timeout in milliseconds (10 minutes). */
  maxTimeoutMs: 600000,
  /** Maximum retry attempts. */
  maxAttempts: 10,
  /** Minimum retry attempts. */
  minAttempts: 1,
} as const;
