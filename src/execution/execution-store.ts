/**
 * In-memory execution store with parent-child tree operations.
 *
 * Provides a framework-agnostic store for managing FlowExecution
 * instances. Supports tree relationships (parent/child linking),
 * history snapshots, and subscriber notifications for state changes.
 *
 * This store is the generic execution primitive. App-specific layers
 * (chat providers, flow registries) build on top of it.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  FlowExecution,
  FlowExecutionNode,
  FlowExecutionStatus,
  FlowStepExecution,
  CreateFlowExecutionInput,
} from '../domain/execution';

// ---------------------------------------------------------------------------
// Listener types
// ---------------------------------------------------------------------------

/** Callback invoked when any execution changes. */
export type ExecutionListener = () => void;

/** Callback invoked when a specific execution changes. */
export type ExecutionChangeListener = (execution: FlowExecution) => void;

// ---------------------------------------------------------------------------
// History entry
// ---------------------------------------------------------------------------

/** A snapshot of an execution at a point in time. */
export interface ExecutionHistoryEntry {
  timestamp: number;
  execution: FlowExecution;
}

// ---------------------------------------------------------------------------
// ExecutionStore
// ---------------------------------------------------------------------------

/**
 * In-memory store for FlowExecution instances with tree operations.
 *
 * ## Usage
 *
 * ```ts
 * const store = createExecutionStore();
 *
 * // Create a parent execution
 * const parent = store.createExecution({ flowId: 'onboarding' });
 *
 * // Create a child linked to the parent
 * const child = store.createExecution({
 *   flowId: 'email-verify',
 *   parentId: parent.id,
 * });
 *
 * // Traverse the tree
 * const tree = store.getExecutionTree(parent.id);
 * ```
 */
export interface ExecutionStore {
  // --- CRUD -----------------------------------------------------------------

  /** Create a new execution, optionally linked to a parent. */
  createExecution(input: CreateFlowExecutionInput): FlowExecution;

  /** Retrieve an execution by ID, or `undefined` if not found. */
  getExecution(id: string): FlowExecution | undefined;

  /** Overwrite/upsert an execution. Notifies listeners. */
  setExecution(execution: FlowExecution): void;

  /** Remove an execution (and unlink from parent if any). */
  deleteExecution(id: string): boolean;

  /** List all executions. */
  listExecutions(): FlowExecution[];

  // --- Status & step updates ------------------------------------------------

  /** Update the status of an execution. */
  updateStatus(id: string, status: FlowExecutionStatus): FlowExecution | undefined;

  /** Update a single step within an execution. */
  updateStep(
    executionId: string,
    stepId: string,
    update: Partial<FlowStepExecution>,
  ): FlowExecution | undefined;

  // --- Tree operations ------------------------------------------------------

  /** Link a child execution to a parent. Idempotent. */
  linkChild(parentId: string, childId: string): void;

  /** Unlink a child execution from its parent. */
  unlinkChild(parentId: string, childId: string): void;

  /** Get the direct children of an execution. */
  getChildren(parentId: string): FlowExecution[];

  /** Get the parent of an execution, or `undefined` if it's a root. */
  getParent(childId: string): FlowExecution | undefined;

  /**
   * Build the full execution tree rooted at `rootId`.
   * Returns `undefined` if the root execution doesn't exist.
   */
  getExecutionTree(rootId: string): FlowExecutionNode | undefined;

  /**
   * Get all root executions (those with no parent).
   */
  getRoots(): FlowExecution[];

  // --- History --------------------------------------------------------------

  /** Get the history of snapshots for a given execution. */
  history(id: string): ExecutionHistoryEntry[];

  // --- Subscriptions --------------------------------------------------------

  /** Subscribe to any change in the store. Returns an unsubscribe function. */
  subscribe(listener: ExecutionListener): () => void;

  /**
   * Subscribe to changes on a specific execution.
   * Returns an unsubscribe function.
   */
  subscribeToExecution(id: string, listener: ExecutionChangeListener): () => void;

  // --- Utilities ------------------------------------------------------------

