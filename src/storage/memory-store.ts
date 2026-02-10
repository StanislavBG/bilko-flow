/**
 * In-memory storage implementation.
 *
 * Reference implementation for development and testing.
 * All data is scoped to tenant boundaries.
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
  ListOptions,
} from './store';

function applyListOptions<T>(items: T[], options?: ListOptions): T[] {
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? 100;
  return items.slice(offset, offset + limit);
}

class MemoryAccountStore implements AccountStore {
  private data = new Map<string, Account>();

  async create(account: Account): Promise<Account> {
    this.data.set(account.id, { ...account });
    return { ...account };
  }

  async getById(id: string): Promise<Account | null> {
    const account = this.data.get(id);
    return account ? { ...account } : null;
  }

  async update(id: string, updates: Partial<Account>): Promise<Account | null> {
    const existing = this.data.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    this.data.set(id, updated);
    return { ...updated };
  }
}

class MemoryProjectStore implements ProjectStore {
  private data = new Map<string, Project>();

  async create(project: Project): Promise<Project> {
    this.data.set(project.id, { ...project });
    return { ...project };
  }

  async getById(id: string, accountId: string): Promise<Project | null> {
    const project = this.data.get(id);
    if (!project || project.accountId !== accountId) return null;
    return { ...project };
  }

  async listByAccount(accountId: string, options?: ListOptions): Promise<Project[]> {
    const items = [...this.data.values()].filter((p) => p.accountId === accountId);
    return applyListOptions(items, options);
  }
}

class MemoryEnvironmentStore implements EnvironmentStore {
  private data = new Map<string, Environment>();

  async create(env: Environment): Promise<Environment> {
    this.data.set(env.id, { ...env });
    return { ...env };
  }

  async getById(id: string, accountId: string, projectId: string): Promise<Environment | null> {
    const env = this.data.get(id);
    if (!env || env.accountId !== accountId || env.projectId !== projectId) return null;
    return { ...env };
  }

  async listByProject(accountId: string, projectId: string, options?: ListOptions): Promise<Environment[]> {
    const items = [...this.data.values()].filter(
      (e) => e.accountId === accountId && e.projectId === projectId,
    );
    return applyListOptions(items, options);
  }
}

class MemoryWorkflowStore implements WorkflowStore {
  private data = new Map<string, Workflow>();
  /** Track all versions: key = `${id}:${version}` */
  private versions = new Map<string, Workflow>();

  async create(workflow: Workflow): Promise<Workflow> {
    const copy = { ...workflow };
    this.data.set(workflow.id, copy);
    this.versions.set(`${workflow.id}:${workflow.version}`, { ...copy });
    return { ...copy };
  }

  async getById(id: string, scope: TenantScope): Promise<Workflow | null> {
    const wf = this.data.get(id);
    if (!wf) return null;
    if (wf.accountId !== scope.accountId || wf.projectId !== scope.projectId || wf.environmentId !== scope.environmentId) {
      return null;
    }
    return { ...wf };
  }

  async getByIdAndVersion(id: string, version: number, scope: TenantScope): Promise<Workflow | null> {
    const wf = this.versions.get(`${id}:${version}`);
    if (!wf) return null;
    if (wf.accountId !== scope.accountId || wf.projectId !== scope.projectId || wf.environmentId !== scope.environmentId) {
      return null;
    }
    return { ...wf };
  }

  async update(id: string, workflow: Workflow): Promise<Workflow | null> {
    if (!this.data.has(id)) return null;
    const copy = { ...workflow };
    this.data.set(id, copy);
    this.versions.set(`${id}:${workflow.version}`, { ...copy });
    return { ...copy };
  }

  async listByScope(scope: TenantScope, options?: ListOptions): Promise<Workflow[]> {
    const items = [...this.data.values()].filter(
      (wf) =>
        wf.accountId === scope.accountId &&
        wf.projectId === scope.projectId &&
        wf.environmentId === scope.environmentId,
    );
    return applyListOptions(items, options);
  }
}

class MemoryRunStore implements RunStore {
  private data = new Map<string, Run>();

  async create(run: Run): Promise<Run> {
    this.data.set(run.id, { ...run });
    return { ...run };
  }

  async getById(id: string, scope: TenantScope): Promise<Run | null> {
    const run = this.data.get(id);
    if (!run) return null;
    if (run.accountId !== scope.accountId || run.projectId !== scope.projectId || run.environmentId !== scope.environmentId) {
      return null;
    }
    return { ...run };
  }

  async update(id: string, updates: Partial<Run>): Promise<Run | null> {
    const existing = this.data.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    this.data.set(id, updated);
    return { ...updated };
  }

  async listByWorkflow(workflowId: string, scope: TenantScope, options?: ListOptions): Promise<Run[]> {
    const items = [...this.data.values()].filter(
      (r) =>
        r.workflowId === workflowId &&
        r.accountId === scope.accountId &&
        r.projectId === scope.projectId &&
        r.environmentId === scope.environmentId,
    );
    return applyListOptions(items, options);
  }

