/**
 * Shared utilities for FlowProgress horizontal and vertical modes.
 *
 * Both flow-progress.tsx (horizontal modes) and flow-progress-vertical.tsx
 * (vertical mode) import from this module to avoid logic duplication.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * v0.3.0 CHANGES:
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. All color/icon resolution functions now handle 'skipped' status.
 *    Skipped steps get a distinct dimmed visual treatment with a
 *    SkipForward icon to clearly communicate "intentionally bypassed."
 *
 * 2. Added `resolveStepMeta()` — extracts well-known meta keys from the
 *    generic `meta: Record<string, unknown>` bag with proper type narrowing.
 *    This is the centralized place where the generic meta bag is converted
 *    into typed values for rendering. Renderers call this instead of
 *    doing their own type-narrowing.
 *
 * 3. Added `applyStatusMap()` — maps custom status strings to built-in
 *    statuses using the consumer-provided statusMap. This is called once
 *    at the top of FlowProgress before any rendering, so all downstream
 *    code sees normalized statuses.
 *
 * All changes are backwards-compatible. Existing consumers that don't use
 * 'skipped', `meta`, or `statusMap` see identical behavior.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import {
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  XCircle,
  Search,
  Globe,
  ArrowRightLeft,
  ShieldCheck,
  Monitor,
  MessageSquare,
  PlugZap,
  Brain,
  SkipForward,
} from 'lucide-react';
import type { FlowProgressProps, FlowProgressStep, FlowProgressTheme } from './types';

/** Default sliding window radius */
export const DEFAULT_RADIUS = 2;

/** Default breakpoint (px) for auto mode compact threshold (legacy, maps to breakpoints.compact) */
export const DEFAULT_AUTO_BREAKPOINT = 480;

/**
 * Default breakpoints for the enhanced multi-tier auto-mode.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MULTI-BREAKPOINT AUTO-MODE RESOLUTION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The enhanced auto-mode uses a 4-tier breakpoint system inspired by
 * research into how the top DAG visualization libraries handle layout
 * selection (see docs/dag-visualization-research.md):
 *
 *   Container Width:  0 ──── 480px ──── 640px ──── 900px ──── ...
 *                     │       │         │         │
 *   Resolved Mode:  vertical compact  expanded   full
 *
 * This mirrors patterns from:
 * - AntV G6: selects renderer (Canvas/SVG/WebGL) based on graph size
 * - Cytoscape.js: selects layout algorithm based on graph characteristics
 * - Graphviz: selects layout engine (dot/neato/fdp) based on graph type
 *
 * bilko-flow applies this concept at the RENDERING MODE level: selecting
 * the optimal visual representation based on available space and flow
 * complexity (step count, parallel threads, pipeline config).
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const DEFAULT_AUTO_BREAKPOINTS = {
  /** Below this width → vertical mode (mobile/narrow containers) */
  compact: 480,
  /** Below this width → compact mode (sidebars, medium-narrow) */
  expanded: 640,
  /** At or above this width → full mode (wide areas) */
  full: 900,
} as const;

/**
 * Resolve the effective display mode for auto-mode based on container
 * width and flow characteristics.
 *
 * This is a PURE FUNCTION with no side effects — it can be called from
 * tests, from the component, or from consumer code that needs to predict
 * which mode auto will select for given conditions.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RESOLUTION ALGORITHM
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 1. If `pipelineConfig` is provided AND no parallel threads AND width
 *    is sufficient → pipeline mode (explicit pipeline intent)
 *
 * 2. Width-based 4-tier selection:
 *    - < compact threshold  → vertical (or compact if parallel threads)
 *    - < expanded threshold → compact
 *    - < full threshold     → expanded
 *    - ≥ full threshold     → full
 *
 * The parallel-thread check in tier 1 ensures that vertical mode (which
 * does NOT render parallel threads) is never selected when threads exist.
 * This prevents data loss where the user has parallel execution but the
 * visualization silently drops it.
 * ═══════════════════════════════════════════════════════════════════════
 */
