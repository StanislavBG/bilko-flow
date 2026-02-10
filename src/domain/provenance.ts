/**
 * Provenance tracking domain model.
 *
 * Each run emits provenance records that make repeatability verifiable:
 * - Input hashes
 * - Secret provenance (references only, never values)
 * - Step images (immutable identifiers)
 * - Execution transcript
 */

import { DeterminismGrade } from './determinism';

/** Hash record for an input or artifact. */
export interface HashRecord {
  algorithm: 'sha256' | 'sha384' | 'sha512';
  digest: string;
}

/** Secret provenance — references only, never secret values. */
export interface SecretProvenanceEntry {
  key: string;
  /** Secret version identifier used at execution time. */
  versionId: string;
  /** Timestamp when the secret version was resolved. */
  resolvedAt: string;
}

/** Step image identifier for reproducibility. */
export interface StepImageRecord {
  stepId: string;
  /** Immutable identifier (e.g., container digest). */
  imageDigest: string;
  /** Step implementation version. */
  implementationVersion: string;
}

/** A single entry in the execution transcript. */
export interface TranscriptEntry {
  stepId: string;
  timestamp: string;
  action: 'started' | 'completed' | 'failed' | 'retried' | 'canceled';
  /** Policies that were applied (e.g., retry policy, timeout). */
  policiesApplied?: string[];
  /** Hash of step outputs if applicable. */
  outputHash?: HashRecord;
  /** Duration of this action in milliseconds. */
  durationMs?: number;
}

/** Provenance record for a run. */
export interface Provenance {
  id: string;
  runId: string;
  workflowId: string;
  workflowVersion: number;
  accountId: string;
  projectId: string;
  environmentId: string;
  createdAt: string;
  /** Determinism grade targeted and achieved. */
  determinismGrade: DeterminismGrade;
  /** Hash of the workflow DSL document. */
  workflowHash: HashRecord;
  /** Hash of the compiled execution plan. */
  compiledPlanHash: HashRecord;
  /** Hashes of step inputs. */
  inputHashes: Record<string, HashRecord>;
  /** Secret references used (never secret values). */
  secretProvenance: SecretProvenanceEntry[];
  /** Immutable step implementation identifiers. */
  stepImages: StepImageRecord[];
  /** Ordered execution transcript. */
  transcript: TranscriptEntry[];
  /** Hashes of produced artifacts. */
  artifactHashes: Record<string, HashRecord>;
}
