/**
 * Artifact domain model.
 *
 * Artifacts are produced outputs from runs/steps, referenced by
 * storage pointers rather than embedded payloads.
 */

/** Artifact storage pointer kinds. */
export type ArtifactPointerKind = 'object-store' | 'inline' | 'external-url';

/** Storage pointer for artifact location. */
export interface ArtifactPointer {
  kind: ArtifactPointerKind;
  uri: string;
}

/** Artifact metadata. */
export interface ArtifactMetadata {
  title?: string;
  description?: string;
  createdAt: string;
  sizeBytes?: number;
  contentHash?: string;
}

/** A produced output from a run or step. */
export interface Artifact {
  id: string;
  runId: string;
  stepId?: string;
  accountId: string;
  projectId: string;
  environmentId: string;
  type: string;
  pointer: ArtifactPointer;
  metadata: ArtifactMetadata;
}
