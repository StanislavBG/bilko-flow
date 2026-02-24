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

/**
 * FlowProgress step descriptor.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * RESILIENCY NOTE — WHY `meta` AND `skipped` EXIST (v0.3.0)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This interface was originally a rigid four-field type (id, label, status,
 * type) with a fixed four-value status enum (pending/active/complete/error).
 * A production consumer (NPR podcast pipeline) abandoned the library because:
 *
 *   1. There was NO per-step data channel. The only text output was the
 *      flow-wide `activity` prop. Consumers showing per-step messages like
 *      "Chunk 2/5 transcribed — 3.2 MB" had to either overwrite the single
 *      `activity` string on every SSE event (losing context for other steps)
 *      or build a fully custom progress component (abandoning the library).
 *
 *   2. There was NO 'skipped' status. Conditional pipelines that bypass
 *      steps at runtime were forced to remove steps (losing positional
 *      context), mark them 'complete' (misleading), or leave them 'pending'
 *      (also misleading).
 *
 * The solution is a GENERIC extensibility mechanism:
 *
 *   - `meta: Record<string, unknown>` — An open-ended metadata bag that
 *     agents can populate with ANYTHING: text messages, streaming chunk
 *     progress, audio references, batch counters, drip-feed state,
 *     binary payload URIs, custom JSON, etc. The library defines a set
 *     of WELL-KNOWN KEYS (documented below) that the built-in renderers
 *     know how to display, but agents are free to add ANY key they need.
 *     Consumers reading `meta` can type-narrow at access time.
 *
 *   - `status: 'skipped'` — A fifth status value for conditionally
 *     bypassed steps, rendered with distinct dimmed visual treatment.
 *
 * Both additions are **fully backwards-compatible**. Existing consumers
 * that never set `meta` or use 'skipped' see zero visual/behavioral change.
 *
 * ## WELL-KNOWN META KEYS
 *
 * The built-in renderers check for these keys and display them
 * automatically. All are optional — unknown keys are silently ignored
 * by renderers but preserved in the data for consumer access.
 *
 * | Key               | Type     | Description                                    |
 * | ----------------- | -------- | ---------------------------------------------- |
 * | `message`         | string   | Per-step status text shown beneath the label.   |
 * |                   |          | e.g. "Chunk 2/5 — 3.2 MB"                      |
 * | `progress`        | number   | 0–1 fractional progress for the step.           |
 * |                   |          | Rendered as a mini progress bar when present.   |
 * | `mediaType`       | string   | MIME type of payload (e.g. "audio/mpeg").        |
 * |                   |          | Informs consumers what kind of data to expect.  |
 * | `mediaUri`        | string   | URI reference to streamed/produced content.     |
 * | `bytesProcessed`  | number   | Running byte count for streaming/batch steps.   |
 * | `bytesTotal`      | number   | Total expected bytes (enables % calculation).   |
 * | `chunksProcessed` | number   | Running chunk count for chunked processing.     |
 * | `chunksTotal`     | number   | Total expected chunks.                          |
 * | `startedAt`       | number   | Unix ms timestamp when the step began.          |
 * | `completedAt`     | number   | Unix ms timestamp when the step finished.       |
 * | `durationMs`      | number   | Elapsed milliseconds for the step.              |
 * | `error`           | string   | Error detail text (supplements status='error'). |
 * | `skipReason`      | string   | Why the step was skipped (shown for 'skipped'). |
 *
 * ## CUSTOM / AGENT-DEFINED KEYS
 *
 * Agents SHOULD namespace custom keys to avoid collisions with future
 * well-known keys. Convention: `x-<domain>-<key>`.
 *
 * ```ts
 * meta: {
 *   message: 'Processing audio...',
 *   'x-npr-segment': { start: 0, end: 120, speaker: 'host' },
 *   'x-batch-id': 'abc-123',
 * }
 * ```
 *
 * ## FOR AGENT / LLM AUTHORS
 *
 * - Set `meta.message` on any step to show granular per-step text.
 *   This is the RIGHT place for per-step status — use the flow-wide
 *   `activity` prop only for flow-level status.
 * - Set `meta.progress` (0–1) for a visual progress indicator.
 * - Use `status: 'skipped'` with `meta.skipReason` for bypassed steps.
 * - For streaming data (audio, video, binary), set `meta.mediaType`
 *   and `meta.mediaUri` so consumers know how to handle the payload.
 * - For chunk/batch progress, set `meta.chunksProcessed` / `meta.chunksTotal`.
 * - You can put ANY JSON-serializable data in `meta`. The renderers
 *   only look at well-known keys; everything else is passed through
 *   untouched for consumer access.
 *
 * @example Per-step text messages
 * ```ts
 * const steps: FlowProgressStep[] = [
 *   { id: '1', label: 'Download', status: 'complete',
 *     meta: { message: '14.2 MB in 3.1s', bytesProcessed: 14_200_000, durationMs: 3100 } },
 *   { id: '2', label: 'Transcode', status: 'active',
 *     meta: { message: 'Chunk 2/5 — 3.2 MB', chunksProcessed: 2, chunksTotal: 5, progress: 0.4 } },
 *   { id: '3', label: 'Upload', status: 'pending' },
 * ];
 * ```
 *
 * @example Streaming audio with custom metadata
 * ```ts
 * const steps: FlowProgressStep[] = [
 *   { id: '1', label: 'Stream Audio', status: 'active',
 *     meta: {
 *       message: 'Buffering...',
 *       mediaType: 'audio/mpeg',
 *       mediaUri: '/stream/abc-123',
 *       'x-npr-segment': { start: 0, end: 120 },
 *     } },
 * ];
 * ```
 *
 * @example Skipped step with reason
 * ```ts
 * const steps: FlowProgressStep[] = [
 *   { id: '1', label: 'Download', status: 'complete' },
 *   { id: '2', label: 'Transcode', status: 'skipped',
 *     meta: { skipReason: 'Already in MP3 format' } },
 *   { id: '3', label: 'Upload', status: 'active' },
 * ];
 * ```
 * ═══════════════════════════════════════════════════════════════════════════
 */