  /** Remove all executions and history. */
  clear(): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Options for creating an execution store. */
export interface ExecutionStoreOptions {
  /** Maximum number of history entries per execution (default: 50). */
  maxHistory?: number;
}

/**
 * Create a new in-memory ExecutionStore.
 *
 * ```ts
 * const store = createExecutionStore();
 * ```
 */
export function createExecutionStore(
  options: ExecutionStoreOptions = {},
): ExecutionStore {
  const maxHistory = options.maxHistory ?? 50;

  // Internal state
  const executions = new Map<string, FlowExecution>();
  const historyMap = new Map<string, ExecutionHistoryEntry[]>();
  const globalListeners = new Set<ExecutionListener>();
  const executionListeners = new Map<string, Set<ExecutionChangeListener>>();

  // ---- helpers -----------------------------------------------------------

  function now(): number {
    return Date.now();
  }

  function snapshot(exec: FlowExecution): FlowExecution {
    return JSON.parse(JSON.stringify(exec));
  }

  function pushHistory(exec: FlowExecution): void {
    let entries = historyMap.get(exec.id);
    if (!entries) {
      entries = [];
      historyMap.set(exec.id, entries);
    }
    entries.push({ timestamp: now(), execution: snapshot(exec) });
    if (entries.length > maxHistory) {
      entries.splice(0, entries.length - maxHistory);
    }
  }

  function notify(exec: FlowExecution): void {
    for (const listener of globalListeners) {
      listener();
    }
    const specific = executionListeners.get(exec.id);
    if (specific) {
      for (const listener of specific) {
        listener(exec);
      }
    }
  }

  // ---- implementation ----------------------------------------------------

  function createExecution(input: CreateFlowExecutionInput): FlowExecution {
    const ts = now();
    const exec: FlowExecution = {
      id: uuidv4(),
      flowId: input.flowId,
      status: 'idle',
      steps: {},
      createdAt: ts,
      updatedAt: ts,
      childIds: [],
      parentId: input.parentId,
      metadata: input.metadata,
    };
    executions.set(exec.id, exec);
    pushHistory(exec);

    // Auto-link to parent if parentId provided
    if (input.parentId) {
      const parent = executions.get(input.parentId);
      if (parent && !parent.childIds.includes(exec.id)) {
        parent.childIds.push(exec.id);
        parent.updatedAt = ts;
        pushHistory(parent);
        notify(parent);
      }
    }

    notify(exec);
    return exec;
  }

  function getExecution(id: string): FlowExecution | undefined {
    return executions.get(id);
  }

  function setExecution(exec: FlowExecution): void {
    exec.updatedAt = now();
    executions.set(exec.id, exec);
    pushHistory(exec);
    notify(exec);
  }

  function deleteExecution(id: string): boolean {
    const exec = executions.get(id);
    if (!exec) return false;

    // Unlink from parent
    if (exec.parentId) {
      const parent = executions.get(exec.parentId);
      if (parent) {
        parent.childIds = parent.childIds.filter((cid) => cid !== id);
        parent.updatedAt = now();
        pushHistory(parent);
        notify(parent);
      }
    }

    executions.delete(id);
    historyMap.delete(id);
    executionListeners.delete(id);
    for (const listener of globalListeners) {
      listener();
    }
    return true;
  }

  function listExecutions(): FlowExecution[] {
    return Array.from(executions.values());
  }

  function updateStatus(
    id: string,
    status: FlowExecutionStatus,
  ): FlowExecution | undefined {
    const exec = executions.get(id);
    if (!exec) return undefined;

    const ts = now();
    exec.status = status;
    exec.updatedAt = ts;

    if (status === 'running' && !exec.startedAt) {
      exec.startedAt = ts;
    }
    if (
      (status === 'completed' || status === 'failed' || status === 'cancelled') &&
      !exec.completedAt
    ) {
      exec.completedAt = ts;
    }

    pushHistory(exec);
    notify(exec);
    return exec;
  }

  function updateStep(
    executionId: string,
    stepId: string,
    update: Partial<FlowStepExecution>,
  ): FlowExecution | undefined {
    const exec = executions.get(executionId);
    if (!exec) return undefined;

    const existing = exec.steps[stepId] ?? { stepId, status: 'idle' };
    exec.steps[stepId] = { ...existing, ...update, stepId };
    exec.updatedAt = now();

    pushHistory(exec);
    notify(exec);
    return exec;
  }

  function linkChild(parentId: string, childId: string): void {
    const parent = executions.get(parentId);
    const child = executions.get(childId);
    if (!parent || !child) return;

    if (!parent.childIds.includes(childId)) {
      parent.childIds.push(childId);
      parent.updatedAt = now();
      pushHistory(parent);
      notify(parent);
    }

    if (child.parentId !== parentId) {
      child.parentId = parentId;
      child.updatedAt = now();
      pushHistory(child);
      notify(child);
    }
  }

  function unlinkChild(parentId: string, childId: string): void {
    const parent = executions.get(parentId);
    const child = executions.get(childId);

    if (parent && parent.childIds.includes(childId)) {
      parent.childIds = parent.childIds.filter((cid) => cid !== childId);
      parent.updatedAt = now();
      pushHistory(parent);
      notify(parent);
    }

    if (child && child.parentId === parentId) {
      child.parentId = undefined;
      child.updatedAt = now();
      pushHistory(child);
      notify(child);
    }
  }

  function getChildren(parentId: string): FlowExecution[] {
    const parent = executions.get(parentId);
    if (!parent) return [];
    return parent.childIds
      .map((cid) => executions.get(cid))
      .filter((e): e is FlowExecution => e !== undefined);
  }

  function getParent(childId: string): FlowExecution | undefined {
    const child = executions.get(childId);
    if (!child || !child.parentId) return undefined;
    return executions.get(child.parentId);
  }

  function getExecutionTree(rootId: string): FlowExecutionNode | undefined {
    const root = executions.get(rootId);
    if (!root) return undefined;

    function buildNode(exec: FlowExecution): FlowExecutionNode {
      const childNodes = exec.childIds
        .map((cid) => executions.get(cid))
        .filter((e): e is FlowExecution => e !== undefined)
        .map((child) => buildNode(child));

      return { execution: exec, children: childNodes };
    }

    return buildNode(root);
  }

  function getRoots(): FlowExecution[] {
    return Array.from(executions.values()).filter((e) => !e.parentId);
  }

  function historyFn(id: string): ExecutionHistoryEntry[] {
    return historyMap.get(id) ?? [];
  }

  function subscribe(listener: ExecutionListener): () => void {
    globalListeners.add(listener);
    return () => {
      globalListeners.delete(listener);
    };
  }

  function subscribeToExecution(
    id: string,
    listener: ExecutionChangeListener,
  ): () => void {
    let set = executionListeners.get(id);
    if (!set) {
      set = new Set();
      executionListeners.set(id, set);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
      if (set!.size === 0) {
        executionListeners.delete(id);
      }
    };
  }

  function clear(): void {
    executions.clear();
    historyMap.clear();
    executionListeners.clear();
    for (const listener of globalListeners) {
      listener();
    }
  }

  return {
    createExecution,
    getExecution,
    setExecution,
    deleteExecution,
    listExecutions,
    updateStatus,
    updateStep,
    linkChild,
    unlinkChild,
    getChildren,
    getParent,
    getExecutionTree,
    getRoots,
    history: historyFn,
    subscribe,
    subscribeToExecution,
    clear,
  };
}
