/**
 * Flow execution domain model with parent-child tree support.
 *
 * These types model the runtime execution of a flow, including
 * hierarchical (parent-child) relationships between flow executions.
 * This enables composite flows where a parent flow spawns child
 * sub-flows during execution.
 */

/** Lifecycle status of a flow execution. */
export type FlowExecutionStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Runtime execution data for a single step within a flow execution. */
export interface FlowStepExecution {
  stepId: string;
  status: 'idle' | 'running' | 'success' | 'error' | 'skipped';
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  input?: unknown;
  output?: unknown;
  error?: string;
  attempts?: number;
}

/**
 * A single flow execution instance.
 *
 * Supports parent-child relationships: a parent flow execution can
 * spawn child flow executions, forming a tree. The `parentId` field
 * links to the parent, and `childIds` tracks spawned children.
 */
export interface FlowExecution {
  /** Unique execution instance ID. */
  id: string;
  /** Flow definition ID being executed. */
  flowId: string;
  /** Overall execution status. */
  status: FlowExecutionStatus;
  /** Step-level execution data, indexed by step ID. */
  steps: Record<string, FlowStepExecution>;
  /** Timestamp when execution was created. */
  createdAt: number;
  /** Timestamp of last status change. */
  updatedAt: number;
  /** Timestamp when execution started running. */
  startedAt?: number;
  /** Timestamp when execution reached a terminal state. */
  completedAt?: number;
  /** Execution-level error message if failed. */
  error?: string;
  /** ID of the parent flow execution (if this is a child). */
  parentId?: string;
  /** IDs of child flow executions spawned by this execution. */
  childIds: string[];
  /** Arbitrary metadata attached to this execution. */
  metadata?: Record<string, unknown>;
}

/**
 * Tree node wrapping a FlowExecution with resolved children.
 *
 * Used by `getExecutionTree` to return a fully resolved tree
 * rather than requiring callers to traverse IDs manually.
 */
export interface FlowExecutionNode {
  /** The execution at this tree node. */
  execution: FlowExecution;
  /** Resolved child nodes (recursive). */
  children: FlowExecutionNode[];
}

/** Input for creating a new flow execution. */
export interface CreateFlowExecutionInput {
  /** Flow definition ID. */
  flowId: string;
  /** Optional parent execution ID (for child flows). */
  parentId?: string;
  /** Optional initial metadata. */
  metadata?: Record<string, unknown>;
}
