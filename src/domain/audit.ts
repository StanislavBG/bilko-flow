/**
 * Audit trail domain model.
 *
 * Immutable, queryable audit records for control-plane and execution-plane actions.
 */

/** Audit event categories. */
export type AuditAction =
  // Control-plane
  | 'account.created'
  | 'account.updated'
  | 'project.created'
  | 'project.updated'
  | 'environment.created'
  | 'environment.updated'
  | 'workflow.created'
  | 'workflow.updated'
  | 'workflow.archived'
  | 'secret.created'
  | 'secret.updated'
  | 'role.assigned'
  | 'role.revoked'
  | 'policy.updated'
  // Execution-plane
  | 'run.created'
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'run.canceled'
  | 'run.retried'
  | 'step.started'
  | 'step.completed'
  | 'step.failed'
  | 'artifact.created'
  | 'attestation.issued'
  | 'secret.resolved'
  | 'event.published';

/** Resource types for audit records. */
export type AuditResourceType =
  | 'account'
  | 'project'
  | 'environment'
  | 'workflow'
  | 'run'
  | 'step'
  | 'artifact'
  | 'attestation'
  | 'secret'
  | 'role-binding'
  | 'policy';

/** Audit outcome. */
export type AuditOutcome = 'success' | 'failure' | 'denied';

/** An immutable audit record. */
export interface AuditRecord {
  id: string;
  timestamp: string;
  accountId: string;
  projectId?: string;
  environmentId?: string;
  actorId: string;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string;
  outcome: AuditOutcome;
  /** Additional context about the action. */
  details?: Record<string, unknown>;
}