export function resolveAutoMode(
  containerWidth: number,
  options?: {
    hasParallelThreads?: boolean;
    hasPipelineConfig?: boolean;
    breakpoints?: {
      compact?: number;
      expanded?: number;
      full?: number;
    };
  },
): 'vertical' | 'compact' | 'expanded' | 'full' | 'pipeline' {
  const bp = {
    compact: options?.breakpoints?.compact ?? DEFAULT_AUTO_BREAKPOINTS.compact,
    expanded: options?.breakpoints?.expanded ?? DEFAULT_AUTO_BREAKPOINTS.expanded,
    full: options?.breakpoints?.full ?? DEFAULT_AUTO_BREAKPOINTS.full,
  };

  /*
   * Pipeline auto-detection: when pipelineConfig is explicitly provided
   * by the consumer, prefer pipeline mode at sufficient width. Pipeline
   * mode does NOT support parallel threads, so skip this when threads
   * exist — the consumer's parallel data takes priority over pipeline
   * styling preferences.
   */
  if (
    options?.hasPipelineConfig &&
    !options?.hasParallelThreads &&
    containerWidth >= bp.expanded
  ) {
    return 'pipeline';
  }

  // Tier 1: Narrow containers → vertical (mobile) or compact (if threads)
  if (containerWidth < bp.compact) {
    return options?.hasParallelThreads ? 'compact' : 'vertical';
  }

  // Tier 2: Medium-narrow → compact
  if (containerWidth < bp.expanded) {
    return 'compact';
  }

  // Tier 3: Medium-wide → expanded
  if (containerWidth < bp.full) {
    return 'expanded';
  }

  // Tier 4: Wide → full
  return 'full';
}

/** Threshold: sliding window activates when steps > 2*radius+3 */
export function needsWindow(count: number, radius: number): boolean {
  return count > 2 * radius + 3;
}

/**
 * Get the resolved background color for a step, considering theme and type.
 *
 * v0.3.0: Added 'skipped' case — returns `theme.skippedColor` (bg-gray-500
 * by default). Skipped steps do NOT use per-type colors because the "dim"
 * treatment should override type coloring to clearly communicate the step
 * was not executed. If you want type-colored skipped steps, override
 * `skippedColor` in your theme.
 */
export function resolveStepBg(
  step: FlowProgressStep,
  theme: FlowProgressTheme,
): string {
  switch (step.status) {
    case 'complete':
      return step.type && theme.stepColors[step.type]
        ? theme.stepColors[step.type]
        : theme.completedColor;
    case 'active':
      return step.type && theme.stepColors[step.type]
        ? theme.stepColors[step.type]
        : theme.activeColor;
    case 'error':
      return theme.errorColor;
    case 'skipped':
      return theme.skippedColor;
    default:
      return theme.pendingColor;
  }
}

/**
 * Get the text color for a step label from theme.
 *
 * v0.3.0: Added 'skipped' case — returns `theme.skippedTextColor` with
 * a `line-through` class appended. The strikethrough reinforces the
 * "skipped/bypassed" semantics visually even without reading the label.
 */
export function resolveStepTextColor(
  step: FlowProgressStep,
  theme: FlowProgressTheme,
  isBold: boolean,
): string {
  switch (step.status) {
    case 'active':
      return isBold ? 'text-white font-bold' : theme.activeTextColor + ' font-medium';
    case 'complete':
      return theme.completedTextColor;
    case 'error':
      return theme.errorTextColor;
    case 'skipped':
      return theme.skippedTextColor + ' line-through';
    default:
      return theme.pendingTextColor;
  }
}

/** Get connector bar color: uses step type color for completed steps */
export function resolveConnectorColor(
  step: FlowProgressStep,
  theme: FlowProgressTheme,
): string {
  if (step.status === 'complete') {
    return step.type && theme.stepColors[step.type]
      ? theme.stepColors[step.type]
      : theme.completedColor;
  }
  return theme.pendingColor;
}

