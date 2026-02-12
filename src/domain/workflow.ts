/**
 * Workflow (DSL specification) domain model.
 *
 * A versioned DSL definition of an automated process, consisting of
 * ordered/graph-connected steps, configuration, determinism grade targets,
 * and required secrets.
 */

import { DeterminismConfig } from './determinism';

/** Workflow status lifecycle. */
export enum WorkflowStatus {
  Draft = 'draft',
  Active = 'active',
  Archived = 'archived',
}

/** Secret requirement declared by a workflow. */
export interface SecretRequirement {
  key: string;
  required: boolean;
  description?: string;
}

/** Notification/webhook configuration for a workflow. */
export interface NotificationConfig {
  webhookUrl: string;
  events: WebhookEventType[];
  /** Optional secret for HMAC signature verification. */
  signingSecretKey?: string;
}

export type WebhookEventType =
  | 'run.created'
  | 'run.completed'
  | 'run.failed'
  | 'run.canceled'
  | 'artifact.created'
  | 'run.attested'
  | 'step.started'
  | 'step.completed'
  | 'step.failed';

/** The core Workflow DSL document. */
export interface Workflow {
  id: string;
  accountId: string;
  projectId: string;
  environmentId: string;
  name: string;
  description?: string;
  /** Monotonically increasing version number. */
  version: number;
  /** DSL specification version this workflow targets. */
  specVersion: string;
  status: WorkflowStatus;
  createdAt: string;
  updatedAt: string;
  determinism: DeterminismConfig;
  entryStepId: string;
  steps: Step[];
  secrets: SecretRequirement[];
  notification?: NotificationConfig;
}

/** Step execution policy. */
export interface StepPolicy {
  timeoutMs: number;
  maxAttempts: number;
  /** Backoff strategy for retries. */
  backoffStrategy?: 'fixed' | 'exponential';
  backoffBaseMs?: number;
}

/** Step input/output schema definition. */
export interface StepOutputSchema {
  type: string;
  properties?: Record<string, { type: string; items?: { type: string } }>;
}

/** Step type categories. */
export type StepType =
  | 'http.search'
  | 'http.request'
  | 'transform.filter'
  | 'transform.map'
  | 'transform.reduce'
  | 'ai.summarize'
  | 'ai.generate-text'
  | 'ai.generate-image'
  | 'ai.generate-video'
  | 'ai.generate-text-local'
  | 'ai.summarize-local'
  | 'ai.embed-local'
  | 'social.post'
  | 'notification.send'
  | 'custom';

/** A single unit of work within a workflow. */
export interface Step {
  id: string;
  workflowId: string;
  name: string;
  type: StepType;
  description?: string;
  /** IDs of steps that must complete before this step can run. */
  dependsOn: string[];
  inputs: Record<string, unknown>;
  outputs?: {
    schema: StepOutputSchema;
  };
  policy: StepPolicy;
  /** Determinism declarations for this step. */
  determinism?: {
    usesTime?: boolean;
    timeSource?: { kind: string; pinnedValue?: string };
    usesExternalApis?: boolean;
    externalDependencies?: Array<{
      name: string;
      kind: string;
      deterministic: boolean;
      evidenceCapture: string;
      nondeterminismDescription?: string;
    }>;
    pureFunction?: boolean;
  };
}

/** Input for creating a new workflow. */
export interface CreateWorkflowInput {
  accountId: string;
  projectId: string;
  environmentId: string;
  name: string;
  description?: string;
  specVersion?: string;
  determinism: DeterminismConfig;
  entryStepId: string;
  steps: Omit<Step, 'workflowId'>[];
  secrets?: SecretRequirement[];
  notification?: NotificationConfig;
}

/** Input for updating a workflow (creates a new version). */
export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  determinism?: DeterminismConfig;
  entryStepId?: string;
  steps?: Omit<Step, 'workflowId'>[];
  secrets?: SecretRequirement[];
  notification?: NotificationConfig;
}
