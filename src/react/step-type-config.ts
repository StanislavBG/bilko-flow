/**
 * Visual configuration per step type.
 *
 * Maps UI step types (and LLM subtypes) to icons, colors, and labels
 * for consistent rendering across all React components.
 *
 * Icons are referenced by name from lucide-react. Components import
 * and resolve them at render time.
 */

import type { UIStepType, FlowStep } from './types';

/** Visual properties for a step type */
export interface StepTypeVisuals {
  /** lucide-react icon component name */
  icon: string;
  /** Full display label */
  label: string;
  /** Short label for tight spaces */
  shortLabel: string;
  /** Primary text/icon color (Tailwind class) */
  color: string;
  /** Background color (Tailwind class) */
  bg: string;
  /** Accent color for borders/highlights (Tailwind class) */
  accent: string;
  /** Border color (Tailwind class) */
  border: string;
  /** Category label for grouping */
  categoryLabel: string;
}

/** Visual config for each UI step type */
export const STEP_TYPE_CONFIG: Record<UIStepType, StepTypeVisuals> = {
  llm: {
    icon: 'Brain',
    label: 'AI Processing',
    shortLabel: 'AI',
    color: 'text-purple-400',
    bg: 'bg-purple-500/20',
    accent: 'bg-purple-500',
    border: 'border-purple-500/30',
    categoryLabel: 'AI',
  },
  'user-input': {
    icon: 'MousePointerClick',
    label: 'User Input',
    shortLabel: 'Input',
    color: 'text-blue-400',
    bg: 'bg-blue-500/20',
    accent: 'bg-blue-500',
    border: 'border-blue-500/30',
    categoryLabel: 'Input',
  },
  transform: {
    icon: 'ArrowRightLeft',
    label: 'Transform',
    shortLabel: 'Transform',
    color: 'text-orange-400',
    bg: 'bg-orange-500/20',
    accent: 'bg-orange-500',
    border: 'border-orange-500/30',
    categoryLabel: 'Transform',
  },
  validate: {
    icon: 'ShieldCheck',
    label: 'Validation',
    shortLabel: 'Validate',
    color: 'text-green-400',
    bg: 'bg-green-500/20',
    accent: 'bg-green-500',
    border: 'border-green-500/30',
    categoryLabel: 'Validation',
  },
  display: {
    icon: 'Monitor',
    label: 'Display',
    shortLabel: 'Display',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/20',
    accent: 'bg-cyan-500',
    border: 'border-cyan-500/30',
    categoryLabel: 'Output',
  },
  chat: {
    icon: 'MessageSquare',
    label: 'Chat',
    shortLabel: 'Chat',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/20',
    accent: 'bg-emerald-500',
    border: 'border-emerald-500/30',
    categoryLabel: 'Communication',
  },
  'external-input': {
    icon: 'PlugZap',
    label: 'External Input',
    shortLabel: 'External',
    color: 'text-amber-400',
    bg: 'bg-amber-500/20',
    accent: 'bg-amber-500',
    border: 'border-amber-500/30',
    categoryLabel: 'External',
  },
};

/** Visual overrides for LLM subtypes */
export const LLM_SUBTYPE_CONFIG: Record<string, StepTypeVisuals> = {
  image: {
    icon: 'ImageIcon',
    label: 'Image Generation',
    shortLabel: 'Image',
    color: 'text-pink-400',
    bg: 'bg-pink-500/20',
    accent: 'bg-pink-500',
    border: 'border-pink-500/30',
    categoryLabel: 'AI',
  },
  video: {
    icon: 'Film',
    label: 'Video Generation',
    shortLabel: 'Video',
    color: 'text-rose-400',
    bg: 'bg-rose-500/20',
    accent: 'bg-rose-500',
    border: 'border-rose-500/30',
    categoryLabel: 'AI',
  },
};

/**
 * Get visual properties for a step, considering its type and subtype.
 *
 * For LLM steps with a known subtype (image, video), returns the
 * subtype-specific visuals. Otherwise returns the base type config.
 */
export function getStepVisuals(step: FlowStep): StepTypeVisuals {
  if (step.type === 'llm' && step.subtype && step.subtype in LLM_SUBTYPE_CONFIG) {
    return LLM_SUBTYPE_CONFIG[step.subtype];
  }
  return STEP_TYPE_CONFIG[step.type] ?? STEP_TYPE_CONFIG.llm;
}
