import {
  hasPermission,
  Role,
  Permission,
  RbacScopeLevel,
  RoleBinding,
  IdentityContext,
} from '../../src/domain/rbac';

function makeBinding(overrides: Partial<RoleBinding> = {}): RoleBinding {
  return {
    id: 'rb_1',
    identityId: 'user_1',
    identityType: 'user',
    role: Role.Admin,
    scopeLevel: RbacScopeLevel.Organization,
    accountId: 'acct_1',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const identity: IdentityContext = {
  identityId: 'user_1',
  identityType: 'user',
  accountId: 'acct_1',
};

describe('RBAC', () => {
  test('admin at org level has all permissions', () => {
    const bindings = [makeBinding()];
    expect(hasPermission(bindings, identity, Permission.WorkflowCreate, { accountId: 'acct_1' })).toBe(true);
    expect(hasPermission(bindings, identity, Permission.RunCreate, { accountId: 'acct_1' })).toBe(true);
    expect(hasPermission(bindings, identity, Permission.SecretCreate, { accountId: 'acct_1' })).toBe(true);
  });

  test('admin at org level has permissions in any project', () => {
    const bindings = [makeBinding()];
    expect(
      hasPermission(bindings, identity, Permission.WorkflowCreate, {
        accountId: 'acct_1', projectId: 'proj_1', environmentId: 'env_1',
      }),
    ).toBe(true);
  });

  test('viewer cannot create workflows', () => {
    const bindings = [makeBinding({ role: Role.Viewer })];
    expect(hasPermission(bindings, identity, Permission.WorkflowCreate, { accountId: 'acct_1' })).toBe(false);
    expect(hasPermission(bindings, identity, Permission.WorkflowRead, { accountId: 'acct_1' })).toBe(true);
  });

  test('executor can create and read runs', () => {
    const bindings = [makeBinding({ role: Role.Executor })];
    expect(hasPermission(bindings, identity, Permission.RunCreate, { accountId: 'acct_1' })).toBe(true);
    expect(hasPermission(bindings, identity, Permission.RunRead, { accountId: 'acct_1' })).toBe(true);
  });

  test('executor cannot create workflows', () => {
    const bindings = [makeBinding({ role: Role.Executor })];
    expect(hasPermission(bindings, identity, Permission.WorkflowCreate, { accountId: 'acct_1' })).toBe(false);
  });

  test('project-scoped binding only grants access within that project', () => {
    const bindings = [
      makeBinding({
        role: Role.WorkflowEditor,
        scopeLevel: RbacScopeLevel.Project,
        projectId: 'proj_1',
      }),
    ];

    // Can access within project
    expect(
      hasPermission(bindings, identity, Permission.WorkflowCreate, {
        accountId: 'acct_1', projectId: 'proj_1',
      }),
    ).toBe(true);

    // Cannot access other project
    expect(
      hasPermission(bindings, identity, Permission.WorkflowCreate, {
        accountId: 'acct_1', projectId: 'proj_2',
      }),
    ).toBe(false);
  });

  test('environment-scoped binding only grants access within that environment', () => {
    const bindings = [
      makeBinding({
        role: Role.Executor,
        scopeLevel: RbacScopeLevel.Environment,
        projectId: 'proj_1',
        environmentId: 'env_prod',
      }),
    ];

    // Can access within environment
    expect(
      hasPermission(bindings, identity, Permission.RunCreate, {
        accountId: 'acct_1', projectId: 'proj_1', environmentId: 'env_prod',
      }),
    ).toBe(true);

    // Cannot access other environment
    expect(
      hasPermission(bindings, identity, Permission.RunCreate, {
        accountId: 'acct_1', projectId: 'proj_1', environmentId: 'env_dev',
      }),
    ).toBe(false);
  });

  test('cross-account access is denied', () => {
    const bindings = [makeBinding()];
    expect(
      hasPermission(bindings, identity, Permission.WorkflowRead, {
        accountId: 'acct_other',
      }),
    ).toBe(false);
  });

  test('different identity is denied', () => {
    const bindings = [makeBinding()];
    const otherIdentity: IdentityContext = {
      identityId: 'user_2',
      identityType: 'user',
      accountId: 'acct_1',
    };
    expect(
      hasPermission(bindings, otherIdentity, Permission.WorkflowRead, { accountId: 'acct_1' }),
    ).toBe(false);
  });

  test('secret manager can manage secrets', () => {
    const bindings = [makeBinding({ role: Role.SecretManager })];
    expect(hasPermission(bindings, identity, Permission.SecretCreate, { accountId: 'acct_1' })).toBe(true);
    expect(hasPermission(bindings, identity, Permission.SecretRead, { accountId: 'acct_1' })).toBe(true);
  });

  test('data consumer has data plane access', () => {
    const bindings = [makeBinding({ role: Role.DataConsumer })];
    expect(hasPermission(bindings, identity, Permission.EventStreamRead, { accountId: 'acct_1' })).toBe(true);
    expect(hasPermission(bindings, identity, Permission.HistoryRead, { accountId: 'acct_1' })).toBe(true);
    expect(hasPermission(bindings, identity, Permission.ReplayCreate, { accountId: 'acct_1' })).toBe(true);
  });
});
