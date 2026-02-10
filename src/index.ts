/**
 * Bilko Flow — Deterministic Workflow Backend Service
 *
 * Entry point for the application.
 */

import { createApp, createAppContext } from './server';

const PORT = parseInt(process.env.PORT ?? '5000', 10);

const context = createAppContext();
const app = createApp(context);

app.listen(PORT, () => {
  console.log(`Bilko Flow server running on port ${PORT}`);
  console.log(`DSL spec version: 1.0.0`);
  console.log(`Health check: http://localhost:${PORT}/health`);
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
