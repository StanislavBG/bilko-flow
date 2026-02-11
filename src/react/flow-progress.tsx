/**
 * FlowProgress — THE first-class progress component.
 *
 * Renders in two visual modes controlled by the `mode` prop:
 * - "full": Large numbered circles, phase labels, wide connectors, header,
 *           progress track, completed/total counter
 * - "compact": Small status icons with inline text labels, thin connectors
 *
 * Features:
 * - Sliding window: When step count > 2*radius+3, shows first, last,
 *   active ± radius, with interactive ellipsis for hidden ranges
 * - Adaptive labels: full/truncated/icon based on distance from active step
 * - Interactive ellipsis: click to open dropdown of hidden steps
 *
 * Props-driven, no React context required. Uses Tailwind CSS utility classes
 * and lucide-react icons.
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  CheckCircle2,
  Circle,
  Loader2,
  RotateCcw,
  AlertCircle,
  XCircle,
  MoreHorizontal,
} from 'lucide-react';
import type { FlowProgressProps, FlowProgressStep } from './types';

/** Default sliding window radius */
const DEFAULT_RADIUS = 2;

/** Threshold: sliding window activates when steps > 2*radius+3 */
function needsWindow(count: number, radius: number): boolean {
  return count > 2 * radius + 3;
}

/** Status dot color for the header */
function statusDotClass(status: FlowProgressProps['status']): string {
  switch (status) {
    case 'running':
      return 'bg-green-500 animate-pulse';
    case 'complete':
      return 'bg-green-500';
    case 'error':
      return 'bg-red-500';
    default:
      return 'bg-gray-400';
  }
}

