/**
 * ParallelThreads — Visual renderer for parallel execution branches.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AGENT / LLM AUTHORING GUIDE — Parallel Thread Visualization
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This module provides the visual components for rendering parallel
 * execution threads within FlowProgress. When a workflow forks into
 * multiple concurrent branches, these components display:
 *
 * 1. A FORK INDICATOR — visual marker showing where execution splits
 * 2. THREAD LANES — stacked rows, each showing one thread's step chain
 * 3. A JOIN INDICATOR — visual marker showing where threads reconverge
 * 4. OVERFLOW INDICATOR — "+N more" when threads exceed maxVisible (5)
 *
 * ## HOW TO USE (for agents building flows)
 *
 * Pass `parallelThreads` to FlowProgress. Each ParallelThread has:
 * - `id`: unique string identifier
 * - `label`: human-readable name (e.g. "Google Search", "Bing Search")
 * - `status`: 'pending' | 'running' | 'complete' | 'error'
 * - `steps`: FlowProgressStep[] — the steps in this thread's chain
 * - `activity?`: optional current activity text for this thread
 *
 * ## SERVICE PROTECTION
 *
 * Hard limit: 5 threads rendered simultaneously. This is enforced by
 * MAX_PARALLEL_THREADS. Values of `parallelConfig.maxVisible` above 5
 * are clamped. Threads beyond the limit appear as overflow count.
 *
 * ## COLLAPSE BEHAVIOR
 *
 * - Completed threads can be collapsed (minimized) to a single summary line.
 * - Auto-collapse: when `parallelConfig.autoCollapseCompleted` is true
 *   (default), completed threads collapse after `autoCollapseDelayMs` (2s).
 * - Manual toggle: users click the chevron to expand/collapse any thread.
 * - Error threads are NEVER auto-collapsed (always visible for debugging).
 *
 * ## VISUAL MODES
 *
 * The thread rendering adapts to the parent FlowProgress mode:
 * - "full" / "expanded": Bordered lanes with step cards, fork/join lines
 * - "compact": Minimal stacked rows with dot chains
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  GitFork,
  GitMerge,
  Brain,
  Globe,
  ArrowRightLeft,
  ShieldCheck,
  Monitor,
  MessageSquare,
  PlugZap,
} from 'lucide-react';
import type {
  ParallelThread,
  ParallelConfig,
  FlowProgressStep,
  FlowProgressTheme,
} from './types';

// ─────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────

/**
 * Hard maximum number of parallel threads rendered simultaneously.
 *
 * This is a service protection limit. Rendering more than 5 concurrent
 * thread lanes degrades UX and performance. Values above this are clamped.
 *
 * Threads beyond this limit are shown as an overflow count indicator
 * (e.g. "+3 more threads").
 */
export const MAX_PARALLEL_THREADS = 5;

/** Default auto-collapse delay for completed threads (ms). */
const DEFAULT_AUTO_COLLAPSE_DELAY_MS = 2000;

// ─────────────────────────────────────────────────────────────────────────
// Thread status colors
// ─────────────────────────────────────────────────────────────────────────

/** Thread lane border color by status */
function threadBorderColor(status: ParallelThread['status']): string {
  switch (status) {
    case 'running':
      return 'border-blue-500/50';
    case 'complete':
      return 'border-green-500/30';
    case 'error':
      return 'border-red-500/40';
    default:
      return 'border-gray-700/50';
  }
}

/** Thread status badge styles */
function threadStatusBadge(status: ParallelThread['status']): {
  bg: string;
  text: string;
  icon: React.ReactNode;
} {
  switch (status) {
    case 'running':
      return {
        bg: 'bg-blue-500/20',
        text: 'text-blue-400',
        icon: <Loader2 size={12} className="animate-spin" />,
      };
    case 'complete':
      return {
        bg: 'bg-green-500/20',
        text: 'text-green-400',
        icon: <CheckCircle2 size={12} />,
      };
    case 'error':
      return {
        bg: 'bg-red-500/20',
        text: 'text-red-400',
        icon: <AlertCircle size={12} />,
      };
    default:
      return {
        bg: 'bg-gray-700/30',
        text: 'text-gray-500',
        icon: <Circle size={12} />,
      };
  }
}

