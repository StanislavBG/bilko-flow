/**
 * Audit Trail Service.
 *
 * Records immutable, queryable audit records for control-plane
 * and execution-plane actions.
 */

import { v4 as uuid } from 'uuid';
import { AuditRecord, AuditAction, AuditResourceType, AuditOutcome } from '../domain/audit';
import { Store } from '../storage/store';

/** Input for creating an audit record. */
export interface AuditInput {
  accountId: string;
  projectId?: string;
  environmentId?: string;
  actorId: string;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string;
  outcome: AuditOutcome;
  details?: Record<string, unknown>;
}

/** Audit query options. */
export interface AuditQueryOptions {
  accountId: string;
  projectId?: string;
  environmentId?: string;
  limit?: number;
  offset?: number;
}

/** The audit service. */
export class AuditService {
  constructor(private store: Store) {}

  /** Record an audit event. */
  async record(input: AuditInput): Promise<AuditRecord> {
    const record: AuditRecord = {
      id: `aud_${uuid()}`,
      timestamp: new Date().toISOString(),
      accountId: input.accountId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      actorId: input.actorId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      outcome: input.outcome,
      details: input.details,
    };

    return this.store.audit.create(record);
  }

  /** Query audit records within a tenant scope. */
  async query(options: AuditQueryOptions): Promise<AuditRecord[]> {
    return this.store.audit.listByScope(options.accountId, {
      projectId: options.projectId,
      environmentId: options.environmentId,
      limit: options.limit,
      offset: options.offset,
    });
  }
}
