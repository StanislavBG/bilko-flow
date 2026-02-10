/**
 * Determinism grades and declarations for workflow execution.
 *
 * Determinism is expressed as an explicit grade per workflow and per run:
 * - Pure: No time dependence, no external APIs; outputs are a pure function of inputs.
 * - Replayable: External effects controlled by capturing sufficient evidence for replay.
 * - BestEffort: Stable and auditable, but external dependencies may prevent strict replay.
 */

export enum DeterminismGrade {
  /** Outputs are a pure function of declared inputs and step implementations. */
  Pure = 'pure',
  /** External effects are controlled by capturing evidence for replay equivalence. */
  Replayable = 'replayable',
  /** Execution is auditable but external dependencies may prevent strict replay. */
  BestEffort = 'best-effort',
}

/** Time source declaration for determinism tracking. */
export enum TimeSourceKind {
  /** Pinned run time — deterministic across replays. */
  PinnedRunTime = 'pinned-run-time',
  /** Wall clock — nondeterministic, must be explicitly declared. */
  WallClock = 'wall-clock',
}

export interface TimeSourceDeclaration {
  kind: TimeSourceKind;
  /** If pinned, the fixed timestamp to use. */
  pinnedValue?: string;
}

/** External dependency declaration for a step. */
export interface ExternalDependencyDeclaration {
  /** Unique name for this dependency (e.g., "news-api"). */
  name: string;
  /** The kind of external system. */
  kind: 'http-api' | 'database' | 'message-queue' | 'file-system' | 'other';
  /** Whether this dependency is expected to be deterministic. */
  deterministic: boolean;
  /** Evidence capture strategy for replay. */
  evidenceCapture: 'full-response' | 'response-hash' | 'none';
  /** Description of expected nondeterministic behavior if not deterministic. */
  nondeterminismDescription?: string;
}

/** Determinism configuration for a workflow. */
export interface DeterminismConfig {
  targetGrade: DeterminismGrade;
  /** Required time source declarations. */
  timeSources?: TimeSourceDeclaration[];
  /** Required external dependency declarations. */
  externalDependencies?: ExternalDependencyDeclaration[];
}

/** Per-step determinism declarations. */
export interface StepDeterminismDeclaration {
  /** Whether this step uses time. */
  usesTime: boolean;
  timeSource?: TimeSourceDeclaration;
  /** Whether this step calls external APIs. */
  usesExternalApis: boolean;
  externalDependencies?: ExternalDependencyDeclaration[];
  /** Whether outputs are a pure function of inputs for this step. */
  pureFunction: boolean;
}

/** Result of determinism analysis for a compiled workflow. */
export interface DeterminismAnalysis {
  achievableGrade: DeterminismGrade;
  targetGrade: DeterminismGrade;
  satisfied: boolean;
  violations: DeterminismViolation[];
}

export interface DeterminismViolation {
  stepId: string;
  rule: string;
  message: string;
  suggestedFix?: string;
}