/** Map step type string to a lucide-react icon */
function getTypeIcon(type?: string): React.ReactNode {
  switch (type) {
    case 'llm':
    case 'ai.summarize':
    case 'ai.generate-text':
    case 'ai.generate-text-local':
    case 'ai.summarize-local':
    case 'ai.embed-local':
    case 'ai.generate-image':
    case 'ai.generate-video':
      return <Brain size={12} />;
    case 'transform':
    case 'transform.filter':
    case 'transform.map':
    case 'transform.reduce':
      return <ArrowRightLeft size={12} />;
    case 'validate':
      return <ShieldCheck size={12} />;
    case 'display':
    case 'notification.send':
      return <Monitor size={12} />;
    case 'chat':
    case 'social.post':
      return <MessageSquare size={12} />;
    case 'external-input':
    case 'http.search':
    case 'http.request':
      return <Globe size={12} />;
    case 'user-input':
      return <PlugZap size={12} />;
    default:
      return null;
  }
}

/** Get step background color from theme */
function resolveStepBg(
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
    default:
      return theme.pendingColor;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// ForkJoinIndicator
// ─────────────────────────────────────────────────────────────────────────

/**
 * Visual fork or join indicator.
 * Shows an icon with a label and vertical connector lines.
 */
function ForkJoinIndicator({
  type,
  threadCount,
  mode,
}: {
  type: 'fork' | 'join';
  threadCount: number;
  mode: 'full' | 'compact' | 'expanded';
}) {
  const isCompact = mode === 'compact';
  const Icon = type === 'fork' ? GitFork : GitMerge;

  return (
    <div
      className={`
        flex items-center gap-1.5 py-1
        ${isCompact ? 'px-0' : 'px-2'}
      `}
      data-testid={`parallel-${type}`}
    >
      <div
        className={`
          flex items-center justify-center rounded-full
          bg-gray-700 text-gray-400
          ${isCompact ? 'w-5 h-5' : 'w-6 h-6'}
        `}
      >
        <Icon size={isCompact ? 12 : 14} />
      </div>
      {!isCompact && (
        <span className="text-xs text-gray-500">
          {type === 'fork'
            ? `${threadCount} thread${threadCount !== 1 ? 's' : ''}`
            : 'join'}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// CompactThreadRow — minimal thread representation for compact mode
// ─────────────────────────────────────────────────────────────────────────

function CompactThreadRow({
  thread,
  collapsed,
  onToggle,
  theme,
  onStepClick,
}: {
  thread: ParallelThread;
  collapsed: boolean;
  onToggle: () => void;
  theme: FlowProgressTheme;
  onStepClick?: (stepId: string) => void;
}) {
  const badge = threadStatusBadge(thread.status);
  const completedCount = thread.steps.filter(s => s.status === 'complete').length;

  return (
    <div
      className={`
        border-l-2 pl-2 py-0.5 transition-all duration-200
        ${threadBorderColor(thread.status)}
      `}
      data-testid={`thread-row-${thread.id}`}
    >
      {/* Thread header (always visible) */}
      <button
        className="flex items-center gap-1.5 w-full text-left group"
        onClick={onToggle}
        aria-label={`${collapsed ? 'Expand' : 'Collapse'} thread: ${thread.label}`}
        aria-expanded={!collapsed}
      >
        {collapsed
          ? <ChevronRight size={12} className="text-gray-500 flex-shrink-0" />
          : <ChevronDown size={12} className="text-gray-500 flex-shrink-0" />
        }
        <span className={`${badge.text} flex-shrink-0`}>{badge.icon}</span>
        <span className="text-xs text-gray-300 truncate">{thread.label}</span>
        <span className="text-xs text-gray-600 flex-shrink-0 ml-auto">
          {completedCount}/{thread.steps.length}
        </span>
      </button>

      {/* Step chain (when expanded) */}
      {!collapsed && (
        <div className="flex flex-wrap items-center gap-0.5 mt-1 ml-4">
          {thread.steps.map((step, i) => (
            <React.Fragment key={step.id}>
              <button
                className="flex items-center gap-0.5 group"
                onClick={() => onStepClick?.(step.id)}
              >
                {step.status === 'complete' ? (
                  <CheckCircle2 size={10} className="text-green-500 flex-shrink-0" />
                ) : step.status === 'active' ? (
                  <Loader2 size={10} className="text-blue-400 animate-spin flex-shrink-0" />
                ) : step.status === 'error' ? (
                  <XCircle size={10} className="text-red-500 flex-shrink-0" />
                ) : (
                  <Circle size={10} className="text-gray-500 flex-shrink-0" />
                )}
                <span className="text-[10px] text-gray-400 whitespace-nowrap">
                  {step.label}
                </span>
              </button>
              {i < thread.steps.length - 1 && (
                <div className="h-px w-2 flex-shrink-0 bg-gray-600" />
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Thread activity/error text */}
      {!collapsed && thread.activity && (
        <p className="text-[10px] text-gray-500 truncate ml-4 mt-0.5">
          {thread.activity}
        </p>
      )}
      {!collapsed && thread.error && (
        <p className="text-[10px] text-red-400 truncate ml-4 mt-0.5">
          {thread.error}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ExpandedThreadRow — full thread lane for full/expanded modes
// ─────────────────────────────────────────────────────────────────────────

function ExpandedThreadRow({
  thread,
  collapsed,
  onToggle,
  theme,
  onStepClick,
  mode,
}: {
  thread: ParallelThread;
  collapsed: boolean;
  onToggle: () => void;
  theme: FlowProgressTheme;
  onStepClick?: (stepId: string) => void;
  mode: 'full' | 'expanded';
}) {
  const badge = threadStatusBadge(thread.status);
  const completedCount = thread.steps.filter(s => s.status === 'complete').length;
  const isFull = mode === 'full';

  return (
    <div
      className={`
        border rounded-lg transition-all duration-300 overflow-hidden
        ${threadBorderColor(thread.status)}
        ${thread.status === 'running' ? 'bg-gray-800/60' : 'bg-gray-800/30'}
      `}
      data-testid={`thread-row-${thread.id}`}
    >
      {/* Thread header */}
      <button
        className={`
          flex items-center gap-2 w-full text-left
          ${isFull ? 'px-3 py-2' : 'px-2.5 py-1.5'}
          hover:bg-gray-700/30 transition-colors
        `}
        onClick={onToggle}
        aria-label={`${collapsed ? 'Expand' : 'Collapse'} thread: ${thread.label}`}
        aria-expanded={!collapsed}
      >
        {collapsed
          ? <ChevronRight size={14} className="text-gray-500 flex-shrink-0" />
          : <ChevronDown size={14} className="text-gray-500 flex-shrink-0" />
        }
        <span className={`${badge.text} flex-shrink-0`}>{badge.icon}</span>
        <span className={`text-sm text-gray-200 truncate ${thread.status === 'running' ? 'font-medium' : ''}`}>
          {thread.label}
        </span>
        <span className="text-xs text-gray-500 flex-shrink-0 ml-auto">
          {completedCount}/{thread.steps.length}
        </span>
        {/* Mini progress bar in header */}
        <div className="w-12 h-1 bg-gray-700 rounded-full overflow-hidden flex-shrink-0">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              thread.status === 'error' ? theme.errorColor : theme.completedColor
            }`}
            style={{
              width: `${thread.steps.length > 0 ? (completedCount / thread.steps.length) * 100 : 0}%`,
            }}
          />
        </div>
      </button>

      {/* Expanded step cards */}
      {!collapsed && (
        <div className={`${isFull ? 'px-3 pb-2.5' : 'px-2.5 pb-2'}`}>
          <div className={`flex items-center gap-0 overflow-x-auto ${isFull ? 'pt-1' : 'pt-0.5'}`}>
            {thread.steps.map((step, i) => {
              const bgColor = resolveStepBg(step, theme);
              const typeIcon = step.type ? getTypeIcon(step.type) : null;
              const isActive = step.status === 'active';

              return (
                <React.Fragment key={step.id}>
                  <button
                    className={`
                      flex items-center gap-1.5 rounded-md border px-2 py-1 min-w-0
                      transition-all duration-200 text-left flex-shrink-0
                      ${isActive
                        ? 'border-blue-500/40 bg-gray-700/60'
                        : step.status === 'error'
                          ? 'border-red-500/30 bg-gray-700/30'
                          : step.status === 'complete'
                            ? 'border-gray-600/50 bg-gray-700/40'
                            : 'border-gray-700/30 bg-gray-800/30'
                      }
                    `}
                    onClick={() => onStepClick?.(step.id)}
                    aria-label={`Thread ${thread.label}, Step: ${step.label}`}
                  >
                    <div
                      className={`
                        w-5 h-5 rounded flex items-center justify-center flex-shrink-0
                        text-white text-[10px]
                        ${bgColor}
                        ${isActive ? 'animate-pulse' : ''}
                      `}
                    >
                      {step.status === 'complete' ? (
                        <CheckCircle2 size={12} />
                      ) : step.status === 'error' ? (
                        <AlertCircle size={12} />
                      ) : typeIcon ? (
                        typeIcon
                      ) : (
                        <span>{i + 1}</span>
                      )}
                    </div>
                    <span className={`text-xs truncate max-w-[80px] ${
                      isActive ? 'text-white font-medium' :
                      step.status === 'complete' ? 'text-gray-400' :
                      step.status === 'error' ? 'text-red-300' :
                      'text-gray-500'
                    }`}>
                      {step.label}
                    </span>
                  </button>

                  {/* Connector */}
                  {i < thread.steps.length - 1 && (
                    <div className="flex items-center px-0.5 text-gray-600 flex-shrink-0">
                      <ChevronRight size={12} />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Thread activity/error text */}
          {thread.activity && (
            <p className="text-xs text-gray-500 truncate mt-1">
              {thread.activity}
            </p>
          )}
          {thread.error && (
            <p className="text-xs text-red-400 truncate mt-1">
              {thread.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// OverflowIndicator — shows count of hidden threads
// ─────────────────────────────────────────────────────────────────────────

function OverflowIndicator({
  count,
  mode,
}: {
  count: number;
  mode: 'full' | 'compact' | 'expanded';
}) {
  const isCompact = mode === 'compact';

  return (
    <div
      className={`
        flex items-center gap-1.5 text-gray-500
        ${isCompact ? 'pl-2 py-0.5' : 'px-3 py-1.5'}
        border-l-2 border-dashed border-gray-700/50
      `}
      data-testid="parallel-overflow"
    >
      <span className={`${isCompact ? 'text-[10px]' : 'text-xs'}`}>
        +{count} more thread{count !== 1 ? 's' : ''}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ParallelThreadsSection — Main exported component
// ─────────────────────────────────────────────────────────────────────────

/**
 * Props for the ParallelThreadsSection component.
 */
export interface ParallelThreadsSectionProps {
  /** Parallel threads to render. */
  threads: ParallelThread[];
  /** Parallel configuration (maxVisible, autoCollapse, etc.). */
  config?: ParallelConfig;
  /** Resolved theme from FlowProgress parent. */
  theme: FlowProgressTheme;
  /** Visual mode inherited from FlowProgress parent. */
  mode: 'full' | 'compact' | 'expanded';
  /** Step click handler (passed through). */
  onStepClick?: (stepId: string) => void;
  /** Thread toggle handler (expand/collapse). */
  onThreadToggle?: (threadId: string, collapsed: boolean) => void;
}

/**
 * ParallelThreadsSection — Renders parallel execution threads.
 *
 * This component is used internally by FlowProgress to render the
 * fork/thread/join section when `parallelThreads` is provided.
 *
 * ## LLM USAGE NOTE
 *
 * You do NOT use this component directly. Instead, pass `parallelThreads`
 * to FlowProgress and this component is rendered automatically.
 *
 * @example (internal usage by FlowProgress)
 * ```tsx
 * <ParallelThreadsSection
 *   threads={parallelThreads}
 *   config={parallelConfig}
 *   theme={resolvedTheme}
 *   mode="expanded"
 *   onStepClick={onStepClick}
 *   onThreadToggle={onThreadToggle}
 * />
 * ```
 */
export function ParallelThreadsSection({
  threads,
  config,
  theme,
  mode,
  onStepClick,
  onThreadToggle,
}: ParallelThreadsSectionProps) {
  // Clamp maxVisible to MAX_PARALLEL_THREADS
  const maxVisible = Math.min(
    config?.maxVisible ?? MAX_PARALLEL_THREADS,
    MAX_PARALLEL_THREADS,
  );
  const autoCollapse = config?.autoCollapseCompleted ?? true;
  const autoCollapseDelay = config?.autoCollapseDelayMs ?? DEFAULT_AUTO_COLLAPSE_DELAY_MS;

  // Track collapsed state per thread
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({});

  // Auto-collapse completed threads
  useEffect(() => {
    if (!autoCollapse) return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    for (const thread of threads) {
      // Auto-collapse completed threads that aren't already collapsed
      // Never auto-collapse error threads
      if (thread.status === 'complete' && !collapsedMap[thread.id]) {
        const timer = setTimeout(() => {
          setCollapsedMap(prev => {
            if (prev[thread.id]) return prev; // already collapsed
            const next = { ...prev, [thread.id]: true };
            onThreadToggle?.(thread.id, true);
            return next;
          });
        }, autoCollapseDelay);
        timers.push(timer);
      }
    }

    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [threads, autoCollapse, autoCollapseDelay, collapsedMap, onThreadToggle]);

  const handleToggle = useCallback(
    (threadId: string) => {
      setCollapsedMap(prev => {
        const newState = !prev[threadId];
        onThreadToggle?.(threadId, newState);
        return { ...prev, [threadId]: newState };
      });
    },
    [onThreadToggle],
  );

  // Split into visible and overflow
  const visibleThreads = threads.slice(0, maxVisible);
  const overflowCount = Math.max(0, threads.length - maxVisible);

  const isCompact = mode === 'compact';

  // Aggregate stats for the parallel section
  const totalSteps = threads.reduce((acc, t) => acc + t.steps.length, 0);
  const completedSteps = threads.reduce(
    (acc, t) => acc + t.steps.filter(s => s.status === 'complete').length,
    0,
  );
  const allComplete = threads.every(t => t.status === 'complete');
  const anyError = threads.some(t => t.status === 'error');
  const anyRunning = threads.some(t => t.status === 'running');

  return (
    <div
      className={`${isCompact ? 'mt-1.5' : 'mt-2'}`}
      data-testid="parallel-section"
    >
      {/* Fork indicator */}
      <ForkJoinIndicator type="fork" threadCount={threads.length} mode={mode} />

      {/* Thread lanes */}
      <div
        className={`
          flex flex-col
          ${isCompact ? 'gap-1 ml-2' : 'gap-1.5 ml-3'}
        `}
        data-testid="parallel-thread-lanes"
      >
        {visibleThreads.map(thread => (
          isCompact ? (
            <CompactThreadRow
              key={thread.id}
              thread={thread}
              collapsed={!!collapsedMap[thread.id]}
              onToggle={() => handleToggle(thread.id)}
              theme={theme}
              onStepClick={onStepClick}
            />
          ) : (
            <ExpandedThreadRow
              key={thread.id}
              thread={thread}
              collapsed={!!collapsedMap[thread.id]}
              onToggle={() => handleToggle(thread.id)}
              theme={theme}
              onStepClick={onStepClick}
              mode={mode as 'full' | 'expanded'}
            />
          )
        ))}

        {/* Overflow indicator */}
        {overflowCount > 0 && (
          <OverflowIndicator count={overflowCount} mode={mode} />
        )}
      </div>

      {/* Join indicator (only shown when all threads complete or there's an error) */}
      {(allComplete || anyError) && (
        <ForkJoinIndicator type="join" threadCount={threads.length} mode={mode} />
      )}

      {/* Aggregate parallel progress summary */}
      {!isCompact && anyRunning && (
        <div className="flex items-center gap-2 mt-1 px-2">
          <span className="text-[10px] text-gray-500">
            Parallel: {completedSteps}/{totalSteps} steps across {threads.length} threads
          </span>
        </div>
      )}
    </div>
  );
}
