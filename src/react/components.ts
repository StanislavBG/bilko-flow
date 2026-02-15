/**
 * bilko-flow/react/components — Pure visualization exports.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS ENTRY POINT EXISTS (v0.3.0 — RESILIENCY ENHANCEMENT)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The NPR feedback identified a critical coupling problem: importing from
 * 'bilko-flow/react' transitively pulled in the execution engine, storage
 * layer, and all their dependencies — even when the consumer only needed
 * the FlowProgress component for visualization.
 *
 * This caused TWO problems:
 *
 *   1. BUNDLE SIZE: The unused execution/storage code inflated the bundle.
 *      Combined with Tailwind scanning all component files, this added
 *      47 KB to the consumer's bundle — exceeding their 200 KB budget.
 *
 *   2. CONCEPTUAL COUPLING: Consumers using server-driven workflows
 *      (where the backend handles orchestration via Express endpoints)
 *      had no use for the client-side ExecutionStore. But importing
 *      FlowProgress implicitly suggested they should use it, creating
 *      confusion about the library's intended architecture.
 *
 * This entry point exports ONLY:
 *   - UI components (FlowProgress, FlowCanvas, StepDetail, etc.)
 *   - UI hooks (useFlowSSE — for SSE stream consumption)
 *   - Pure utility functions (adaptSteps, mergeTheme, computeLayout, etc.)
 *   - Types (FlowProgressStep, FlowProgressProps, etc.)
 *
 * It does NOT export:
 *   - useExecutionStore (requires ExecutionStore from ../execution)
 *   - useFlowExecution (requires ExecutionStore from ../execution)
 *
 * ## FOR AGENT / LLM AUTHORS
 *
 * Use this import path when your backend handles orchestration and you
 * only need bilko-flow for visualization:
 *
 * ```ts
 * // BEFORE (pulls in execution engine):
 * import { FlowProgress } from 'bilko-flow/react';
 *
 * // AFTER (pure visualization only):
 * import { FlowProgress } from 'bilko-flow/react/components';
 * ```
 *
 * If you DO need client-side execution management (ExecutionStore,
 * useFlowExecution), continue importing from 'bilko-flow/react'.
 *
 * ## TREE-SHAKING NOTE
 *
 * Modern bundlers (webpack 5, Rollup, esbuild) with proper tree-shaking
 * should already eliminate unused exports. This entry point exists as
 * an EXPLICIT guarantee for bundlers that don't tree-shake effectively
 * (or for environments where tree-shaking is disabled, like some test
 * runners and older webpack configurations).
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────────────
// Components — Pure React UI, no execution engine dependency
// ─────────────────────────────────────────────────────────────────────────

export { FlowProgress, adaptSteps } from './flow-progress';
export { FlowProgressVertical } from './flow-progress-vertical';
export type { FlowProgressVerticalProps } from './flow-progress-vertical';
export { FlowErrorBoundary } from './flow-error-boundary';
export type { FlowErrorBoundaryProps } from './flow-error-boundary';
export { FlowCanvas } from './flow-canvas';
export { StepNode } from './step-node';
export { StepDetail } from './step-detail';
export { FlowTimeline } from './flow-timeline';
export { FlowCard } from './flow-card';
export { CanvasBuilder } from './canvas-builder';
export type { ParsedIntent, CanvasBuilderProps } from './canvas-builder';
export { ComponentCatalog } from './component-catalog';
export type { ComponentCatalogProps } from './component-catalog';

// ─────────────────────────────────────────────────────────────────────────
// Parallel thread visualization — pure UI
// ─────────────────────────────────────────────────────────────────────────

export { ParallelThreadsSection, MAX_PARALLEL_THREADS } from './parallel-threads';
export type { ParallelThreadsSectionProps } from './parallel-threads';

// ─────────────────────────────────────────────────────────────────────────
// SSE hook — for server-driven workflows (no ExecutionStore needed)
// ─────────────────────────────────────────────────────────────────────────

export { useFlowSSE } from './use-flow-sse';
export type {
  UseFlowSSEOptions,
  UseFlowSSEReturn,
  SSEConnectionState,
  SSEStepUpdate,
} from './use-flow-sse';

// ─────────────────────────────────────────────────────────────────────────
// Pure utility functions — no React dependency, no execution dependency
// ─────────────────────────────────────────────────────────────────────────

export {
  applyMutation,
  createBlankStep,
  generateStepId,
} from './mutations';
export type {
  FlowMutation,
  MutationResult,
  MutationValidationError,
} from './mutations';

export {
  DEFAULT_COMPONENT_DEFINITIONS,
  getComponentByType,
} from './component-definitions';
export type {
  ComponentDefinition,
  ComponentFieldSpec,
  ComponentUseCase,
  ComponentReference,
} from './component-definitions';

export { computeLayout, NODE_W, NODE_H, COL_GAP, ROW_GAP, PADDING } from './layout';
export type { NodeLayout, EdgeLayout, DAGLayout } from './layout';

export {
  STEP_TYPE_CONFIG,
  LLM_SUBTYPE_CONFIG,
  DOMAIN_STEP_TYPE_MAP,
  DEFAULT_FLOW_PROGRESS_THEME,
  getStepVisuals,
  mergeTheme,
} from './step-type-config';
export type { StepTypeVisuals } from './step-type-config';

// ─────────────────────────────────────────────────────────────────────────
// Shared utilities — meta extraction, status mapping
// ─────────────────────────────────────────────────────────────────────────

export {
  resolveStepMeta,
  applyStatusMap,
  getStatusIcon,
} from './flow-progress-shared';
export type { ResolvedStepMeta } from './flow-progress-shared';

// ─────────────────────────────────────────────────────────────────────────
// Types — all type exports (no runtime code)
// ─────────────────────────────────────────────────────────────────────────

export type {
  UIStepType,
  StepStatus,
  SchemaField,
  FlowStep,
  FlowPhase,
  FlowOutput,
  FlowDefinition,
  StepExecution,
  FlowProgressStep,
  FlowProgressProps,
  FlowProgressTheme,
  FlowProgressAdapter,
  FlowProgressStepRenderer,
  FlowCanvasProps,
  StepDetailProps,
  StepNodeProps,
  FlowTimelineProps,
  FlowCardProps,
  ParallelThread,
  ParallelConfig,
  PipelineConfig,
} from './types';
