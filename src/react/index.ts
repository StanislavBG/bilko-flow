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
export { CanvasBuilder } from './canvas-builder';
export type { ParsedIntent, CanvasBuilderProps } from './canvas-builder';
export { ComponentCatalog } from './component-catalog';
export type { ComponentCatalogProps } from './component-catalog';

// Mutation engine (pure functions, no React dependency)
export {
  applyMutation,
  createBlankStep,
  generateStepId,
} from './mutations';
export type {
  FlowMutation,
  MutationResult,
  MutationValidationError,
} from './mutations';

// Component definitions (data, no React dependency)
export {
  DEFAULT_COMPONENT_DEFINITIONS,
  getComponentByType,
} from './component-definitions';
export type {
  ComponentDefinition,
  ComponentFieldSpec,
  ComponentUseCase,
  ComponentReference,
} from './component-definitions';

// Layout engine (pure function, no React dependency)
export { computeLayout, NODE_W, NODE_H, COL_GAP, ROW_GAP, PADDING } from './layout';
export type { NodeLayout, EdgeLayout, DAGLayout } from './layout';

// Step type configuration
export { STEP_TYPE_CONFIG, LLM_SUBTYPE_CONFIG, getStepVisuals } from './step-type-config';
export type { StepTypeVisuals } from './step-type-config';

// Execution hooks
export { useExecutionStore } from './use-execution-store';
export type { UseExecutionStoreReturn } from './use-execution-store';
export { useFlowExecution } from './use-flow-execution';
export type {
  UseFlowExecutionOptions,
  UseFlowExecutionReturn,
} from './use-flow-execution';

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
  FlowProgressStep,
  FlowProgressProps,
  FlowCanvasProps,
  StepDetailProps,
  StepNodeProps,
  FlowTimelineProps,
  FlowCardProps,
} from './types';
