/**
 * Bilko Flow — Deterministic Workflow Creation and Execution Library
 *
 * Entry point for the application server (library explorer / reference UI).
 * The primary value of this project is the library itself — the typed DSL,
 * determinism model, planner protocol, and RBAC system — designed for
 * consumption by AI agents and workflow orchestrators.
 *
 * This server is a reference implementation that showcases the library.
 */

import { createApp, createAppContext, seedDefaultUser } from './server';

const PORT = parseInt(process.env.PORT ?? '5000', 10);

const context = createAppContext();
const app = createApp(context);

seedDefaultUser(context).then(() => {
  app.listen(PORT);
});

// Public exports for programmatic use
export { createApp, createAppContext } from './server';
export * from './domain';
export * from './dsl';
export * from './engine';
export * from './storage';
export * from './planner';
export * from './data-plane';
export * from './audit';
export * from './notifications';
export * from './llm';
