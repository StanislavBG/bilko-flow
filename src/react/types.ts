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

/** FlowProgress component props */
export interface FlowProgressProps {
  /**
   * Visual mode:
   * - "full": Large numbered circles, phase labels, wide connectors, header
   * - "compact": Small status icons with inline text labels, thin connectors
   * - "expanded": Rectangular step cards with icon, label, and type — fills available space
   * - "auto": Dynamically selects "expanded" or "compact" based on container width
   */
  mode: 'full' | 'compact' | 'expanded' | 'auto';
  /** Steps to display, in order */
  steps: FlowProgressStep[];
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
