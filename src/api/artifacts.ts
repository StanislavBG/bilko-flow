/**
 * Artifact API routes.
 *
 * GET /runs/:runId/artifacts — List artifacts produced by a run
 */

import { Router } from 'express';
import { apiError, validationError, notFoundError } from '../domain/errors';
import { Store } from '../storage/store';
import { AuthenticatedRequest } from './middleware';

export function createArtifactRoutes(store: Store): Router {
  const router = Router();

  /**
   * GET /runs/:runId/artifacts
   * List artifacts produced by a run.
   */
  router.get('/runs/:runId/artifacts', async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.scope) {
        res.status(400).json(apiError(validationError('Tenant scope headers required')));
        return;
      }

      // Verify run exists
      const run = await store.runs.getById(req.params.runId, req.scope);
      if (!run) {
        res.status(404).json(apiError(notFoundError('Run', req.params.runId)));
        return;
      }

      const artifacts = await store.artifacts.listByRun(req.params.runId, req.scope);

      res.json({ artifacts });
    } catch (err) {
      res.status(500).json(apiError({
        code: 'SYSTEM.INTERNAL',
        message: err instanceof Error ? err.message : 'Failed to fetch artifacts',
        retryable: false,
        suggestedFixes: [],
      }));
    }
  });

  return router;
}
