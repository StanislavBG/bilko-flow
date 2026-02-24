/**
 * bilko-flow/react — Portable React components for flow visualization.
 *
 * Import from 'bilko-flow/react' to use these components.
 * All components are props-driven with no required React context.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * IMPORTANT — AGENT GUIDANCE FOR UI COMPONENT SELECTION
 * ═══════════════════════════════════════════════════════════════════════
 *
 * These components are HIGHLY CONFIGURABLE. Before implementing any
 * component, you MUST first reason through the available rendering area
 * (width, height, and context) and choose the configuration that
 * maximizes the end-user experience. Do NOT use defaults blindly.
 *
 * STEP 1 — Assess the target area:
 *   - How wide is the container? (sidebar ≈ 240–320px, main panel ≈ 600–1200px, full page ≈ 1200px+)
 *   - How tall is the available space? (inline widget ≈ 40–80px, card ≈ 120–200px, panel ≈ 400px+)
 *   - Is this embedded inside another component or standalone?
 *   - Will the user interact with it or is it display-only?
 *   - Does the flow have parallel branches? (If yes, account for extra
 *     vertical space — each thread lane adds ~40–60px in expanded mode.)
 *
 * STEP 2 — Pick the right component and mode:
 *
 *   FlowProgress — Choose mode (or use "auto" as the recommended default):
 *     • "auto"      → (RECOMMENDED) Smart multi-breakpoint mode that adapts
 *                     automatically to container width using a 4-tier system:
 *                       < 480px → vertical | 480–639px → compact |
 *                       640–899px → expanded | ≥ 900px → full
 *                     Also auto-detects parallel threads (avoids vertical)
 *                     and pipeline config (selects pipeline at ≥ 640px).
 *                     Use `autoModeConfig` for custom breakpoint thresholds.
 *                     This is the BEST choice when container size is unknown.
 *     • "vertical"  → Mobile screens (< 480px width) or any narrow container
 *                     where vertical space is abundant. Shows steps top-to-bottom
 *                     with a vertical connector rail and expandable ellipsis.
 *     • "compact"   → Sidebars (480–639px width). Minimal footprint: dot chain
 *                     + labels. Parallel threads stack as minimal indented rows.
 *     • "expanded"  → Medium to wide containers (640–899px).
 *                     Step cards with icons, labels, type info.
 *                     Parallel threads render as bordered lanes with step cards.
 *     • "full"      → Wide dedicated areas (≥ 900px). Large numbered circles,
 *                     phase labels, progress track, header with counter.
 *                     Parallel threads render as full lanes with numbered steps.
 *     • "pipeline"  → Deploy/CI-style progress (≥ 640px width). Large stage
 *                     circles on a continuous track with prominent labels.
 *                     Best for deployment, publish, and promotion workflows.
 *                     Configure via `pipelineConfig` prop (stage size, numbers,
 *                     duration display, track style).
 *
 *   FlowCanvas — Use ONLY when you have a large 2D area (≥ 500×400px) and
 *     the user needs to explore a DAG structure interactively.
 *
 *   FlowTimeline — Thin wrapper over FlowProgress compact mode. Best for
 *     narrow sidebar panels where vertical space is available.
 *
 *   FlowCard — Summary cards for listing/browsing flows. Use in grids
 *     or lists, not for detailed inspection.
 *
 *   StepDetail — Rich inspection panel. Requires significant vertical space
 *     (≥ 300px). Best as a right-side detail pane or modal.
 *
 *   ComponentCatalog — Browsable catalog. Needs ≥ 600px width for the
 *     two-column layout (list + detail) to render well.
 *
 * STEP 3 — Tune configurable properties for the area:
 *   - `radius` (FlowProgress): Controls sliding window size. For very
 *     narrow containers, use radius=1. For wide areas, radius=3 or 4.
 *   - `theme` (FlowProgress): Override colors to match the host app.
 *     Use `mergeTheme()` for partial overrides.
 *   - `autoModeConfig` (FlowProgress mode="auto"): Configure the 4-tier
 *     breakpoint thresholds to match your layout's responsive behavior.
 *     Overrides the legacy `autoBreakpoint` prop.
 *   - `stepRenderer` (FlowProgress): Provide a custom renderer when the
 *     default step visuals don't fit the host design system.
 *   - `parallelThreads` (FlowProgress): Pass ParallelThread[] for flows
 *     that fork into concurrent branches. Up to 5 threads rendered.
 *   - `parallelConfig` (FlowProgress): Control maxVisible threads (≤5),
 *     auto-collapse behavior, and collapse delay timing.
 *   - `pipelineConfig` (FlowProgress mode="pipeline"): Control stage circle
 *     size, whether to show stage numbers or type icons, duration labels,
 *     and continuous vs segmented track style.
 *   - `onThreadToggle` (FlowProgress): Callback for thread expand/collapse.
 *   - `className` (all components): Use for sizing constraints, margins,
 *     and overflow behavior in the host layout.
 *
 * STEP 4 — Validate your choice:
 *   Ask yourself: "If this container were 30% narrower or 30% wider,
 *   would this component still look correct?" If not, use mode="auto"
 *   or reconsider the mode selection.
 *
 * The goal is to fill the available space meaningfully — not to cram a
 * full-mode stepper into a 300px sidebar or show a compact dot chain
 * in a 1200px hero area. Measure first, configure deliberately.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * PARALLEL FLOW GUIDE (for agents authoring flows with concurrency)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * When your workflow forks into parallel branches, use the
 * `parallelThreads` prop on FlowProgress. This is the ONLY way to
 * visually represent concurrent execution in the progress widget.
 *
 * WHEN TO USE parallelThreads:
 *   - The flow queries multiple APIs simultaneously
 *   - The flow processes data through independent pipelines
 *   - The flow runs the same operation with different parameters
 *   - Any fan-out / fan-in (fork-join) execution pattern
 *
 * HOW TO STRUCTURE THE DATA:
 *   1. `steps` = the MAIN chain (steps before the fork point)
 *   2. `parallelThreads` = the concurrent branches
 *   3. After all threads complete, continue adding steps to `steps`
 *      (or track completion via `status`)
 *
 * SERVICE PROTECTION:
 *   - Hard limit: 5 threads rendered (MAX_PARALLEL_THREADS constant)
 *   - Excess threads shown as "+N more" overflow indicator
 *   - Set `parallelConfig.maxVisible` to a lower number if needed
 *   - Completed threads auto-collapse after 2 seconds by default
 *
 * EXAMPLE — 3-thread parallel search:
 * ```tsx
 * <FlowProgress
 *   mode="expanded"
 *   steps={[
 *     { id: 'init', label: 'Initialize', status: 'complete' },
 *   ]}
 *   parallelThreads={[
 *     {
 *       id: 'google', label: 'Google', status: 'complete',
 *       steps: [
 *         { id: 'g1', label: 'Search', status: 'complete', type: 'http.search' },
 *         { id: 'g2', label: 'Parse', status: 'complete', type: 'transform.map' },
 *       ],
 *     },
 *     {
 *       id: 'bing', label: 'Bing', status: 'running',
 *       steps: [
 *         { id: 'b1', label: 'Search', status: 'active', type: 'http.search' },
 *       ],
 *       activity: 'Waiting for response...',
 *     },
 *     {
 *       id: 'ddg', label: 'DuckDuckGo', status: 'running',
 *       steps: [
 *         { id: 'd1', label: 'Search', status: 'active', type: 'http.search' },
 *       ],
 *     },
 *   ]}
 *   parallelConfig={{ maxVisible: 5, autoCollapseCompleted: true }}
 *   status="running"
 *   label="Multi-Search"
 * />
 * ```
 * ═══════════════════════════════════════════════════════════════════════
 */

