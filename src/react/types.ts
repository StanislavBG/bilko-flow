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
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/** FlowProgress phase descriptor */
export interface FlowProgressPhase {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'complete' | 'error';
}

/** FlowProgress component props */
export interface FlowProgressProps {
  /** Visual mode — "full" for footer/banner, "compact" for inline */
  mode: 'full' | 'compact';
  /** The phases to display, in order */
  phases: FlowProgressPhase[];
  /** Flow name/label (shown in "full" mode header) */
  label?: string;
  /** Overall flow status */
  status?: 'idle' | 'running' | 'complete' | 'error';
  /** Current activity description */
  activity?: string;
  /** Last completed step result (compact mode, line 3) */
  lastResult?: string;
  /** Called when user clicks reset/restart */
  onReset?: () => void;
  /** Additional CSS classes on root element */
  className?: string;
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
}

/** FlowCard component props */
export interface FlowCardProps {
  flow: FlowDefinition;
  onClick: () => void;
  className?: string;
}