/** Human-readable status label */
function statusLabel(status: FlowProgressProps['status'], steps: FlowProgressStep[]): string {
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
type WindowItem =
  | { kind: 'step'; index: number; step: FlowProgressStep }
  | { kind: 'ellipsis'; hiddenSteps: Array<{ index: number; step: FlowProgressStep }> };

/**
 * Compute the sliding window over steps.
 * Always shows: first, last, active ± radius.
 * Gaps become ellipsis markers containing the hidden steps.
 */
function computeWindow(
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
type LabelMode = 'full-bold' | 'full' | 'truncated' | 'number-only';

function getLabelMode(stepIndex: number, activeIndex: number): LabelMode {
  const dist = Math.abs(stepIndex - activeIndex);
  if (dist === 0) return 'full-bold';
  if (dist === 1) return 'full';
  if (dist === 2) return 'truncated';
  return 'number-only';
}

/** Truncate label to maxLen characters */
function truncateLabel(label: string, maxLen: number): string {
  if (label.length <= maxLen) return label;
  return label.slice(0, maxLen - 1) + '\u2026';
}

/** Ellipsis dropdown for hidden steps */
function EllipsisDropdown({
  hiddenSteps,
  onStepClick,
  mode,
}: {
  hiddenSteps: Array<{ index: number; step: FlowProgressStep }>;
  onStepClick?: (stepId: string) => void;
  mode: 'full' | 'compact';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const isFullMode = mode === 'full';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`
          flex items-center justify-center rounded-full border-2 border-dashed border-gray-600
          text-gray-400 hover:text-white hover:border-gray-400 transition-colors
          ${isFullMode ? 'w-9 h-9' : 'w-5 h-5'}
        `}
        aria-label={`Show ${hiddenSteps.length} hidden steps`}
      >
        <MoreHorizontal size={isFullMode ? 16 : 10} />
      </button>

      {open && (
        <div
          className="absolute top-full mt-1 left-1/2 -translate-x-1/2 z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-lg py-1 min-w-[160px] max-h-[200px] overflow-y-auto"
        >
          {hiddenSteps.map(({ index, step }) => (
            <button
              key={step.id}
              onClick={() => {
                onStepClick?.(step.id);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-700 transition-colors text-left"
            >
              <span className="text-gray-500 text-xs w-5 text-right flex-shrink-0">{index + 1}</span>
              {step.status === 'complete' ? (
                <CheckCircle2 size={12} className="text-green-500 flex-shrink-0" />
              ) : step.status === 'error' ? (
                <XCircle size={12} className="text-red-500 flex-shrink-0" />
              ) : (
                <Circle size={12} className="text-gray-500 flex-shrink-0" />
              )}
              <span className="text-gray-300 truncate">{step.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Full mode: large stepper banner */
function FullMode(props: FlowProgressProps) {
  const { steps, label, status, activity, onReset, onStepClick } = props;

  const activeStep = steps.find(s => s.status === 'active');
  const activeIdx = steps.findIndex(s => s.status === 'active');
  const completedCount = steps.filter(s => s.status === 'complete').length;
  const sLabel = statusLabel(status, steps);

  const windowItems = useMemo(
    () => computeWindow(steps, DEFAULT_RADIUS),
    [steps],
  );

  // Progress percentage
  const progressPct = steps.length > 0
    ? Math.round((completedCount / steps.length) * 100)
    : 0;

  return (
    <div className="w-full rounded-lg border border-gray-700 bg-gray-900 p-4">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${statusDotClass(status)}`} />
          {label && (
            <span className="font-semibold text-white text-sm">{label}</span>
          )}
          <span className="text-gray-400 text-sm">
            {sLabel}
            {activeStep && status === 'running' ? ` \u00b7 ${activeStep.label}` : ''}
          </span>
          <span className="text-gray-500 text-xs ml-1">
            {completedCount}/{steps.length}
          </span>
        </div>
        {onReset && (
          <button
            onClick={onReset}
            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
            aria-label="Reset flow"
          >
            <RotateCcw size={16} />
          </button>
        )}
      </div>

      {/* Stepper row */}
      <div className="flex items-center justify-center gap-0">
        {windowItems.map((item, i) => {
          if (item.kind === 'ellipsis') {
            return (
              <React.Fragment key={`ellipsis-${i}`}>
                <div className="flex flex-col items-center">
                  <EllipsisDropdown
                    hiddenSteps={item.hiddenSteps}
                    onStepClick={onStepClick}
                    mode="full"
                  />
                </div>
                {i < windowItems.length - 1 && (
                  <div className="h-1 flex-1 min-w-[16px] max-w-[40px] rounded-full mx-1 mt-0 bg-gray-700" />
                )}
              </React.Fragment>
            );
          }

          const { step, index } = item;
          const labelMode = getLabelMode(index, activeIdx >= 0 ? activeIdx : 0);

          let displayLabel: string;
          switch (labelMode) {
            case 'full-bold':
            case 'full':
              displayLabel = step.label;
              break;
            case 'truncated':
              displayLabel = truncateLabel(step.label, 10);
              break;
            case 'number-only':
              displayLabel = '';
              break;
          }

          return (
            <React.Fragment key={step.id}>
              {/* Step circle */}
              <button
                className="flex flex-col items-center group"
                onClick={() => onStepClick?.(step.id)}
                aria-label={`Step ${index + 1}: ${step.label}`}
              >
                <div
                  className={`
                    w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium
                    transition-all duration-300
                    ${step.status === 'complete'
                      ? 'bg-green-500 text-white'
                      : step.status === 'active'
                        ? 'bg-green-500 text-white ring-4 ring-green-500/30 scale-110'
                        : step.status === 'error'
                          ? 'bg-red-500 text-white'
                          : 'bg-gray-700 text-gray-400'
                    }
                  `}
                >
                  {step.status === 'complete' ? (
                    <CheckCircle2 size={18} />
                  ) : step.status === 'error' ? (
                    <AlertCircle size={18} />
                  ) : (
                    index + 1
                  )}
                </div>
                {displayLabel ? (
                  <span
                    className={`
                      mt-1.5 text-xs text-center max-w-[80px] truncate
                      ${labelMode === 'full-bold'
                        ? 'text-green-400 font-bold'
                        : step.status === 'active'
                          ? 'text-green-400 font-medium'
                          : step.status === 'complete'
                            ? 'text-gray-300'
                            : 'text-gray-500'
                      }
                    `}
                  >
                    {displayLabel}
                  </span>
                ) : (
                  <span className="mt-1.5 text-xs text-gray-600">{index + 1}</span>
                )}
              </button>

              {/* Connector bar */}
              {i < windowItems.length - 1 && (
                <div
                  className={`
                    h-1 flex-1 min-w-[16px] max-w-[40px] rounded-full mx-1 mt-[-20px]
                    transition-colors duration-300
                    ${step.status === 'complete' ? 'bg-green-500' : 'bg-gray-700'}
                  `}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Progress track */}
      <div className="mt-3 h-1 w-full bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Activity text */}
      {activity && (
        <p className="mt-2 text-xs text-gray-400 text-center truncate">
          {activity}
        </p>
      )}
    </div>
  );
}

/** Compact mode: inline dot chain */
function CompactMode(props: FlowProgressProps) {
  const { steps, activity, lastResult, onStepClick } = props;

  const activeIdx = steps.findIndex(s => s.status === 'active');

  const windowItems = useMemo(
    () => computeWindow(steps, DEFAULT_RADIUS),
    [steps],
  );

  return (
    <div className="w-full">
      {/* Step chain */}
      <div className="flex flex-wrap items-center gap-1">
        {windowItems.map((item, i) => {
          if (item.kind === 'ellipsis') {
            return (
              <React.Fragment key={`ellipsis-${i}`}>
                <EllipsisDropdown
                  hiddenSteps={item.hiddenSteps}
                  onStepClick={onStepClick}
                  mode="compact"
                />
                {i < windowItems.length - 1 && (
                  <div className="h-px w-4 flex-shrink-0 bg-gray-600" />
                )}
              </React.Fragment>
            );
          }

          const { step, index } = item;
          const labelMode = getLabelMode(index, activeIdx >= 0 ? activeIdx : 0);

          let displayLabel: string | null;
          switch (labelMode) {
            case 'full-bold':
            case 'full':
              displayLabel = step.label;
              break;
            case 'truncated':
              displayLabel = truncateLabel(step.label, 10);
              break;
            case 'number-only':
              displayLabel = null;
              break;
          }

          return (
            <React.Fragment key={step.id}>
              <button
                className="flex items-center gap-1 group"
                onClick={() => onStepClick?.(step.id)}
              >
                {/* Status icon */}
                {step.status === 'complete' ? (
                  <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                ) : step.status === 'active' ? (
                  <Loader2 size={14} className="text-blue-400 animate-spin flex-shrink-0" />
                ) : step.status === 'error' ? (
                  <XCircle size={14} className="text-red-500 flex-shrink-0" />
                ) : (
                  <Circle size={14} className="text-gray-500 flex-shrink-0" />
                )}
                {/* Label */}
                {displayLabel !== null && (
                  <span
                    className={`
                      text-xs whitespace-nowrap
                      ${labelMode === 'full-bold'
                        ? 'text-white font-bold'
                        : step.status === 'active'
                          ? 'text-white font-bold'
                          : step.status === 'complete'
                            ? 'text-gray-300'
                            : 'text-gray-500'
                      }
                    `}
                  >
                    {displayLabel}
                  </span>
                )}
              </button>

              {/* Connector line */}
              {i < windowItems.length - 1 && (
                <div
                  className={`
                    h-px w-4 flex-shrink-0
                    ${step.status === 'complete' ? 'bg-green-500' : 'bg-gray-600'}
                  `}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Activity text */}
      {activity && (
        <p className="mt-1 text-xs text-gray-400 truncate">
          {activity}
        </p>
      )}

      {/* Last result */}
      {lastResult && (
        <p className="mt-0.5 text-xs text-green-400 truncate">
          {lastResult}
        </p>
      )}
    </div>
  );
}

/**
 * FlowProgress — Dual-mode progress visualization with sliding window.
 *
 * @example
 * ```tsx
 * <FlowProgress
 *   mode="full"
 *   steps={[
 *     { id: "1", label: "Discover", status: "complete" },
 *     { id: "2", label: "Write", status: "active" },
 *     { id: "3", label: "Publish", status: "pending" },
 *   ]}
 *   label="Content Pipeline"
 *   status="running"
 *   activity="Writing article draft..."
 *   onStepClick={(id) => console.log("Step clicked:", id)}
 * />
 * ```
 */
export function FlowProgress(props: FlowProgressProps) {
  const { mode, className } = props;

  return (
    <div className={className}>
      {mode === 'full' ? <FullMode {...props} /> : <CompactMode {...props} />}
    </div>
  );
}
