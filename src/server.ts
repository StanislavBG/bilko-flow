/**
 * Express server configuration.
 *
 * Assembles the API surface with middleware and routes.
 * This is a reference server for the bilko-flow workflow library.
 */

import express from 'express';
import path from 'path';
import { Store } from './storage/store';
import { createMemoryStore } from './storage/memory-store';
import { DataPlanePublisher } from './data-plane/publisher';
import { WorkflowExecutor } from './engine/executor';
import { WebhookService } from './notifications/webhook';
import { defaultIdentityMiddleware, errorHandler } from './api/middleware';
import { rateLimit } from './api/rate-limit';
import { createWorkflowRoutes } from './api/workflows';
import { createRunRoutes } from './api/runs';
import { createArtifactRoutes } from './api/artifacts';
import { createAttestationRoutes } from './api/attestations';
import { createEventRoutes } from './api/events';
import { createLLMRoutes } from './api/llm';

const startTime = Date.now();

/** Application context containing all services. */
export interface AppContext {
  store: Store;
  publisher: DataPlanePublisher;
  executor: WorkflowExecutor;
  webhookService: WebhookService;
}

/** Create the application context with all services. */
export function createAppContext(store?: Store): AppContext {
  const appStore = store ?? createMemoryStore();
  const publisher = new DataPlanePublisher(appStore);
  const executor = new WorkflowExecutor(appStore, publisher);
  const webhookService = new WebhookService();

  return {
    store: appStore,
    publisher,
    executor,
    webhookService,
  };
}

/** Create and configure the Express application. */
export function createApp(context?: AppContext): express.Application {
  const ctx = context ?? createAppContext();
  const app = express();

  // Body parsing
  app.use(express.json({ limit: '10mb' }));

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * SECURITY HEADERS (v0.3.0 — RESILIENCY ENHANCEMENT)
   * ═══════════════════════════════════════════════════════════════════════════
   */
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Global rate limiter — 60 requests/minute per IP
  app.use('/api', rateLimit({ maxRequests: 60, windowMs: 60_000 }));

  // Health check — includes uptime, version, and storage type
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: '0.3.0',
      specVersion: '1.0.0',
      uptimeMs: Date.now() - startTime,
      storage: 'memory',
    });
  });

  // Default identity middleware — auto-injects scope context from headers
  app.use('/api', defaultIdentityMiddleware(ctx.store));

  // Versioned API routes — /api/v1 prefix
  const v1 = express.Router();
  v1.use('/workflows', createWorkflowRoutes(ctx.store, ctx.executor));
  v1.use('/', createRunRoutes(ctx.store, ctx.executor));
  v1.use('/', createArtifactRoutes(ctx.store));
  v1.use('/', createAttestationRoutes(ctx.store));
  v1.use('/', createEventRoutes(ctx.store, ctx.publisher));
  v1.use('/llm', createLLMRoutes());
  app.use('/api/v1', v1);

  // Backward-compatible unversioned routes
  app.use('/api/workflows', createWorkflowRoutes(ctx.store, ctx.executor));
  app.use('/api', createRunRoutes(ctx.store, ctx.executor));
  app.use('/api', createArtifactRoutes(ctx.store));
  app.use('/api', createAttestationRoutes(ctx.store));
  app.use('/api', createEventRoutes(ctx.store, ctx.publisher));
  app.use('/api/llm', createLLMRoutes());

  // Error handler
  app.use(errorHandler);

  // Serve static UI — index.html at the project root
  const staticRoot = path.resolve(__dirname, '..');
  app.get('/', (_req, res) => {
    res.sendFile(path.join(staticRoot, 'index.html'));
  });

  return app;
}
