/**
 * Auth API routes.
 *
 * POST /auth/login — Validate credentials and return session data.
 */

import { Router } from 'express';
import { createHash } from 'crypto';
import { Store } from '../storage/store';

export function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

export function createAuthRoutes(store: Store): Router {
  const router = Router();

  /**
   * POST /auth/login
   * Validate identity + password, return account/project/environment session data.
   */
  router.post('/login', async (req, res) => {
    try {
      const { identityId, password } = req.body;

      if (!identityId || !password) {
        res.status(400).json({ error: { message: 'identityId and password are required' } });
        return;
      }

      const credential = await store.credentials.get(identityId);
      if (!credential || credential.passwordHash !== hashPassword(password)) {
        res.status(401).json({ error: { message: 'Invalid credentials' } });
        return;
      }

      const account = await store.accounts.getById(credential.accountId);
      if (!account) {
        res.status(404).json({ error: { message: 'Account not found' } });
        return;
      }

      const projects = await store.projects.listByAccount(account.id);
      const project = projects[0] || null;

      let environments: any[] = [];
      if (project) {
        environments = await store.environments.listByProject(account.id, project.id);
      }

      res.json({
        account,
        project,
        environments,
        identity: identityId,
      });
    } catch (err) {
      res.status(500).json({
        error: { message: err instanceof Error ? err.message : 'Login failed' },
      });
    }
  });

  return router;
}