/** Map step type string to a lucide-react icon for compact mode */
export function getTypeIcon(type?: string): React.ReactNode {
  switch (type) {
    case 'llm':
    case 'ai.summarize':
    case 'ai.generate-text':
    case 'ai.generate-text-local':
    case 'ai.summarize-local':
    case 'ai.embed-local':
      return React.createElement(Brain, { size: 14 });
    case 'ai.generate-image':
    case 'ai.generate-video':
      return React.createElement(Brain, { size: 14 });
    case 'transform':
    case 'transform.filter':
    case 'transform.map':
    case 'transform.reduce':
      return React.createElement(ArrowRightLeft, { size: 14 });
    case 'validate':
      return React.createElement(ShieldCheck, { size: 14 });
    case 'display':
    case 'notification.send':
      return React.createElement(Monitor, { size: 14 });
    case 'chat':
    case 'social.post':
      return React.createElement(MessageSquare, { size: 14 });
    case 'external-input':
    case 'http.search':
    case 'http.request':
      return React.createElement(Globe, { size: 14 });
    case 'user-input':
      return React.createElement(PlugZap, { size: 14 });
    default:
      return null;
  }
}

/** Status dot color for the header — uses theme */
export function statusDotClass(status: FlowProgressProps['status'], theme: FlowProgressTheme): string {
  switch (status) {
    case 'running':
      return `${theme.activeColor} animate-pulse`;
    case 'complete':
      return theme.completedColor;
    case 'error':
      return theme.errorColor;
    default:
      return 'bg-gray-400';
  }
}

/** Human-readable status label */
export function statusLabel(status: FlowProgressProps['status'], steps: FlowProgressStep[]): string {
  switch (status) {
    case 'running': {
      const active = steps.find(s => s.status === 'active');
      return active ? active.label : 'Running';
    }
    case 'complete':
      return 'Done';
    case 'error':
      return 'Error';
    default:
      return 'Idle';
  }
}

/** Visible item in the windowed step list */
export type WindowItem =
  | { kind: 'step'; index: number; step: FlowProgressStep }
  | { kind: 'ellipsis'; hiddenSteps: Array<{ index: number; step: FlowProgressStep }> };

/**
 * Compute the sliding window over steps.
 * Always shows: first, last, active ± radius.
 * Gaps become ellipsis markers containing the hidden steps.
 */
export function computeWindow(
  steps: FlowProgressStep[],
  radius: number,
): WindowItem[] {
  if (!needsWindow(steps.length, radius)) {
    return steps.map((step, index) => ({ kind: 'step', index, step }));
  }

  const activeIdx = steps.findIndex(s => s.status === 'active');
  const center = activeIdx >= 0 ? activeIdx : 0;

  // Build set of visible indices
  const visible = new Set<number>();
  visible.add(0);
  visible.add(steps.length - 1);
  for (let i = Math.max(0, center - radius); i <= Math.min(steps.length - 1, center + radius); i++) {
    visible.add(i);
  }

  const sortedVisible = Array.from(visible).sort((a, b) => a - b);
  const items: WindowItem[] = [];

  let prevIdx = -1;
  for (const idx of sortedVisible) {
    // If there's a gap, insert ellipsis
    if (prevIdx >= 0 && idx > prevIdx + 1) {
      const hidden: Array<{ index: number; step: FlowProgressStep }> = [];
      for (let h = prevIdx + 1; h < idx; h++) {
        hidden.push({ index: h, step: steps[h] });
      }
      items.push({ kind: 'ellipsis', hiddenSteps: hidden });
    }
    items.push({ kind: 'step', index: idx, step: steps[idx] });
    prevIdx = idx;
  }

  return items;
}

/** Label display mode based on distance from active step */
export type LabelMode = 'full-bold' | 'full' | 'truncated' | 'number-only';

export function getLabelMode(stepIndex: number, activeIndex: number): LabelMode {
  const dist = Math.abs(stepIndex - activeIndex);
  if (dist === 0) return 'full-bold';
  if (dist === 1) return 'full';
  if (dist === 2) return 'truncated';
  return 'number-only';
}

