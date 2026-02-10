/**
 * Account (Organization/Tenant) domain model.
 *
 * The top-level multi-tenant boundary that owns identities, policies,
 * data residency configuration, and contains projects and environments.
 */

export interface Account {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Data residency settings constraining storage and execution placement. */
  residency?: DataResidencyConfig;
  /** Default RBAC bindings established at account creation. */
  status: AccountStatus;
}

export enum AccountStatus {
  Active = 'active',
  Suspended = 'suspended',
  Deprovisioned = 'deprovisioned',
}

export interface DataResidencyConfig {
  /** Primary storage region (e.g., "us-east-1", "eu-west-1"). */
  region: string;
  /** Whether execution must be placed in the same region. */
  executionPinned: boolean;
}

export interface Project {
  id: string;
  accountId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Environment {
  id: string;
  accountId: string;
  projectId: string;
  name: string;
  /** Environment type for policy decisions. */
  type: EnvironmentType;
  createdAt: string;
  updatedAt: string;
}

export enum EnvironmentType {
  Development = 'dev',
  Staging = 'staging',
  Production = 'prod',
}

/** Scoping context used by all API operations and persisted objects. */
export interface TenantScope {
  accountId: string;
  projectId: string;
  environmentId: string;
}
