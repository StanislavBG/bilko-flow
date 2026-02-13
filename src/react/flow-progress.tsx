/**
 * FlowProgress — THE first-class progress component.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AGENT / LLM USAGE GUIDE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This component visualizes workflow execution progress in five modes:
 * - "full": Large numbered circles, phase labels, wide connectors, header,
 *           progress track, completed/total counter
 * - "compact": Small status icons with inline text labels, thin connectors
 * - "expanded": Rectangular step cards with icon, label, type info
 * - "vertical": Top-to-bottom timeline with vertical connector rail, ideal
 *               for mobile screens and narrow containers
 * - "auto": Dynamically switches between vertical (narrow) and expanded (wide)
 *
 * ## SEQUENTIAL FLOWS
 * Pass `steps` prop with an array of FlowProgressStep objects.
 *
 * ## PARALLEL FLOWS (fork-join)
 * Pass `parallelThreads` prop with an array of ParallelThread objects.
 * Each thread has its own steps, status, and activity text. Up to 5
 * threads are rendered simultaneously (service protection). Completed
 * threads auto-collapse. See types.ts for ParallelThread interface.
 *
 * ## FEATURES
 * - Theme-first customization via FlowProgressTheme
 * - Type-aware coloring: step circles, connectors, icons by step type
 * - Sliding window: When step count > 2*radius+3, shows first, last,
 *   active ± radius, with interactive ellipsis for hidden ranges
 * - Adaptive labels: full/truncated/icon based on distance from active step
 * - Parallel thread lanes: fork/join indicators, collapsible threads
 * - Context Adapter Pattern: bridge external step data via adapter function
 * - External Integration Pattern: custom step renderers via stepRenderer prop
 *
 * Props-driven, no React context required. Uses Tailwind CSS utility classes
 * and lucide-react icons.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  Circle,
  Loader2,
  RotateCcw,
  AlertCircle,
  XCircle,
  MoreHorizontal,
  ChevronRight,
} from 'lucide-react';
import type { FlowProgressProps, FlowProgressStep, FlowProgressTheme } from './types';
import { mergeTheme } from './step-type-config';
import { ParallelThreadsSection } from './parallel-threads';
import { FlowProgressVertical } from './flow-progress-vertical';
import {
  DEFAULT_RADIUS,
  DEFAULT_AUTO_BREAKPOINT,
  needsWindow,
  resolveStepBg,
  resolveStepTextColor,
  resolveConnectorColor,
  getTypeIcon,
  statusDotClass,
  statusLabel,
  computeWindow,
  getLabelMode,
  truncateLabel,
} from './flow-progress-shared';
import type { WindowItem } from './flow-progress-shared';

/** Ellipsis dropdown for hidden steps */
function EllipsisDropdown({
  hiddenSteps,
  onStepClick,
  mode,
  theme,
}: {
  hiddenSteps: Array<{ index: number; step: FlowProgressStep }>;
  onStepClick?: (stepId: string) => void;
  mode: 'full' | 'compact';
  theme: FlowProgressTheme;
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
          className="absolute top-full mt-1 left-1/2 -translate-x-1/2 z-20 bg-gray-800 border border-gray-700 rounded-lg shadow-lg py-1 min-w-[140px] max-w-[220px] max-h-[200px] overflow-y-auto"
        >
          {hiddenSteps.map(({ index, step }) => {
            const dotColor = step.status === 'complete'
              ? resolveStepBg(step, theme)
              : step.status === 'error'
                ? theme.errorColor
                : theme.pendingColor;

            return (
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
                {step.type && (
                  <span className={`w-2 h-2 rounded-full ${dotColor} flex-shrink-0 ml-auto`} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Full mode: large stepper banner with type-aware theming */
function FullMode(props: FlowProgressProps & { resolvedTheme: FlowProgressTheme }) {
  const { steps, label, status, activity, onReset, onStepClick, stepRenderer, radius, parallelThreads, parallelConfig, onThreadToggle } = props;
  const theme = props.resolvedTheme;
  const windowRadius = radius ?? DEFAULT_RADIUS;

  const activeStep = steps.find(s => s.status === 'active');
  const activeIdx = steps.findIndex(s => s.status === 'active');
  const completedCount = steps.filter(s => s.status === 'complete').length;
  const sLabel = statusLabel(status, steps);

  const windowItems = useMemo(
    () => computeWindow(steps, windowRadius),
    [steps, windowRadius],
  );

  // Progress percentage
  const progressPct = steps.length > 0
    ? Math.round((completedCount / steps.length) * 100)
    : 0;

  // Build segmented progress bar data
  const segments = useMemo(() => {
    if (steps.length === 0) return [];
    return steps.map(step => ({
      color: resolveStepBg(step, theme),
      status: step.status,
    }));
  }, [steps, theme]);

  return (
    <div className="w-full max-w-full rounded-lg border border-gray-700 bg-gray-900 p-4 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4 min-w-0">
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <span
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusDotClass(status, theme)}`}
            data-testid="status-dot"
          />
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
      <div className="flex items-center justify-center gap-0 overflow-hidden">
        {windowItems.map((item, i) => {
          if (item.kind === 'ellipsis') {
            return (
              <React.Fragment key={`ellipsis-${i}`}>
                <div className="flex flex-col items-center">
                  <EllipsisDropdown
                    hiddenSteps={item.hiddenSteps}
                    onStepClick={onStepClick}
                    mode="full"
                    theme={theme}
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
          const bgColor = resolveStepBg(step, theme);
          const textColor = resolveStepTextColor(step, theme, labelMode === 'full-bold');

          // Custom step renderer
          if (stepRenderer) {
            const rendered = stepRenderer(step, {
              index,
              isActive: step.status === 'active',
              bgColor,
              textColor,
              mode: 'full',
            });
            if (rendered) {
              return (
                <React.Fragment key={step.id}>
                  {rendered}
                  {i < windowItems.length - 1 && (
                    <div
                      className={`
                        h-1 flex-1 min-w-[16px] max-w-[40px] rounded-full mx-1 mt-[-20px]
                        transition-colors duration-300
                        ${resolveConnectorColor(step, theme)}
                      `}
                    />
                  )}
                </React.Fragment>
              );
            }
          }

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
              {/* Step circle — type-aware coloring */}
              <button
                className="flex flex-col items-center group"
                onClick={() => onStepClick?.(step.id)}
                aria-label={`Step ${index + 1}: ${step.label}`}
              >
                <div
                  className={`
                    w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium
                    transition-all duration-300
                    ${bgColor} text-white
                    ${step.status === 'active'
                      ? `ring-4 ring-opacity-30 scale-110`
                      : ''
                    }
                  `}
                  style={step.status === 'active' ? {
                    boxShadow: `0 0 0 4px rgba(34, 197, 94, 0.3)`,
                  } : undefined}
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
                      ${textColor}
                    `}
                  >
                    {displayLabel}
                  </span>
                ) : (
                  <span className="mt-1.5 text-xs text-gray-600">{index + 1}</span>
                )}
              </button>

              {/* Connector bar — type-aware coloring */}
              {i < windowItems.length - 1 && (
                <div
                  className={`
                    h-1 flex-1 min-w-[16px] max-w-[40px] rounded-full mx-1 mt-[-20px]
                    transition-colors duration-300
                    ${resolveConnectorColor(step, theme)}
                  `}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Parallel threads section */}
      {parallelThreads && parallelThreads.length > 0 && (
        <ParallelThreadsSection
          threads={parallelThreads}
          config={parallelConfig}
          theme={theme}
          mode="full"
          onStepClick={onStepClick}
          onThreadToggle={onThreadToggle}
        />
      )}

      {/* Segmented progress track — each segment colored by step type */}
      <div className="mt-3 h-1.5 w-full bg-gray-700 rounded-full overflow-hidden flex" data-testid="progress-bar">
        {segments.map((seg, i) => (
          <div
            key={i}
            className={`
              h-full transition-all duration-500
              ${seg.status === 'pending' ? 'bg-gray-700' : seg.color}
              ${i === 0 ? 'rounded-l-full' : ''}
              ${i === segments.length - 1 ? 'rounded-r-full' : ''}
            `}
            style={{ width: `${100 / segments.length}%` }}
          />
        ))}
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

/** Compact mode: inline dot chain with type-aware theming */
function CompactMode(props: FlowProgressProps & { resolvedTheme: FlowProgressTheme }) {
  const { steps, activity, lastResult, onStepClick, stepRenderer, radius, parallelThreads, parallelConfig, onThreadToggle } = props;
  const theme = props.resolvedTheme;
  const windowRadius = radius ?? DEFAULT_RADIUS;

  const activeIdx = steps.findIndex(s => s.status === 'active');
  const completedCount = steps.filter(s => s.status === 'complete').length;

  const windowItems = useMemo(
    () => computeWindow(steps, windowRadius),
    [steps, windowRadius],
  );

  return (
    <div className="w-full max-w-full overflow-hidden">
      {/* Progress counter */}
      {steps.length > 0 && (
        <div className="flex items-center gap-2 mb-1" data-testid="progress-counter">
          <span className="text-xs text-gray-400">
            {completedCount} of {steps.length}
          </span>
          {/* Mini progress bar */}
          <div className="flex-1 h-0.5 bg-gray-700 rounded-full overflow-hidden max-w-[80px]">
            <div
              className={`h-full rounded-full transition-all duration-300 ${theme.completedColor}`}
              style={{ width: `${steps.length > 0 ? (completedCount / steps.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

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
                  theme={theme}
                />
                {i < windowItems.length - 1 && (
                  <div className="h-px w-4 flex-shrink-0 bg-gray-600" />
                )}
              </React.Fragment>
            );
          }

          const { step, index } = item;
          const labelMode = getLabelMode(index, activeIdx >= 0 ? activeIdx : 0);
          const bgColor = resolveStepBg(step, theme);
          const textColor = resolveStepTextColor(step, theme, labelMode === 'full-bold');

          // Custom step renderer
          if (stepRenderer) {
            const rendered = stepRenderer(step, {
              index,
              isActive: step.status === 'active',
              bgColor,
              textColor,
              mode: 'compact',
            });
            if (rendered) {
              return (
                <React.Fragment key={step.id}>
                  {rendered}
                  {i < windowItems.length - 1 && (
                    <div
                      className={`h-0.5 w-4 flex-shrink-0 ${resolveConnectorColor(step, theme)}`}
                    />
                  )}
                </React.Fragment>
              );
            }
          }

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

          // Type-aware icon for compact mode
          const typeIcon = step.type ? getTypeIcon(step.type) : null;

          return (
            <React.Fragment key={step.id}>
              <button
                className="flex items-center gap-1 group"
                onClick={() => onStepClick?.(step.id)}
              >
                {/* Status icon — type-aware in compact mode */}
                {step.status === 'complete' ? (
                  <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                ) : step.status === 'active' ? (
                  typeIcon ? (
                    <span className="text-blue-400 flex-shrink-0 animate-pulse">
                      {typeIcon}
                    </span>
                  ) : (
                    <Loader2 size={14} className="text-blue-400 animate-spin flex-shrink-0" />
                  )
                ) : step.status === 'error' ? (
                  <XCircle size={14} className="text-red-500 flex-shrink-0" />
                ) : typeIcon ? (
                  <span className="text-gray-500 flex-shrink-0">{typeIcon}</span>
                ) : (
                  <Circle size={14} className="text-gray-500 flex-shrink-0" />
                )}
                {/* Label */}
                {displayLabel !== null && (
                  <span
                    className={`text-xs whitespace-nowrap ${textColor}`}
                  >
                    {displayLabel}
                  </span>
                )}
              </button>

              {/* Connector line — type-aware color */}
              {i < windowItems.length - 1 && (
                <div
                  className={`
                    h-0.5 w-4 flex-shrink-0
                    ${resolveConnectorColor(step, theme)}
                  `}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Parallel threads section */}
      {parallelThreads && parallelThreads.length > 0 && (
        <ParallelThreadsSection
          threads={parallelThreads}
          config={parallelConfig}
          theme={theme}
          mode="compact"
          onStepClick={onStepClick}
          onThreadToggle={onThreadToggle}
        />
      )}

      {/* Enhanced activity text */}
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

/** Expanded mode: rectangular step cards that fill available space */
function ExpandedMode(props: FlowProgressProps & { resolvedTheme: FlowProgressTheme }) {
  const { steps, label, status, activity, onReset, onStepClick, stepRenderer, radius, parallelThreads, parallelConfig, onThreadToggle } = props;
  const theme = props.resolvedTheme;
  const windowRadius = radius ?? DEFAULT_RADIUS;

  const activeIdx = steps.findIndex(s => s.status === 'active');
  const completedCount = steps.filter(s => s.status === 'complete').length;
  const sLabel = statusLabel(status, steps);

  const windowItems = useMemo(
    () => computeWindow(steps, windowRadius),
    [steps, windowRadius],
  );

  // Progress percentage for the track bar
  const segments = useMemo(() => {
    if (steps.length === 0) return [];
    return steps.map(step => ({
      color: resolveStepBg(step, theme),
      status: step.status,
    }));
  }, [steps, theme]);

  return (
    <div className="w-full max-w-full rounded-lg border border-gray-700 bg-gray-900 p-4 overflow-hidden" data-testid="expanded-mode">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <span
            className={`w-2.5 h-2.5 rounded-full ${statusDotClass(status, theme)}`}
          />
          {label && (
            <span className="font-semibold text-white text-sm">{label}</span>
          )}
          <span className="text-gray-400 text-sm">{sLabel}</span>
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

      {/* Expanded step cards row */}
      <div className="flex items-stretch gap-0 w-full overflow-hidden" data-testid="expanded-step-cards">
        {windowItems.map((item, i) => {
          if (item.kind === 'ellipsis') {
            return (
              <React.Fragment key={`ellipsis-${i}`}>
                <div className="flex items-center">
                  <EllipsisDropdown
                    hiddenSteps={item.hiddenSteps}
                    onStepClick={onStepClick}
                    mode="full"
                    theme={theme}
                  />
                </div>
                {i < windowItems.length - 1 && (
                  <div className="flex items-center px-1 text-gray-600 flex-shrink-0">
                    <ChevronRight size={16} />
                  </div>
                )}
              </React.Fragment>
            );
          }

          const { step, index } = item;
          const bgColor = resolveStepBg(step, theme);
          const textColor = resolveStepTextColor(step, theme, step.status === 'active');
          const typeIcon = step.type ? getTypeIcon(step.type) : null;

          // Custom step renderer
          if (stepRenderer) {
            const rendered = stepRenderer(step, {
              index,
              isActive: step.status === 'active',
              bgColor,
              textColor,
              mode: 'expanded',
            });
            if (rendered) {
              return (
                <React.Fragment key={step.id}>
                  <div className="flex-1 min-w-0">{rendered}</div>
                  {i < windowItems.length - 1 && (
                    <div className="flex items-center px-1 text-gray-600 flex-shrink-0">
                      <ChevronRight size={16} />
                    </div>
                  )}
                </React.Fragment>
              );
            }
          }

          const isActive = step.status === 'active';

          return (
            <React.Fragment key={step.id}>
              {/* Step card */}
              <button
                className={`
                  flex-1 min-w-0 flex items-center gap-2.5 rounded-lg border px-3 py-2.5
                  transition-all duration-300 text-left
                  ${isActive
                    ? 'border-green-500/40 bg-gray-800 ring-1 ring-green-500/20'
                    : step.status === 'error'
                      ? 'border-red-500/30 bg-gray-800/60'
                      : step.status === 'complete'
                        ? 'border-gray-600 bg-gray-800/80'
                        : 'border-gray-700/50 bg-gray-800/40'
                  }
                `}
                onClick={() => onStepClick?.(step.id)}
                aria-label={`Step ${index + 1}: ${step.label}`}
              >
                {/* Status/type indicator */}
                <div
                  className={`
                    w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0
                    text-white text-sm font-medium
                    ${bgColor}
                    ${isActive ? 'animate-pulse' : ''}
                  `}
                >
                  {step.status === 'complete' ? (
                    <CheckCircle2 size={16} />
                  ) : step.status === 'error' ? (
                    <AlertCircle size={16} />
                  ) : typeIcon ? (
                    <span className="flex items-center justify-center">{typeIcon}</span>
                  ) : (
                    <span className="text-xs">{index + 1}</span>
                  )}
                </div>

                {/* Label + step number */}
                <div className="min-w-0 flex-1">
                  <div className={`text-sm truncate ${
                    isActive ? 'text-white font-medium' :
                    step.status === 'complete' ? 'text-gray-300' :
                    step.status === 'error' ? 'text-red-300' :
                    'text-gray-400'
                  }`}>
                    {step.label}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    Step {index + 1}{step.type ? ` \u00b7 ${step.type}` : ''}
                  </div>
                </div>
              </button>

              {/* Connector chevron */}
              {i < windowItems.length - 1 && (
                <div className="flex items-center px-1 text-gray-600 flex-shrink-0">
                  <ChevronRight size={16} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Parallel threads section */}
      {parallelThreads && parallelThreads.length > 0 && (
        <ParallelThreadsSection
          threads={parallelThreads}
          config={parallelConfig}
          theme={theme}
          mode="expanded"
          onStepClick={onStepClick}
          onThreadToggle={onThreadToggle}
        />
      )}

      {/* Segmented progress track */}
      <div className="mt-3 h-1.5 w-full bg-gray-700 rounded-full overflow-hidden flex" data-testid="progress-bar">
        {segments.map((seg, i) => (
          <div
            key={i}
            className={`
              h-full transition-all duration-500
              ${seg.status === 'pending' ? 'bg-gray-700' : seg.color}
              ${i === 0 ? 'rounded-l-full' : ''}
              ${i === segments.length - 1 ? 'rounded-r-full' : ''}
            `}
            style={{ width: `${100 / segments.length}%` }}
          />
        ))}
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

/**
 * FlowProgress — Multi-mode progress visualization with sliding window,
 * theme-first customization, and parallel thread support.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AGENT / LLM AUTHORING GUIDE — FlowProgress Component
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This is the MAIN progress component. It supports:
 *
 * ## VISUAL MODES (choose based on container width)
 * - "full": Large numbered circles, phase labels, wide connectors, header.
 *   Best for wide containers (> 900px).
 * - "compact": Small status icons with inline text labels, thin connectors.
 *   Best for narrow containers (< 480px, sidebars).
 * - "expanded": Rectangular step cards with icon, label, and type.
 *   Best for medium containers (480–900px).
 * - "vertical": Top-to-bottom timeline with vertical connector rail and
 *   expandable ellipsis. Best for mobile (< 480px) where vertical space
 *   is abundant.
 * - "auto": Dynamically selects "vertical" (narrow) or "expanded" (wide)
 *   based on container width. Use when container size is unknown.
 *
 * ## LINEAR FLOW (sequential steps only)
 * Pass `steps` array. Steps render left-to-right with sliding window
 * for long flows (> 2*radius+3 steps).
 *
 * ## PARALLEL FLOW (concurrent branches)
 * Pass `steps` (main chain) AND `parallelThreads` (concurrent branches).
 * Up to 5 threads rendered simultaneously (service protection).
 * Completed threads auto-collapse. See ParallelThread type for details.
 *
 * ## PATTERNS
 * - Context Adapter Pattern: `adaptSteps()` helper converts external data.
 * - External Integration Pattern: `stepRenderer` prop for custom rendering.
 * - Theme-First Customization: `mergeTheme()` for partial overrides.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * @example Linear flow
 * ```tsx
 * <FlowProgress
 *   mode="auto"
 *   steps={[
 *     { id: "1", label: "Discover", status: "complete", type: "http.search" },
 *     { id: "2", label: "Write", status: "active", type: "ai.generate-text" },
 *     { id: "3", label: "Publish", status: "pending", type: "social.post" },
 *   ]}
 *   label="Content Pipeline"
 *   status="running"
 *   activity="Writing article draft..."
 * />
 * ```
 *
 * @example Parallel flow with 3 threads
 * ```tsx
 * <FlowProgress
 *   mode="expanded"
 *   steps={[
 *     { id: "init", label: "Initialize", status: "complete" },
 *   ]}
 *   parallelThreads={[
 *     {
 *       id: "google", label: "Google Search", status: "running",
 *       steps: [
 *         { id: "g1", label: "Query", status: "complete", type: "http.search" },
 *         { id: "g2", label: "Parse", status: "active", type: "transform.map" },
 *       ],
 *     },
 *     {
 *       id: "bing", label: "Bing Search", status: "complete",
 *       steps: [
 *         { id: "b1", label: "Query", status: "complete", type: "http.search" },
 *         { id: "b2", label: "Parse", status: "complete", type: "transform.map" },
 *       ],
 *     },
 *     {
 *       id: "arxiv", label: "ArXiv Search", status: "running",
 *       steps: [
 *         { id: "a1", label: "Query", status: "active", type: "http.search" },
 *       ],
 *     },
 *   ]}
 *   parallelConfig={{ maxVisible: 5, autoCollapseCompleted: true }}
 *   status="running"
 *   label="Multi-Source Research"
 * />
 * ```
 */
export function FlowProgress(props: FlowProgressProps): React.JSX.Element {
  const { mode, className, theme, autoBreakpoint } = props;

  const resolvedTheme = useMemo(() => mergeTheme(theme), [theme]);

  // --- Auto mode: measure container width with ResizeObserver ---
  const containerRef = useRef<HTMLDivElement>(null);
  const [resolvedAutoMode, setResolvedAutoMode] = useState<'expanded' | 'compact'>('compact');

  useEffect(() => {
    if (mode !== 'auto') return;

    const el = containerRef.current;
    if (!el) return;

    const breakpoint = autoBreakpoint ?? DEFAULT_AUTO_BREAKPOINT;

    const update = () => {
      const width = el.getBoundingClientRect().width;
      setResolvedAutoMode(width >= breakpoint ? 'expanded' : 'compact');
    };

    // Initial measurement
    update();

    if (typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode, autoBreakpoint]);

  // Auto mode: narrow → vertical, wide → expanded
  const effectiveMode = mode === 'auto'
    ? (resolvedAutoMode === 'compact' ? 'vertical' : resolvedAutoMode)
    : mode;

  return (
    <div ref={containerRef} className={`max-w-full overflow-hidden ${className ?? ''}`} data-testid={mode === 'auto' ? 'auto-mode-container' : undefined}>
      {effectiveMode === 'vertical'
        ? <FlowProgressVertical
            steps={props.steps}
            label={props.label}
            status={props.status}
            activity={props.activity}
            lastResult={props.lastResult}
            onReset={props.onReset}
            onStepClick={props.onStepClick}
            theme={resolvedTheme}
            radius={props.radius}
          />
        : effectiveMode === 'full'
          ? <FullMode {...props} resolvedTheme={resolvedTheme} />
          : effectiveMode === 'expanded'
            ? <ExpandedMode {...props} resolvedTheme={resolvedTheme} />
            : <CompactMode {...props} resolvedTheme={resolvedTheme} />
      }
    </div>
  );
}

/**
 * adaptSteps — Context Adapter Pattern helper.
 *
 * Converts an array of external data to FlowProgressStep[] using
 * the provided adapter function. Use this when you have non-domain
 * step data that needs to render in FlowProgress.
 *
 * @example
 * ```tsx
 * const steps = adaptSteps(externalSteps, (ext, i) => ({
 *   id: ext.uid,
 *   label: ext.title,
 *   status: ext.done ? 'complete' : 'pending',
 *   type: ext.category,
 * }));
 * <FlowProgress mode="compact" steps={steps} />
 * ```
 */
FlowProgress.displayName = 'FlowProgress';

export function adaptSteps<T>(
  data: T[],
  adapter: (item: T, index: number) => FlowProgressStep,
): FlowProgressStep[] {
  return data.map(adapter);
}