/** Truncate label to maxLen characters */
export function truncateLabel(label: string, maxLen: number): string {
  if (label.length <= maxLen) return label;
  return label.slice(0, maxLen - 1) + '\u2026';
}

// ═══════════════════════════════════════════════════════════════════════════
// v0.3.0 ADDITIONS: Meta extraction, status mapping, skipped icon
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolved meta values extracted from the generic `meta` bag.
 *
 * This is the output of `resolveStepMeta()` — it type-narrows the
 * well-known keys from `Record<string, unknown>` into properly typed
 * values. Renderers use this instead of doing their own type-checking
 * on every render call.
 *
 * Fields are undefined if the meta key is missing or has the wrong type.
 * This means renderers can safely do `if (resolved.message)` without
 * worrying about type errors.
 */
export interface ResolvedStepMeta {
  /** Per-step status message text. Rendered beneath the step label. */
  message: string | undefined;
  /** 0–1 fractional progress. Rendered as a mini progress bar. */
  progress: number | undefined;
  /** MIME type of payload (e.g. "audio/mpeg", "text/plain"). */
  mediaType: string | undefined;
  /** URI reference to streamed/produced content. */
  mediaUri: string | undefined;
  /** Why a step was skipped. Shown as tooltip or subtitle on skipped steps. */
  skipReason: string | undefined;
  /** Error detail text for error steps (supplements status='error'). */
  error: string | undefined;
}

/**
 * Extract well-known meta values from the generic `meta` bag with
 * proper type narrowing.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WHY THIS FUNCTION EXISTS
 * ═══════════════════════════════════════════════════════════════════════
 *
 * The `meta` bag on FlowProgressStep is `Record<string, unknown>` —
 * intentionally untyped to allow agents to put ANYTHING in there.
 * But the renderers need typed access to well-known keys without
 * scattering `typeof meta?.message === 'string'` checks across
 * every render function in every mode.
 *
 * This function is the SINGLE place where type narrowing happens.
 * It's called once per step per render cycle, and the result is
 * passed to the rendering code as a typed object.
 *
 * Unknown keys in `meta` are intentionally NOT extracted here —
 * they're left in the original `meta` bag for consumer access.
 * This function only handles keys that the BUILT-IN renderers
 * know how to display.
 * ═══════════════════════════════════════════════════════════════════════
 */
export function resolveStepMeta(meta?: Record<string, unknown>): ResolvedStepMeta {
  if (!meta) {
    return {
      message: undefined,
      progress: undefined,
      mediaType: undefined,
      mediaUri: undefined,
      skipReason: undefined,
      error: undefined,
    };
  }

  return {
    message: typeof meta.message === 'string' && meta.message.length > 0
      ? meta.message
      : undefined,
    progress: typeof meta.progress === 'number' && meta.progress >= 0 && meta.progress <= 1
      ? meta.progress
      : undefined,
    mediaType: typeof meta.mediaType === 'string' && meta.mediaType.length > 0
      ? meta.mediaType
      : undefined,
    mediaUri: typeof meta.mediaUri === 'string' && meta.mediaUri.length > 0
      ? meta.mediaUri
      : undefined,
    skipReason: typeof meta.skipReason === 'string' && meta.skipReason.length > 0
      ? meta.skipReason
      : undefined,
    error: typeof meta.error === 'string' && meta.error.length > 0
      ? meta.error
      : undefined,
  };
}

/**
 * Apply a consumer-provided status map to normalize custom status strings
 * to bilko-flow's built-in status values.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WHY THIS FUNCTION EXISTS
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Many consumers use their own status vocabularies: 'queued', 'building',
 * 'deployed', 'cancelled', 'timed_out', 'in_progress', 'done', etc.
 * Without status mapping, consumers must write a manual adapter that
 * translates every status before passing steps to FlowProgress.
 *
 * `applyStatusMap` is called ONCE at the top of FlowProgress.render()
 * before any mode-specific rendering. It returns a new array of steps
 * with normalized statuses. The original step objects are NOT mutated.
 *
 * If a step's status is already a valid built-in value, it passes through
 * unchanged regardless of whether a statusMap is provided. Only non-
 * standard statuses are looked up in the map.
 *
 * If a non-standard status is NOT found in the map, it falls back to
 * 'pending' (the safest default — shows the step as "not started" rather
 * than incorrectly marking it as completed or errored).
 * ═══════════════════════════════════════════════════════════════════════
 *
 * @param steps    — The consumer-provided step array (may have custom statuses).
 * @param statusMap — Optional map from custom status → built-in status.
 * @returns A new array with normalized statuses (never mutates input).
 */
