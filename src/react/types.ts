/**
 * UI-specific type definitions for the React layer.
 *
 * These bridge between the core domain types (which use step types like
 * 'http.search', 'transform.filter', etc.) and the simplified UI step
 * types used for visualization.
 */

/** Simplified UI step types mapped from domain's 12 step types */
export type UIStepType =
  | 'llm'
  | 'user-input'
  | 'transform'
  | 'validate'
  | 'display'
  | 'chat'
  | 'external-input';

/** Runtime status of a step */
export type StepStatus = 'idle' | 'running' | 'success' | 'error' | 'skipped';

/** Schema field descriptor for step input/output */
export interface SchemaField {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
}

/** A single step in a flow definition */
export interface FlowStep {
  id: string;
  name: string;
  type: UIStepType;
  subtype?: string;
  description: string;
  prompt?: string;
  userMessage?: string;
  model?: string;
  inputSchema?: SchemaField[];
  outputSchema?: SchemaField[];
  dependsOn: string[];
  parallel?: boolean;
}

/** A named phase grouping multiple steps */
export interface FlowPhase {
  id: string;
  label: string;
  stepIds: string[];
}

/** Flow output configuration */
export interface FlowOutput {
  type: string;
  description?: string;
}

/** Complete flow definition for visualization */
export interface FlowDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  steps: FlowStep[];
  tags: string[];
  phases?: FlowPhase[];
  output?: FlowOutput;
  icon?: string;
}

