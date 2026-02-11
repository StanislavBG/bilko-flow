/**
 * bilko-flow/react — Portable React components for flow visualization.
 *
 * Import from 'bilko-flow/react' to use these components.
 * All components are props-driven with no required React context.
 */

// Components
export { FlowProgress } from './flow-progress';
export { FlowCanvas } from './flow-canvas';
export { StepNode } from './step-node';
export { StepDetail } from './step-detail';
export { FlowTimeline } from './flow-timeline';
export { FlowCard } from './flow-card';

// Layout engine (pure function, no React dependency)
export { computeLayout, NODE_W, NODE_H, COL_GAP, ROW_GAP, PADDING } from './layout';
export type { NodeLayout, EdgeLayout, DAGLayout } from './layout';

// Step type configuration
export { STEP_TYPE_CONFIG, LLM_SUBTYPE_CONFIG, getStepVisuals } from './step-type-config';
export type { StepTypeVisuals } from './step-type-config';

// Types
export type {
  UIStepType,
  StepStatus,
  SchemaField,
  FlowStep,
  FlowPhase,
  FlowOutput,
  FlowDefinition,
  StepExecution,
  FlowProgressPhase,
  FlowProgressProps,
  FlowCanvasProps,
  StepDetailProps,
  StepNodeProps,
  FlowTimelineProps,
  FlowCardProps,
} from './types';
