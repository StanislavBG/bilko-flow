/**
 * Visual configuration per step type.
 *
 * Maps UI step types (and LLM subtypes) to icons, colors, and labels
 * for consistent rendering across all React components.
 *
 * Icons are referenced by name from lucide-react. Components import
 * and resolve them at render time.
 */

import type { UIStepType, FlowStep, FlowProgressTheme } from './types';

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
 * Map domain step types (e.g. 'http.search', 'ai.summarize') to
 * UI step types and their accent colors for theme defaults.
 */
export const DOMAIN_STEP_TYPE_MAP: Record<string, { uiType: UIStepType; accent: string }> = {
  'http.search': { uiType: 'external-input', accent: 'bg-amber-500' },
  'http.request': { uiType: 'external-input', accent: 'bg-amber-500' },
  'transform.filter': { uiType: 'transform', accent: 'bg-orange-500' },
  'transform.map': { uiType: 'transform', accent: 'bg-orange-500' },
  'transform.reduce': { uiType: 'transform', accent: 'bg-orange-500' },
  'ai.summarize': { uiType: 'llm', accent: 'bg-purple-500' },
  'ai.generate-text': { uiType: 'llm', accent: 'bg-purple-500' },
  'ai.generate-image': { uiType: 'llm', accent: 'bg-pink-500' },
  'ai.generate-video': { uiType: 'llm', accent: 'bg-rose-500' },
  'ai.generate-text-local': { uiType: 'llm', accent: 'bg-purple-400' },
  'ai.summarize-local': { uiType: 'llm', accent: 'bg-purple-400' },
  'ai.embed-local': { uiType: 'llm', accent: 'bg-violet-500' },
  'social.post': { uiType: 'chat', accent: 'bg-emerald-500' },
  'notification.send': { uiType: 'display', accent: 'bg-cyan-500' },
  'custom': { uiType: 'llm', accent: 'bg-gray-500' },
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

/**
 * Default FlowProgress theme pre-configured for bilko domain step types.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * v0.3.0: Added `skippedColor` and `skippedTextColor`.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Skipped steps use `bg-gray-500` (dimmer than completed green) and
 * `text-gray-400` (with strikethrough applied by the renderer) to
 * clearly communicate "this step existed but was intentionally bypassed."
 *
 * All other defaults remain unchanged for backwards compatibility.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const DEFAULT_FLOW_PROGRESS_THEME: FlowProgressTheme = {
  stepColors: {
    // UI step types
    llm: 'bg-purple-500',
    'user-input': 'bg-blue-500',
    transform: 'bg-orange-500',
    validate: 'bg-green-500',
    display: 'bg-cyan-500',
    chat: 'bg-emerald-500',
    'external-input': 'bg-amber-500',
    // Domain step types
    'http.search': 'bg-amber-500',
    'http.request': 'bg-amber-500',
    'transform.filter': 'bg-orange-500',
    'transform.map': 'bg-orange-500',
    'transform.reduce': 'bg-orange-500',
    'ai.summarize': 'bg-purple-500',
    'ai.generate-text': 'bg-purple-500',
    'ai.generate-image': 'bg-pink-500',
    'ai.generate-video': 'bg-rose-500',
    'ai.generate-text-local': 'bg-purple-400',
    'ai.summarize-local': 'bg-purple-400',
    'ai.embed-local': 'bg-violet-500',
    'social.post': 'bg-emerald-500',
    'notification.send': 'bg-cyan-500',
    custom: 'bg-gray-500',
  },
  activeColor: 'bg-green-500',
  completedColor: 'bg-green-500',
  errorColor: 'bg-red-500',
  pendingColor: 'bg-gray-700',
  skippedColor: 'bg-gray-500',
  activeTextColor: 'text-green-400',
  completedTextColor: 'text-gray-300',
  errorTextColor: 'text-red-400',
  pendingTextColor: 'text-gray-500',
  skippedTextColor: 'text-gray-400',
};

/**
 * Deep merge a partial theme override with the default theme.
 * Handles nested stepColors merging.
 */
export function mergeTheme(override?: Partial<FlowProgressTheme>): FlowProgressTheme {
  if (!override) return DEFAULT_FLOW_PROGRESS_THEME;

  return {
    ...DEFAULT_FLOW_PROGRESS_THEME,
    ...override,
    stepColors: {
      ...DEFAULT_FLOW_PROGRESS_THEME.stepColors,
      ...(override.stepColors ?? {}),
    },
  };
}
