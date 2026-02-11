/**
 * Express server configuration.
 *
 * Assembles the API surface with middleware, routes, and dependency injection.
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
import { createArtifactRoutes } from './api/artifacts';
import { createAttestationRoutes } from './api/attestations';
import { createEventRoutes } from './api/events';
import { v4 as uuid } from 'uuid';
import { AccountStatus, EnvironmentType } from './domain/account';
import { Role, RbacScopeLevel } from './domain/rbac';

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

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.1.0', specVersion: '1.0.0' });
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

  // API routes (no run execution — this is a library exploration UI)
  app.use('/api/accounts', createAccountRoutes(ctx.store, ctx.auditService));
  app.use('/api/workflows', createWorkflowRoutes(ctx.store, ctx.auditService, ctx.executor));
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
 * Seed the default account and credentials so the app is ready to log in.
 * Default identity: BilkoBibitkov / password: VibeCode101
 */
export async function seedDefaultUser(ctx: AppContext): Promise<void> {
  const now = new Date().toISOString();
  const store = ctx.store;

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
    identityId: 'BilkoBibitkov',
    identityType: 'user',
    role: Role.Admin,
    scopeLevel: RbacScopeLevel.Organization,
    accountId: account.id,
    createdAt: now,
  });

  await store.credentials.set('BilkoBibitkov', {
    passwordHash: hashPassword('VibeCode101'),
    accountId: account.id,
  });

  // Store seeded session so the UI can auto-initialize without login
  ctx.seededSession = {
    account: { id: account.id, name: account.name },
    project: { id: project.id, name: project.name },
    environments,
    identity: 'BilkoBibitkov',
  };

  console.log('Default session initialized (no login required)');
}
