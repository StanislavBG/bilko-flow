/**
 * Express server configuration.
 *
 * Assembles the API surface with middleware, routes, and dependency injection.
 * This server is a reference implementation and library explorer — not a
 * production execution engine.
 */

import express from 'express';
import path from 'path';
import { Store } from './storage/store';
import { createMemoryStore } from './storage/memory-store';
import { DataPlanePublisher } from './data-plane/publisher';
import { WorkflowExecutor } from './engine/executor';
import { AuditService } from './audit/audit-service';
import { WebhookService } from './notifications/webhook';
import { defaultIdentityMiddleware, errorHandler } from './api/middleware';
import { createAccountRoutes } from './api/accounts';
import { hashPassword } from './api/auth';
import { createWorkflowRoutes } from './api/workflows';
import { createRunRoutes } from './api/runs';
import { createArtifactRoutes } from './api/artifacts';
import { createAttestationRoutes } from './api/attestations';
import { createEventRoutes } from './api/events';
import { v4 as uuid } from 'uuid';
import { AccountStatus, EnvironmentType } from './domain/account';
import { Role, RbacScopeLevel } from './domain/rbac';
import { logger } from './logger';

const startTime = Date.now();

/** Seeded session data for the default (anonymous) user. */
export interface SeededSession {
  account: { id: string; name: string };
  project: { id: string; name: string };
  environments: Array<{ id: string; name: string; type: string }>;
  identity: string;
}

/** Application context containing all services. */
export interface AppContext {
  store: Store;
  publisher: DataPlanePublisher;
  executor: WorkflowExecutor;
  auditService: AuditService;
  webhookService: WebhookService;
  seededSession?: SeededSession;
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

  // Health check — includes uptime, version, and storage type
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: '0.2.0',
      specVersion: '1.0.0',
      uptimeMs: Date.now() - startTime,
      storage: 'memory',
      mode: 'library-explorer',
    });
  });

  // Public session endpoint — returns the default session so the UI can auto-initialize
  app.get('/api/session', (_req, res) => {
    if (!ctx.seededSession) {
      res.status(503).json({ error: { message: 'Session not yet initialized' } });
      return;
    }
    res.json(ctx.seededSession);
  });

  // Default identity middleware — auto-injects identity context (no login required)
  app.use('/api', defaultIdentityMiddleware(ctx.store));

  // Versioned API routes — /api/v1 prefix
  const v1 = express.Router();
  v1.use('/accounts', createAccountRoutes(ctx.store, ctx.auditService));
  v1.use('/workflows', createWorkflowRoutes(ctx.store, ctx.auditService, ctx.executor));
  v1.use('/', createRunRoutes(ctx.store, ctx.auditService, ctx.executor));
  v1.use('/', createArtifactRoutes(ctx.store));
  v1.use('/', createAttestationRoutes(ctx.store));
  v1.use('/', createEventRoutes(ctx.store, ctx.publisher));
  app.use('/api/v1', v1);

  // Backward-compatible unversioned routes
  app.use('/api/accounts', createAccountRoutes(ctx.store, ctx.auditService));
  app.use('/api/workflows', createWorkflowRoutes(ctx.store, ctx.auditService, ctx.executor));
  app.use('/api', createRunRoutes(ctx.store, ctx.auditService, ctx.executor));
  app.use('/api', createArtifactRoutes(ctx.store));
  app.use('/api', createAttestationRoutes(ctx.store));
  app.use('/api', createEventRoutes(ctx.store, ctx.publisher));

  // Error handler
  app.use(errorHandler);

  // Serve static UI — index.html at the project root
  const staticRoot = path.resolve(__dirname, '..');
  app.get('/', (_req, res) => {
    res.sendFile(path.join(staticRoot, 'index.html'));
  });

  return app;
}

/**
 * Seed a default account and session for the library explorer.
 * Credentials are only used for the development UI session.
 */
export async function seedDefaultUser(ctx: AppContext): Promise<void> {
  const now = new Date().toISOString();
  const store = ctx.store;

  const devIdentity = process.env.BILKO_DEV_IDENTITY ?? 'dev-explorer';
  const devPassword = process.env.BILKO_DEV_PASSWORD ?? 'bilko-dev-local';

  const account = {
    id: `acct_${uuid()}`,
    name: 'Bilko',
    createdAt: now,
    updatedAt: now,
    status: AccountStatus.Active,
  };
  await store.accounts.create(account);

  const project = {
    id: `proj_${uuid()}`,
    accountId: account.id,
    name: 'Default Project',
    description: 'Default project created during account setup',
    createdAt: now,
    updatedAt: now,
  };
  await store.projects.create(project);

  const environments: Array<{ id: string; name: string; type: string }> = [];
  for (const envType of [EnvironmentType.Development, EnvironmentType.Staging, EnvironmentType.Production]) {
    const env = {
      id: `env_${uuid()}`,
      accountId: account.id,
      projectId: project.id,
      name: envType,
      type: envType,
      createdAt: now,
      updatedAt: now,
    };
    await store.environments.create(env);
    environments.push({ id: env.id, name: env.name, type: env.type });
  }

  await store.roleBindings.create({
    id: `rb_${uuid()}`,
    identityId: devIdentity,
    identityType: 'user',
    role: Role.Admin,
    scopeLevel: RbacScopeLevel.Organization,
    accountId: account.id,
    createdAt: now,
  });

  await store.credentials.set(devIdentity, {
    passwordHash: hashPassword(devPassword),
    accountId: account.id,
  });

  // Store seeded session so the UI can auto-initialize without login
  ctx.seededSession = {
    account: { id: account.id, name: account.name },
    project: { id: project.id, name: project.name },
    environments,
    identity: devIdentity,
  };

  logger.info('Dev session initialized', { identity: devIdentity, mode: 'library-explorer' });
}
