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
  });

  /**
   * GET /events
   * List events for a tenant scope with pagination.
   */
  router.get('/events', async (req: AuthenticatedRequest, res) => {
    if (!req.scope) {
      res.status(400).json(apiError(validationError('Tenant scope headers required')));
      return;
    }

    const eventTypes = req.query.types
      ? (req.query.types as string).split(',') as DataPlaneEventType[]
      : undefined;

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const events = await publisher.getEventsByScope(req.scope, eventTypes);
    const result = toListResult(events, events.length, { limit, offset });

    res.json(result);
  });

  return router;
}
