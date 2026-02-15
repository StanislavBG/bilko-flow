/**
 * FlowProgressVertical — Vertical timeline mode for mobile / narrow containers.
 *
 * Renders flow steps top-to-bottom with a vertical connector rail.
 * Uses the same sliding window algorithm as the horizontal modes:
 * first, last, and active ± radius steps are always shown; gaps
 * become expandable ellipsis rows.
 *
 * Designed for containers < 480px wide where vertical space is abundant.
 */

import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  XCircle,
  MoreVertical,
  RotateCcw,
} from 'lucide-react';
import type { FlowProgressStep, FlowProgressTheme } from './types';
import {
  DEFAULT_RADIUS,
  resolveStepBg,
  resolveConnectorColor,
  getTypeIcon,
  statusDotClass,
  statusLabel,
  computeWindow,
  resolveStepMeta,
  getStatusIcon,
} from './flow-progress-shared';

/** Props for the vertical progress component */
export interface FlowProgressVerticalProps {
  steps: FlowProgressStep[];
  label?: string;
  status?: 'idle' | 'running' | 'complete' | 'error';
  activity?: string;
  lastResult?: string;
  onReset?: () => void;
  onStepClick?: (stepId: string) => void;
  theme: FlowProgressTheme;
  radius?: number;
}

