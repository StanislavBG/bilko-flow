/**
 * Storage layer interfaces.
 *
 * Defines the contract for data persistence, enabling
 * pluggable backends while enforcing tenant scoping.
 */

import { Account, Project, Environment, TenantScope } from '../domain/account';
import { Artifact } from '../domain/artifact';
import { Attestation } from '../domain/attestation';
import { AuditRecord } from '../domain/audit';
import { DataPlaneEvent } from '../domain/events';
import { Provenance } from '../domain/provenance';
import { RoleBinding } from '../domain/rbac';
import { Run } from '../domain/run';
import { Workflow } from '../domain/workflow';

/** Generic list query options. */
export interface ListOptions {
  limit?: number;
  offset?: number;
}

/** Store interface for accounts. */
export interface AccountStore {
  create(account: Account): Promise<Account>;
  getById(id: string): Promise<Account | null>;
  update(id: string, updates: Partial<Account>): Promise<Account | null>;
}

/** Store interface for projects. */
export interface ProjectStore {
  create(project: Project): Promise<Project>;
  getById(id: string, accountId: string): Promise<Project | null>;
  listByAccount(accountId: string, options?: ListOptions): Promise<Project[]>;
}

/** Store interface for environments. */
export interface EnvironmentStore {
  create(env: Environment): Promise<Environment>;
  getById(id: string, accountId: string, projectId: string): Promise<Environment | null>;
  listByProject(accountId: string, projectId: string, options?: ListOptions): Promise<Environment[]>;
}

/** Store interface for workflows. */
export interface WorkflowStore {
  create(workflow: Workflow): Promise<Workflow>;
  getById(id: string, scope: TenantScope): Promise<Workflow | null>;
  getByIdAndVersion(id: string, version: number, scope: TenantScope): Promise<Workflow | null>;
  update(id: string, workflow: Workflow): Promise<Workflow | null>;
  listByScope(scope: TenantScope, options?: ListOptions): Promise<Workflow[]>;
}

/** Store interface for runs. */
export interface RunStore {
  create(run: Run): Promise<Run>;
  getById(id: string, scope: TenantScope): Promise<Run | null>;
  update(id: string, run: Partial<Run>): Promise<Run | null>;
  listByWorkflow(workflowId: string, scope: TenantScope, options?: ListOptions): Promise<Run[]>;
  listByScope(scope: TenantScope, options?: ListOptions): Promise<Run[]>;
}

/** Store interface for artifacts. */
export interface ArtifactStore {
  create(artifact: Artifact): Promise<Artifact>;
  getById(id: string, scope: TenantScope): Promise<Artifact | null>;
  listByRun(runId: string, scope: TenantScope, options?: ListOptions): Promise<Artifact[]>;
}

/** Store interface for provenance records. */
export interface ProvenanceStore {
  create(provenance: Provenance): Promise<Provenance>;
  getByRunId(runId: string, scope: TenantScope): Promise<Provenance | null>;
}

/** Store interface for attestations. */
export interface AttestationStore {
  create(attestation: Attestation): Promise<Attestation>;
  getByRunId(runId: string, scope: TenantScope): Promise<Attestation | null>;
}

/** Store interface for role bindings. */
export interface RoleBindingStore {
  create(binding: RoleBinding): Promise<RoleBinding>;
  listByIdentity(identityId: string, accountId: string): Promise<RoleBinding[]>;
  listByScope(accountId: string, projectId?: string, environmentId?: string): Promise<RoleBinding[]>;
  delete(id: string): Promise<boolean>;
}

/** Store interface for audit records. */
export interface AuditStore {
  create(record: AuditRecord): Promise<AuditRecord>;
  listByScope(
    accountId: string,
    options?: ListOptions & { projectId?: string; environmentId?: string },
  ): Promise<AuditRecord[]>;
}

/** Store interface for data plane events. */
export interface EventStore {
  create(event: DataPlaneEvent): Promise<DataPlaneEvent>;
  listByRun(runId: string, scope: TenantScope, options?: ListOptions): Promise<DataPlaneEvent[]>;
  listByScope(scope: TenantScope, options?: ListOptions & { eventTypes?: string[] }): Promise<DataPlaneEvent[]>;
}

/** Stored credential record. */
export interface CredentialRecord {
  passwordHash: string;
  accountId: string;
}

/** Store interface for credentials (identity → password hash + account). */
export interface CredentialStore {
  set(identityId: string, record: CredentialRecord): Promise<void>;
  get(identityId: string): Promise<CredentialRecord | null>;
}

/** Composite store interface. */
export interface Store {
  accounts: AccountStore;
  projects: ProjectStore;
  environments: EnvironmentStore;
  workflows: WorkflowStore;
  runs: RunStore;
  artifacts: ArtifactStore;
  provenance: ProvenanceStore;
  attestations: AttestationStore;
  roleBindings: RoleBindingStore;
  audit: AuditStore;
  events: EventStore;
  credentials: CredentialStore;
}
