/**
 * Event stream API routes.
 *
 * GET /runs/:runId/events — List events for a run
 * GET /events — List events for a scope (with pagination metadata)
 */

import { Router } from 'express';
import { apiError, validationError, notFoundError } from '../domain/errors';
import { DataPlaneEventType } from '../domain/events';
import { Store, toListResult } from '../storage/store';
import { DataPlanePublisher } from '../data-plane/publisher';
import { AuthenticatedRequest } from './middleware';

export function createEventRoutes(store: Store, publisher: DataPlanePublisher): Router {
  const router = Router();

  /**
   * GET /runs/:runId/events
   * List events for a specific run.
   */
  router.get('/runs/:runId/events', async (req: AuthenticatedRequest, res) => {
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

      const events = await publisher.getEventsByRun(req.params.runId, req.scope);

      res.json({ events, total: events.length });
    } catch (err) {
      res.status(500).json(apiError({
        code: 'SYSTEM.INTERNAL',
        message: err instanceof Error ? err.message : 'Failed to fetch run events',
        retryable: false,
        suggestedFixes: [],
      }));
    }
  });

  /**
   * GET /events
   * List events for a tenant scope with pagination.
   */
  router.get('/events', async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.scope) {
        res.status(400).json(apiError(validationError('Tenant scope headers required')));
        return;
      }

      const VALID_EVENT_TYPES: ReadonlySet<string> = new Set<DataPlaneEventType>([
        'run.created', 'run.queued', 'run.started', 'run.succeeded', 'run.failed', 'run.canceled',
        'step.pending', 'step.started', 'step.succeeded', 'step.failed', 'step.canceled',
        'artifact.created', 'attestation.issued', 'provenance.recorded',
      ]);
      const eventTypes = req.query.types
        ? (req.query.types as string).split(',').filter((t) => VALID_EVENT_TYPES.has(t)) as DataPlaneEventType[]
        : undefined;

      const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const rawOffset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
      const limit = Number.isNaN(rawLimit) || rawLimit < 1 ? 100 : Math.min(rawLimit, 1000);
      const offset = Number.isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset;

      const events = await publisher.getEventsByScope(req.scope, eventTypes);
      const result = toListResult(events, events.length, { limit, offset });

      res.json(result);
    } catch (err) {
      res.status(500).json(apiError({
        code: 'SYSTEM.INTERNAL',
        message: err instanceof Error ? err.message : 'Failed to fetch events',
        retryable: false,
        suggestedFixes: [],
      }));
    }
  });

  return router;
}
