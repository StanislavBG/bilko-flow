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
 *   FlowProgress — Choose mode based on available width:
 *     • "vertical"  → Mobile screens (< 480px width) or any narrow container
 *                     where vertical space is abundant. Shows steps top-to-bottom
 *                     with a vertical connector rail and expandable ellipsis.
 *     • "compact"   → Tight spaces (sidebars, inline widgets, < 480px width).
 *                     Minimal footprint: dot chain + labels.
 *                     Parallel threads stack as minimal indented rows.
 *     • "expanded"  → Medium to wide containers (cards, panels, 480–900px).
 *                     Step cards with icons, labels, type info.
 *                     Parallel threads render as bordered lanes with step cards.
 *     • "full"      → Wide dedicated areas (> 900px). Large numbered circles,
 *                     phase labels, progress track, header with counter.
 *                     Parallel threads render as full lanes with numbered steps.
 *     • "auto"      → When the container width is dynamic or unknown.
 *                     Set `autoBreakpoint` to the px threshold that best fits
 *                     the layout (default 480). Narrow → vertical, wide → expanded.
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
 *   - `autoBreakpoint` (FlowProgress mode="auto"): Adjust the px cutoff
 *     to match where your layout actually switches from tight to spacious.
 *   - `stepRenderer` (FlowProgress): Provide a custom renderer when the
 *     default step visuals don't fit the host design system.
 *   - `parallelThreads` (FlowProgress): Pass ParallelThread[] for flows
 *     that fork into concurrent branches. Up to 5 threads rendered.
 *   - `parallelConfig` (FlowProgress): Control maxVisible threads (≤5),
 *     auto-collapse behavior, and collapse delay timing.
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
} from './types';
