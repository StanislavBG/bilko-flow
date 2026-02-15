/**
 * Run API routes.
 *
 * POST /workflows/:workflowId/runs — Start a run
 * GET /runs/:runId — Get run status
 * POST /runs/:runId/cancel — Cancel an in-flight run
 */

import { Router } from 'express';
import { apiError, validationError, notFoundError } from '../domain/errors';
import { Store } from '../storage/store';
import { WorkflowExecutor, ExecutorError } from '../engine/executor';
import { AuthenticatedRequest } from './middleware';

/** Redact secret values from inputs to prevent leaking in stored run data. */
function redactSecrets(
  inputs: Record<string, unknown>,
  secretOverrides?: Record<string, unknown>,
): Record<string, unknown> {
  if (!secretOverrides) return inputs;
  const secretKeys = new Set(Object.keys(secretOverrides));
  const redacted = { ...inputs };
  for (const key of secretKeys) {
    if (key in redacted) {
      redacted[key] = '[REDACTED]';
    }
  }
  return redacted;
}

export function createRunRoutes(
  store: Store,
  executor: WorkflowExecutor,
): Router {
  const router = Router();

  /**
   * POST /workflows/:workflowId/runs
   * Start a new run for a workflow version.
   */
  router.post('/workflows/:workflowId/runs', async (req: AuthenticatedRequest, res) => {
    try {
      const { workflowVersion, inputs, secretOverrides } = req.body;

      // Redact secret keys from stored inputs to prevent leaking in run data
      const safeInputs = inputs ? redactSecrets(inputs, secretOverrides) : inputs;

      // Create the run (secretOverrides are NOT persisted — only passed to executor)
      const run = await executor.createRun({
        workflowId: req.params.workflowId,
        ...(req.scope ? {
          accountId: req.scope.accountId,
          projectId: req.scope.projectId,
          environmentId: req.scope.environmentId,
        } : {}),
        workflowVersion,
        inputs: safeInputs,
      });

      // Execute asynchronously (non-blocking)
      executor.executeRun(run.id, req.scope, secretOverrides).catch(() => {
        // Errors are captured in run state; no need to propagate here
      });

      res.status(201).json({ run });
    } catch (err) {
      if (err instanceof ExecutorError) {
        const status = err.typedError.code.includes('NOT_FOUND') ? 404 : 422;
        res.status(status).json(apiError(err.typedError));
        return;
      }
      res.status(500).json(
        apiError({
          code: 'SYSTEM.INTERNAL',
          message: err instanceof Error ? err.message : 'Run creation failed',
          retryable: false,
          suggestedFixes: [],
        }),
      );
    }
  });

  /**
   * GET /runs/:runId
   * Get run status, step statuses, determinism grade, provenance summary.
   */
  router.get('/runs/:runId', async (req: AuthenticatedRequest, res) => {
    try {
      const run = await store.runs.getById(req.params.runId, req.scope);
      if (!run) {
        res.status(404).json(apiError(notFoundError('Run', req.params.runId)));
        return;
      }

      // Fetch provenance summary if available
      let provenance = null;
      if (run.provenanceId) {
        provenance = await store.provenance.getByRunId(run.id, req.scope);
      }

      res.json({
        run,
        provenance: provenance
          ? {
              id: provenance.id,
              determinismGrade: provenance.determinismGrade,
              workflowHash: provenance.workflowHash,
              compiledPlanHash: provenance.compiledPlanHash,
            }
          : null,
      });
    } catch (err) {
      res.status(500).json(
        apiError({
          code: 'SYSTEM.INTERNAL',
          message: err instanceof Error ? err.message : 'Failed to fetch run',
          retryable: false,
          suggestedFixes: [],
        }),
      );
    }
  });

  /**
   * POST /runs/:runId/cancel
   * Cancel an in-flight run.
   */
  router.post('/runs/:runId/cancel', async (req: AuthenticatedRequest, res) => {
    try {
      const { reason } = req.body;
      const canceledBy = req.identity?.identityId ?? 'unknown';

      const run = await executor.cancelRun(req.params.runId, req.scope, canceledBy, reason);

      res.json({ run });
    } catch (err) {
      if (err instanceof ExecutorError) {
        const status = err.typedError.code.includes('NOT_FOUND') ? 404 : 422;
        res.status(status).json(apiError(err.typedError));
        return;
      }
      res.status(500).json(
        apiError({
          code: 'SYSTEM.INTERNAL',
          message: err instanceof Error ? err.message : 'Run cancellation failed',
          retryable: false,
          suggestedFixes: [],
        }),
      );
    }
  });

  return router;
}
