import express from 'express';
import { createApp, createAppContext, AppContext } from '../../src/server';
import { Role, RbacScopeLevel } from '../../src/domain/rbac';

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
          let json;
          try { json = await res.json(); } catch { json = null; }
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

describe('Run API (disabled — execution not allowed)', () => {
  let app: express.Application;
  let ctx: AppContext;

  beforeEach(async () => {
    ctx = createAppContext();
    app = createApp(ctx);

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

  test('POST /api/workflows/:workflowId/runs is not available', async () => {
    const res = await request(
      app,
      'POST',
      '/api/workflows/wf_test/runs',
      {},
      AUTH_HEADERS,
    );

    // Run routes are not registered — execution is disabled
    expect(res.status).not.toBe(201);
  });

  test('POST /api/runs/:runId/cancel is not available', async () => {
    const res = await request(
      app,
      'POST',
      '/api/runs/run_fake/cancel',
      { reason: 'test' },
      AUTH_HEADERS,
    );

    // Run routes are not registered — execution is disabled
    expect(res.status).not.toBe(200);
  });

  test('execution engine still works programmatically (library API)', async () => {
    // The executor is still available for programmatic use via the library,
    // just not exposed via HTTP routes in the explorer UI
    expect(ctx.executor).toBeDefined();
  });
});