export interface FlowProgressStep {
  id: string;
  label: string;
  /**
   * Step execution status.
   *
   * - 'pending'  — Not yet started. Renders as a dim placeholder circle/card.
   * - 'active'   — Currently executing. Renders with animation/pulse effect.
   * - 'complete' — Successfully finished. Renders with a green check icon.
   * - 'error'    — Failed. Renders with a red error icon.
   * - 'skipped'  — Conditionally bypassed at runtime. Renders with a
   *                distinct dimmed + strikethrough treatment and a skip
   *                indicator icon (SkipForward) so the user can see the
   *                step existed in the pipeline but was intentionally not
   *                executed. Use `meta.skipReason` to explain why.
   *
   *                Added in v0.3.0 to support conditional pipelines
   *                without removing steps from the array (which loses
   *                positional context and breaks DAG visualization) or
   *                misleadingly marking them as 'complete' or 'pending'.
   */
  status: 'pending' | 'active' | 'complete' | 'error' | 'skipped';
  /** Optional step type key for theme-aware coloring */
  type?: string;
  /**
   * Generic, open-ended metadata bag for per-step data of ANY kind.
   *
   * ═══════════════════════════════════════════════════════════════════════
   * THIS IS THE GENERIC EXTENSIBILITY MECHANISM THAT REPLACES THE NEED
   * FOR ADDING NARROW-PURPOSE FIELDS TO THIS INTERFACE.
   * ═══════════════════════════════════════════════════════════════════════
   *
   * Instead of adding a `message` field, a `progress` field, an `audio`
   * field, etc. (which creates interface bloat and forces library releases
   * for every new use case), `meta` is a single Record<string, unknown>
   * that agents can populate with whatever they need:
   *
   *   - Text status messages   → meta.message
   *   - Streaming progress     → meta.progress, meta.chunksProcessed
   *   - Audio/video references → meta.mediaType, meta.mediaUri
   *   - Batch counters         → meta.bytesProcessed, meta.bytesTotal
   *   - Timing data            → meta.startedAt, meta.durationMs
   *   - Custom agent data      → meta['x-myagent-whatever']
   *
   * The built-in renderers know how to display well-known keys (see the
   * WELL-KNOWN META KEYS table in the interface JSDoc above). Unknown
   * keys are silently ignored by renderers but preserved in the object
   * for consumer access — agents reading step data can access any key
   * they put in.
   *
   * ## TYPE NARROWING AT ACCESS TIME
   *
   * Since `meta` values are `unknown`, consumers should type-narrow:
   * ```ts
   * const msg = typeof step.meta?.message === 'string' ? step.meta.message : undefined;
   * const progress = typeof step.meta?.progress === 'number' ? step.meta.progress : undefined;
   * ```
   *
   * ## WHY Record<string, unknown> INSTEAD OF A TYPED INTERFACE
   *
   * 1. No library release needed when agents invent new meta keys.
   * 2. No import required — agents just set plain JSON.
   * 3. No version coupling — consumers on older bilko-flow versions
   *    can still receive and forward meta keys they don't understand.
   * 4. The well-known keys provide structure WHERE IT MATTERS (rendering)
   *    without constraining the rest of the payload.
   *
   * If you need type safety for your custom keys, create a domain-
   * specific type in YOUR code and cast:
   * ```ts
   * interface MyStepMeta { message: string; 'x-npr-segment': { start: number; end: number } }
   * const myMeta = step.meta as MyStepMeta;
   * ```
   */
  meta?: Record<string, unknown>;
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
/**
 * Configuration for the "pipeline" mode visual appearance.
 *
 * Pipeline mode renders a clean, horizontal deploy-style progress bar
 * inspired by CI/CD pipeline UIs (Provision → Build → Deploy → Promote).
 * Each step appears as a labeled stage with prominent status indicators
 * connected by a continuous track.
 *
 * @example
 * ```tsx
 * <FlowProgress
 *   mode="pipeline"
 *   steps={[
 *     { id: '1', label: 'Provision', status: 'complete' },
 *     { id: '2', label: 'Security Scan', status: 'complete' },
 *     { id: '3', label: 'Build', status: 'active' },
 *     { id: '4', label: 'Bundle', status: 'pending' },
 *     { id: '5', label: 'Promote', status: 'pending' },
 *   ]}
 *   pipelineConfig={{ showDuration: true, showStageNumbers: false }}
 *   status="running"
 *   label="Production Deploy"
 * />
 * ```
 */
export interface PipelineConfig {
  /**
   * Show duration/elapsed time beneath active and completed stages.
   * Default: false.
   */
  showDuration?: boolean;
  /**
   * Show stage numbers (1, 2, 3...) inside pending stage circles.
   * Default: true.
   */
  showStageNumbers?: boolean;
  /**
   * Use a filled continuous track between stages instead of segmented connectors.
   * Default: true.
   */
  continuousTrack?: boolean;
  /**
   * Size of stage indicator circles in px.
   * Default: 40.
   */
  stageSize?: number;
  /**
   * Custom labels for stage durations. Map step ID → duration string.
   * Only shown when `showDuration` is true.
   * @example { 'build': '2m 34s', 'deploy': '45s' }
   */
  stageDurations?: Record<string, string>;
}

/**
 * Configuration for the enhanced multi-breakpoint auto-mode.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * MULTI-BREAKPOINT AUTO-MODE (v0.3.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * The enhanced auto-mode uses a 4-tier breakpoint system to select the
 * optimal rendering mode based on container width and flow complexity:
 *
 *   Container Width:  0 ──── 480px ──── 640px ──── 900px ──── ...
 *                     │       │         │         │
 *   Resolved Mode:  vertical compact  expanded   full
 *
 * Additional context-aware rules:
 * - When `parallelThreads` are present, vertical mode is skipped
 *   (it doesn't render threads) and compact is used instead
 * - When `pipelineConfig` is provided and no parallel threads exist,
 *   pipeline mode is selected at ≥ expanded threshold width
 *
 * ## FOR AGENT / LLM AUTHORS
 *
 * Auto mode is the RECOMMENDED default. Use it when you don't know the
 * exact container width or when the container is responsive. The multi-
 * breakpoint system handles all common layout scenarios automatically.
 *
 * Override breakpoints only when your layout has non-standard dimensions
 * (e.g., a sidebar that's always 300px → set compact threshold lower).
 *
 * @example Default auto mode (recommended)
 * ```tsx
 * <FlowProgress mode="auto" steps={steps} status="running" />
 * ```
 *
 * @example Custom breakpoints for narrow sidebar
 * ```tsx
 * <FlowProgress
 *   mode="auto"
 *   steps={steps}
 *   status="running"
 *   autoModeConfig={{ breakpoints: { compact: 320, expanded: 500, full: 800 } }}
 * />
 * ```
 * ═══════════════════════════════════════════════════════════════════════
 */
export interface AutoModeConfig {
  /**
   * Width breakpoints (in px) for mode transitions.
   *
   * - Below `compact` → vertical mode (or compact if parallel threads exist)
   * - Below `expanded` → compact mode
   * - Below `full` → expanded mode
   * - At or above `full` → full mode
   *
   * Defaults: { compact: 480, expanded: 640, full: 900 }
   */
  breakpoints?: {
    /** Width below which vertical mode is used. Default: 480. */
    compact?: number;
    /** Width below which compact mode is used. Default: 640. */
    expanded?: number;
    /** Width at or above which full mode is used. Default: 900. */
    full?: number;
  };
}

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
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * v0.3.0 ADDITION: `skippedColor` and `skippedTextColor`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * These were added alongside the 'skipped' status on FlowProgressStep.
 * They default to gray-500/gray-400 respectively if not provided, giving
 * skipped steps a visually distinct "dimmed" appearance that communicates
 * "this step exists but was intentionally not executed."
 *
 * Existing consumers that don't set these values get sensible defaults.
 * ═══════════════════════════════════════════════════════════════════════════
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
  /**
   * Color for skipped step (Tailwind bg class).
   * Defaults to 'bg-gray-500' if not provided. Skipped steps are
   * intentionally dimmer than completed steps to visually convey
   * "this was bypassed, not finished."
   */
  skippedColor: string;
  /** Text color for active step labels (Tailwind text class) */
  activeTextColor: string;
  /** Text color for completed step labels (Tailwind text class) */
  completedTextColor: string;
  /** Text color for error step labels (Tailwind text class) */
  errorTextColor: string;
  /** Text color for pending step labels (Tailwind text class) */
  pendingTextColor: string;
  /**
   * Text color for skipped step labels (Tailwind text class).
   * Defaults to 'text-gray-400'. Uses strikethrough styling
   * in addition to the color to reinforce the "skipped" semantics.
   */
  skippedTextColor: string;
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
    mode: 'full' | 'compact' | 'expanded' | 'pipeline';
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
 * - "auto"     → (RECOMMENDED) Smart 4-tier mode that adapts automatically.
 *                Uses vertical, compact, expanded, or full based on container
 *                width. Also detects parallel threads and pipeline config.
 * - "compact"  → 480–639px width. Parallel threads stack as mini rows.
 * - "expanded" → 640–899px. Each thread gets a bordered lane with step cards.
 * - "full"     → ≥ 900px. Full stepper lanes with numbered circles per thread.
 * - "vertical" → < 480px. Top-to-bottom timeline. No parallel thread support.
 * - "pipeline" → ≥ 640px. Deploy/CI-style. No parallel thread support.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export interface FlowProgressProps {
  /**
   * Visual mode. **"auto" is the recommended default.**
   *
   * - "auto": (Recommended) Dynamically selects the optimal mode based on
   *   container width using a 4-tier breakpoint system:
   *     < 480px → vertical | 480–639px → compact | 640–899px → expanded | ≥ 900px → full
   *   Also detects parallel threads (avoids vertical) and pipeline config
   *   (auto-selects pipeline). Configure thresholds via `autoModeConfig`.
   * - "full": Large numbered circles, phase labels, wide connectors, header.
   *   Best for wide containers (> 900px).
   * - "compact": Small status icons with inline text labels, thin connectors.
   *   Best for sidebars and narrow containers (480–639px).
   * - "expanded": Rectangular step cards with icon, label, and type.
   *   Best for medium containers (640–899px).
   * - "vertical": Top-to-bottom timeline with vertical connector rail.
   *   Best for mobile (< 480px) with abundant vertical space.
   * - "pipeline": Clean deploy/CI-style horizontal progress with large stage
   *   indicators. Best for deployment flows (≥ 640px width).
   */
  mode: 'full' | 'compact' | 'expanded' | 'auto' | 'vertical' | 'pipeline';
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
   * Configuration for "pipeline" mode appearance.
   * Controls stage size, numbering, duration display, and track style.
   * Only applies when `mode` is "pipeline".
   */
  pipelineConfig?: PipelineConfig;
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
  /**
   * Custom status vocabulary mapping.
   *
   * ═══════════════════════════════════════════════════════════════════════
   * RESILIENCY ENHANCEMENT — CUSTOM STATUS MAPPING (v0.3.0)
   * ═══════════════════════════════════════════════════════════════════════
   *
   * Many consumers use their own status vocabularies that don't match
   * bilko-flow's built-in statuses (pending/active/complete/error/skipped).
   * For example, a CI/CD system might use 'queued', 'building', 'deployed',
   * 'cancelled', 'timed_out'. Without statusMap, consumers are forced to
   * write an adapter layer that manually translates every status string
   * before passing steps to FlowProgress — boilerplate that discourages
   * adoption.
   *
   * `statusMap` is a Record<string, FlowProgressStep['status']> that maps
   * ANY custom status string to one of bilko-flow's built-in visual
   * treatments. The mapping happens inside FlowProgress BEFORE rendering,
   * so consumers can pass steps with their native status vocabulary and
   * the component handles the translation transparently.
   *
   * ## HOW IT WORKS
   *
   * When FlowProgress encounters a step whose `status` is NOT one of the
   * five built-in values, it looks up `statusMap[step.status]`:
   *   - If found → uses the mapped built-in status for visual treatment.
   *   - If NOT found → falls back to 'pending' (safe default).
   *
   * The ORIGINAL status string is preserved on the step object — only
   * the visual treatment is affected. Consumers reading step data still
   * see their original status values.
   *
   * ## FOR AGENT / LLM AUTHORS
   *
   * Pass statusMap when your step data uses non-standard status values:
   *
   * @example CI/CD status mapping
   * ```tsx
   * <FlowProgress
   *   mode="pipeline"
   *   steps={ciSteps} // steps have status: 'queued' | 'building' | 'deployed' | 'cancelled'
   *   statusMap={{
   *     queued: 'pending',
   *     building: 'active',
   *     deployed: 'complete',
   *     cancelled: 'skipped',
   *     timed_out: 'error',
   *   }}
   *   status="running"
   * />
   * ```
   *
   * @example SSE event status mapping
   * ```tsx
   * <FlowProgress
   *   mode="expanded"
   *   steps={sseSteps} // steps from server use 'in_progress', 'done', 'failed'
   *   statusMap={{
   *     in_progress: 'active',
   *     done: 'complete',
   *     failed: 'error',
   *     not_started: 'pending',
   *     bypassed: 'skipped',
   *   }}
   *   status="running"
   * />
   * ```
   * ═══════════════════════════════════════════════════════════════════════
   */
  statusMap?: Record<string, FlowProgressStep['status']>;
  /** Custom step renderer for External Integration Pattern */
  stepRenderer?: FlowProgressStepRenderer;
  /** Sliding window radius (default: 2) */
  radius?: number;
  /**
   * Legacy width breakpoint (in px) for auto mode.
   *
   * Maps to `autoModeConfig.breakpoints.compact` in the enhanced
   * multi-breakpoint system. When both `autoBreakpoint` and
   * `autoModeConfig.breakpoints.compact` are set, the `autoModeConfig`
   * value takes precedence.
   *
   * Default: 480.
   *
   * @deprecated Use `autoModeConfig` for granular multi-breakpoint control.
   */
  autoBreakpoint?: number;
  /**
   * Configuration for the enhanced multi-breakpoint auto-mode.
   *
   * Provides granular control over the 4-tier breakpoint system that
   * auto-mode uses to select the optimal rendering mode. See
   * `AutoModeConfig` for details.
   *
   * Only applies when `mode` is "auto".
   *
   * @example
   * ```tsx
   * <FlowProgress
   *   mode="auto"
   *   steps={steps}
   *   autoModeConfig={{ breakpoints: { compact: 400, expanded: 600, full: 1000 } }}
   * />
   * ```
   */
  autoModeConfig?: AutoModeConfig;
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
