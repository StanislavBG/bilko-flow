/**
 * Express server configuration.
 *
 * Assembles the API surface with middleware, routes, and dependency injection.
 */

import express from 'express';
import { Store } from './storage/store';
import { createMemoryStore } from './storage/memory-store';
import { DataPlanePublisher } from './data-plane/publisher';
import { WorkflowExecutor } from './engine/executor';
import { AuditService } from './audit/audit-service';
import { WebhookService } from './notifications/webhook';
import { authMiddleware, errorHandler } from './api/middleware';
import { createAccountRoutes } from './api/accounts';
import { createWorkflowRoutes } from './api/workflows';
import { createRunRoutes } from './api/runs';
import { createArtifactRoutes } from './api/artifacts';
import { createAttestationRoutes } from './api/attestations';
import { createEventRoutes } from './api/events';

/** Application context containing all services. */
export interface AppContext {
  store: Store;
  publisher: DataPlanePublisher;
  executor: WorkflowExecutor;
  auditService: AuditService;
  webhookService: WebhookService;
}

/** Create the application context with all services. */
export function createAppContext(store?: Store): AppContext {
  const appStore = store ?? createMemoryStore();
  const publisher = new DataPlanePublisher(appStore);
  const executor = new WorkflowExecutor(appStore, publisher);
  const auditService = new AuditService(appStore);
  const webhookService = new WebhookService();

  return {
    store: appStore,
    publisher,
    executor,
    auditService,
    webhookService,
  };
}

/** Create and configure the Express application. */
export function createApp(context?: AppContext): express.Application {
  const ctx = context ?? createAppContext();
  const app = express();

  // Body parsing
  app.use(express.json({ limit: '10mb' }));

  // Health check (unauthenticated)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.1.0', specVersion: '1.0.0' });
  });

  // Authentication middleware for all API routes
  app.use('/api', authMiddleware(ctx.store));

  // API routes
  app.use('/api/accounts', createAccountRoutes(ctx.store, ctx.auditService));
  app.use('/api/workflows', createWorkflowRoutes(ctx.store, ctx.auditService, ctx.executor));
  app.use('/api', createRunRoutes(ctx.store, ctx.auditService, ctx.executor));
  app.use('/api', createArtifactRoutes(ctx.store));
  app.use('/api', createAttestationRoutes(ctx.store));
  app.use('/api', createEventRoutes(ctx.store, ctx.publisher));

  // Error handler
  app.use(errorHandler);

  return app;
}