  async listByScope(scope: TenantScope, options?: ListOptions): Promise<Run[]> {
    const items = [...this.data.values()].filter(
      (r) =>
        r.accountId === scope.accountId &&
        r.projectId === scope.projectId &&
        r.environmentId === scope.environmentId,
    );
    return applyListOptions(items, options);
  }
}

class MemoryArtifactStore implements ArtifactStore {
  private data = new Map<string, Artifact>();

  async create(artifact: Artifact): Promise<Artifact> {
    this.data.set(artifact.id, { ...artifact });
    return { ...artifact };
  }

  async getById(id: string, scope: TenantScope): Promise<Artifact | null> {
    const art = this.data.get(id);
    if (!art) return null;
    if (art.accountId !== scope.accountId || art.projectId !== scope.projectId || art.environmentId !== scope.environmentId) {
      return null;
    }
    return { ...art };
  }

  async listByRun(runId: string, scope: TenantScope, options?: ListOptions): Promise<Artifact[]> {
    const items = [...this.data.values()].filter(
      (a) =>
        a.runId === runId &&
        a.accountId === scope.accountId &&
        a.projectId === scope.projectId &&
        a.environmentId === scope.environmentId,
    );
    return applyListOptions(items, options);
  }
}

class MemoryProvenanceStore implements ProvenanceStore {
  private data = new Map<string, Provenance>();

  async create(provenance: Provenance): Promise<Provenance> {
    this.data.set(provenance.id, { ...provenance });
    return { ...provenance };
  }

  async getByRunId(runId: string, scope: TenantScope): Promise<Provenance | null> {
    for (const prov of this.data.values()) {
      if (
        prov.runId === runId &&
        prov.accountId === scope.accountId &&
        prov.projectId === scope.projectId &&
        prov.environmentId === scope.environmentId
      ) {
        return { ...prov };
      }
    }
    return null;
  }
}

class MemoryAttestationStore implements AttestationStore {
  private data = new Map<string, Attestation>();

  async create(attestation: Attestation): Promise<Attestation> {
    this.data.set(attestation.id, { ...attestation });
    return { ...attestation };
  }

  async getByRunId(runId: string, scope: TenantScope): Promise<Attestation | null> {
    for (const att of this.data.values()) {
      if (
        att.runId === runId &&
        att.accountId === scope.accountId &&
        att.projectId === scope.projectId &&
        att.environmentId === scope.environmentId
      ) {
        return { ...att };
      }
    }
    return null;
  }
}

class MemoryRoleBindingStore implements RoleBindingStore {
  private data = new Map<string, RoleBinding>();

  async create(binding: RoleBinding): Promise<RoleBinding> {
    this.data.set(binding.id, { ...binding });
    return { ...binding };
  }

  async listByIdentity(identityId: string, accountId: string): Promise<RoleBinding[]> {
    return [...this.data.values()].filter(
      (b) => b.identityId === identityId && b.accountId === accountId,
    );
  }

  async listByScope(accountId: string, projectId?: string, environmentId?: string): Promise<RoleBinding[]> {
    return [...this.data.values()].filter((b) => {
      if (b.accountId !== accountId) return false;
      if (projectId !== undefined && b.projectId !== projectId) return false;
      if (environmentId !== undefined && b.environmentId !== environmentId) return false;
      return true;
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.data.delete(id);
  }
}

class MemoryAuditStore implements AuditStore {
  private data: AuditRecord[] = [];

  async create(record: AuditRecord): Promise<AuditRecord> {
    this.data.push({ ...record });
    return { ...record };
  }

  async listByScope(
    accountId: string,
    options?: ListOptions & { projectId?: string; environmentId?: string },
  ): Promise<AuditRecord[]> {
    let items = this.data.filter((r) => r.accountId === accountId);
    if (options?.projectId) items = items.filter((r) => r.projectId === options.projectId);
    if (options?.environmentId) items = items.filter((r) => r.environmentId === options.environmentId);
    return applyListOptions(items, options);
  }
}

class MemoryEventStore implements EventStore {
  private data: DataPlaneEvent[] = [];

  async create(event: DataPlaneEvent): Promise<DataPlaneEvent> {
    this.data.push({ ...event });
    return { ...event };
  }

  async listByRun(runId: string, scope: TenantScope, options?: ListOptions): Promise<DataPlaneEvent[]> {
    const items = this.data.filter(
      (e) =>
        e.runId === runId &&
        e.accountId === scope.accountId &&
        e.projectId === scope.projectId &&
        e.environmentId === scope.environmentId,
    );
    return applyListOptions(items, options);
  }

  async listByScope(
    scope: TenantScope,
    options?: ListOptions & { eventTypes?: string[] },
  ): Promise<DataPlaneEvent[]> {
    let items = this.data.filter(
      (e) =>
        e.accountId === scope.accountId &&
        e.projectId === scope.projectId &&
        e.environmentId === scope.environmentId,
    );
    if (options?.eventTypes?.length) {
      items = items.filter((e) => options.eventTypes!.includes(e.type));
    }
    return applyListOptions(items, options);
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
  };
}
