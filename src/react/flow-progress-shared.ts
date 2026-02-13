/**
 * Shared utilities for FlowProgress horizontal and vertical modes.
 *
 * Both flow-progress.tsx (horizontal modes) and flow-progress-vertical.tsx
 * (vertical mode) import from this module to avoid logic duplication.
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
} from 'lucide-react';
import type { FlowProgressProps, FlowProgressStep, FlowProgressTheme } from './types';

/** Default sliding window radius */
export const DEFAULT_RADIUS = 2;

/** Default breakpoint (px) for auto mode: below → compact, at/above → expanded */
export const DEFAULT_AUTO_BREAKPOINT = 480;

/** Threshold: sliding window activates when steps > 2*radius+3 */
export function needsWindow(count: number, radius: number): boolean {
  return count > 2 * radius + 3;
}

/** Get the resolved background color for a step, considering theme and type */
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
    default:
      return theme.pendingColor;
  }
}

/** Get the text color for a step label from theme */
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