export function FlowProgressVertical(props: FlowProgressVerticalProps) {
  const { steps, label, status, activity, lastResult, onReset, onStepClick, theme, radius } = props;
  const windowRadius = radius ?? DEFAULT_RADIUS;

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

  // Segmented progress bar
  const segments = useMemo(() => {
    if (steps.length === 0) return [];
    return steps.map(step => ({
      color: resolveStepBg(step, theme),
      status: step.status,
    }));
  }, [steps, theme]);

  return (
    <div className="w-full max-w-full rounded-lg border border-gray-700 bg-gray-900 p-4 overflow-hidden" data-testid="vertical-mode">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <span
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusDotClass(status, theme)}`}
          />
          {label && (
            <span className="font-semibold text-white text-sm">{label}</span>
          )}
          <span className="text-gray-400 text-sm">{sLabel}</span>
          {steps.length > 0 && (
            <span className="text-gray-500 text-xs ml-1">
              {completedCount}/{steps.length}
            </span>
          )}
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

      {/* Segmented progress bar */}
      {segments.length > 0 && (
        <div className="mb-4 h-1.5 w-full bg-gray-700 rounded-full overflow-hidden flex" data-testid="progress-bar">
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
      )}

      {/* Vertical step timeline */}
      <div className="relative" data-testid="vertical-timeline">
        {windowItems.map((item, i) => {
          if (item.kind === 'ellipsis') {
            return (
              <VerticalEllipsis
                key={`ellipsis-${i}`}
                hiddenSteps={item.hiddenSteps}
                onStepClick={onStepClick}
                theme={theme}
                isLast={i === windowItems.length - 1}
              />
            );
          }

          const { step, index } = item;
          const isActive = step.status === 'active';
          const isLast = i === windowItems.length - 1;
          const connectorColor = resolveConnectorColor(step, theme);
          const typeIcon = step.type ? getTypeIcon(step.type) : null;
          const typeDotColor = step.type && theme.stepColors[step.type]
            ? theme.stepColors[step.type]
            : undefined;

          return (
            <div key={step.id} className="flex gap-3 relative" data-testid={`vertical-step-${step.id}`}>
              {/* Rail column: icon + connector */}
              <div className="flex flex-col items-center flex-shrink-0" style={{ width: '1.5rem' }}>
                {/* Status icon — v0.3.0: handles 'skipped' with SkipForward icon */}
                <div className="flex items-center justify-center w-full h-6 z-10">
                  {step.status === 'complete' ? (
                    <CheckCircle2 size={18} className="text-green-500" />
                  ) : step.status === 'active' ? (
                    typeIcon ? (
                      <span className="text-blue-400 animate-pulse">{typeIcon}</span>
                    ) : (
                      <Loader2 size={18} className="text-blue-400 animate-spin" />
                    )
                  ) : step.status === 'error' ? (
                    <XCircle size={18} className="text-red-500" />
                  ) : step.status === 'skipped' ? (
                    getStatusIcon('skipped', 18)
                  ) : (
                    <Circle size={18} className="text-gray-500" />
                  )}
                </div>
                {/* Vertical connector line */}
                {!isLast && (
                  <div
                    className={`w-0.5 flex-1 min-h-[16px] ${connectorColor}`}
                  />
                )}
              </div>

              {/* Content column */}
              <button
                className={`
                  flex-1 min-w-0 text-left rounded-lg px-3 py-2 mb-1 transition-all duration-200
                  ${isActive
                    ? 'bg-gray-800/80 ring-1 ring-green-500/20'
                    : 'hover:bg-gray-800/40'
                  }
                `}
                onClick={() => onStepClick?.(step.id)}
                aria-label={`Step ${index + 1}: ${step.label}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-sm truncate ${
                    isActive ? 'text-white font-medium' :
                    step.status === 'complete' ? 'text-gray-300' :
                    step.status === 'error' ? 'text-red-300' :
                    step.status === 'skipped' ? 'text-gray-400 line-through' :
                    'text-gray-400'
                  }`}>
                    {step.label}
                  </span>
                  {typeDotColor && (
                    <span className={`w-2 h-2 rounded-full ${typeDotColor} flex-shrink-0 ml-auto`} />
                  )}
                </div>
                {/*
                 * v0.3.0: Render meta.message beneath the step label in vertical mode.
                 * Shows message for any status, skipReason for skipped, error for error.
                 * Activity text is still shown on active steps (below meta.message).
                 */}
                {(() => {
                  const resolved = resolveStepMeta(step.meta);
                  const displayText = resolved.message
                    ?? (step.status === 'skipped' ? resolved.skipReason : undefined)
                    ?? (step.status === 'error' ? resolved.error : undefined);
                  if (!displayText) return null;
                  return (
                    <p className={`mt-0.5 text-xs truncate ${
                      step.status === 'error' ? 'text-red-400' :
                      step.status === 'skipped' ? 'text-gray-500 italic' :
                      'text-gray-400'
                    }`}>
                      {displayText}
                    </p>
                  );
                })()}
                {/* Activity text on active step */}
                {isActive && activity && (
                  <p className="mt-1 text-xs text-gray-400 truncate">{activity}</p>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Last result */}
      {lastResult && (
        <p className="mt-2 text-xs text-green-400 truncate">
          {lastResult}
        </p>
      )}
    </div>
  );
}

FlowProgressVertical.displayName = 'FlowProgressVertical';

/** Expandable ellipsis row for hidden steps in vertical mode */
function VerticalEllipsis({
  hiddenSteps,
  onStepClick,
  theme,
  isLast,
}: {
  hiddenSteps: Array<{ index: number; step: FlowProgressStep }>;
  onStepClick?: (stepId: string) => void;
  theme: FlowProgressTheme;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  if (expanded) {
    return (
      <>
        {hiddenSteps.map((hs, hi) => {
          const { step, index } = hs;
          const isActive = step.status === 'active';
          const connectorColor = resolveConnectorColor(step, theme);
          const typeDotColor = step.type && theme.stepColors[step.type]
            ? theme.stepColors[step.type]
            : undefined;
          const showConnector = !(isLast && hi === hiddenSteps.length - 1);

          return (
            <div key={step.id} className="flex gap-3 relative" data-testid={`vertical-step-${step.id}`}>
              <div className="flex flex-col items-center flex-shrink-0 w-6">
                <div className="flex items-center justify-center w-6 h-6 z-10">
                  {step.status === 'complete' ? (
                    <CheckCircle2 size={18} className="text-green-500" />
                  ) : step.status === 'active' ? (
                    <Loader2 size={18} className="text-blue-400 animate-spin" />
                  ) : step.status === 'error' ? (
                    <XCircle size={18} className="text-red-500" />
                  ) : (
                    <Circle size={18} className="text-gray-500" />
                  )}
                </div>
                {showConnector && (
                  <div className={`w-0.5 flex-1 min-h-[16px] ${connectorColor}`} />
                )}
              </div>
              <button
                className="flex-1 min-w-0 text-left rounded-lg px-3 py-2 mb-1 hover:bg-gray-800/40 transition-all duration-200"
                onClick={() => onStepClick?.(step.id)}
                aria-label={`Step ${index + 1}: ${step.label}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-sm truncate ${
                    step.status === 'complete' ? 'text-gray-300' :
                    step.status === 'error' ? 'text-red-300' :
                    'text-gray-400'
                  }`}>
                    {step.label}
                  </span>
                  {typeDotColor && (
                    <span className={`w-2 h-2 rounded-full ${typeDotColor} flex-shrink-0 ml-auto`} />
                  )}
                </div>
              </button>
            </div>
          );
        })}
        {/* Collapse button */}
        <div className="flex gap-3 relative">
          <div className="flex flex-col items-center flex-shrink-0 w-6">
            <button
              onClick={() => setExpanded(false)}
              className="flex items-center justify-center w-6 h-6 text-gray-500 hover:text-gray-300 transition-colors"
              aria-label="Collapse steps"
            >
              <MoreVertical size={14} />
            </button>
            {!isLast && (
              <div className="w-0.5 flex-1 min-h-[8px] bg-gray-700" />
            )}
          </div>
          <button
            onClick={() => setExpanded(false)}
            className="flex-1 text-left px-3 py-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Collapse
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="flex gap-3 relative">
      <div className="flex flex-col items-center flex-shrink-0 w-6">
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center justify-center w-6 h-6 text-gray-500 hover:text-gray-300 transition-colors"
          aria-label={`Show ${hiddenSteps.length} hidden steps`}
        >
          <MoreVertical size={14} />
        </button>
        {!isLast && (
          <div className="w-0.5 flex-1 min-h-[8px] bg-gray-700" />
        )}
      </div>
      <button
        onClick={() => setExpanded(true)}
        className="flex-1 text-left px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        aria-label={`Show ${hiddenSteps.length} hidden steps`}
      >
        {hiddenSteps.length} more step{hiddenSteps.length !== 1 ? 's' : ''}
      </button>
    </div>
  );
}