// Components
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

// Parallel thread visualization
export { ParallelThreadsSection, MAX_PARALLEL_THREADS } from './parallel-threads';
export type { ParallelThreadsSectionProps } from './parallel-threads';

// Mutation engine (pure functions, no React dependency)
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

// Component definitions (data, no React dependency)
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

// Layout engine (pure function, no React dependency)
export { computeLayout, NODE_W, NODE_H, COL_GAP, ROW_GAP, PADDING } from './layout';
export type { NodeLayout, EdgeLayout, DAGLayout } from './layout';

// Step type configuration
export {
  STEP_TYPE_CONFIG,
  LLM_SUBTYPE_CONFIG,
  DOMAIN_STEP_TYPE_MAP,
  DEFAULT_FLOW_PROGRESS_THEME,
  getStepVisuals,
  mergeTheme,
} from './step-type-config';
export type { StepTypeVisuals } from './step-type-config';

// Execution hooks
export { useExecutionStore } from './use-execution-store';
export type { UseExecutionStoreReturn } from './use-execution-store';
export { useFlowExecution } from './use-flow-execution';
export type {
  UseFlowExecutionOptions,
  UseFlowExecutionReturn,
} from './use-flow-execution';

// ═══════════════════════════════════════════════════════════════════════
// SSE STREAM HOOK (v0.3.0)
// ═══════════════════════════════════════════════════════════════════════
//
// This hook is the DIRECT response to the NPR feedback that the library
// "couldn't natively consume SSE streams." It abstracts the boilerplate
// of opening an EventSource, parsing events, mapping them to step state,
// handling reconnection, and cleaning up on unmount.
//
// Generic over the SSE event payload type T — consumers define their
// event shape and provide a mapEvent function. No coupling between
// bilko-flow and the server's event format.
//
// See use-flow-sse.ts for comprehensive documentation and examples.
// ═══════════════════════════════════════════════════════════════════════
export { useFlowSSE } from './use-flow-sse';
export type {
  UseFlowSSEOptions,
  UseFlowSSEReturn,
  SSEConnectionState,
  SSEStepUpdate,
} from './use-flow-sse';

// ═══════════════════════════════════════════════════════════════════════
// SHARED UTILITIES (v0.3.0 — newly exported)
// ═══════════════════════════════════════════════════════════════════════
//
// resolveStepMeta and applyStatusMap were previously internal-only.
// Exporting them allows consumers to use the same meta-extraction
// and status-mapping logic in their own code without reimplementing it.
// ═══════════════════════════════════════════════════════════════════════
export {
  resolveStepMeta,
  applyStatusMap,
  getStatusIcon,
  resolveAutoMode,
  DEFAULT_AUTO_BREAKPOINTS,
} from './flow-progress-shared';
export type { ResolvedStepMeta } from './flow-progress-shared';

// Schema Designer
export { SchemaDesigner } from './schema-designer';

// Table Parser (LLM integration utilities)
export {
  TABLE_PARSE_SYSTEM_PROMPT,
  validateTableDefinition,
  createTableParser,
} from './table-parser';

// Types
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
  AutoModeConfig,
  ColumnDefinition,
  TableDefinition,
  SchemaDefinition,
  SchemaDesignerProps,
  SmartTableCreatorProps,
} from './types';
