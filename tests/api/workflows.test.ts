import express from 'express';
import { createApp, createAppContext, AppContext } from '../../src/server';
import { DeterminismGrade } from '../../src/domain/determinism';
import { Role, RbacScopeLevel, RoleBinding } from '../../src/domain/rbac';
import { Workflow, WorkflowStatus } from '../../src/domain/workflow';
import { TenantScope } from '../../src/domain/account';

async function request(app: express.Application, method: string, path: string, body?: any, headers?: Record<string, string>) {
  return new Promise<{ status: number; body: any }>((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address() as any;
      const url = `http://127.0.0.1:${addr.port}${path}`;
      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      };
      if (body) options.body = JSON.stringify(body);

      fetch(url, options)
        .then(async (res) => {
          const json = await res.json();
          server.close();
          resolve({ status: res.status, body: json });
        })
        .catch((err) => {
          server.close();
          resolve({ status: 500, body: { error: err.message } });
        });
    });
  });
}

const AUTH_HEADERS = {
  'x-identity-id': 'user_1',
  'x-account-id': 'acct_1',
  'x-project-id': 'proj_1',
  'x-environment-id': 'env_1',
};

describe('Workflow API', () => {
  let app: express.Application;
  let ctx: AppContext;

  beforeEach(async () => {
    ctx = createAppContext();
    app = createApp(ctx);

    // Set up RBAC binding
    await ctx.store.roleBindings.create({
      id: 'rb_1',
      identityId: 'user_1',
      identityType: 'user',
      role: Role.Admin,
      scopeLevel: RbacScopeLevel.Organization,
      accountId: 'acct_1',
      createdAt: new Date().toISOString(),
    });
  });

  test('POST /api/workflows creates a valid workflow', async () => {
    const res = await request(
      app,
      'POST',
      '/api/workflows',
      {
        name: 'Test Workflow',
        accountId: 'acct_1',
        projectId: 'proj_1',
        environmentId: 'env_1',
        determinism: { targetGrade: 'best-effort' },
        entryStepId: 'step_1',
        steps: [
          {
            id: 'step_1',
            name: 'Step 1',
            type: 'transform.map',
            dependsOn: [],
            inputs: { data: [] },
            policy: { timeoutMs: 30000, maxAttempts: 1 },
          },
        ],
      },
      AUTH_HEADERS,
    );

    expect(res.status).toBe(201);
    expect(res.body.workflow).toBeDefined();
    expect(res.body.workflow.name).toBe('Test Workflow');
    expect(res.body.workflow.version).toBe(1);
    expect(res.body.compilation).toBeDefined();
  });

  test('POST /api/workflows rejects invalid workflow', async () => {
    const res = await request(
      app,
      'POST',
      '/api/workflows',
      {
        name: 'Bad Workflow',
        accountId: 'acct_1',
        projectId: 'proj_1',
        environmentId: 'env_1',
        determinism: { targetGrade: 'best-effort' },
        entryStepId: 'step_nonexistent',
        steps: [
          {
            id: 'step_1',
            name: 'Step 1',
            type: 'transform.map',
            dependsOn: [],
            inputs: {},
            policy: { timeoutMs: 30000, maxAttempts: 1 },
          },
        ],
      },
      AUTH_HEADERS,
    );

    expect(res.status).toBe(422);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('WORKFLOW.COMPILATION');
  });

  test('POST /api/workflows rejects determinism violation for pure grade', async () => {
    const res = await request(
      app,
      'POST',
      '/api/workflows',
      {
        name: 'Pure with HTTP',
        accountId: 'acct_1',
        projectId: 'proj_1',
        environmentId: 'env_1',
        determinism: { targetGrade: 'pure' },
        entryStepId: 'step_1',
        steps: [
          {
            id: 'step_1',
            name: 'Step 1',
            type: 'http.search',
            dependsOn: [],
            inputs: {},
            policy: { timeoutMs: 30000, maxAttempts: 1 },
          },
        ],
      },
      AUTH_HEADERS,
    );

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('WORKFLOW.COMPILATION');
  });

  test('GET /api/workflows/:id returns existing workflow', async () => {
    // Create workflow first
    const scope: TenantScope = { accountId: 'acct_1', projectId: 'proj_1', environmentId: 'env_1' };
    const workflow: Workflow = {
      id: 'wf_get_test',
      ...scope,
      name: 'Get Test',
      version: 1,
      specVersion: '1.0.0',
      status: WorkflowStatus.Active,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      determinism: { targetGrade: DeterminismGrade.BestEffort },
      entryStepId: 'step_1',
      steps: [
        { id: 'step_1', workflowId: 'wf_get_test', name: 'S1', type: 'transform.map', dependsOn: [], inputs: {}, policy: { timeoutMs: 5000, maxAttempts: 1 } },
      ],
      secrets: [],
    };
    await ctx.store.workflows.create(workflow);

    const res = await request(app, 'GET', '/api/workflows/wf_get_test', undefined, AUTH_HEADERS);

    expect(res.status).toBe(200);
    expect(res.body.workflow.id).toBe('wf_get_test');
  });

  test('GET /api/workflows/:id returns 404 for missing workflow', async () => {
    const res = await request(app, 'GET', '/api/workflows/nonexistent', undefined, AUTH_HEADERS);
    expect(res.status).toBe(404);
  });

  test('POST /api/workflows/:id/test validates workflow', async () => {
    const scope: TenantScope = { accountId: 'acct_1', projectId: 'proj_1', environmentId: 'env_1' };
    const workflow: Workflow = {
      id: 'wf_test_test',
      ...scope,
      name: 'Test Test',
      version: 1,
      specVersion: '1.0.0',
      status: WorkflowStatus.Active,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      determinism: { targetGrade: DeterminismGrade.Pure },
      entryStepId: 'step_1',
      steps: [
        { id: 'step_1', workflowId: 'wf_test_test', name: 'S1', type: 'transform.map', dependsOn: [], inputs: {}, policy: { timeoutMs: 5000, maxAttempts: 1 } },
      ],
      secrets: [],
    };
    await ctx.store.workflows.create(workflow);

    const res = await request(app, 'POST', '/api/workflows/wf_test_test/test', {}, AUTH_HEADERS);

    expect(res.status).toBe(200);
    expect(res.body.test).toBeDefined();
    expect(res.body.test.valid).toBe(true);
  });
});
