/**
 * In-memory storage implementation.
 *
 * Reference implementation for development and testing.
 * When a TenantScope is provided, data is filtered by tenant boundaries.
 * When scope is omitted (library mode), lookups return by ID without filtering.
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
import {
  Store,
  AccountStore,
  ProjectStore,
  EnvironmentStore,
  WorkflowStore,
  RunStore,
  ArtifactStore,
  ProvenanceStore,
  AttestationStore,
  RoleBindingStore,
  AuditStore,
  EventStore,
  CredentialStore,
  CredentialRecord,
  ListOptions,
} from './store';

function applyListOptions<T>(items: T[], options?: ListOptions): T[] {
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? 100;
  return items.slice(offset, offset + limit);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEEP COPY UTILITY (v0.3.0 — RESILIENCY ENHANCEMENT)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The architectural audit identified that using shallow spread ({ ...obj })
 * for objects with nested properties (Workflow.steps[], Run.stepResults{},
 * etc.) creates aliased references: the caller receives an object whose
 * nested arrays/objects point to the SAME memory as the store's internal
 * copy. Mutating either side corrupts the other.
 *
 * Example vulnerability (before fix):
 * ```ts
 * const run = await store.runs.getById(id, scope);
 * run.stepResults['step_1'].status = 'succeeded'; // ← MUTATES STORE DATA
 * ```
 *
 * `deepCopy()` uses `structuredClone` (Node 17+) with a JSON round-trip
 * fallback for older runtimes. This ensures complete isolation between
 * the store's internal state and returned values.
 *
 * Performance note: JSON round-trip adds ~2µs per object on modern
 * hardware. For an in-memory store used in development/testing, this
 * overhead is negligible compared to the data integrity guarantee.
 * ═══════════════════════════════════════════════════════════════════════════
 */
