/**
 * StepNode — Single step indicator for timelines.
 *
 * Shows status icon, step name, and type badge. Used within
 * FlowTimeline for vertical step lists.
 */

import React from 'react';
import { CheckCircle2, Circle, Loader2, AlertCircle, SkipForward } from 'lucide-react';
import type { StepNodeProps, StepStatus } from './types';
import { getStepVisuals } from './step-type-config';

/** Status icon for a step */
function StatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'success':
      return <CheckCircle2 size={16} className="text-green-500 flex-shrink-0" />;
    case 'running':
      return <Loader2 size={16} className="text-blue-400 animate-spin flex-shrink-0" />;
    case 'error':
      return <AlertCircle size={16} className="text-red-500 flex-shrink-0" />;
    case 'skipped':
      return <SkipForward size={16} className="text-gray-500 flex-shrink-0" />;
    default:
      return <Circle size={16} className="text-gray-500 flex-shrink-0" />;
  }
}

/**
 * StepNode — A single step in a timeline list.
 *
 * @example
 * ```tsx
 * <StepNode
 *   step={step}
 *   status="running"
 *   isSelected={true}
 *   onClick={() => selectStep(step.id)}
 *   index={0}
 *   isLast={false}
 * />
 * ```
 */
export function StepNode({ step, status, isSelected, onClick, index, isLast }: StepNodeProps) {
  const visuals = getStepVisuals(step);

  return (
    <div className="relative">
      {/* Vertical connector line */}
      {!isLast && (
        <div
          className={`
            absolute left-[7px] top-[24px] w-px h-[calc(100%+8px)]
            ${status === 'success' ? 'bg-green-500/50' : 'bg-gray-700'}
          `}
        />
      )}

      <button
        onClick={onClick}
        className={`
          relative w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left
          transition-colors duration-150
          ${isSelected
            ? 'bg-gray-700/50 ring-1 ring-gray-600'
            : 'hover:bg-gray-800/50'
          }
        `}
      >
        <StatusIcon status={status} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`
                text-sm truncate
                ${status === 'running' ? 'text-white font-medium' : 'text-gray-300'}
              `}
            >
              {step.name}
            </span>
            <span
              className={`
                text-[10px] px-1.5 py-0.5 rounded-full ${visuals.bg} ${visuals.color}
                whitespace-nowrap flex-shrink-0
              `}
            >
              {visuals.shortLabel}
            </span>
          </div>
        </div>

        <span className="text-xs text-gray-500 flex-shrink-0">
          {index + 1}
        </span>
      </button>
    </div>
  );
}