/** Runtime execution data for a single step */
export interface StepExecution {
  stepId: string;
  status: StepStatus;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  input?: unknown;
  output?: unknown;
  error?: string;
  rawResponse?: string;
  /** Size of the step output in bytes (for payload growth tracking). */
  outputSizeBytes?: number;
  /** Structural shape of the raw API response (diagnostic metadata, never actual values). */
  rawResponseShape?: import('../domain/response-shape').RawResponseShape;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/** FlowProgress step descriptor */
export interface FlowProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'complete' | 'error';
  /** Optional step type key for theme-aware coloring */
  type?: string;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PARALLEL THREAD TYPES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * These types model parallel execution threads within a flow. When a flow
 * forks into concurrent branches (e.g. "search 3 APIs in parallel"), each
 * branch is a ParallelThread with its own steps and lifecycle.
 *
 * ## FOR LLM / AGENT AUTHORS
 *
 * When building a flow that executes steps concurrently, declare a
 * `parallelThreads` array on your FlowProgressProps. Each thread is
 * independently tracked with its own status and step chain.
 *
 * Key constraints:
 * - Maximum 5 threads are rendered simultaneously (service protection).
 *   Additional threads appear as an overflow count indicator.
 * - Completed threads can be collapsed (minimized) to save vertical space.
 * - Thread IDs must be unique within the parallelThreads array.
 *
 * ## VISUAL BEHAVIOR
 *
 * When `parallelThreads` is provided and non-empty, FlowProgress renders:
 * 1. The main step chain up to the fork point (steps before parallelism).
 * 2. A "fork" indicator showing where threads diverge.
 * 3. Stacked thread rows — each shows its own progress chain.
 * 4. A "join" indicator when all threads complete and the flow continues.
 *
 * Completed threads auto-collapse after 2 seconds (configurable).
 * The user can manually expand/collapse any thread.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * A single parallel execution thread within a flow.
 *
 * @example
 * ```ts
 * const thread: ParallelThread = {
 *   id: 'search-google',
 *   label: 'Google Search',
 *   status: 'running',
 *   steps: [
 *     { id: 'g1', label: 'Query', status: 'complete', type: 'http.search' },
 *     { id: 'g2', label: 'Parse', status: 'active', type: 'transform.map' },
 *   ],
 * };
 * ```
 */
export interface ParallelThread {
  /** Unique thread identifier. Must be unique within the parallelThreads array. */
  id: string;
  /** Human-readable thread label (e.g. "Google Search", "Thread 1"). */
  label: string;
  /** Overall thread status. */
  status: 'pending' | 'running' | 'complete' | 'error';
  /** Steps within this thread, displayed as a sub-chain. */
  steps: FlowProgressStep[];
  /** Optional activity description for this specific thread. */
  activity?: string;
  /** Optional error message when status is 'error'. */
  error?: string;
}

/**
 * Props for configuring parallel thread visualization behavior.
 *
 * @example
 * ```tsx
 * <FlowProgress
 *   mode="expanded"
 *   steps={mainSteps}
 *   parallelThreads={threads}
 *   parallelConfig={{
 *     maxVisible: 5,
 *     autoCollapseCompleted: true,
 *     autoCollapseDelayMs: 2000,
 *   }}
 *   status="running"
 * />
 * ```
 */
export interface ParallelConfig {
  /**
   * Maximum number of threads rendered simultaneously.
   * Threads beyond this limit show as "+N more" overflow indicator.
   * Default: 5. Hard maximum: 5 (values > 5 are clamped).
   */
  maxVisible?: number;
  /**
   * Automatically collapse completed threads after a delay.
   * Default: true.
   */
  autoCollapseCompleted?: boolean;
  /**
   * Delay in milliseconds before auto-collapsing completed threads.
   * Only applies when `autoCollapseCompleted` is true.
   * Default: 2000.
   */
  autoCollapseDelayMs?: number;
}

/**
 * Theme object for FlowProgress customization.
 *
 * Allows per-step-type colors and overrides for status colors.
 * All color values are Tailwind CSS classes (e.g. 'bg-purple-500').
 */
export interface FlowProgressTheme {
  /** Map step type keys to Tailwind bg color classes */
  stepColors: Record<string, string>;
  /** Color for active/running step (Tailwind bg class) */
  activeColor: string;
  /** Color for completed step (Tailwind bg class) */
  completedColor: string;
  /** Color for error step (Tailwind bg class) */
  errorColor: string;
  /** Color for pending step (Tailwind bg class) */
  pendingColor: string;
  /** Text color for active step labels (Tailwind text class) */
  activeTextColor: string;
  /** Text color for completed step labels (Tailwind text class) */
  completedTextColor: string;
  /** Text color for error step labels (Tailwind text class) */
  errorTextColor: string;
  /** Text color for pending step labels (Tailwind text class) */
  pendingTextColor: string;
}

/**
 * Adapter function to convert external step data to FlowProgressStep.
 * Enables the Context Adapter Pattern — FlowProgress can bridge
 * external step data (not domain.Step) via this function.
 */
export type FlowProgressAdapter<T> = (externalStep: T, index: number) => FlowProgressStep;

/**
 * Custom step renderer for the External Integration Pattern.
 * Receives the step data and computed visual props, returns a React node.
 */
export type FlowProgressStepRenderer = (
  step: FlowProgressStep,
  props: {
    index: number;
    isActive: boolean;
    bgColor: string;
    textColor: string;
    mode: 'full' | 'compact' | 'expanded';
  },
) => React.ReactNode;

/**
 * FlowProgress component props.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AGENT / LLM AUTHORING GUIDE — FlowProgressProps
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * FlowProgress is the primary progress visualization for bilko-flow.
 * It supports BOTH linear (sequential) and parallel (forked) execution.
 *
 * ## LINEAR FLOW (no parallelism)
 * Pass `steps` only. Each step renders in sequence left-to-right.
 *
 * ```tsx
 * <FlowProgress
 *   mode="expanded"
 *   steps={[
 *     { id: '1', label: 'Fetch', status: 'complete', type: 'http.search' },
 *     { id: '2', label: 'Parse', status: 'active', type: 'transform.map' },
 *     { id: '3', label: 'Store', status: 'pending' },
 *   ]}
 *   status="running"
 * />
 * ```
 *
 * ## PARALLEL FLOW (forked threads)
 * Pass `steps` (for the main chain) AND `parallelThreads` for the
 * concurrent branches. The main chain renders first, then a fork
 * indicator, then stacked parallel thread rows.
 *
 * ```tsx
 * <FlowProgress
 *   mode="expanded"
 *   steps={[
 *     { id: 'init', label: 'Initialize', status: 'complete' },
 *   ]}
 *   parallelThreads={[
 *     {
 *       id: 'google', label: 'Google API', status: 'running',
 *       steps: [
 *         { id: 'g1', label: 'Query', status: 'complete', type: 'http.search' },
 *         { id: 'g2', label: 'Parse', status: 'active', type: 'transform.map' },
 *       ],
 *     },
 *     {
 *       id: 'bing', label: 'Bing API', status: 'running',
 *       steps: [
 *         { id: 'b1', label: 'Query', status: 'active', type: 'http.search' },
 *       ],
 *     },
 *   ]}
 *   parallelConfig={{ maxVisible: 5, autoCollapseCompleted: true }}
 *   status="running"
 *   label="Multi-Search Pipeline"
 * />
 * ```
 *
 * ## SERVICE PROTECTION
 * - Maximum 5 parallel threads rendered (hard limit, clamped).
 * - Overflow threads show as "+N more" indicator.
 * - Completed threads auto-collapse to save space.
 *
 * ## CHOOSING THE RIGHT MODE
 * - "compact"  → < 480px width. Parallel threads stack vertically as mini rows.
 * - "expanded" → 480–900px. Each thread gets a bordered lane with step cards.
 * - "full"     → > 900px. Full stepper lanes with numbered circles per thread.
 * - "auto"     → Dynamic switching between expanded and compact.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export interface FlowProgressProps {
  /**
   * Visual mode:
   * - "full": Large numbered circles, phase labels, wide connectors, header
   * - "compact": Small status icons with inline text labels, thin connectors
   * - "expanded": Rectangular step cards with icon, label, and type — fills available space
   * - "auto": Dynamically selects "expanded" or "compact" based on container width
   */
  mode: 'full' | 'compact' | 'expanded' | 'auto';
  /** Steps to display, in order (main chain before any fork point) */
  steps: FlowProgressStep[];
  /**
   * Parallel execution threads. When provided and non-empty, FlowProgress
   * renders a fork indicator after the main steps, then stacked thread rows.
   *
   * Each thread has its own steps, status, and optional activity text.
   * Maximum 5 threads are displayed (service protection); overflow shows
   * as a "+N more" indicator.
   *
   * Completed threads can be collapsed/minimized by the user or
   * automatically (see `parallelConfig`).
   */
  parallelThreads?: ParallelThread[];
  /**
   * Configuration for parallel thread visualization behavior.
   * Controls max visible threads, auto-collapse, and timing.
   */
  parallelConfig?: ParallelConfig;
  /**
   * Called when user clicks to expand or collapse a parallel thread.
   * Receives the thread ID and the new collapsed state.
   */
  onThreadToggle?: (threadId: string, collapsed: boolean) => void;
  /** Flow name/label (shown in "full" and "expanded" mode header) */
  label?: string;
  /** Overall flow status */
  status?: 'idle' | 'running' | 'complete' | 'error';
  /** Current activity description */
  activity?: string;
  /** Last completed step result (compact mode, line 3) */
  lastResult?: string;
  /** Called when user clicks reset/restart */
  onReset?: () => void;
  /** Called when user clicks a step (from ellipsis dropdown or direct) */
  onStepClick?: (stepId: string) => void;
  /** Additional CSS classes on root element */
  className?: string;
  /** Theme customization for step type-aware coloring */
  theme?: Partial<FlowProgressTheme>;
  /** Custom step renderer for External Integration Pattern */
  stepRenderer?: FlowProgressStepRenderer;
  /** Sliding window radius (default: 2) */
  radius?: number;
  /**
   * Width breakpoint (in px) at which "auto" mode switches from "compact" to "expanded".
   * Default: 480. Below this value, compact mode is used; at or above, expanded mode is used.
   */
  autoBreakpoint?: number;
}

/** FlowCanvas component props */
export interface FlowCanvasProps {
  flow: FlowDefinition;
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
  onDeselectStep?: () => void;
  executions?: Record<string, StepExecution>;
  highlightStepId?: string | null;
  selectedStepIds?: Set<string>;
  onToggleSelect?: (stepId: string) => void;
  className?: string;
}

/** StepDetail component props */
export interface StepDetailProps {
  step: FlowStep;
  flow: FlowDefinition;
  execution?: StepExecution;
  className?: string;
}

/** StepNode component props */
export interface StepNodeProps {
  step: FlowStep;
  status: StepStatus;
  isSelected: boolean;
  onClick: () => void;
  index: number;
  isLast: boolean;
}

/** FlowTimeline component props */
export interface FlowTimelineProps {
  flow: FlowDefinition;
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
  executions?: Record<string, StepExecution>;
  className?: string;
  /** Theme override passed through to FlowProgress */
  theme?: Partial<FlowProgressTheme>;
}

/** FlowCard component props */
export interface FlowCardProps {
  flow: FlowDefinition;
  onClick: () => void;
  className?: string;
}
