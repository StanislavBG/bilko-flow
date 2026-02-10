import express from 'express';
import { createApp, createAppContext, AppContext } from '../../src/server';
import { DeterminismGrade } from '../../src/domain/determinism';
import { RunStatus } from '../../src/domain/run';
import { Role, RbacScopeLevel } from '../../src/domain/rbac';
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

const SCOPE: TenantScope = {
  accountId: 'acct_1',
  projectId: 'proj_1',
  environmentId: 'env_1',
};

describe('Run API', () => {
  let app: express.Application;
  let ctx: AppContext;
  let workflowId: string;

  beforeEach(async () => {
    ctx = createAppContext();
    app = createApp(ctx);

    // Set up RBAC
    await ctx.store.roleBindings.create({
      id: 'rb_1',
      identityId: 'user_1',
      identityType: 'user',
      role: Role.Admin,
      scopeLevel: RbacScopeLevel.Organization,
      accountId: 'acct_1',
      createdAt: new Date().toISOString(),
    });

    // Create a workflow
    workflowId = 'wf_run_test';
    const workflow: Workflow = {
      id: workflowId,
      ...SCOPE,
      name: 'Run Test Workflow',
      version: 1,
      specVersion: '1.0.0',
      status: WorkflowStatus.Active,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      determinism: { targetGrade: DeterminismGrade.BestEffort },
      entryStepId: 'step_1',
      steps: [
        {
          id: 'step_1', workflowId, name: 'Step 1', type: 'transform.map',
          dependsOn: [], inputs: { data: [1, 2, 3] },
          policy: { timeoutMs: 30000, maxAttempts: 1 },
        },
      ],
      secrets: [],
    };
    await ctx.store.workflows.create(workflow);
  });

  test('POST /api/workflows/:workflowId/runs creates a run', async () => {
    const res = await request(
      app,
      'POST',
      `/api/workflows/${workflowId}/runs`,
      {},
      AUTH_HEADERS,
    );

    expect(res.status).toBe(201);
    expect(res.body.run).toBeDefined();
    expect(res.body.run.workflowId).toBe(workflowId);
    expect(res.body.run.status).toBe(RunStatus.Created);
  });

  test('POST /api/workflows/:workflowId/runs with missing workflow returns 404', async () => {
    const res = await request(
      app,
      'POST',
      '/api/workflows/nonexistent/runs',
      {},
      AUTH_HEADERS,
    );

    expect(res.status).toBe(404);
  });

  test('GET /api/runs/:runId returns run status', async () => {
    // Create a run first
    const run = await ctx.executor.createRun({ workflowId, ...SCOPE });

    const res = await request(
      app,
      'GET',
      `/api/runs/${run.id}`,
      undefined,
      AUTH_HEADERS,
    );

    expect(res.status).toBe(200);
    expect(res.body.run).toBeDefined();
    expect(res.body.run.id).toBe(run.id);
  });

  test('GET /api/runs/:runId returns 404 for missing run', async () => {
    const res = await request(
      app,
      'GET',
      '/api/runs/nonexistent',
      undefined,
      AUTH_HEADERS,
    );

    expect(res.status).toBe(404);
  });

  test('POST /api/runs/:runId/cancel cancels a run', async () => {
    const run = await ctx.executor.createRun({ workflowId, ...SCOPE });

    const res = await request(
      app,
      'POST',
      `/api/runs/${run.id}/cancel`,
      { reason: 'Test cancellation' },
      AUTH_HEADERS,
    );

    expect(res.status).toBe(200);
    expect(res.body.run.status).toBe(RunStatus.Canceled);
    expect(res.body.run.cancelReason).toBe('Test cancellation');
  });

  test('run execution produces events', async () => {
    const run = await ctx.executor.createRun({ workflowId, ...SCOPE });
    await ctx.executor.executeRun(run.id, SCOPE);

    const events = await ctx.publisher.getEventsByRun(run.id, SCOPE);
    expect(events.length).toBeGreaterThan(0);
  });
});
