/**
 * Attestation domain model.
 *
 * A verifiable record over run provenance that proves what inputs
 * and step images produced the recorded outputs.
 */

import { HashRecord } from './provenance';

/** Attestation status. */
export enum AttestationStatus {
  Pending = 'pending',
  Issued = 'issued',
  Failed = 'failed',
}

/** Attestation subject — the run and its provenance. */
export interface AttestationSubject {
  runId: string;
  workflowId: string;
  workflowVersion: number;
  provenanceId: string;
}

/** Content of the attestation statement. */
export interface AttestationStatement {
  /** Hash of the workflow DSL used. */
  workflowHash: HashRecord;
  /** Hashes of all step inputs. */
  inputHashes: Record<string, HashRecord>;
  /** Step image digests used during execution. */
  stepImageDigests: Record<string, string>;
  /** Hashes of artifacts produced. */
  artifactHashes: Record<string, HashRecord>;
  /** Determinism grade claimed. */
  determinismGrade: string;
}

/** A signed attestation for a run. */
export interface Attestation {
  id: string;
  runId: string;
  accountId: string;
  projectId: string;
  environmentId: string;
  status: AttestationStatus;
  subject: AttestationSubject;
  statement: AttestationStatement;
  /** Signature over the statement for verification. */
  signature?: string;
  /** Signing algorithm used. */
  signatureAlgorithm?: string;
  /** Public key reference for verification. */
  verificationKeyId?: string;
  issuedAt?: string;
  createdAt: string;
}