export function applyStatusMap(
  steps: FlowProgressStep[],
  statusMap?: Record<string, FlowProgressStep['status']>,
): FlowProgressStep[] {
  /*
   * FAST PATH: If no statusMap is provided, return the original array
   * reference. This avoids unnecessary array allocation on every render
   * for consumers who don't use custom statuses.
   */
  if (!statusMap) return steps;

  /*
   * BUILT-IN statuses that should NEVER be remapped, even if they
   * happen to appear as keys in the statusMap. This prevents accidental
   * "double mapping" where a consumer's statusMap has { complete: 'error' }
   * which would break standard steps.
   */
  const BUILT_IN_STATUSES = new Set<string>([
    'pending', 'active', 'complete', 'error', 'skipped',
  ]);

  return steps.map(step => {
    /*
     * If the step's status is already a valid built-in value, pass
     * it through unchanged. We cast to string because TypeScript's
     * union type narrowing doesn't help with Set.has().
     */
    if (BUILT_IN_STATUSES.has(step.status as string)) {
      return step;
    }

    /*
     * Look up the custom status in the consumer's map.
     * Fall back to 'pending' if the status is unknown — this is the
     * safest default because it shows the step as "not yet started"
     * rather than incorrectly marking it as completed or errored.
     */
    const mapped = statusMap[step.status as string] ?? 'pending';

    /*
     * Return a shallow copy with the normalized status. The original
     * step object is NOT mutated, preserving React's immutability
     * expectations and allowing consumers to still read the original
     * status from their own state.
     */
    return { ...step, status: mapped };
  });
}

/**
 * Get the status icon for a step, including the new 'skipped' status.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WHY THIS IS CENTRALIZED HERE
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Before v0.3.0, every render mode (full, compact, expanded, vertical,
 * pipeline, parallel-threads) had its own inline icon selection logic
 * with duplicated switch/if chains. Adding 'skipped' to each would
 * require touching 6+ locations and is error-prone.
 *
 * This function centralizes status→icon mapping so that adding future
 * statuses requires a change in exactly ONE place.
 *
 * Note: This returns the ICON element, not the icon component. The
 * `size` parameter controls the icon dimensions. The caller is
 * responsible for wrapping in any animation containers (e.g. for
 * active step pulse/spin).
 * ═══════════════════════════════════════════════════════════════════════
 */
export function getStatusIcon(
  status: FlowProgressStep['status'],
  size: number,
  typeIcon?: React.ReactNode,
): React.ReactNode {
  switch (status) {
    case 'complete':
      return React.createElement(CheckCircle2, { size, className: 'text-green-500' });
    case 'active':
      /*
       * Active steps prefer a type-specific icon (if available) with
       * a pulse animation. If no type icon, fall back to the spinning
       * Loader2. The caller wraps the type icon in an animate-pulse
       * container — this function just returns the icon element.
       */
      return typeIcon ?? React.createElement(Loader2, {
        size,
        className: 'text-blue-400 animate-spin',
      });
    case 'error':
      return React.createElement(XCircle, { size, className: 'text-red-500' });
    case 'skipped':
      /*
       * SkipForward icon in gray — visually distinct from both pending
       * (empty circle) and complete (check) to clearly communicate
       * "this step was intentionally bypassed."
       */
      return React.createElement(SkipForward, { size, className: 'text-gray-400' });
    default:
      return typeIcon ?? React.createElement(Circle, { size, className: 'text-gray-500' });
  }
}
