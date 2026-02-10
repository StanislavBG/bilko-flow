/**
 * Run domain model.
 *
 * A single execution instance of a workflow definition, producing
 * step-level results, logs, provenance, artifacts, and run-time events.
 */

import { DeterminismGrade } from './determinism';
import { TypedError } from './errors';

/** Workflow run lifecycle states. */
export enum RunStatus {
  Created = 'created',
  Queued = 'queued',
  Running = 'running',
  Succeeded = 'succeeded',
  Failed = 'failed',
  Canceled = 'canceled',
}

/** Step-level run states. */
export enum StepRunStatus {
  Pending = 'pending',
  Running = 'running',
  Succeeded = 'succeeded',
  Failed = 'failed',
  Canceled = 'canceled',
}

/** Valid state transitions for runs. */
export const VALID_RUN_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  [RunStatus.Created]: [RunStatus.Queued, RunStatus.Canceled],
  [RunStatus.Queued]: [RunStatus.Running, RunStatus.Canceled],
  [RunStatus.Running]: [RunStatus.Succeeded, RunStatus.Failed, RunStatus.Canceled],
  [RunStatus.Succeeded]: [],
  [RunStatus.Failed]: [],
  [RunStatus.Canceled]: [],
};

/** Valid state transitions for step runs. */
export const VALID_STEP_TRANSITIONS: Record<StepRunStatus, StepRunStatus[]> = {
  [StepRunStatus.Pending]: [StepRunStatus.Running, StepRunStatus.Canceled],
  [StepRunStatus.Running]: [StepRunStatus.Succeeded, StepRunStatus.Failed, StepRunStatus.Canceled],
  [StepRunStatus.Succeeded]: [],
  [StepRunStatus.Failed]: [],
  [StepRunStatus.Canceled]: [],
};

/** Result of a single step execution. */
export interface StepRunResult {
  stepId: string;
  status: StepRunStatus;
  startedAt?: string;
  completedAt?: string;
  outputs?: Record<string, unknown>;
  error?: TypedError;
  /** Number of attempts made (including retries). */
  attempts: number;
  /** Duration in milliseconds. */
  durationMs?: number;
}

/** A single execution instance of a workflow. */
export interface Run {
  id: string;
  workflowId: string;
  /** The workflow version this run executes. */
  workflowVersion: number;
  accountId: string;
  projectId: string;
  environmentId: string;
  status: RunStatus;
  /** Determinism grade achieved for this run. */
  determinismGrade?: DeterminismGrade;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  /** Step-level results indexed by step ID. */
  stepResults: Record<string, StepRunResult>;
  /** Run-level inputs provided at execution time. */
  inputs?: Record<string, unknown>;
  /** Run-level error if the run failed. */
  error?: TypedError;
  /** Reference to provenance record. */
  provenanceId?: string;
  /** Reference to attestation record. */
  attestationId?: string;
  /** Cancellation metadata. */
  canceledBy?: string;
  canceledAt?: string;
  cancelReason?: string;
}

/** Input for creating a new run. */
export interface CreateRunInput {
  workflowId: string;
  accountId: string;
  projectId: string;
  environmentId: string;
  /** Optional: pin to a specific workflow version. */
  workflowVersion?: number;
  /** Run-level input overrides. */
  inputs?: Record<string, unknown>;
  /** Secret values for this run (references resolved at execution time). */
  secretOverrides?: Record<string, string>;
}

/** Input for canceling a run. */
export interface CancelRunInput {
  runId: string;
  canceledBy: string;
  reason?: string;
}
