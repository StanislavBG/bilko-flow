/**
 * Role-Based Access Control (RBAC) domain model.
 *
 * Authorization is expressed as roles bound to scopes, enabling
 * controlled delegation without sharing broad credentials.
 */

/** RBAC scope levels. */
export enum RbacScopeLevel {
  Organization = 'organization',
  Project = 'project',
  Environment = 'environment',
}

/** Built-in roles with least-privilege defaults. */
export enum Role {
  /** Full administrative access at the assigned scope. */
  Admin = 'admin',
  /** Create and manage workflows, view runs and artifacts. */
  WorkflowEditor = 'workflow-editor',
  /** View workflows, runs, artifacts, and attestations. */
  Viewer = 'viewer',
  /** Execute workflows and view run results. */
  Executor = 'executor',
  /** Manage secrets within the assigned scope. */
  SecretManager = 'secret-manager',
  /** Access run-time data plane (events, history, replay). */
  DataConsumer = 'data-consumer',
}

/** Permissions that roles grant. */
export enum Permission {
  // Account
  AccountCreate = 'account:create',
  AccountRead = 'account:read',
  AccountUpdate = 'account:update',

  // Project
  ProjectCreate = 'project:create',
  ProjectRead = 'project:read',
  ProjectUpdate = 'project:update',

  // Environment
  EnvironmentCreate = 'environment:create',
  EnvironmentRead = 'environment:read',
  EnvironmentUpdate = 'environment:update',

  // Workflow
  WorkflowCreate = 'workflow:create',
  WorkflowRead = 'workflow:read',
  WorkflowUpdate = 'workflow:update',
  WorkflowTest = 'workflow:test',

  // Run
  RunCreate = 'run:create',
  RunRead = 'run:read',
  RunCancel = 'run:cancel',

  // Artifact
  ArtifactRead = 'artifact:read',

  // Attestation
  AttestationRead = 'attestation:read',

  // Secret
  SecretCreate = 'secret:create',
  SecretRead = 'secret:read',
  SecretUpdate = 'secret:update',

  // RBAC
  RoleAssign = 'role:assign',
  RoleRead = 'role:read',

  // Audit
  AuditRead = 'audit:read',

  // Data Plane
  EventStreamRead = 'event-stream:read',
  HistoryRead = 'history:read',
  ReplayCreate = 'replay:create',
}

/** Mapping of roles to their granted permissions. */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.Admin]: Object.values(Permission),
  [Role.WorkflowEditor]: [
    Permission.WorkflowCreate,
    Permission.WorkflowRead,
    Permission.WorkflowUpdate,
    Permission.WorkflowTest,
    Permission.RunRead,
    Permission.ArtifactRead,
    Permission.AttestationRead,
    Permission.ProjectRead,
    Permission.EnvironmentRead,
  ],
  [Role.Viewer]: [
    Permission.WorkflowRead,
    Permission.RunRead,
    Permission.ArtifactRead,
    Permission.AttestationRead,
    Permission.ProjectRead,
    Permission.EnvironmentRead,
  ],
  [Role.Executor]: [
    Permission.WorkflowRead,
    Permission.RunCreate,
    Permission.RunRead,
    Permission.RunCancel,
    Permission.ArtifactRead,
    Permission.AttestationRead,
    Permission.ProjectRead,
    Permission.EnvironmentRead,
  ],
  [Role.SecretManager]: [
    Permission.SecretCreate,
    Permission.SecretRead,
    Permission.SecretUpdate,
    Permission.ProjectRead,
    Permission.EnvironmentRead,
  ],
  [Role.DataConsumer]: [
    Permission.RunRead,
    Permission.ArtifactRead,
    Permission.AttestationRead,
    Permission.EventStreamRead,
    Permission.HistoryRead,
    Permission.ReplayCreate,
    Permission.ProjectRead,
    Permission.EnvironmentRead,
  ],
};

/** A role binding assigns a role at a specific scope. */
export interface RoleBinding {
  id: string;
  identityId: string;
  identityType: 'user' | 'service-principal';
  role: Role;
  scopeLevel: RbacScopeLevel;
  /** The account ID (always present). */
  accountId: string;
  /** Project ID (present for project and environment scope). */
  projectId?: string;
  /** Environment ID (present for environment scope). */
  environmentId?: string;
  createdAt: string;
}

/** Identity context extracted from authentication. */
export interface IdentityContext {
  identityId: string;
  identityType: 'user' | 'service-principal';
  accountId: string;
}

/** Check if an identity has a specific permission at the given scope. */
export function hasPermission(
  bindings: RoleBinding[],
  identity: IdentityContext,
  permission: Permission,
  scope: { accountId: string; projectId?: string; environmentId?: string },
): boolean {
  return bindings.some((binding) => {
    // Must belong to the same account and identity
    if (binding.accountId !== scope.accountId) return false;
    if (binding.identityId !== identity.identityId) return false;

    // Check scope hierarchy: org-level bindings grant access to all projects/envs
    if (binding.scopeLevel === RbacScopeLevel.Organization) {
      return ROLE_PERMISSIONS[binding.role]?.includes(permission) ?? false;
    }

    if (binding.scopeLevel === RbacScopeLevel.Project) {
      if (binding.projectId !== scope.projectId) return false;
      return ROLE_PERMISSIONS[binding.role]?.includes(permission) ?? false;
    }

    if (binding.scopeLevel === RbacScopeLevel.Environment) {
      if (binding.projectId !== scope.projectId) return false;
      if (binding.environmentId !== scope.environmentId) return false;
      return ROLE_PERMISSIONS[binding.role]?.includes(permission) ?? false;
    }

    return false;
  });
}