function deepCopy<T>(obj: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Match a record against an optional TenantScope.
 * When scope is undefined (library mode), always returns true — no filtering.
 * When scope is provided, all three fields must match.
 */
function matchesScope(
  record: { accountId?: string; projectId?: string; environmentId?: string },
  scope?: TenantScope,
): boolean {
  if (!scope) return true;
  return (
    record.accountId === scope.accountId &&
    record.projectId === scope.projectId &&
    record.environmentId === scope.environmentId
  );
}

class MemoryAccountStore implements AccountStore {
  private data = new Map<string, Account>();

  async create(account: Account): Promise<Account> {
    this.data.set(account.id, deepCopy(account));
    return deepCopy(account);
  }

  async getById(id: string): Promise<Account | null> {
    const account = this.data.get(id);
    return account ? deepCopy(account) : null;
  }

  async update(id: string, updates: Partial<Account>): Promise<Account | null> {
    const existing = this.data.get(id);
    if (!existing) return null;
    const updated = { ...deepCopy(existing), ...deepCopy(updates), updatedAt: new Date().toISOString() };
    this.data.set(id, updated);
    return deepCopy(updated);
  }
}

class MemoryProjectStore implements ProjectStore {
  private data = new Map<string, Project>();

  async create(project: Project): Promise<Project> {
    this.data.set(project.id, deepCopy(project));
    return deepCopy(project);
  }

  async getById(id: string, accountId: string): Promise<Project | null> {
    const project = this.data.get(id);
    if (!project || project.accountId !== accountId) return null;
    return deepCopy(project);
  }

  async listByAccount(accountId: string, options?: ListOptions): Promise<Project[]> {
    const items = [...this.data.values()].filter((p) => p.accountId === accountId);
    return applyListOptions(items.map(deepCopy), options);
  }
}

class MemoryEnvironmentStore implements EnvironmentStore {
  private data = new Map<string, Environment>();

  async create(env: Environment): Promise<Environment> {
    this.data.set(env.id, deepCopy(env));
    return deepCopy(env);
  }

  async getById(id: string, accountId: string, projectId: string): Promise<Environment | null> {
    const env = this.data.get(id);
    if (!env || env.accountId !== accountId || env.projectId !== projectId) return null;
    return deepCopy(env);
  }

  async listByProject(accountId: string, projectId: string, options?: ListOptions): Promise<Environment[]> {
    const items = [...this.data.values()].filter(
      (e) => e.accountId === accountId && e.projectId === projectId,
    );
    return applyListOptions(items.map(deepCopy), options);
  }
}

class MemoryWorkflowStore implements WorkflowStore {
  private data = new Map<string, Workflow>();
  /** Track all versions: key = `${id}:${version}` */
  private versions = new Map<string, Workflow>();

  async create(workflow: Workflow): Promise<Workflow> {
    const copy = deepCopy(workflow);
    this.data.set(workflow.id, copy);
    this.versions.set(`${workflow.id}:${workflow.version}`, deepCopy(copy));
    return deepCopy(copy);
  }

  async getById(id: string, scope?: TenantScope): Promise<Workflow | null> {
    const wf = this.data.get(id);
    if (!wf) return null;
    if (!matchesScope(wf, scope)) return null;
    return deepCopy(wf);
  }

  async getByIdAndVersion(id: string, version: number, scope?: TenantScope): Promise<Workflow | null> {
    const wf = this.versions.get(`${id}:${version}`);
    if (!wf) return null;
    if (!matchesScope(wf, scope)) return null;
    return deepCopy(wf);
  }

  async update(id: string, workflow: Workflow): Promise<Workflow | null> {
    if (!this.data.has(id)) return null;
    const copy = deepCopy(workflow);
    this.data.set(id, copy);
    this.versions.set(`${id}:${workflow.version}`, deepCopy(copy));
    return deepCopy(copy);
  }

  async listByScope(scope: TenantScope, options?: ListOptions): Promise<Workflow[]> {
    const items = [...this.data.values()].filter((wf) => matchesScope(wf, scope));
    return applyListOptions(items.map(deepCopy), options);
  }

  async delete(id: string): Promise<boolean> {
    const wf = this.data.get(id);
    if (!wf) return false;
    // Remove all versioned copies
    for (const key of this.versions.keys()) {
      if (key.startsWith(`${id}:`)) {
        this.versions.delete(key);
      }
    }
    return this.data.delete(id);
  }
}

class MemoryRunStore implements RunStore {
  private data = new Map<string, Run>();

  async create(run: Run): Promise<Run> {
    this.data.set(run.id, deepCopy(run));
    return deepCopy(run);
  }

  async getById(id: string, scope?: TenantScope): Promise<Run | null> {
    const run = this.data.get(id);
    if (!run) return null;
    if (!matchesScope(run, scope)) return null;
    return deepCopy(run);
  }

  async update(id: string, updates: Partial<Run>): Promise<Run | null> {
    const existing = this.data.get(id);
    if (!existing) return null;
    const updated = { ...deepCopy(existing), ...deepCopy(updates), updatedAt: new Date().toISOString() };
    this.data.set(id, updated);
    return deepCopy(updated);
  }

  async listByWorkflow(workflowId: string, scope: TenantScope, options?: ListOptions): Promise<Run[]> {
    const items = [...this.data.values()].filter(
      (r) => r.workflowId === workflowId && matchesScope(r, scope),
    );
    return applyListOptions(items.map(deepCopy), options);
  }

  async listByScope(scope: TenantScope, options?: ListOptions): Promise<Run[]> {
    const items = [...this.data.values()].filter((r) => matchesScope(r, scope));
    return applyListOptions(items.map(deepCopy), options);
  }

  async delete(id: string): Promise<boolean> {
    return this.data.delete(id);
  }
}

class MemoryArtifactStore implements ArtifactStore {
  private data = new Map<string, Artifact>();

  async create(artifact: Artifact): Promise<Artifact> {
    this.data.set(artifact.id, deepCopy(artifact));
    return deepCopy(artifact);
  }

  async getById(id: string, scope?: TenantScope): Promise<Artifact | null> {
    const art = this.data.get(id);
    if (!art) return null;
    if (!matchesScope(art, scope)) return null;
    return deepCopy(art);
  }

  async listByRun(runId: string, scope?: TenantScope, options?: ListOptions): Promise<Artifact[]> {
    const items = [...this.data.values()].filter(
      (a) => a.runId === runId && matchesScope(a, scope),
    );
    return applyListOptions(items.map(deepCopy), options);
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PROVENANCE STORE — INDEXED BY runId (v0.3.0 — RESILIENCY ENHANCEMENT)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The architectural audit identified that `getByRunId()` used an O(n) linear
 * scan over all provenance records. Since every run produces a provenance
 * record, this scales linearly with total run count — unacceptable for
 * long-running servers.
 *
 * Added a `runIdIndex` Map for O(1) lookup by runId.
 * ═══════════════════════════════════════════════════════════════════════════
 */
class MemoryProvenanceStore implements ProvenanceStore {
  private data = new Map<string, Provenance>();
  private runIdIndex = new Map<string, string>();

  async create(provenance: Provenance): Promise<Provenance> {
    this.data.set(provenance.id, deepCopy(provenance));
    this.runIdIndex.set(provenance.runId, provenance.id);
    return deepCopy(provenance);
  }

  async getByRunId(runId: string, scope?: TenantScope): Promise<Provenance | null> {
    const id = this.runIdIndex.get(runId);
    if (!id) return null;
    const prov = this.data.get(id);
    if (!prov) return null;
    if (!matchesScope(prov, scope)) return null;
    return deepCopy(prov);
  }
}

/**
 * Same O(1) runId index optimization as MemoryProvenanceStore above.
 */
class MemoryAttestationStore implements AttestationStore {
  private data = new Map<string, Attestation>();
  private runIdIndex = new Map<string, string>();

  async create(attestation: Attestation): Promise<Attestation> {
    this.data.set(attestation.id, deepCopy(attestation));
    this.runIdIndex.set(attestation.runId, attestation.id);
    return deepCopy(attestation);
  }

  async getByRunId(runId: string, scope?: TenantScope): Promise<Attestation | null> {
    const id = this.runIdIndex.get(runId);
    if (!id) return null;
    const att = this.data.get(id);
    if (!att) return null;
    if (!matchesScope(att, scope)) return null;
    return deepCopy(att);
  }
}

class MemoryRoleBindingStore implements RoleBindingStore {
  private data = new Map<string, RoleBinding>();

  async create(binding: RoleBinding): Promise<RoleBinding> {
    this.data.set(binding.id, deepCopy(binding));
    return deepCopy(binding);
  }

  async listByIdentity(identityId: string, accountId: string): Promise<RoleBinding[]> {
    return [...this.data.values()]
      .filter((b) => b.identityId === identityId && b.accountId === accountId)
      .map(deepCopy);
  }

  async listByScope(accountId: string, projectId?: string, environmentId?: string): Promise<RoleBinding[]> {
    return [...this.data.values()].filter((b) => {
      if (b.accountId !== accountId) return false;
      if (projectId !== undefined && b.projectId !== projectId) return false;
      if (environmentId !== undefined && b.environmentId !== environmentId) return false;
      return true;
    }).map(deepCopy);
  }

  async delete(id: string): Promise<boolean> {
    return this.data.delete(id);
  }
}

class MemoryAuditStore implements AuditStore {
  private data: AuditRecord[] = [];

  async create(record: AuditRecord): Promise<AuditRecord> {
    this.data.push(deepCopy(record));
    return deepCopy(record);
  }

  async listByScope(
    accountId: string,
    options?: ListOptions & { projectId?: string; environmentId?: string },
  ): Promise<AuditRecord[]> {
    let items = this.data.filter((r) => r.accountId === accountId);
    if (options?.projectId) items = items.filter((r) => r.projectId === options.projectId);
    if (options?.environmentId) items = items.filter((r) => r.environmentId === options.environmentId);
    return applyListOptions(items.map(deepCopy), options);
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EVENT STORE — INDEXED BY runId (v0.3.0 — RESILIENCY ENHANCEMENT)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The architectural audit identified that `listByRun()` used an O(n) linear
 * scan over all events. Since every step execution produces multiple events,
 * this scales linearly with total event count — unacceptable for
 * long-running servers with many runs.
 *
 * Added a `runIdIndex` Map<runId, eventIndex[]> for O(1) lookup by runId.
 * ═══════════════════════════════════════════════════════════════════════════
 */
class MemoryEventStore implements EventStore {
  private data: DataPlaneEvent[] = [];
  private runIdIndex = new Map<string, number[]>();

  async create(event: DataPlaneEvent): Promise<DataPlaneEvent> {
    const copy = deepCopy(event);
    const idx = this.data.length;
    this.data.push(copy);
    if (event.runId) {
      const indices = this.runIdIndex.get(event.runId) ?? [];
      indices.push(idx);
      this.runIdIndex.set(event.runId, indices);
    }
    return deepCopy(event);
  }

  async listByRun(runId: string, scope?: TenantScope, options?: ListOptions): Promise<DataPlaneEvent[]> {
    const indices = this.runIdIndex.get(runId);
    if (!indices) return [];
    const items = indices
      .map((i) => this.data[i])
      .filter((e) => matchesScope(e, scope));
    return applyListOptions(items.map(deepCopy), options);
  }

  async listByScope(
    scope: TenantScope,
    options?: ListOptions & { eventTypes?: string[] },
  ): Promise<DataPlaneEvent[]> {
    let items = this.data.filter((e) => matchesScope(e, scope));
    if (options?.eventTypes?.length) {
      items = items.filter((e) => options.eventTypes!.includes(e.type));
    }
    return applyListOptions(items.map(deepCopy), options);
  }
}

class MemoryCredentialStore implements CredentialStore {
  private data = new Map<string, CredentialRecord>();

  async set(identityId: string, record: CredentialRecord): Promise<void> {
    this.data.set(identityId, deepCopy(record));
  }

  async get(identityId: string): Promise<CredentialRecord | null> {
    const record = this.data.get(identityId);
    return record ? deepCopy(record) : null;
  }
}

/** Create a new in-memory store instance. */
export function createMemoryStore(): Store {
  return {
    accounts: new MemoryAccountStore(),
    projects: new MemoryProjectStore(),
    environments: new MemoryEnvironmentStore(),
    workflows: new MemoryWorkflowStore(),
    runs: new MemoryRunStore(),
    artifacts: new MemoryArtifactStore(),
    provenance: new MemoryProvenanceStore(),
    attestations: new MemoryAttestationStore(),
    roleBindings: new MemoryRoleBindingStore(),
    audit: new MemoryAuditStore(),
    events: new MemoryEventStore(),
    credentials: new MemoryCredentialStore(),
  };
}
