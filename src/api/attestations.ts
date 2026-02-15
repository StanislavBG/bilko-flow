/**
 * Attestation API routes.
 *
 * GET /runs/:runId/attestation — Fetch run attestation
 */

import { Router } from 'express';
import { apiError, validationError, notFoundError } from '../domain/errors';
import { Store } from '../storage/store';
import { AuthenticatedRequest } from './middleware';

export function createAttestationRoutes(store: Store): Router {
  const router = Router();

  /**
   * GET /runs/:runId/attestation
   * Fetch run attestation and associated provenance references.
   */
  router.get('/runs/:runId/attestation', async (req: AuthenticatedRequest, res) => {
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

      const attestation = await store.attestations.getByRunId(req.params.runId, req.scope);
      if (!attestation) {
        res.status(404).json(
          apiError(notFoundError('Attestation', `for run ${req.params.runId}`)),
        );
        return;
      }

      // Also fetch provenance
      const provenance = await store.provenance.getByRunId(req.params.runId, req.scope);

      res.json({
        attestation,
        provenance: provenance
          ? {
              id: provenance.id,
              determinismGrade: provenance.determinismGrade,
              workflowHash: provenance.workflowHash,
              compiledPlanHash: provenance.compiledPlanHash,
              stepImages: provenance.stepImages,
              transcript: provenance.transcript,
            }
          : null,
      });
    } catch (err) {
      res.status(500).json(apiError({
        code: 'SYSTEM.INTERNAL',
        message: err instanceof Error ? err.message : 'Failed to fetch attestation',
        retryable: false,
        suggestedFixes: [],
      }));
    }
  });

  return router;
}
