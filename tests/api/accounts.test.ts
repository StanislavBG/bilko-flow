import express from 'express';
import { createApp, createAppContext } from '../../src/server';

// Simple test helper for HTTP requests without external dependencies
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

describe('Account API', () => {
  let app: express.Application;

  beforeEach(() => {
    const ctx = createAppContext();
    app = createApp(ctx);
  });

  test('health check returns ok', async () => {
    const res = await request(app, 'GET', '/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.specVersion).toBe('1.0.0');
  });

  test('POST /api/accounts creates account with default project and environments', async () => {
    const res = await request(
      app,
      'POST',
      '/api/accounts',
      { name: 'Test Org', adminIdentityId: 'user_1' },
      { 'x-identity-id': 'user_1', 'x-account-id': 'system' },
    );

    expect(res.status).toBe(201);
    expect(res.body.account).toBeDefined();
    expect(res.body.account.name).toBe('Test Org');
    expect(res.body.project).toBeDefined();
    expect(res.body.environments).toHaveLength(3);
    expect(res.body.roleBinding).toBeDefined();
    expect(res.body.roleBinding.role).toBe('admin');
  });

  test('POST /api/accounts rejects missing name', async () => {
    const res = await request(
      app,
      'POST',
      '/api/accounts',
      { adminIdentityId: 'user_1' },
      { 'x-identity-id': 'user_1', 'x-account-id': 'system' },
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('VALIDATION.SCHEMA');
  });

  test('POST /api/accounts rejects missing adminIdentityId', async () => {
    const res = await request(
      app,
      'POST',
      '/api/accounts',
      { name: 'Test' },
      { 'x-identity-id': 'user_1', 'x-account-id': 'system' },
    );

    expect(res.status).toBe(400);
  });

  test('POST /api/accounts without auth skips auth (bootstrapping) but still validates body', async () => {
    const res = await request(app, 'POST', '/api/accounts', { name: 'Test' });
    expect(res.status).toBe(400);
  });

  test('unauthenticated request to non-bootstrap endpoint is allowed (no auth required)', async () => {
    const res = await request(app, 'GET', '/api/accounts/acct_fake');
    // Auth is disabled — returns 404 (not found) instead of 401
    expect(res.status).toBe(404);
  });
});
