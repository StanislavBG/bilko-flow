/**
 * React hook for managing a single flow execution with optional
 * parent-child linking.
 *
 * This hook creates and manages one FlowExecution instance within
 * an ExecutionStore. If `parentFlowId` is provided, the new execution
 * is automatically linked as a child of the parent.
 *
 * App-specific concerns (chat rendering, flow registry lookups)
 * are NOT part of this hook — those belong in the app layer.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ExecutionStore } from '../execution/execution-store';
import type {
  FlowExecution,
  FlowExecutionNode,
  FlowStepExecution,
} from '../domain/execution';

/** Options for useFlowExecution. */
export interface UseFlowExecutionOptions {
  /** The execution store to use. */
  store: ExecutionStore;
  /** The flow definition ID to execute. */
  flowId: string;
  /** If provided, this execution is created as a child of the given parent. */
  parentFlowId?: string;
  /** Optional metadata to attach to the execution. */
  metadata?: Record<string, unknown>;
}

/** Return type of useFlowExecution. */
export interface UseFlowExecutionReturn {
  /** The current execution instance. */
  execution: FlowExecution;

  /** Start the execution (transition to 'running'). */
  start: () => void;

  /** Mark execution as completed. */
  complete: () => void;

  /** Mark execution as failed with an error message. */
  fail: (error: string) => void;

  /** Cancel the execution. */
  cancel: () => void;

  /** Update a step within this execution. */
  updateStep: (stepId: string, update: Partial<FlowStepExecution>) => void;

  /** Spawn a child execution linked to this one. Returns the child. */
  spawnChild: (childFlowId: string, metadata?: Record<string, unknown>) => FlowExecution;

  /** Get direct children of this execution. */
  children: FlowExecution[];

  /** Get the parent execution, if any. */
  parent: FlowExecution | undefined;

  /** Get the full tree rooted at this execution. */
  tree: FlowExecutionNode | undefined;

  /** The execution ID. */
  executionId: string;
}

/**
 * Hook to create and manage a single flow execution with parent-child support.
 *
 * ```tsx
 * const { execution, start, complete, updateStep, spawnChild } =
 *   useFlowExecution({
 *     store,
 *     flowId: 'onboarding',
 *     parentFlowId: parentExecId,  // optional
 *   });
 * ```
 */
export function useFlowExecution(options: UseFlowExecutionOptions): UseFlowExecutionReturn {
  const { store, flowId, parentFlowId, metadata } = options;
  const storeRef = useRef(store);
  storeRef.current = store;

  // Create the execution on mount
  const [executionId] = useState(() => {
    const exec = store.createExecution({
      flowId,
      parentId: parentFlowId,
      metadata,
    });
    return exec.id;
  });

  // Track current execution state
  const [execution, setExecution] = useState<FlowExecution>(
    () => store.getExecution(executionId)!,
  );

  // Subscribe to changes on this specific execution
  useEffect(() => {
    const unsubscribe = store.subscribeToExecution(executionId, (updated) => {
      setExecution({ ...updated });
    });
    return unsubscribe;
  }, [store, executionId]);

  // Re-derive children/parent on each render (they may change via store)
  const children = store.getChildren(executionId);
  const parent = parentFlowId
    ? store.getParent(executionId)
    : undefined;
  const tree = store.getExecutionTree(executionId);

  const start = useCallback(() => {
    storeRef.current.updateStatus(executionId, 'running');
  }, [executionId]);

  const complete = useCallback(() => {
    storeRef.current.updateStatus(executionId, 'completed');
  }, [executionId]);

  const fail = useCallback(
    (error: string) => {
      const exec = storeRef.current.getExecution(executionId);
      if (exec) {
        exec.error = error;
        storeRef.current.setExecution(exec);
      }
      storeRef.current.updateStatus(executionId, 'failed');
    },
    [executionId],
  );

  const cancel = useCallback(() => {
    storeRef.current.updateStatus(executionId, 'cancelled');
  }, [executionId]);

  const updateStep = useCallback(
    (stepId: string, update: Partial<FlowStepExecution>) => {
      storeRef.current.updateStep(executionId, stepId, update);
    },
    [executionId],
  );

  const spawnChild = useCallback(
    (childFlowId: string, childMetadata?: Record<string, unknown>) => {
      return storeRef.current.createExecution({
        flowId: childFlowId,
        parentId: executionId,
        metadata: childMetadata,
      });
    },
    [executionId],
  );

  return {
    execution,
    start,
    complete,
    fail,
    cancel,
    updateStep,
    spawnChild,
    children,
    parent,
    tree,
    executionId,
  };
}
