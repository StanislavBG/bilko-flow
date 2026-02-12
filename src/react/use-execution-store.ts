/**
 * React hook for subscribing to an ExecutionStore.
 *
 * Provides reactive access to the execution store, triggering
 * re-renders when any execution changes. Framework-agnostic
 * execution logic lives in the store itself; this hook is
 * the React binding layer.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ExecutionStore } from '../execution/execution-store';
import type {
  FlowExecution,
  FlowExecutionNode,
  FlowExecutionStatus,
  FlowStepExecution,
  CreateFlowExecutionInput,
} from '../domain/execution';

/** Return type of useExecutionStore. */
export interface UseExecutionStoreReturn {
  /** All executions in the store. */
  executions: FlowExecution[];

  /** Root executions (no parent). */
  roots: FlowExecution[];

  /** Create a new execution. */
  createExecution: (input: CreateFlowExecutionInput) => FlowExecution;

  /** Get an execution by ID. */
  getExecution: (id: string) => FlowExecution | undefined;

  /** Overwrite/upsert an execution. */
  setExecution: (execution: FlowExecution) => void;

  /** Delete an execution. */
  deleteExecution: (id: string) => boolean;

  /** Update execution status. */
  updateStatus: (id: string, status: FlowExecutionStatus) => FlowExecution | undefined;

  /** Update a step within an execution. */
  updateStep: (
    executionId: string,
    stepId: string,
    update: Partial<FlowStepExecution>,
  ) => FlowExecution | undefined;

  /** Link a child to a parent execution. */
  linkChild: (parentId: string, childId: string) => void;

  /** Unlink a child from its parent. */
  unlinkChild: (parentId: string, childId: string) => void;

  /** Get children of an execution. */
  getChildren: (parentId: string) => FlowExecution[];

  /** Get parent of an execution. */
  getParent: (childId: string) => FlowExecution | undefined;

  /** Build the full execution tree from a root. */
  getExecutionTree: (rootId: string) => FlowExecutionNode | undefined;

  /** Get history snapshots for an execution. */
  getHistory: ExecutionStore['history'];

  /** Clear all executions. */
  clear: () => void;
}

/**
 * React hook that subscribes to an ExecutionStore and re-renders
 * when any execution changes.
 *
 * ```tsx
 * const store = useMemo(() => createExecutionStore(), []);
 * const { executions, createExecution, updateStatus } = useExecutionStore(store);
 * ```
 */
export function useExecutionStore(store: ExecutionStore): UseExecutionStoreReturn {
  const [, forceRender] = useState(0);
  const storeRef = useRef(store);
  storeRef.current = store;

  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      forceRender((n: number) => n + 1);
    });
    return unsubscribe;
  }, [store]);

  const createExecution = useCallback(
    (input: CreateFlowExecutionInput) => storeRef.current.createExecution(input),
    [],
  );

  const getExecution = useCallback(
    (id: string) => storeRef.current.getExecution(id),
    [],
  );

  const setExecution = useCallback(
    (execution: FlowExecution) => storeRef.current.setExecution(execution),
    [],
  );

  const deleteExecution = useCallback(
    (id: string) => storeRef.current.deleteExecution(id),
    [],
  );

  const updateStatus = useCallback(
    (id: string, status: FlowExecutionStatus) =>
      storeRef.current.updateStatus(id, status),
    [],
  );

  const updateStep = useCallback(
    (executionId: string, stepId: string, update: Partial<FlowStepExecution>) =>
      storeRef.current.updateStep(executionId, stepId, update),
    [],
  );

  const linkChild = useCallback(
    (parentId: string, childId: string) => storeRef.current.linkChild(parentId, childId),
    [],
  );

  const unlinkChild = useCallback(
    (parentId: string, childId: string) =>
      storeRef.current.unlinkChild(parentId, childId),
    [],
  );

  const getChildren = useCallback(
    (parentId: string) => storeRef.current.getChildren(parentId),
    [],
  );

  const getParent = useCallback(
    (childId: string) => storeRef.current.getParent(childId),
    [],
  );

  const getExecutionTree = useCallback(
    (rootId: string) => storeRef.current.getExecutionTree(rootId),
    [],
  );

  const getHistory = useCallback(
    (id: string) => storeRef.current.history(id),
    [],
  );

  const clear = useCallback(() => storeRef.current.clear(), []);

  return {
    executions: store.listExecutions(),
    roots: store.getRoots(),
    createExecution,
    getExecution,
    setExecution,
    deleteExecution,
    updateStatus,
    updateStep,
    linkChild,
    unlinkChild,
    getChildren,
    getParent,
    getExecutionTree,
    getHistory,
    clear,
  };
}
