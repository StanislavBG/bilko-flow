/**
 * Auth API routes and credential utilities.
 *
 * POST /auth/login — Validate credentials and return session data.
 *
 * Password hashing uses PBKDF2 with per-credential random salts.
 * This is a reference implementation for the library explorer.
 */

import { Router } from 'express';
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';
import { Store } from '../storage/store';

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha512';
const SALT_BYTES = 32;

/**
 * Hash a password using PBKDF2 with a random salt.
 * Returns `salt:derivedKey` as a hex string.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const derived = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex');
  return `${salt}:${derived}`;
}

/**
 * Verify a password against a stored hash.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, expectedKey] = storedHash.split(':');
  if (!salt || !expectedKey) return false;
  const derived = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
  const expected = Buffer.from(expectedKey, 'hex');
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
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
      if (!credential || !verifyPassword(password, credential.passwordHash)) {
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
