/**
 * FlowTimeline — Thin adapter wrapping FlowProgress mode="compact".
 *
 * Translates FlowDefinition + StepExecution data into FlowProgressStep[]
 * and delegates all rendering to FlowProgress, gaining sliding window
 * and adaptive labeling for free.
 */

import React, { useMemo } from 'react';
import type { FlowTimelineProps, FlowProgressStep, FlowProgressTheme } from './types';
import { FlowProgress } from './flow-progress';

/** Map StepExecution status to FlowProgressStep status */
function toProgressStatus(
  stepId: string,
  executions?: Record<string, import('./types').StepExecution>,
): FlowProgressStep['status'] {
  if (!executions) return 'pending';
  const exec = executions[stepId];
  if (!exec) return 'pending';
  switch (exec.status) {
    case 'success':
      return 'complete';
    case 'running':
      return 'active';
    case 'error':
      return 'error';
    default:
      return 'pending';
  }
}

/**
 * FlowTimeline — Sidebar that delegates to FlowProgress compact mode.
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
  theme,
}: FlowTimelineProps) {
  const progressSteps: FlowProgressStep[] = useMemo(
    () =>
      flow.steps.map(step => ({
        id: step.id,
        label: step.name,
        status: toProgressStatus(step.id, executions),
        type: step.type,
      })),
    [flow.steps, executions],
  );

  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`}>
      <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider px-3 py-2">
        Steps ({flow.steps.length})
      </h3>
      <div className="px-2">
        <FlowProgress
          mode="compact"
          steps={progressSteps}
          label={flow.name}
          onStepClick={onSelectStep}
          theme={theme}
        />
      </div>
    </div>
  );
}
