/**
 * FlowProgress — THE first-class progress component.
 *
 * Renders in two visual modes controlled by the `mode` prop:
 * - "full": Large numbered circles, phase labels, wide connectors, header
 * - "compact": Small dots with phase labels inline, thin connectors
 *
 * Props-driven, no React context required. Uses Tailwind CSS utility classes
 * and lucide-react icons.
 */

import React, { useMemo } from 'react';
import { CheckCircle2, Circle, Loader2, RotateCcw, AlertCircle } from 'lucide-react';
import type { FlowProgressProps, FlowProgressPhase } from './types';

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
function statusLabel(status: FlowProgressProps['status'], phases: FlowProgressPhase[]): string {
  switch (status) {
    case 'running': {
      const active = phases.find(p => p.status === 'active');
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

/** Full mode: large stepper banner */
function FullMode({
  phases,
  label,
  status,
  activity,
  onReset,
}: FlowProgressProps) {
  const activePhase = phases.find(p => p.status === 'active');
  const sLabel = statusLabel(status, phases);

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
            {activePhase && status === 'running' ? ` \u00b7 ${activePhase.label}` : ''}
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
        {phases.map((phase, i) => (
          <React.Fragment key={phase.id}>
            {/* Step circle */}
            <div className="flex flex-col items-center">
              <div
                className={`
                  w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium
                  transition-all duration-300
                  ${phase.status === 'complete'
                    ? 'bg-green-500 text-white'
                    : phase.status === 'active'
                      ? 'bg-green-500 text-white ring-4 ring-green-500/30 scale-110'
                      : phase.status === 'error'
                        ? 'bg-red-500 text-white'
                        : 'bg-gray-700 text-gray-400'
                  }
                `}
              >
                {phase.status === 'complete' ? (
                  <CheckCircle2 size={18} />
                ) : phase.status === 'error' ? (
                  <AlertCircle size={18} />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`
                  mt-1.5 text-xs text-center max-w-[80px] truncate
                  ${phase.status === 'active'
                    ? 'text-green-400 font-medium'
                    : phase.status === 'complete'
                      ? 'text-gray-300'
                      : 'text-gray-500'
                  }
                `}
              >
                {phase.label}
              </span>
            </div>

            {/* Connector bar */}
            {i < phases.length - 1 && (
              <div
                className={`
                  h-1 flex-1 min-w-[24px] max-w-[60px] rounded-full mx-1 mt-[-20px]
                  transition-colors duration-300
                  ${phase.status === 'complete' ? 'bg-green-500' : 'bg-gray-700'}
                `}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Activity text */}
      {activity && (
        <p className="mt-3 text-xs text-gray-400 text-center truncate">
          {activity}
        </p>
      )}
    </div>
  );
}

/** Compact mode: inline dot chain */
function CompactMode({
  phases,
  activity,
  lastResult,
}: FlowProgressProps) {
  return (
    <div className="w-full">
      {/* Step chain */}
      <div className="flex flex-wrap items-center gap-1">
        {phases.map((phase, i) => (
          <React.Fragment key={phase.id}>
            <div className="flex items-center gap-1">
              {/* Status icon */}
              {phase.status === 'complete' ? (
                <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
              ) : phase.status === 'active' ? (
                <Loader2 size={14} className="text-blue-400 animate-spin flex-shrink-0" />
              ) : phase.status === 'error' ? (
                <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
              ) : (
                <Circle size={14} className="text-gray-500 flex-shrink-0" />
              )}
              {/* Label */}
              <span
                className={`
                  text-xs whitespace-nowrap
                  ${phase.status === 'active'
                    ? 'text-white font-bold'
                    : phase.status === 'complete'
                      ? 'text-gray-300'
                      : 'text-gray-500'
                  }
                `}
              >
                {phase.label}
              </span>
            </div>

            {/* Connector line */}
            {i < phases.length - 1 && (
              <div
                className={`
                  h-px w-4 flex-shrink-0
                  ${phase.status === 'complete' ? 'bg-green-500' : 'bg-gray-600'}
                `}
              />
            )}
          </React.Fragment>
        ))}
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
 * FlowProgress — Dual-mode progress visualization component.
 *
 * @example
 * ```tsx
 * <FlowProgress
 *   mode="full"
 *   phases={[
 *     { id: "1", label: "Discover", status: "complete" },
 *     { id: "2", label: "Write", status: "active" },
 *     { id: "3", label: "Publish", status: "pending" },
 *   ]}
 *   label="Content Pipeline"
 *   status="running"
 *   activity="Writing article draft..."
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
