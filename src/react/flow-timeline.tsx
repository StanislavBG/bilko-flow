/**
 * FlowTimeline — Vertical step list sidebar.
 *
 * Shows all steps in execution order with status indicators,
 * supporting step selection for detail inspection.
 */

import React from 'react';
import type { FlowTimelineProps, StepStatus } from './types';
import { StepNode } from './step-node';

/** Resolve step status from execution data */
function resolveStatus(
  stepId: string,
  executions?: Record<string, import('./types').StepExecution>,
): StepStatus {
  if (!executions) return 'idle';
  const exec = executions[stepId];
  if (!exec) return 'idle';
  return exec.status;
}

/**
 * FlowTimeline — Vertical sidebar showing all steps in execution order.
 *
 * @example
 * ```tsx
 * <FlowTimeline
 *   flow={flowDefinition}
 *   selectedStepId={selectedId}
 *   onSelectStep={setSelectedId}
 *   executions={executionData}
 * />
 * ```
 */
export function FlowTimeline({
  flow,
  selectedStepId,
  onSelectStep,
  executions,
  className,
}: FlowTimelineProps) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`}>
      <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider px-3 py-2">
        Steps ({flow.steps.length})
      </h3>
      <div className="flex flex-col gap-1 px-1">
        {flow.steps.map((step, index) => (
          <StepNode
            key={step.id}
            step={step}
            status={resolveStatus(step.id, executions)}
            isSelected={selectedStepId === step.id}
            onClick={() => onSelectStep(step.id)}
            index={index}
            isLast={index === flow.steps.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
