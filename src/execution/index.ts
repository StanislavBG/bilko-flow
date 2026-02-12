/**
 * Execution module — generic flow execution primitives.
 *
 * Provides the execution store, parent-child tree operations,
 * and React hooks for managing flow execution state.
 */

export {
  createExecutionStore,
} from './execution-store';
export type {
  ExecutionStore,
  ExecutionStoreOptions,
  ExecutionListener,
  ExecutionChangeListener,
  ExecutionHistoryEntry,
} from './execution-store';
