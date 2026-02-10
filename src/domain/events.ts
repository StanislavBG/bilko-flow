/**
 * Run-time data plane event domain model.
 *
 * Events are the core of the run-time data plane, emitted as stable,
 * versioned schemas for downstream consumers.
 */

/** Event types emitted by the data plane. */
export type DataPlaneEventType =
  | 'run.created'
  | 'run.queued'
  | 'run.started'
  | 'run.succeeded'
  | 'run.failed'
  | 'run.canceled'
  | 'step.pending'
  | 'step.started'
  | 'step.succeeded'
  | 'step.failed'
  | 'step.canceled'
  | 'artifact.created'
  | 'attestation.issued'
  | 'provenance.recorded';

/** A data plane event with stable schema. */
export interface DataPlaneEvent {
  id: string;
  type: DataPlaneEventType;
  /** Event schema version for forward compatibility. */
  schemaVersion: string;
  timestamp: string;
  /** Tenant scoping. */
  accountId: string;
  projectId: string;
  environmentId: string;
  /** Associated resource IDs. */
  runId?: string;
  stepId?: string;
  workflowId?: string;
  artifactId?: string;
  attestationId?: string;
  /** Event-specific payload. */
  payload: Record<string, unknown>;
}

/** Event stream subscription. */
export interface EventSubscription {
  id: string;
  accountId: string;
  projectId: string;
  environmentId?: string;
  /** Filter by event types. */
  eventTypes?: DataPlaneEventType[];
  /** Callback for event delivery. */
  callback: (event: DataPlaneEvent) => void;
}
